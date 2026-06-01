import { motion } from "framer-motion";
import { Mic, MicOff, Radio } from "lucide-react";

export default function PushToTalk({ active, muted, disabled, onStart, onStop, onToggleMute }) {
  return (
    <div className="flex flex-col items-center justify-center gap-5">
      <motion.button
        type="button"
        disabled={disabled || muted}
        onPointerDown={onStart}
        onPointerUp={onStop}
        onPointerCancel={onStop}
        onPointerLeave={onStop}
        whileTap={{ scale: 0.96 }}
        animate={{
          boxShadow: active ? "0 0 0 16px rgba(41,211,167,0.08), 0 0 70px rgba(41,211,167,0.35)" : "0 0 36px rgba(138,180,255,0.12)"
        }}
        className={`grid aspect-square w-[min(58vw,280px)] max-w-full place-items-center rounded-full border text-center transition ${
          active
            ? "border-mint bg-mint text-ink"
            : "border-line bg-white/[0.06] text-slate-100 hover:border-skyglass/60 hover:bg-white/[0.09]"
        } disabled:cursor-not-allowed disabled:opacity-50`}
        aria-label="Hold to talk"
      >
        <span className="flex flex-col items-center gap-3">
          {active ? <Radio className="h-14 w-14" /> : <Mic className="h-14 w-14" />}
          <span className="text-lg font-bold">{active ? "Talking" : "Hold to Talk"}</span>
          <span className="text-xs opacity-70">Spacebar works too</span>
        </span>
      </motion.button>

      <button
        type="button"
        onClick={onToggleMute}
        className="inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.05] px-4 py-2 text-sm text-slate-200 hover:bg-white/10"
      >
        {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        {muted ? "Unmute controls" : "Mute controls"}
      </button>
    </div>
  );
}
