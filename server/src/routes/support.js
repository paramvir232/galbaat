import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { cleanText } from "../utils/sanitize.js";

const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
const screenshotTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const screenshotExtensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export const supportRouter = express.Router();

const supportRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many reports were sent. Please try again later." }
});

const screenshotUpload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 1, fileSize: MAX_SCREENSHOT_SIZE },
  fileFilter(_req, file, callback) {
    if (screenshotTypes.has(file.mimetype)) return callback(null, true);
    const error = new Error("Screenshot must be a PNG, JPEG, or WebP image.");
    error.status = 400;
    return callback(error);
  }
});

function supportMailer({ port = env.supportSmtpPort, secure = env.supportSmtpSecure } = {}) {
  return nodemailer.createTransport({
    host: env.supportSmtpHost,
    port,
    secure,
    requireTLS: !secure,
    auth: {
      user: env.supportSmtpUser,
      pass: env.supportSmtpPassword
    },
    tls: { minVersion: "TLSv1.2", servername: env.supportSmtpHost },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000
  });
}

function isRetryableTransportError(error) {
  return ["ECONNECTION", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ESOCKET", "ETIMEDOUT", "EHOSTUNREACH"].includes(error?.code);
}

async function deliverSupportEmail(message) {
  const attempts = [{ port: env.supportSmtpPort, secure: env.supportSmtpSecure }];
  // Gmail supports both implicit TLS (465) and STARTTLS (587). Hosted networks
  // occasionally reject 465, so retry the equivalent secure Gmail transport once.
  if (env.supportSmtpHost === "smtp.gmail.com" && (env.supportSmtpPort !== 587 || env.supportSmtpSecure)) {
    attempts.push({ port: 587, secure: false });
  }

  let lastError;
  for (const attempt of attempts) {
    try {
      return await supportMailer(attempt).sendMail(message);
    } catch (error) {
      lastError = error;
      if (!isRetryableTransportError(error)) throw error;
    }
  }
  throw lastError;
}

supportRouter.post("/", supportRateLimit, screenshotUpload.single("screenshot"), async (req, res) => {
  try {
    const category = req.body?.category === "query" ? "query" : "bug";
    const message = cleanText(req.body?.message, 4_000);

    if (message.length < 10) {
      return res.status(400).json({ message: "Please provide at least 10 characters." });
    }

    if (!env.supportSmtpUser || !env.supportSmtpPassword) {
      return res.status(503).json({ message: "Support inbox is not configured yet." });
    }

    await deliverSupportEmail({
      from: `Talkietiv Support <${env.supportEmailFrom || env.supportSmtpUser}>`,
      to: env.supportEmailTo,
      subject: `[Talkietiv] Anonymous ${category === "bug" ? "bug report" : "query"}`,
      text: `Anonymous ${category === "bug" ? "bug report" : "query"}\n\n${message}\n\nSent: ${new Date().toISOString()}`,
      attachments: req.file
        ? [{ filename: `talkietiv-screenshot.${screenshotExtensions[req.file.mimetype]}`, content: req.file.buffer, contentType: req.file.mimetype }]
        : []
    });

    res.setHeader("Cache-Control", "no-store");
    return res.status(202).json({ ok: true });
  } catch (error) {
    console.error("Support email delivery failed", { code: error.code, responseCode: error.responseCode });
    if (error.code === "EAUTH" || error.responseCode === 535) {
      return res.status(502).json({ message: "Support email authentication failed. Please contact the site owner." });
    }
    if (isRetryableTransportError(error)) {
      return res.status(503).json({ message: "Support email service is temporarily unavailable. Please try again shortly." });
    }
    return res.status(502).json({ message: "Unable to send your message right now. Please try again shortly." });
  }
});
