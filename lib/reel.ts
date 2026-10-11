import { structuredPatch } from "diff";

import { languageFromFilename, windowHunks } from "@/lib/parse-patch";
import type { DiffFile, DiffHunk, DiffLine, DiffReel, ReelTotals } from "@/lib/types";

export function reelStats(reel: DiffReel): ReelTotals {
  if (reel.totals) return reel.totals;
  return {
    files: reel.files.length,
    additions: reel.files.reduce((sum, file) => sum + file.additions, 0),
    deletions: reel.files.reduce((sum, file) => sum + file.deletions, 0),
  };
}

export interface HunkRef {
  fileIndex: number;
  hunkIndex: number;
}

export function pickHunks(reel: DiffReel, limit: number, strategy: "story" | "best"): HunkRef[] {
  const refs: Array<HunkRef & { score: number }> = [];
  reel.files.forEach((file, fileIndex) => {
    file.hunks.forEach((hunk, hunkIndex) => {
      const adds = hunk.lines.filter((line) => line.type === "add").length;
      const dels = hunk.lines.filter((line) => line.type === "del").length;
      if (adds + dels === 0) return;
      const both = adds > 0 && dels > 0 ? 24 : 0;
      refs.push({ fileIndex, hunkIndex, score: both + adds + dels });
    });
  });

  if (strategy === "best") {
    refs.sort((a, b) => b.score - a.score || a.fileIndex - b.fileIndex);
  }

  return refs.slice(0, limit).map(({ fileIndex, hunkIndex }) => ({ fileIndex, hunkIndex }));
}

/** The line we blow up on the spotlight card. Prefer a short declaration. */
export function spotlightLine(reel: DiffReel): string | null {
  let best: { text: string; score: number } | null = null;

  for (const file of reel.files) {
    for (const hunk of file.hunks) {
      for (const line of hunk.lines) {
        if (line.type === "context") continue;
        const text = line.text.trim();
        if (text.length < 6) continue;
        let score = 0;
        if (
          /\$state|\$derived|\$effect|useState|useEffect|appDir|export function|export const|export default function/.test(
            text,
          )
        ) {
          score += 6;
        }
        if (/^(export |function |class |const |let |pub |fn |def )/.test(text)) score += 3;
        if (text.length >= 12 && text.length <= 52) score += 3;
        if (text.length > 72) score -= 2;
        if (line.type === "add") score += 1;
        if (!best || score > best.score) best = { text, score };
      }
    }
  }

  return best && best.score > 0 ? best.text : null;
}

export function countLineChanges(hunks: DiffHunk[]): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") additions++;
      else if (line.type === "del") deletions++;
    }
  }
  return { additions, deletions };
}

function hunksFromPair(before: string, after: string): DiffHunk[] | null {
  const patch = structuredPatch("before", "after", before, after, "", "", {
    context: 3,
    maxEditLength: 20000,
  });
  if (!patch) return null;

  return patch.hunks.map((hunk) => {
    const lines: DiffLine[] = [];
    let oldNo = hunk.oldStart;
    let newNo = hunk.newStart;
    for (const raw of hunk.lines) {
      if (raw.startsWith("\\")) continue;
      if (raw.startsWith("+")) {
        lines.push({ type: "add", text: clipLine(raw.slice(1)), newNo: newNo++ });
      } else if (raw.startsWith("-")) {
        lines.push({ type: "del", text: clipLine(raw.slice(1)), oldNo: oldNo++ });
      } else {
        lines.push({
          type: "context",
          text: clipLine(raw.startsWith(" ") ? raw.slice(1) : raw),
          oldNo: oldNo++,
          newNo: newNo++,
        });
      }
    }
    return {
      header: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      oldStart: hunk.oldStart,
      newStart: hunk.newStart,
      lines,
    };
  });
}

function clipLine(text: string): string {
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

export function reelFromPaste(input: {
  before: string;
  after: string;
  filename: string;
  title: string;
}): { reel: DiffReel } | { error: string } {
  const before = input.before.replace(/\r\n/g, "\n");
  const after = input.after.replace(/\r\n/g, "\n");
  if (!before.trim() && !after.trim()) {
    return { error: "Paste the before, the after, or both." };
  }

  const hunks = hunksFromPair(before, after);
  if (!hunks) {
    return { error: "That paste is too large to diff in the browser. Trim it and try again." };
  }

  const filename = (input.filename.trim() || "snippet.ts").slice(0, 120);
  const title = (input.title.trim() || "Untitled reel").slice(0, 140);
  const counts = countLineChanges(hunks);
  const status: DiffFile["status"] =
    !before.trim() ? "added" : !after.trim() ? "removed" : "modified";

  const file: DiffFile = {
    filename,
    status,
    additions: counts.additions,
    deletions: counts.deletions,
    language: languageFromFilename(filename),
    hunks: windowHunks(hunks, 6, 60),
  };

  const today = new Date().toISOString().slice(0, 10);

  return {
    reel: {
      id: `paste-${hashSeed(before + after + filename)}`,
      title,
      kicker: "PASTE",
      repo: filename,
      base: "before",
      head: "after",
      message: title,
      author: "You",
      date: today,
      source: "paste",
      files: [file],
    },
  };
}

function hashSeed(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
