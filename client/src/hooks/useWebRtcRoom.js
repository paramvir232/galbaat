import { useCallback, useEffect, useRef, useState } from "react";

const STUN_URL = import.meta.env.VITE_STUN_URL || "stun:stun.l.google.com:19302";

export function useWebRtcRoom(socket, roomId) {
  const [localStream, setLocalStream] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [peerStates, setPeerStates] = useState({});
  const [remoteStreams, setRemoteStreams] = useState([]);
  const peersRef = useRef(new Map());
  const audioRef = useRef(new Map());
  const volumeRef = useRef(new Map());
  const peerStreamsRef = useRef(new Map());
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

  const refreshLocalStreamState = useCallback(() => {
    if (!localStreamRef.current) {
      setLocalStream(null);
      return;
    }
    setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
  }, []);

  const refreshRemoteStreamsState = useCallback(() => {
    setRemoteStreams(
      [...peerStreamsRef.current.entries()].map(([peerId, stream]) => ({
        peerId,
        stream
      }))
    );
  }, []);

  const removePeer = useCallback(
    (peerId) => {
      peersRef.current.get(peerId)?.close();
      peersRef.current.delete(peerId);
      pendingCandidatesRef.current.delete(peerId);
      peerStreamsRef.current.delete(peerId);
      const audio = audioRef.current.get(peerId);
      if (audio) {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      }
      audioRef.current.delete(peerId);
      volumeRef.current.delete(peerId);
      setPeerStates((current) => {
        const next = { ...current };
        delete next[peerId];
        return next;
      });
      refreshRemoteStreamsState();
    },
    [refreshRemoteStreamsState]
  );

  const syncPeers = useCallback(
    (activePeerIds) => {
      const active = new Set(activePeerIds);
      [...peersRef.current.keys()].forEach((peerId) => {
        if (!active.has(peerId)) removePeer(peerId);
      });
    },
    [removePeer]
  );

  const renegotiatePeer = useCallback(
    async (peerId, pc) => {
      if (pc.signalingState !== "stable") return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { to: peerId, description: pc.localDescription });
    },
    [socket]
  );

  const renegotiateAllPeers = useCallback(async () => {
    await Promise.all([...peersRef.current.entries()].map(([peerId, pc]) => renegotiatePeer(peerId, pc).catch(() => {})));
  }, [renegotiatePeer]);

  const startVideo = useCallback(async () => {
    const stream = await ensureMedia();
    if (stream.getVideoTracks().some((track) => track.readyState === "live")) {
      setVideoEnabled(true);
      return;
    }

    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        }
      });
      const [videoTrack] = cameraStream.getVideoTracks();
      if (!videoTrack) return;

      stream.addTrack(videoTrack);
      let needsNegotiation = false;
      await Promise.all(
        [...peersRef.current.values()].map(async (pc) => {
          const sender = pc.getSenders().find((item) => item.track?.kind === "video" || item.track === null);
          if (sender) {
            await sender.replaceTrack(videoTrack);
            return;
          }
          pc.addTrack(videoTrack, stream);
          needsNegotiation = true;
        })
      );
      setVideoEnabled(true);
      refreshLocalStreamState();
      if (needsNegotiation) await renegotiateAllPeers();
    } catch (error) {
      setMediaError("Camera permission is required for video.");
      throw error;
    }
  }, [ensureMedia, refreshLocalStreamState, renegotiateAllPeers]);

  const stopVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    const videoTracks = stream?.getVideoTracks() || [];
    if (!stream || !videoTracks.length) {
      setVideoEnabled(false);
      return;
    }

    await Promise.all(
      [...peersRef.current.values()].flatMap((pc) =>
        pc
          .getSenders()
          .filter((sender) => sender.track?.kind === "video")
          .map((sender) => sender.replaceTrack(null))
      )
    );

    videoTracks.forEach((track) => {
      stream.removeTrack(track);
      track.stop();
    });

    setVideoEnabled(false);
    setScreenSharing(false);
    refreshLocalStreamState();
  }, [refreshLocalStreamState]);

  const startScreenShare = useCallback(async () => {
    const stream = await ensureMedia();
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      const [screenTrack] = displayStream.getVideoTracks();
      if (!screenTrack) return;

      stream.getVideoTracks().forEach((track) => {
        stream.removeTrack(track);
        track.stop();
      });
      stream.addTrack(screenTrack);

      let needsNegotiation = false;
      await Promise.all(
        [...peersRef.current.values()].map(async (pc) => {
          const sender = pc.getSenders().find((item) => item.track?.kind === "video" || item.track === null);
          if (sender) {
            await sender.replaceTrack(screenTrack);
            return;
          }
          pc.addTrack(screenTrack, stream);
          needsNegotiation = true;
        })
      );
      screenTrack.onended = () => {
        stopVideo().catch(() => {});
      };
      setVideoEnabled(true);
      setScreenSharing(true);
      refreshLocalStreamState();
      if (needsNegotiation) await renegotiateAllPeers();
    } catch (error) {
      setMediaError("Screen share permission is required.");
      throw error;
    }
  }, [ensureMedia, refreshLocalStreamState, renegotiateAllPeers, stopVideo]);

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
        const displayStream = peerStreamsRef.current.get(peerId) || new MediaStream();
        if (!displayStream.getTracks().some((track) => track.id === event.track.id)) {
          displayStream.addTrack(event.track);
        }
        peerStreamsRef.current.set(peerId, displayStream);
        displayStream.onremovetrack = refreshRemoteStreamsState;
        event.track.onended = refreshRemoteStreamsState;
        refreshRemoteStreamsState();

        let audio = audioRef.current.get(peerId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audio.playsInline = true;
          audio.muted = false;
          audio.volume = volumeRef.current.get(peerId) ?? 1;
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
    [ensureMedia, refreshRemoteStreamsState, socket]
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
      if (pc.signalingState !== "stable") {
        await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
      }
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
      if (!pc || pc.signalingState !== "have-local-offer") return;
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
      removePeer(id);
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
  }, [createPeer, removePeer, socket]);

  const setPeerVolume = useCallback((peerId, volume) => {
    const nextVolume = Math.max(0, Math.min(1, Number(volume)));
    volumeRef.current.set(peerId, nextVolume);
    const audio = audioRef.current.get(peerId);
    if (audio) audio.volume = nextVolume;
  }, []);

  useEffect(() => {
    const peers = peersRef.current;
    const pendingCandidates = pendingCandidatesRef.current;
    const audios = audioRef.current;
    const peerStreams = peerStreamsRef.current;
    return () => {
      peers.forEach((pc) => pc.close());
      peers.clear();
      pendingCandidates.clear();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      peerStreams.clear();
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
    syncPeers,
    setTrackEnabled,
    startVideo,
    stopVideo,
    startScreenShare,
    setPeerVolume,
    audioEnabled,
    videoEnabled,
    screenSharing,
    localStream,
    remoteStreams,
    mediaError,
    peerStates
  };
}
