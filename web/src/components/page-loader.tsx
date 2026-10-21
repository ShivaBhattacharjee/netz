import { Loader2 } from "lucide-react";

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-1 items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
      <Loader2 aria-hidden className="size-4 animate-spin" />
      {label}
    </div>
  );
}
