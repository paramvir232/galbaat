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
    }
  });
}

supportRouter.post("/", supportRateLimit, screenshotUpload.single("screenshot"), async (req, res, next) => {
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
      from: env.supportEmailFrom || env.supportSmtpUser,
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
    return next(error);
  }
});
