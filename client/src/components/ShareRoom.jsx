import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Link2, QrCode } from "lucide-react";

export default function ShareRoom({ roomId }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const inviteUrl = useMemo(() => `${window.location.origin}/r/${roomId}`, [roomId]);

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        onClick={copyInvite}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-white/[0.05] px-3 text-sm text-slate-200 hover:bg-white/10"
        title={copied ? "Copied" : "Copy link"}
      >
        {copied ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
        <span className="hidden sm:inline">{copied ? "Copied" : "Copy Link"}</span>
      </button>
      <button
        type="button"
        onClick={() => setShowQr((show) => !show)}
        className="grid h-10 w-10 place-items-center rounded-md border border-line bg-white/[0.05] text-slate-200 hover:bg-white/10"
        title="Show QR code"
      >
        {showQr ? <Link2 className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
      </button>
      {showQr && (
        <div className="absolute right-0 top-12 z-20 rounded-lg border border-line bg-slate-950 p-3 shadow-2xl">
          <QRCodeSVG value={inviteUrl} size={152} bgColor="#020617" fgColor="#e5edf7" />
        </div>
      )}
    </div>
  );
}
