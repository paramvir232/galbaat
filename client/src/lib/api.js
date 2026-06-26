const FALLBACK_API_URL = "https://galbaat-backend.onrender.com";
const isLocalHost = typeof window !== "undefined" && ["localhost", "127.0.0.1"].includes(window.location.hostname);

export const API_URL = import.meta.env.VITE_API_URL || (isLocalHost ? "" : FALLBACK_API_URL);

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.message || "Request failed");
  return payload;
}

export function createRoom(roomName) {
  return request("/api/rooms", {
    method: "POST",
    body: JSON.stringify({ roomName })
  });
}

export function getRoom(roomId) {
  return request(`/api/rooms/${encodeURIComponent(roomId)}`);
}

export function getMessages(roomId) {
  return request(`/api/rooms/${encodeURIComponent(roomId)}/messages`);
}

export function getFiles(roomId) {
  return request(`/api/rooms/${encodeURIComponent(roomId)}/files`);
}

export async function uploadRoomFile(roomId, file, username, options = {}) {
  const body = new FormData();
  body.append("file", file);
  body.append("username", username);
  if (options.chatOnly) body.append("chatOnly", "true");

  const res = await fetch(`${API_URL}/api/rooms/${encodeURIComponent(roomId)}/files`, {
    method: "POST",
    body
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.message || "Upload failed");
  return payload;
}

export function apiAssetUrl(path) {
  if (!path) return "#";
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path}`;
}
