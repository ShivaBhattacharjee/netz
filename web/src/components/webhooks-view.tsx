"use client";

import { Check, Copy, MoreHorizontal, Plus, Send, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/data/api";
import { formatDateTime } from "@/lib/format";
import type { WebhookDelivery, WebhookEndpoint } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader, Panel } from "./common";
import { EmptyState } from "./empty-state";
import { PageLoader } from "./page-loader";

const EVENTS = [
  { id: "import.completed", help: "Every row reached done, needs review or failed" },
  { id: "import.failed", help: "The file could not be read or the import failed" },
  { id: "product.approved", help: "A merchant approved products, single or bulk" },
];

const payload = `POST /your-endpoint
x-catalogforge-event: import.completed
x-catalogforge-signature: t=1761030000,v1=<hex>

{
  "event": "import.completed",
  "store_id": "st_…",
  "sent_at": "2026-10-21T08:41:00.000Z",
  "data": {
    "import_id": "imp_…",
    "file_name": "supplier-sheet.xlsx",
    "counts": { "done": 176, "needs_review": 38, "failed": 8, "pending": 0, "total": 222 },
    "cost_usd": 1.17,
    "finished_at": "2026-10-21T08:41:00.000Z"
  }
}

v1 = HMAC-SHA256(secret, "<t>.<raw body>")`;

function AddWebhook({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["import.completed", "import.failed"]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const close = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setUrl("");
      setError(null);
      setSecret(null);
      setCopied(false);
    }
  };

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string; secret: string }>("/api/webhooks", { method: "POST", json: { url, events } });
      setSecret(created.secret);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the endpoint");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-lg">{secret ? "Endpoint added" : "Add webhook endpoint"}</SheetTitle>
          <SheetDescription>
            {secret ? "Copy the signing secret now. It is not shown again." : "Each request is signed with a secret and retried with backoff up to 8 times."}
          </SheetDescription>
        </SheetHeader>
        {secret ? (
          <div className="flex flex-1 flex-col gap-3 p-5">
            <span id="wh-secret-label" className="text-sm font-medium">
              Signing secret
            </span>
            <div className="flex h-10 items-stretch border bg-muted/30">
              <code aria-labelledby="wh-secret-label" title={secret} className="flex min-w-0 flex-1 items-center px-3 font-mono text-xs select-all">
                <span className="truncate">{secret}</span>
              </code>
              <Button
                variant="ghost"
                aria-label="Copy secret"
                className="h-auto shrink-0 rounded-none border-l px-3"
                onClick={() => {
                  void navigator.clipboard.writeText(secret);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <Check /> : <Copy />}
                <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Verify the x-catalogforge-signature header with it before trusting a request.</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="wh-url">Endpoint URL</Label>
              <Input id="wh-url" placeholder="https://example.com/webhooks/catalog" value={url} aria-invalid={!!error} onChange={(e) => setUrl(e.target.value)} />
              <p className={cn("text-xs", error ? "text-error" : "text-muted-foreground")}>{error ?? "We send a POST with a JSON body. Private and local addresses are blocked."}</p>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Events</legend>
              {EVENTS.map((e) => {
                const checked = events.includes(e.id);
                return (
                  <Label
                    key={e.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 border p-3 font-normal transition-colors hover:bg-muted/50",
                      checked && "border-foreground/40 bg-muted/40",
                    )}
                  >
                    <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(c) => setEvents((p) => (c ? [...p, e.id] : p.filter((x) => x !== e.id)))} />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs">{e.id}</span>
                      <span className="text-xs text-muted-foreground">{e.help}</span>
                    </span>
                  </Label>
                );
              })}
            </fieldset>
          </div>
        )}
        <SheetFooter className="flex-row justify-end gap-2 border-t p-5">
          {secret ? (
            <Button onClick={() => close(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button disabled={!url.trim() || events.length === 0 || busy} onClick={() => void submit()}>
                {busy ? "Adding" : "Add endpoint"}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function WebhooksView() {
  const [data, setData] = useState<{ webhooks: WebhookEndpoint[]; deliveries: WebhookDelivery[] } | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    api<{ webhooks: WebhookEndpoint[]; deliveries: WebhookDelivery[] }>("/api/webhooks")
      .then(setData)
      .catch((e: Error) => toast.error(e.message));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  async function run(action: () => Promise<unknown>, success?: string) {
    try {
      await action();
      if (success) toast.success(success);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function remove(id: string) {
    const before = data;
    setData((d) => d && { ...d, webhooks: d.webhooks.filter((w) => w.id !== id) });
    try {
      await api(`/api/webhooks/${id}`, { method: "DELETE" });
      toast.success("Endpoint deleted");
    } catch (e) {
      setData(before);
      toast.error(e instanceof Error ? e.message : "Could not delete the endpoint");
    }
  }

  const addButton = (label: string) => (
    <Button onClick={() => setAdding(true)}>
      <Plus data-icon="inline-start" />
      {label}
    </Button>
  );

  const hooks = data?.webhooks ?? [];

  return (
    <>
      <PageHeader title="Webhooks" meta="Get notified when an import finishes or products are approved" actions={hooks.length ? addButton("Add endpoint") : null} />
      <AddWebhook open={adding} onOpenChange={setAdding} onCreated={load} />
      {!data ? <PageLoader /> : null}

      {data && hooks.length === 0 ? (
        <EmptyState
          title="No webhooks yet"
          description="Add an endpoint to receive signed events when an import completes or fails, or when products are approved."
          action={addButton("Create webhook")}
        />
      ) : null}

      {hooks.length ? (
        <>
          <Panel title="Endpoints" icon={WebhookIcon} bodyClassName="p-0">
            <ul className="divide-y">
              {hooks.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-mono text-sm">{h.url}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {h.events.map((e) => (
                        <span key={e} className="bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {e}
                        </span>
                      ))}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">{h.secret_hint}</span>
                  <Switch
                    checked={h.enabled}
                    aria-label={`${h.enabled ? "Disable" : "Enable"} ${h.url}`}
                    onCheckedChange={(enabled) => void run(() => api(`/api/webhooks/${h.id}`, { method: "PATCH", json: { enabled } }))}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${h.url}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void run(() => api(`/api/webhooks/${h.id}/test`, { method: "POST" }), "Test event queued")}>
                        <Send />
                        Send test event
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => void remove(h.id)}>
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-5">
            <Panel title="Recent deliveries" icon={Send} className="lg:col-span-3" bodyClassName="p-0">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th scope="col" className="h-9 px-4 text-left font-medium">Event</th>
                    <th scope="col" className="h-9 px-4 text-left font-medium">Response</th>
                    <th scope="col" className="h-9 px-4 text-right font-medium">Attempt</th>
                    <th scope="col" className="h-9 px-4 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.deliveries.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 font-mono text-xs">{d.event}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("font-mono text-xs", d.ok ? "text-success" : "text-error")}>{d.status ?? "–"}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{d.error ?? `${d.duration_ms} ms`}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{d.attempt}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatDateTime(d.at)}</td>
                    </tr>
                  ))}
                  {data?.deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No deliveries yet. Send a test event from an endpoint&apos;s menu.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </Panel>
            <Panel title="Payload" icon={WebhookIcon} className="lg:col-span-2" bodyClassName="p-0">
              <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-muted-foreground">{payload}</pre>
            </Panel>
          </div>
        </>
      ) : null}
    </>
  );
}
