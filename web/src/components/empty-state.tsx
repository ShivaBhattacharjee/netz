import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const faces = [
  { id: "top", points: "75,15 127,45 75,75 23,45", opacity: 0.95 },
  { id: "left", points: "23,45 75,75 75,135 23,105", opacity: 0.5 },
  { id: "right", points: "75,75 127,45 127,105 75,135", opacity: 0.25 },
];

const lines = Array.from({ length: 27 }, (_, i) => 23 + i * 4);

function CubeArt() {
  return (
    <svg viewBox="0 0 150 150" className="size-36 text-foreground" aria-hidden>
      <defs>
        {faces.map((f) => (
          <clipPath key={f.id} id={`cube-${f.id}`}>
            <polygon points={f.points} />
          </clipPath>
        ))}
      </defs>
      {faces.map((f) => (
        <g key={f.id} clipPath={`url(#cube-${f.id})`} opacity={f.opacity}>
          {lines.map((x) => (
            <line key={x} x1={x} x2={x} y1={10} y2={140} stroke="currentColor" strokeWidth={1.2} />
          ))}
        </g>
      ))}
    </svg>
  );
}

export function EmptyState({ title, description, action, className }: { title: string; description: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-16 text-center", className)}>
      <CubeArt />
      <h2 className="mt-2 text-base font-medium">{title}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
