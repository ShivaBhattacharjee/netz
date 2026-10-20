"use client";

import { FileSpreadsheet, Images, Plus, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { actions } from "@/lib/data/store";
import { formatBytes, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const MB = 1024 * 1024;
const LIMITS = { sheet: 25 * MB, zip: 500 * MB, photo: 10 * MB, rows: 10_000, photos: 2_000 };

type Kind = "sheet" | "zip" | "photo";

function kindOf(name: string): Kind | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "xlsx") return "sheet";
  if (ext === "zip") return "zip";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "photo";
  return null;
}

interface Staged {
  sheet: File | null;
  zips: File[];
  photos: File[];
}

const empty: Staged = { sheet: null, zips: [], photos: [] };

async function countCsvRows(file: File): Promise<number> {
  const text = await file.text();
  return Math.max(0, text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0).length - 1);
}

export function UploadButton({ label = "Upload", size }: { label?: string; size?: "default" | "lg" }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState<Staged>(empty);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [starting, setStarting] = useState(false);

  function addFiles(list: FileList | File[]) {
    const next: Staged = { sheet: staged.sheet, zips: [...staged.zips], photos: [...staged.photos] };
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      const kind = kindOf(file.name);
      if (!kind) {
        problems.push(`${file.name} is not a supported type. Use CSV or XLSX, JPG, PNG or WebP, or a ZIP.`);
        continue;
      }
      if (file.size > LIMITS[kind]) {
        problems.push(`${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(LIMITS[kind])}.`);
        continue;
      }
      if (file.size === 0) {
        problems.push(`${file.name} is empty.`);
        continue;
      }
      if (kind === "sheet") {
        if (next.sheet) problems.push(`Replaced ${next.sheet.name} with ${file.name}. An import takes one sheet.`);
        next.sheet = file;
      } else if (kind === "zip") {
        next.zips.push(file);
      } else if (next.photos.length >= LIMITS.photos) {
        problems.push(`${file.name} was skipped. An import takes at most ${formatNumber(LIMITS.photos)} photos.`);
      } else {
        next.photos.push(file);
      }
    }
    setStaged(next);
    setErrors(problems);
  }

  function reset() {
    setStaged(empty);
    setErrors([]);
  }

  async function start() {
    if (!staged.sheet) return;
    setStarting(true);
    const rows = staged.sheet.name.toLowerCase().endsWith(".csv") ? await countCsvRows(staged.sheet) : 250;
    setStarting(false);
    if (rows === 0) {
      setErrors([`${staged.sheet.name} has no data rows under the header.`]);
      return;
    }
    if (rows > LIMITS.rows) {
      setErrors([`${staged.sheet.name} has ${formatNumber(rows)} rows. The limit is ${formatNumber(LIMITS.rows)}, so split the sheet.`]);
      return;
    }
    const id = actions.addImport(staged.sheet, staged.photos.length, rows);
    reset();
    setOpen(false);
    router.push(`/imports/${id}`);
  }

  const hasFiles = Boolean(staged.sheet || staged.zips.length || staged.photos.length);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size={size}>
          <Plus data-icon="inline-start" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New import</DialogTitle>
          <DialogDescription>One supplier sheet plus its photos. Processing runs in the background.</DialogDescription>
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
          <span className="text-sm font-medium">Drop files or click to browse</span>
          <span className="text-xs text-muted-foreground">
            CSV or XLSX up to 25 MB and {formatNumber(LIMITS.rows)} rows · up to {formatNumber(LIMITS.photos)} photos, 10 MB each, or a ZIP
          </span>
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".csv,.xlsx,.zip,.jpg,.jpeg,.png,.webp"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {hasFiles ? (
          <ul className="flex flex-col divide-y rounded-lg border text-sm">
            <li className="flex items-center gap-3 px-3 py-2.5">
              <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
              {staged.sheet ? (
                <>
                  <span className="min-w-0 flex-1 truncate">{staged.sheet.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{formatBytes(staged.sheet.size)}</span>
                </>
              ) : (
                <span className="text-warning">Add a CSV or XLSX sheet to start</span>
              )}
            </li>
            <li className="flex items-center gap-3 px-3 py-2.5">
              <Images className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">
                {formatNumber(staged.photos.length)} photo{staged.photos.length === 1 ? "" : "s"}
                {staged.zips.length ? ` and ${staged.zips.length} ZIP` : ""}
              </span>
              <Button variant="ghost" size="icon-sm" aria-label="Clear files" onClick={reset}>
                <X />
              </Button>
            </li>
          </ul>
        ) : null}

        {errors.length ? (
          <ul role="alert" className="flex flex-col gap-1 text-sm text-error">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!staged.sheet || starting} onClick={start}>
            {starting ? "Starting" : "Start import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
