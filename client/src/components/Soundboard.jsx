import { useCallback, useEffect, useRef, useState } from "react";
import { Music, Volume2, X } from "lucide-react";

const COOLDOWN_MS = 1200;

const CATEGORIES = [
  {
    label: "Reactions",
    sounds: [
      { id: "laugh", label: "Laugh", icon: "Ha" },
      { id: "clap", label: "Clap", icon: "Cl" },
      { id: "applause", label: "Applause", icon: "Ap" }
    ]
  },
  {
    label: "Alerts",
    sounds: [
      { id: "airhorn", label: "Air horn", icon: "!" },
      { id: "whistle", label: "Whistle", icon: "Wh" },
      { id: "drumroll", label: "Drum roll", icon: "Dr" },
      { id: "boo", label: "Boo", icon: "Bo" }
    ]
  },
  {
    label: "Memes",
    sounds: [
      { id: "rimshot", label: "Rimshot", icon: "Ba" },
      { id: "tada", label: "Ta-da", icon: "Ta" }
    ]
  }
];

function makeNoiseBuffer(context, duration) {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

function scheduleTone(context, frequency, start, duration, options = {}) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = options.type || "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  if (options.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.endFrequency), start + duration);
  const level = options.gain ?? 0.13;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

function scheduleNoise(context, start, duration, options = {}) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = makeNoiseBuffer(context, duration);
  filter.type = options.filter || "bandpass";
  filter.frequency.value = options.frequency || 1300;
  filter.Q.value = options.q || 0.8;
  const level = options.gain ?? 0.12;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(start);
}

function playEffect(context, soundId) {
  const start = context.currentTime + 0.02;
  if (soundId === "laugh") {
    [0, 0.16, 0.32, 0.48].forEach((offset, index) => scheduleTone(context, 420 + (index % 2) * 95, start + offset, 0.13, { type: "sine", gain: 0.1, endFrequency: 330 }));
    return;
  }
  if (soundId === "clap") {
    [0, 0.09, 0.18].forEach((offset) => scheduleNoise(context, start + offset, 0.06, { frequency: 1800, gain: 0.16 }));
    return;
  }
  if (soundId === "applause") {
    for (let offset = 0; offset < 0.85; offset += 0.075) scheduleNoise(context, start + offset + Math.random() * 0.03, 0.07, { frequency: 1400 + Math.random() * 900, gain: 0.08 });
    return;
  }
  if (soundId === "airhorn") {
    scheduleTone(context, 330, start, 0.72, { type: "sawtooth", gain: 0.13 });
    scheduleTone(context, 415, start, 0.72, { type: "sawtooth", gain: 0.1 });
    return;
  }
  if (soundId === "whistle") {
    scheduleTone(context, 1350, start, 0.5, { type: "sine", gain: 0.11, endFrequency: 1900 });
    return;
  }
  if (soundId === "drumroll") {
    for (let offset = 0; offset < 0.75; offset += 0.055) scheduleNoise(context, start + offset, 0.045, { filter: "lowpass", frequency: 620, gain: 0.11 });
    scheduleTone(context, 120, start + 0.76, 0.22, { type: "triangle", gain: 0.15, endFrequency: 65 });
    return;
  }
  if (soundId === "boo") {
    scheduleTone(context, 180, start, 0.62, { type: "sawtooth", gain: 0.1, endFrequency: 105 });
    scheduleTone(context, 240, start + 0.05, 0.55, { type: "triangle", gain: 0.06, endFrequency: 145 });
    return;
  }
  if (soundId === "rimshot") {
    scheduleTone(context, 240, start, 0.1, { type: "square", gain: 0.09 });
    scheduleTone(context, 180, start + 0.12, 0.12, { type: "square", gain: 0.09 });
    scheduleNoise(context, start + 0.24, 0.17, { frequency: 3200, gain: 0.12 });
    return;
  }
  if (soundId === "tada") {
    [523, 659, 784, 1047].forEach((frequency, index) => scheduleTone(context, frequency, start + index * 0.1, 0.36, { type: "triangle", gain: 0.1 }));
  }
}

