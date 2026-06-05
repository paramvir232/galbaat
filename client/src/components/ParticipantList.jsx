import { Mic, MicOff, Radio, Signal, Video } from "lucide-react";
import { motion } from "framer-motion";

export default function ParticipantList({ participants, selfId }) {
  return (
    <aside className="glass flex min-h-0 flex-col rounded-lg p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-100">Participants</h2>
        <span className="rounded-full bg-white/[0.08] px-2.5 py-1 text-xs text-slate-300">{participants.length}</span>
      </div>
      <div className="scrollbar-thin min-h-0 space-y-2 overflow-y-auto pr-1">
        {participants.map((user) => (
          <motion.div
            key={user.id}
            layout
            className={`flex items-center gap-3 rounded-lg border p-3 ${
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
              </div>
              <p className="text-xs text-slate-400">{user.speaking ? "Speaking now" : "Online"}</p>
            </div>
            <div className="flex items-center gap-2">
              {user.video && <Video className="h-4 w-4 text-skyglass" />}
              {user.muted ? <MicOff className="h-4 w-4 text-slate-500" /> : <Mic className="h-4 w-4 text-slate-400" />}
            </div>
          </motion.div>
        ))}
      </div>
    </aside>
  );
}
