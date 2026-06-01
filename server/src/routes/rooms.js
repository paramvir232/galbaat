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
    res.json({ messages: messages.reverse() });
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
    const file = await registerUploadedFile(req.roomId, req.file, req.body.username);
    await touchRoom(req.roomId, req.room.activeUsers);
    req.app.get("io")?.to(req.roomId).emit("file:uploaded", file);
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
    res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", file.size);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.originalName)}"`);
    file.stream.pipe(res);
  } catch (error) {
    next(error);
  }
});
