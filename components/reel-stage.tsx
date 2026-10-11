"use client";

import { useEffect, useRef, type RefObject } from "react";

import { renderReel, STAGE_H, STAGE_W } from "@/lib/render-reel";
import type { Timeline } from "@/lib/timeline";
import type { DiffReel } from "@/lib/types";

interface ReelStageProps {
  reelRef: RefObject<DiffReel>;
  timelineRef: RefObject<Timeline>;
  timeRef: RefObject<number>;
  playingRef: RefObject<boolean>;
  label: string;
  onTick: (time: number, ended: boolean) => void;
}

export function ReelStage({
  reelRef,
  timelineRef,
  timeRef,
  playingRef,
  label,
  onTick,
}: ReelStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    let stopped = false;
    let last = performance.now();
    let sincePaint = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = STAGE_W * dpr;
      canvas.height = STAGE_H * dpr;
    };
    resize();

    const loop = (now: number) => {
      if (stopped) return;
      const dt = Math.min(48, now - last);
      last = now;
      const timeline = timelineRef.current;
      if (timeline && playingRef.current) {
        const next = timeRef.current + dt;
        if (next >= timeline.duration) {
          timeRef.current = Math.max(0, timeline.duration - 1);
          playingRef.current = false;
          onTick(timeRef.current, true);
        } else {
          timeRef.current = next;
          sincePaint += dt;
          if (sincePaint > 40) {
            sincePaint = 0;
            onTick(timeRef.current, false);
          }
        }
      }

      const ctx = canvas.getContext("2d");
      if (ctx && timelineRef.current) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderReel(ctx, reelRef.current, timelineRef.current, timeRef.current);
      }
      frame = requestAnimationFrame(loop);
    };

    void document.fonts.ready.then(() => {
      if (!stopped) frame = requestAnimationFrame(loop);
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [onTick, playingRef, reelRef, timeRef, timelineRef]);

  return (
    <canvas
      ref={canvasRef}
      width={STAGE_W}
      height={STAGE_H}
      role="img"
      aria-label={label}
      className="block h-auto w-full bg-[#070809]"
    />
  );
}
