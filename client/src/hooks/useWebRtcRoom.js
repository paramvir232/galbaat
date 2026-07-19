import { useCallback, useEffect, useRef, useState } from "react";

const STUN_URL = import.meta.env.VITE_STUN_URL || "stun:stun.l.google.com:19302";

function liveVideoTrack(stream) {
  return stream?.getVideoTracks().find((track) => track.readyState === "live") || null;
}

function videoTransceiver(pc) {
  return pc.getTransceivers().find((transceiver) => transceiver.receiver?.track?.kind === "video" || transceiver.sender?.track?.kind === "video");
}

function displayMediaConstraints() {
  return {
    video: true,
    audio: true,
    systemAudio: "include",
    surfaceSwitching: "include"
  };
}

export function useWebRtcRoom(socket, roomId) {
  const [localStream, setLocalStream] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [peerStates, setPeerStates] = useState({});
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const peersRef = useRef(new Map());
  const audioRef = useRef(new Map());
  const volumeRef = useRef(new Map());
  const peerStreamsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef(new Map());
  const negotiatingRef = useRef(new Set());
  const negotiationQueueRef = useRef(new Set());
  const creatingPeersRef = useRef(new Map());
  const pendingOffersRef = useRef(new Map());
  const [tabAudioSharing, setTabAudioSharing] = useState(false);
  const tabAudioTrackRef = useRef(null);
  const tabAudioSendersRef = useRef(new Map());
  const displayAudioStreamRef = useRef(null);
  const screenShareTrackRef = useRef(null);

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
      const peerAudios = audioRef.current.get(peerId);
      peerAudios?.forEach((audio) => {
        audio.pause();
        audio.srcObject = null;
        audio.remove();
      });
      audioRef.current.delete(peerId);
      volumeRef.current.delete(peerId);
      tabAudioSendersRef.current.delete(peerId);
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

  const playRemoteAudios = useCallback(() => {
    audioRef.current.forEach((peerAudios) => {
      peerAudios.forEach((audio) => {
        audio.play().catch(() => {});
      });
    });
    setAutoplayBlocked(false);
  }, []);

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
      if (needsNegotiation || track) await renegotiateAllPeers();
    },
    [renegotiateAllPeers]
  );

  const syncDisplayAudioTrackToPeers = useCallback(
    async (audioTrack) => {
      if (!audioTrack) return;

      await Promise.all(
        [...peersRef.current.entries()].map(async ([peerId, pc]) => {
          if (pc.connectionState === "closed") return;
          const existingSender = tabAudioSendersRef.current.get(peerId);
          if (existingSender) {
            await existingSender.replaceTrack(audioTrack);
            return;
          }

          // Keep shared display audio separate from the microphone sender.
          const sender = pc.addTrack(audioTrack, new MediaStream([audioTrack]));
          tabAudioSendersRef.current.set(peerId, sender);
        })
      );
      await renegotiateAllPeers();
    },
    [renegotiateAllPeers]
  );

  const stopTabAudioShare = useCallback(async () => {
    const audioTrack = tabAudioTrackRef.current;
    tabAudioTrackRef.current = null;
    if (audioTrack) {
      audioTrack.onended = null;
      audioTrack.stop();
    }

    // This stream is used only by the standalone music-share picker.
    displayAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
    displayAudioStreamRef.current = null;

    for (const [peerId, pc] of peersRef.current.entries()) {
      const sender = tabAudioSendersRef.current.get(peerId);
      if (sender && pc.connectionState !== "closed") {
        try {
          pc.removeTrack(sender);
        } catch (err) {
          window.console.error(`Failed to remove shared audio from peer ${peerId}:`, err);
        }
      }
    }
    tabAudioSendersRef.current.clear();
    setTabAudioSharing(false);
    await renegotiateAllPeers();
  }, [renegotiateAllPeers]);

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
      screenShareTrackRef.current = null;
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

    const stoppingScreenShare = videoTracks.some((track) => track === screenShareTrackRef.current);
    if (stoppingScreenShare && tabAudioTrackRef.current) {
      await stopTabAudioShare();
    }

    await syncVideoTrackToPeers(null);

    videoTracks.forEach((track) => {
      stream.removeTrack(track);
      track.stop();
    });

    screenShareTrackRef.current = null;
    setVideoEnabled(false);
    setScreenSharing(false);
    refreshLocalStreamState();
  }, [refreshLocalStreamState, stopTabAudioShare, syncVideoTrackToPeers]);

  const startScreenShare = useCallback(async () => {
    const stream = await ensureMedia();
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints());
      const [screenTrack] = displayStream.getVideoTracks();
      if (!screenTrack) return;
      const [audioTrack] = displayStream.getAudioTracks();

      stream.getVideoTracks().forEach((track) => {
        stream.removeTrack(track);
        track.stop();
      });
      screenShareTrackRef.current = screenTrack;
      stream.addTrack(screenTrack);

      await syncVideoTrackToPeers(screenTrack);
      if (audioTrack) {
        tabAudioTrackRef.current = audioTrack;
        audioTrack.onended = () => {
          stopTabAudioShare().catch(() => {});
        };
        await syncDisplayAudioTrackToPeers(audioTrack);
        setTabAudioSharing(true);
      } else {
        setMediaError("No audio was shared. Enable the audio option for the selected tab, window, or screen.");
      }
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
  }, [ensureMedia, refreshLocalStreamState, stopTabAudioShare, stopVideo, syncDisplayAudioTrackToPeers, syncVideoTrackToPeers]);

  const startTabAudioShare = useCallback(async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints());
      const [audioTrack] = displayStream.getAudioTracks();
      if (!audioTrack) {
        displayStream.getTracks().forEach((track) => track.stop());
        throw new Error("Enable the audio option for the selected tab, window, or screen.");
      }

      displayAudioStreamRef.current = displayStream;
      tabAudioTrackRef.current = audioTrack;

      audioTrack.onended = () => {
        stopTabAudioShare().catch(() => {});
      };

      await syncDisplayAudioTrackToPeers(audioTrack);
      setTabAudioSharing(true);
    } catch (error) {
      if (error.name === "NotAllowedError") {
        setMediaError("Screen/tab share permission is required.");
      } else {
        setMediaError(error.message);
      }
      throw error;
    }
  }, [stopTabAudioShare, syncDisplayAudioTrackToPeers]);

  const createPeerInner = useCallback(
    async (peerId, initiator = false) => {
      const stream = await ensureMedia();
      if (peersRef.current.has(peerId)) return peersRef.current.get(peerId);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: STUN_URL }]
      });
      // Only the peer selected by the room handshake can create the first offer.
      pc.__galbaatCanOffer = Boolean(initiator);

      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
      if (tabAudioTrackRef.current) {
        try {
          const sender = pc.addTrack(tabAudioTrackRef.current, new MediaStream([tabAudioTrackRef.current]));
          tabAudioSendersRef.current.set(peerId, sender);
        } catch (err) {
          window.console.error(`Failed to add tab audio to new peer ${peerId}:`, err);
        }
      }
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
        if (pc.__galbaatCanOffer) {
          renegotiatePeer(peerId, pc).catch(() => {});
        }
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
        event.track.onunmute = () => {
          refreshRemoteStreamsState();
          if (event.track.kind === "audio") playRemoteAudios();
        };
        refreshRemoteStreamsState();

        if (event.track.kind === "audio") {
          let peerAudios = audioRef.current.get(peerId);
          if (!peerAudios) {
            peerAudios = new Map();
            audioRef.current.set(peerId, peerAudios);
          }
          let audio = peerAudios.get(event.track.id);
          if (!audio) {
            audio = new Audio();
            audio.autoplay = true;
            audio.playsInline = true;
            audio.muted = false;
            audio.style.display = "none";
            document.body.appendChild(audio);
            audio.volume = volumeRef.current.get(peerId) ?? 1;
            peerAudios.set(event.track.id, audio);
          }
          audio.srcObject = new MediaStream([event.track]);
          audio.play().catch((err) => {
            if (err.name === "NotAllowedError") {
              setAutoplayBlocked(true);
            }
          });

          event.track.addEventListener(
            "ended",
            () => {
              const currentPeerAudios = audioRef.current.get(peerId);
              const endedAudio = currentPeerAudios?.get(event.track.id);
              if (!endedAudio) return;
              endedAudio.pause();
              endedAudio.srcObject = null;
              endedAudio.remove();
              currentPeerAudios.delete(event.track.id);
              if (!currentPeerAudios.size) audioRef.current.delete(peerId);
            },
            { once: true }
          );
        }
      };

      peersRef.current.set(peerId, pc);

      if (initiator) {
        await renegotiatePeer(peerId, pc);
      }

      return pc;
    },
    [ensureMedia, playRemoteAudios, refreshRemoteStreamsState, renegotiatePeer, socket]
  );

  const createPeer = useCallback(
    async (peerId, initiator = false) => {
      const enableInitialOffer = async (pc) => {
        if (!initiator || pc.__galbaatCanOffer) return;
        pc.__galbaatCanOffer = true;
        if (pc.signalingState === "stable" && !pc.localDescription && !pc.remoteDescription) {
          await renegotiatePeer(peerId, pc);
        }
      };

      const activePeer = peersRef.current.get(peerId);
      if (activePeer) {
        await enableInitialOffer(activePeer);
        if (initiator && activePeer.connectionState !== "closed" && (activePeer.connectionState === "disconnected" || activePeer.iceConnectionState === "disconnected")) {
          activePeer.restartIce?.();
          renegotiatePeer(peerId, activePeer).catch(() => {});
        }
        return activePeer;
      }

      const existing = creatingPeersRef.current.get(peerId);
      if (existing) {
        const pc = await existing;
        await enableInitialOffer(pc);
        if (initiator && pc.connectionState !== "closed" && (pc.connectionState === "disconnected" || pc.iceConnectionState === "disconnected")) {
          pc.restartIce?.();
          renegotiatePeer(peerId, pc).catch(() => {});
        }
        return pc;
      }

      const promise = createPeerInner(peerId, initiator);
      creatingPeersRef.current.set(peerId, promise);
      try {
        const pc = await promise;
        return pc;
      } finally {
        creatingPeersRef.current.delete(peerId);
      }
    },
    [createPeerInner, renegotiatePeer]
  );

  const connectToPeers = useCallback(
    async (peers, initiator = true) => {
      await ensureMedia();
      await Promise.all(peers.map((peer) => createPeer(peer.id, initiator)));
    },
    [createPeer, ensureMedia]
  );

  const processPendingOffer = useCallback(
    async (from) => {
      const pending = pendingOffersRef.current.get(from);
      pendingOffersRef.current.delete(from);
      if (!pending) return;
      const pc = peersRef.current.get(from);
      if (!pc || pc.connectionState === "closed") return;
      if (pc.signalingState !== "stable") {
        await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
      }
      await pc.setRemoteDescription(pending);
      const pendingCandidates = pendingCandidatesRef.current.get(from) || [];
      pendingCandidatesRef.current.delete(from);
      await Promise.all(pendingCandidates.map((candidate) => pc.addIceCandidate(candidate).catch(() => {})));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      pc.__galbaatCanOffer = true;
      socket.emit("webrtc:answer", { to: from, description: pc.localDescription });

      if (negotiationQueueRef.current.delete(from)) {
        renegotiatePeer(from, pc).catch(() => {});
      }
    },
    [renegotiatePeer, socket]
  );

  useEffect(() => {
    if (!socket) return undefined;

    const handleOffer = async ({ from, description }) => {
      if (creatingPeersRef.current.has(from)) {
        pendingOffersRef.current.set(from, description);
        await creatingPeersRef.current.get(from).catch(() => {});
        await processPendingOffer(from);
        return;
      }
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
      pc.__galbaatCanOffer = true;
      socket.emit("webrtc:answer", { to: from, description: pc.localDescription });

      if (negotiationQueueRef.current.delete(from)) {
        renegotiatePeer(from, pc).catch(() => {});
      }
    };

    const handleAnswer = async ({ from, description }) => {
      if (creatingPeersRef.current.has(from)) {
        await creatingPeersRef.current.get(from).catch(() => {});
      }
      const pc = peersRef.current.get(from);
      if (!pc || pc.signalingState !== "have-local-offer") return;
      await pc.setRemoteDescription(description);
      const pendingCandidates = pendingCandidatesRef.current.get(from) || [];
      pendingCandidatesRef.current.delete(from);
      await Promise.all(pendingCandidates.map((candidate) => pc.addIceCandidate(candidate).catch(() => {})));

      if (negotiationQueueRef.current.delete(from)) {
        renegotiatePeer(from, pc).catch(() => {});
      }
    };

    const handleIce = async ({ from, candidate }) => {
      if (!candidate) return;
      if (creatingPeersRef.current.has(from)) {
        await creatingPeersRef.current.get(from).catch(() => {});
      }
      const pc = peersRef.current.get(from);
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
  }, [createPeer, processPendingOffer, removePeer, renegotiatePeer, socket]);

  const setPeerVolume = useCallback((peerId, volume) => {
    const nextVolume = Math.max(0, Math.min(1, Number(volume)));
    volumeRef.current.set(peerId, nextVolume);
    audioRef.current.get(peerId)?.forEach((audio) => {
      audio.volume = nextVolume;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("pointerdown", playRemoteAudios);
    window.addEventListener("keydown", playRemoteAudios);
    window.addEventListener("click", playRemoteAudios);
    window.addEventListener("touchstart", playRemoteAudios);
    return () => {
      window.removeEventListener("pointerdown", playRemoteAudios);
      window.removeEventListener("keydown", playRemoteAudios);
      window.removeEventListener("click", playRemoteAudios);
      window.removeEventListener("touchstart", playRemoteAudios);
    };
  }, [playRemoteAudios]);

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
      audios.forEach((peerAudios) => {
        peerAudios.forEach((audio) => {
          audio.pause();
          audio.srcObject = null;
          audio.remove();
        });
      });
      audios.clear();
      displayAudioStreamRef.current?.getTracks().forEach((track) => track.stop());
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
    startTabAudioShare,
    stopTabAudioShare,
    setPeerVolume,
    audioEnabled,
    videoEnabled,
    screenSharing,
    tabAudioSharing,
    localStream,
    remoteStreams,
    mediaError,
    autoplayBlocked,
    peerStates
  };
}
