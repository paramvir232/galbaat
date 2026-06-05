import { useEffect, useMemo, useRef } from "react";
import { Video } from "lucide-react";

function VideoTile({ stream, label, muted = false, mirrored = false }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.srcObject = stream || null;
  }, [stream]);

  return (
    <div className="relative min-h-0 overflow-hidden rounded-lg border border-line bg-ink/70">
      {stream ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          muted={muted}
          className={`aspect-video h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""}`}
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

export default function VideoGrid({ localStream, remoteStreams, participants, selfId }) {
  const tiles = useMemo(() => {
    const participantById = (id) => participants.find((user) => user.id === id);
    return remoteStreams
      .filter(({ peerId, stream }) => participantById(peerId)?.video && stream.getVideoTracks().some((track) => track.readyState === "live"))
      .map(({ peerId, stream }) => ({
        id: peerId,
        label: participantById(peerId)?.username || "Guest",
        stream
      }));
  }, [participants, remoteStreams]);

  const hasLocalVideo = localStream?.getVideoTracks().some((track) => track.readyState === "live");
  const selfName = participants.find((user) => user.id === selfId)?.username || "You";
  const allTiles = hasLocalVideo ? [{ id: "local", label: `${selfName} (you)`, stream: localStream, local: true }, ...tiles] : tiles;

  if (!allTiles.length) return null;

  return (
    <div className="grid w-full max-w-5xl grid-cols-1 gap-3 overflow-hidden sm:grid-cols-2 xl:grid-cols-3">
      {allTiles.map((tile) => (
        <VideoTile key={tile.id} stream={tile.stream} label={tile.label} muted={tile.local} mirrored={tile.local} />
      ))}
    </div>
  );
}
