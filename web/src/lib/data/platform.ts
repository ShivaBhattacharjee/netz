export interface Store {
  id: string;
  name: string;
  domain: string;
  plan: string;
}

export const stores: Store[] = [
  { id: "st_atelier", name: "Atelier Terra", domain: "atelierterra.shop", plan: "Pro" },
  { id: "st_maison", name: "Maison Déco", domain: "maison-deco.fr", plan: "Pro" },
  { id: "st_nordic", name: "Nordic Living", domain: "nordicliving.de", plan: "Starter" },
];

export const currentUser = { name: "Demo merchant", email: "merchant@atelierterra.shop", initials: "DM" };

export interface FieldAccuracy {
  field: string;
  accuracy: number;
  previous: number;
  samples: number;
}

export interface EvalRun {
  id: string;
  label: string;
  model: string;
  prompt: string;
  started_at: string;
  accuracy: number;
  invented_claims: number;
  cost_micros: number;
  samples: number;
}

export const evalSet = { name: "golden-v2", products: 240, source: "Hand-labelled from 6 supplier sheets", updated_at: "2026-10-18T09:00:00Z" };

export const fieldAccuracy: FieldAccuracy[] = [
  { field: "title", accuracy: 97.1, previous: 95.8, samples: 240 },
  { field: "category", accuracy: 91.3, previous: 88.0, samples: 240 },
  { field: "price_cents", accuracy: 99.6, previous: 99.6, samples: 612 },
  { field: "variants", accuracy: 94.2, previous: 92.9, samples: 240 },
  { field: "attributes.material", accuracy: 96.4, previous: 95.1, samples: 228 },
  { field: "attributes.color", accuracy: 89.7, previous: 84.2, samples: 221 },
  { field: "attributes.care", accuracy: 82.5, previous: 80.9, samples: 164 },
  { field: "claims", accuracy: 93.8, previous: 90.4, samples: 311 },
  { field: "translation.de", accuracy: 92.6, previous: 92.1, samples: 240 },
  { field: "translation.fr", accuracy: 91.9, previous: 91.0, samples: 240 },
];

export const evalRuns: EvalRun[] = [
  { id: "ev_014", label: "Prompt v4 + routing", model: "haiku → sonnet", prompt: "v4", started_at: "2026-10-20T07:10:00Z", accuracy: 93.9, invented_claims: 0, cost_micros: 2_310_000, samples: 240 },
  { id: "ev_013", label: "Prompt v4, sonnet only", model: "claude-sonnet-5-5", prompt: "v4", started_at: "2026-10-19T16:40:00Z", accuracy: 94.4, invented_claims: 0, cost_micros: 5_820_000, samples: 240 },
  { id: "ev_012", label: "Prompt v3 + routing", model: "haiku → sonnet", prompt: "v3", started_at: "2026-10-18T11:05:00Z", accuracy: 91.7, invented_claims: 2, cost_micros: 2_250_000, samples: 240 },
  { id: "ev_011", label: "Prompt v3, haiku only", model: "claude-haiku-5-5", prompt: "v3", started_at: "2026-10-17T09:30:00Z", accuracy: 87.2, invented_claims: 5, cost_micros: 1_120_000, samples: 240 },
];

export interface Variant {
  name: string;
  model: string;
  prompt: string;
  traffic: number;
  products: number;
  accuracy: number;
  review_rate: number;
  cost_per_1k_micros: number;
  p50_ms: number;
}

export interface Experiment {
  id: string;
  name: string;
  status: "running" | "concluded" | "draft";
  started_at: string;
  metric: string;
  winner: string | null;
  confidence: number;
  variants: Variant[];
}

export const experiments: Experiment[] = [
  {
    id: "exp_07",
    name: "Claim extraction prompt v4 vs v3",
    status: "running",
    started_at: "2026-10-19T08:00:00Z",
    metric: "Field accuracy",
    winner: null,
    confidence: 87,
    variants: [
      { name: "Control", model: "claude-haiku-5-5", prompt: "v3", traffic: 50, products: 1840, accuracy: 91.7, review_rate: 14.2, cost_per_1k_micros: 9_800_000, p50_ms: 2100 },
      { name: "Treatment", model: "claude-haiku-5-5", prompt: "v4", traffic: 50, products: 1822, accuracy: 93.9, review_rate: 11.6, cost_per_1k_micros: 10_300_000, p50_ms: 2250 },
    ],
  },
  {
    id: "exp_06",
    name: "Routing threshold for messy rows",
    status: "concluded",
    started_at: "2026-10-12T08:00:00Z",
    metric: "Cost per 1,000 products",
    winner: "Threshold 0.6",
    confidence: 98,
    variants: [
      { name: "Threshold 0.4", model: "haiku → sonnet", prompt: "v3", traffic: 50, products: 4210, accuracy: 92.4, review_rate: 12.9, cost_per_1k_micros: 14_900_000, p50_ms: 3100 },
      { name: "Threshold 0.6", model: "haiku → sonnet", prompt: "v3", traffic: 50, products: 4188, accuracy: 92.1, review_rate: 13.3, cost_per_1k_micros: 10_200_000, p50_ms: 2600 },
    ],
  },
  {
    id: "exp_08",
    name: "Translation model for French",
    status: "draft",
    started_at: "2026-10-21T08:00:00Z",
    metric: "Translation accuracy",
    winner: null,
    confidence: 0,
    variants: [
      { name: "Control", model: "claude-haiku-5-5", prompt: "tr-v2", traffic: 50, products: 0, accuracy: 0, review_rate: 0, cost_per_1k_micros: 0, p50_ms: 0 },
      { name: "Treatment", model: "claude-sonnet-5-5", prompt: "tr-v2", traffic: 50, products: 0, accuracy: 0, review_rate: 0, cost_per_1k_micros: 0, p50_ms: 0 },
    ],
  },
];

