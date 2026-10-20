"use client";

import { MoreHorizontal, Plus, Send, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { deliveries, webhookEvents, webhooks as seedWebhooks, type Webhook } from "@/lib/data/platform";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";
import { PageHeader, Panel } from "./common";

const payload = `{
  "event": "import.completed",
  "import_id": "imp_spring",
  "store_id": "st_atelier",
  "counts": { "done": 176, "needs_review": 38, "failed": 8, "total": 222 },
  "cost_usd": 1.17,
  "finished_at": "2026-10-20T08:41:00Z"
}`;

const eventHelp: Record<string, string> = {
  "import.completed": "Every row reached done, needs review or failed",
  "import.failed": "The file could not be read or the import was cancelled",
  "product.approved": "A merchant approved a product, single or bulk",
  "product.needs_review": "The AI flagged a product for review",
};

function AddWebhook({ onAdd }: { onAdd: (w: Webhook) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["import.completed"]);
  const urlInvalid = url.length > 0 && !/^https:\/\/.+/.test(url);
  const valid = /^https:\/\/.+/.test(url) && events.length > 0;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          Add endpoint
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <SheetTitle className="text-lg">Add webhook endpoint</SheetTitle>
          <SheetDescription>Requests are signed with a secret and retried with backoff for 24 hours.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="wh-url">Endpoint URL</Label>
            <Input id="wh-url" placeholder="https://example.com/webhooks/catalog" value={url} aria-invalid={urlInvalid} onChange={(e) => setUrl(e.target.value)} />
            <p className={cn("text-xs", urlInvalid ? "text-error" : "text-muted-foreground")}>
              {urlInvalid ? "Use an https:// URL." : "We send a POST with a JSON body and an X-Signature header."}
            </p>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium">Events</legend>
            {webhookEvents.map((e) => {
              const checked = events.includes(e);
              return (
                <Label
                  key={e}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-muted/50",
                    checked && "border-foreground/40 bg-muted/40",
                  )}
                >
                  <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(c) => setEvents((p) => (c ? [...p, e] : p.filter((x) => x !== e)))} />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-mono text-xs">{e}</span>
                    <span className="text-xs text-muted-foreground">{eventHelp[e]}</span>
                  </span>
                </Label>
              );
            })}
          </fieldset>
        </div>
        <SheetFooter className="flex-row justify-end gap-2 border-t p-5">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onAdd({ id: `wh_${Date.now()}`, url, events, enabled: true, secret_hint: "whsec_…new" });
              toast.success("Endpoint added", { description: url });
              setOpen(false);
              setUrl("");
            }}
          >
            Add endpoint
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function WebhooksView() {
  const [hooks, setHooks] = useState(seedWebhooks);

  return (
    <>
      <PageHeader title="Webhooks" meta="Get notified when an import finishes or a product needs review" actions={<AddWebhook onAdd={(w) => setHooks((h) => [...h, w])} />} />

      <Panel title="Endpoints" icon={WebhookIcon} bodyClassName="p-0">
        <ul className="divide-y">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-mono text-sm">{h.url}</span>
                <span className="flex flex-wrap gap-1.5">
                  {h.events.map((e) => (
                    <span key={e} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {e}
                    </span>
                  ))}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{h.secret_hint}</span>
              <Switch
                checked={h.enabled}
                aria-label={`${h.enabled ? "Disable" : "Enable"} ${h.url}`}
                onCheckedChange={(c) => setHooks((all) => all.map((x) => (x.id === h.id ? { ...x, enabled: c } : x)))}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${h.url}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => toast.success("Test event sent", { description: h.url })}>
                    <Send />
                    Send test event
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setHooks((all) => all.filter((x) => x.id !== h.id))}>
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
          {hooks.length === 0 ? <li className="px-4 py-10 text-center text-sm text-muted-foreground">No endpoints yet.</li> : null}
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
              {deliveries.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs">{d.event}</td>
                  <td className="px-4 py-2.5">
                    <span className={cn("font-mono text-xs", d.status < 300 ? "text-success" : "text-error")}>{d.status}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{d.duration_ms} ms</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{d.attempt}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatDateTime(d.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Payload" icon={WebhookIcon} className="lg:col-span-2" bodyClassName="p-0">
          <CodeBlock code={payload} lang="json" />
        </Panel>
      </div>
    </>
  );
}
