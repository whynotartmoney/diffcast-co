import { highlight, type TokenKind } from "@/lib/highlight";
import { clamp01, easeOut, formatTimecode } from "@/lib/format";
import { reelStats } from "@/lib/reel";
import { beatAt, beatLabel, type Beat, type Timeline } from "@/lib/timeline";
import type { DiffFile, DiffReel, FileStatus } from "@/lib/types";

/** Playback and GIF export share this coordinate space. */
export const STAGE_W = 1280;
export const STAGE_H = 720;

const PAPER = "#e7e1d6";
const MUTED = "#9a948a";
const DIM = "#6f6a62";
const AMBER = "#e8b86d";
const ADD = "#7dffa1";
const DEL = "#ff8d86";
const CARD = "#101218";
const VOID = "#070809";

interface Fonts {
  sans: string;
  mono: string;
  serif: string;
}

let cachedFonts: Fonts | null = null;

export function readFonts(): Fonts {
  if (cachedFonts) return cachedFonts;
  const css = getComputedStyle(document.documentElement);
  const sans = css.getPropertyValue("--font-geist-sans").trim();
  const mono = css.getPropertyValue("--font-geist-mono").trim();
  const serif = css.getPropertyValue("--font-instrument").trim();
  cachedFonts = {
    sans: sans || "sans-serif",
    mono: mono || "ui-monospace, monospace",
    serif: serif || "Georgia, serif",
  };
  return cachedFonts;
}

export async function ensureFonts(): Promise<void> {
  // next/font has already registered the faces. Asking the browser to load
  // them again can reject with a network error in headless runs, and the
  // canvas just needs the faces that painted the stage.
  await document.fonts.ready;
}

const GRAIN = buildGrain();

function buildGrain(): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let seed = 123456789;
  for (let i = 0; i < 900; i++) {
    seed = (seed * 48271) % 2147483647;
    const x = seed % STAGE_W;
    seed = (seed * 48271) % 2147483647;
    const y = seed % STAGE_H;
    points.push([x, y]);
  }
  return points;
}

