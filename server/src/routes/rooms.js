import express from "express";
import { Message } from "../models/Message.js";
import { createRoom, findRoom } from "../services/roomService.js";
import { cleanRoomName } from "../utils/sanitize.js";

export const roomsRouter = express.Router();

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
