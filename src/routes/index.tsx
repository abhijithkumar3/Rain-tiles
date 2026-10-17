import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  AtSign,
  Circle,
  Download,
  Eraser,
  Linkedin,
  Mail,
  Share2,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { RainEngine } from "@/lib/rain-engine";
import { ClipRecorder } from "@/lib/clip-recorder";
import { THEMES } from "@/lib/themes";
import { SITE_URL } from "@/lib/site-config";

const PAGE_TITLE = "RainTiles | Draw Glass, Play the Rain";
const PAGE_DESCRIPTION =
  "Create glass panes in a rain-filled canvas and hear every drop ring like a piano note. Tilt, move, and pop panes, choose a color theme, and save short clips.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { property: "og:site_name", content: "RainTiles" },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/` },
      { property: "og:image", content: `${SITE_URL}/raintiles-mark.svg` },
      { property: "og:image:alt", content: "The RainTiles blue, cyan, and violet water mark" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESCRIPTION },
      { name: "twitter:image", content: `${SITE_URL}/raintiles-mark.svg` },
      { name: "twitter:image:alt", content: "The RainTiles blue, cyan, and violet water mark" },
      {
        "script:ld+json": {
          "@context": "https://schema.org",
          "@type": "VideoGame",
          name: "RainTiles",
          description: PAGE_DESCRIPTION,
          genre: ["Music game", "Creative sandbox"],
          gamePlatform: "Web browser",
          url: `${SITE_URL}/`,
          image: `${SITE_URL}/raintiles-mark.svg`,
          author: { "@type": "Person", name: "Abhijithkumar N" },
          inLanguage: "en",
        },
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/` }],
  }),
  component: Index,
});

type Clip = { url: string; blob: Blob; ext: string };

const CREATOR = {
  name: "creator",
  linkedin: "https://www.linkedin.com/in/abhijithkumar3/",
  linkedinLabel: "linkedin",
  emailLabel: "mail",
  email: "abhijithkumar023@gmail.com",
};

function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RainEngine | null>(null);
  const recRef = useRef<ClipRecorder | null>(null);
  const [themeIdx, setThemeIdx] = useState(0);
  const [hint, setHint] = useState<0 | 1 | 2>(0);
  const [showCreator, setShowCreator] = useState(false);
  const [withSound, setWithSound] = useState(true);
  const [busy, setBusy] = useState(false);
  const [clip, setClip] = useState<Clip | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const engine = new RainEngine(canvas, THEMES[0]!, {
      onFirstPane: () => setHint(1),
      onFirstManipulate: () => setHint(2),
      onReset: () => setHint(0),
    });
    engineRef.current = engine;
    const stream = canvas.captureStream(60);
    engine.piano.clipOut.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const rec = new ClipRecorder(stream);
    rec.start();
    recRef.current = rec;
    return () => {
      rec.dispose();
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setTheme(THEMES[themeIdx]!);
  }, [themeIdx]);

  useEffect(() => {
    if (engineRef.current) engineRef.current.piano.clipGain.gain.value = withSound ? 1 : 0;
  }, [withSound]);

  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  };

  const clearAll = () => {
    engineRef.current?.clearAll();
    flash("Cleared — draw again");
  };

  const record = async () => {
    const rec = recRef.current;
    if (!rec?.supported) return flash("Clip recording isn't supported in this browser");
    const p = rec.capture();
    if (!p) return flash("Warming up — try again in a second");
    setBusy(true);
    const blob = await p;
    setBusy(false);
    setClip({ blob, url: URL.createObjectURL(blob), ext: rec.extension });
  };

  const share = async () => {
    if (!clip) return;
    const file = new File([clip.blob], `raintiles.${clip.ext}`, { type: clip.blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "raintiles" });
      } catch {
        /* cancelled */
      }
    } else download();
  };
  const download = () => {
    if (!clip) return;
    const a = document.createElement("a");
    a.href = clip.url;
    a.download = `raintiles.${clip.ext}`;
    a.click();
  };
  const closeClip = () => {
    if (clip) URL.revokeObjectURL(clip.url);
    setClip(null);
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="block touch-none"
        aria-label="RainTiles interactive canvas. Draw, tilt, move, and pop glass panes while rain plays piano notes."
      />

      <div className="brand-lockup">
        <img src="/raintiles-mark.svg" alt="" className="brand-mark" />
        <span className="brand-title">raintiles</span>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-[22%] flex flex-col items-center px-6 text-center">
        <h1 className={`hint ${hint === 0 ? "hint-on" : ""}`}>
          Make music with rain and glass
          <span className="hint-sub">
            draw a rectangle; each drop bounces and rings like a piano note
          </span>
        </h1>
        <p className={`hint absolute ${hint === 1 ? "hint-on" : ""}`}>
          Drag the little ring to tilt
          <span className="hint-sub">drag glass to move · tap to pop</span>
        </p>
      </div>

      <div className="dock" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {THEMES.map((t, i) => (
            <button
              key={t.id}
              aria-label={t.name}
              title={t.name}
              onClick={() => setThemeIdx(i)}
              className={`swatch ${i === themeIdx ? "swatch-on" : ""}`}
              style={{ ["--sw" as string]: t.swatch }}
            />
          ))}
        </div>
        <span className="dock-sep" />
        <button
          className="dock-btn"
          aria-label={withSound ? "Clip sound on" : "Clip silent"}
          title={withSound ? "Clip with sound" : "Silent clip"}
          onClick={() => setWithSound((s) => !s)}
        >
          {withSound ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button
          className="rec-btn"
          onClick={record}
          disabled={busy}
          aria-label="Record last 12 seconds"
        >
          <Circle size={10} className="rec-dot" fill="currentColor" />
          {busy ? "Saving…" : "Clip"}
        </button>
      </div>
      <button
        className="clear-btn"
        onClick={clearAll}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Clear all glass and start over"
        title="Clear all glass and start over"
      >
        <Eraser size={15} />
        Clear
      </button>
      <button
        className="creator-btn"
        onClick={() => setShowCreator((s) => !s)}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="Show the creator"
        aria-expanded={showCreator}
        title={CREATOR.name}
      >
        <UserRound size={15} />
        {CREATOR.name}
      </button>
      {showCreator && (
        <div className="creator-card" onPointerDown={(e) => e.stopPropagation()}>
          <div className="creator-head">
            <span className="creator-role">{CREATOR.name}</span>
            <button
              className="creator-close"
              onClick={() => setShowCreator(false)}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <a
            className="creator-row"
            href={CREATOR.linkedin}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Linkedin size={15} />
            <span>{CREATOR.linkedinLabel}</span>
          </a>
          <a className="creator-row" href={`mailto:${CREATOR.email}`}>
            <Mail size={15} />
            <span>{CREATOR.email}</span>
          </a>
        </div>
      )}
      <p className="theme-name">{THEMES[themeIdx]!.name}</p>

      {toast && <div className="toast">{toast}</div>}

      {clip && (
        <div className="clip-backdrop" onClick={closeClip}>
          <div className="clip-card" onClick={(e) => e.stopPropagation()}>
            <button className="clip-close" onClick={closeClip} aria-label="Close">
              <X size={18} />
            </button>
            <video src={clip.url} autoPlay loop playsInline controls className="clip-video" />
            <div className="flex gap-2">
              <button className="clip-action clip-primary" onClick={share}>
                <Share2 size={16} /> Share
              </button>
              <button className="clip-action" onClick={download}>
                <Download size={16} /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
