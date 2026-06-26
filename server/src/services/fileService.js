import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import multer from "multer";
import { customAlphabet } from "nanoid";
import { cleanText, cleanUsername } from "../utils/sanitize.js";

const fileId = customAlphabet("abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", 14);
const uploadRoot = path.resolve(process.cwd(), "uploads");
const metadataName = ".files.json";
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function roomUploadDir(roomId) {
  return path.join(uploadRoot, String(roomId || "").toUpperCase());
}

function metadataPath(roomId) {
  return path.join(roomUploadDir(roomId), metadataName);
}

function safeOriginalName(name) {
  const base = path.basename(String(name || "file"));
  const cleaned = cleanText(base, 160).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
  return cleaned || "file";
}

async function readMetadata(roomId) {
  try {
    const raw = await fs.readFile(metadataPath(roomId), "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeMetadata(roomId, files) {
  await fs.mkdir(roomUploadDir(roomId), { recursive: true });
  await fs.writeFile(metadataPath(roomId), JSON.stringify(files, null, 2), "utf8");
}

const storage = multer.diskStorage({
  destination: async (req, _file, cb) => {
    try {
      const roomId = String(req.params.roomId || "").toUpperCase();
      const dir = roomUploadDir(roomId);
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (_req, file, cb) => {
    const id = fileId();
    const ext = path.extname(safeOriginalName(file.originalname)).slice(0, 16);
    cb(null, `${id}${ext}`);
  }
});

export const upload = multer({
  storage,
  limits: {
    files: 1,
    fileSize: MAX_FILE_SIZE
  }
});

export async function listRoomFiles(roomId) {
  const files = await readMetadata(roomId);
  return files.filter((file) => !file.chatOnly);
}

export async function registerUploadedFile(roomId, file, username, options = {}) {
  const id = path.parse(file.filename).name;
  const metadata = {
    id,
    roomId,
    originalName: safeOriginalName(file.originalname),
    storedName: file.filename,
    mimeType: cleanText(file.mimetype || "application/octet-stream", 120),
    size: file.size,
    username: cleanUsername(username),
    chatOnly: Boolean(options.chatOnly),
    uploadedAt: new Date().toISOString()
  };
  const files = await readMetadata(roomId);
  files.push(metadata);
  await writeMetadata(roomId, files);
  return publicFile(metadata);
}

export async function getRoomFile(roomId, id) {
  const files = await readMetadata(roomId);
  const file = files.find((item) => item.id === id);
  if (!file) return null;

  const resolvedPath = path.resolve(roomUploadDir(roomId), file.storedName);
  if (!resolvedPath.startsWith(roomUploadDir(roomId))) return null;

  await fs.access(resolvedPath);
  return {
    ...file,
    path: resolvedPath,
    stream: createReadStream(resolvedPath)
  };
}

export async function deleteRoomUploads(roomId) {
  await fs.rm(roomUploadDir(roomId), { recursive: true, force: true });
}

export async function removeUploadedFile(roomId, storedName) {
  if (!storedName) return;
  await fs.rm(path.join(roomUploadDir(roomId), storedName), { force: true });
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
