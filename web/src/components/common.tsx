import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { confidenceLevel } from "@/lib/format";
import type { ImportStatus, ProductStatus, RowStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function IconButton({
  label,
  icon: Icon,
  ...props
}: ComponentProps<typeof Button> & { label: string; icon: LucideIcon }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} {...props}>
          <Icon aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

type Tone = "success" | "warning" | "error" | "info" | "neutral";

const toneDot: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
  neutral: "bg-muted-foreground/50",
};

export function StatusLabel({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-label">
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", toneDot[tone])} />
      {children}
    </span>
  );
}

const productStatus: Record<ProductStatus, { tone: Tone; label: string }> = {
  approved: { tone: "success", label: "Approved" },
  ready: { tone: "neutral", label: "Ready" },
  needs_review: { tone: "warning", label: "Needs review" },
  failed: { tone: "error", label: "Failed" },
};

export function ProductStatusLabel({ status }: { status: ProductStatus }) {
  const s = productStatus[status];
  return <StatusLabel tone={s.tone}>{s.label}</StatusLabel>;
}

const rowStatus: Record<RowStatus, { tone: Tone; label: string }> = {
  done: { tone: "success", label: "Done" },
  needs_review: { tone: "warning", label: "Needs review" },
  failed: { tone: "error", label: "Failed" },
  pending: { tone: "neutral", label: "Pending" },
};

export function RowStatusLabel({ status }: { status: RowStatus }) {
  const s = rowStatus[status];
  return <StatusLabel tone={s.tone}>{s.label}</StatusLabel>;
}

const importStatus: Record<ImportStatus, { tone: Tone; label: string }> = {
  queued: { tone: "neutral", label: "Queued" },
  processing: { tone: "info", label: "Processing" },
  paused: { tone: "warning", label: "Paused" },
  completed: { tone: "success", label: "Completed" },
  failed: { tone: "error", label: "Failed" },
  cancelled: { tone: "neutral", label: "Cancelled" },
};

export function ImportStatusLabel({ status }: { status: ImportStatus }) {
  const s = importStatus[status];
  return <StatusLabel tone={s.tone}>{s.label}</StatusLabel>;
}

const levelFill = { high: "bg-success", medium: "bg-warning", low: "bg-error" };
const levelText = { high: "High", medium: "Medium", low: "Low" };

export function Confidence({ score }: { score: number }) {
  const level = confidenceLevel(score);
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span aria-hidden className="relative h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", levelFill[level])} style={{ width: `${score}%` }} />
      </span>
      <span className="w-9 text-right text-label">{score}%</span>
      <span className="sr-only">{levelText[level]} confidence</span>
    </span>
  );
}

export function PageHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="truncate text-section font-heading">{title}</h1>
        {meta ? <div className="text-compact text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SegmentBar({
  segments,
  total,
  label,
  className,
}: {
  segments: { value: number; className: string; label: string }[];
  total: number;
  label: string;
  className?: string;
}) {
  return (
    <div role="img" aria-label={label} className={cn("flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-muted", className)}>
      {segments.map((s) =>
        s.value > 0 ? (
          <span key={s.label} className={cn("h-full", s.className)} style={{ width: `${(s.value / Math.max(total, 1)) * 100}%` }} />
        ) : null,
      )}
    </div>
  );
}

export function Panel({
  title,
  icon: Icon,
  action,
  className,
  bodyClassName,
  children,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card", className)}>
      <header className="flex h-11 items-center gap-2 border-b px-4">
        {Icon ? <Icon aria-hidden className="size-4 text-muted-foreground" /> : null}
        <h2 className="text-sm font-medium">{title}</h2>
        {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
      </header>
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {Icon ? (
          <span className="flex size-7 items-center justify-center rounded-md border bg-muted/40">
            <Icon aria-hidden className="size-3.5 text-muted-foreground" />
          </span>
        ) : null}
      </div>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}