export interface Worker {
  id: string;
  queue: string;
  status: "busy" | "idle" | "draining";
  concurrency: number;
  active: number;
  processed: number;
  uptime_min: number;
}

export const queues = [
  { name: "parse", waiting: 0, active: 1, completed: 5, failed: 1, concurrency: 2 },
  { name: "clean", waiting: 120, active: 4, completed: 3810, failed: 0, concurrency: 8 },
  { name: "ai.cheap", waiting: 5420, active: 16, completed: 3020, failed: 82, concurrency: 16 },
  { name: "ai.strong", waiting: 840, active: 6, completed: 610, failed: 21, concurrency: 6 },
  { name: "translate", waiting: 2310, active: 8, completed: 2960, failed: 4, concurrency: 8 },
  { name: "webhooks", waiting: 0, active: 0, completed: 14, failed: 1, concurrency: 2 },
];

export const workers: Worker[] = [
  { id: "worker-a1", queue: "ai.cheap", status: "busy", concurrency: 8, active: 8, processed: 1540, uptime_min: 182 },
  { id: "worker-a2", queue: "ai.cheap", status: "busy", concurrency: 8, active: 8, processed: 1480, uptime_min: 182 },
  { id: "worker-b1", queue: "ai.strong", status: "busy", concurrency: 6, active: 6, processed: 610, uptime_min: 182 },
  { id: "worker-c1", queue: "clean", status: "busy", concurrency: 8, active: 4, processed: 3810, uptime_min: 182 },
  { id: "worker-t1", queue: "translate", status: "busy", concurrency: 8, active: 8, processed: 2960, uptime_min: 96 },
  { id: "worker-w1", queue: "webhooks", status: "idle", concurrency: 2, active: 0, processed: 14, uptime_min: 182 },
];

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  enabled: boolean;
  secret_hint: string;
}

export interface Delivery {
  id: string;
  webhook_id: string;
  event: string;
  status: number;
  attempt: number;
  at: string;
  duration_ms: number;
}

export const webhookEvents = ["import.completed", "import.failed", "product.approved", "product.needs_review"];

export const webhooks: Webhook[] = [
  { id: "wh_1", url: "https://hooks.atelierterra.shop/catalog", events: ["import.completed", "import.failed"], enabled: true, secret_hint: "whsec_…9f2a" },
  { id: "wh_2", url: "https://api.slack.example/services/T000/B000", events: ["product.needs_review"], enabled: false, secret_hint: "whsec_…11c0" },
];

export const deliveries: Delivery[] = [
  { id: "dl_9", webhook_id: "wh_1", event: "import.completed", status: 200, attempt: 1, at: "2026-10-20T12:14:00Z", duration_ms: 182 },
  { id: "dl_8", webhook_id: "wh_1", event: "import.failed", status: 200, attempt: 1, at: "2026-10-20T17:21:00Z", duration_ms: 210 },
  { id: "dl_7", webhook_id: "wh_1", event: "import.completed", status: 503, attempt: 3, at: "2026-10-20T08:41:00Z", duration_ms: 10000 },
  { id: "dl_6", webhook_id: "wh_1", event: "import.completed", status: 200, attempt: 4, at: "2026-10-20T08:49:00Z", duration_ms: 240 },
];

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
}

export const apiKeys: ApiKey[] = [
  { id: "key_1", name: "ERP sync", prefix: "cf_live_7Hq2", scopes: ["imports:write", "products:read"], created_at: "2026-09-02T10:00:00Z", last_used_at: "2026-10-20T16:58:00Z" },
  { id: "key_2", name: "Staging", prefix: "cf_test_p0Zx", scopes: ["imports:write", "products:read", "products:write"], created_at: "2026-10-01T10:00:00Z", last_used_at: null },
];
