import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import nodemailer from "nodemailer";
import { resolve4 } from "node:dns/promises";
import net from "node:net";
import tls from "node:tls";
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

function createGmailIpv4Socket({ port, secure }) {
  return (_options, callback) => {
    let finished = false;
    const finish = (error, socketOptions) => {
      if (finished) return;
      finished = true;
      callback(error, socketOptions);
    };

    resolve4(env.supportSmtpHost)
      .then((addresses) => {
        if (!addresses.length) {
          const error = new Error("No IPv4 address was found for the Gmail SMTP host.");
          error.code = "ENOTFOUND";
          finish(error);
          return;
        }

        let addressIndex = 0;
        const connectNextAddress = (lastError) => {
          const address = addresses[addressIndex++];
          if (!address) {
            finish(lastError);
            return;
          }

          const socket = secure
            ? tls.connect({ host: address, port, family: 4, servername: env.supportSmtpHost, minVersion: "TLSv1.2" })
            : net.connect({ host: address, port, family: 4 });
          const connectedEvent = secure ? "secureConnect" : "connect";

          const onError = (error) => {
            socket.removeListener(connectedEvent, onConnect);
            socket.destroy();
            connectNextAddress(error);
          };
          const onConnect = () => {
            socket.removeListener("error", onError);
            finish(null, { connection: socket, secured: secure });
          };

          socket.once("error", onError);
          socket.once(connectedEvent, onConnect);
        };

        connectNextAddress();
      })
      .catch((error) => finish(error));
  };
}

function supportMailer({ port = env.supportSmtpPort, secure = env.supportSmtpSecure } = {}) {
  return nodemailer.createTransport({
    host: env.supportSmtpHost,
    port,
    secure,
    requireTLS: !secure,
    ...(env.supportSmtpHost === "smtp.gmail.com" ? { getSocket: createGmailIpv4Socket({ port, secure }) } : {}),
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
  return ["ECONNECTION", "ECONNREFUSED", "ECONNRESET", "EDNS", "ENOTFOUND", "ESOCKET", "ETIMEDOUT", "ETLS", "EHOSTUNREACH"].includes(error?.code);
}

function publicTransportError(error) {
  const code = error?.code || "SMTP_UNKNOWN";
  if (code === "ETIMEDOUT") return "Support email connection timed out while contacting Gmail (SMTP_ETIMEDOUT).";
  if (code === "ENOTFOUND") return "Support email could not resolve the Gmail server (SMTP_ENOTFOUND).";
  if (code === "ECONNREFUSED") return "Gmail refused the support email connection (SMTP_ECONNREFUSED).";
  if (code === "ESOCKET") return "The secure Gmail connection could not be established (SMTP_ESOCKET).";
  if (code === "ETLS") return "The Gmail TLS upgrade could not be completed (SMTP_ETLS).";
  return `Support email transport failed (${code}).`;
}

function publicProviderError(error) {
  const message = cleanText(String(error?.message || ""), 300);
  return message
    ? `Support email delivery was rejected: ${message}`
    : "Support email delivery was rejected by the email provider.";
}

function waitForRetry() {
  return new Promise((resolve) => setTimeout(resolve, 750));
}

async function deliverWithResend(message) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.supportResendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: message.from,
      to: Array.isArray(message.to) ? message.to : [message.to],
      reply_to: message.replyTo,
      subject: message.subject,
      text: message.text,
      attachments: (message.attachments || []).map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content.toString("base64"),
        contentType: attachment.contentType
      }))
    })
  });

  if (response.ok) return response.json().catch(() => ({}));
  const payload = await response.json().catch(() => ({}));
  const error = new Error(payload.message || "The email provider rejected the request.");
  error.code = "EMAIL_API_ERROR";
  error.responseCode = response.status;
  throw error;
}

async function deliverSupportEmail(message) {
  if (env.supportResendApiKey) return deliverWithResend(message);

  // Render's free web services block SMTP ports, so fail quickly with an actionable
  // configuration error instead of leaving people waiting for a socket timeout.
  if (env.nodeEnv === "production" && env.supportSmtpHost === "smtp.gmail.com") {
    const error = new Error("An HTTPS email provider must be configured for this production host.");
    error.code = "EMAIL_PROVIDER_REQUIRED";
    throw error;
  }

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
      from: env.supportEmailFrom || env.supportSmtpUser,
      to: env.supportEmailTo,
      replyTo: env.supportEmailTo,
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
    if (error.code === "EMAIL_PROVIDER_REQUIRED") {
      return res.status(503).json({ message: "Support email delivery is being configured. Please try again shortly." });
    }
    if (error.code === "EMAIL_API_ERROR") {
      return res.status(502).json({ message: publicProviderError(error) });
    }
    if (isRetryableTransportError(error)) {
      return res.status(503).json({ message: publicTransportError(error) });
    }
    return res.status(502).json({ message: "Unable to send your message right now. Please try again shortly." });
  }
});
