import { Crown, Hand, Mic, MicOff, PanelLeftClose, Radio, ScreenShare, ShieldX, Signal, UserX, Video, Volume2 } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";

export default function ParticipantList({ participants, selfId, isHost = false, peerVolumes = {}, onPeerVolumeChange, onCollapse, onHostMute, onKick }) {
  const [volumeOpenId, setVolumeOpenId] = useState(null);

  return (
    <aside className="glass flex h-full min-h-0 flex-col rounded-lg p-3 sm:p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-100">Participants</h2>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-xs text-slate-300">{participants.length}</span>
          <button
            type="button"
            onClick={onCollapse}
            title="Collapse participants"
            className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="scrollbar-thin min-h-0 space-y-2 overflow-y-auto pr-1">
        {participants.map((user) => {
          const volume = peerVolumes[user.id] ?? 100;
          const canAdjustVolume = user.id !== selfId;

          return (
          <motion.div
            key={user.id}
            layout
            className={`flex items-center gap-2 rounded-lg border p-3 sm:gap-3 ${
              user.speaking ? "border-mint/45 bg-mint/10 shadow-glow" : "border-line bg-white/[0.03]"
            }`}
          >
            <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-800 text-sm font-bold text-slate-100">
              {user.username.slice(0, 2).toUpperCase()}
              <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-ink p-0.5">
                {user.speaking ? <Radio className="h-3.5 w-3.5 text-mint" /> : <Signal className="h-3.5 w-3.5 text-skyglass" />}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium text-slate-100">{user.username}</p>
                {user.id === selfId && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">you</span>}
                {user.host && <Crown className="h-3.5 w-3.5 text-amberglow" />}
              </div>
              <p className="text-xs text-slate-400">
                {user.handRaised ? "Hand raised" : user.screenSharing ? "Sharing screen" : user.speaking ? "Speaking now" : "Online"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-2">
              {user.handRaised && <Hand className="h-4 w-4 text-amberglow" />}
              {user.screenSharing && <ScreenShare className="h-4 w-4 text-mint" />}
              {user.video && <Video className="h-4 w-4 text-skyglass" />}
              {user.muted ? <MicOff className="h-4 w-4 text-slate-500" /> : <Mic className="h-4 w-4 text-slate-400" />}
              {canAdjustVolume && (
                <div className="relative">
                  <button
                    type="button"
                    title="Adjust volume"
                    onClick={() => setVolumeOpenId((id) => (id === user.id ? null : user.id))}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                  {volumeOpenId === user.id && (
                    <div className="absolute right-0 top-8 z-20 w-48 rounded-lg border border-line bg-panel p-3 shadow-2xl">
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-slate-200">{user.username}</span>
                        <span className="text-slate-400">{volume}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={volume}
                        onChange={(event) => onPeerVolumeChange?.(user.id, event.target.value)}
                        className="w-full accent-mint"
                      />
                    </div>
                  )}
                </div>
              )}
              {isHost && user.id !== selfId && (
                <>
                  <button
                    type="button"
                    title={user.muted ? "Unmute participant" : "Mute participant"}
                    onClick={() => onHostMute?.(user.id, !user.muted)}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100"
                  >
                    <ShieldX className={`h-3.5 w-3.5 ${user.muted ? "text-amberglow" : ""}`} />
                  </button>
                  {!user.host && (
                    <button
                      type="button"
                      title="Remove participant"
                      onClick={() => onKick?.(user.id)}
                      className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-red-200"
                    >
                      <UserX className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
          );
        })}
      </div>
    </aside>
  );
}
