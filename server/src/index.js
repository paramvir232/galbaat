import path from "node:path";
import { fileURLToPath } from "node:url";
import compression from "compression";
import cors from "cors";
import express from "express";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import http from "node:http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { env } from "./config/env.js";
import { connectDb } from "./config/db.js";
import { roomsRouter } from "./routes/rooms.js";
import { cleanupInactiveRooms } from "./services/roomService.js";
import { registerSocketHandlers } from "./socket/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    return env.allowedOrigins.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}

const corsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  maxAge: 86_400
};

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(compression());
app.use(cors(corsOptions));
app.use(express.json({ limit: "32kb" }));
app.use(mongoSanitize());
app.use(
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.get("/api/health", (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.setHeader("Cache-Control", "no-store");
  res.status(dbReady ? 200 : 503).json({ ok: dbReady, name: "Talkietiv", time: new Date().toISOString() });
});

app.use("/api/rooms", roomsRouter);

if (env.nodeEnv === "production") {
  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: "Something went wrong" });
});

const io = new Server(server, {
  cors: corsOptions,
  transports: ["websocket", "polling"],
  pingTimeout: 60_000,
  pingInterval: 25_000
});

app.set("io", io);
registerSocketHandlers(io);

await connectDb();

setInterval(async () => {
  try {
    const deleted = await cleanupInactiveRooms();
    if (deleted) console.log(`Cleaned up ${deleted} inactive rooms`);
  } catch (error) {
    console.error("Room cleanup failed", error);
  }
}, 1000 * 60 * 30);

server.listen(env.port, () => {
  console.log(`Talkietiv server listening on ${env.port}`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, closing Talkietiv server`);

  const forceExit = setTimeout(() => process.exit(1), 25_000);
  io.close(async () => {
    try {
      await mongoose.disconnect();
    } finally {
      clearTimeout(forceExit);
      process.exit(0);
    }
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
