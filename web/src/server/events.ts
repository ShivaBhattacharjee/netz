import type IORedis from "ioredis";
import { EVENTS_CHANNEL } from "./jobs/progress";
import { createRedis } from "./redis";

export interface CatalogEvent {
  type: string;
  storeId: string;
  [key: string]: unknown;
}

type Listener = (event: CatalogEvent) => void;

const globalForEvents = globalThis as unknown as { subscriber?: IORedis; listeners?: Map<string, Set<Listener>> };

function listeners() {
  globalForEvents.listeners ??= new Map();
  return globalForEvents.listeners;
}

function ensureSubscriber() {
  if (globalForEvents.subscriber) return;
  const sub = createRedis();
  globalForEvents.subscriber = sub;
  void sub.subscribe(EVENTS_CHANNEL);
  sub.on("message", (_channel, raw: string) => {
    let event: CatalogEvent;
    try {
      event = JSON.parse(raw) as CatalogEvent;
    } catch {
      return;
    }
    for (const listener of listeners().get(event.storeId) ?? []) listener(event);
  });
}

export function subscribeStore(storeId: string, listener: Listener) {
  ensureSubscriber();
  const set = listeners().get(storeId) ?? new Set();
  set.add(listener);
  listeners().set(storeId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners().delete(storeId);
  };
}
