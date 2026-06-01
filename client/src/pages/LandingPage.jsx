import { useState } from "react";
import { motion } from "framer-motion";
import { Headphones, LogIn, Plus, Radio, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "../lib/api";
import { getGuestName, setGuestName } from "../lib/guest";

export default function LandingPage() {
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [username, setUsername] = useState(getGuestName());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function handleCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setGuestName(username);
      const { room } = await createRoom(roomName || "GalBaat Room");
      navigate(`/r/${room.roomId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleJoin(event) {
    event.preventDefault();
    if (!joinCode.trim()) return;
    setGuestName(username);
    navigate(`/r/${joinCode.trim().toUpperCase()}`);
  }

  return (
    <main className="min-h-screen overflow-hidden px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-lg bg-mint text-ink">
              <Radio className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xl font-black tracking-normal">GalBaat</p>
              <p className="text-xs text-slate-400">Live rooms, instant voice</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-line bg-white/[0.04] px-4 py-2 text-sm text-slate-300 sm:inline-flex">
            No accounts. No waiting.
          </span>
        </nav>

        <section className="grid flex-1 items-center gap-8 py-10 lg:grid-cols-[1.08fr_0.92fr]">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.05] px-4 py-2 text-sm text-slate-300">
              <Sparkles className="h-4 w-4 text-amberglow" />
              Walkie-talkie rooms for teams, friends, and quick ops
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">
              GalBaat
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Create a room, share the link, and hold to talk. Voice, chat, participant presence, and room history are ready the moment people arrive.
            </p>

            <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3 text-sm text-slate-300">
              {["Push-to-talk", "WebRTC voice", "Live chat"].map((item) => (
                <div key={item} className="rounded-lg border border-line bg-white/[0.04] px-4 py-3 text-center">
                  {item}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glass rounded-lg p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-lg bg-skyglass/15 text-skyglass">
                <Headphones className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Start talking</h2>
                <p className="text-sm text-slate-400">Pick a display name and room.</p>
              </div>
            </div>

            <label className="mb-4 block">
              <span className="mb-2 block text-sm text-slate-300">Anonymous name</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-md border border-line bg-ink/60 px-4 py-3 text-slate-100 outline-none ring-mint/30 focus:ring-4"
                maxLength={24}
              />
            </label>

            <form onSubmit={handleCreate} className="space-y-3">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">New room name</span>
                <input
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder="Evening standup"
                  className="w-full rounded-md border border-line bg-ink/60 px-4 py-3 text-slate-100 outline-none ring-mint/30 placeholder:text-slate-500 focus:ring-4"
                  maxLength={64}
                />
              </label>
              <button
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-mint px-4 py-3 font-bold text-ink hover:bg-mint/90 disabled:opacity-60"
              >
                <Plus className="h-5 w-5" />
                Create Room
              </button>
            </form>

            <div className="my-5 flex items-center gap-3 text-xs uppercase text-slate-500">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={handleJoin} className="space-y-3">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Room code"
                className="w-full rounded-md border border-line bg-ink/60 px-4 py-3 uppercase text-slate-100 outline-none ring-skyglass/30 placeholder:normal-case placeholder:text-slate-500 focus:ring-4"
                maxLength={12}
              />
              <button className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-line bg-white/[0.06] px-4 py-3 font-bold text-slate-100 hover:bg-white/10">
                <LogIn className="h-5 w-5" />
                Join Room
              </button>
            </form>

            {error && <p className="mt-4 rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
          </motion.div>
        </section>
      </div>
    </main>
  );
}
