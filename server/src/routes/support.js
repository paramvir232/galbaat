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
    family: 4,
    auth: {
      user: env.supportSmtpUser,
      pass: env.supportSmtpPassword
    },
    tls: { minVersion: "TLSv1.2", servername: env.supportSmtpHost },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000
  });
}

function isRetryableTransportError(error) {
  return ["ECONNECTION", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ESOCKET", "ETIMEDOUT", "EHOSTUNREACH"].includes(error?.code);
}

function publicTransportError(error) {
  const code = error?.code || "SMTP_UNKNOWN";
  if (code === "ETIMEDOUT") return "Support email connection timed out while contacting Gmail (SMTP_ETIMEDOUT).";
  if (code === "ENOTFOUND") return "Support email could not resolve the Gmail server (SMTP_ENOTFOUND).";
  if (code === "ECONNREFUSED") return "Gmail refused the support email connection (SMTP_ECONNREFUSED).";
  if (code === "ESOCKET") return "The secure Gmail connection could not be established (SMTP_ESOCKET).";
  return `Support email transport failed (${code}).`;
}

function waitForRetry() {
  return new Promise((resolve) => setTimeout(resolve, 750));
}

async function deliverSupportEmail(message) {
  const attempts = [{ port: env.supportSmtpPort, secure: env.supportSmtpSecure }];
  // Gmail supports both STARTTLS (587) and implicit TLS (465). Try both because
  // hosted networks occasionally have a transient route problem to one of them.
  if (env.supportSmtpHost === "smtp.gmail.com") {
    [{ port: 587, secure: false }, { port: 465, secure: true }].forEach((attempt) => {
      if (!attempts.some((configured) => configured.port === attempt.port && configured.secure === attempt.secure)) attempts.push(attempt);
    });
  }

  let lastError;
  for (const attempt of attempts) {
    try {
      return await supportMailer(attempt).sendMail(message);
    } catch (error) {
      lastError = error;
      if (!isRetryableTransportError(error)) throw error;
      if (attempt !== attempts.at(-1)) await waitForRetry();
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
    console.error("Support email delivery failed", {
      code: error.code,
      command: error.command,
      responseCode: error.responseCode,
      syscall: error.syscall,
      address: error.address,
      port: error.port,
      message: error.message
    });
    if (error.code === "EAUTH" || error.responseCode === 535) {
      return res.status(502).json({ message: "Support email authentication failed. Please contact the site owner." });
    }
    if (isRetryableTransportError(error)) {
      return res.status(503).json({ message: publicTransportError(error) });
    }
    return res.status(502).json({ message: "Unable to send your message right now. Please try again shortly." });
  }
});
