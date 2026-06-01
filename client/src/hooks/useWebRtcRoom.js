import { useCallback, useEffect, useRef, useState } from "react";

const STUN_URL = import.meta.env.VITE_STUN_URL || "stun:stun.l.google.com:19302";

export function useWebRtcRoom(socket, roomId) {
  const [localStream, setLocalStream] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [peerStates, setPeerStates] = useState({});
  const peersRef = useRef(new Map());
  const audioRef = useRef(new Map());

  const setTrackEnabled = useCallback((enabled) => {
    setAudioEnabled(enabled);
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }, [localStream]);

  const ensureMedia = useCallback(async () => {
    if (localStream) return localStream;
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
      setLocalStream(stream);
      return stream;
    } catch (error) {
      setMediaError("Microphone permission is required for voice.");
      throw error;
    }
  }, [localStream]);

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

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0];
        let audio = audioRef.current.get(peerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audio.playsInline = true;
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
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { to: from, description: pc.localDescription });
    };

    const handleAnswer = async ({ from, description }) => {
      const pc = peersRef.current.get(from);
      if (pc && !pc.currentRemoteDescription) await pc.setRemoteDescription(description);
    };

    const handleIce = async ({ from, candidate }) => {
      const pc = peersRef.current.get(from);
      if (pc && candidate) await pc.addIceCandidate(candidate).catch(() => {});
    };

    const handlePeerLeft = ({ id }) => {
      peersRef.current.get(id)?.close();
      peersRef.current.delete(id);
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
    const audios = audioRef.current;
    return () => {
      peers.forEach((pc) => pc.close());
      localStream?.getTracks().forEach((track) => track.stop());
      audios.forEach((audio) => audio.remove());
    };
  }, [localStream, roomId]);

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
