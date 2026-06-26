import { useEffect, useMemo, useRef } from "react";
import { Video } from "lucide-react";

function VideoTile({ stream, label, muted = false, mirrored = false, screen = false }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream || null;
    ref.current.play().catch(() => {});
  }, [stream]);

  return (
    <div className={`relative min-h-0 overflow-hidden rounded-lg border border-line bg-ink/70 ${screen ? "col-span-full" : ""}`}>
      {stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className={`aspect-video h-full w-full ${screen ? "object-contain" : "object-cover"} ${mirrored ? "-scale-x-100" : ""}`}
        />
      ) : (
        <div className="grid aspect-video h-full w-full place-items-center text-slate-500">
          <Video className="h-7 w-7" />
        </div>
      )}
      <div className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded bg-ink/80 px-2 py-1 text-xs font-medium text-slate-100">
        {label}
      </div>
    </div>
  );
}

export default function VideoGrid({ localStream, remoteStreams, participants, selfId, screenSharing = false }) {
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
  const hasScreenShare = sortedTiles.some((tile) => tile.screen);

  if (!sortedTiles.length) return null;

  return (
    <div className={`grid w-full gap-3 overflow-hidden ${hasScreenShare ? "max-w-6xl grid-cols-1 xl:grid-cols-2" : "max-w-5xl grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"}`}>
      {sortedTiles.map((tile) => (
        <VideoTile key={tile.id} stream={tile.stream} label={tile.label} muted={tile.local} mirrored={tile.local && !tile.screen} screen={tile.screen} />
      ))}
    </div>
  );
}
