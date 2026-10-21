"use client";

import { useEffect, useRef } from "react";

const CELL = 22;
const SIZE = 9;
const SCATTER = 12;

interface Cell {
  x: number;
  y: number;
  fx: number;
  fy: number;
  px: number;
  py: number;
  spin: number;
  rate: number;
  phase: number;
}

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

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
    let cells: Cell[] = [];

    const seed = (i: number) => {
      const s = Math.sin(i * 12.9898) * 43758.5453;
      return s - Math.floor(s);
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      color = getComputedStyle(canvas).color;
      cells = [];
      let i = 0;
      for (let y = CELL / 2; y < height; y += CELL) {
        for (let x = CELL / 2; x < width; x += CELL) {
          i++;
          cells.push({
            x,
            y,
            fx: 0.25 + seed(i) * 0.6,
            fy: 0.25 + seed(i + 7.1) * 0.6,
            px: seed(i + 2.2) * Math.PI * 2,
            py: seed(i + 5.5) * Math.PI * 2,
            spin: (seed(i + 3.3) - 0.5) * Math.PI,
            rate: 0.12 + seed(i + 1.7) * 0.35,
            phase: seed(i + 9.4) * Math.PI * 2,
          });
        }
      }
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      const time = reduced ? 0 : t / 1000;

      for (const c of cells) {
        const wave = Math.sin(time * c.rate + c.phase);
        const order = ease(Math.min(1, Math.max(0, wave * 1.4 + 0.2)));
        const loose = 1 - order;
        const ox = Math.sin(time * c.fx + c.px) * SCATTER;
        const oy = Math.cos(time * c.fy + c.py) * SCATTER;
        ctx.globalAlpha = 0.18 + order * 0.5;
        ctx.save();
        ctx.translate(c.x + ox * loose, c.y + oy * loose);
        ctx.rotate((c.spin + time * c.rate) * loose);
        const s = SIZE - loose * 3;
        ctx.beginPath();
        ctx.roundRect(-s / 2, -s / 2, s, s, 1.5);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
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
      <div className="relative flex-1 overflow-hidden border-y border-border">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full text-muted-foreground" />
      </div>
    </aside>
  );
}