export default function Soundboard({ socket, roomId, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [notice, setNotice] = useState("");
  const contextRef = useRef(null);
  const popoverRef = useRef(null);
  const cooldownTimerRef = useRef(null);
  const noticeTimerRef = useRef(null);

  const getAudioContext = useCallback(() => {
    if (!contextRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      contextRef.current = new AudioContext();
    }
    return contextRef.current;
  }, []);

  const unlockAudio = useCallback(async () => {
    const context = getAudioContext();
    if (context?.state === "suspended") await context.resume().catch(() => {});
    return context;
  }, [getAudioContext]);

  function showNotice(message) {
    setNotice(message);
    window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(""), 2200);
  }

  function startCooldown(duration = COOLDOWN_MS) {
    const until = Date.now() + duration;
    setCooldownUntil(until);
    window.clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = window.setTimeout(() => setCooldownUntil(0), duration);
  }

  useEffect(() => {
    const unlock = () => unlockAudio().catch(() => {});
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [unlockAudio]);

  useEffect(() => {
    function onSoundboardPlay({ soundId, username }) {
      unlockAudio().then((context) => {
        if (context) playEffect(context, soundId);
      }).catch(() => {});
      if (username) showNotice(`${username} played a sound`);
    }
    socket.on("soundboard:play", onSoundboardPlay);
    return () => socket.off("soundboard:play", onSoundboardPlay);
  }, [socket, unlockAudio]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePress = (event) => {
      if (!popoverRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [open]);

  useEffect(() => () => {
    window.clearTimeout(cooldownTimerRef.current);
    window.clearTimeout(noticeTimerRef.current);
    contextRef.current?.close().catch(() => {});
  }, []);

  const coolingDown = Date.now() < cooldownUntil;

  async function playSound(soundId) {
    if (disabled || coolingDown) return;
    await unlockAudio();
    socket.emit("soundboard:play", { roomId, soundId }, (ack) => {
      if (!ack?.ok) {
        const retryAfter = Math.max(0, Number(ack?.retryAfter) || COOLDOWN_MS);
        startCooldown(retryAfter);
        showNotice(ack?.error || "Please wait before playing another sound.");
        return;
      }
      startCooldown(ack.cooldownMs || COOLDOWN_MS);
    });
  }

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          unlockAudio().catch(() => {});
          setOpen((current) => !current);
        }}
        className={`apple-control inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:px-4 sm:text-sm ${open ? "border-mint/40 bg-mint/10 text-mint" : "bg-white/[0.045] text-slate-300"}`}
        title="Soundboard"
      >
        <Music className="h-4 w-4" />
        Soundboard
      </button>

      {open && (
        <div className="apple-surface absolute left-0 top-[calc(100%+0.6rem)] z-50 w-[min(20rem,calc(100vw-2rem))] rounded-xl p-3 shadow-2xl sm:left-1/2 sm:-translate-x-1/2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Soundboard</h3>
              <p className="text-xs text-slate-400">Play a sound for everyone in the room</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100" title="Close soundboard">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-3">
            {CATEGORIES.map((category) => (
              <section key={category.label}>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">{category.label}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {category.sounds.map((sound) => (
                    <button
                      key={sound.id}
                      type="button"
                      disabled={coolingDown}
                      onClick={() => playSound(sound.id)}
                      className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-line bg-ink/45 px-1 text-center text-xs font-semibold text-slate-200 transition hover:border-mint/40 hover:bg-mint/10 hover:text-mint disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-white/[0.08] text-[10px] font-black text-mint">{sound.icon}</span>
                      <span className="truncate">{sound.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-2 text-xs text-slate-500">
            <Volume2 className="h-3.5 w-3.5" />
            {coolingDown ? "Soundboard cooling down" : notice || "Ready"}
          </div>
        </div>
      )}
    </div>
  );
}
