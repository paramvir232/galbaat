export default function StatusPill({ tone = "neutral", children }) {
  const tones = {
    good: "border-mint/30 bg-mint/10 text-mint",
    warn: "border-amberglow/30 bg-amberglow/10 text-amberglow",
    neutral: "border-line bg-white/5 text-slate-300"
  };

  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
