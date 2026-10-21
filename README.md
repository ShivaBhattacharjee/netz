# CatalogForge

Turn a messy supplier sheet and a folder of photos into a clean product catalog in English, German and French, with a review step before anything goes live.

Upload a CSV, XLSX or ZIP. CatalogForge cleans prices, units and encodings, groups rows into products and variants, matches photos, has Claude write each listing with a cited source for every claim, translates it, and puts anything it is unsure about in a review queue. Approved products appear on a storefront preview that picks the language from the visitor's country.

## Tech stack

| Layer | What |
| --- | --- |
| App | [Next.js 15](https://nextjs.org) (App Router, Turbopack), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui on Radix, TanStack Table, Recharts, Motion, Sonner, Lucide icons |
| Database | Postgres 17 with [Drizzle ORM](https://orm.drizzle.team) and drizzle-kit migrations |
| Queue | Redis 7.4 and [BullMQ](https://docs.bullmq.io), run by a separate worker process |
| AI | [Anthropic SDK](https://docs.claude.com) with Claude Haiku 5.5 (imports, translation) and Claude Sonnet 5.5 (re-runs, experiments), structured JSON output |
| Auth | [Better Auth](https://better-auth.com) with Google sign-in, multi-store memberships, API keys |
| Files | papaparse and SheetJS for sheets, yauzl for ZIPs, sharp for photos, sanitize-html for descriptions |
| Validation | zod on every API route, server action, env and model output |

## How it works

```
Browser ──► Next.js API routes ──► Postgres (source of truth)
               │ enqueue                 ▲
               ▼                         │
          Redis + BullMQ ──► Worker (pnpm worker)
            parse ──► ai.cheap / ai.strong ──► translate ──► webhooks
```

1. **Upload**: files stream to `STORAGE_DIR`, checked by magic bytes and size while streaming.
2. **Parse**: header detection (EN/DE/FR), encoding repair, prices to integer cents, units to cm and grams, colour typo fixes, grouping into products and variants, duplicate and conflict detection, photo matching.
3. **Route**: clean groups go to the fast model, messy groups and groups with photos to the strong model.
4. **Build**: Claude returns structured JSON with per-field confidence and a source for every claim. Unsupported claims are removed, prices and SKUs never come from the model, and low confidence sends the product to review.
5. **Translate**: each field goes to German and French separately, with brand names, placeholders and measurements protected. Manual fixes are never overwritten.
6. **Review and publish**: approve products in bulk or one by one. Approved products show on `/store`.

Every stage writes its result before the next one runs, jobs are idempotent, and a reconciler re-queues unfinished work, so restarts and re-uploads never repeat paid AI calls. Each import gets an AI budget and pauses when it is reached. [EDGE-CASES.md](EDGE-CASES.md) lists every failure case and how it is handled; [SCOPE.md](SCOPE.md) has the scope and architecture notes.

## Getting started

You need Node.js 20 or newer, pnpm and Docker.

```bash
pnpm install
cp .env.example .env        # then fill in the values below
pnpm db:up                  # Postgres on 5433, Redis on 6379
pnpm db:migrate
pnpm dev                    # app on http://localhost:3000
pnpm worker:dev             # in a second terminal: runs the import queues
```

Both the app and the worker refuse to start if the environment is invalid or the database is missing migrations, and tell you which.

Without `ANTHROPIC_API_KEY` the whole pipeline runs in mock mode: imports, review and storefront all work, and AI output is a deterministic stand-in.

### Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `REDIS_URL` | yes | Redis connection string |
| `BETTER_AUTH_SECRET` | yes | at least 32 characters, e.g. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | yes | public URL of the app |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for sign-in | redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google` |
| `ANTHROPIC_API_KEY` | for real AI | unset means `AI_MODE=mock` |
| `AI_MODEL_FAST`, `AI_MODEL_STRONG`, `AI_MODEL_TRANSLATE` | no | default `claude-haiku-5-5`; checked against the models API when the worker starts |
| `AI_BUDGET_MULTIPLIER`, `AI_BUDGET_MIN_USD` | no | import budget is the estimate times the multiplier (default 3), at least the minimum (default $1) |
| `AI_RPM` | no | cap on AI requests per minute per worker |
| `STORAGE_DIR` | no | upload storage, default `.data/uploads` |
| `DB_POOL_MAX` | no | Postgres pool size per process, default 10 |
| `WORKER_QUEUES`, `*_CONCURRENCY` | no | split queues across worker processes and tune concurrency |

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm worker:dev` / `pnpm worker` | worker with or without file watching |
| `pnpm build` / `pnpm start` | production build and server |
| `pnpm db:up` | start Postgres and Redis in Docker |
| `pnpm db:generate` / `pnpm db:migrate` | create and apply Drizzle migrations |
| `pnpm db:studio` | browse the database |
| `pnpm lint` | ESLint |

## Dashboard

| Route | Screen |
| --- | --- |
| `/imports` | upload, live progress, retry, budget and pause states |
| `/products` | catalog table, filters, bulk approve, re-run, delete, CSV / JSON / Shopify export |
| `/products/[id]` | source rows beside the AI result, edits, claims, variants, translations, SEO |
| `/storefront` | listed products, add or remove from the storefront, preview at `/store` |
| `/metrics` | throughput, review rate, AI spend per model and import |
| `/evaluations` | accuracy per field against labelled eval sets |
| `/experiments` | A/B runs of models and prompts on the same rows |
| `/queue` | queues and workers |
| `/settings/webhooks`, `/settings/api` | webhooks and API keys |

## Public API

Create a key under **API keys**, then:

```bash
curl -X POST "http://localhost:3000/api/uploads?kind=sheet" \
  -H "Authorization: Bearer $CATALOGFORGE_KEY" \
  -H "x-file-name: supplier-sheet.csv" \
  --data-binary @supplier-sheet.csv

curl -X POST http://localhost:3000/api/imports \
  -H "Authorization: Bearer $CATALOGFORGE_KEY" \
  -H "content-type: application/json" \
  -d '{"sheet_upload_id": "up_…", "photo_upload_ids": []}'

curl "http://localhost:3000/api/imports/imp_…?limit=1" -H "Authorization: Bearer $CATALOGFORGE_KEY"
```

Requests are limited per store and per key and return `429` with `Retry-After` when exceeded.

## Webhooks

Events: `import.completed`, `import.failed`, `product.approved`. Each delivery is a JSON `POST` with `x-catalogforge-event` and `x-catalogforge-signature: t=<unix>,v1=<hex>`, where `v1` is `HMAC-SHA256(secret, "<t>.<raw body>")`. Failed deliveries retry up to 8 times with backoff. For local testing, point an endpoint at a request bin such as webhook.site and press **Send test**.

## Project layout

```
src/
  app/            routes: (dashboard) pages, api/*, store/* storefront, login, onboarding
  components/     screens and shadcn/ui components
  db/             Drizzle schema, pool, migration check
  lib/            auth, client data store, formatting, locales, types
  server/
    ai/           Anthropic client, build and translate calls, pricing, mock output
    pipeline/     sheet parsing, cleaning, grouping, photos, routing
    jobs/         queue handlers, budget, AI pause gate, reconciler
    evals/        labelled eval sets and scoring
  worker/         worker entry point
prompts/          versioned prompts (build-product, translate, repair-json)
drizzle/          SQL migrations
```
