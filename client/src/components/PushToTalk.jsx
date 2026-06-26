import { motion } from "framer-motion";
import { Lock, Mic, MicOff, Radio, Unlock } from "lucide-react";

export default function PushToTalk({ active, compact, locked, muted, disabled, onStart, onStop, onToggleLock }) {
  const lockDisabled = disabled || muted;

  return (
    <div className="flex flex-col items-center justify-center gap-5">
      <motion.button
        type="button"
        disabled={disabled || muted}
        onPointerDown={onStart}
        onPointerUp={() => {
          if (!locked) onStop();
        }}
        onPointerCancel={() => {
          if (!locked) onStop();
        }}
        onPointerLeave={() => {
          if (!locked) onStop();
        }}
        whileTap={{ scale: 0.96 }}
        animate={{
          boxShadow: active ? "0 0 0 16px rgba(41,211,167,0.08), 0 0 70px rgba(41,211,167,0.35)" : "0 0 36px rgba(138,180,255,0.12)"
        }}
        className={`grid aspect-square ${compact ? "w-[min(42vw,160px)]" : "w-[min(58vw,280px)]"} max-w-full place-items-center rounded-full border text-center transition ${
          active
            ? "border-mint bg-mint text-ink"
            : "border-line bg-white/[0.06] text-slate-100 hover:border-skyglass/60 hover:bg-white/[0.09]"
        } disabled:cursor-not-allowed disabled:opacity-50`}
        aria-label="Hold to talk"
      >
        <span className="flex flex-col items-center gap-3">
          {muted ? <MicOff className={compact ? "h-8 w-8" : "h-14 w-14"} /> : active ? <Radio className={compact ? "h-8 w-8" : "h-14 w-14"} /> : <Mic className={compact ? "h-8 w-8" : "h-14 w-14"} />}
          <span className={`${compact ? "text-sm" : "text-lg"} font-bold`}>{muted ? "Muted by Admin" : locked ? "Mic Locked" : active ? "Talking" : "Hold to Talk"}</span>
          <span className="text-xs opacity-70">{muted ? "Admin can unmute you" : locked ? "Tap unlock to stop" : "Spacebar works too"}</span>
        </span>
      </motion.button>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={lockDisabled}
          onClick={onToggleLock}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
            locked
              ? "border-mint/50 bg-mint text-ink shadow-glow"
              : "border-line bg-white/[0.05] text-slate-200 hover:bg-white/10"
          }`}
        >
          {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          {locked ? "Unlock mic" : "Lock mic"}
        </button>

      </div>
      {muted && (
        <p className="max-w-xs text-center text-xs text-amberglow">Your mic was muted by the room admin.</p>
      )}
    </div>
  );
}
