export function formatTimecode(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenth = Math.floor((clamped % 1000) / 100);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenth}`;
}

export function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function easeOut(value: number): number {
  const t = clamp01(value);
  return 1 - (1 - t) ** 3;
}

export function oneLine(text: string, fallback: string, max = 160): string {
  const line = text.split("\n")[0]?.replace(/\s+/g, " ").trim() ?? "";
  return (line || fallback).slice(0, max);
}

export function gifFilename(repo: string): string {
  const slug = repo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `diffcast-${slug || "reel"}.gif`;
}
