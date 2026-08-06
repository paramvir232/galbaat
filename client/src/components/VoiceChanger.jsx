import { useState } from "react";
import { Mic2, X } from "lucide-react";

const EFFECTS = [
  ["none", "Normal"],
  ["metallic", "Metallic"],
  ["robot", "Robot"],
  ["deep", "Deep / Heavy"],
  ["high", "High-pitched"],
  ["cartoon", "Funny / Cartoon"],
  ["echo", "Echo"],
  ["radio", "Radio"],
  ["alien", "Alien"],
  ["chipmunk", "Chipmunk"],
  ["monster", "Monster"]
];

export default function VoiceChanger({ effect, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function chooseEffect(nextEffect) {
    if (busy || nextEffect === effect) return;
    setBusy(true);
    setError("");
    try {
      await onChange(nextEffect);
      setOpen(false);
    } catch (changeError) {
      setError(changeError.message || "Voice effect could not be applied.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`apple-control inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:px-4 sm:text-sm ${effect !== "none" ? "border-mint/40 bg-mint/10 text-mint" : "bg-white/[0.045] text-slate-300"}`}
        title="Voice changer"
      >
        <Mic2 className="h-4 w-4" />
        <span className="sm:hidden">Voice</span>
        <span className="hidden sm:inline">{effect === "none" ? "Voice" : "Voice effect"}</span>
      </button>

      {open && (
        <div className="apple-surface absolute left-0 top-[calc(100%+0.6rem)] z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl p-3 shadow-2xl sm:left-1/2 sm:-translate-x-1/2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-100">Voice changer</h3>
              <p className="text-xs text-slate-400">Everyone hears your selected voice effect</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100" title="Close voice changer">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {EFFECTS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => chooseEffect(id)}
                className={`min-h-10 rounded-lg border px-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${effect === id ? "border-mint/40 bg-mint/10 text-mint" : "border-line bg-ink/45 text-slate-200 hover:bg-white/[0.08]"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-xs text-amberglow">{error}</p>}
        </div>
      )}
    </div>
  );
}
