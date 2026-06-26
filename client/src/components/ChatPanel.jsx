import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Download, File as FileIcon, Loader2, Mic, Plus, Send, Smile, Square, X } from "lucide-react";
import { apiAssetUrl } from "../lib/api";
import { formatTime } from "../lib/time";

const EMOJIS = ["😀", "😂", "🔥", "🙌", "👋", "✅", "🎧", "🚀", "❤️"];
const REACTIONS = ["👍", "😂", "❤️", "🔥", "✅"];

function formatBytes(value) {
  if (!Number.isFinite(value)) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

const REACTION_OPTIONS = ["\u{1F44D}", "\u{1F602}", "\u2764\uFE0F", "\u{1F525}", "\u2705"];

function pastedImageName(file) {
  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return `pasted-image-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`;
}

function attachmentKind(file) {
  if (file.mimeType?.startsWith("image/")) return "image";
  if (file.mimeType?.startsWith("audio/")) return "audio";
  return "file";
}

function reactionEntries(reactions = {}) {
  return Object.entries(reactions).filter(([, count]) => Number(count) > 0);
}

function canReactToMessage(message) {
  return /^[a-f\d]{24}$/i.test(String(message.id || ""));
}

export default function ChatPanel({
  messages,
  typingUsers,
  fileUploading,
  currentUsername,
  onSend,
  onUploadFile,
  onReact,
  onTypingStart,
  onTypingStop
}) {
  const [value, setValue] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [reactionPickerId, setReactionPickerId] = useState(null);
  const [recording, setRecording] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimer = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

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

  function handleFileChange(event) {
    const [file] = event.target.files || [];
    if (file) onUploadFile(file, { chatOnly: true });
    event.target.value = "";
  }

  function handlePaste(event) {
    const imageItem = [...(event.clipboardData?.items || [])].find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem || fileUploading) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    event.preventDefault();
    const namedFile = new window.File([file], file.name || pastedImageName(file), {
      type: file.type,
      lastModified: file.lastModified || Date.now()
    });
    onUploadFile(namedFile, { chatOnly: true });
    setShowEmojis(false);
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      chunksRef.current = [];
      const recorder = new window.MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new window.Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) return;
        const extension = blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new window.File([blob], `voice-note-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, {
          type: blob.type || "audio/webm"
        });
        onUploadFile(file, { chatOnly: true });
      };
      recorder.start();
      setRecording(true);
    } catch {
      setRecording(false);
    }
  }

  function renderAttachment(file) {
    const kind = attachmentKind(file);
    if (kind === "image") {
      const previewUrl = apiAssetUrl(file.previewUrl);
      return (
        <button
          type="button"
          onClick={() => setImagePreview({ url: previewUrl, name: file.originalName })}
          className="mt-3 block w-full overflow-hidden rounded-md border border-line bg-ink/50 text-left hover:border-mint/50"
        >
          <img src={previewUrl} alt={file.originalName} className="max-h-72 w-full object-contain" />
        </button>
      );
    }

    if (kind === "audio") {
      return (
        <audio controls className="mt-3 w-full">
          <source src={apiAssetUrl(file.previewUrl)} type={file.mimeType} />
        </audio>
      );
    }

    return (
      <a
        href={apiAssetUrl(file.downloadUrl)}
        download
        className="mt-3 flex items-center gap-2 rounded-md border border-line bg-ink/50 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
      >
        <FileIcon className="h-4 w-4 text-skyglass" />
        <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
        <span className="text-xs text-slate-500">{formatBytes(file.size)}</span>
      </a>
    );
  }

  function reactToMessage(messageId, emoji) {
    setReactionPickerId(null);
    onReact?.(messageId, emoji);
  }

  return (
    <aside className="glass flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg">
      <div className="shrink-0 border-b border-line p-3 sm:p-4">
        <h2 className="text-sm font-semibold text-slate-100">Room Chat</h2>
        <p className="mt-1 min-h-4 text-xs text-slate-400">
          {typingUsers.length ? `${typingUsers.join(", ")} typing...` : "Messages sync for everyone here"}
        </p>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {messages.map((message) => {
          const mentioned = currentUsername && message.message?.toLowerCase().includes(`@${currentUsername.toLowerCase()}`);
          const visibleReactions = reactionEntries(message.reactions);
          const reactionAllowed = canReactToMessage(message);
          return (
            <div
              key={message.id || `${message.username}-${message.timestamp}`}
              onMouseEnter={() => {
                if (reactionAllowed) setReactionPickerId(message.id);
              }}
              onMouseLeave={() => setReactionPickerId((id) => (id === message.id ? null : id))}
              className={`group relative rounded-lg border p-3 ${visibleReactions.length ? "mb-4" : ""} ${mentioned ? "border-amberglow/40 bg-amberglow/10" : "border-transparent bg-white/[0.04]"}`}
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="truncate text-sm font-semibold text-slate-100">{message.username}</span>
                <time className="shrink-0 text-[11px] text-slate-500">{formatTime(message.timestamp)}</time>
              </div>
              {message.message && <p className="break-anywhere text-sm leading-6 text-slate-300 [overflow-wrap:anywhere]">{message.message}</p>}
              {(message.attachments || []).map((file) => (
                <div key={file.id}>{renderAttachment(file)}</div>
              ))}
              {visibleReactions.length > 0 && (
                <div className="absolute -bottom-3 right-3 flex max-w-[calc(100%-1.5rem)] flex-wrap justify-end gap-1">
                  {visibleReactions.map(([emoji, count]) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => reactToMessage(message.id, emoji)}
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-line bg-panel px-2 text-xs text-slate-100 shadow-lg hover:bg-white/10"
                  >
                    <span>{emoji}</span>
                    {count > 1 && <span className="text-[11px] font-semibold text-slate-300">{count}</span>}
                  </button>
                  ))}
                </div>
              )}
              {reactionPickerId === message.id && (
              <div className="absolute -bottom-4 right-3 z-20 flex rounded-full border border-line bg-panel/95 p-1 shadow-xl">
                {REACTION_OPTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => reactToMessage(message.id, emoji)}
                    className="grid h-8 w-8 place-items-center rounded-full text-sm hover:bg-white/10"
                    title="React"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} onPaste={handlePaste} className="relative shrink-0 border-t border-line p-3">
        {showEmojis && (
          <div className="absolute bottom-16 left-3 z-20 grid grid-cols-5 gap-1 rounded-lg border border-line bg-panel p-2 shadow-2xl">
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
        <div className="flex min-w-0 items-center gap-1 rounded-lg border border-line bg-ink/50 p-2 sm:gap-2">
          <button
            type="button"
            title="Emoji"
            className="grid h-10 w-9 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/[0.08] hover:text-slate-100 sm:w-10"
            onClick={() => setShowEmojis((show) => !show)}
          >
            <Smile className="h-5 w-5" />
          </button>
          <input
            value={value}
            onChange={handleChange}
            maxLength={1000}
            placeholder="Message, @mention, or paste an image"
            className="min-w-0 flex-1 basis-0 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500 sm:text-sm"
          />
          <button
            type="button"
            title="Attach file"
            disabled={fileUploading}
            onClick={() => fileInputRef.current?.click()}
            className="grid h-10 w-9 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/[0.08] hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:w-10"
          >
            {fileUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
          </button>
          <button
            type="button"
            title={recording ? "Stop voice note" : "Record voice note"}
            onClick={toggleRecording}
            className={`grid h-10 w-9 shrink-0 place-items-center rounded-md sm:w-10 ${
              recording ? "bg-red-500/20 text-red-200" : "text-slate-400 hover:bg-white/[0.08] hover:text-slate-100"
            }`}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="submit"
            title="Send"
            className="grid h-10 w-9 shrink-0 place-items-center rounded-md bg-mint text-ink hover:bg-mint/90 sm:w-10"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>

      {imagePreview && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/95 p-3 backdrop-blur sm:p-6">
          <div className="relative flex h-full w-full max-w-5xl items-center justify-center overflow-hidden rounded-lg border border-line bg-black/50 p-3">
            <img src={imagePreview.url} alt={imagePreview.name} className="max-h-full max-w-full object-contain" />
            <div className="absolute left-4 top-4 max-w-[calc(100%-5rem)] truncate rounded bg-ink/85 px-3 py-2 text-sm font-medium text-slate-100">
              {imagePreview.name}
            </div>
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              title="Close image preview"
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-md border border-line bg-ink/85 text-slate-100 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
