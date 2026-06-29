import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Check, Download, Edit3, File as FileIcon, Loader2, Mic, Plus, Send, Smile, Square, Trash2, UserRound, UsersRound, X } from "lucide-react";
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

function trimUrlToken(token) {
  let url = token;
  let suffix = "";
  while (/[),.!?:;\]]$/.test(url)) {
    suffix = `${url.slice(-1)}${suffix}`;
    url = url.slice(0, -1);
  }
  return { url, suffix };
}

function normalizeUrl(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function getMessageParts(text = "") {
  const pattern = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    const { url, suffix } = trimUrlToken(match[0]);
    if (url) {
      parts.push({ type: "link", value: url, href: normalizeUrl(url) });
    }
    if (suffix) {
      parts.push({ type: "text", value: suffix });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: "text", value: text }];
}

function firstMessageUrl(text = "") {
  return getMessageParts(text).find((part) => part.type === "link")?.href || "";
}

function linkPreview(url) {
  try {
    const parsed = new window.URL(url);
    return {
      href: parsed.href,
      host: parsed.hostname.replace(/^www\./i, ""),
      path: `${parsed.pathname}${parsed.search}`.replace(/^\/$/, "")
    };
  } catch {
    return null;
  }
}

function encodeWav(samples, sampleRate) {
  const length = samples.reduce((total, chunk) => total + chunk.length, 0);
  const dataSize = length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;

  function writeString(value) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index));
      offset += 1;
    }
  }

  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeString("WAVE");
  writeString("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * 2, true);
  offset += 4;
  view.setUint16(offset, 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeString("data");
  view.setUint32(offset, dataSize, true);
  offset += 4;

  samples.forEach((chunk) => {
    for (let index = 0; index < chunk.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  });

  return new window.Blob([buffer], { type: "audio/wav" });
}

function activeMention(value, cursorPosition = value.length) {
  const beforeCursor = value.slice(0, cursorPosition);
  const match = /(^|\s)@([^\s@]*)$/.exec(beforeCursor);
  if (!match) return null;
  return {
    start: beforeCursor.lastIndexOf("@"),
    end: cursorPosition,
    query: match[2].toLowerCase()
  };
}

export default function ChatPanel({
  messages,
  participants = [],
  typingUsers,
  fileUploading,
  currentUsername,
  onSend,
  onUploadFile,
  onReact,
  onEdit,
  onDelete,
  onTypingStart,
  onTypingStop
}) {
  const [value, setValue] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const [reactionPickerId, setReactionPickerId] = useState(null);
  const [recording, setRecording] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [mention, setMention] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimer = useRef(null);
  const recorderRef = useRef(null);
  const voiceStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioProcessorRef = useRef(null);
  const audioSamplesRef = useRef([]);
  const audioSampleRateRef = useRef(44100);
  const chunksRef = useRef([]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    return () => {
      if (pendingAttachment?.url) window.URL.revokeObjectURL(pendingAttachment.url);
    };
  }, [pendingAttachment]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stopVoiceStream();
    };
  }, []);

  function queueAttachment(file) {
    setShowEmojis(false);
    setPendingAttachment((current) => {
      if (current?.url) window.URL.revokeObjectURL(current.url);
      return {
        file,
        url: window.URL.createObjectURL(file),
        kind: attachmentKind({ mimeType: file.type }),
        name: file.name || "attachment"
      };
    });
  }

  function clearPendingAttachment() {
    setPendingAttachment((current) => {
      if (current?.url) window.URL.revokeObjectURL(current.url);
      return null;
    });
  }

  function handleChange(event) {
    const nextValue = event.target.value;
    setValue(nextValue);
    setMention(activeMention(nextValue, event.target.selectionStart));
    onTypingStart();
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(onTypingStop, 900);
  }

  function refreshMention() {
    window.requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      setMention(activeMention(input.value, input.selectionStart));
    });
  }

  function submit(event) {
    event.preventDefault();
    const clean = DOMPurify.sanitize(value.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    if (pendingAttachment) {
      onUploadFile(pendingAttachment.file, { chatOnly: true, message: clean });
      clearPendingAttachment();
      setValue("");
      setShowEmojis(false);
      setMention(null);
      onTypingStop();
      return;
    }

    if (!clean) return;
    onSend(clean);
    setValue("");
    setShowEmojis(false);
    setMention(null);
    onTypingStop();
  }

  function handleFileChange(event) {
    const [file] = event.target.files || [];
    if (file) queueAttachment(file);
    event.target.value = "";
  }

  function handlePaste(event) {
    const imageItem = [...(event.clipboardData?.items || [])].find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) return;

    const file = imageItem.getAsFile();
    if (!file) return;

    event.preventDefault();
    const clean = DOMPurify.sanitize(value.trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    const namedFile = new window.File([file], file.name || pastedImageName(file), {
      type: file.type,
      lastModified: file.lastModified || Date.now()
    });
    onUploadFile(namedFile, { chatOnly: true, message: clean, optimistic: true });
    setValue("");
    setShowEmojis(false);
    setMention(null);
    onTypingStop();
  }

  function insertMention(username) {
    const input = inputRef.current;
    const currentMention = mention || activeMention(value, input?.selectionStart ?? value.length);
    if (!currentMention) return;
    const nextValue = `${value.slice(0, currentMention.start)}@${username} ${value.slice(currentMention.end)}`;
    const nextCursor = currentMention.start + username.length + 2;
    setValue(nextValue);
    setMention(null);
    setShowEmojis(false);
    onTypingStart();
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(onTypingStop, 900);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function stopVoiceStream() {
    audioProcessorRef.current?.disconnect();
    audioContextRef.current?.close().catch(() => {});
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioProcessorRef.current = null;
    audioContextRef.current = null;
    voiceStreamRef.current = null;
  }

  function finishWavRecording() {
    const samples = audioSamplesRef.current;
    stopVoiceStream();
    setRecording(false);
    audioSamplesRef.current = [];
    if (!samples.length) return;
    const blob = encodeWav(samples, audioSampleRateRef.current);
    if (!blob.size) return;
    const file = new window.File([blob], `voice-note-${new Date().toISOString().replace(/[:.]/g, "-")}.wav`, {
      type: "audio/wav"
    });
    queueAttachment(file);
  }

  async function startWavRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Audio recording is not supported in this browser.");
    }

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    audioSamplesRef.current = [];
    audioSampleRateRef.current = context.sampleRate;
    processor.onaudioprocess = (event) => {
      if (!recording && !audioProcessorRef.current) return;
      audioSamplesRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };
    source.connect(processor);
    processor.connect(context.destination);
    voiceStreamRef.current = stream;
    audioContextRef.current = context;
    audioProcessorRef.current = processor;
    setRecording(true);
  }

  async function toggleRecording() {
    if (recording) {
      if (audioProcessorRef.current) {
        finishWavRecording();
      } else {
        recorderRef.current?.stop();
      }
      return;
    }

    try {
      await startWavRecording();
    } catch {
      if (window.MediaRecorder) {
        await startMediaRecorderFallback();
        return;
      }
      setRecording(false);
    }
  }

  async function startMediaRecorderFallback() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      voiceStreamRef.current = stream;
      chunksRef.current = [];
      const recorder = new window.MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        voiceStreamRef.current = null;
        setRecording(false);
        const blob = new window.Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!blob.size) return;
        const extension = blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new window.File([blob], `voice-note-${new Date().toISOString().replace(/[:.]/g, "-")}.${extension}`, {
          type: blob.type || "audio/webm"
        });
        queueAttachment(file);
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
          className="mt-2 block w-full overflow-hidden rounded-md border border-line bg-ink/50 text-left hover:border-mint/50"
        >
          <img src={previewUrl} alt={file.originalName} className="max-h-72 w-full object-contain" />
        </button>
      );
    }

    if (kind === "audio") {
      return (
        <audio controls preload="metadata" src={apiAssetUrl(file.previewUrl)} className="mt-2 w-full" />
      );
    }

    return (
      <a
        href={apiAssetUrl(file.downloadUrl)}
        download
        className="mt-2 flex items-center gap-2 rounded-md border border-line bg-ink/50 px-3 py-2 text-sm text-slate-200 hover:bg-white/10"
      >
        <FileIcon className="h-4 w-4 text-skyglass" />
        <span className="min-w-0 flex-1 truncate">{file.originalName}</span>
        <span className="text-xs text-slate-500">{formatBytes(file.size)}</span>
      </a>
    );
  }

  function renderPendingAttachment() {
    if (!pendingAttachment) return null;

    if (pendingAttachment.kind === "image") {
      return (
        <button
          type="button"
          onClick={() => setImagePreview({ url: pendingAttachment.url, name: pendingAttachment.name })}
          className="block max-h-56 w-full overflow-hidden rounded-md border border-line bg-ink/70"
        >
          <img src={pendingAttachment.url} alt={pendingAttachment.name} className="max-h-56 w-full object-contain" />
        </button>
      );
    }

    if (pendingAttachment.kind === "audio") {
      return <audio controls preload="metadata" src={pendingAttachment.url} className="w-full" />;
    }

    return (
      <div className="flex items-center gap-2 rounded-md border border-line bg-ink/70 px-3 py-2 text-sm text-slate-200">
        <FileIcon className="h-4 w-4 shrink-0 text-skyglass" />
        <span className="min-w-0 flex-1 truncate">{pendingAttachment.name}</span>
        <span className="text-xs text-slate-500">{formatBytes(pendingAttachment.file.size)}</span>
      </div>
    );
  }

  function renderMessageText(text) {
    return getMessageParts(text).map((part, index) => {
      if (part.type !== "link") return <span key={`${part.type}-${index}`}>{part.value}</span>;
      return (
        <a
          key={`${part.type}-${index}`}
          href={part.href}
          target="_blank"
          rel="noreferrer"
          className="font-medium text-mint underline decoration-mint/40 underline-offset-2 hover:text-skyglass"
        >
          {part.value}
        </a>
      );
    });
  }

  function renderLinkPreview(url) {
    const preview = linkPreview(url);
    if (!preview) return null;

    return (
      <a
        href={preview.href}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block max-w-full overflow-hidden rounded-md border border-line bg-ink/50 transition hover:border-mint/50 hover:bg-white/[0.06]"
      >
        <span className="block border-l-2 border-mint px-3 py-2">
          <span className="block truncate text-sm font-semibold text-slate-100">{preview.host}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-400">{preview.path || preview.href}</span>
        </span>
      </a>
    );
  }

  function reactToMessage(messageId, emoji) {
    setReactionPickerId(null);
    onReact?.(messageId, emoji);
  }

  function startEditing(message) {
    setReactionPickerId(null);
    setEditingMessage({ id: message.id, value: message.message || "" });
  }

  function saveEdit() {
    const clean = DOMPurify.sanitize((editingMessage?.value || "").trim(), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    if (!editingMessage?.id || !clean) return;
    onEdit?.(editingMessage.id, clean);
    setEditingMessage(null);
  }

  function cancelEdit() {
    setEditingMessage(null);
  }

  function deleteOwnMessage(messageId) {
    setReactionPickerId(null);
    if (editingMessage?.id === messageId) setEditingMessage(null);
    onDelete?.(messageId);
  }

  const mentionOptions = mention
    ? (() => {
        const selfParticipant = participants.find((participant) => participant.username === currentUsername);
        return [
        { id: "all", username: "all", subtitle: "Mention all members in this chat", all: true },
        ...participants
          .filter((user) => user.username)
          .map((user) => ({
            id: user.id,
            username: user.username,
            subtitle: user.id === selfParticipant?.id ? "You" : "Online"
          }))
        ].filter((user) => user.username.toLowerCase().includes(mention.query));
      })()
    : [];

  return (
    <aside className="glass flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg">
      <div className="shrink-0 border-b border-line p-3 sm:p-4">
        <h2 className="text-sm font-semibold text-slate-100">Room Chat</h2>
        <p className="mt-1 min-h-4 text-xs text-slate-400">
          {typingUsers.length ? `${typingUsers.join(", ")} typing...` : "Messages sync for everyone here"}
        </p>
      </div>

      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />

      <div className="scrollbar-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-2.5 sm:p-4">
        {messages.map((message) => {
          const isSystem = message.username === "System";
          const isOwn = !isSystem && currentUsername && message.username === currentUsername;
          const isDeleted = Boolean(message.deletedAt);
          const mentioned = !isOwn && currentUsername && message.message?.toLowerCase().includes(`@${currentUsername.toLowerCase()}`);
          const visibleReactions = reactionEntries(message.reactions);
          const reactionAllowed = canReactToMessage(message) && !isDeleted;
          const canManage = isOwn && reactionAllowed;
          const isEditing = editingMessage?.id === message.id;
          const previewUrl = !isDeleted && message.message ? firstMessageUrl(message.message) : "";
          return (
            <div
              key={message.id || `${message.username}-${message.timestamp}`}
              className={`flex ${isSystem ? "justify-center" : isOwn ? "justify-end" : "justify-start"} ${visibleReactions.length ? "mb-4" : ""}`}
            >
            <div
              onMouseEnter={() => {
                if (reactionAllowed) setReactionPickerId(message.id);
              }}
              onMouseLeave={() => setReactionPickerId((id) => (id === message.id ? null : id))}
              className={`group relative w-fit min-w-0 max-w-[92%] rounded-lg border px-3 py-2 sm:max-w-[82%] ${
                isSystem
                  ? "border-transparent bg-white/[0.03] text-center"
                  : mentioned
                    ? "border-amberglow/40 bg-amberglow/10"
                    : isOwn
                      ? "rounded-br-sm border-mint/20 bg-mint/15"
                      : "rounded-bl-sm border-transparent bg-white/[0.04]"
              } ${isDeleted ? "border-dashed bg-white/[0.025]" : ""}`}
            >
              <div className="mb-0.5 flex items-center justify-between gap-3">
                <span className={`truncate text-xs font-semibold ${isOwn ? "text-mint" : "text-slate-100"}`}>{isOwn ? "You" : message.username}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {canManage && !isEditing && (
                    <span className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => startEditing(message)}
                        title="Edit message"
                        className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteOwnMessage(message.id)}
                        title="Delete message"
                        className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-red-200"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                  <time className="text-[11px] text-slate-500">{formatTime(message.timestamp)}</time>
                </span>
              </div>
              {isDeleted ? (
                <p className="break-anywhere text-sm italic leading-5 text-slate-500 [overflow-wrap:anywhere]">This message was deleted</p>
              ) : isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editingMessage.value}
                    onChange={(event) => setEditingMessage((current) => ({ ...current, value: event.target.value }))}
                    maxLength={1000}
                    rows={3}
                    className="min-h-20 w-full resize-none rounded-md border border-line bg-ink/70 p-2 text-sm text-slate-100 outline-none focus:border-mint/60"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="grid h-8 w-8 place-items-center rounded-md border border-line text-slate-300 hover:bg-white/10"
                      title="Cancel edit"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="grid h-8 w-8 place-items-center rounded-md bg-mint text-ink hover:bg-mint/90"
                      title="Save edit"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {message.message && (
                    <>
                      <p className="break-anywhere text-sm leading-5 text-slate-200 [overflow-wrap:anywhere]">{renderMessageText(message.message)}</p>
                      {previewUrl && renderLinkPreview(previewUrl)}
                    </>
                  )}
                  {(message.attachments || []).map((file) => (
                    <div key={file.id}>{renderAttachment(file)}</div>
                  ))}
                  {message.editedAt && (
                    <div className="mt-1 text-right text-[11px] text-slate-500">edited</div>
                  )}
                </>
              )}
              {visibleReactions.length > 0 && (
                <div className={`absolute -bottom-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1 ${isOwn ? "right-3 justify-end" : "left-3 justify-start"}`}>
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
              <div className={`absolute -bottom-4 z-20 flex rounded-full border border-line bg-panel/95 p-1 shadow-xl ${isOwn ? "right-3" : "left-3"}`}>
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
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} onPaste={handlePaste} className="relative shrink-0 border-t border-line p-2.5 sm:p-3">
        {showEmojis && (
          <div className="absolute bottom-16 left-2.5 z-20 grid grid-cols-5 gap-1 rounded-lg border border-line bg-panel p-2 shadow-2xl sm:left-3">
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
        {pendingAttachment && (
          <div className="mb-2.5 rounded-lg border border-line bg-white/[0.04] p-2.5 sm:mb-3 sm:p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs font-semibold uppercase text-slate-400">{pendingAttachment.name}</span>
              <button
                type="button"
                onClick={clearPendingAttachment}
                title="Remove attachment"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderPendingAttachment()}
          </div>
        )}
        {mention && mentionOptions.length > 0 && (
          <div className="scrollbar-thin absolute bottom-16 left-2.5 right-2.5 z-30 max-h-[min(18rem,48dvh)] overflow-y-auto rounded-xl border border-line bg-ink/95 p-2 shadow-2xl backdrop-blur sm:left-3 sm:right-3">
            {mentionOptions.map((user) => (
              <button
                key={user.id}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertMention(user.username)}
                className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.08]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/[0.08] text-slate-300">
                  {user.all ? <UsersRound className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-slate-100">{user.username}</span>
                  <span className="block truncate text-xs text-slate-500">{user.subtitle}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="flex min-w-0 items-center gap-1 rounded-lg border border-line bg-ink/50 p-1.5 sm:gap-2 sm:p-2">
          <button
            type="button"
            title="Emoji"
            className="grid h-11 w-10 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/[0.08] hover:text-slate-100 sm:h-10 sm:w-10"
            onClick={() => setShowEmojis((show) => !show)}
          >
            <Smile className="h-5 w-5" />
          </button>
          <input
            ref={inputRef}
            value={value}
            onChange={handleChange}
            onClick={refreshMention}
            onKeyUp={refreshMention}
            onFocus={refreshMention}
            onBlur={() => window.setTimeout(() => setMention(null), 120)}
            maxLength={1000}
            placeholder="Message, @mention, or paste an image"
            className="min-h-11 min-w-0 flex-1 basis-0 bg-transparent px-1 text-base text-slate-100 outline-none placeholder:text-slate-500 sm:min-h-10 sm:text-sm"
          />
          <button
            type="button"
            title="Attach file"
            disabled={fileUploading || Boolean(pendingAttachment)}
            onClick={() => fileInputRef.current?.click()}
            className="grid h-11 w-10 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-white/[0.08] hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-10"
          >
            {fileUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-5 w-5" />}
          </button>
          <button
            type="button"
            title={recording ? "Stop voice note" : "Record voice note"}
            onClick={toggleRecording}
            className={`grid h-11 w-10 shrink-0 place-items-center rounded-md sm:h-10 sm:w-10 ${
              recording ? "bg-red-500/20 text-red-200" : "text-slate-400 hover:bg-white/[0.08] hover:text-slate-100"
            }`}
          >
            {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="submit"
            title="Send"
            disabled={fileUploading}
            className="grid h-11 w-10 shrink-0 place-items-center rounded-md bg-mint text-ink hover:bg-mint/90 disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:w-10"
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
