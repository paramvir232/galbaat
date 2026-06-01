import { customAlphabet } from "nanoid";
import { Room } from "../models/Room.js";
import { Message } from "../models/Message.js";
import { cleanRoomName } from "../utils/sanitize.js";

const roomId = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 7);
const INACTIVE_ROOM_MS = 1000 * 60 * 60 * 6;

export async function createRoom(roomName) {
  const id = roomId();
  return Room.create({
    roomId: id,
    roomName: cleanRoomName(roomName || `Room ${id}`),
    activeUsers: 0,
    lastActivity: new Date()
  });
}

export async function findRoom(id) {
  return Room.findOne({ roomId: String(id || "").toUpperCase() }).lean();
}

export async function touchRoom(id, activeUsers) {
  await Room.updateOne(
    { roomId: id },
    {
      $set: {
        lastActivity: new Date(),
        activeUsers: Math.max(0, activeUsers)
      }
    }
  );
}

export async function cleanupInactiveRooms() {
  const cutoff = new Date(Date.now() - INACTIVE_ROOM_MS);
  const staleRooms = await Room.find({
    activeUsers: 0,
    lastActivity: { $lt: cutoff }
  }).select("roomId");
  const ids = staleRooms.map((room) => room.roomId);

  if (!ids.length) return 0;

  await Message.deleteMany({ roomId: { $in: ids } });
  const result = await Room.deleteMany({ roomId: { $in: ids } });
  return result.deletedCount || 0;
}
