import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, Headphones, LogIn, Plus, Radio, Sparkles } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createRoom } from "../lib/api";
import { getGuestName, setGuestName } from "../lib/guest";
import { FAQ_ITEMS, HOME_META, SEO_PAGES, usePageMeta } from "../lib/seo.js";

export default function LandingPage() {
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [username, setUsername] = useState(getGuestName());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const navigate = useNavigate();
  usePageMeta(HOME_META);

  async function handleCreate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setGuestName(username);
      const { room } = await createRoom(roomName || "Talkietiv Room");
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
    <main className="min-h-screen overflow-x-hidden px-4 py-4 text-slate-100 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl flex-col sm:min-h-[calc(100vh-3rem)]">
        <nav className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-mint text-ink sm:h-11 sm:w-11">
              <Radio className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
            <div>
              <p className="text-lg font-black tracking-normal sm:text-xl">Talkietiv</p>
              <p className="text-xs text-slate-400">Live rooms, instant voice</p>
            </div>
          </div>
          <span className="hidden rounded-full border border-line bg-white/[0.04] px-4 py-2 text-sm text-slate-300 sm:inline-flex">
            No accounts. No waiting.
          </span>
        </nav>

        <section className="grid flex-1 items-center gap-6 py-8 sm:py-10 lg:grid-cols-[1.08fr_0.92fr]">
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-white/[0.05] px-3 py-2 text-xs text-slate-300 sm:mb-6 sm:px-4 sm:text-sm">
              <Sparkles className="h-4 w-4 text-amberglow" />
              <span className="min-w-0 truncate">Voice • Chat • Screen Share • Whiteboard • Camera • Music</span>
            </div>
            <h1 className="max-w-3xl py-1 text-4xl font-black !leading-[1.15] tracking-normal text-white sm:text-6xl lg:text-7xl">
              Free Online Voice Chat &amp; Collaboration Rooms
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:mt-6 sm:text-lg sm:leading-8">
              Create private rooms instantly with voice chat, messaging, screen sharing, whiteboard, camera, music sharing, and more. No downloads. No account required.
            </p>

            <div className="mt-6 grid max-w-2xl grid-cols-1 gap-2 text-sm text-slate-300 min-[420px]:grid-cols-3 sm:mt-8 sm:gap-3">
              {["Push-to-talk", "Voice chat, no account", "Live collaboration"].map((item) => (
                <div key={item} className="rounded-lg border border-line bg-white/[0.04] px-3 py-3 text-center sm:px-4">
                  {item}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="glass rounded-lg p-4 shadow-2xl sm:p-5"
          >
            <div className="mb-5 flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-skyglass/15 text-skyglass sm:h-12 sm:w-12">
                <Headphones className="h-5 w-5 sm:h-6 sm:w-6" />
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
                className="w-full rounded-md border border-line bg-ink/60 px-4 py-3 text-base text-slate-100 outline-none ring-mint/30 focus:ring-4 sm:text-sm"
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
                  className="w-full rounded-md border border-line bg-ink/60 px-4 py-3 text-base text-slate-100 outline-none ring-mint/30 placeholder:text-slate-500 focus:ring-4 sm:text-sm"
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
                className="w-full rounded-md border border-line bg-ink/60 px-4 py-3 text-base uppercase text-slate-100 outline-none ring-skyglass/30 placeholder:normal-case placeholder:text-slate-500 focus:ring-4 sm:text-sm"
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

        <section id="faq" className="border-t border-line py-10 sm:py-14" aria-labelledby="faq-heading">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-mint">Talkietiv FAQ</p>
            <h2 id="faq-heading" className="mt-2 text-3xl font-black text-white sm:text-4xl">
              Questions about online voice chat, answered
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
              Everything you need to know before starting a no-account voice chat room with your group.
            </p>
          </div>

          <div className="mt-7 divide-y divide-line border-y border-line">
            {FAQ_ITEMS.map((item, index) => {
              const open = openFaq === index;
              return (
                <div key={item.question}>
                  <h3>
                    <button
                      type="button"
                      onClick={() => setOpenFaq((current) => (current === index ? -1 : index))}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-5 py-5 text-left text-sm font-bold text-slate-100 hover:text-mint sm:text-base"
                    >
                      <span>{item.question}</span>
                      <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? "rotate-180 text-mint" : "text-slate-400"}`} />
                    </button>
                  </h3>
                  {open && <p className="max-w-3xl pb-5 text-sm leading-6 text-slate-400 sm:text-base">{item.answer}</p>}
                </div>
              );
            })}
          </div>
        </section>

        <footer className="border-t border-line py-7 sm:py-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-base font-black text-white">Talkietiv</p>
              <p className="mt-1 text-sm text-slate-400">Private rooms. Instant voice.</p>
              <p className="mt-3 text-sm text-white">&copy; Talkietiv 2026</p>
            </div>

            <nav aria-label="Footer navigation" className="flex max-w-xl flex-wrap gap-x-5 gap-y-3 text-sm">
              <Link to={SEO_PAGES.onlineWalkieTalkie.path} className="text-slate-400 hover:text-mint">
                Online walkie-talkie
              </Link>
              <Link to={SEO_PAGES.voiceChatWithoutAccount.path} className="text-slate-400 hover:text-mint">
                Voice chat, no account
              </Link>
              <Link to={SEO_PAGES.groupVoiceChat.path} className="text-slate-400 hover:text-mint">
                Group voice chat
              </Link>
              <Link to={SEO_PAGES.browserVoiceChat.path} className="font-semibold text-slate-100 hover:text-mint">
                Browser voice chat
              </Link>
            </nav>
          </div>
        </footer>
      </div>
    </main>
  );
}
