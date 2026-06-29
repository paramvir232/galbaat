import { Board } from "../models/Board.js";
import { Message } from "../models/Message.js";
import { Room } from "../models/Room.js";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { deleteRoom, findRoom, touchRoom } from "../services/roomService.js";
import { cleanText, cleanUsername } from "../utils/sanitize.js";

const rooms = new Map();
const emptyRoomTimers = new Map();

function roomUsers(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    host: user.host,
    speaking: user.speaking,
    muted: Boolean(user.selfMuted || user.hostMuted),
    selfMuted: Boolean(user.selfMuted),
    hostMuted: Boolean(user.hostMuted),
    video: user.video,
    handRaised: user.handRaised,
    screenSharing: user.screenSharing,
    joinedAt: user.joinedAt
  };
}

function emitParticipants(io, roomId) {
  const participants = [...roomUsers(roomId).values()].map(publicUser);
  io.to(roomId).emit("participants:update", participants);
  return participants;
}

function reactionCounts(reactions = {}) {
  const entries = reactions instanceof Map ? [...reactions.entries()] : Object.entries(reactions);
  return Object.fromEntries(entries.map(([emoji, users]) => [emoji, Array.isArray(users) ? users.length : Number(users) || 0]));
}

function publicMessage(message) {
  const deleted = Boolean(message.deletedAt);
  return {
    id: message._id.toString(),
    roomId: message.roomId,
    username: message.username,
    message: deleted ? "" : message.message,
    attachments: deleted ? [] : message.attachments || [],
    reactions: deleted ? {} : reactionCounts(message.reactions),
    editedAt: message.editedAt || null,
    deletedAt: message.deletedAt || null,
    timestamp: message.timestamp
  };
}

function cleanBoardElement(element) {
  const type = cleanText(element?.type, 24);
  const allowedTypes = new Set(["pen", "highlighter", "line", "arrow", "rectangle", "diamond", "circle", "text"]);
  if (!allowedTypes.has(type)) return null;

  const points = Array.isArray(element.points)
    ? element.points
        .slice(0, 2000)
        .map((point) => [Number(point?.[0]) || 0, Number(point?.[1]) || 0])
    : undefined;

  return {
    id: cleanText(element.id, 80) || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    x: Number(element.x) || 0,
    y: Number(element.y) || 0,
    width: Number(element.width) || 0,
    height: Number(element.height) || 0,
    rotation: Number(element.rotation) || 0,
    text: cleanText(element.text, 400),
    points,
    stroke: /^#[0-9a-f]{6}$/i.test(String(element.stroke || "")) ? element.stroke : "#f8fafc",
    fill: element.fill === "transparent" || /^#[0-9a-f]{6}$/i.test(String(element.fill || "")) ? element.fill : "transparent",
    strokeWidth: Math.max(1, Math.min(40, Number(element.strokeWidth) || 4)),
    opacity: Math.max(0.05, Math.min(1, Number(element.opacity) || 1))
  };
}

function cleanBoardState(state = {}) {
  const elements = Array.isArray(state.elements) ? state.elements.map(cleanBoardElement).filter(Boolean).slice(-1200) : [];
  const background = /^#[0-9a-f]{6}$/i.test(String(state.background || "")) ? state.background : "#0f172a";
  return { elements, background };
}

function cancelEmptyRoomCleanup(roomId) {
  const timer = emptyRoomTimers.get(roomId);
  if (!timer) return;
  clearTimeout(timer);
  emptyRoomTimers.delete(roomId);
}

async function scheduleEmptyRoomCleanup(roomId) {
  cancelEmptyRoomCleanup(roomId);
  await touchRoom(roomId, 0);

  const timer = setTimeout(async () => {
    try {
      const users = rooms.get(roomId);
      if (users?.size > 0) return;

      rooms.delete(roomId);
      emptyRoomTimers.delete(roomId);
      await deleteRoom(roomId);
    } catch (error) {
      console.error(`Empty room cleanup failed for ${roomId}`, error);
    }
  }, env.emptyRoomGraceMs);

  emptyRoomTimers.set(roomId, timer);
}

