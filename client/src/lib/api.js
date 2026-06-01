export const API_URL = import.meta.env.VITE_API_URL || "";

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
