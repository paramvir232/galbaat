import { useCallback, useEffect, useRef, useState } from "react";

const STUN_URL = import.meta.env.VITE_STUN_URL || "stun:stun.l.google.com:19302";

export function useWebRtcRoom(socket, roomId) {
  const [localStream, setLocalStream] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [peerStates, setPeerStates] = useState({});
  const peersRef = useRef(new Map());
  const audioRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef(new Map());

  const setTrackEnabled = useCallback((enabled) => {
    setAudioEnabled(enabled);
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, []);

  const ensureMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (error) {
      setMediaError("Microphone permission is required for voice.");
      throw error;
    }
  }, []);

  const createPeer = useCallback(
    async (peerId, initiator = false) => {
      const stream = await ensureMedia();
      if (peersRef.current.has(peerId)) return peersRef.current.get(peerId);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: STUN_URL }]
      });

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc:ice-candidate", { to: peerId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        setPeerStates((current) => ({ ...current, [peerId]: pc.connectionState }));
      };

      pc.oniceconnectionstatechange = () => {
        setPeerStates((current) => ({ ...current, [peerId]: pc.iceConnectionState }));
      };

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        let audio = audioRef.current.get(peerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audio.playsInline = true;
          audio.muted = false;
          audioRef.current.set(peerId, audio);
        }
        audio.srcObject = remoteStream;
        audio.play().catch(() => {});
      };

      peersRef.current.set(peerId, pc);

      if (initiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", { to: peerId, description: pc.localDescription });
      }

      return pc;
    },
    [ensureMedia, socket]
  );

  const connectToPeers = useCallback(
    async (peers) => {
      await ensureMedia();
      peers.forEach((peer) => createPeer(peer.id, true));
    },
    [createPeer, ensureMedia]
  );

  useEffect(() => {
    if (!socket) return undefined;

    const handleOffer = async ({ from, description }) => {
      const pc = await createPeer(from, false);
      await pc.setRemoteDescription(description);
      const pendingCandidates = pendingCandidatesRef.current.get(from) || [];
      pendingCandidatesRef.current.delete(from);
      await Promise.all(pendingCandidates.map((candidate) => pc.addIceCandidate(candidate).catch(() => {})));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { to: from, description: pc.localDescription });
    };

    const handleAnswer = async ({ from, description }) => {
      const pc = peersRef.current.get(from);
      if (!pc || pc.currentRemoteDescription) return;
      await pc.setRemoteDescription(description);
      const pendingCandidates = pendingCandidatesRef.current.get(from) || [];
      pendingCandidatesRef.current.delete(from);
      await Promise.all(pendingCandidates.map((candidate) => pc.addIceCandidate(candidate).catch(() => {})));
    };

    const handleIce = async ({ from, candidate }) => {
      const pc = peersRef.current.get(from);
      if (!candidate) return;
      if (!pc || !pc.remoteDescription) {
        const pending = pendingCandidatesRef.current.get(from) || [];
        pending.push(candidate);
        pendingCandidatesRef.current.set(from, pending);
        return;
      }
      await pc.addIceCandidate(candidate).catch(() => {});
    };

    const handlePeerLeft = ({ id }) => {
      peersRef.current.get(id)?.close();
      peersRef.current.delete(id);
      pendingCandidatesRef.current.delete(id);
      audioRef.current.get(id)?.remove();
      audioRef.current.delete(id);
      setPeerStates((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    };

    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIce);
    socket.on("webrtc:peer-left", handlePeerLeft);

    return () => {
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleIce);
      socket.off("webrtc:peer-left", handlePeerLeft);
    };
  }, [createPeer, socket]);

  useEffect(() => {
    const peers = peersRef.current;
    const pendingCandidates = pendingCandidatesRef.current;
    const audios = audioRef.current;
    return () => {
      peers.forEach((pc) => pc.close());
      peers.clear();
      pendingCandidates.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      audios.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      });
      audios.clear();
    };
  }, [roomId]);

  return {
    ensureMedia,
    connectToPeers,
    setTrackEnabled,
    audioEnabled,
    localStream,
    mediaError,
    peerStates
  };
}
