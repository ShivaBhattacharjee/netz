"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { actions } from "@/lib/data/store";
import { RERUN_MODELS } from "@/lib/models";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const fieldOptions = [
  { id: "title", label: "Title" },
  { id: "description_html", label: "Description" },
  { id: "category", label: "Category" },
  { id: "attributes", label: "Attributes" },
  { id: "claims", label: "Claims" },
  { id: "seo", label: "SEO fields" },
];

export function RerunDialog({ ids, onDone, trigger }: { ids: string[]; onDone?: () => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<string>(RERUN_MODELS[1].id);
  const [busy, setBusy] = useState(false);
  const [fields, setFields] = useState<string[]>(["title", "description_html", "category", "attributes", "claims"]);
  const [note, setNote] = useState("");

  async function submit() {
    setBusy(true);
    try {
      const queued = await actions.rerun(ids, { model, fields, note });
      toast.success(`Queued ${formatNumber(queued)} product${queued === 1 ? "" : "s"} for regeneration`, {
        description: `${RERUN_MODELS.find((m) => m.id === model)?.label} · ${fields.length} fields`,
      });
      setOpen(false);
      onDone?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not queue the re-run");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Sparkles data-icon="inline-start" />
            Re-run AI
          </Button>
        )}
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-lg">Re-run AI on {formatNumber(ids.length)} product{ids.length === 1 ? "" : "s"}</SheetTitle>
          <SheetDescription>Merchant edits stay locked. Approved products are skipped.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <div className="flex flex-col gap-2">
            <Label>Model</Label>
            <RadioGroup value={model} onValueChange={setModel} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {RERUN_MODELS.map((m) => (
                <Label
                  key={m.id}
                  htmlFor={m.id}
                  className={cn(
                    "flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/50",
                    model === m.id && "border-foreground bg-muted/50",
                  )}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium">{m.label}</span>
                    <RadioGroupItem id={m.id} value={m.id} />
                  </span>
                  <span className="text-xs text-muted-foreground">{m.hint}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Fields to regenerate</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {fieldOptions.map((f) => (
                <Label key={f.id} className="flex items-center gap-2 font-normal">
                  <Checkbox
                    checked={fields.includes(f.id)}
                    onCheckedChange={(c) => setFields((prev) => (c ? [...prev, f.id] : prev.filter((x) => x !== f.id)))}
                  />
                  {f.label}
                </Label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="rerun-note">Note for the model</Label>
            <Textarea id="rerun-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional, e.g. use the German supplier text for care instructions" />
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t p-5">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={fields.length === 0 || busy} onClick={() => void submit()}>
            Queue re-run
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
