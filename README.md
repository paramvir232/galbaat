# Talkietiv

Talkietiv is a real-time, no-login walkie-talkie web app with WebRTC voice rooms, push-to-talk, Socket.IO signaling, text chat, anonymous guest names, QR invite sharing, and MongoDB persistence.

## Stack

- Frontend: React, Vite, Tailwind CSS, Framer Motion, Socket.IO Client
- Backend: Node.js, Express, Socket.IO
- Database: MongoDB with Mongoose
- Realtime voice: WebRTC mesh per room with server-side signaling

## Quick Start

```bash
npm install
cp .env.example server/.env
npm run dev
```

Open `http://localhost:5173`.

MongoDB must be running locally or set `MONGODB_URI` in `server/.env`.

## Production

```bash
npm install
npm run build
npm start
```

The server serves the Vite build from `client/dist` when `NODE_ENV=production`.

Before a public launch, follow [the production launch checklist](docs/PRODUCTION_LAUNCH.md). It covers Talkietiv's custom domain, indexing, security headers, monitoring, backups, and operational checks.

## Environment

Server variables:

- `PORT`: API and Socket.IO port.
- `CLIENT_ORIGIN`: frontend origin for CORS in development.
- `ALLOWED_ORIGINS`: comma-separated production browser origins permitted to call the API and Socket.IO server.
- `MONGODB_URI`: MongoDB connection string.
- `RATE_LIMIT_WINDOW_MS`: rate-limit window.
- `RATE_LIMIT_MAX`: max requests per window.
- `MAX_ROOM_PARTICIPANTS`: audio-mesh room limit, capped at 15 for reliable browser-to-browser calling.
- `SUPPORT_SMTP_USER` and `SUPPORT_SMTP_PASSWORD`: Gmail address and Gmail App Password used to send anonymous support reports.
- `SUPPORT_EMAIL_TO`: recipient address for support reports (defaults to `talkitiv01@gmail.com`).

Client variables:

- `VITE_API_URL`: backend URL. Leave empty in production when served by Express.
- `VITE_STUN_URL`: optional STUN server, defaults to `stun:stun.l.google.com:19302`.

## WebRTC Notes

Talkietiv uses a peer-to-peer mesh. This keeps latency low for small and medium rooms. For very large rooms, add an SFU such as mediasoup, LiveKit, or Janus.

## Security

- Helmet headers
- Express rate limiting
- Input sanitization on room names, usernames, and chat text
- XSS protection through DOMPurify on the client and server-side escaping/sanitization
- Message length limits
- Room inactivity cleanup

## Deployment

- `render.yaml` is included for Render.
- `Dockerfile` builds both workspaces and runs the Express server.
- Configure `MONGODB_URI` with MongoDB Atlas or your managed MongoDB provider.

## Room Schema

```js
{
  roomId,
  roomName,
  activeUsers,
  createdAt,
  lastActivity
}
```

## Message Schema

```js
{
  roomId,
  username,
  message,
  timestamp
}
```
