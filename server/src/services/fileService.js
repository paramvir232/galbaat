import path from "node:path";
import { Readable } from "node:stream";
import multer from "multer";
import mongoose from "mongoose";
import { customAlphabet } from "nanoid";
import { cleanText, cleanUsername } from "../utils/sanitize.js";

const fileId = customAlphabet("abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 14);
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function safeOriginalName(name) {
  const base = path.basename(String(name || "file"));
  const cleaned = cleanText(base, 160).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  return cleaned || "file";
}

function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "room_uploads" });
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: MAX_FILE_SIZE
  }
});

export async function listRoomFiles(roomId) {
  const files = await bucket()
    .find({
      "metadata.roomId": String(roomId || "").toUpperCase(),
      "metadata.chatOnly": { $ne: true }
    })
    .sort({ uploadDate: -1 })
    .toArray();
  return files.map((file) => publicFile(file.metadata));
}

export async function registerUploadedFile(roomId, file, username, options = {}) {
  const id = fileId();
  const originalName = safeOriginalName(file.originalname);
  const metadata = {
    id,
    roomId: String(roomId || "").toUpperCase(),
    originalName,
    mimeType: cleanText(file.mimetype || "application/octet-stream", 120),
    size: file.size,
    username: cleanUsername(username),
    chatOnly: Boolean(options.chatOnly),
    uploadedAt: new Date().toISOString()
  };

  await new Promise((resolve, reject) => {
    const stream = bucket().openUploadStream(originalName, {
      contentType: metadata.mimeType,
      metadata
    });
    Readable.from(file.buffer).pipe(stream).on("error", reject).on("finish", resolve);
  });

  return publicFile(metadata);
}

export async function getRoomFile(roomId, id) {
  const file = await bucket()
    .find({
      "metadata.roomId": String(roomId || "").toUpperCase(),
      "metadata.id": id
    })
    .next();
  if (!file?.metadata) return null;

  return {
    ...file.metadata,
    size: file.length,
    stream: bucket().openDownloadStream(file._id),
    streamForRange: (start, end) => bucket().openDownloadStream(file._id, { start, end: end + 1 })
  };
}

export async function deleteRoomUploads(roomId) {
  const files = await bucket()
    .find({ "metadata.roomId": String(roomId || "").toUpperCase() })
    .toArray();
  await Promise.all(files.map((file) => bucket().delete(file._id)));
}

export async function removeUploadedFile(roomId, id) {
  if (!id) return;
  const file = await bucket()
    .find({
      "metadata.roomId": String(roomId || "").toUpperCase(),
      "metadata.id": id
    })
    .next();
  if (file?._id) await bucket().delete(file._id);
}

export function publicFile(file) {
  return {
    id: file.id,
    roomId: file.roomId,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    username: file.username,
    uploadedAt: file.uploadedAt,
    previewUrl: `/api/rooms/${encodeURIComponent(file.roomId)}/files/${encodeURIComponent(file.id)}/preview`,
    downloadUrl: `/api/rooms/${encodeURIComponent(file.roomId)}/files/${encodeURIComponent(file.id)}/download`
  };
}
