"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link2, LoaderCircle, Pause, Play, RotateCcw, Star } from "lucide-react";
import { cn } from "cn";

import { ReelStage } from "@/components/reel-stage";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DEMOS, demoById } from "@/lib/demos";
import { downloadBlob, exportReelGif } from "@/lib/export-gif";
import { formatTimecode } from "@/lib/format";
import { reelFromPaste } from "@/lib/reel";
import { decodeShare, encodeShare, replaceShareUrl, type ShareState } from "@/lib/share";
import { beatAt, buildTimeline, type Timeline } from "@/lib/timeline";
import type { DiffReel } from "@/lib/types";

const REPO_URL = "https://github.com/whynotartmoney/diffcast-co";

const BEFORE_PLACEHOLDER = `function greet(name) {
  return "Hello, " + name;
}`;

const AFTER_PLACEHOLDER = `export function greet(name: string) {
  return \`Hello, \${name}\`;
}`;

export function Studio() {
  const [reel, setReel] = useState<DiffReel>(DEMOS[0].reel);
  const [booted, setBooted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [cut, setCut] = useState<"play" | "gif">("play");
  const [tab, setTab] = useState("url");
  const [compareInput, setCompareInput] = useState("");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [filename, setFilename] = useState("snippet.ts");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"ready" | "loading">("ready");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exporting, setExporting] = useState<{ frame: number; total: number } | null>(null);
  const [loadedCompare, setLoadedCompare] = useState<string | null>(null);

  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const reelRef = useRef(reel);
  const timelineRef = useRef<Timeline>(buildTimeline(DEMOS[0].reel, "play"));
  const skipReset = useRef(true);

  const playTimeline = useMemo(() => buildTimeline(reel, "play"), [reel]);
  const gifTimeline = useMemo(() => buildTimeline(reel, "gif"), [reel]);
  const timeline = cut === "gif" ? gifTimeline : playTimeline;
  timelineRef.current = timeline;
  reelRef.current = reel;

  const onTick = useCallback((next: number, ended: boolean) => {
    setTime(next);
    if (ended) setPlaying(false);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const share = decodeShare(window.location.search, window.location.hash);

    const arm = (next: DiffReel, autoplay: boolean) => {
      setReel(next);
      setBooted(true);
      if (autoplay && !reduce) {
        playingRef.current = true;
        setPlaying(true);
      }
    };

    if (share === "invalid") {
      setError("That share link didn't decode. Playing the React Hooks reel instead.");
      replaceShareUrl(encodeShare({ kind: "demo", id: DEMOS[0].id }).path);
      arm(DEMOS[0].reel, true);
      return;
    }

    if (!share) {
      replaceShareUrl(encodeShare({ kind: "demo", id: DEMOS[0].id }).path);
      arm(DEMOS[0].reel, true);
      return;
    }

    if (share.kind === "demo") {
      arm(demoById(share.id)?.reel ?? DEMOS[0].reel, true);
      return;
    }

    if (share.kind === "paste") {
      setTab("paste");
      setBefore(share.before);
      setAfter(share.after);
      setFilename(share.filename);
      setTitle(share.title === "Untitled reel" ? "" : share.title);
      const made = reelFromPaste(share);
      if ("error" in made) {
        setError(made.error);
        arm(DEMOS[0].reel, true);
      } else {
        arm(made.reel, true);
      }
      return;
    }

    setCompareInput(share.url);
    setBooted(true);
    void loadCompare(share.url, !reduce);
  }, []);

  useEffect(() => {
    if (skipReset.current) {
      skipReset.current = false;
      return;
    }
    timeRef.current = 0;
    setTime(0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    playingRef.current = !reduce;
    setPlaying(!reduce);
  }, [reel.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      if (exporting) return;
      if (event.key === " ") {
        event.preventDefault();
        toggle();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seek(timeRef.current + 1000);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        seek(timeRef.current - 1000);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function seek(next: number) {
    const clamped = Math.max(0, Math.min(next, timeline.duration - 1));
    timeRef.current = clamped;
    setTime(clamped);
  }

  function toggle() {
    if (exporting) return;
    if (timeRef.current >= timeline.duration - 30) {
      timeRef.current = 0;
      setTime(0);
      playingRef.current = true;
      setPlaying(true);
      return;
    }
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  }

  function playDemo(id: string) {
    const demo = demoById(id);
    if (!demo) return;
    setError(null);
    setNotice(null);
    setStatus("ready");
    setLoadedCompare(null);
    setReel(demo.reel);
    const encoded = encodeShare({ kind: "demo", id });
    replaceShareUrl(encoded.path);
  }

  async function loadCompare(url: string, autoplay = true) {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a GitHub compare, commit, or pull URL.");
      return;
    }
    setStatus("loading");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/compare?url=${encodeURIComponent(trimmed)}`);
      const body = (await response.json()) as DiffReel & { error?: string };
      if (!response.ok) {
        throw new Error(body.error || "GitHub could not load that compare.");
      }
      setReel(body);
      setLoadedCompare(trimmed);
      setCompareInput(trimmed);
      replaceShareUrl(encodeShare({ kind: "github", url: trimmed }).path);
      if (!autoplay) {
        playingRef.current = false;
        setPlaying(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "GitHub could not load that compare.");
    } finally {
      setStatus("ready");
    }
  }

  function cutPaste() {
    const made = reelFromPaste({ before, after, filename, title });
    if ("error" in made) {
      setError(made.error);
      return;
    }
    setError(null);
    setNotice(null);
    setStatus("ready");
    setLoadedCompare(null);
    setReel(made.reel);
    const share: ShareState = {
      kind: "paste",
      before,
      after,
      filename: filename.trim() || "snippet.ts",
      title: title.trim() || "Untitled reel",
    };
    const encoded = encodeShare(share);
    if (encoded.overflow) {
      replaceShareUrl("/");
      setNotice("Reel is ready. This paste is too long to store in the link — export a GIF to share it.");
      return;
    }
    replaceShareUrl(encoded.path);
  }

  async function onExport() {
    if (exporting) return;
    const frames = Math.max(1, Math.round(gifTimeline.duration / 100));
    const previous = timeRef.current;
    const wasPlaying = playingRef.current;
    playingRef.current = false;
    setPlaying(false);
    setCut("gif");
    timelineRef.current = gifTimeline;
    timeRef.current = 0;
    setTime(0);
    setExporting({ frame: 0, total: frames });
    setNotice(null);
    try {
      const blob = await exportReelGif(reel, gifTimeline, (frame, total) => {
        timeRef.current = Math.min(gifTimeline.duration - 1, (frame - 1) * 100);
        setTime(timeRef.current);
        setExporting({ frame, total });
      });
      downloadBlob(blob, reel.repo);
      setNotice("GIF saved. 720p, about 8 seconds, and it loops.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not export the GIF.");
    } finally {
      setCut("play");
      timelineRef.current = playTimeline;
      timeRef.current = Math.min(previous, Math.max(0, playTimeline.duration - 1));
      setTime(timeRef.current);
      playingRef.current = wasPlaying;
      setPlaying(wasPlaying);
      setExporting(null);
    }
  }

  async function onShare() {
    const state: ShareState =
      reel.source === "github" && loadedCompare
        ? { kind: "github", url: loadedCompare }
        : reel.source === "paste"
          ? {
              kind: "paste",
              before,
              after,
              filename: filename.trim() || "snippet.ts",
              title: title.trim() || reel.message,
            }
          : { kind: "demo", id: reel.id };

    const encoded = encodeShare(state);
    if (encoded.overflow) {
      setNotice("This paste is too long for a link. Export a GIF instead.");
      return;
    }
    replaceShareUrl(encoded.path);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("Link copied.");
    } catch {
      setNotice("Link is in the address bar. Clipboard permission was blocked.");
    }
  }

  const beat = beatAt(timeline, time);
  const atEnd = time >= timeline.duration - 30;
  const announcement =
    beat.beat.kind === "title"
      ? `${reel.repo}. ${reel.message}`
      : beat.beat.kind === "files"
        ? `${reel.files.length} files in the reel.`
        : beat.beat.kind === "hunk"
          ? `Showing ${reel.files[beat.beat.fileIndex ?? 0]?.filename ?? "a file"}.`
          : beat.beat.kind === "spotlight"
            ? (beat.beat.spotlight ?? "Highlight")
            : "End card.";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1240px] flex-col px-4 py-5 sm:px-6 sm:py-7">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-mono text-[13px] tracking-[0.22em] text-[#e7e1d6]">DIFFCAST</span>
          <span className="hidden text-sm text-[#9a948a] sm:inline">Carbon for motion</span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          <p className="hidden font-mono text-[11px] tracking-[0.16em] text-[#9a948a] sm:block">MIT · NO INSTALL</p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Star on GitHub (opens in a new tab)"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "font-mono text-[11px] tracking-[0.12em] text-[#cfc8bb]",
            )}
          >
            <Star aria-hidden="true" className="text-[#e8b86d]" />
            Star on GitHub
          </a>
        </div>
      </header>

      <div className="mt-8 max-w-[720px]">
        <p className="font-mono text-[11px] tracking-[0.22em] text-[#e8b86d]">IN THE BROWSER</p>
        <h1 className="mt-3 font-serif text-[2.6rem] leading-[0.92] text-[#e7e1d6] sm:text-6xl">
          Paste a compare.
          <br />
          Watch it cut.
        </h1>
        <p className="mt-4 max-w-[38rem] text-sm leading-relaxed text-[#b7b1a6] sm:text-[15px]">
          A GitHub compare URL, or two blocks of code. Diffcast plays the change as a short reel —
          title, files, hunks, the numbers — then exports a GIF. Three famous releases are already
          loaded, and they play with the network off.
        </p>
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <section className="order-1 min-w-0">
          <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#070809] shadow-[0_40px_120px_rgba(0,0,0,0.45)]">
            {booted ? (
              <ReelStage
                reelRef={reelRef}
                timelineRef={timelineRef}
                timeRef={timeRef}
                playingRef={playingRef}
                label={`${reel.repo}. ${announcement}`}
                onTick={onTick}
              />
            ) : (
              <div className="flex aspect-video items-end bg-[#070809] p-6">
                <p className="font-mono text-xs tracking-[0.18em] text-[#e8b86d]">THREADING THE REEL</p>
              </div>
            )}
            {status === "loading" ? (
              <div className="absolute inset-0 flex flex-col justify-end bg-[#070809]/78 p-6 sm:p-8">
                <p className="font-mono text-[11px] tracking-[0.2em] text-[#e8b86d]">ASKING GITHUB</p>
                <p className="mt-3 max-w-[36rem] font-mono text-sm leading-relaxed text-[#e7e1d6]">
                  {compareInput}
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex items-center gap-3">
            <Button
              type="button"
              size="icon-lg"
              variant="outline"
              aria-label={playing ? "Pause" : atEnd ? "Replay" : "Play"}
              onClick={toggle}
              disabled={!booted || Boolean(exporting)}
            >
              {playing ? <Pause /> : atEnd ? <RotateCcw /> : <Play />}
            </Button>
            <p className="w-[7.5rem] shrink-0 font-mono text-xs tabular-nums text-[#cfc8bb]">
              {formatTimecode(time)}
              <span className="text-[#6f6a62]"> / {formatTimecode(timeline.duration)}</span>
            </p>
            <Slider
              aria-label="Scrub the reel"
              min={0}
              max={Math.max(1, timeline.duration)}
              step={1}
              value={[Math.min(time, timeline.duration)]}
              disabled={!booted || Boolean(exporting)}
              onValueChange={(value) => {
                const next = Array.isArray(value) ? value[0] : value;
                seek(next);
              }}
              className="min-w-0 flex-1"
            />
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void onExport()} disabled={!booted || Boolean(exporting)}>
                {exporting ? (
                  <>
                    <LoaderCircle className="animate-spin" />
                    GIF {exporting.frame}/{exporting.total}
                  </>
                ) : (
                  "Export GIF"
                )}
              </Button>
              <Button type="button" variant="outline" onClick={() => void onShare()} disabled={!booted || Boolean(exporting)}>
                <Link2 />
                Copy link
              </Button>
            </div>
            <p className="font-mono text-[11px] tracking-wide text-[#6f6a62]">
              Space plays. Arrows scrub. GIF is a 720p cut, about 8s.
            </p>
          </div>

          <p className="mt-3 font-mono text-xs text-[#9a948a]">
            {reel.repo}
            <span className="text-[#3c403c]"> · </span>
            {reel.author}
            <span className="text-[#3c403c]"> · </span>
            {reel.kicker.toLowerCase()}
            {reel.sourceUrl ? (
              <>
                <span className="text-[#3c403c]"> · </span>
                <a
                  href={reel.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#e8b86d] underline-offset-4 hover:underline"
                >
                  Source
                </a>
              </>
            ) : null}
          </p>

          {error ? (
            <p className="mt-3 rounded-lg border border-[#ff8d86]/30 bg-[#ff8d86]/10 px-3 py-2 text-sm text-[#ffd0cc]" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? <p className="mt-3 text-sm text-[#d9d3c7]">{notice}</p> : null}
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </section>

        <aside className="order-2 min-w-0">
          <p className="font-mono text-[11px] tracking-[0.18em] text-[#9a948a]">CANNED REELS</p>
          <ul className="mt-3 flex flex-col gap-2">
            {DEMOS.map((demo) => {
              const active = reel.id === demo.id;
              return (
                <li key={demo.id}>
                  <button
                    type="button"
                    onClick={() => playDemo(demo.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      active
                        ? "border-[#e8b86d]/70 bg-white/[0.04]"
                        : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <span className="block font-mono text-[10px] tracking-[0.16em] text-[#e8b86d]">
                      {demo.reel.repo}
                    </span>
                    <span className="mt-1 block text-sm text-[#e7e1d6]">{demo.reel.message}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-[#9a948a]">{demo.blurb}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <Tabs
            value={tab}
            onValueChange={(value) => {
              if (typeof value === "string") setTab(value);
            }}
            className="mt-6"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="url">Compare URL</TabsTrigger>
              <TabsTrigger value="paste">Before / after</TabsTrigger>
            </TabsList>
            <TabsContent value="url" className="mt-3">
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadCompare(compareInput);
                }}
              >
                <label className="flex flex-col gap-1.5 text-xs text-[#9a948a]">
                  Public GitHub compare, commit, or pull URL
                  <Input
                    value={compareInput}
                    onChange={(event) => setCompareInput(event.target.value)}
                    placeholder="https://github.com/facebook/react/compare/v16.7.0...v16.8.0"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    className="font-mono text-xs"
                  />
                </label>
                <Button type="submit" disabled={status === "loading"}>
                  {status === "loading" ? "Fetching" : "Load compare"}
                </Button>
                <p className="text-xs leading-relaxed text-[#6f6a62]">
                  Unauthenticated. If GitHub rate-limits the request, paste the diff — the canned
                  reels never need the API.
                </p>
              </form>
            </TabsContent>
            <TabsContent value="paste" className="mt-3">
              <form
                className="flex flex-col gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  cutPaste();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <label className="flex flex-col gap-1.5 text-xs text-[#9a948a]">
                    Filename
                    <Input
                      value={filename}
                      onChange={(event) => setFilename(event.target.value)}
                      spellCheck={false}
                      className="font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs text-[#9a948a]">
                    Title on the card
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="Untitled reel"
                      className="text-sm"
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1.5 text-xs text-[#9a948a]">
                  Before
                  <Textarea
                    value={before}
                    onChange={(event) => setBefore(event.target.value)}
                    placeholder={BEFORE_PLACEHOLDER}
                    spellCheck={false}
                    className="field-sizing-fixed min-h-32 font-mono text-xs"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-xs text-[#9a948a]">
                  After
                  <Textarea
                    value={after}
                    onChange={(event) => setAfter(event.target.value)}
                    placeholder={AFTER_PLACEHOLDER}
                    spellCheck={false}
                    className="field-sizing-fixed min-h-32 font-mono text-xs"
                  />
                </label>
                <Button type="submit">Cut the reel</Button>
              </form>
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      <footer className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-4 text-xs text-[#9a948a] sm:flex-row sm:items-center sm:justify-between">
        <p>Highlights, not full diffs. The movie is the point.</p>
        <a
          href="https://buymeacoffee.com/whynotartmoney"
          target="_blank"
          rel="noreferrer"
          className="text-[#e8b86d] underline-offset-4 hover:underline"
        >
          Buy me a coffee
        </a>
        <p lang="zh-Hant">把 compare URL 貼上，看成一支短片，再匯出 GIF。</p>
      </footer>
    </div>
  );
}
