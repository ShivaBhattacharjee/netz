"use client";

import { Check, Copy, KeyRound, Plus, Terminal, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { formatDateTime } from "@/lib/format";
import { PageHeader, Panel } from "./common";
import { EmptyState } from "./empty-state";
import { PageLoader } from "./page-loader";

interface Key {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

function quickStart(origin: string) {
  return `# 1. Upload the sheet (and photos or a ZIP the same way with kind=photo / kind=zip)
curl -X POST "${origin}/api/uploads?kind=sheet" \\
  -H "Authorization: Bearer $CATALOGFORGE_KEY" \\
  -H "x-file-name: supplier-sheet.csv" \\
  --data-binary @supplier-sheet.csv

# 2. Start the import with the returned upload ids
curl -X POST "${origin}/api/imports" \\
  -H "Authorization: Bearer $CATALOGFORGE_KEY" \\
  -H "content-type: application/json" \\
  -d '{"sheet_upload_id": "up_…", "photo_upload_ids": []}'

# 3. Poll progress, or add a webhook for import.completed
curl "${origin}/api/imports/imp_…?limit=1" -H "Authorization: Bearer $CATALOGFORGE_KEY"`;
}

function CreateKey({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setName("");
      setKey(null);
      setError(null);
      setCopied(false);
    }
  };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ key: string }>("/api/keys", { method: "POST", json: { name } });
      setKey(created.key);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the key");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{key ? "Key created" : "Create API key"}</DialogTitle>
          <DialogDescription>{key ? "Copy it now. For your security it is not shown again." : "Keys can start imports and read this store's data."}</DialogDescription>
        </DialogHeader>
        {key ? (
          <div className="flex gap-2">
            <Input readOnly value={key} className="font-mono text-xs" onFocus={(e) => e.target.select()} aria-label="API key" />
            <Button
              variant="outline"
              size="icon"
              aria-label="Copy key"
              onClick={() => {
                void navigator.clipboard.writeText(key);
                setCopied(true);
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        ) : (
          <form
            id="create-key"
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Label htmlFor="key-name">Name</Label>
            <Input id="key-name" autoFocus placeholder="ERP sync" value={name} maxLength={60} aria-invalid={!!error} onChange={(e) => setName(e.target.value)} />
            <p className={error ? "text-xs text-error" : "text-xs text-muted-foreground"}>{error ?? "So you can tell keys apart later."}</p>
          </form>
        )}
        <DialogFooter>
          {key ? (
            <Button onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" form="create-key" disabled={!name.trim() || busy}>
                {busy ? "Creating" : "Create key"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ApiKeysView() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<Key | null>(null);
  const [origin, setOrigin] = useState("");

  const load = useCallback(() => {
    api<{ keys: Key[] }>("/api/keys")
      .then((r) => setKeys(r.keys))
      .catch((e: Error) => toast.error(e.message));
  }, []);

  useEffect(() => {
    load();
    setOrigin(window.location.origin);
  }, [load]);

  const createButton = (label: string) => (
    <Button onClick={() => setCreating(true)}>
      <Plus data-icon="inline-start" />
      {label}
    </Button>
  );

  return (
    <>
      <PageHeader title="API keys" meta="Programmatic imports for this store" actions={keys?.length ? createButton("Create key") : null} />
      <CreateKey open={creating} onOpenChange={setCreating} onCreated={load} />

      {!keys ? <PageLoader /> : null}
      {keys && keys.length === 0 ? (
        <EmptyState
          title="No API keys yet"
          description="Create a key to upload sheets and start imports from your ERP or scripts. Send it as a Bearer token."
          action={createButton("Create API key")}
        />
      ) : null}

      {keys?.length ? (
        <Panel title="Keys" icon={KeyRound} bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th scope="col" className="h-9 px-4 text-left font-medium">Name</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Key</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Created</th>
                <th scope="col" className="h-9 px-4 text-left font-medium">Last used</th>
                <th scope="col" className="h-9 w-12 px-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{k.prefix}…</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatDateTime(k.created_at)}</td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{k.last_used_at ? formatDateTime(k.last_used_at) : "Never"}</td>
                  <td className="px-2 py-3">
                    <Button variant="ghost" size="icon-sm" aria-label={`Revoke ${k.name}`} onClick={() => setRevoking(k)}>
                      <Trash2 />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}

      {keys?.length ? (
        <Panel title="Quick start" icon={Terminal} bodyClassName="p-0">
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">{quickStart(origin)}</pre>
        </Panel>
      ) : null}

      <AlertDialog open={revoking !== null} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {revoking?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Requests using this key stop working immediately. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                const target = revoking;
                if (!target) return;
                const before = keys;
                setKeys((k) => k && k.filter((x) => x.id !== target.id));
                api(`/api/keys/${target.id}`, { method: "DELETE" })
                  .then(() => toast.success("Key revoked"))
                  .catch((e: Error) => {
                    setKeys(before);
                    toast.error(e.message);
                  });
              }}
            >
              Revoke key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
