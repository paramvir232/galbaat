import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Video, X } from "lucide-react";

function VideoTile({ stream, label, muted = false, mirrored = false, screen = false, onExpand }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream || null;
    ref.current.play().catch(() => {});
  }, [stream]);

  function handleKeyDown(event) {
    if (!onExpand || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onExpand();
  }

  return (
    <div
      role={onExpand ? "button" : undefined}
      tabIndex={onExpand ? 0 : undefined}
      onClick={onExpand}
      onKeyDown={handleKeyDown}
      className={`group relative aspect-video w-full overflow-hidden rounded-lg border border-line bg-ink/70 text-left outline-none ${onExpand ? "cursor-zoom-in hover:border-mint/50 focus-visible:border-mint/70" : ""}`}
    >
      {stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className={`h-full w-full ${screen ? "object-contain" : "object-cover"} ${mirrored ? "-scale-x-100" : ""}`}
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-slate-500">
          <Video className="h-7 w-7" />
        </div>
      )}
      <div className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded bg-ink/80 px-2 py-1 text-xs font-medium text-slate-100">
        {label}
      </div>
      {onExpand && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onExpand();
          }}
          title="Expand video"
          className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-md bg-ink/80 text-slate-200 opacity-0 transition hover:bg-white/15 group-hover:opacity-100"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default function VideoGrid({ localStream, remoteStreams, participants, selfId, screenSharing = false }) {
  const [expandedId, setExpandedId] = useState(null);
  const tiles = useMemo(() => {
    const participantById = (id) => participants.find((user) => user.id === id);
    return remoteStreams
      .filter(({ peerId, stream }) => participantById(peerId)?.video && stream.getVideoTracks().some((track) => track.readyState === "live"))
      .map(({ peerId, stream }) => ({
        id: peerId,
        label: participantById(peerId)?.screenSharing ? `${participantById(peerId)?.username || "Guest"} screen` : participantById(peerId)?.username || "Guest",
        stream,
        screen: Boolean(participantById(peerId)?.screenSharing)
      }));
  }, [participants, remoteStreams]);

  const hasLocalVideo = localStream?.getVideoTracks().some((track) => track.readyState === "live");
  const self = participants.find((user) => user.id === selfId);
  const selfName = self?.username || "You";
  const localScreen = Boolean(screenSharing || self?.screenSharing);
  const allTiles = hasLocalVideo
    ? [{ id: "local", label: localScreen ? `${selfName} screen (you)` : `${selfName} (you)`, stream: localStream, local: true, screen: localScreen }, ...tiles]
    : tiles;
  const sortedTiles = [...allTiles].sort((a, b) => Number(b.screen) - Number(a.screen));
  const expandedTile = sortedTiles.find((tile) => tile.id === expandedId && !tile.local);

  if (!sortedTiles.length) return null;

  return (
    <>
      <div className="grid w-full max-w-5xl grid-cols-1 items-start gap-3 overflow-hidden sm:grid-cols-2 xl:grid-cols-3">
        {sortedTiles.map((tile) => (
          <div key={tile.id} className="min-w-0">
            <VideoTile
              stream={tile.stream}
              label={tile.label}
              muted
              mirrored={tile.local && !tile.screen}
              screen={tile.screen}
              onExpand={tile.local ? undefined : () => setExpandedId(tile.id)}
            />
          </div>
        ))}
      </div>

      {expandedTile && (
        <div className="fixed inset-0 z-50 bg-ink/95 p-3 backdrop-blur sm:p-5">
          <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-black/60 p-2 sm:p-4">
            <VideoTile
              stream={expandedTile.stream}
              label={expandedTile.label}
              muted
              screen
              onExpand={undefined}
            />
            <button
              type="button"
              onClick={() => setExpandedId(null)}
              title="Close expanded video"
              className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-md border border-line bg-ink/85 text-slate-100 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
