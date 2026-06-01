import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Send, Smile } from "lucide-react";
import { formatTime } from "../lib/time";

const EMOJIS = ["😀", "😂", "🔥", "🙌", "👋", "✅", "🎧", "🚀", "❤️"];

export default function ChatPanel({ messages, typingUsers, onSend, onTypingStart, onTypingStop }) {
  const [value, setValue] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const endRef = useRef(null);
  const typingTimer = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function handleChange(event) {
    setValue(event.target.value);
    onTypingStart();
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(onTypingStop, 900);
  }

  function submit(event) {
    event.preventDefault();
    const clean = DOMPurify.sanitize(value.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    if (!clean) return;
    onSend(clean);
    setValue("");
    setShowEmojis(false);
    onTypingStop();
  }

  return (
    <aside className="glass flex h-full min-h-0 flex-col overflow-hidden rounded-lg">
      <div className="shrink-0 border-b border-line p-4">
        <h2 className="text-sm font-semibold text-slate-100">Room Chat</h2>
        <p className="mt-1 min-h-4 text-xs text-slate-400">
          {typingUsers.length ? `${typingUsers.join(", ")} typing...` : "Messages sync for everyone here"}
        </p>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
        {messages.map((message) => (
          <div key={message.id || `${message.username}-${message.timestamp}`} className="rounded-lg bg-white/[0.04] p-3">
            <div className="mb-1 flex items-center justify-between gap-3">
              <span className="truncate text-sm font-semibold text-slate-100">{message.username}</span>
              <time className="shrink-0 text-[11px] text-slate-500">{formatTime(message.timestamp)}</time>
            </div>
            <p className="break-anywhere text-sm leading-6 text-slate-300 [overflow-wrap:anywhere]">{message.message}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="relative shrink-0 border-t border-line p-3">
        {showEmojis && (
          <div className="absolute bottom-16 left-3 grid grid-cols-5 gap-1 rounded-lg border border-line bg-panel p-2 shadow-2xl">
            {EMOJIS.map((emoji) => (
              <button
                type="button"
                key={emoji}
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-white/10"
                onClick={() => setValue((current) => `${current}${emoji}`)}
                aria-label={`Add ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 rounded-lg border border-line bg-ink/50 p-2">
          <button
            type="button"
            title="Emoji"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/[0.08] hover:text-slate-100"
            onClick={() => setShowEmojis((show) => !show)}
          >
            <Smile className="h-5 w-5" />
          </button>
          <input
            value={value}
            onChange={handleChange}
            maxLength={1000}
            placeholder="Message the room"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
          />
          <button
            type="submit"
            title="Send"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-mint text-ink hover:bg-mint/90"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </aside>
  );
}
