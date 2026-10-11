import type { DiffHunk, DiffLine, FileStatus } from "@/lib/types";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

const MAX_LINE = 400;

function clip(text: string): string {
  return text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}…` : text;
}

export function parsePatch(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  // Drop a single trailing newline from split(), but keep internal blank rows.
  // Hand-written highlights sometimes use a truly empty row for a blank line;
  // GitHub sends those as a single space, which lineFromRaw already accepts.
  const rows = patch.replace(/\n$/, "").split("\n");

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];

    if (raw.startsWith("@@")) {
      const match = raw.match(HUNK_HEADER);
      if (!match) continue;
      current = {
        header: raw,
        oldStart: Number(match[1]),
        newStart: Number(match[3]),
        lines: [],
      };
      oldNo = current.oldStart;
      newNo = current.newStart;
      hunks.push(current);
      continue;
    }

    if (!current || raw.startsWith("\\")) continue;

    const line = lineFromRaw(raw, oldNo, newNo);
    if (!line) continue;
    current.lines.push(line.line);
    oldNo = line.oldNo;
    newNo = line.newNo;
  }

  return hunks;
}

function lineFromRaw(
  raw: string,
  oldNo: number,
  newNo: number,
): { line: DiffLine; oldNo: number; newNo: number } | null {
  if (raw.startsWith("+")) {
    return { line: { type: "add", text: clip(raw.slice(1)), newNo }, oldNo, newNo: newNo + 1 };
  }
  if (raw.startsWith("-")) {
    return { line: { type: "del", text: clip(raw.slice(1)), oldNo }, oldNo: oldNo + 1, newNo };
  }
  const text = raw.startsWith(" ") ? raw.slice(1) : raw;
  return {
    line: { type: "context", text: clip(text), oldNo, newNo },
    oldNo: oldNo + 1,
    newNo: newNo + 1,
  };
}

export function languageFromFilename(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  if (base === "Dockerfile" || base === "Makefile") return "shell";
  const ext = base.includes(".") ? (base.split(".").pop()?.toLowerCase() ?? "") : "";
  const map: Record<string, string> = {
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    tsx: "typescript",
    mts: "typescript",
    cts: "typescript",
    svelte: "svelte",
    vue: "javascript",
    css: "css",
    scss: "css",
    json: "json",
    md: "markdown",
    py: "python",
    rs: "rust",
    go: "go",
    rb: "ruby",
    sh: "shell",
    bash: "shell",
    yml: "yaml",
    yaml: "yaml",
    html: "html",
    htm: "html",
  };
  return map[ext] ?? "text";
}

export function mapStatus(status: string): FileStatus {
  if (status === "added") return "added";
  if (status === "removed") return "removed";
  if (status === "renamed") return "renamed";
  return "modified";
}

/** Keep the reel short: a few hunks, each opened on the first real change. */
export function windowHunks(hunks: DiffHunk[], maxHunks = 4, maxLines = 48): DiffHunk[] {
  return hunks.slice(0, maxHunks).map((hunk) => {
    if (hunk.lines.length <= maxLines) return hunk;
    const firstChange = hunk.lines.findIndex((line) => line.type !== "context");
    const start = Math.max(0, (firstChange < 0 ? 0 : firstChange) - 3);
    return { ...hunk, lines: hunk.lines.slice(start, start + maxLines) };
  });
}
