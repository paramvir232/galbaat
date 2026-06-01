import sanitizeHtml from "sanitize-html";

const emptyHtmlPolicy = {
  allowedTags: [],
  allowedAttributes: {}
};

export function cleanText(value, maxLength = 1000) {
  const raw = String(value || "").slice(0, maxLength);
  const stripped = sanitizeHtml(raw, emptyHtmlPolicy);
  return stripped.trim();
}

export function cleanRoomName(value) {
  const clean = cleanText(value, 64).replace(/[^a-zA-Z0-9 _-]/g, "");
  return clean || "Untitled Room";
}

export function cleanUsername(value) {
  const clean = cleanText(value, 32).replace(/[^a-zA-Z0-9_-]/g, "");
  return clean || `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
}
