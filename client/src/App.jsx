import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import LandingPage from "./pages/LandingPage.jsx";
import { SEO_PAGES } from "./lib/seo.js";

const RoomPage = lazy(() => import("./pages/RoomPage.jsx"));
const SeoPage = lazy(() => import("./pages/SeoPage.jsx"));

function RouteLoader() {
  return <main className="grid min-h-screen place-items-center bg-ink text-sm text-slate-400">Loading Talkietiv...</main>;
}

export default function App() {
  return (
    <>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path={SEO_PAGES.onlineWalkieTalkie.path} element={<SeoPage page={SEO_PAGES.onlineWalkieTalkie} />} />
          <Route path={SEO_PAGES.voiceChatWithoutAccount.path} element={<SeoPage page={SEO_PAGES.voiceChatWithoutAccount} />} />
          <Route path={SEO_PAGES.browserVoiceChat.path} element={<SeoPage page={SEO_PAGES.browserVoiceChat} />} />
          <Route path={SEO_PAGES.groupVoiceChat.path} element={<SeoPage page={SEO_PAGES.groupVoiceChat} />} />
          <Route path="/r/:roomId" element={<RoomPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
