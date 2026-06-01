import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Hash, Menu, Radio, Wifi, WifiOff, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ChatPanel from "../components/ChatPanel.jsx";
import ParticipantList from "../components/ParticipantList.jsx";
import PushToTalk from "../components/PushToTalk.jsx";
import ShareRoom from "../components/ShareRoom.jsx";
import StatusPill from "../components/StatusPill.jsx";
import { getMessages, getRoom } from "../lib/api.js";
import { getGuestName } from "../lib/guest.js";
import { useSocket } from "../hooks/useSocket.js";
import { useWebRtcRoom } from "../hooks/useWebRtcRoom.js";

export default function RoomPage() {
  const { roomId: routeRoomId } = useParams();
  const roomId = useMemo(() => String(routeRoomId || "").toUpperCase(), [routeRoomId]);
  const navigate = useNavigate();
  const socket = useSocket();
  const { ensureMedia, connectToPeers, setTrackEnabled, audioEnabled, mediaError } = useWebRtcRoom(socket, roomId);
  const [room, setRoom] = useState(null);
  const [self, setSelf] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [typing, setTyping] = useState({});
  const [status, setStatus] = useState("connecting");
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micLocked, setMicLocked] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  const speakingRef = useRef(false);
  const micLockedRef = useRef(false);
  const joinedRef = useRef(false);

  const stopTalking = useCallback((force = false) => {
    if (micLockedRef.current && !force) return;
    if (force) {
      micLockedRef.current = false;
      setMicLocked(false);
    }
    if (!speakingRef.current) return;
    speakingRef.current = false;
    setSpeaking(false);
    setTrackEnabled(false);
    socket.emit("ptt:speaking", { roomId, speaking: false });
  }, [roomId, setTrackEnabled, socket]);

  const startTalking = useCallback(async () => {
    if (muted || speakingRef.current) return;
    try {
      await ensureMedia();
      speakingRef.current = true;
      setSpeaking(true);
      setTrackEnabled(true);
      socket.emit("ptt:speaking", { roomId, speaking: true });
    } catch {
      setError("Microphone permission is required before you can talk.");
    }
  }, [ensureMedia, muted, roomId, setTrackEnabled, socket]);

  const toggleMicLock = useCallback(async () => {
    if (muted || !connected) return;
    if (micLockedRef.current) {
      stopTalking(true);
      return;
    }
    await startTalking();
    micLockedRef.current = true;
    setMicLocked(true);
  }, [connected, muted, startTalking, stopTalking]);

  useEffect(() => {
    joinedRef.current = false;
    setSelf(null);
    setParticipants([]);
    setTyping({});

    async function loadRoom() {
      try {
        const [{ room: loadedRoom }, { messages: history }] = await Promise.all([getRoom(roomId), getMessages(roomId)]);
        setRoom(loadedRoom);
        setMessages(history);
      } catch (err) {
        setError(err.message);
        window.setTimeout(() => navigate("/"), 1400);
      }
    }
    loadRoom();
  }, [navigate, roomId]);

  useEffect(() => {
    if (!room || !connected || joinedRef.current) return undefined;
    joinedRef.current = true;
    setStatus("joining");
    socket.emit("room:join", { roomId, username: getGuestName() }, async (ack) => {
      if (!ack?.ok) {
        joinedRef.current = false;
        setError(ack?.error || "Unable to join room");
        return;
      }
      setSelf(ack.user);
      setRoom(ack.room);
      setStatus("connected");
      try {
        await ensureMedia();
        await connectToPeers(ack.peers || []);
      } catch {
        setStatus("voice-limited");
      }
    });

    return () => stopTalking();
  }, [connectToPeers, connected, ensureMedia, room, roomId, socket, stopTalking]);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      setStatus(room ? "joining" : "connecting");
    }
    function onDisconnect() {
      setConnected(false);
      joinedRef.current = false;
      setStatus("reconnecting");
      stopTalking(true);
    }
    function onParticipantsUpdate(next) {
      setParticipants(next);
    }
    function onJoined(user) {
      setMessages((current) => [
        ...current,
        {
          id: `join-${user.id}-${Date.now()}`,
          username: "System",
          message: `${user.username} joined the room`,
          timestamp: new Date().toISOString()
        }
      ]);
    }
    function onLeft(user) {
      setMessages((current) => [
        ...current,
        {
          id: `left-${user.id}-${Date.now()}`,
          username: "System",
          message: `${user.username || "Someone"} left the room`,
          timestamp: new Date().toISOString()
        }
      ]);
    }
    function onChat(message) {
      setMessages((current) => [...current, message]);
    }
    function onTypingStart(user) {
      if (user.id === self?.id) return;
      setTyping((current) => ({ ...current, [user.id]: user.username }));
    }
    function onTypingStop(user) {
      setTyping((current) => {
        const next = { ...current };
        delete next[user.id];
        return next;
      });
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("participants:update", onParticipantsUpdate);
    socket.on("participant:joined", onJoined);
    socket.on("participant:left", onLeft);
    socket.on("chat:message", onChat);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("participants:update", onParticipantsUpdate);
      socket.off("participant:joined", onJoined);
      socket.off("participant:left", onLeft);
      socket.off("chat:message", onChat);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
    };
  }, [room, self?.id, socket, stopTalking]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.code !== "Space" || event.repeat || (event.target instanceof Element && event.target.matches("input, textarea"))) return;
      event.preventDefault();
      startTalking();
    }
    function handleKeyUp(event) {
      if (event.code !== "Space" || (event.target instanceof Element && event.target.matches("input, textarea"))) return;
      event.preventDefault();
      stopTalking();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [startTalking, stopTalking]);

  function sendMessage(message) {
    socket.emit("chat:message", { roomId, message });
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (next) stopTalking(true);
    socket.emit("participant:mute", { roomId, muted: next });
  }

  const statusTone = status === "connected" ? "good" : status === "voice-limited" ? "warn" : "neutral";
  const typingUsers = Object.values(typing);

  return (
    <main className="flex h-screen min-h-[680px] flex-col p-3 text-slate-100 sm:p-4">
      <header className="glass mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/" className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-white/[0.04] text-slate-300 hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-slate-500" />
              <h1 className="truncate text-lg font-black">{room?.roomName || roomId}</h1>
            </div>
            <p className="text-xs text-slate-400">Room code {roomId}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill tone={statusTone}>
            {status === "connected" ? "Connected" : status === "voice-limited" ? "Chat connected" : "Reconnecting"}
          </StatusPill>
          <ShareRoom roomId={roomId} />
          <button
            type="button"
            onClick={() => setMobilePanel((panel) => (panel ? null : "menu"))}
            className="grid h-10 w-10 place-items-center rounded-md border border-line bg-white/[0.05] md:hidden"
          >
            {mobilePanel ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <section className="grid min-h-0 flex-1 gap-3 md:grid-cols-[270px_minmax(0,1fr)_340px]">
        <div className={`${mobilePanel === "participants" || !mobilePanel ? "block" : "hidden"} min-h-0 md:block`}>
          <ParticipantList participants={participants} selfId={self?.id} />
        </div>

        <motion.div layout className="glass flex min-h-[380px] flex-col items-center justify-center rounded-lg p-6">
          <div className="mb-8 flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-4 py-2 text-sm text-slate-300">
              {connected ? <Wifi className="h-4 w-4 text-mint" /> : <WifiOff className="h-4 w-4 text-amberglow" />}
              {participants.length} online
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-4 py-2 text-sm text-slate-300">
              <Radio className={`h-4 w-4 ${audioEnabled ? "text-mint" : "text-slate-500"}`} />
              {audioEnabled ? "Broadcasting" : "Listening"}
            </div>
          </div>

          <PushToTalk
            active={speaking}
            locked={micLocked}
            muted={muted}
            disabled={!connected}
            onStart={startTalking}
            onStop={stopTalking}
            onToggleLock={toggleMicLock}
            onToggleMute={toggleMute}
          />

          {(error || mediaError) && (
            <p className="mt-6 max-w-md rounded-md border border-amberglow/30 bg-amberglow/10 p-3 text-center text-sm text-amberglow">
              {error || mediaError}
            </p>
          )}
        </motion.div>

        <div className={`${mobilePanel === "chat" || !mobilePanel ? "block" : "hidden"} min-h-0 md:block`}>
          <ChatPanel
            messages={messages}
            typingUsers={typingUsers}
            onSend={sendMessage}
            onTypingStart={() => socket.emit("typing:start", { roomId })}
            onTypingStop={() => socket.emit("typing:stop", { roomId })}
          />
        </div>
      </section>

      <nav className="mt-3 grid shrink-0 grid-cols-2 gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobilePanel("participants")}
          className="rounded-md border border-line bg-white/[0.05] px-3 py-3 text-sm text-slate-200"
        >
          Participants
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel("chat")}
          className="rounded-md border border-line bg-white/[0.05] px-3 py-3 text-sm text-slate-200"
        >
          Chat
        </button>
      </nav>
    </main>
  );
}
