import { Crown, Hand, Mic, MicOff, Radio, ScreenShare, ShieldX, Signal, UserX, Video } from "lucide-react";
import { motion } from "framer-motion";

export default function ParticipantList({ participants, selfId, isHost = false, onHostMute, onKick }) {
  return (
    <aside className="glass flex h-full min-h-0 flex-col rounded-lg p-3 sm:p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">Participants</h2>
        <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-xs text-slate-300">{participants.length}</span>
      </div>
      <div className="scrollbar-thin min-h-0 space-y-2 overflow-y-auto pr-1">
        {participants.map((user) => (
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
              {isHost && user.id !== selfId && (
                <>
                  <button
                    type="button"
                    title="Mute participant"
                    onClick={() => onHostMute?.(user.id)}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-white/10 hover:text-slate-100"
                  >
                    <ShieldX className="h-3.5 w-3.5" />
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
        ))}
      </div>
    </aside>
  );
}