async function leaveCurrentRoom(io, socket) {
  const currentRoomId = socket.data.roomId;
  if (!currentRoomId || !rooms.has(currentRoomId)) return;

  const users = rooms.get(currentRoomId);
  const user = users.get(socket.id);
  users.delete(socket.id);
  socket.leave(currentRoomId);

  socket.to(currentRoomId).emit("participant:left", {
    id: socket.id,
    username: user?.username
  });
  socket.to(currentRoomId).emit("webrtc:peer-left", { id: socket.id });
  const count = emitParticipants(io, currentRoomId).length;
  if (count === 0) {
    await scheduleEmptyRoomCleanup(currentRoomId);
    return;
  }
  cancelEmptyRoomCleanup(currentRoomId);
  await touchRoom(currentRoomId, count);
}

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("room:join", async ({ roomId, username }, ack) => {
      try {
        const normalizedRoomId = String(roomId || "").toUpperCase();
        const room = await findRoom(normalizedRoomId);
        if (!room) {
          ack?.({ ok: false, error: "Room not found" });
          return;
        }

        const users = roomUsers(normalizedRoomId);
        if (room.locked && users.size > 0 && !users.has(socket.id)) {
          ack?.({ ok: false, error: "Room is locked" });
          return;
        }
        cancelEmptyRoomCleanup(normalizedRoomId);
        const existingUser = users.get(socket.id);
        if (socket.data.roomId === normalizedRoomId && existingUser) {
          const existingPeers = [...users.values()]
            .filter((participant) => participant.id !== socket.id)
            .map(publicUser);
          ack?.({ ok: true, user: publicUser(existingUser), room, peers: existingPeers, alreadyJoined: true });
          emitParticipants(io, normalizedRoomId);
          return;
        }

        if (socket.data.roomId && socket.data.roomId !== normalizedRoomId) {
          await leaveCurrentRoom(io, socket);
        }

        const user = {
          id: socket.id,
          username: cleanUsername(username),
          host: users.size === 0,
          cursorColor: ["#29d3a7", "#8ab4ff", "#f59e0b", "#f472b6", "#a78bfa", "#22d3ee"][users.size % 6],
          speaking: false,
          selfMuted: false,
          hostMuted: false,
          video: false,
          handRaised: false,
          screenSharing: false,
          joinedAt: new Date().toISOString()
        };

        socket.data.roomId = normalizedRoomId;
        socket.data.username = user.username;
        socket.join(normalizedRoomId);
        users.set(socket.id, user);

        const existingPeers = [...users.values()]
          .filter((participant) => participant.id !== socket.id)
          .map(publicUser);

        ack?.({ ok: true, user: publicUser(user), room, peers: existingPeers });
        socket.to(normalizedRoomId).emit("participant:joined", publicUser(user));
        emitParticipants(io, normalizedRoomId);
        await touchRoom(normalizedRoomId, users.size);
      } catch (error) {
        ack?.({ ok: false, error: "Unable to join room" });
      }
    });

    socket.on("chat:message", async ({ roomId, message }, ack) => {
      try {
        const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
        const userMap = rooms.get(normalizedRoomId);
        if (!userMap?.has(socket.id)) return;

        const cleanMessage = cleanText(message, 1000);
        if (!cleanMessage) return;

        const saved = await Message.create({
          roomId: normalizedRoomId,
          username: socket.data.username,
          message: cleanMessage,
          timestamp: new Date()
        });

        const payload = publicMessage(saved);

        io.to(normalizedRoomId).emit("chat:message", payload);
        ack?.({ ok: true, message: payload });
        await touchRoom(normalizedRoomId, userMap.size);
      } catch (error) {
        ack?.({ ok: false, error: "Message failed" });
      }
    });

    socket.on("chat:edit", async ({ roomId, messageId, message }, ack) => {
      try {
        const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
        const userMap = rooms.get(normalizedRoomId);
        if (!userMap?.has(socket.id)) return;
        if (!mongoose.isValidObjectId(messageId)) return;

        const cleanMessage = cleanText(message, 1000);
        if (!cleanMessage) {
          ack?.({ ok: false, error: "Message cannot be empty" });
          return;
        }

        const saved = await Message.findOne({
          _id: messageId,
          roomId: normalizedRoomId,
          username: socket.data.username,
          deletedAt: null
        });
        if (!saved) {
          ack?.({ ok: false, error: "Message not found" });
          return;
        }

        saved.message = cleanMessage;
        saved.editedAt = new Date();
        await saved.save();

        const payload = publicMessage(saved);
        io.to(normalizedRoomId).emit("chat:update", payload);
        ack?.({ ok: true, message: payload });
        await touchRoom(normalizedRoomId, userMap.size);
      } catch (error) {
        ack?.({ ok: false, error: "Edit failed" });
      }
    });

    socket.on("chat:delete", async ({ roomId, messageId }, ack) => {
      try {
        const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
        const userMap = rooms.get(normalizedRoomId);
        if (!userMap?.has(socket.id)) return;
        if (!mongoose.isValidObjectId(messageId)) return;

        const saved = await Message.findOne({
          _id: messageId,
          roomId: normalizedRoomId,
          username: socket.data.username,
          deletedAt: null
        });
        if (!saved) {
          ack?.({ ok: false, error: "Message not found" });
          return;
        }

        saved.message = "";
        saved.attachments = [];
        saved.reactions = new Map();
        saved.deletedAt = new Date();
        await saved.save();

        const payload = publicMessage(saved);
        io.to(normalizedRoomId).emit("chat:update", payload);
        ack?.({ ok: true, message: payload });
        await touchRoom(normalizedRoomId, userMap.size);
      } catch (error) {
        ack?.({ ok: false, error: "Delete failed" });
      }
    });

    socket.on("chat:reaction", async ({ roomId, messageId, emoji }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const userMap = rooms.get(normalizedRoomId);
      if (!userMap?.has(socket.id)) return;
      if (!mongoose.isValidObjectId(messageId)) return;

      const cleanEmoji = cleanText(emoji, 8);
      if (!["👍", "😂", "❤️", "🔥", "✅"].includes(cleanEmoji)) return;

      const message = await Message.findOne({ _id: messageId, roomId: normalizedRoomId });
      if (!message) return;
      if (message.deletedAt) return;
      const username = socket.data.username;
      const currentForEmoji = new Set(message.reactions?.get(cleanEmoji) || []);
      const isRemovingCurrentReaction = currentForEmoji.has(username);

      for (const [reactionEmoji, users] of message.reactions.entries()) {
        const nextUsers = users.filter((user) => user !== username);
        if (nextUsers.length) message.reactions.set(reactionEmoji, nextUsers);
        else message.reactions.delete(reactionEmoji);
      }

      if (!isRemovingCurrentReaction) {
        message.reactions.set(cleanEmoji, [...(message.reactions.get(cleanEmoji) || []), username]);
      }
      await message.save();

      io.to(normalizedRoomId).emit("chat:reaction", {
        messageId: message._id.toString(),
        reactions: Object.fromEntries([...message.reactions.entries()].map(([key, users]) => [key, users.length]))
      });
    });

    socket.on("typing:start", ({ roomId }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      socket.to(normalizedRoomId).emit("typing:start", {
        id: socket.id,
        username: socket.data.username
      });
    });

    socket.on("typing:stop", ({ roomId }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      socket.to(normalizedRoomId).emit("typing:stop", { id: socket.id });
    });

    socket.on("ptt:speaking", ({ roomId, speaking }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user) return;
      user.speaking = Boolean(speaking);
      io.to(normalizedRoomId).emit("participant:speaking", {
        id: socket.id,
        speaking: user.speaking
      });
      emitParticipants(io, normalizedRoomId);
    });

    socket.on("participant:mute", ({ roomId, muted }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user) return;
      user.selfMuted = Boolean(muted);
      emitParticipants(io, normalizedRoomId);
      touchRoom(normalizedRoomId, rooms.get(normalizedRoomId).size).catch(() => {});
    });

    socket.on("participant:rename", ({ roomId, username }, ack) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const users = rooms.get(normalizedRoomId);
      const user = users?.get(socket.id);
      if (!user) {
        ack?.({ ok: false, error: "Not in room" });
        return;
      }

      const nextUsername = cleanUsername(username);
      user.username = nextUsername;
      socket.data.username = nextUsername;
      const updatedUser = publicUser(user);
      ack?.({ ok: true, user: updatedUser });
      emitParticipants(io, normalizedRoomId);
      touchRoom(normalizedRoomId, users.size).catch(() => {});
    });

    socket.on("participant:video", ({ roomId, video }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user) return;
      user.video = Boolean(video);
      emitParticipants(io, normalizedRoomId);
      touchRoom(normalizedRoomId, rooms.get(normalizedRoomId).size).catch(() => {});
    });

    socket.on("participant:hand", ({ roomId, raised }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user) return;
      user.handRaised = Boolean(raised);
      emitParticipants(io, normalizedRoomId);
    });

    socket.on("participant:screen", ({ roomId, sharing }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user) return;
      const nextSharing = Boolean(sharing);
      const wasSharing = Boolean(user.screenSharing);
      user.screenSharing = nextSharing;
      if (nextSharing) user.video = true;
      else if (wasSharing) user.video = false;
      emitParticipants(io, normalizedRoomId);
    });

    socket.on("whiteboard:join", async ({ roomId }, ack) => {
      try {
        const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
        const users = rooms.get(normalizedRoomId);
        const user = users?.get(socket.id);
        if (!user) {
          ack?.({ ok: false, error: "Not in room" });
          return;
        }

        const board = await Board.findOneAndUpdate(
          { roomId: normalizedRoomId },
          { $setOnInsert: { roomId: normalizedRoomId, elements: [], background: "#0f172a", version: 0 } },
          { new: true, upsert: true }
        ).lean();

        ack?.({
          ok: true,
          board: {
            roomId: normalizedRoomId,
            elements: board.elements || [],
            background: board.background || "#0f172a",
            version: board.version || 0
          }
        });
      } catch (error) {
        ack?.({ ok: false, error: "Unable to load whiteboard" });
      }
    });

    socket.on("whiteboard:update", async ({ roomId, board }, ack) => {
      try {
        const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
        const users = rooms.get(normalizedRoomId);
        const user = users?.get(socket.id);
        if (!user) {
          ack?.({ ok: false, error: "Not in room" });
          return;
        }

        const cleanState = cleanBoardState(board);
        const existing = await Board.findOne({ roomId: normalizedRoomId }).lean();
        const existingElements = existing?.elements || [];
        const nextElements =
          cleanState.elements.length >= existingElements.length
            ? [
                ...new Map(
                  [...existingElements, ...cleanState.elements].map((element) => [element.id, element])
                ).values()
              ].slice(-1200)
            : cleanState.elements;
        const saved = await Board.findOneAndUpdate(
          { roomId: normalizedRoomId },
          {
            $set: {
              elements: nextElements,
              background: cleanState.background
            },
            $inc: { version: 1 }
          },
          { new: true, upsert: true }
        ).lean();

        const payload = {
          roomId: normalizedRoomId,
          elements: saved.elements || [],
          background: saved.background || "#0f172a",
          version: saved.version || 0,
          updatedBy: socket.id
        };

        socket.to(normalizedRoomId).emit("whiteboard:update", payload);
        ack?.({ ok: true, board: payload });
        touchRoom(normalizedRoomId, users.size).catch(() => {});
      } catch (error) {
        ack?.({ ok: false, error: "Whiteboard save failed" });
      }
    });

    socket.on("whiteboard:cursor", ({ roomId, cursor }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user) return;
      socket.to(normalizedRoomId).emit("whiteboard:cursor", {
        id: socket.id,
        username: user.username,
        color: user.cursorColor,
        x: Number(cursor?.x) || 0,
        y: Number(cursor?.y) || 0
      });
    });

    socket.on("whiteboard:selection", ({ roomId, selectedIds }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user) return;
      socket.to(normalizedRoomId).emit("whiteboard:selection", {
        id: socket.id,
        username: user.username,
        color: user.cursorColor,
        selectedIds: Array.isArray(selectedIds) ? selectedIds.map((id) => cleanText(id, 80)).slice(0, 20) : []
      });
    });

    socket.on("room:notice", async ({ roomId, notice }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user?.host) return;
      const pinnedNotice = cleanText(notice, 240);
      await Room.updateOne({ roomId: normalizedRoomId }, { $set: { pinnedNotice } });
      io.to(normalizedRoomId).emit("room:notice", { pinnedNotice });
    });

    socket.on("room:lock", async ({ roomId, locked }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user?.host) return;
      const nextLocked = Boolean(locked);
      await Room.updateOne({ roomId: normalizedRoomId }, { $set: { locked: nextLocked } });
      io.to(normalizedRoomId).emit("room:lock", { locked: nextLocked });
    });

    socket.on("room:end", async ({ roomId }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user?.host) return;
      io.to(normalizedRoomId).emit("room:ended");
      await deleteRoom(normalizedRoomId);
      rooms.delete(normalizedRoomId);
    });

    socket.on("host:mute", ({ roomId, targetId, muted }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const users = rooms.get(normalizedRoomId);
      const host = users?.get(socket.id);
      const target = users?.get(targetId);
      if (!host?.host || !target) return;
      target.hostMuted = Boolean(muted);
      io.to(targetId).emit("host:muted", { muted: Boolean(target.selfMuted || target.hostMuted) });
      emitParticipants(io, normalizedRoomId);
    });

    socket.on("host:kick", ({ roomId, targetId }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const users = rooms.get(normalizedRoomId);
      const host = users?.get(socket.id);
      const target = users?.get(targetId);
      if (!host?.host || !target?.id || target.host) return;
      io.to(targetId).emit("host:kicked");
      io.sockets.sockets.get(targetId)?.disconnect(true);
    });

    socket.on("room:heartbeat", ({ roomId }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const userMap = rooms.get(normalizedRoomId);
      if (!userMap?.has(socket.id)) return;
      cancelEmptyRoomCleanup(normalizedRoomId);
      touchRoom(normalizedRoomId, userMap.size).catch(() => {});
    });

    socket.on("webrtc:offer", ({ to, description }) => {
      io.to(to).emit("webrtc:offer", {
        from: socket.id,
        description
      });
    });

    socket.on("webrtc:answer", ({ to, description }) => {
      io.to(to).emit("webrtc:answer", {
        from: socket.id,
        description
      });
    });

    socket.on("webrtc:ice-candidate", ({ to, candidate }) => {
      io.to(to).emit("webrtc:ice-candidate", {
        from: socket.id,
        candidate
      });
    });

    socket.on("disconnect", async () => {
      await leaveCurrentRoom(io, socket);
    });
  });
}
