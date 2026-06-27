import { Crown, Hand, Mic, MicOff, PanelLeftClose, Radio, ScreenShare, ShieldX, Signal, UserX, Video, Volume2 } from "lucide-react";
import { useState } from "react";

export default function ParticipantList({ participants, selfId, isHost = false, peerVolumes = {}, onPeerVolumeChange, onCollapse, onSelfMute, onHostMute, onKick }) {
  const [openVolumeId, setOpenVolumeId] = useState(null);

  return (
    <aside className="glass flex h-full min-h-0 flex-col rounded-lg p-2.5 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <h2 className="text-sm font-semibold text-slate-100">Participants</h2>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-xs text-slate-300">{participants.length}</span>
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse participants"
            className="grid h-10 w-10 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100 sm:h-7 sm:w-7"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 space-y-2 overflow-y-auto pr-1">
        {participants.map((user) => {
          const volume = peerVolumes[user.id] ?? 100;
          const canAdjustVolume = user.id !== selfId;
          const isSelf = user.id === selfId;

          return (
          <div
            key={user.id}
            className={`grid min-h-[4.5rem] grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border p-2.5 sm:gap-3 sm:p-3 ${
              user.speaking ? "border-mint/45 bg-mint/10 shadow-glow" : "border-line bg-white/[0.03]"
            }`}
          >
            <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-800 text-sm font-bold text-slate-100">
              {user.username.slice(0, 2).toUpperCase()}
              <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-ink p-0.5">
                {user.speaking ? <Radio className="h-3.5 w-3.5 text-mint" /> : <Signal className="h-3.5 w-3.5 text-skyglass" />}
              </span>
            </div>
            <div className="min-w-0 overflow-hidden">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-slate-100">{user.username}</p>
                {isSelf && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">you</span>}
                {user.host && <Crown className="h-3.5 w-3.5 text-amberglow" />}
              </div>
              <p className="text-xs text-slate-400">
                {user.hostMuted ? "Muted by admin" : user.selfMuted ? "Mic muted" : user.handRaised ? "Hand raised" : user.screenSharing ? "Sharing screen" : user.speaking ? "Speaking now" : "Online"}
              </p>
            </div>
            <div className="flex min-h-10 shrink-0 items-center justify-end gap-0.5 sm:h-8 sm:min-h-0 sm:gap-2">
              {user.handRaised && <Hand className="h-4 w-4 text-amberglow" />}
              {user.screenSharing && <ScreenShare className="h-4 w-4 text-mint" />}
              {user.video && <Video className="h-4 w-4 text-skyglass" />}
              {isSelf ? (
                <button
                  type="button"
                  title={user.hostMuted ? "Muted by admin" : user.selfMuted ? "Unmute mic" : "Mute mic"}
                  disabled={user.hostMuted}
                  onClick={() => onSelfMute?.(!user.selfMuted)}
                  className={`grid h-10 w-10 place-items-center rounded-md hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 sm:h-7 sm:w-7 ${
                    user.muted ? "text-amberglow" : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {user.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              ) : user.muted ? (
                <MicOff className="h-4 w-4 text-slate-500" />
              ) : (
                <Mic className="h-4 w-4 text-slate-400" />
              )}
              {canAdjustVolume && (
                <button
                  type="button"
                  title="Adjust volume"
                  onClick={() => setOpenVolumeId((id) => (id === user.id ? null : user.id))}
                  className={`grid h-10 w-10 place-items-center rounded-md hover:bg-white/10 sm:h-7 sm:w-7 ${
                    openVolumeId === user.id ? "text-mint" : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  <Volume2 className="h-4 w-4" />
                </button>
              )}
              {isHost && !isSelf && (
                <>
                  <button
                    type="button"
                    title={user.muted ? "Unmute participant" : "Mute participant"}
                    onClick={() => onHostMute?.(user.id, !user.muted)}
                    className="grid h-10 w-10 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100 sm:h-7 sm:w-7"
                  >
                    <ShieldX className={`h-3.5 w-3.5 ${user.muted ? "text-amberglow" : ""}`} />
                  </button>
                  {!user.host && (
                    <button
                      type="button"
                      title="Remove participant"
                      onClick={() => onKick?.(user.id)}
                      className="grid h-10 w-10 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-red-200 sm:h-7 sm:w-7"
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
            {canAdjustVolume && openVolumeId === user.id && (
              <div className="col-span-3 mt-2 flex min-w-0 items-center gap-2 rounded-md border border-line bg-ink/50 px-2.5 py-2 sm:col-span-2 sm:col-start-2">
                <Volume2 className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={(event) => onPeerVolumeChange?.(user.id, event.target.value)}
                  aria-label={`${user.username} volume`}
                  className="h-1.5 min-w-0 flex-1 accent-mint"
                />
                <span className="w-8 shrink-0 text-right text-[11px] text-slate-400">{volume}%</span>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </aside>
  );
}
