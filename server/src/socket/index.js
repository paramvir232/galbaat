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
    muted: user.muted,
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
          speaking: false,
          muted: false,
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

        const payload = {
          id: saved._id.toString(),
          roomId: normalizedRoomId,
          username: saved.username,
          message: saved.message,
          attachments: saved.attachments || [],
          reactions: {},
          timestamp: saved.timestamp
        };

        io.to(normalizedRoomId).emit("chat:message", payload);
        ack?.({ ok: true, message: payload });
        await touchRoom(normalizedRoomId, userMap.size);
      } catch (error) {
        ack?.({ ok: false, error: "Message failed" });
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
      if (!user?.host) return;
      user.muted = Boolean(muted);
      emitParticipants(io, normalizedRoomId);
      touchRoom(normalizedRoomId, rooms.get(normalizedRoomId).size).catch(() => {});
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
      user.screenSharing = Boolean(sharing);
      user.video = Boolean(sharing) || user.video;
      emitParticipants(io, normalizedRoomId);
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
      target.muted = Boolean(muted);
      io.to(targetId).emit("host:muted", { muted: target.muted });
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
