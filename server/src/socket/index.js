import { Message } from "../models/Message.js";
import { findRoom, touchRoom } from "../services/roomService.js";
import { cleanText, cleanUsername } from "../utils/sanitize.js";

const rooms = new Map();

function roomUsers(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    speaking: user.speaking,
    muted: user.muted,
    joinedAt: user.joinedAt
  };
}

function emitParticipants(io, roomId) {
  const participants = [...roomUsers(roomId).values()].map(publicUser);
  io.to(roomId).emit("participants:update", participants);
  return participants;
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
  await touchRoom(currentRoomId, count);
  if (count === 0) rooms.delete(currentRoomId);
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
          speaking: false,
          muted: false,
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
          timestamp: saved.timestamp
        };

        io.to(normalizedRoomId).emit("chat:message", payload);
        ack?.({ ok: true, message: payload });
        await touchRoom(normalizedRoomId, userMap.size);
      } catch (error) {
        ack?.({ ok: false, error: "Message failed" });
      }
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
      user.muted = Boolean(muted);
      emitParticipants(io, normalizedRoomId);
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
