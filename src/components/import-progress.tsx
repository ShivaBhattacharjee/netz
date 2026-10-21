import { formatNumber } from "@/lib/format";
import type { ImportJob } from "@/lib/types";
import { SegmentBar } from "./common";

export function ImportBar({ job }: { job: ImportJob }) {
  const { done, needs_review, failed } = job.counts;
  const finished = done + needs_review + failed;
  return (
    <SegmentBar
      total={job.total_rows}
      label={`${formatNumber(finished)} of ${formatNumber(job.total_rows)} rows finished: ${formatNumber(done)} done, ${formatNumber(needs_review)} need review, ${formatNumber(failed)} failed`}
      segments={[
        { value: done, className: "bg-success", label: "Done" },
        { value: needs_review, className: "bg-warning", label: "Needs review" },
        { value: failed, className: "bg-error", label: "Failed" },
      ]}
    />
  );
}

export function ImportProgressCell({ job }: { job: ImportJob }) {
  if (job.total_rows === 0) return <span className="text-muted-foreground">–</span>;
  const { needs_review, failed, pending } = job.counts;
  const finished = job.total_rows - pending;
  const extra = [needs_review ? `${formatNumber(needs_review)} review` : null, failed ? `${formatNumber(failed)} failed` : null].filter(Boolean);
  return (
    <div className="flex flex-col gap-1.5">
      <ImportBar job={job} />
      <div className="flex justify-between gap-3 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        <span>
          <span className="text-foreground">{formatNumber(finished)}</span> / {formatNumber(job.total_rows)}
        </span>
        <span>{extra.join(" · ")}</span>
      </div>
    </div>
  );
}

export function statusDetail(job: ImportJob): string | null {
  if (job.budget_paused) return "AI budget reached · raise it to continue";
  if (job.status === "paused" && job.resume_in_seconds !== null) {
    const minutes = Math.ceil(job.resume_in_seconds / 60);
    return `Rate limited · resumes in ${minutes} min`;
  }
  if (job.status === "queued") return "Waiting for a worker";
  return job.error;
}
