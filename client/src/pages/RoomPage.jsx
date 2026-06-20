import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, FileText, Hand, Hash, Loader2, Lock, Megaphone, Menu, Pin, Radio, ScreenShare, ScreenShareOff, Unlock, Video, VideoOff, Wifi, WifiOff, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ChatPanel from "../components/ChatPanel.jsx";
import ParticipantList from "../components/ParticipantList.jsx";
import PushToTalk from "../components/PushToTalk.jsx";
import ShareRoom from "../components/ShareRoom.jsx";
import StatusPill from "../components/StatusPill.jsx";
import VideoGrid from "../components/VideoGrid.jsx";
import { getFiles, getMessages, getRoom, uploadRoomFile } from "../lib/api.js";
import { getGuestName } from "../lib/guest.js";
import { useSocket } from "../hooks/useSocket.js";
import { useWebRtcRoom } from "../hooks/useWebRtcRoom.js";

export default function RoomPage() {
  const { roomId: routeRoomId } = useParams();
  const roomId = useMemo(() => String(routeRoomId || "").toUpperCase(), [routeRoomId]);
  const navigate = useNavigate();
  const socket = useSocket();
  const {
    ensureMedia,
    connectToPeers,
    syncPeers,
    setTrackEnabled,
    startVideo,
    stopVideo,
    startScreenShare,
    audioEnabled,
    videoEnabled,
    screenSharing,
    localStream,
    remoteStreams,
    mediaError
  } = useWebRtcRoom(socket, roomId);
  const [room, setRoom] = useState(null);
  const [self, setSelf] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [typing, setTyping] = useState({});
  const [status, setStatus] = useState("connecting");
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [micLocked, setMicLocked] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [mobilePanel, setMobilePanel] = useState(null);
  const [handRaised, setHandRaised] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const speakingRef = useRef(false);
  const micLockedRef = useRef(false);
  const videoEnabledRef = useRef(false);
  const joinedRef = useRef(false);
  const wasScreenSharingRef = useRef(false);

  useEffect(() => {
    videoEnabledRef.current = videoEnabled;
  }, [videoEnabled]);

  useEffect(() => {
    if (wasScreenSharingRef.current && !screenSharing && connected) {
      socket.emit("participant:screen", { roomId, sharing: false });
    }
    wasScreenSharingRef.current = screenSharing;
  }, [connected, roomId, screenSharing, socket]);

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
    setFiles([]);

    async function loadRoom() {
      try {
        const [{ room: loadedRoom }, { messages: history }, { files: roomFiles }] = await Promise.all([
          getRoom(roomId),
          getMessages(roomId),
          getFiles(roomId)
        ]);
        setRoom(loadedRoom);
        setNoticeDraft(loadedRoom.pinnedNotice || "");
        setMessages(history);
        setFiles(roomFiles);
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
        const peers = ack.peers || [];
        syncPeers(peers.map((peer) => peer.id));
        await ensureMedia();
        await connectToPeers(peers);
        if (speakingRef.current) {
          socket.emit("ptt:speaking", { roomId, speaking: true });
        }
        if (videoEnabledRef.current) {
          socket.emit("participant:video", { roomId, video: true });
        }
      } catch {
        setStatus("voice-limited");
      }
    });
  }, [connectToPeers, connected, ensureMedia, room, roomId, socket, syncPeers]);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      setStatus(room ? "joining" : "connecting");
    }
    function onDisconnect() {
      setConnected(false);
      joinedRef.current = false;
      setStatus("reconnecting");
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
      if (mobilePanel !== "chat") setUnreadCount((count) => count + 1);
    }
    function onReaction({ messageId, reactions }) {
      setMessages((current) => current.map((message) => (message.id === messageId ? { ...message, reactions } : message)));
    }
    function onFileUploaded(file) {
      setFiles((current) => (current.some((item) => item.id === file.id) ? current : [...current, file]));
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
    function onNotice({ pinnedNotice }) {
      setRoom((current) => (current ? { ...current, pinnedNotice } : current));
      setNoticeDraft(pinnedNotice || "");
    }
    function onLock({ locked }) {
      setRoom((current) => (current ? { ...current, locked } : current));
    }
    function onMutedByHost() {
      setMuted(true);
      stopTalking(true);
    }
    function onKicked() {
      setError("You were removed from the room.");
      navigate("/");
    }
    function onRoomEnded() {
      setError("This room has ended.");
      navigate("/");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("participants:update", onParticipantsUpdate);
    socket.on("participant:joined", onJoined);
    socket.on("participant:left", onLeft);
    socket.on("chat:message", onChat);
    socket.on("chat:reaction", onReaction);
    socket.on("file:uploaded", onFileUploaded);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("room:notice", onNotice);
    socket.on("room:lock", onLock);
    socket.on("host:muted", onMutedByHost);
    socket.on("host:kicked", onKicked);
    socket.on("room:ended", onRoomEnded);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("participants:update", onParticipantsUpdate);
      socket.off("participant:joined", onJoined);
      socket.off("participant:left", onLeft);
      socket.off("chat:message", onChat);
      socket.off("chat:reaction", onReaction);
      socket.off("file:uploaded", onFileUploaded);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("room:notice", onNotice);
      socket.off("room:lock", onLock);
      socket.off("host:muted", onMutedByHost);
      socket.off("host:kicked", onKicked);
      socket.off("room:ended", onRoomEnded);
    };
  }, [mobilePanel, navigate, room, self?.id, socket, stopTalking]);

  useEffect(() => {
    if (mobilePanel === "chat") setUnreadCount(0);
  }, [mobilePanel]);

  useEffect(() => {
    if (!connected || !joinedRef.current) return undefined;
    const heartbeat = window.setInterval(() => {
      socket.emit("room:heartbeat", { roomId });
    }, 20_000);
    socket.emit("room:heartbeat", { roomId });
    return () => window.clearInterval(heartbeat);
  }, [connected, roomId, socket]);

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

  function reactToMessage(messageId, emoji) {
    socket.emit("chat:reaction", { roomId, messageId, emoji });
  }

  function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    socket.emit("participant:hand", { roomId, raised: next });
  }

  function saveNotice() {
    socket.emit("room:notice", { roomId, notice: noticeDraft });
  }

  function toggleLock() {
    socket.emit("room:lock", { roomId, locked: !room?.locked });
  }

  function endRoom() {
    socket.emit("room:end", { roomId });
  }

  function hostMute(targetId) {
    socket.emit("host:mute", { roomId, targetId });
  }

  function kickParticipant(targetId) {
    socket.emit("host:kick", { roomId, targetId });
  }

  function downloadTranscript() {
    const lines = [
      `${room?.roomName || "GalBaat Room"} transcript`,
      `Room code: ${roomId}`,
      `Exported: ${new Date().toLocaleString()}`,
      "",
      ...messages.map((message) => {
        const time = new Date(message.timestamp).toLocaleString();
        const attachments = (message.attachments || []).map((file) => ` [${file.originalName}]`).join("");
        return `[${time}] ${message.username}: ${message.message || "shared a file"}${attachments}`;
      })
    ];
    const blob = new window.Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${roomId}-transcript.txt`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  async function uploadFile(file) {
    setFileUploading(true);
    setError("");
    try {
      const { file: uploaded } = await uploadRoomFile(roomId, file, getGuestName());
      setFiles((current) => (current.some((item) => item.id === uploaded.id) ? current : [...current, uploaded]));
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setFileUploading(false);
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (next) stopTalking(true);
    socket.emit("participant:mute", { roomId, muted: next });
  }

  async function toggleVideo() {
    if (!connected || videoBusy) return;
    setVideoBusy(true);
    setError("");
    try {
      if (videoEnabled) {
        await stopVideo();
        socket.emit("participant:video", { roomId, video: false });
        socket.emit("participant:screen", { roomId, sharing: false });
      } else {
        await startVideo();
        socket.emit("participant:video", { roomId, video: true });
      }
    } catch (err) {
      setError(err.message || "Unable to toggle camera");
    } finally {
      setVideoBusy(false);
    }
  }

  async function toggleScreenShare() {
    if (!connected || videoBusy) return;
    setVideoBusy(true);
    setError("");
    try {
      if (screenSharing) {
        await stopVideo();
        socket.emit("participant:screen", { roomId, sharing: false });
        socket.emit("participant:video", { roomId, video: false });
      } else {
        await startScreenShare();
        socket.emit("participant:screen", { roomId, sharing: true });
      }
    } catch (err) {
      setError(err.message || "Unable to share screen");
    } finally {
      setVideoBusy(false);
    }
  }

  const statusTone = status === "connected" ? "good" : status === "voice-limited" ? "warn" : "neutral";
  const typingUsers = Object.values(typing);
  const hasVideo = videoEnabled || remoteStreams.some(({ stream }) => stream.getVideoTracks().some((track) => track.readyState === "live"));
  const isHost = Boolean(self?.host);

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden p-3 text-slate-100 sm:p-4">
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
            onClick={downloadTranscript}
            title="Download transcript"
            className="grid h-10 w-10 place-items-center rounded-md border border-line bg-white/[0.05] text-slate-200 hover:bg-white/10"
          >
            <FileText className="h-4 w-4" />
          </button>
          {isHost && (
            <button
              type="button"
              onClick={toggleLock}
              title={room?.locked ? "Unlock room" : "Lock room"}
              className="grid h-10 w-10 place-items-center rounded-md border border-line bg-white/[0.05] text-slate-200 hover:bg-white/10"
            >
              {room?.locked ? <Lock className="h-4 w-4 text-amberglow" /> : <Unlock className="h-4 w-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobilePanel((panel) => (panel ? null : "menu"))}
            className="grid h-10 w-10 place-items-center rounded-md border border-line bg-white/[0.05] md:hidden"
          >
            {mobilePanel ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <section className="grid min-h-0 flex-1 gap-3 overflow-hidden md:grid-cols-[270px_minmax(0,1fr)_340px]">
        <div className={`${mobilePanel === "participants" || !mobilePanel ? "block" : "hidden"} min-h-0 overflow-hidden md:block`}>
          <ParticipantList participants={participants} selfId={self?.id} isHost={isHost} onHostMute={hostMute} onKick={kickParticipant} />
        </div>

        <motion.div layout className="glass flex min-h-[380px] flex-col items-center justify-center gap-5 overflow-hidden rounded-lg p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-4 py-2 text-sm text-slate-300">
              {connected ? <Wifi className="h-4 w-4 text-mint" /> : <WifiOff className="h-4 w-4 text-amberglow" />}
              {participants.length} online
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-4 py-2 text-sm text-slate-300">
              <Radio className={`h-4 w-4 ${audioEnabled ? "text-mint" : "text-slate-500"}`} />
              {audioEnabled ? "Broadcasting" : "Listening"}
            </div>
            <button
              type="button"
              disabled={!connected || videoBusy}
              onClick={toggleVideo}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                videoEnabled ? "border-mint/40 bg-mint/10 text-mint" : "border-line bg-white/[0.04] text-slate-300 hover:bg-white/10"
              }`}
            >
              {videoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              {videoEnabled ? "Camera on" : "Camera off"}
            </button>
            <button
              type="button"
              disabled={!connected || videoBusy}
              onClick={toggleScreenShare}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                screenSharing ? "border-mint/40 bg-mint/10 text-mint" : "border-line bg-white/[0.04] text-slate-300 hover:bg-white/10"
              }`}
            >
              {screenSharing ? <ScreenShareOff className="h-4 w-4" /> : <ScreenShare className="h-4 w-4" />}
              {screenSharing ? "Stop share" : "Share screen"}
            </button>
          </div>

          {(room?.pinnedNotice || isHost) && (
            <div className="w-full max-w-3xl rounded-lg border border-line bg-white/[0.04] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
                <Pin className="h-3.5 w-3.5 text-amberglow" />
                Room Notice
              </div>
              {isHost ? (
                <div className="flex gap-2">
                  <input
                    value={noticeDraft}
                    onChange={(event) => setNoticeDraft(event.target.value)}
                    maxLength={240}
                    placeholder="Pin a topic, agenda, or room rule"
                    className="min-w-0 flex-1 rounded-md border border-line bg-ink/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  />
                  <button type="button" onClick={saveNotice} className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-mint text-ink hover:bg-mint/90" title="Save notice">
                    <Megaphone className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-200">{room.pinnedNotice}</p>
              )}
            </div>
          )}

          {hasVideo && <VideoGrid localStream={localStream} remoteStreams={remoteStreams} participants={participants} selfId={self?.id} />}

          <PushToTalk
            active={speaking}
            compact={hasVideo}
            locked={micLocked}
            muted={muted}
            disabled={!connected}
            onStart={startTalking}
            onStop={stopTalking}
            onToggleLock={toggleMicLock}
            onToggleMute={toggleMute}
          />

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={toggleHand}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                handRaised ? "border-amberglow/50 bg-amberglow/10 text-amberglow" : "border-line bg-white/[0.05] text-slate-200 hover:bg-white/10"
              }`}
            >
              <Hand className="h-4 w-4" />
              {handRaised ? "Lower hand" : "Raise hand"}
            </button>
            {isHost && (
              <button type="button" onClick={endRoom} className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-500/20">
                End room
              </button>
            )}
          </div>

          {(error || mediaError) && (
            <p className="mt-6 max-w-md rounded-md border border-amberglow/30 bg-amberglow/10 p-3 text-center text-sm text-amberglow">
              {error || mediaError}
            </p>
          )}
        </motion.div>

        <div className={`${mobilePanel === "chat" || !mobilePanel ? "block" : "hidden"} min-h-0 overflow-hidden md:block`}>
          <ChatPanel
            messages={messages}
            files={files}
            typingUsers={typingUsers}
            fileUploading={fileUploading}
            currentUsername={self?.username || getGuestName()}
            onSend={sendMessage}
            onUploadFile={uploadFile}
            onReact={reactToMessage}
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
          Chat{unreadCount ? ` (${unreadCount})` : ""}
        </button>
      </nav>
    </main>
  );
}