export function renderReel(
  ctx: CanvasRenderingContext2D,
  reel: DiffReel,
  timeline: Timeline,
  time: number,
) {
  const fonts = readFonts();
  const { beat, index, local } = beatAt(timeline, time);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  setTracking(ctx, "0px");

  drawBackground(ctx);

  if (beat.kind === "title") drawTitle(ctx, fonts, reel, beat, local);
  else if (beat.kind === "files") drawFiles(ctx, fonts, reel, local);
  else if (beat.kind === "hunk") drawHunk(ctx, fonts, reel, beat, local);
  else if (beat.kind === "spotlight") drawSpotlight(ctx, fonts, reel, beat, local);
  else drawStats(ctx, fonts, reel, beat, local);

  drawGrain(ctx);
  drawVignette(ctx);
  drawGate(ctx);
  drawChrome(ctx, fonts, timeline, time, beat);

  const dipping = dipAlpha(local, beat.duration, index === timeline.beats.length - 1);
  if (dipping > 0.01) {
    ctx.fillStyle = `rgba(7, 8, 9, ${dipping})`;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  gradient.addColorStop(0, "#12141a");
  gradient.addColorStop(0.45, VOID);
  gradient.addColorStop(1, "#050607");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

function drawTitle(
  ctx: CanvasRenderingContext2D,
  fonts: Fonts,
  reel: DiffReel,
  beat: Beat,
  local: number,
) {
  const progress = local / beat.duration;
  const [owner, name] = splitRepo(reel.repo);
  const stats = reelStats(reel);

  paint(ctx, appear(progress, 0.02, 0.14), 0, () => {
    ctx.font = `500 13px ${fonts.mono}`;
    ctx.fillStyle = AMBER;
    drawTracked(ctx, reel.kicker, 76, 168, "5px");
  });

  const size = fitFont(ctx, owner, `400 {size}px ${fonts.serif}`, 1080, 100, 56);
  paint(ctx, appear(progress, 0.08, 0.22), 18, () => {
    ctx.font = `400 ${size}px ${fonts.serif}`;
    ctx.fillStyle = PAPER;
    ctx.fillText(owner, 76, 292);
    if (name) {
      const y = 292 + size * 0.9;
      ctx.fillStyle = AMBER;
      ctx.fillText("/", 76, y);
      const slash = ctx.measureText("/").width;
      ctx.fillStyle = PAPER;
      const fitted = fitText(ctx, name, 1080 - slash);
      ctx.fillText(fitted, 76 + slash, y);
    }
  });

  paint(ctx, appear(progress, 0.32, 0.16), 10, () => {
    ctx.font = `400 20px ${fonts.mono}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(fitText(ctx, `${reel.base}    →    ${reel.head}`, 1000), 76, name ? 470 : 390);
  });

  paint(ctx, appear(progress, 0.46, 0.18), 12, () => {
    ctx.font = `italic 400 32px ${fonts.serif}`;
    ctx.fillStyle = PAPER;
    const lines = wrapText(ctx, reel.message, 880).slice(0, 2);
    lines.forEach((line, i) => ctx.fillText(line, 76, 540 + i * 42));
  });

  const grow = appear(progress, 0.2, 0.7);
  const changed = stats.additions + stats.deletions;
  const width = 480 * grow;
  ctx.fillStyle = "rgba(231, 225, 214, 0.14)";
  ctx.fillRect(76, 640, 480, 3);
  if (changed > 0) {
    const addWidth = width * (stats.additions / changed);
    ctx.fillStyle = ADD;
    ctx.fillRect(76, 640, addWidth, 3);
    ctx.fillStyle = DEL;
    ctx.fillRect(76 + addWidth, 640, Math.max(0, width - addWidth), 3);
  }

  paint(ctx, appear(progress, 0.58, 0.16), 0, () => {
    ctx.font = `400 14px ${fonts.mono}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(`${reel.author}    ·    ${reel.date}`, 76, 678);
  });
}

function drawFiles(ctx: CanvasRenderingContext2D, fonts: Fonts, reel: DiffReel, local: number) {
  const stats = reelStats(reel);
  ctx.font = `500 13px ${fonts.mono}`;
  ctx.fillStyle = AMBER;
  drawTracked(ctx, "FILES TOUCHED", 76, 118, "5px");

  ctx.font = `400 16px ${fonts.mono}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(
    `${stats.files} files     +${stats.additions}     −${stats.deletions}`,
    76,
    152,
  );

  const visible = reel.files.slice(0, 6);
  const hidden = Math.max(0, (reel.totals?.files ?? reel.files.length) - visible.length);

  visible.forEach((file, index) => {
    const rowT = clamp01((local - index * 90) / 340);
    const eased = easeOut(rowT);
    ctx.save();
    ctx.globalAlpha = eased;
    const y = 196 + index * 74 + (1 - eased) * 18;
    drawFileRow(ctx, fonts, file, y);
    ctx.restore();
  });

  if (hidden > 0 || reel.truncated) {
    ctx.font = `400 14px ${fonts.mono}`;
    ctx.fillStyle = DIM;
    const note = hidden > 0 ? `+ ${hidden} more files` : "Patch trimmed for the reel";
    ctx.fillText(note, 76, 196 + visible.length * 74 + 8);
  }
}

function drawFileRow(ctx: CanvasRenderingContext2D, fonts: Fonts, file: DiffFile, y: number) {
  const meta = statusMeta(file.status);
  roundRect(ctx, 76, y, 44, 32, 6);
  ctx.fillStyle = "rgba(231,225,214,0.04)";
  ctx.fill();
  ctx.font = `600 14px ${fonts.mono}`;
  ctx.fillStyle = meta.color;
  ctx.fillText(meta.glyph, 90, y + 22);

  ctx.font = `400 20px ${fonts.mono}`;
  ctx.fillStyle = PAPER;
  const name = file.previousFilename
    ? `${file.previousFilename}  →  ${file.filename}`
    : file.filename;
  ctx.fillText(fitText(ctx, name, 760), 136, y + 23);

  ctx.font = `400 16px ${fonts.mono}`;
  ctx.fillStyle = ADD;
  const plus = `+${file.additions}`;
  ctx.fillText(plus, 980, y + 23);
  ctx.fillStyle = DEL;
  ctx.fillText(`−${file.deletions}`, 980 + ctx.measureText(plus).width + 18, y + 23);

  const total = Math.max(1, file.additions + file.deletions);
  const bar = 220;
  ctx.fillStyle = "rgba(231,225,214,0.1)";
  ctx.fillRect(136, y + 38, bar, 3);
  ctx.fillStyle = ADD;
  const addW = bar * (file.additions / total);
  ctx.fillRect(136, y + 38, addW, 3);
  ctx.fillStyle = DEL;
  ctx.fillRect(136 + addW, y + 38, bar - addW, 3);
}

function drawHunk(
  ctx: CanvasRenderingContext2D,
  fonts: Fonts,
  reel: DiffReel,
  beat: Beat,
  local: number,
) {
  const file = reel.files[beat.fileIndex ?? 0];
  const hunk = file?.hunks[beat.hunkIndex ?? 0];
  if (!file || !hunk) return;

  const card = { x: 48, y: 78, w: 1184, h: 590 };
  roundRect(ctx, card.x, card.y, card.w, card.h, 18);
  ctx.fillStyle = CARD;
  ctx.fill();
  ctx.strokeStyle = "rgba(231,225,214,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(card.x + 28, card.y + 30, 5, 0, Math.PI * 2);
  ctx.fillStyle = AMBER;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(card.x + 48, card.y + 30, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#2c3038";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(card.x + 68, card.y + 30, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = `400 16px ${fonts.mono}`;
  ctx.fillStyle = PAPER;
  ctx.fillText(fitText(ctx, file.filename, 760), card.x + 92, card.y + 36);

  ctx.font = `400 15px ${fonts.mono}`;
  ctx.textAlign = "right";
  ctx.fillStyle = DEL;
  ctx.fillText(`−${file.deletions}`, card.x + card.w - 28, card.y + 36);
  const delWidth = ctx.measureText(`−${file.deletions}`).width;
  ctx.fillStyle = ADD;
  ctx.fillText(`+${file.additions}`, card.x + card.w - 44 - delWidth, card.y + 36);
  ctx.textAlign = "left";

  ctx.strokeStyle = "rgba(231,225,214,0.08)";
  ctx.beginPath();
  ctx.moveTo(card.x, card.y + 56);
  ctx.lineTo(card.x + card.w, card.y + 56);
  ctx.stroke();

  const progress = clamp01(local / beat.duration);
  const revealed = Math.max(1, easeOut(progress) * hunk.lines.length);
  const shown = Math.ceil(revealed);
  const capacity = 13;
  const lineH = 36;
  const start = Math.max(0, shown - capacity);
  const slice = hunk.lines.slice(start, shown);
  const codeX = card.x + 112;
  const maxCode = card.w - 140;

  ctx.save();
  ctx.beginPath();
  ctx.rect(card.x, card.y + 57, card.w, card.h - 58);
  ctx.clip();

  slice.forEach((line, index) => {
    const absolute = start + index;
    const y = card.y + 78 + index * lineH;
    const isLast = absolute === shown - 1;
    const fade = isLast ? clamp01(revealed - (shown - 1)) : 1;
    if (line.type === "add") {
      ctx.fillStyle = `rgba(125, 255, 161, ${0.1 * fade})`;
      ctx.fillRect(card.x + 8, y - 24, card.w - 16, lineH);
    } else if (line.type === "del") {
      ctx.fillStyle = `rgba(255, 141, 134, ${0.1 * fade})`;
      ctx.fillRect(card.x + 8, y - 24, card.w - 16, lineH);
    }

    ctx.globalAlpha = fade;
    ctx.font = `400 18px ${fonts.mono}`;
    ctx.fillStyle = line.type === "add" ? ADD : line.type === "del" ? DEL : DIM;
    ctx.fillText(line.type === "add" ? "+" : line.type === "del" ? "−" : " ", card.x + 24, y);

    const number = line.type === "del" ? line.oldNo : line.newNo;
    ctx.fillStyle = DIM;
    ctx.font = `400 14px ${fonts.mono}`;
    if (number) ctx.fillText(String(number), card.x + 52, y);

    ctx.font = `400 18px ${fonts.mono}`;
    drawCode(ctx, line.text, file.language, codeX, y, maxCode, PAPER);
    ctx.globalAlpha = 1;

    if (isLast) {
      ctx.fillStyle = AMBER;
      ctx.fillRect(card.x + 8, y - 24, 3, lineH);
    }
  });

  ctx.restore();

  if (hunk.lines.length > shown) {
    ctx.font = `400 12px ${fonts.mono}`;
    ctx.fillStyle = DIM;
    ctx.textAlign = "right";
    ctx.fillText(`${shown} / ${hunk.lines.length}`, card.x + card.w - 24, card.y + card.h - 16);
    ctx.textAlign = "left";
  }
}

function drawSpotlight(
  ctx: CanvasRenderingContext2D,
  fonts: Fonts,
  reel: DiffReel,
  beat: Beat,
  local: number,
) {
  const text = beat.spotlight ?? "";
  const progress = local / beat.duration;
  const quiet = text === "No lines changed.";

  paint(ctx, appear(progress, 0.04, 0.16), 0, () => {
    ctx.font = `500 13px ${fonts.mono}`;
    ctx.fillStyle = AMBER;
    ctx.textAlign = "center";
    drawTracked(ctx, quiet ? "HOLD" : "THE LINE", STAGE_W / 2, 220, "6px");
    ctx.textAlign = "left";
  });

  paint(ctx, appear(progress, 0.12, 0.24), 16, () => {
    const size = fitFont(ctx, text, `400 {size}px ${fonts.mono}`, 1100, quiet ? 54 : 40, 22);
    ctx.font = `400 ${size}px ${fonts.mono}`;
    ctx.textAlign = "center";
    if (quiet) {
      ctx.fillStyle = PAPER;
      ctx.fillText(text, STAGE_W / 2, 360);
    } else {
      drawCode(ctx, text, "typescript", STAGE_W / 2, 370, 1100, PAPER, true);
    }
    ctx.textAlign = "left";
  });

  const rule = 360 * appear(progress, 0.34, 0.4);
  ctx.fillStyle = ADD;
  ctx.fillRect((STAGE_W - rule) / 2, 430, rule, 2);

  paint(ctx, appear(progress, 0.48, 0.18), 0, () => {
    ctx.font = `400 16px ${fonts.mono}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    ctx.fillText(fitText(ctx, reel.repo, 800), STAGE_W / 2, 490);
    ctx.textAlign = "left";
  });
}

