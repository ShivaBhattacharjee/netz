"use client";

import { Braces, Database, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/data/api";
import { formatBytes, formatDateTime, formatNumber } from "@/lib/format";
import type { EvalSet } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Panel } from "./common";

const SHEET_LIMIT = 25 * 1024 * 1024;
const LABELS_LIMIT = 25 * 1024 * 1024;

function extension(name: string) {
  return name.toLowerCase().split(".").pop() ?? "";
}

export function UploadEvalSet({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<File | null>(null);
  const [labels, setLabels] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  function reset() {
    setSheet(null);
    setLabels(null);
    setName("");
    setErrors([]);
  }

  function addFiles(list: FileList) {
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      const ext = extension(file.name);
      if (ext === "csv" || ext === "xlsx") {
        if (file.size > SHEET_LIMIT) problems.push(`${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(SHEET_LIMIT)}.`);
        else {
          setSheet(file);
          if (!name) setName(file.name.replace(/\.[^.]+$/, "").slice(0, 80));
        }
      } else if (ext === "json") {
        if (file.size > LABELS_LIMIT) problems.push(`${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(LABELS_LIMIT)}.`);
        else setLabels(file);
      } else {
        problems.push(`${file.name} is not a CSV, XLSX or JSON file.`);
      }
    }
    setErrors(problems);
  }

  async function create() {
    if (!sheet || !labels) return;
    setBusy(true);
    setErrors([]);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await labels.text());
      } catch {
        throw new Error(`${labels.name} is not valid JSON`);
      }
      const { id: sheetId } = await api<{ id: string }>("/api/uploads?kind=sheet", {
        method: "POST",
        headers: { "x-file-name": encodeURIComponent(sheet.name) },
        body: sheet,
      });
      const { matched } = await api<{ matched: number }>("/api/evals/sets", {
        method: "POST",
        json: { name, sheet_upload_id: sheetId, labels: parsed },
      });
      toast.success(`Added ${name} · ${formatNumber(matched)} labelled products found in the sheet`);
      reset();
      onOpenChange(false);
      onCreated();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Upload failed, please try again."]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && busy) return;
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload labelled set</DialogTitle>
          <DialogDescription>A supplier sheet and a labels.json with the expected products, prices, claims and review status for it.</DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={cn(
            "plain-button flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            dragging ? "border-foreground bg-muted" : "border-input hover:bg-muted/50",
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Upload className="size-4 text-muted-foreground" />
          </span>
          <span className="text-sm font-medium">Drop both files or click to browse</span>
          <span className="text-xs text-muted-foreground">CSV or XLSX sheet and labels.json, up to 25 MB each</span>
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".csv,.xlsx,.json,application/json"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <ul className="flex flex-col divide-y rounded-lg border text-sm">
          <li className="flex items-center gap-3 px-3 py-2.5">
            <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
            {sheet ? (
              <>
                <span className="min-w-0 flex-1 truncate">{sheet.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(sheet.size)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Supplier sheet (CSV or XLSX)</span>
            )}
          </li>
          <li className="flex items-center gap-3 px-3 py-2.5">
            <Braces className="size-4 shrink-0 text-muted-foreground" />
            {labels ? (
              <>
                <span className="min-w-0 flex-1 truncate">{labels.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(labels.size)}</span>
              </>
            ) : (
              <span className="text-muted-foreground">labels.json</span>
            )}
          </li>
        </ul>

        <div className="flex flex-col gap-2">
          <Label htmlFor="eval-set-name">Name</Label>
          <Input id="eval-set-name" value={name} maxLength={80} placeholder="e.g. garden-supplier-march" onChange={(e) => setName(e.target.value)} />
        </div>

        {errors.length ? (
          <ul role="alert" className="flex flex-col gap-1 text-sm text-error">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!sheet || !labels || !name.trim() || busy} onClick={() => void create()}>
            {busy ? "Uploading" : "Add set"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EvalSetsPanel({ sets, onUpload, onChanged }: { sets: EvalSet[]; onUpload: () => void; onChanged: () => void }) {
  const [deleting, setDeleting] = useState<EvalSet | null>(null);

  return (
    <Panel
      title="Labelled sets"
      icon={Database}
      bodyClassName="p-0"
      action={
        <Button size="sm" variant="outline" onClick={onUpload}>
          <Upload data-icon="inline-start" />
          Upload set
        </Button>
      }
    >
      <ul className="flex flex-col divide-y text-sm">
        {sets.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <span className="block truncate font-medium">{s.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {s.file_name} · {formatNumber(s.products)} products · {formatNumber(s.rows)} rows · {formatDateTime(s.created_at)}
              </span>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Finished runs keep their scores. Runs that have not finished on this set will fail.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = deleting;
                if (!target) return;
                api(`/api/evals/sets/${target.id}`, { method: "DELETE" })
                  .then(() => {
                    toast.success("Set deleted");
                    onChanged();
                  })
                  .catch((e: Error) => toast.error(e.message));
              }}
            >
              Delete set
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
