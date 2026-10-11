import { pickHunks, spotlightLine } from "@/lib/reel";
import type { DiffReel } from "@/lib/types";

export type BeatKind = "title" | "files" | "hunk" | "spotlight" | "stats";

export interface Beat {
  kind: BeatKind;
  start: number;
  duration: number;
  fileIndex?: number;
  hunkIndex?: number;
  spotlight?: string;
}

export interface Timeline {
  beats: Beat[];
  duration: number;
  mode: "play" | "gif";
}

const GIF_TOTAL = 8000;

function push(beats: Beat[], beat: Omit<Beat, "start">) {
  const start = beats.length === 0 ? 0 : beats[beats.length - 1].start + beats[beats.length - 1].duration;
  beats.push({ ...beat, start });
}

export function buildTimeline(reel: DiffReel, mode: "play" | "gif"): Timeline {
  const spot = spotlightLine(reel);
  const hunks = pickHunks(reel, mode === "gif" ? 1 : spot ? 2 : 3, mode === "gif" ? "best" : "story");
  const spotlight = spot ?? (hunks.length === 0 ? "No lines changed." : null);
  const beats: Beat[] = [];

  if (mode === "gif") {
    const plan = gifPlan(hunks.length > 0, Boolean(spotlight));
    push(beats, { kind: "title", duration: plan.title });
    push(beats, { kind: "files", duration: plan.files });
    for (const hunk of hunks) {
      push(beats, { kind: "hunk", duration: plan.hunk, ...hunk });
    }
    if (plan.spot > 0 && spotlight) {
      push(beats, { kind: "spotlight", duration: plan.spot, spotlight });
    }
    push(beats, { kind: "stats", duration: plan.stats });
  } else {
    push(beats, { kind: "title", duration: 3400 });
    push(beats, {
      kind: "files",
      duration: Math.min(4200, 2400 + Math.max(0, reel.files.length - 1) * 220),
    });
    for (const hunk of hunks) {
      const file = reel.files[hunk.fileIndex];
      const lines = file?.hunks[hunk.hunkIndex]?.lines.length ?? 8;
      push(beats, {
        kind: "hunk",
        duration: Math.min(4800, Math.max(2600, 1500 + lines * 110)),
        ...hunk,
      });
    }
    if (spotlight) push(beats, { kind: "spotlight", duration: 2400, spotlight });
    push(beats, { kind: "stats", duration: 3200 });
  }

  const duration = beats.reduce((sum, beat) => sum + beat.duration, 0);
  return { beats, duration, mode };
}

function gifPlan(hasHunk: boolean, hasSpot: boolean) {
  if (!hasHunk) return { title: 2200, files: 2000, hunk: 0, spot: hasSpot ? 1800 : 0, stats: hasSpot ? 2000 : 3800 };
  if (!hasSpot) return { title: 1700, files: 1500, hunk: 3000, spot: 0, stats: 1800 };
  return { title: 1500, files: 1300, hunk: 2300, spot: 1300, stats: 1600 };
}

export function beatAt(timeline: Timeline, time: number): { beat: Beat; index: number; local: number } {
  const last = timeline.beats.length - 1;
  const t = Math.max(0, Math.min(time, Math.max(0, timeline.duration - 1)));
  let index = timeline.beats.findIndex((beat, i) => {
    const end = beat.start + beat.duration;
    return t >= beat.start && (i === last || t < end);
  });
  if (index < 0) index = last;
  const beat = timeline.beats[index];
  return { beat, index, local: t - beat.start };
}

export const GIF_DURATION_MS = GIF_TOTAL;

export function beatLabel(beat: Beat, index: number, timeline: Timeline): string {
  if (beat.kind === "hunk") {
    const hunks = timeline.beats.filter((item) => item.kind === "hunk");
    const ordinal = hunks.indexOf(beat) + 1;
    return `HUNK ${ordinal}/${hunks.length}`;
  }
  if (beat.kind === "spotlight" && index >= 0) return "THE LINE";
  return beat.kind.toUpperCase();
}
