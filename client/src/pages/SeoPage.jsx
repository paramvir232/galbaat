import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { SITE_NAME, usePageMeta } from "../lib/seo.js";
import BrandMark from "../components/BrandMark.jsx";

export default function SeoPage({ page }) {
  usePageMeta(page);

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-4 text-slate-100 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <nav className="apple-surface flex items-center justify-between gap-4 rounded-xl px-4 py-3 sm:px-5">
          <Link to="/" className="flex items-center gap-3" aria-label={`${SITE_NAME} home`}>
            <BrandMark className="h-10 w-10" />
            <span>
              <span className="block text-lg font-black">{SITE_NAME}</span>
              <span className="block text-xs text-slate-400">Live rooms, instant voice</span>
            </span>
          </Link>
          <Link to="/" className="inline-flex shrink-0 items-center gap-2 rounded-md bg-mint px-3 py-2 text-sm font-bold text-black shadow-glow hover:bg-[#ff9d2f] sm:px-4">
            Create room
            <ArrowRight className="h-4 w-4" />
          </Link>
        </nav>

        <article className="py-12 sm:py-16">
          <header className="max-w-3xl">
            <p className="text-sm font-semibold text-mint">{page.eyebrow}</p>
            <h1 className="mt-3 text-4xl font-black !leading-[1.12] text-white sm:text-5xl">{page.heading}</h1>
            <p className="mt-5 text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">{page.intro}</p>
          </header>

          <section className="mt-12 border-y border-line py-8 sm:mt-16 sm:py-10" aria-labelledby="how-it-works">
            <h2 id="how-it-works" className="text-2xl font-black text-white">How it works</h2>
            <ol className="mt-6 grid gap-5 sm:grid-cols-3">
              {page.steps.map((step, index) => (
                <li key={step} className="border-l-2 border-mint/70 pl-4 text-sm leading-6 text-slate-300">
                  <span className="mb-2 block text-xs font-black text-mint">0{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-12 sm:mt-16" aria-labelledby="why-talkietiv">
            <h2 id="why-talkietiv" className="text-2xl font-black text-white">Why use Talkietiv?</h2>
            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              {page.benefits.map(([title, detail]) => (
                <div key={title} className="border-t border-line pt-4">
                  <h3 className="font-bold text-slate-100">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-12 border-t border-line pt-8 sm:mt-16 sm:pt-10" aria-labelledby="page-faq">
            <h2 id="page-faq" className="text-2xl font-black text-white">Frequently asked questions</h2>
            <div className="mt-5 divide-y divide-line">
              {page.faq.map((item) => (
                <div key={item.question} className="py-5">
                  <h3 className="font-bold text-slate-100">{item.question}</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-12 flex flex-col items-start justify-between gap-5 border-t border-line pt-8 sm:mt-16 sm:flex-row sm:items-center sm:pt-10">
            <div>
              <h2 className="text-2xl font-black text-white">Ready to start talking?</h2>
              <p className="mt-2 text-sm text-slate-400">Create a private room and share it with your group.</p>
            </div>
            <Link to="/" className="inline-flex items-center gap-2 rounded-md bg-mint px-4 py-3 font-bold text-ink hover:bg-mint/90">
              Create a free room
              <ArrowRight className="h-5 w-5" />
            </Link>
          </section>
        </article>
      </div>
    </main>
  );
}
