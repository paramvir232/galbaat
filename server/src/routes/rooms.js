import express from "express";
import { Message } from "../models/Message.js";
import { createRoom, findRoom, touchRoom } from "../services/roomService.js";
import { getRoomFile, listRoomFiles, publicFile, registerUploadedFile, removeUploadedFile, upload } from "../services/fileService.js";
import { cleanRoomName } from "../utils/sanitize.js";

export const roomsRouter = express.Router();

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
      messages: messages.reverse().map((message) => ({
        ...message,
        id: message._id?.toString(),
        reactions: Object.fromEntries(Object.entries(message.reactions || {}).map(([emoji, users]) => [emoji, users.length]))
      }))
    });
  } catch (error) {
    next(error);
  }
});

roomsRouter.get("/:roomId/files", ensureRoom, async (req, res, next) => {
  try {
    const files = await listRoomFiles(req.roomId);
    res.json({ files: files.map(publicFile) });
  } catch (error) {
    next(error);
  }
});

roomsRouter.post("/:roomId/files", ensureRoom, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const chatOnly = req.body.chatOnly === "true";
    const file = await registerUploadedFile(req.roomId, req.file, req.body.username, { chatOnly });
    const message = await Message.create({
      roomId: req.roomId,
      username: file.username,
      message: file.mimeType?.startsWith("audio/") ? "shared a voice note" : file.mimeType?.startsWith("image/") ? "shared an image" : `shared ${file.originalName}`,
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
      timestamp: message.timestamp
    };
    await touchRoom(req.roomId, req.room.activeUsers);
    if (!chatOnly) {
      req.app.get("io")?.to(req.roomId).emit("file:uploaded", file);
    }
    req.app.get("io")?.to(req.roomId).emit("chat:message", payload);
    res.status(201).json({ file });
  } catch (error) {
    await removeUploadedFile(req.roomId, req.file?.filename);
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
