import dotenv from "dotenv";

dotenv.config();

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://talkietiv.com",
  "https://www.talkietiv.com",
  "https://galbaat-sable.vercel.app"
];

function readList(value, fallback = []) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter(Boolean)
    .concat(fallback)
    .filter((entry, index, entries) => entries.indexOf(entry) === index);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  allowedOrigins: readList(process.env.ALLOWED_ORIGINS, defaultOrigins),
  mongoUri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/galbaat",
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
  maxRoomParticipants: Math.max(2, Math.min(15, Number(process.env.MAX_ROOM_PARTICIPANTS || 15))),
  emptyRoomGraceMs: Number(process.env.EMPTY_ROOM_GRACE_MS || 60 * 60 * 1000),
  supportEmailTo: process.env.SUPPORT_EMAIL_TO || "talkitiv01@gmail.com",
  supportEmailFrom: process.env.SUPPORT_EMAIL_FROM || "talkitiv01@gmail.com",
  supportSmtpHost: process.env.SUPPORT_SMTP_HOST || "smtp.gmail.com",
  supportSmtpPort: Number(process.env.SUPPORT_SMTP_PORT || 465),
  supportSmtpSecure: process.env.SUPPORT_SMTP_SECURE !== "false",
  supportSmtpUser: process.env.SUPPORT_SMTP_USER || "talkitiv01@gmail.com",
  supportSmtpPassword: String(process.env.SUPPORT_SMTP_PASSWORD || "").replace(/\s/g, ""),
  // HTTPS email APIs remain reachable from hosts that block outbound SMTP ports.
  supportResendApiKey: String(process.env.RESEND_API_KEY || "").trim()
};
