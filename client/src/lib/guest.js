const STORAGE_KEY = "galbaat:guest";
const CLIENT_ID_KEY = "galbaat:client-id";

export function getGuestName() {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const name = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem(STORAGE_KEY, name);
  return name;
}

export function setGuestName(name) {
  const clean = String(name || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);
  if (clean) localStorage.setItem(STORAGE_KEY, clean);
  return getGuestName();
}

export function getGuestClientId() {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;
  const id = `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}