function drawStats(
  ctx: CanvasRenderingContext2D,
  fonts: Fonts,
  reel: DiffReel,
  beat: Beat,
  local: number,
) {
  const stats = reelStats(reel);
  const progress = clamp01(local / (beat.duration * 0.62));
  const columns = [
    { value: stats.additions, label: "ADDED", color: ADD, x: 300 },
    { value: stats.files, label: "FILES", color: PAPER, x: 640 },
    { value: stats.deletions, label: "REMOVED", color: DEL, x: 980 },
  ];

  for (const column of columns) {
    const shown = Math.round(easeOut(progress) * column.value);
    drawBigNumber(ctx, String(shown), column.x, 300, column.color, fonts.serif, 320);
    ctx.font = `500 13px ${fonts.mono}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "center";
    drawTracked(ctx, column.label, column.x, 348, "4px");
    ctx.textAlign = "left";
  }

  const late = appear(local / beat.duration, 0.45, 0.25);
  paint(ctx, late, 10, () => {
    ctx.textAlign = "center";
    ctx.font = `400 28px ${fonts.serif}`;
    ctx.fillStyle = PAPER;
    ctx.fillText(fitText(ctx, reel.message, 900), STAGE_W / 2, 470);
    ctx.font = `400 16px ${fonts.mono}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(fitText(ctx, `${reel.repo}    ${reel.base}  →  ${reel.head}`, 980), STAGE_W / 2, 514);
    ctx.textAlign = "left";
  });

  paint(ctx, appear(local / beat.duration, 0.62, 0.2), 0, () => {
    ctx.font = `500 14px ${fonts.mono}`;
    ctx.fillStyle = AMBER;
    ctx.textAlign = "center";
    drawTracked(ctx, "DIFFCAST", STAGE_W / 2, 620, "8px");
    ctx.font = `400 13px ${fonts.mono}`;
    ctx.fillStyle = DIM;
    drawTracked(ctx, "CARBON FOR MOTION", STAGE_W / 2, 648, "4px");
    ctx.textAlign = "left";
  });
}

