import { createHmac, randomBytes } from "node:crypto";
import { type LookupAddress, type LookupOptions, lookup } from "node:dns";
import https from "node:https";
import http from "node:http";
import { isIP } from "node:net";
import { and, arrayContains, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhook, webhookDelivery } from "@/db/schema";
import { newId } from "./ids";
import { log } from "./log";
import { queue, QUEUE } from "./queues";

export const WEBHOOK_EVENTS = ["import.completed", "import.failed", "product.approved"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number] | "webhook.test";

const MAX_WEBHOOKS_PER_STORE = 10;
const TIMEOUT_MS = 10_000;

export class WebhookInputError extends Error {}

export interface WebhookJob {
  webhookId: string;
  event: WebhookEvent;
  payload: Record<string, unknown>;
}

const allowPrivate = () => process.env.WEBHOOKS_ALLOW_PRIVATE === "true";

function isPrivateAddress(address: string) {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    if (a === "::1" || a === "::") return true;
    if (a.startsWith("::ffff:")) return isPrivateAddress(a.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(a);
  }
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function validateWebhookUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new WebhookInputError("Enter a full URL, for example https://example.com/webhooks");
  }
  if (url.protocol !== "https:" && !(allowPrivate() && url.protocol === "http:")) throw new WebhookInputError("Webhook URLs must use https://");
  if (url.username || url.password) throw new WebhookInputError("Webhook URLs cannot contain credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!allowPrivate() && (host === "localhost" || host.endsWith(".localhost") || (isIP(host) && isPrivateAddress(host)))) {
    throw new WebhookInputError("Webhook URLs cannot point at private or local addresses");
  }
  return url.toString();
}

const safeLookup = ((hostname: string, options: LookupOptions, callback: (err: Error | null, address: string | LookupAddress[], family?: number) => void) => {
  lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const blocked = !allowPrivate() && addresses.find((a) => isPrivateAddress(a.address));
    if (blocked) return callback(new Error(`Blocked private address ${blocked.address}`), "", 0);
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}) as unknown as typeof lookup;

export function sign(secret: string, timestamp: number, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

function post(url: string, body: string, headers: Record<string, string>) {
  return new Promise<{ status: number }>((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === "https:" ? https : http;
    const req = client.request(
      target,
      { method: "POST", headers: { ...headers, "content-length": Buffer.byteLength(body).toString() }, lookup: safeLookup, timeout: TIMEOUT_MS },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Timed out after ${TIMEOUT_MS / 1000}s`)));
    req.on("error", reject);
    req.end(body);
  });
}

export async function deliver(job: WebhookJob, attempt: number) {
  const [hook] = await db.select().from(webhook).where(eq(webhook.id, job.webhookId));
  if (!hook || (!hook.enabled && job.event !== "webhook.test")) return { skipped: true };

  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({ event: job.event, store_id: hook.storeId, sent_at: new Date().toISOString(), data: job.payload });
  const started = Date.now();
  let status: number | null = null;
  let error: string | null = null;
  try {
    ({ status } = await post(hook.url, body, {
      "content-type": "application/json",
      "user-agent": "CatalogForge-Webhooks/1",
      "x-catalogforge-event": job.event,
      "x-catalogforge-signature": `t=${timestamp},v1=${sign(hook.secret, timestamp, body)}`,
    }));
    if (status >= 300) error = status >= 300 && status < 400 ? `Redirects are not followed (${status})` : `Endpoint answered ${status}`;
  } catch (e) {
    error = (e as Error).message;
  }
  const ok = error === null;
  await db.insert(webhookDelivery).values({
    id: newId("dlv"),
    webhookId: hook.id,
    storeId: hook.storeId,
    event: job.event,
    status,
    ok,
    attempt,
    durationMs: Date.now() - started,
    error,
  });
  if (!ok) throw new Error(error ?? "Delivery failed");
  return { status };
}

export async function emitWebhook(storeId: string, event: Exclude<WebhookEvent, "webhook.test">, payload: Record<string, unknown>) {
  try {
    const hooks = await db
      .select({ id: webhook.id })
      .from(webhook)
      .where(and(eq(webhook.storeId, storeId), eq(webhook.enabled, true), arrayContains(webhook.events, [event])));
    if (hooks.length === 0) return;
    await queue(QUEUE.webhooks).addBulk(
      hooks.map((h) => ({ name: event, data: { webhookId: h.id, event, payload } satisfies WebhookJob, opts: { attempts: 8 } })),
    );
  } catch (error) {
    log.warn("webhook enqueue failed", { storeId, event, error: (error as Error).message });
  }
}

function secretHint(secret: string) {
  return `${secret.slice(0, 6)}…${secret.slice(-4)}`;
}

export async function listWebhooks(storeId: string) {
  const [hooks, deliveries] = await Promise.all([
    db.select().from(webhook).where(eq(webhook.storeId, storeId)).orderBy(desc(webhook.createdAt)),
    db.select().from(webhookDelivery).where(eq(webhookDelivery.storeId, storeId)).orderBy(desc(webhookDelivery.createdAt)).limit(20),
  ]);
  return {
    webhooks: hooks.map((h) => ({ id: h.id, url: h.url, events: h.events, enabled: h.enabled, secret_hint: secretHint(h.secret), created_at: h.createdAt.toISOString() })),
    deliveries: deliveries.map((d) => ({
      id: d.id,
      webhook_id: d.webhookId,
      event: d.event,
      status: d.status,
      ok: d.ok,
      attempt: d.attempt,
      duration_ms: d.durationMs,
      error: d.error,
      at: d.createdAt.toISOString(),
    })),
  };
}

export async function createWebhook(storeId: string, input: { url: string; events: string[] }) {
  const url = validateWebhookUrl(input.url);
  const [{ n }] = await db.select({ n: count() }).from(webhook).where(eq(webhook.storeId, storeId));
  if (n >= MAX_WEBHOOKS_PER_STORE) throw new WebhookInputError(`A store can have at most ${MAX_WEBHOOKS_PER_STORE} webhooks`);
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const id = newId("wh");
  await db.insert(webhook).values({ id, storeId, url, events: [...new Set(input.events)], secret });
  return { id, secret };
}

async function owned(storeId: string, id: string) {
  const [hook] = await db.select().from(webhook).where(and(eq(webhook.id, id), eq(webhook.storeId, storeId)));
  if (!hook) throw new WebhookInputError("Webhook not found");
  return hook;
}

export async function updateWebhook(storeId: string, id: string, input: { enabled?: boolean; events?: string[] }) {
  await owned(storeId, id);
  await db
    .update(webhook)
    .set({ ...(input.enabled !== undefined ? { enabled: input.enabled } : {}), ...(input.events ? { events: [...new Set(input.events)] } : {}) })
    .where(eq(webhook.id, id));
}

export async function deleteWebhook(storeId: string, id: string) {
  await owned(storeId, id);
  await db.delete(webhook).where(eq(webhook.id, id));
}

export async function testWebhook(storeId: string, id: string) {
  await owned(storeId, id);
  await queue(QUEUE.webhooks).add(
    "webhook.test",
    { webhookId: id, event: "webhook.test", payload: { message: "Test event from CatalogForge" } } satisfies WebhookJob,
    { attempts: 1 },
  );
}
