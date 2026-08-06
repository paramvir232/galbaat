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

function supportMailer() {
  return nodemailer.createTransport({
    host: env.supportSmtpHost,
    port: env.supportSmtpPort,
    secure: env.supportSmtpSecure,
    auth: {
      user: env.supportSmtpUser,
      pass: env.supportSmtpPassword
    },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 25_000
  });
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

    await supportMailer().sendMail({
      from: `Talkietiv Support <${env.supportSmtpUser}>`,
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
    if (["ECONNECTION", "ETIMEDOUT", "ESOCKET"].includes(error.code)) {
      return res.status(503).json({ message: "Support email service is temporarily unavailable. Please try again shortly." });
    }
    return res.status(502).json({ message: "Unable to send your message right now. Please try again shortly." });
  }
});
