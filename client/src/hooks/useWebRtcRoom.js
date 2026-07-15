import { useCallback, useEffect, useRef, useState } from "react";

const STUN_URL = import.meta.env.VITE_STUN_URL || "stun:stun.l.google.com:19302";

function liveVideoTrack(stream) {
  return stream?.getVideoTracks().find((track) => track.readyState === "live") || null;
}

function videoTransceiver(pc) {
  return pc.getTransceivers().find((transceiver) => transceiver.receiver?.track?.kind === "video" || transceiver.sender?.track?.kind === "video");
}

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
  const negotiatingRef = useRef(new Set());
  const negotiationQueueRef = useRef(new Set());

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
      if (!pc || pc.connectionState === "closed") return;
      if (pc.signalingState !== "stable" || negotiatingRef.current.has(peerId)) {
        negotiationQueueRef.current.add(peerId);
        return;
      }

      negotiatingRef.current.add(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", { to: peerId, description: pc.localDescription });
      } finally {
        negotiatingRef.current.delete(peerId);
        if (negotiationQueueRef.current.delete(peerId)) {
          window.setTimeout(() => renegotiatePeer(peerId, pc).catch(() => {}), 0);
        }
      }
    },
    [socket]
  );

  const renegotiateAllPeers = useCallback(async () => {
    await Promise.all([...peersRef.current.entries()].map(([peerId, pc]) => renegotiatePeer(peerId, pc).catch(() => {})));
  }, [renegotiatePeer]);

  const syncVideoTrackToPeers = useCallback(
    async (track) => {
      let needsNegotiation = false;
      await Promise.all(
        [...peersRef.current.values()].map(async (pc) => {
          let transceiver = videoTransceiver(pc);
          if (!transceiver) {
            transceiver = pc.addTransceiver("video", { direction: "sendrecv" });
            needsNegotiation = true;
          }
          await transceiver.sender.replaceTrack(track || null);
        })
      );
      if (needsNegotiation) await renegotiateAllPeers();
    },
    [renegotiateAllPeers]
  );

  const startVideo = useCallback(async () => {
    const stream = await ensureMedia();
    const existingVideoTrack = liveVideoTrack(stream);
    if (existingVideoTrack) {
      await syncVideoTrackToPeers(existingVideoTrack);
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

      stream.getVideoTracks().forEach((track) => {
        stream.removeTrack(track);
        track.stop();
      });
      stream.addTrack(videoTrack);
      await syncVideoTrackToPeers(videoTrack);
      setVideoEnabled(true);
      refreshLocalStreamState();
    } catch (error) {
      setMediaError("Camera permission is required for video.");
      throw error;
    }
  }, [ensureMedia, refreshLocalStreamState, syncVideoTrackToPeers]);

  const stopVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    const videoTracks = stream?.getVideoTracks() || [];
    if (!stream || !videoTracks.length) {
      setVideoEnabled(false);
      return;
    }

    await syncVideoTrackToPeers(null);

    videoTracks.forEach((track) => {
      stream.removeTrack(track);
      track.stop();
    });

    setVideoEnabled(false);
    setScreenSharing(false);
    refreshLocalStreamState();
  }, [refreshLocalStreamState, syncVideoTrackToPeers]);

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

      await syncVideoTrackToPeers(screenTrack);
      screenTrack.onended = () => {
        stopVideo().catch(() => {});
      };
      setVideoEnabled(true);
      setScreenSharing(true);
      refreshLocalStreamState();
    } catch (error) {
      setMediaError("Screen share permission is required.");
      throw error;
    }
  }, [ensureMedia, refreshLocalStreamState, stopVideo, syncVideoTrackToPeers]);

  const createPeer = useCallback(
    async (peerId, initiator = false) => {
      const stream = await ensureMedia();
      const existingPeer = peersRef.current.get(peerId);
      if (existingPeer) {
        if (existingPeer.connectionState === "closed" || existingPeer.connectionState === "failed" || existingPeer.iceConnectionState === "failed") {
          removePeer(peerId);
        } else {
          if (initiator && !existingPeer.__galbaatCanOffer) {
            existingPeer.__galbaatCanOffer = true;
            if (existingPeer.signalingState === "stable" && !existingPeer.localDescription && !existingPeer.remoteDescription) {
              await renegotiatePeer(peerId, existingPeer);
            }
          }
          if (initiator && (existingPeer.connectionState === "disconnected" || existingPeer.iceConnectionState === "disconnected")) {
            existingPeer.restartIce?.();
            renegotiatePeer(peerId, existingPeer).catch(() => {});
          }
          return existingPeer;
        }
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: STUN_URL }]
      });
      pc.__galbaatCanOffer = initiator;

      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
      const initialVideoTransceiver = pc.addTransceiver("video", { direction: "sendrecv" });
      const currentVideoTrack = liveVideoTrack(stream);
      if (currentVideoTrack) {
        await initialVideoTransceiver.sender.replaceTrack(currentVideoTrack);
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc:ice-candidate", { to: peerId, candidate: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        setPeerStates((current) => ({ ...current, [peerId]: pc.connectionState }));
        if (pc.connectionState === "failed") {
          pc.restartIce?.();
          renegotiatePeer(peerId, pc).catch(() => {});
        }
      };

      pc.oniceconnectionstatechange = () => {
        setPeerStates((current) => ({ ...current, [peerId]: pc.iceConnectionState }));
        if (pc.iceConnectionState === "failed") {
          pc.restartIce?.();
          renegotiatePeer(peerId, pc).catch(() => {});
        }
      };

      pc.onnegotiationneeded = () => {
        if (!pc.__galbaatCanOffer) return;
        renegotiatePeer(peerId, pc).catch(() => {});
      };

      pc.ontrack = (event) => {
        const displayStream = peerStreamsRef.current.get(peerId) || new MediaStream();
        if (event.track.kind === "video") {
          displayStream.getVideoTracks().forEach((track) => {
            if (track.id !== event.track.id) displayStream.removeTrack(track);
          });
        }
        if (!displayStream.getTracks().some((track) => track.id === event.track.id)) {
          displayStream.addTrack(event.track);
        }
        peerStreamsRef.current.set(peerId, displayStream);
        displayStream.onremovetrack = refreshRemoteStreamsState;
        event.track.onended = refreshRemoteStreamsState;
        event.track.onmute = refreshRemoteStreamsState;
        event.track.onunmute = refreshRemoteStreamsState;
        refreshRemoteStreamsState();

        if (event.track.kind === "audio") {
          let audio = audioRef.current.get(peerId);
          if (!audio) {
            audio = new Audio();
            audio.autoplay = true;
            audio.playsInline = true;
            audio.muted = false;
            audio.volume = volumeRef.current.get(peerId) ?? 1;
            audioRef.current.set(peerId, audio);
          }
          audio.srcObject = new MediaStream([event.track]);
          audio.play().catch(() => {});
        }
      };

      peersRef.current.set(peerId, pc);

      if (initiator) {
        await renegotiatePeer(peerId, pc);
      }

      return pc;
    },
    [ensureMedia, refreshRemoteStreamsState, removePeer, renegotiatePeer, socket]
  );

  const connectToPeers = useCallback(
    async (peers, initiator = true) => {
      await ensureMedia();
      await Promise.all(peers.map((peer) => createPeer(peer.id, peer.initiator ?? initiator)));
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
    const negotiating = negotiatingRef.current;
    const negotiationQueue = negotiationQueueRef.current;
    return () => {
      peers.forEach((pc) => pc.close());
      peers.clear();
      pendingCandidates.clear();
      negotiating.clear();
      negotiationQueue.clear();
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
