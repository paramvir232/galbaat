import express from "express";
import { Message } from "../models/Message.js";
import { createRoom, findRoom, touchRoom } from "../services/roomService.js";
import { getRoomFile, registerUploadedFile, removeUploadedFile, upload } from "../services/fileService.js";
import { cleanRoomName, cleanText } from "../utils/sanitize.js";

export const roomsRouter = express.Router();

function reactionCounts(reactions = {}) {
  const entries = reactions instanceof Map ? [...reactions.entries()] : Object.entries(reactions);
  return Object.fromEntries(entries.map(([emoji, users]) => [emoji, Array.isArray(users) ? users.length : Number(users) || 0]));
}

function publicMessage(message) {
  const deleted = Boolean(message.deletedAt);
  return {
    ...message,
    id: message._id?.toString(),
    message: deleted ? "" : message.message,
    attachments: deleted ? [] : message.attachments || [],
    reactions: deleted ? {} : reactionCounts(message.reactions),
    editedAt: message.editedAt || null,
    deletedAt: message.deletedAt || null
  };
}

async function ensureRoom(req, res, next) {
  try {
    const room = await findRoom(req.params.roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });
    req.room = room;
    req.roomId = room.roomId;
    next();
  } catch (error) {
    next(error);
  }
}

roomsRouter.post("/", async (req, res, next) => {
  try {
    const room = await createRoom(cleanRoomName(req.body.roomName));
    res.status(201).json({ room });
  } catch (error) {
    next(error);
  }
});

roomsRouter.get("/:roomId", async (req, res, next) => {
  try {
    const room = await findRoom(req.params.roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.json({ room });
  } catch (error) {
    next(error);
  }
});

roomsRouter.get("/:roomId/messages", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 80), 150);
    const roomId = String(req.params.roomId || "").toUpperCase();
    const messages = await Message.find({ roomId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json({
      messages: messages.reverse().map(publicMessage)
    });
  } catch (error) {
    next(error);
  }
});

roomsRouter.post("/:roomId/files", ensureRoom, upload.single("file"), async (req, res, next) => {
  let file;
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    file = await registerUploadedFile(req.roomId, req.file, req.body.username, { chatOnly: true });
    await touchRoom(req.roomId, req.room.activeUsers);
    const cleanMessage = cleanText(req.body.message || "", 1000);

    const message = await Message.create({
      roomId: req.roomId,
      username: file.username,
      message: cleanMessage,
      attachments: [file],
      timestamp: new Date()
    });
    const payload = {
      id: message._id.toString(),
      roomId: req.roomId,
      username: message.username,
      message: message.message,
      attachments: message.attachments,
      reactions: {},
      clientUploadId: cleanText(req.body.clientUploadId || "", 80),
      editedAt: message.editedAt || null,
      deletedAt: message.deletedAt || null,
      timestamp: message.timestamp
    };
    req.app.get("io")?.to(req.roomId).emit("chat:message", payload);

    res.status(201).json({ file, message: payload });
  } catch (error) {
    await removeUploadedFile(req.roomId, file?.id);
    next(error);
  }
});

roomsRouter.get("/:roomId/files/:fileId/download", ensureRoom, async (req, res, next) => {
  try {
    const file = await getRoomFile(req.roomId, req.params.fileId);
    if (!file) return res.status(404).json({ message: "File not found" });
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", file.size);
    res.attachment(file.originalName);
    file.stream.pipe(res);
  } catch (error) {
    next(error);
  }
});

roomsRouter.get("/:roomId/files/:fileId/preview", ensureRoom, async (req, res, next) => {
  try {
    const file = await getRoomFile(req.roomId, req.params.fileId);
    if (!file) return res.status(404).json({ message: "File not found" });
    const range = req.headers.range;

    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader("Accept-Ranges", "bytes");

    if (range) {
      const [startPart, endPart] = range.replace(/bytes=/, "").split("-");
      const start = Number(startPart);
      const end = endPart ? Number(endPart) : file.size - 1;

      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= file.size) {
        res.status(416).setHeader("Content-Range", `bytes */${file.size}`);
        res.end();
        return;
      }

      res.status(206);
      res.setHeader("Content-Length", end - start + 1);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${file.size}`);
      file.streamForRange(start, end).pipe(res);
      return;
    }

    res.setHeader("Content-Length", file.size);
    file.stream.pipe(res);
  } catch (error) {
    next(error);
  }
});
