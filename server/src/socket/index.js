import { Board } from "../models/Board.js";
import { Message } from "../models/Message.js";
import { Room } from "../models/Room.js";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { deleteRoom, findRoom, touchRoom } from "../services/roomService.js";
import { cleanText, cleanUsername } from "../utils/sanitize.js";

const rooms = new Map();
const emptyRoomTimers = new Map();
const boardUsers = new Map();
const boardStates = new Map();
const boardSaveTimers = new Map();
const boardEditPermissions = new Map();
const joinRequests = new Map();
const approvedJoinSockets = new Map();

function roomUsers(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function roomJoinRequests(roomId) {
  if (!joinRequests.has(roomId)) joinRequests.set(roomId, new Map());
  return joinRequests.get(roomId);
}

function publicJoinRequest(request) {
  return {
    id: request.id,
    username: request.username,
    requestedAt: request.requestedAt
  };
}

function emitJoinRequests(io, roomId) {
  const requests = [...roomJoinRequests(roomId).values()].map(publicJoinRequest);
  const hosts = [...roomUsers(roomId).values()].filter((user) => user.host);
  hosts.forEach((host) => io.to(host.id).emit("room:join-requests", requests));
  return requests;
}

function publicUser(user) {
  return {
    id: user.id,
    clientId: user.clientId,
    username: user.username,
    cursorColor: user.cursorColor,
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

function boardParticipants(roomId) {
  const users = rooms.get(roomId);
  const ids = boardUsers.get(roomId) || new Set();
  const editors = boardEditPermissions.get(roomId) || new Set();
  return [...ids]
    .map((id) => users?.get(id))
    .filter(Boolean)
    .map((user) => ({
      ...publicUser(user),
      canEditBoard: Boolean(user.host || editors.has(user.id))
    }));
}

function emitBoardUsers(io, roomId) {
  io.to(roomId).emit("whiteboard:users", boardParticipants(roomId));
}

function ensureRoomHost(roomId) {
  const users = rooms.get(roomId);
  if (!users?.size || [...users.values()].some((user) => user.host)) return null;
  const nextHost = [...users.values()].sort((first, second) => new Date(first.joinedAt).getTime() - new Date(second.joinedAt).getTime())[0];
  if (nextHost) nextHost.host = true;
  return nextHost || null;
}

function roomBoardState(roomId) {
  if (!boardStates.has(roomId)) {
    boardStates.set(roomId, {
      elements: new Map(),
      background: "#0f172a",
      version: 0,
      loaded: false
    });
  }
  return boardStates.get(roomId);
}

async function loadBoardState(roomId) {
  const state = roomBoardState(roomId);
  if (state.loaded) return state;

  const board = await Board.findOneAndUpdate(
    { roomId },
    { $setOnInsert: { roomId, elements: [], background: "#0f172a", version: 0 } },
    { new: true, upsert: true }
  ).lean();

  state.elements = new Map((board.elements || []).map((element) => [element.id, element]));
  state.background = board.background || "#0f172a";
  state.version = board.version || 0;
  state.loaded = true;
  return state;
}

function publicBoardState(roomId, extra = {}) {
  const state = roomBoardState(roomId);
  return {
    roomId,
    elements: [...state.elements.values()],
    background: state.background,
    version: state.version,
    ...extra
  };
}

function scheduleBoardSave(roomId) {
  clearTimeout(boardSaveTimers.get(roomId));
  const timer = setTimeout(async () => {
    const state = roomBoardState(roomId);
    try {
      await Board.findOneAndUpdate(
        { roomId },
        {
          $set: {
            elements: [...state.elements.values()].slice(-1600),
            background: state.background,
            version: state.version
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.error(`Whiteboard save failed for ${roomId}`, error);
    } finally {
      boardSaveTimers.delete(roomId);
    }
  }, 500);
  boardSaveTimers.set(roomId, timer);
}

function canEditBoard(roomId, user) {
  if (!user) return false;
  if (user.host) return true;
  return Boolean(boardEditPermissions.get(roomId)?.has(user.id));
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
  const allowedTypes = new Set(["pen", "highlighter", "line", "arrow", "rectangle", "diamond", "circle", "text", "image"]);
  if (!allowedTypes.has(type)) return null;

  const points = Array.isArray(element.points)
    ? element.points
        .slice(0, 20000)
        .map((point) => [Number(point?.[0]) || 0, Number(point?.[1]) || 0])
    : undefined;
  const imageSrc =
    type === "image" && /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(String(element.src || "")) && String(element.src).length <= 2_500_000
      ? element.src
      : "";
  if (type === "image" && !imageSrc) return null;

  return {
    id: cleanText(element.id, 80) || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    x: Number(element.x) || 0,
    y: Number(element.y) || 0,
    width: Number(element.width) || 0,
    height: Number(element.height) || 0,
    rotation: Number(element.rotation) || 0,
    revision: Math.max(0, Math.min(1_000_000_000, Number(element.revision) || 0)),
    text: cleanText(element.text, 400),
    src: imageSrc,
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
      clearTimeout(boardSaveTimers.get(roomId));
      boardSaveTimers.delete(roomId);
      boardStates.delete(roomId);
      boardUsers.delete(roomId);
      boardEditPermissions.delete(roomId);
      await deleteRoom(roomId);
    } catch (error) {
      console.error(`Empty room cleanup failed for ${roomId}`, error);
    }
  }, env.emptyRoomGraceMs);

  emptyRoomTimers.set(roomId, timer);
}

async function leaveCurrentRoom(io, socket) {
  const currentRoomId = socket.data.roomId;
  if (!currentRoomId || !rooms.has(currentRoomId)) {
    const pendingRoomId = socket.data.pendingRoomId;
    if (pendingRoomId) {
      roomJoinRequests(pendingRoomId).delete(socket.id);
      emitJoinRequests(io, pendingRoomId);
    }
    return;
  }

  const users = rooms.get(currentRoomId);
  const user = users.get(socket.id);
  if (!user) {
    socket.data.roomId = null;
    socket.leave(currentRoomId);
    return;
  }
  users.delete(socket.id);
  const nextHost = ensureRoomHost(currentRoomId);
  boardUsers.get(currentRoomId)?.delete(socket.id);
  emitBoardUsers(io, currentRoomId);
  if (nextHost) emitJoinRequests(io, currentRoomId);
  socket.leave(currentRoomId);

  socket.to(currentRoomId).emit("participant:left", {
    id: socket.id,
    username: user?.username
  });
  socket.to(currentRoomId).emit("webrtc:peer-left", { id: socket.id });
  const count = emitParticipants(io, currentRoomId).length;
  if (count === 0) {
    boardUsers.delete(currentRoomId);
    boardEditPermissions.delete(currentRoomId);
    await scheduleEmptyRoomCleanup(currentRoomId);
    return;
  }
  cancelEmptyRoomCleanup(currentRoomId);
  await touchRoom(currentRoomId, count);
}

function removeDuplicateClientFromRoom(io, roomId, clientId, nextSocketId) {
  if (!clientId) return null;
  const users = rooms.get(roomId);
  if (!users) return null;
  const duplicate = [...users.values()].find((user) => user.id !== nextSocketId && user.clientId === clientId);
  if (!duplicate) return null;

  users.delete(duplicate.id);
  boardUsers.get(roomId)?.delete(duplicate.id);
  const oldSocket = io.sockets.sockets.get(duplicate.id);
  if (oldSocket) {
    oldSocket.data.roomId = null;
    oldSocket.leave(roomId);
  }
  io.to(roomId).emit("webrtc:peer-left", { id: duplicate.id });
  return duplicate;
}

function canSignalPeer(socket, targetId) {
  const roomId = socket.data.roomId;
  if (!roomId) return false;
  const users = rooms.get(roomId);
  return Boolean(users?.has(socket.id) && users.has(targetId));
}

export function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    socket.on("room:join", async ({ roomId, username, clientId }, ack) => {
      try {
        const normalizedRoomId = String(roomId || "").toUpperCase();
        const room = await findRoom(normalizedRoomId);
        if (!room) {
          ack?.({ ok: false, error: "Room not found" });
          return;
        }

        const usernameClean = cleanUsername(username);
        const clientIdClean = cleanText(clientId, 80);
        const users = roomUsers(normalizedRoomId);
        const isOriginalHostRejoin = Boolean(room.originalHostUsername && room.originalHostUsername === usernameClean);
        if (room.locked && users.size > 0 && !users.has(socket.id)) {
          const approvedSockets = approvedJoinSockets.get(normalizedRoomId);
          if (!isOriginalHostRejoin && !approvedSockets?.has(socket.id)) {
            const request = {
              id: socket.id,
              socketId: socket.id,
              username: usernameClean,
              requestedAt: new Date().toISOString()
            };
            roomJoinRequests(normalizedRoomId).set(socket.id, request);
            socket.data.pendingRoomId = normalizedRoomId;
            socket.data.pendingUsername = usernameClean;
            ack?.({ ok: false, pending: true, error: "Room is locked. Waiting for admin permission." });
            emitJoinRequests(io, normalizedRoomId);
            return;
          }
          approvedSockets.delete(socket.id);
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

        if (!room.originalHostUsername && users.size === 0) {
          room.originalHostUsername = usernameClean;
          await Room.updateOne({ roomId: normalizedRoomId }, { $set: { originalHostUsername: usernameClean } });
        }

        const isOriginalHost = Boolean(room.originalHostUsername && room.originalHostUsername === usernameClean);
        if (isOriginalHost) {
          users.forEach((participant) => {
            participant.host = false;
          });
        }

        const replacedUser = removeDuplicateClientFromRoom(io, normalizedRoomId, clientIdClean, socket.id);
        if (replacedUser?.host && !isOriginalHost) ensureRoomHost(normalizedRoomId);

        const user = {
          id: socket.id,
          clientId: clientIdClean,
          username: usernameClean,
          host: users.size === 0 || isOriginalHost,
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
        socket.data.pendingRoomId = null;
        socket.data.pendingUsername = null;
        socket.join(normalizedRoomId);
        users.set(socket.id, user);
        roomJoinRequests(normalizedRoomId).delete(socket.id);
        emitJoinRequests(io, normalizedRoomId);

        const existingPeers = [...users.values()]
          .filter((participant) => participant.id !== socket.id)
          .map(publicUser);

        ack?.({ ok: true, user: publicUser(user), room, peers: existingPeers });
        if (!replacedUser) socket.to(normalizedRoomId).emit("participant:joined", publicUser(user));
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

        if (!boardUsers.has(normalizedRoomId)) boardUsers.set(normalizedRoomId, new Set());
        boardUsers.get(normalizedRoomId).add(socket.id);
        await loadBoardState(normalizedRoomId);

        ack?.({
          ok: true,
          canEditBoard: canEditBoard(normalizedRoomId, user),
          board: publicBoardState(normalizedRoomId, { users: boardParticipants(normalizedRoomId) })
        });
        emitBoardUsers(io, normalizedRoomId);
      } catch (error) {
        ack?.({ ok: false, error: "Unable to load whiteboard" });
      }
    });

    socket.on("whiteboard:leave", ({ roomId }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      boardUsers.get(normalizedRoomId)?.delete(socket.id);
      emitBoardUsers(io, normalizedRoomId);
      socket.to(normalizedRoomId).emit("whiteboard:cursor:left", { id: socket.id });
      socket.to(normalizedRoomId).emit("whiteboard:selection", { id: socket.id, selectedIds: [] });
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
        if (!canEditBoard(normalizedRoomId, user)) {
          ack?.({ ok: false, error: "You only have view access to this whiteboard" });
          return;
        }

        await loadBoardState(normalizedRoomId);
        const cleanState = cleanBoardState(board);
        const state = roomBoardState(normalizedRoomId);
        state.background = cleanState.background;
        if (board?.clear || cleanState.elements.length === 0) {
          state.elements.clear();
        } else {
          cleanState.elements.forEach((element) => state.elements.set(element.id, element));
        }
        state.version += 1;
        const payload = publicBoardState(normalizedRoomId, { updatedBy: socket.id });

        io.to(normalizedRoomId).emit("whiteboard:update", payload);
        ack?.({ ok: true, board: payload });
        scheduleBoardSave(normalizedRoomId);
        touchRoom(normalizedRoomId, users.size).catch(() => {});
      } catch (error) {
        ack?.({ ok: false, error: "Whiteboard save failed" });
      }
    });

    socket.on("whiteboard:element", async ({ roomId, element, action }, ack) => {
      try {
        const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
        const users = rooms.get(normalizedRoomId);
        const user = users?.get(socket.id);
        if (!user) {
          ack?.({ ok: false, error: "Not in room" });
          return;
        }
        if (!canEditBoard(normalizedRoomId, user)) {
          ack?.({ ok: false, error: "You only have view access to this whiteboard" });
          return;
        }

        const cleanElement = cleanBoardElement(element);
        if (!cleanElement) {
          ack?.({ ok: false, error: "Invalid element" });
          return;
        }

        await loadBoardState(normalizedRoomId);
        const state = roomBoardState(normalizedRoomId);
        if (action === "delete") state.elements.delete(cleanElement.id);
        else state.elements.set(cleanElement.id, cleanElement);
        state.version += 1;

        const payload = {
          action: action === "delete" ? "delete" : "upsert",
          element: cleanElement,
          version: state.version,
          updatedBy: socket.id
        };

        io.to(normalizedRoomId).emit("whiteboard:element", payload);
        ack?.({ ok: true, ...payload });
        scheduleBoardSave(normalizedRoomId);
        touchRoom(normalizedRoomId, users.size).catch(() => {});
      } catch (error) {
        ack?.({ ok: false, error: "Whiteboard element sync failed" });
      }
    });

    socket.on("whiteboard:permission", ({ roomId, targetId, canEdit }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const users = rooms.get(normalizedRoomId);
      const user = users?.get(socket.id);
      const target = users?.get(String(targetId || ""));
      if (!user?.host || !target || target.host) return;

      if (!boardEditPermissions.has(normalizedRoomId)) boardEditPermissions.set(normalizedRoomId, new Set());
      const editors = boardEditPermissions.get(normalizedRoomId);
      if (canEdit) editors.add(target.id);
      else editors.delete(target.id);
      io.to(target.id).emit("whiteboard:permission", { canEditBoard: canEditBoard(normalizedRoomId, target) });
      emitBoardUsers(io, normalizedRoomId);
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
      if (!nextLocked) {
        const requests = roomJoinRequests(normalizedRoomId);
        requests.forEach((request) => io.to(request.socketId).emit("room:join-approved", { roomId: normalizedRoomId, unlocked: true }));
        requests.clear();
        emitJoinRequests(io, normalizedRoomId);
      }
      io.to(normalizedRoomId).emit("room:lock", { locked: nextLocked });
    });

    socket.on("room:join-allow", ({ roomId, requestId }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const host = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!host?.host) return;

      const requests = roomJoinRequests(normalizedRoomId);
      const request = requests.get(requestId);
      if (!request) return;

      if (!approvedJoinSockets.has(normalizedRoomId)) approvedJoinSockets.set(normalizedRoomId, new Set());
      approvedJoinSockets.get(normalizedRoomId).add(request.socketId);
      requests.delete(requestId);
      io.to(request.socketId).emit("room:join-approved", { roomId: normalizedRoomId });
      emitJoinRequests(io, normalizedRoomId);
    });

    socket.on("room:end", async ({ roomId }) => {
      const normalizedRoomId = String(roomId || socket.data.roomId || "").toUpperCase();
      const user = rooms.get(normalizedRoomId)?.get(socket.id);
      if (!user?.host) return;
      io.to(normalizedRoomId).emit("room:ended");
      await deleteRoom(normalizedRoomId);
      rooms.delete(normalizedRoomId);
      joinRequests.delete(normalizedRoomId);
      approvedJoinSockets.delete(normalizedRoomId);
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
      if (!canSignalPeer(socket, to)) return;
      io.to(to).emit("webrtc:offer", {
        from: socket.id,
        description
      });
    });

    socket.on("webrtc:answer", ({ to, description }) => {
      if (!canSignalPeer(socket, to)) return;
      io.to(to).emit("webrtc:answer", {
        from: socket.id,
        description
      });
    });

    socket.on("webrtc:ice-candidate", ({ to, candidate }) => {
      if (!canSignalPeer(socket, to)) return;
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
