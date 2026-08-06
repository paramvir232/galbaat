import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Circle, Download, FileText, Hand, Hash, Loader2, Lock, Menu, Music, PanelLeftOpen, Paperclip, Pencil, ScreenShare, ScreenShareOff, Send, Settings, Square, Trash2, Unlock, Video, VideoOff, Wifi, WifiOff, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ChatPanel from "../components/ChatPanel.jsx";
import BrandMark from "../components/BrandMark.jsx";
import ParticipantList from "../components/ParticipantList.jsx";
import PushToTalk from "../components/PushToTalk.jsx";
import ShareRoom from "../components/ShareRoom.jsx";
import Soundboard from "../components/Soundboard.jsx";
import VoiceChanger from "../components/VoiceChanger.jsx";
import StatusPill from "../components/StatusPill.jsx";
import VideoGrid from "../components/VideoGrid.jsx";
import Whiteboard from "../components/Whiteboard.jsx";
import { getMessages, getRoom, submitSupportRequest, uploadRoomFile } from "../lib/api.js";
import { getGuestClientId, getGuestName, setGuestName } from "../lib/guest.js";
import { usePageMeta } from "../lib/seo.js";
import { useSocket } from "../hooks/useSocket.js";
import { useWebRtcRoom } from "../hooks/useWebRtcRoom.js";

const MIN_CHAT_WIDTH = 320;
const MAX_CHAT_WIDTH = 520;
const ROOM_MIN_WIDTH = 360;
const ROOM_MIN_WIDTH_WITHOUT_PARTICIPANTS = 420;