function drawCode(
  ctx: CanvasRenderingContext2D,
  text: string,
  language: string,
  x: number,
  y: number,
  maxWidth: number,
  plain: string,
  center = false,
) {
  const previousAlign = ctx.textAlign;
  ctx.textAlign = "left";
  const tokens = highlight(text, language);
  const fitted = fitTokens(ctx, tokens, maxWidth);
  let cursor = x;
  if (center) {
    const width = fitted.reduce((sum, token) => sum + ctx.measureText(token.text).width, 0);
    cursor = x - width / 2;
  }
  for (const token of fitted) {
    ctx.fillStyle = tokenColor(token.kind, plain);
    ctx.fillText(token.text, cursor, y);
    cursor += ctx.measureText(token.text).width;
  }
  ctx.textAlign = previousAlign;
}

function fitTokens(
  ctx: CanvasRenderingContext2D,
  tokens: Array<{ text: string; kind: TokenKind }>,
  maxWidth: number,
) {
  const width = tokens.reduce((sum, token) => sum + ctx.measureText(token.text).width, 0);
  if (width <= maxWidth) return tokens;
  const out: Array<{ text: string; kind: TokenKind }> = [];
  let used = 0;
  for (const token of tokens) {
    const tokenWidth = ctx.measureText(token.text).width;
    if (used + tokenWidth <= maxWidth - 16) {
      out.push(token);
      used += tokenWidth;
      continue;
    }
    const remain = Math.max(8, maxWidth - used);
    out.push({ text: fitText(ctx, token.text, remain), kind: token.kind });
    break;
  }
  return out;
}

