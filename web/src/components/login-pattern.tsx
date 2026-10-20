"use client";

import { useEffect, useRef } from "react";

const GAP = 29;
const LENGTH = 12;

export function LoginPattern() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let width = 0;
    let height = 0;
    let color = "";

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      color = getComputedStyle(canvas).color;
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.lineCap = "round";
      const time = reduced ? 0 : t / 1000;
      const cx = width * 0.7;
      const cy = height * 0.35;
      for (let y = GAP / 2; y < height; y += GAP) {
        for (let x = GAP / 2; x < width; x += GAP) {
          const dist = Math.hypot(x - cx, y - cy);
          const angle = -Math.PI / 3 + time * 0.6 - dist / 140;
          const dx = (Math.cos(angle) * LENGTH) / 2;
          const dy = (Math.sin(angle) * LENGTH) / 2;
          ctx.beginPath();
          ctx.moveTo(x - dx, y - dy);
          ctx.lineTo(x + dx, y + dy);
          ctx.stroke();
        }
      }
      if (!reduced) frame = requestAnimationFrame(draw);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <aside aria-hidden className="relative hidden min-w-0 flex-1 flex-col py-6 pr-6 md:flex">
      <div className="relative flex-1 overflow-hidden border-t border-border">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full text-muted-foreground/60" />
        <div className="absolute inset-x-0 bottom-0 h-[62%] bg-linear-to-b from-background/0 via-background/85 via-52% to-background" />
      </div>
      <div className="min-h-10 border-t border-border" />
    </aside>
  );
}
