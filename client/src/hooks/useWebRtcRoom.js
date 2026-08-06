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
  const microphoneSendersRef = useRef(new Map());
  const audioRef = useRef(new Map());
  const volumeRef = useRef(new Map());
  const peerStreamsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef(new Map());
  const negotiatingRef = useRef(new Set());
  const negotiationQueueRef = useRef(new Set());
  const creatingPeersRef = useRef(new Map());
  const pendingOffersRef = useRef(new Map());
  const recoveryTimersRef = useRef(new Map());
  const [tabAudioSharing, setTabAudioSharing] = useState(false);
  const tabAudioTrackRef = useRef(null);
  const tabAudioSendersRef = useRef(new Map());
  const displayAudioStreamRef = useRef(null);
  const screenShareTrackRef = useRef(null);
  const microphoneTrackRef = useRef(null);
  const outgoingAudioTrackRef = useRef(null);
  const voiceContextRef = useRef(null);
  const voiceInputRef = useRef(null);
  const voiceDestinationRef = useRef(null);
  const voiceNodesRef = useRef([]);
  const [voiceEffect, setVoiceEffectState] = useState("none");

  const setTrackEnabled = useCallback((enabled) => {
    setAudioEnabled(enabled);
    const microphoneTrack = microphoneTrackRef.current || localStreamRef.current?.getAudioTracks()[0];
    if (microphoneTrack) microphoneTrack.enabled = enabled;
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
      microphoneTrackRef.current = stream.getAudioTracks()[0] || null;
      outgoingAudioTrackRef.current = microphoneTrackRef.current;
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (error) {
      setMediaError("Microphone permission is required for voice.");
      throw error;
    }
  }, []);

  const setVoiceEffect = useCallback(async (effect = "none") => {
    if (effect === "none" && !localStreamRef.current) {
      setVoiceEffectState("none");
      return;
    }
    const stream = await ensureMedia();
    const microphoneTrack = microphoneTrackRef.current || stream.getAudioTracks()[0];
    if (!microphoneTrack) throw new Error("Microphone is unavailable");

    const clearVoiceGraph = () => {
      voiceNodesRef.current.forEach((node) => {
        node.disconnect();
        node.stop?.();
      });
      voiceNodesRef.current = [];
      voiceInputRef.current?.disconnect();
    };

    let outgoingTrack = microphoneTrack;
    if (effect !== "none") {
      if (!voiceContextRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) throw new Error("Voice effects are not supported in this browser");
        const context = new AudioContext({ latencyHint: "interactive" });
        const input = context.createGain();
        const destination = context.createMediaStreamDestination();
        const source = context.createMediaStreamSource(new MediaStream([microphoneTrack]));
        source.connect(input);
        voiceContextRef.current = context;
        voiceInputRef.current = input;
        voiceDestinationRef.current = destination;
      }

      const context = voiceContextRef.current;
      const input = voiceInputRef.current;
      const destination = voiceDestinationRef.current;
      clearVoiceGraph();

      const register = (...nodes) => {
        voiceNodesRef.current.push(...nodes);
        return nodes;
      };
      const filter = (type, frequency, gain = 0, q = 0.8) => {
        const node = context.createBiquadFilter();
        node.type = type;
        node.frequency.value = frequency;
        node.gain.value = gain;
        node.Q.value = q;
        return node;
      };
      const connect = (...nodes) => {
        input.connect(nodes[0]);
        nodes.reduce((previous, node) => {
          if (previous !== node) previous.connect(node);
          return node;
        });
        nodes[nodes.length - 1].connect(destination);
        register(...nodes);
      };

      if (effect === "metallic") {
        const highPass = filter("highpass", 180);
        const delay = context.createDelay(0.08);
        const feedback = context.createGain();
        delay.delayTime.value = 0.028;
        feedback.gain.value = 0.34;
        input.connect(highPass).connect(delay).connect(destination);
        delay.connect(feedback).connect(delay);
        register(highPass, delay, feedback);
      } else if (effect === "robot" || effect === "alien") {
        const gain = context.createGain();
        const oscillator = context.createOscillator();
        gain.gain.value = 0.56;
        oscillator.type = "square";
        oscillator.frequency.value = effect === "robot" ? 72 : 28;
        oscillator.connect(gain.gain);
        oscillator.start();
        input.connect(gain).connect(destination);
        register(gain, oscillator);
      } else if (effect === "echo") {
        const delay = context.createDelay(0.8);
        const feedback = context.createGain();
        const wet = context.createGain();
        delay.delayTime.value = 0.22;
        feedback.gain.value = 0.28;
        wet.gain.value = 0.42;
        input.connect(destination);
        input.connect(delay).connect(wet).connect(destination);
        delay.connect(feedback).connect(delay);
        register(delay, feedback, wet);
      } else if (effect === "radio") {
        connect(filter("highpass", 450, 0, 1), filter("lowpass", 2800, 0, 1));
      } else if (effect === "deep" || effect === "monster") {
        const low = filter("lowshelf", 220, effect === "monster" ? 15 : 10);
        const lowPass = filter("lowpass", effect === "monster" ? 1800 : 2800, 0, 0.7);
        connect(low, lowPass);
      } else if (effect === "high" || effect === "chipmunk" || effect === "cartoon") {
        const high = filter("highshelf", 1500, effect === "chipmunk" ? 15 : 10);
        const highPass = filter("highpass", effect === "cartoon" ? 420 : 260, 0, 0.7);
        connect(highPass, high);
      } else {
        input.connect(destination);
      }

      await context.resume().catch(() => {});
      outgoingTrack = destination.stream.getAudioTracks()[0];
    } else {
      clearVoiceGraph();
    }

    outgoingAudioTrackRef.current = outgoingTrack;
    await Promise.all(
      [...microphoneSendersRef.current.values()].map((sender) => sender.replaceTrack(outgoingTrack).catch(() => {}))
    );
    setVoiceEffectState(effect);
  }, [ensureMedia]);

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
      const recoveryTimer = recoveryTimersRef.current.get(peerId);
      if (recoveryTimer) window.clearTimeout(recoveryTimer);
      recoveryTimersRef.current.delete(peerId);
      peersRef.current.delete(peerId);
      microphoneSendersRef.current.delete(peerId);
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

  const resyncVideoToPeer = useCallback(
    async (peerId) => {
      const pc = peersRef.current.get(peerId);
      const track = liveVideoTrack(localStreamRef.current);
      if (!pc || pc.connectionState === "closed" || !track) return;
      const sender = videoTransceiver(pc)?.sender;
      if (!sender) return;

      await sender.replaceTrack(track);
      await renegotiatePeer(peerId, pc);
    },
    [renegotiatePeer]
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
    if (displayAudioStreamRef.current) {
      displayAudioStreamRef.current.getTracks().forEach((track) => track.stop());
      displayAudioStreamRef.current = null;
    }

    // Remove track from all peers
    for (const [peerId, pc] of peersRef.current.entries()) {
      const sender = tabAudioSendersRef.current.get(peerId);
      if (sender && pc.connectionState !== "closed") {
        try {
          pc.removeTrack(sender);
        } catch (err) {
          window.console.error(`Failed to remove tab audio track from peer ${peerId}:`, err);
        }
      }
    }
    tabAudioSendersRef.current.clear();
    setTabAudioSharing(false);
    socket?.emit("participant:music", { roomId, sharing: false });
    await renegotiateAllPeers();
  }, [renegotiateAllPeers, roomId, socket]);

  const startTabAudioShare = useCallback(async () => {
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      });
      const [audioTrack] = displayStream.getAudioTracks();
      if (!audioTrack) {
        displayStream.getTracks().forEach((track) => track.stop());
        throw new Error("You must select a tab and check 'Share tab audio'.");
      }

      // Stop video tracks immediately — we only need audio.
      // This prevents the browser "Stop sharing" bar from showing up,
      // which would kill ALL tracks (including audio) if the user clicks it.
      displayStream.getVideoTracks().forEach((track) => track.stop());

      displayAudioStreamRef.current = displayStream;
      tabAudioTrackRef.current = audioTrack;

      audioTrack.onended = () => {
        stopTabAudioShare().catch(() => {});
      };

      // Create a dedicated stream for the tab audio track so receivers
      // get it as a separate stream and don't overwrite the mic audio element.
      const tabAudioStream = new MediaStream([audioTrack]);

      // Add track to all active peers
      for (const [peerId, pc] of peersRef.current.entries()) {
        if (pc.connectionState !== "closed") {
          try {
            const sender = pc.addTrack(audioTrack, tabAudioStream);
            tabAudioSendersRef.current.set(peerId, sender);
          } catch (err) {
            window.console.error(`Failed to add tab audio track to peer ${peerId}:`, err);
          }
        }
      }

      setTabAudioSharing(true);
      socket?.emit("participant:music", { roomId, sharing: true });
      await renegotiateAllPeers();
    } catch (error) {
      if (error.name === "NotAllowedError") {
        setMediaError("Screen/tab share permission is required.");
      } else {
        setMediaError(error.message);
      }
      throw error;
    }
  }, [renegotiateAllPeers, roomId, socket, stopTabAudioShare]);

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
      // If the user opted in to share audio, forward it to all peers.
      // If they chose not to (no audio track), screen share still works fine.
      if (audioTrack) {
        tabAudioTrackRef.current = audioTrack;
        audioTrack.onended = () => {
          stopTabAudioShare().catch(() => {});
        };
        await syncDisplayAudioTrackToPeers(audioTrack);
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



  const createPeerInner = useCallback(
    async (peerId, initiator = false) => {
      const stream = await ensureMedia();
      if (peersRef.current.has(peerId)) return peersRef.current.get(peerId);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: STUN_URL }]
      });
      // Only the peer selected by the room handshake can create the first offer.
      pc.__galbaatCanOffer = Boolean(initiator);

      const microphoneTrack = outgoingAudioTrackRef.current || stream.getAudioTracks()[0];
      if (microphoneTrack) {
        const sender = pc.addTrack(microphoneTrack, microphoneTrack === microphoneTrackRef.current ? stream : new MediaStream([microphoneTrack]));
        microphoneSendersRef.current.set(peerId, sender);
      }
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

      const scheduleIceRecovery = () => {
        const previousTimer = recoveryTimersRef.current.get(peerId);
        if (previousTimer) window.clearTimeout(previousTimer);
        const timer = window.setTimeout(() => {
          recoveryTimersRef.current.delete(peerId);
          if (peersRef.current.get(peerId) !== pc || pc.connectionState === "closed") return;
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
            pc.restartIce?.();
            renegotiatePeer(peerId, pc).catch(() => {});
          }
        }, 3000);
        recoveryTimersRef.current.set(peerId, timer);
      };

      const clearIceRecovery = () => {
        const timer = recoveryTimersRef.current.get(peerId);
        if (timer) window.clearTimeout(timer);
        recoveryTimersRef.current.delete(peerId);
      };

      pc.onconnectionstatechange = () => {
        setPeerStates((current) => ({ ...current, [peerId]: pc.connectionState }));
        if (pc.connectionState === "connected") clearIceRecovery();
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") scheduleIceRecovery();
      };

      pc.oniceconnectionstatechange = () => {
        setPeerStates((current) => ({ ...current, [peerId]: pc.iceConnectionState }));
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") clearIceRecovery();
        if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") scheduleIceRecovery();
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
    async (peers) => {
      await ensureMedia();
      await Promise.all(
        peers
          .filter((peer) => peer?.id && peer.id !== socket.id)
          .map((peer) => createPeer(peer.id, socket.id > peer.id))
      );
    },
    [createPeer, ensureMedia, socket.id]
  );

  const processPendingOffer = useCallback(
    async (from) => {
      const pending = pendingOffersRef.current.get(from);
      pendingOffersRef.current.delete(from);
      if (!pending) return;
      const pc = peersRef.current.get(from);
      if (!pc || pc.connectionState === "closed") return;

      const isPolite = socket.id < from;
      const offerCollision = pending.type === "offer" && (negotiatingRef.current.has(from) || pc.signalingState !== "stable");

      if (offerCollision) {
        if (!isPolite) {
          // Impolite peer ignores the incoming offer
          return;
        }
        // Polite peer rolls back its local offer
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
      const isPolite = socket.id < from;
      const offerCollision = description.type === "offer" && (negotiatingRef.current.has(from) || pc.signalingState !== "stable");

      if (offerCollision) {
        if (!isPolite) {
          // Impolite peer ignores the incoming offer
          return;
        }
        // Polite peer rolls back its local offer
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

    const handleVideoSyncRequest = ({ from }) => {
      resyncVideoToPeer(from).catch(() => {});
    };

    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIce);
    socket.on("webrtc:peer-left", handlePeerLeft);
    socket.on("webrtc:video-sync-request", handleVideoSyncRequest);

    return () => {
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleIce);
      socket.off("webrtc:peer-left", handlePeerLeft);
      socket.off("webrtc:video-sync-request", handleVideoSyncRequest);
    };
  }, [createPeer, processPendingOffer, removePeer, renegotiatePeer, resyncVideoToPeer, socket]);

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
    const recoveryTimers = recoveryTimersRef.current;
    const microphoneSenders = microphoneSendersRef.current;
    return () => {
      peers.forEach((pc) => pc.close());
      peers.clear();
      microphoneSenders.clear();
      pendingCandidates.clear();
      negotiating.clear();
      negotiationQueue.clear();
      recoveryTimers.forEach((timer) => window.clearTimeout(timer));
      recoveryTimers.clear();
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
      voiceNodesRef.current.forEach((node) => {
        node.disconnect();
        node.stop?.();
      });
      voiceNodesRef.current = [];
      voiceDestinationRef.current?.stream.getTracks().forEach((track) => track.stop());
      voiceContextRef.current?.close().catch(() => {});
      voiceContextRef.current = null;
      voiceInputRef.current = null;
      voiceDestinationRef.current = null;
      microphoneTrackRef.current = null;
      outgoingAudioTrackRef.current = null;
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
    setVoiceEffect,
    audioEnabled,
    voiceEffect,
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
