import { gifFilename } from "@/lib/format";
import { renderReel, STAGE_H, STAGE_W, ensureFonts } from "@/lib/render-reel";
import type { Timeline } from "@/lib/timeline";
import type { DiffReel } from "@/lib/types";

const FPS = 10;
const FRAME_MS = 1000 / FPS;

/**
 * One palette for the whole reel. Per-frame quantization flickers on
 * antialiased type and is much slower. Key frames cover the title card,
 * a hunk, and the end card so green, red, and paper all survive.
 */
export async function exportReelGif(
  reel: DiffReel,
  timeline: Timeline,
  onProgress: (frame: number, total: number) => void,
): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  await ensureFonts();

  const frames = Math.round(timeline.duration / FRAME_MS);
  const canvas = document.createElement("canvas");
  canvas.width = STAGE_W;
  canvas.height = STAGE_H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser could not open a canvas for the GIF.");

  const sampleTimes = [0, timeline.duration * 0.45, Math.max(0, timeline.duration - 1)];
  const samples: Uint8ClampedArray[] = [];
  for (const time of sampleTimes) {
    renderReel(ctx, reel, timeline, time);
    samples.push(ctx.getImageData(0, 0, STAGE_W, STAGE_H).data);
    await yieldFrame();
  }

  const palette = quantize(subsample(samples, 13), 256, { format: "rgb565" });
  if (palette.length < 2) {
    palette.push([7, 8, 9], [231, 225, 214]);
  }

  const gif = GIFEncoder();
  for (let frame = 0; frame < frames; frame++) {
    const time = Math.min(timeline.duration - 1, frame * FRAME_MS);
    renderReel(ctx, reel, timeline, time);
    const { data } = ctx.getImageData(0, 0, STAGE_W, STAGE_H);
    const index = applyPalette(data, palette, "rgb565");
    gif.writeFrame(index, STAGE_W, STAGE_H, {
      palette: frame === 0 ? palette : undefined,
      delay: FRAME_MS,
      repeat: frame === 0 ? 0 : undefined,
    });
    onProgress(frame + 1, frames);
    await yieldFrame();
  }

  gif.finish();
  const bytes = gif.bytes();
  return new Blob([Uint8Array.from(bytes)], { type: "image/gif" });
}

export function downloadBlob(blob: Blob, repo: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = gifFilename(repo);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function subsample(buffers: Uint8ClampedArray[], step: number): Uint8Array {
  let count = 0;
  for (const buffer of buffers) count += Math.floor(buffer.length / 4 / step);
  const out = new Uint8Array(count * 4);
  let offset = 0;
  for (const buffer of buffers) {
    for (let i = 0; i < buffer.length; i += 4 * step) {
      out[offset++] = buffer[i];
      out[offset++] = buffer[i + 1];
      out[offset++] = buffer[i + 2];
      out[offset++] = buffer[i + 3];
    }
  }
  return out;
}

function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}
