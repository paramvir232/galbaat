import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Link2, QrCode } from "lucide-react";

export default function ShareRoom({ roomId }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrPosition, setQrPosition] = useState({ right: 12, top: 60 });
  const rootRef = useRef(null);
  const qrButtonRef = useRef(null);
  const qrPopoverRef = useRef(null);
  const inviteUrl = useMemo(() => `${window.location.origin}/r/${roomId}`, [roomId]);
  const qrPopover = showQr
    ? createPortal(
        <div
          ref={qrPopoverRef}
          className="fixed z-[9999] rounded-xl bg-white p-3 shadow-2xl"
          style={qrPosition}
        >
          <QRCodeSVG value={inviteUrl} size={152} bgColor="#FFFFFF" fgColor="#000000" />
        </div>,
        document.body
      )
    : null;

  useEffect(() => {
    if (!showQr) return undefined;
    const closeOnOutsidePress = (event) => {
      if (rootRef.current?.contains(event.target) || qrPopoverRef.current?.contains(event.target)) return;
      setShowQr(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  }, [showQr]);

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
    <div ref={rootRef} className="relative flex items-center gap-1.5 sm:gap-2">
      <button
        type="button"
        onClick={copyInvite}
        className="apple-control inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-[14px] px-3 text-sm text-slate-200 sm:h-10"
        title={copied ? "Copied" : "Copy link"}
      >
        {copied ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
        <span className="hidden sm:inline">{copied ? "Copied" : "Copy Link"}</span>
      </button>
      <button
        ref={qrButtonRef}
        type="button"
        onClick={toggleQr}
        className="apple-control grid h-11 w-11 place-items-center rounded-[14px] text-slate-200 sm:h-10 sm:w-10"
        title="Show QR code"
      >
        {showQr ? <Link2 className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
      </button>
      {qrPopover}
    </div>
  );
}