export default function RoomPage() {
  const { roomId: routeRoomId } = useParams();
  const roomId = useMemo(() => String(routeRoomId || "").toUpperCase(), [routeRoomId]);
  usePageMeta({
    title: "Private room | Talkietiv",
    description: "A private Talkietiv voice room.",
    path: `/r/${encodeURIComponent(roomId)}`,
    index: false
  });
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
    startTabAudioShare,
    stopTabAudioShare,
    tabAudioSharing,
    setPeerVolume,
    setVoiceEffect,
    startRoomRecording,
    stopRoomRecording,
    audioEnabled,
    voiceEffect,
    roomRecording,
    videoEnabled,
    screenSharing,
    localStream,
    remoteStreams,
    autoplayBlocked
  } = useWebRtcRoom(socket, roomId);
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
  const [fileUploading, setFileUploading] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [tabAudioBusy, setTabAudioBusy] = useState(false);
  const [mobilePanel, setMobilePanel] = useState("room");
  const [handRaised, setHandRaised] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [peerVolumes, setPeerVolumes] = useState({});
  const [participantsCollapsed, setParticipantsCollapsed] = useState(false);
  const [chatWidth, setChatWidth] = useState(360);
  const [desktopLayout, setDesktopLayout] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [supportCategory, setSupportCategory] = useState("bug");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportScreenshot, setSupportScreenshot] = useState(null);
  const [supportError, setSupportError] = useState("");
  const [supportStatus, setSupportStatus] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [joinPanelOpen, setJoinPanelOpen] = useState(false);
  const [lockedJoinPending, setLockedJoinPending] = useState(false);
  const [joinRetryKey, setJoinRetryKey] = useState(0);
  const [roomFeatures, setRoomFeatures] = useState({ soundboardEnabled: true, voiceChangerEnabled: true });
  const [recordingNotice, setRecordingNotice] = useState({ active: false, username: "", startedAt: null });
  const [recordingPreview, setRecordingPreview] = useState(null);
  const [recordingElapsed, setRecordingElapsed] = useState(0);
  const speakingRef = useRef(false);
  const micLockedRef = useRef(false);
  const boardMuteRestoreLockRef = useRef(false);
  const videoEnabledRef = useRef(false);
  const joinedRef = useRef(false);
  const wasScreenSharingRef = useRef(false);
  const participantHandsRef = useRef(new Map());
  const participantVideoRef = useRef(new Map());
  const joinRequestsRef = useRef([]);
  const chatResizeRef = useRef(null);
  const optimisticUploadUrlsRef = useRef(new Map());
  const chatAudioContextRef = useRef(null);
  const notificationPermissionRequestedRef = useRef(false);
  const supportScreenshotInputRef = useRef(null);
  const originalTitleRef = useRef(document.title);
  const roomRedirectTimerRef = useRef(null);

  const redirectExpiredRoom = useCallback(() => {
    joinedRef.current = false;
    setStatus("expired");
    setError("This room has expired or is no longer available.");
    window.clearTimeout(roomRedirectTimerRef.current);
    roomRedirectTimerRef.current = window.setTimeout(() => navigate("/"), 1800);
  }, [navigate]);

  useEffect(() => {
    return () => window.clearTimeout(roomRedirectTimerRef.current);
  }, []);

  const getMaxChatWidth = useCallback(() => {
    if (typeof window === "undefined") return MAX_CHAT_WIDTH;
    const reservedWidth = participantsCollapsed ? 500 : 820;
    return Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, window.innerWidth - reservedWidth));
  }, [participantsCollapsed]);

  useEffect(() => {
    // A screen track uses the local video pipeline, but it is not camera video.
    videoEnabledRef.current = videoEnabled && !screenSharing;
  }, [screenSharing, videoEnabled]);

  useEffect(() => {
    const optimisticUploadUrls = optimisticUploadUrlsRef.current;
    return () => {
      optimisticUploadUrls.forEach((url) => window.URL.revokeObjectURL(url));
      optimisticUploadUrls.clear();
    };
  }, []);

  useEffect(() => {
    setSettingsName(self?.username || getGuestName());
  }, [self?.username]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const updateLayout = () => setDesktopLayout(media.matches);
    updateLayout();
    media.addEventListener("change", updateLayout);
    return () => media.removeEventListener("change", updateLayout);
  }, []);

  useEffect(() => {
    if (!desktopLayout) return undefined;

    const clampChatWidth = () => {
      setChatWidth((current) => Math.max(MIN_CHAT_WIDTH, Math.min(getMaxChatWidth(), current)));
    };

    clampChatWidth();
    window.addEventListener("resize", clampChatWidth);
    return () => window.removeEventListener("resize", clampChatWidth);
  }, [desktopLayout, getMaxChatWidth]);

  useEffect(() => {
    if (wasScreenSharingRef.current && !screenSharing && connected) {
      socket.emit("participant:screen", { roomId, sharing: false });
      if (!videoEnabled) {
        socket.emit("participant:video", { roomId, video: false });
      }
    }
    wasScreenSharingRef.current = screenSharing;
  }, [connected, roomId, screenSharing, socket, videoEnabled]);

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

  const playHandRaiseAlert = useCallback(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const now = context.currentTime;
    [660, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.12);
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.16, now + index * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.16);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.12);
      oscillator.stop(now + index * 0.12 + 0.18);
    });
    window.setTimeout(() => context.close().catch(() => {}), 500);
  }, []);

  const ensureChatAlertReady = useCallback(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext && !chatAudioContextRef.current) {
      chatAudioContextRef.current = new AudioContext();
    }
    chatAudioContextRef.current?.resume?.().catch(() => {});

    if ("Notification" in window && window.Notification.permission === "default" && !notificationPermissionRequestedRef.current) {
      notificationPermissionRequestedRef.current = true;
      window.Notification.requestPermission().catch(() => {});
    }
  }, []);

  const playChatAlert = useCallback(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = chatAudioContextRef.current || new AudioContext();
    chatAudioContextRef.current = context;
    context.resume?.().catch(() => {});
    const now = context.currentTime;

    [1046, 1318].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.08);
      gain.gain.setValueAtTime(0.0001, now + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.08 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.08 + 0.14);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.08);
      oscillator.stop(now + index * 0.08 + 0.16);
    });
  }, []);

  const playJoinAlert = useCallback(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = chatAudioContextRef.current || new AudioContext();
    chatAudioContextRef.current = context;
    context.resume?.().catch(() => {});
    const now = context.currentTime;

    [392.00, 523.25].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.1);
      gain.gain.setValueAtTime(0.0001, now + index * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.1 + 0.15);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.1);
      oscillator.stop(now + index * 0.1 + 0.2);
    });
  }, []);

  const playJoinRequestAlert = useCallback(() => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = chatAudioContextRef.current || new AudioContext();
    chatAudioContextRef.current = context;
    context.resume?.().catch(() => {});
    const now = context.currentTime;

    [587.33, 440.00].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now + index * 0.15);
      gain.gain.setValueAtTime(0.0001, now + index * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.15 + 0.2);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now + index * 0.15);
      oscillator.stop(now + index * 0.15 + 0.25);
    });
  }, []);

  const notifyIncomingMessage = useCallback((message) => {
    if (!message || message.username === "System") return;
    const currentUsername = self?.username || getGuestName();
    if (message.username === currentUsername) return;

    playChatAlert();

    if (document.hidden) {
      document.title = `New message from ${message.username} - Talkietiv`;
      if ("Notification" in window && window.Notification.permission === "granted") {
        const body = message.message || (message.attachments?.length ? "Sent an attachment" : "New message");
        const notification = new window.Notification(`Talkietiv message from ${message.username}`, {
          body,
          tag: `galbaat-${roomId}`,
          icon: "/talkitiv-logo.png"
        });
        notification.onclick = () => {
          window.focus();
          setMobilePanel("chat");
          notification.close();
        };
      }
    }
  }, [playChatAlert, roomId, self?.username]);

  useEffect(() => {
    function prepareAlerts() {
      ensureChatAlertReady();
    }
    function handleVisibility() {
      if (!document.hidden) document.title = originalTitleRef.current;
    }

    window.addEventListener("pointerdown", prepareAlerts, { once: true });
    window.addEventListener("keydown", prepareAlerts, { once: true });
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pointerdown", prepareAlerts);
      window.removeEventListener("keydown", prepareAlerts);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [ensureChatAlertReady]);

  useEffect(() => {
    function handleBeforeUnload() {
      socket.emit("room:leave", { roomId });
      socket.disconnect();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [roomId, socket]);

  useEffect(() => {
    joinedRef.current = false;
    setSelf(null);
    setParticipants([]);
    setTyping({});
    setJoinRequests([]);
    joinRequestsRef.current = [];
    participantVideoRef.current = new Map();
    setJoinPanelOpen(false);
    setLockedJoinPending(false);

    async function loadRoom() {
      try {
        const [{ room: loadedRoom }, { messages: history }] = await Promise.all([
          getRoom(roomId),
          getMessages(roomId)
        ]);
        setRoom(loadedRoom);
        setMessages(history);
      } catch (err) {
        const isUnavailable = /room not found/i.test(err.message || "");
        setError(isUnavailable ? "This room has expired or is no longer available." : err.message);
        window.setTimeout(() => navigate("/"), 1400);
      }
    }
    loadRoom();
  }, [navigate, roomId]);

  useEffect(() => {
    if (!room || !connected || joinedRef.current) return undefined;
    joinedRef.current = true;
    setStatus("joining");
    socket.emit("room:join", { roomId, username: getGuestName(), clientId: getGuestClientId() }, async (ack) => {
      if (!ack?.ok) {
        joinedRef.current = false;
        if (ack?.pending) {
          setLockedJoinPending(true);
          setStatus("waiting");
          setError("");
          return;
        }
        if (/room not found/i.test(ack?.error || "")) {
          redirectExpiredRoom();
          return;
        }
        setError(ack?.error || "Unable to join room");
        return;
      }
      setLockedJoinPending(false);
      setSelf(ack.user);
      setRoom(ack.room);
      setRoomFeatures(ack.features || { soundboardEnabled: true, voiceChangerEnabled: true });
      setRecordingNotice(ack.recording || { active: false, username: "", startedAt: null });
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
  }, [connectToPeers, connected, ensureMedia, joinRetryKey, redirectExpiredRoom, room, roomId, socket, syncPeers]);

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
      const dedupeMap = new Map();
      next.forEach((user) => {
        const key = user.clientId || user.id;
        dedupeMap.set(key, user);
      });
      const deduped = [...dedupeMap.values()];
      const previousHands = participantHandsRef.current;
      const shouldAlert = deduped.some((user) => {
        if (user.id === self?.id) return false;
        return previousHands.has(user.id) && !previousHands.get(user.id) && user.handRaised;
      });
      participantHandsRef.current = new Map(deduped.map((user) => [user.id, Boolean(user.handRaised)]));
      const previousVideoStates = participantVideoRef.current;
      deduped.forEach((user) => {
        if (user.id !== self?.id && user.video && !previousVideoStates.get(user.id)) {
          socket.emit("webrtc:video-sync-request", { to: user.id });
        }
      });
      participantVideoRef.current = new Map(deduped.map((user) => [user.id, Boolean(user.video)]));
      if (shouldAlert) playHandRaiseAlert();
      setParticipants(deduped);
      const currentSelf = deduped.find((user) => user.id === self?.id || (self?.clientId && user.clientId === self.clientId));
      if (currentSelf) {
        setSelf(currentSelf);
        setMuted(Boolean(currentSelf.muted));
        const peers = deduped.filter((user) => user.id !== currentSelf.id);
        syncPeers(peers.map((user) => user.id));
        connectToPeers(peers).catch(() => setStatus((current) => (current === "connected" ? "voice-limited" : current)));
      }
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
      playJoinAlert();
    }
    function onPeerReady({ id }) {
      if (!id || id === self?.id) return;
      connectToPeers([{ id }]).catch(() => setStatus((current) => (current === "connected" ? "voice-limited" : current)));
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
      setMessages((current) => {
        if (!message.clientUploadId) return [...current, message];
        const optimisticUrl = optimisticUploadUrlsRef.current.get(message.clientUploadId);
        if (optimisticUrl) {
          window.URL.revokeObjectURL(optimisticUrl);
          optimisticUploadUrlsRef.current.delete(message.clientUploadId);
        }
        const optimisticIndex = current.findIndex((item) => item.clientUploadId === message.clientUploadId);
        if (optimisticIndex === -1) return [...current, message];
        const next = [...current];
        next[optimisticIndex] = message;
        return next;
      });
      notifyIncomingMessage(message);
      if (mobilePanel !== "chat") setUnreadCount((count) => count + 1);
    }
    function onReaction({ messageId, reactions }) {
      setMessages((current) => current.map((message) => (message.id === messageId ? { ...message, reactions } : message)));
    }
    function onChatUpdate(nextMessage) {
      setMessages((current) => current.map((message) => (message.id === nextMessage.id ? { ...message, ...nextMessage } : message)));
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
    function onLock({ locked }) {
      setRoom((current) => (current ? { ...current, locked } : current));
    }
    function onRoomFeatures(features) {
      const nextFeatures = features || { soundboardEnabled: true, voiceChangerEnabled: true };
      setRoomFeatures(nextFeatures);
      if (!nextFeatures.voiceChangerEnabled) setVoiceEffect("none").catch(() => {});
    }
    function onRecordingState(nextRecording) {
      setRecordingNotice(nextRecording || { active: false, username: "", startedAt: null });
    }
    function onMutedByHost({ muted: nextMuted = true } = {}) {
      setMuted(Boolean(nextMuted));
      if (nextMuted) stopTalking(true);
    }
    function onKicked() {
      setError("You were removed from the room.");
      navigate("/");
    }
    function onRoomEnded() {
      setError("This room has ended.");
      navigate("/");
    }
    function onJoinRequests(requests = []) {
      const prevRequests = joinRequestsRef.current;
      const prevIds = new Set(prevRequests.map((r) => r.id));
      const hasNewRequest = requests.some((r) => !prevIds.has(r.id));
      if (hasNewRequest) {
        playJoinRequestAlert();
      }
      joinRequestsRef.current = requests;
      setJoinRequests(requests);
      if (requests.length) setJoinPanelOpen(true);
    }
    function onJoinApproved() {
      setLockedJoinPending(false);
      setStatus("joining");
      joinedRef.current = false;
      setJoinRetryKey((key) => key + 1);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("participants:update", onParticipantsUpdate);
    socket.on("participant:joined", onJoined);
    socket.on("webrtc:peer-ready", onPeerReady);
    socket.on("participant:left", onLeft);
    socket.on("chat:message", onChat);
    socket.on("chat:reaction", onReaction);
    socket.on("chat:update", onChatUpdate);
    socket.on("typing:start", onTypingStart);
    socket.on("typing:stop", onTypingStop);
    socket.on("room:lock", onLock);
    socket.on("room:features", onRoomFeatures);
    socket.on("room:recording", onRecordingState);
    socket.on("host:muted", onMutedByHost);
    socket.on("host:kicked", onKicked);
    socket.on("room:ended", onRoomEnded);
    socket.on("room:join-requests", onJoinRequests);
    socket.on("room:join-approved", onJoinApproved);
    setConnected(socket.connected);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("participants:update", onParticipantsUpdate);
      socket.off("participant:joined", onJoined);
      socket.off("webrtc:peer-ready", onPeerReady);
      socket.off("participant:left", onLeft);
      socket.off("chat:message", onChat);
      socket.off("chat:reaction", onReaction);
      socket.off("chat:update", onChatUpdate);
      socket.off("typing:start", onTypingStart);
      socket.off("typing:stop", onTypingStop);
      socket.off("room:lock", onLock);
      socket.off("room:features", onRoomFeatures);
      socket.off("room:recording", onRecordingState);
      socket.off("host:muted", onMutedByHost);
      socket.off("host:kicked", onKicked);
      socket.off("room:ended", onRoomEnded);
      socket.off("room:join-requests", onJoinRequests);
      socket.off("room:join-approved", onJoinApproved);
    };
  }, [connectToPeers, mobilePanel, navigate, notifyIncomingMessage, playHandRaiseAlert, playJoinAlert, playJoinRequestAlert, room, self?.clientId, self?.id, setVoiceEffect, socket, stopTalking, syncPeers]);

  useEffect(() => {
    if (mobilePanel === "chat") setUnreadCount(0);
  }, [mobilePanel]);

  useEffect(() => {
    const startedAt = roomRecording.active ? roomRecording.startedAt : recordingNotice.active ? recordingNotice.startedAt : null;
    if (!startedAt) {
      setRecordingElapsed(0);
      return undefined;
    }
    const update = () => setRecordingElapsed(Date.now() - new Date(startedAt).getTime());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [recordingNotice.active, recordingNotice.startedAt, roomRecording.active, roomRecording.startedAt]);

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
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId || message.deletedAt) return message;
        const currentReactions = message.reactions || {};
        const previousEmoji = message.myReaction;
        const isRemoving = previousEmoji === emoji;
        const nextReactions = { ...currentReactions };

        if (previousEmoji && nextReactions[previousEmoji]) {
          nextReactions[previousEmoji] = Math.max(0, Number(nextReactions[previousEmoji]) - 1);
          if (nextReactions[previousEmoji] === 0) delete nextReactions[previousEmoji];
        }

        if (!isRemoving) {
          nextReactions[emoji] = Number(nextReactions[emoji] || 0) + 1;
        }

        return {
          ...message,
          reactions: nextReactions,
          myReaction: isRemoving ? null : emoji
        };
      })
    );
    socket.emit("chat:reaction", { roomId, messageId, emoji });
  }

  function editMessage(messageId, message) {
    socket.emit("chat:edit", { roomId, messageId, message }, (ack) => {
      if (!ack?.ok) setError(ack?.error || "Message edit failed");
    });
  }

  function deleteMessage(messageId) {
    socket.emit("chat:delete", { roomId, messageId }, (ack) => {
      if (!ack?.ok) setError(ack?.error || "Message delete failed");
    });
  }

  function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    socket.emit("participant:hand", { roomId, raised: next });
  }

  function toggleLock() {
    socket.emit("room:lock", { roomId, locked: !room?.locked });
  }

  function allowJoinRequest(requestId) {
    socket.emit("room:join-allow", { roomId, requestId });
  }

  function unlockRoomFromRequests() {
    socket.emit("room:lock", { roomId, locked: false });
    setJoinPanelOpen(false);
  }

  function endRoom() {
    socket.emit("room:end", { roomId });
    navigate("/");
  }

  function hostMute(targetId, muted) {
    socket.emit("host:mute", { roomId, targetId, muted });
  }

  function selfMute(nextMuted) {
    if (nextMuted) stopTalking(true);
    setMuted(Boolean(nextMuted || self?.hostMuted));
    setSelf((current) =>
      current
        ? {
            ...current,
            selfMuted: Boolean(nextMuted),
            muted: Boolean(nextMuted || current.hostMuted)
          }
        : current
    );
    socket.emit("participant:mute", { roomId, muted: nextMuted });
  }

  function selfMuteFromBoard(nextMuted) {
    if (nextMuted) {
      boardMuteRestoreLockRef.current = micLockedRef.current;
      selfMute(true);
      return;
    }

    const shouldRestoreLock = boardMuteRestoreLockRef.current;
    boardMuteRestoreLockRef.current = false;
    selfMute(false);

    if (!shouldRestoreLock || !connected || self?.hostMuted) return;
    window.setTimeout(async () => {
      try {
        await ensureMedia();
        speakingRef.current = true;
        setSpeaking(true);
        setTrackEnabled(true);
        socket.emit("ptt:speaking", { roomId, speaking: true });
        micLockedRef.current = true;
        setMicLocked(true);
      } catch {
        setError("Microphone permission is required before you can talk.");
      }
    }, 80);
  }

  function saveDisplayName(event) {
    event.preventDefault();
    const nextName = setGuestName(settingsName);
    setSettingsName(nextName);
    setSettingsError("");
    socket.emit("participant:rename", { roomId, username: nextName }, (ack) => {
      if (!ack?.ok) {
        setSettingsError(ack?.error || "Unable to update name");
        return;
      }
      setSelf(ack.user);
      setSettingsOpen(false);
    });
  }

  function setRoomFeature(feature, enabled) {
    socket.emit("room:feature", { roomId, feature, enabled }, (ack) => {
      if (!ack?.ok) {
        setSettingsError(ack?.error || "Unable to update room control");
        return;
      }
      setSettingsError("");
      setRoomFeatures(ack.features);
      if (!ack.features.voiceChangerEnabled) setVoiceEffect("none").catch(() => {});
    });
  }

  function selectSupportScreenshot(event) {
    const [file] = event.target.files || [];
    setSupportError("");
    if (!file) {
      setSupportScreenshot(null);
      return;
    }
    if (!file.type.startsWith("image/") || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setSupportScreenshot(null);
      setSupportError("Please attach a PNG, JPEG, or WebP screenshot.");
      event.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSupportScreenshot(null);
      setSupportError("Screenshot must be 5 MB or smaller.");
      event.target.value = "";
      return;
    }
    setSupportScreenshot(file);
  }

  async function sendSupportReport(event) {
    event.preventDefault();
    const message = supportMessage.trim();
    setSupportError("");
    setSupportStatus("");
    if (message.length < 10) {
      setSupportError("Please include a little more detail so we can help.");
      return;
    }

    setSupportSending(true);
    try {
      await submitSupportRequest({ category: supportCategory, message, screenshot: supportScreenshot });
      setSupportMessage("");
      setSupportScreenshot(null);
      if (supportScreenshotInputRef.current) supportScreenshotInputRef.current.value = "";
      setSupportStatus("Sent. Thank you for helping improve Talkietiv.");
    } catch (requestError) {
      setSupportError(requestError.message || "Unable to send your message.");
    } finally {
      setSupportSending(false);
    }
  }

  function kickParticipant(targetId) {
    socket.emit("host:kick", { roomId, targetId });
  }

  function downloadTranscript() {
    const lines = [
      `${room?.roomName || "Talkietiv Room"} transcript`,
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

  function formatRecordingTime(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }

  async function toggleRoomRecording() {
    try {
      if (roomRecording.active) {
        const result = await stopRoomRecording();
        socket.emit("room:recording", { roomId, recording: false });
        if (!result?.blob?.size) return;
        const url = window.URL.createObjectURL(result.blob);
        setRecordingPreview({ ...result, url });
        return;
      }
      const startedAt = await startRoomRecording();
      socket.emit("room:recording", { roomId, recording: true, startedAt });
    } catch (recordingError) {
      setError(recordingError.message || "Unable to start room recording.");
    }
  }

  async function uploadFile(file, options = {}) {
    const clientUploadId = options.clientUploadId || (options.optimistic ? `upload-${Date.now()}-${Math.random().toString(36).slice(2)}` : undefined);
    let optimisticUrl = null;
    if (options.optimistic && clientUploadId) {
      optimisticUrl = window.URL.createObjectURL(file);
      optimisticUploadUrlsRef.current.set(clientUploadId, optimisticUrl);
      setMessages((current) => [
        ...current,
        {
          id: clientUploadId,
          clientUploadId,
          optimistic: true,
          roomId,
          username: self?.username || getGuestName(),
          message: options.message || "",
          attachments: [
            {
              id: clientUploadId,
              originalName: file.name,
              mimeType: file.type,
              size: file.size,
              previewUrl: optimisticUrl,
              downloadUrl: optimisticUrl
            }
          ],
          reactions: {},
          timestamp: new Date().toISOString()
        }
      ]);
    }

    setFileUploading(true);
    setError("");
    try {
      const payload = await uploadRoomFile(roomId, file, getGuestName(), { ...options, clientUploadId, chatOnly: true });
      if (payload.message?.clientUploadId) {
        setMessages((current) => current.map((message) => (message.clientUploadId === payload.message.clientUploadId ? payload.message : message)));
        const savedUrl = optimisticUploadUrlsRef.current.get(payload.message.clientUploadId);
        if (savedUrl) {
          window.URL.revokeObjectURL(savedUrl);
          optimisticUploadUrlsRef.current.delete(payload.message.clientUploadId);
        }
      }
    } catch (err) {
      if (clientUploadId) {
        const savedUrl = optimisticUploadUrlsRef.current.get(clientUploadId);
        if (savedUrl) {
          window.URL.revokeObjectURL(savedUrl);
          optimisticUploadUrlsRef.current.delete(clientUploadId);
        }
        setMessages((current) => current.filter((message) => message.clientUploadId !== clientUploadId));
      }
      setError(err.message || "Upload failed");
    } finally {
      setFileUploading(false);
    }
  }

  function changePeerVolume(peerId, volume) {
    setPeerVolumes((current) => ({ ...current, [peerId]: volume }));
    setPeerVolume(peerId, Number(volume) / 100);
  }

  function startChatResize(event) {
    event.preventDefault();
    chatResizeRef.current = {
      startX: event.clientX,
      startWidth: chatWidth
    };
    window.addEventListener("pointermove", resizeChat);
    window.addEventListener("pointerup", stopChatResize, { once: true });
  }

  function resizeChat(event) {
    if (!chatResizeRef.current) return;
    const nextWidth = chatResizeRef.current.startWidth + chatResizeRef.current.startX - event.clientX;
    setChatWidth(Math.max(MIN_CHAT_WIDTH, Math.min(getMaxChatWidth(), nextWidth)));
  }

  function stopChatResize() {
    chatResizeRef.current = null;
    window.removeEventListener("pointermove", resizeChat);
  }

  async function toggleVideo() {
    if (!connected || videoBusy) return;
    setVideoBusy(true);
    setError("");
    try {
      if (videoEnabled && !screenSharing) {
        await stopVideo();
        socket.emit("participant:video", { roomId, video: false });
        socket.emit("participant:screen", { roomId, sharing: false });
      } else {
        if (screenSharing) {
          await stopVideo();
          socket.emit("participant:screen", { roomId, sharing: false });
        }
        await startVideo();
        socket.emit("participant:video", { roomId, video: true });
      }
    } catch (err) {
      window.console.warn("Unable to toggle camera", err);
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
        if (tabAudioSharing) {
          await stopTabAudioShare();
        }
        await startScreenShare();
        socket.emit("participant:video", { roomId, video: false });
        socket.emit("participant:screen", { roomId, sharing: true });
      }
    } catch (err) {
      window.console.warn("Unable to share screen", err);
    } finally {
      setVideoBusy(false);
    }
  }

  async function toggleTabAudioShare() {
    if (!connected || tabAudioBusy) return;
    setTabAudioBusy(true);
    setError("");
    try {
      if (tabAudioSharing) {
        await stopTabAudioShare();
      } else {
        if (screenSharing) {
          await stopVideo();
          socket.emit("participant:screen", { roomId, sharing: false });
          socket.emit("participant:video", { roomId, video: false });
        }
        await startTabAudioShare();
      }
    } catch (err) {
      window.console.warn("Unable to toggle music share", err);
    } finally {
      setTabAudioBusy(false);
    }
  }

  const statusTone = status === "connected" ? "good" : status === "voice-limited" ? "warn" : "neutral";
  const typingUsers = Object.values(typing);
  const hasRemoteVideo = participants.some((user) => user.id !== self?.id && (user.video || user.screenSharing));
  const hasVideo = videoEnabled || hasRemoteVideo;
  const isHost = Boolean(self?.host);
  const desktopGridColumns = participantsCollapsed
    ? `minmax(${ROOM_MIN_WIDTH_WITHOUT_PARTICIPANTS}px,1fr) minmax(${MIN_CHAT_WIDTH}px,${chatWidth}px)`
    : `280px minmax(${ROOM_MIN_WIDTH}px,1fr) minmax(${MIN_CHAT_WIDTH}px,${chatWidth}px)`;

  return (
    <main className="flex h-dvh min-h-0 flex-col overflow-hidden bg-black p-2 text-slate-100 sm:p-4">
      <header className="apple-surface relative z-40 mb-2 flex shrink-0 flex-col gap-2 rounded-xl px-3 py-3 sm:mb-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
        <div className="flex w-full min-w-0 flex-1 items-center gap-2 sm:w-auto sm:gap-3">
          <Link to="/" className="apple-control grid h-11 w-11 shrink-0 place-items-center rounded-md text-slate-300 sm:h-10 sm:w-10">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <BrandMark className="w-[110px] sm:w-[170px] h-auto -translate-y-[3px] sm:-translate-y-[5px]" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-slate-500" />
              <h1 className="truncate text-lg font-black">{room?.roomName || roomId}</h1>
            </div>
            <p className="text-xs text-slate-400">Room code {roomId}</p>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-1.5 sm:w-auto sm:justify-end sm:gap-2">
          {room?.createdAt && <RoomTimer createdAt={room.createdAt} />}
          <StatusPill tone={statusTone}>
            {status === "connected" ? "Connected" : status === "voice-limited" ? "Chat connected" : status === "waiting" ? "Waiting" : "Reconnecting"}
          </StatusPill>
          {recordingNotice.active && (
            <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 px-3 text-xs font-bold text-red-100">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
              Recording {formatRecordingTime(recordingElapsed)}
            </div>
          )}
          <ShareRoom roomId={roomId} />
          {isHost && (
            <button
              type="button"
              onClick={toggleRoomRecording}
              title={roomRecording.active ? "Stop recording" : "Record room audio"}
              className={`grid h-11 w-11 place-items-center rounded-[14px] border transition sm:h-10 sm:w-10 ${roomRecording.active ? "border-red-400/50 bg-red-500/15 text-red-200" : "apple-control text-slate-200"}`}
            >
              {roomRecording.active ? <Square className="h-3.5 w-3.5 fill-current" /> : <Circle className="h-4 w-4 text-red-300" />}
            </button>
          )}
          <button
            type="button"
            onClick={downloadTranscript}
            title="Download transcript"
            className="apple-control grid h-11 w-11 place-items-center rounded-[14px] text-slate-200 sm:h-10 sm:w-10"
          >
            <FileText className="h-4 w-4" />
          </button>
          {isHost && (
            <div className="relative z-50">
            <button
              type="button"
              onClick={() => {
                if (room?.locked && joinRequests.length) {
                  setJoinPanelOpen((open) => !open);
                  return;
                }
                toggleLock();
              }}
              title={room?.locked ? "Unlock room" : "Lock room"}
              className="apple-control relative grid h-11 w-11 place-items-center rounded-[14px] text-slate-200 sm:h-10 sm:w-10"
            >
              {room?.locked ? <Lock className="h-4 w-4 text-amberglow" /> : <Unlock className="h-4 w-4" />}
              {joinRequests.length > 0 && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border border-ink bg-red-500 px-1 text-[10px] font-black text-white">
                  {joinRequests.length}
                </span>
              )}
            </button>
            {joinPanelOpen && room?.locked && (
              <div className="apple-surface absolute right-0 top-12 z-[999] w-72 rounded-xl p-3 shadow-2xl">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-100">Waiting to join</p>
                    <p className="text-xs text-slate-400">{joinRequests.length || "No"} pending request{joinRequests.length === 1 ? "" : "s"}</p>
                  </div>
                  <button type="button" onClick={() => setJoinPanelOpen(false)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <button type="button" onClick={unlockRoomFromRequests} className="mb-3 min-h-10 w-full rounded-md border border-mint/40 bg-mint/10 px-3 text-sm font-bold text-mint hover:bg-mint/15">
                  Unlock room for everyone
                </button>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {joinRequests.length ? joinRequests.map((request) => (
                    <div key={request.id} className="flex items-center gap-2 rounded-md border border-line bg-ink/50 p-2">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white/[0.06] text-xs font-black text-slate-100">
                        {request.username?.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-100">{request.username}</p>
                        <p className="text-xs text-slate-500">Requesting access</p>
                      </div>
                      <button type="button" onClick={() => allowJoinRequest(request.id)} className="min-h-9 rounded-md bg-mint px-3 text-xs font-black text-ink hover:bg-mint/90">
                        Allow
                      </button>
                    </div>
                  )) : (
                    <p className="rounded-md border border-dashed border-line px-3 py-2 text-xs text-slate-500">No one is waiting right now.</p>
                  )}
                </div>
              </div>
            )}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setSettingsName(self?.username || getGuestName());
              setSettingsError("");
              setSupportError("");
              setSupportStatus("");
              setSettingsOpen(true);
            }}
            title="Settings"
            className="apple-control grid h-11 w-11 place-items-center rounded-[14px] text-slate-200 sm:h-10 sm:w-10"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setMobilePanel((panel) => (panel === "room" ? "chat" : "room"))}
            className="apple-control grid h-11 w-11 place-items-center rounded-[14px] md:hidden"
          >
            {mobilePanel === "room" ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {lockedJoinPending ? (
        <section className="apple-surface grid min-h-0 flex-1 place-items-center rounded-xl p-6 text-center shadow-2xl">
          <div className="apple-control w-full max-w-md rounded-xl bg-black/45 p-6">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full border border-amberglow/40 bg-amberglow/10 text-amberglow">
              <Lock className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-black text-slate-100">Room is locked</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Waiting for the room admin to allow you in. You will join automatically when approved.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.04] px-4 py-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin text-mint" />
              Waiting for admin permission
            </div>
            <Link to="/" className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md border border-line bg-white/[0.04] px-4 text-sm font-semibold text-slate-200 hover:bg-white/10">
              Leave room
            </Link>
          </div>
        </section>
      ) : (
      <section className="relative grid min-h-0 flex-1 gap-2 overflow-hidden lg:grid" style={desktopLayout ? { gridTemplateColumns: desktopGridColumns } : undefined}>
        {participantsCollapsed && (
          <button
            type="button"
            onClick={() => setParticipantsCollapsed(false)}
            title="Show participants"
            className="apple-control absolute left-0 top-2 z-20 hidden h-10 w-10 place-items-center rounded-r-[14px] border-l-0 text-slate-200 shadow-xl lg:grid"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        <div className={`${mobilePanel === "participants" ? "block" : "hidden"} min-h-0 overflow-hidden ${participantsCollapsed ? "lg:hidden" : "lg:block"}`}>
          <ParticipantList
            participants={participants}
            selfId={self?.id}
            isHost={isHost}
            peerVolumes={peerVolumes}
            onPeerVolumeChange={changePeerVolume}
            onCollapse={() => setParticipantsCollapsed(true)}
            onSelfMute={selfMute}
            onHostMute={hostMute}
            onKick={kickParticipant}
          />
        </div>

        <motion.div
          className={`${mobilePanel === "room" ? "flex" : "hidden"} apple-surface min-h-0 flex-col items-center gap-3 overflow-y-auto rounded-xl p-3 sm:gap-5 sm:p-5 lg:flex xl:p-6`}
        >
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
            <div className="apple-control inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/[0.045] px-3 py-2 text-xs text-slate-300 sm:min-h-0 sm:px-4 sm:text-sm">
              {connected ? <Wifi className="h-4 w-4 text-mint" /> : <WifiOff className="h-4 w-4 text-amberglow" />}
              {participants.length} online
            </div>
            <button
              type="button"
              onClick={() => setWhiteboardOpen(true)}
              className="apple-control inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/[0.045] px-3 py-2 text-xs font-medium text-slate-300 sm:min-h-0 sm:px-4 sm:text-sm"
            >
              <Pencil className={`h-4 w-4 ${audioEnabled ? "text-mint" : "text-slate-400"}`} />
              Whiteboard
            </button>
            <Soundboard socket={socket} roomId={roomId} disabled={!connected || !roomFeatures.soundboardEnabled} />
            <VoiceChanger effect={voiceEffect} onChange={setVoiceEffect} disabled={!connected || !roomFeatures.voiceChangerEnabled} />
            <button
              type="button"
              disabled={!connected || videoBusy}
              onClick={toggleVideo}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:px-4 sm:text-sm ${
                videoEnabled && !screenSharing ? "border-mint/40 bg-mint/10 text-mint" : "apple-control bg-white/[0.045] text-slate-300"
              }`}
            >
              {videoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : videoEnabled && !screenSharing ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              <span className="sm:hidden">Camera</span>
              <span className="hidden sm:inline">{videoEnabled && !screenSharing ? "Camera on" : "Camera off"}</span>
            </button>
            <button
              type="button"
              disabled={!connected || tabAudioBusy}
              onClick={toggleTabAudioShare}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:px-4 sm:text-sm ${
                tabAudioSharing ? "border-mint/40 bg-mint/10 text-mint" : "apple-control bg-white/[0.045] text-slate-300"
              }`}
            >
              {tabAudioBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />}
              <span className="sm:hidden">{tabAudioSharing ? "Stop" : "Music"}</span>
              <span className="hidden sm:inline">{tabAudioSharing ? "Stop music" : "Share music"}</span>
            </button>
            <button
              type="button"
              disabled={!connected || videoBusy}
              onClick={toggleScreenShare}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:px-4 sm:text-sm ${
                screenSharing ? "border-mint/40 bg-mint/10 text-mint" : "apple-control bg-white/[0.045] text-slate-300"
              }`}
            >
              {screenSharing ? <ScreenShareOff className="h-4 w-4" /> : <ScreenShare className="h-4 w-4" />}
              <span className="sm:hidden">{screenSharing ? "Stop" : "Share"}</span>
              <span className="hidden sm:inline">{screenSharing ? "Stop share" : "Share screen"}</span>
            </button>
          </div>

          {hasVideo && <VideoGrid localStream={localStream} remoteStreams={remoteStreams} participants={participants} selfId={self?.id} screenSharing={screenSharing} />}

          <PushToTalk
            active={speaking}
            compact={hasVideo}
            locked={micLocked}
            muted={muted}
            selfMuted={Boolean(self?.selfMuted || (muted && !self?.hostMuted))}
            hostMuted={Boolean(self?.hostMuted)}
            disabled={!connected}
            onStart={startTalking}
            onStop={stopTalking}
            onToggleLock={toggleMicLock}
            onToggleMute={selfMute}
          />

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-center sm:gap-3">
            <button
              type="button"
              onClick={toggleHand}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition sm:px-4 ${
                handRaised ? "border-amberglow/50 bg-amberglow/10 text-amberglow" : "border-line bg-white/[0.05] text-slate-200 hover:bg-white/10"
              }`}
            >
              <Hand className="h-4 w-4" />
              {handRaised ? "Lower hand" : "Raise hand"}
            </button>
            {isHost && (
              <button type="button" onClick={endRoom} className="min-h-11 rounded-full border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-100 hover:bg-red-500/20 sm:px-4">
                End room
              </button>
            )}
          </div>

          {error && (
            <p className="mt-6 max-w-md rounded-md border border-amberglow/30 bg-amberglow/10 p-3 text-center text-sm text-amberglow">
              {error}
            </p>
          )}

          {autoplayBlocked && (
            <p className="mt-6 max-w-md rounded-md border border-mint/30 bg-mint/10 p-3 text-center text-sm text-mint animate-pulse">
              Audio playback is blocked. Tap anywhere on the page to hear other users.
            </p>
          )}
        </motion.div>

        <div className={`${mobilePanel === "chat" ? "block" : "hidden"} relative min-h-0 overflow-hidden lg:block`}>
          <button
            type="button"
            onPointerDown={startChatResize}
            title="Resize chat"
            className="absolute -left-2 top-0 z-10 hidden h-full w-3 cursor-col-resize border-x border-transparent hover:border-line hover:bg-white/[0.04] lg:block"
          />
          <ChatPanel
            messages={messages}
            participants={participants}
            typingUsers={typingUsers}
            fileUploading={fileUploading}
            currentUsername={self?.username || getGuestName()}
            onSend={sendMessage}
            onUploadFile={uploadFile}
            onReact={reactToMessage}
            onEdit={editMessage}
            onDelete={deleteMessage}
            onTypingStart={() => socket.emit("typing:start", { roomId })}
            onTypingStop={() => socket.emit("typing:stop", { roomId })}
          />
        </div>
      </section>
      )}

      {settingsOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-md">
          <div className="apple-surface max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-100">Settings</h2>
                <p className="text-xs text-slate-400">Profile and support</p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white/[0.04] text-slate-300 hover:bg-white/10"
                aria-label="Close settings"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={saveDisplayName}>
              <label className="block text-sm font-semibold text-slate-200" htmlFor="display-name">
                Display name
              </label>
              <input
                id="display-name"
                value={settingsName}
                onChange={(event) => setSettingsName(event.target.value)}
                maxLength={24}
                autoFocus
                className="mt-2 w-full rounded-md border border-line bg-ink/70 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-mint/70"
                placeholder="Your name"
              />
              {settingsError && <p className="mt-2 text-xs text-amberglow">{settingsError}</p>}

              <div className="mt-4 flex justify-end gap-2">
                <button type="submit" className="min-h-10 rounded-md bg-mint px-4 text-sm font-bold text-ink hover:bg-mint/90">
                  Save name
                </button>
              </div>
            </form>

            {isHost && (
              <section className="mt-5 border-t border-line pt-5">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-slate-100">Room controls</h3>
                  <p className="mt-1 text-xs text-slate-400">Choose which live effects everyone can use.</p>
                </div>
                <div className="space-y-2">
                  {[
                    ["soundboard", "Soundboard", "Allow room sound effects", roomFeatures.soundboardEnabled],
                    ["voiceChanger", "Voice changer", "Allow live voice effects", roomFeatures.voiceChangerEnabled]
                  ].map(([feature, label, description, enabled]) => (
                    <div key={feature} className="flex items-center gap-3 rounded-lg border border-line bg-ink/50 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-100">{label}</p>
                        <p className="text-xs text-slate-500">{description}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        onClick={() => setRoomFeature(feature, !enabled)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition ${enabled ? "bg-mint" : "bg-white/15"}`}
                        title={`${enabled ? "Disable" : "Enable"} ${label}`}
                      >
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <form onSubmit={sendSupportReport} className="mt-5 border-t border-line pt-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Report a bug or contact us</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Send feedback anonymously to the Talkietiv team.</p>
                </div>
                <select
                  value={supportCategory}
                  onChange={(event) => setSupportCategory(event.target.value)}
                  className="h-9 shrink-0 rounded-md border border-line bg-ink/70 px-2 text-xs font-medium text-slate-200 outline-none focus:border-mint/70"
                  aria-label="Message type"
                >
                  <option value="bug">Bug report</option>
                  <option value="query">Question</option>
                </select>
              </div>

              <label className="sr-only" htmlFor="support-message">Message</label>
              <textarea
                id="support-message"
                value={supportMessage}
                onChange={(event) => setSupportMessage(event.target.value)}
                maxLength={4000}
                rows={5}
                required
                className="mt-3 w-full resize-y rounded-md border border-line bg-ink/70 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-mint/70"
                placeholder="Tell us what happened or how we can help..."
              />

              <input ref={supportScreenshotInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={selectSupportScreenshot} />
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => supportScreenshotInputRef.current?.click()}
                  className="inline-flex min-h-9 min-w-0 items-center gap-2 rounded-md border border-line px-3 text-xs font-semibold text-slate-300 hover:bg-white/[0.07]"
                >
                  <Paperclip className="h-4 w-4" />
                  <span className="max-w-44 truncate">{supportScreenshot ? supportScreenshot.name : "Attach screenshot"}</span>
                </button>
                {supportScreenshot && (
                  <button
                    type="button"
                    onClick={() => {
                      setSupportScreenshot(null);
                      if (supportScreenshotInputRef.current) supportScreenshotInputRef.current.value = "";
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100"
                    title="Remove screenshot"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {supportError && <p className="mt-3 text-xs text-amberglow">{supportError}</p>}
              {supportStatus && <p className="mt-3 text-xs text-mint">{supportStatus}</p>}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={supportSending}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-mint px-4 text-sm font-bold text-ink hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {supportSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {recordingPreview && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-md">
          <div className="apple-surface w-full max-w-lg rounded-xl p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-100">Room recording</h2>
                <p className="mt-1 text-xs text-slate-400">{formatRecordingTime(recordingPreview.endedAt - recordingPreview.startedAt)} · {new Date(recordingPreview.startedAt).toLocaleString()}</p>
              </div>
              <button type="button" onClick={() => setRecordingPreview(null)} className="grid h-9 w-9 place-items-center rounded-md border border-line text-slate-300 hover:bg-white/10" title="Close preview">
                <X className="h-4 w-4" />
              </button>
            </div>
            <audio controls preload="metadata" src={recordingPreview.url} className="mt-5 w-full" />
            <div className="mt-5 flex justify-end gap-2">
              <a href={recordingPreview.url} download={`talkietiv-room-${roomId}-${recordingPreview.startedAt}.webm`} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-mint px-4 text-sm font-bold text-ink hover:bg-mint/90">
                <Download className="h-4 w-4" /> Download
              </a>
              <button
                type="button"
                onClick={() => {
                  window.URL.revokeObjectURL(recordingPreview.url);
                  setRecordingPreview(null);
                }}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-red-400/35 bg-red-500/10 px-4 text-sm font-semibold text-red-100 hover:bg-red-500/20"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <Whiteboard
        open={whiteboardOpen}
        roomId={roomId}
        socket={socket}
        currentUser={self}
        participants={participants}
        peerVolumes={peerVolumes}
        onPeerVolumeChange={changePeerVolume}
        onSelfMute={selfMuteFromBoard}
        chatPanel={
          <ChatPanel
            messages={messages}
            participants={participants}
            typingUsers={typingUsers}
            fileUploading={fileUploading}
            currentUsername={self?.username || getGuestName()}
            onSend={sendMessage}
            onUploadFile={uploadFile}
            onReact={reactToMessage}
            onEdit={editMessage}
            onDelete={deleteMessage}
            onTypingStart={() => socket.emit("typing:start", { roomId })}
            onTypingStop={() => socket.emit("typing:stop", { roomId })}
          />
        }
        onClose={() => setWhiteboardOpen(false)}
      />

      <nav className="mt-1.5 grid shrink-0 grid-cols-3 gap-1.5 pb-[var(--safe-bottom)] sm:mt-2 sm:gap-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePanel("room")}
          className={`min-h-11 rounded-md border px-2 py-2.5 text-sm ${mobilePanel === "room" ? "border-mint/40 bg-mint/10 text-mint" : "border-line bg-white/[0.05] text-slate-200"}`}
        >
          Room
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel("participants")}
          className={`min-h-11 rounded-md border px-2 py-2.5 text-sm ${mobilePanel === "participants" ? "border-mint/40 bg-mint/10 text-mint" : "border-line bg-white/[0.05] text-slate-200"}`}
        >
          People
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel("chat")}
          className={`min-h-11 rounded-md border px-2 py-2.5 text-sm ${mobilePanel === "chat" ? "border-mint/40 bg-mint/10 text-mint" : "border-line bg-white/[0.05] text-slate-200"}`}
        >
          Chat{unreadCount ? ` (${unreadCount})` : ""}
        </button>
      </nav>
    </main>
  );
}

function RoomTimer({ createdAt }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const start = new Date(createdAt).getTime();
    if (Number.isNaN(start)) return;

    function update() {
      const diff = Math.max(0, Date.now() - start);
      const secs = Math.floor(diff / 1000);
      const mins = Math.floor(secs / 60);
      const hrs = Math.floor(mins / 60);

      const s = String(secs % 60).padStart(2, "0");
      const m = String(mins % 60).padStart(2, "0");
      const h = hrs > 0 ? `${String(hrs).padStart(2, "0")}:` : "";

      setElapsed(`${h}${m}:${s}`);
    }

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [createdAt]);

  return (
    <span className="inline-flex min-h-8 items-center gap-2 rounded-full border border-line bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-pulse" />
      <span>{elapsed}</span>
    </span>
  );
}
