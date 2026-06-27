import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Link2, QrCode } from "lucide-react";

export default function ShareRoom({ roomId }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrPosition, setQrPosition] = useState({ right: 12, top: 60 });
  const qrButtonRef = useRef(null);
  const inviteUrl = useMemo(() => `${window.location.origin}/r/${roomId}`, [roomId]);
  const qrPopover = showQr
    ? createPortal(
        <div
          className="fixed z-[9999] rounded-lg border border-line bg-slate-950 p-3 shadow-2xl"
          style={qrPosition}
        >
          <QRCodeSVG value={inviteUrl} size={152} bgColor="#020617" fgColor="#e5edf7" />
        </div>,
        document.body
      )
    : null;

  async function copyInvite() {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function toggleQr() {
    const rect = qrButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setQrPosition({
        right: Math.max(12, window.innerWidth - rect.right),
        top: rect.bottom + 8
      });
    }
    setShowQr((show) => !show);
  }

  return (
    <div className="relative flex items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={copyInvite}
        className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-line bg-white/[0.05] px-3 text-sm text-slate-200 hover:bg-white/10 sm:h-10"
        title={copied ? "Copied" : "Copy link"}
      >
        {copied ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
        <span className="hidden sm:inline">{copied ? "Copied" : "Copy Link"}</span>
      </button>
      <button
        ref={qrButtonRef}
        type="button"
        onClick={toggleQr}
        className="grid h-11 w-11 place-items-center rounded-md border border-line bg-white/[0.05] text-slate-200 hover:bg-white/10 sm:h-10 sm:w-10"
        title="Show QR code"
      >
        {showQr ? <Link2 className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
      </button>
      {qrPopover}
    </div>
  );
}
