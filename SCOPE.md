# CatalogForge scope

Supplier sheet + photos in, clean three-language catalog out, with a review step and a storefront preview.
48-hour build. Reliability and accuracy first, breadth second.

## What ships

### Must have (graded core)

1. **Upload**: drag-and-drop CSV/XLSX + photos or ZIP, type/size validation, per-import and per-row status.
2. **Cleaning**: prices to integer cents + currency, units to cm/grams, encoding repair, row grouping into products and variants, duplicate detection, photo matching, HTML sanitising.
3. **AI builder**: structured JSON per product, per-field confidence, every claim cites its source, low confidence or conflicts become Needs review with a reason.
4. **Translation**: EN → DE, FR. Country → language map. Pre-translated and cached, per-field re-translation, manual fixes win and go Out of date.
5. **Scale**: durable queue, batching, idempotent re-uploads, resume after restart, every row ends Done / Needs review / Failed, backoff + rate-limit pause, storefront isolated from import load.
6. **Cost**: cheap model for clean rows, stronger/vision model for messy rows, batch API, cost per product / model / import, savings shown.
7. **Dashboard**: Upload, Products (table, side-by-side review, edit, approve, bulk approve, export), Storefront preview, Metrics.

### Bonus (all levels in scope)

| Level | Feature | Frontend |
| --- | --- | --- |
| 1 | Real-time progress over SSE | `lib/realtime.ts`, live indicator in the top bar |
| 1 | Re-run AI with different settings | Re-run dialog on products (bulk) and product page |
| 1 | SEO fields per language | SEO tab with limits and search preview |
| 2 | Evaluation framework | `/evaluations`: labelled set, per-field accuracy, runs |
| 2 | A/B testing of prompts or models | `/experiments` |
| 2 | Parallel worker queues | `/queue`: per-stage queues and workers |
| 3 | Auth + multiple stores | `/login`, store switcher, all data scoped by `store_id` |
| 3 | Webhook on import finish | `/settings/webhooks` |
| 3 | Public API | `/settings/api`: keys, endpoints, quick start |
| 3 | Shopify product CSV export | Products, Export menu |

## Architecture

```
Browser (Next.js app)
  │  upload (presigned) ──► object storage
  │  REST + SSE
  ▼
Next.js API routes ──► Postgres (Supabase)
  │ enqueue                ▲
  ▼                        │ upserts keyed by (store, sku)
Redis + BullMQ ──► Worker process(es)
                     parse → clean → group → route → AI (batch) → validate → translate
Storefront routes ──► Postgres read model (published + translated only), cached
```

- Worker runs as a separate process so import load never shares the storefront's event loop.
- Every stage writes its result before the next stage runs; jobs are keyed by `(import_id, group_key, stage)` so a retry or restart never repeats paid work.

## Data model (first cut)

`stores`, `imports`, `import_files`, `source_rows` (raw + normalised + row hash + status), `products`, `variants`, `product_fields` (value, confidence, source, `is_manual`), `claims` (text, source row/column), `translations` (locale, field, text, source hash, `is_manual`, state), `photos` (content hash, match), `ai_calls` (model, tokens, cost, latency, import, product).

## Build order

1. EDGE-CASES.md, first commit.
2. **Frontend on mock data** (this step): every screen and state the backend will produce, typed against the product JSON contract.
3. One row → clean → AI → display, end to end.
4. Queue + worker, persisted row states, retries, restart resume.
5. Translation pipeline + storefront read model.
6. Routing, batch API, cost tracking, metrics.
7. Scale tests at 100 / 1,000 / 10,000 rows, k6 against the storefront during an import.
8. README, write-up, recording, deploy.

## Frontend (current step)

Next.js 15 App Router, TypeScript, Tailwind v4, shadcn/ui (Radix) with Geist and a neutral theme, TanStack Table for data tables, Recharts for metrics, Motion for transitions, Shiki for code samples.

| Route | Screen |
| --- | --- |
| `/imports` | Dropzone with validation, import queue with per-import progress, paused and failed states, retry |
| `/imports/[id]` | Per-row status for one import, counts that add up, unmatched photos |
| `/products` | Paginated, sortable, searchable table with status/confidence filters, bulk approve, CSV/JSON export |
| `/products/[id]` | Source rows and photos beside the AI result, editable fields, claims with sources, variants, translations |
| `/metrics` | Outcome rates, model usage, cost over time, speed, translation coverage |
| `/store` | Collection page, language by country switcher |
| `/store/[handle]` | Product page |
| `/evaluations`, `/experiments` | Accuracy per field, prompt and model A/B tests |
| `/queue` | Queues and workers |
| `/settings/webhooks`, `/settings/api` | Webhooks, API keys and docs |
| `/login` | Sign in |

All data comes from `src/lib/data`, a mock layer behind the same function signatures the API will expose, so swapping in the backend touches one folder.