function tokenColor(kind: TokenKind, plain: string): string {
  switch (kind) {
    case "keyword":
      return "#ffb4a8";
    case "string":
      return "#b7e4c7";
    case "comment":
      return "#8d877c";
    case "number":
      return "#f0c27a";
    case "func":
      return "#d7c4ff";
    case "type":
      return "#f3d7a1";
    case "punct":
      return "#cfc8bb";
    default:
      return plain;
  }
}

function drawChrome(
  ctx: CanvasRenderingContext2D,
  fonts: Fonts,
  timeline: Timeline,
  time: number,
  beat: Beat,
) {
  ctx.font = `500 12px ${fonts.mono}`;
  ctx.fillStyle = "rgba(231,225,214,0.72)";
  drawTracked(ctx, "DIFFCAST", 36, 42, "4px");

  const label = beatLabel(beat, 0, timeline);
  ctx.textAlign = "right";
  ctx.fillText(`${formatTimecode(time)}    ${label}`, STAGE_W - 36, 42);
  ctx.textAlign = "left";
}

function drawGrain(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(255,255,255,0.045)";
  for (const [x, y] of GRAIN) ctx.fillRect(x, y, 1, 1);
}

function drawVignette(ctx: CanvasRenderingContext2D) {
  const gradient = ctx.createRadialGradient(640, 360, 180, 640, 380, 860);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.48)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

function drawGate(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "rgba(231,225,214,0.28)";
  ctx.lineWidth = 1;
  const mark = 16;
  const inset = 22;
  const corners: Array<[number, number, number, number]> = [
    [inset, inset, 1, 1],
    [STAGE_W - inset, inset, -1, 1],
    [inset, STAGE_H - inset, 1, -1],
    [STAGE_W - inset, STAGE_H - inset, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + sy * mark);
    ctx.lineTo(x, y);
    ctx.lineTo(x + sx * mark, y);
    ctx.stroke();
  }
}

function drawBigNumber(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  family: string,
  maxWidth: number,
) {
  const size = fitFont(ctx, text, `400 {size}px ${family}`, maxWidth, 112, 64);
  ctx.font = `400 ${size}px ${family}`;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
}

function statusMeta(status: FileStatus): { glyph: string; color: string } {
  if (status === "added") return { glyph: "A", color: ADD };
  if (status === "removed") return { glyph: "D", color: DEL };
  if (status === "renamed") return { glyph: "R", color: AMBER };
  return { glyph: "M", color: AMBER };
}

function splitRepo(repo: string): [string, string | null] {
  const slash = repo.indexOf("/");
  if (slash <= 0) return [repo, null];
  return [repo.slice(0, slash), repo.slice(slash + 1)];
}

function appear(progress: number, start: number, span: number): number {
  return easeOut(clamp01((progress - start) / span));
}

function paint(
  ctx: CanvasRenderingContext2D,
  alpha: number,
  rise: number,
  draw: () => void,
) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, (1 - alpha) * rise);
  draw();
  ctx.restore();
}

function dipAlpha(local: number, duration: number, isLast: boolean): number {
  // Only the outgoing beat darkens. A fade-in on the next beat's first
  // frame is a full black GIF sample at 10fps, which reads as a dropped frame.
  if (isLast) return 0;
  const edge = 200;
  const remain = duration - local;
  if (remain >= edge) return 0;
  return 1 - remain / edge;
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  pattern: string,
  maxWidth: number,
  start: number,
  min: number,
): number {
  let size = start;
  while (size > min) {
    ctx.font = pattern.replace("{size}", String(size));
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return min;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, Math.max(0, lo))}…`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: string,
) {
  setTracking(ctx, spacing);
  ctx.fillText(text, x, y);
  setTracking(ctx, "0px");
}

function setTracking(ctx: CanvasRenderingContext2D, spacing: string) {
  (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = spacing;
}
