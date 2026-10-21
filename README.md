# CatalogForge

[![CI](https://github.com/ShivaBhattacharjee/netz/actions/workflows/ci.yml/badge.svg)](https://github.com/ShivaBhattacharjee/netz/actions/workflows/ci.yml)

Turn a messy supplier sheet and a folder of photos into a clean product catalog in English, German and French, with a review step before anything goes live.

Upload a CSV, XLSX or ZIP. CatalogForge cleans prices, units and encodings, groups rows into products and variants, matches photos, has Claude write each listing with a cited source for every claim, translates it, and puts anything it is unsure about in a review queue. Approved products appear on a public storefront at `/shop/<store>` that picks the language from the visitor's country.

## Tech stack

| Layer | What |
| --- | --- |
| App | [Next.js 15](https://nextjs.org) (App Router, Turbopack), React 19, TypeScript |
| UI | Tailwind CSS v4, shadcn/ui on Radix, TanStack Table, Recharts, Motion, Sonner, Lucide icons |
| Database | Postgres 17 with [Drizzle ORM](https://orm.drizzle.team) and drizzle-kit migrations |
| Queue | Redis 7.4 and [BullMQ](https://docs.bullmq.io), run by a separate worker process |
| AI | [Anthropic SDK](https://docs.claude.com) with Claude Haiku 5.5 (clean rows, translation) and Claude Sonnet 5.5 (messy rows, photos, re-runs), structured JSON output |
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
4. **Build**: Claude returns structured JSON with per-field confidence and a quoted source cell for every claim and attribute. Code checks each quote against the sheet and removes what it cannot find, prices and SKUs never come from the model, and low confidence sends the product to review. System prompts are marked for prompt caching. Anthropic caches only prompts above a per-model minimum length, which the build prompt (about 1,900 tokens) passes on Sonnet; cost tracking reads the cached-token counts from each response, so spend is exact either way.
5. **Translate**: title, description, SEO and attribute values go to German and French in one call, with brand names, placeholders and measurements protected. Manual fixes are never overwritten.
6. **Review and publish**: approve products in bulk or one by one. Approved products show on the public storefront at `/shop/<store>`, 24 per page, with no sign-in. A re-import that changes an approved product without raising a review reason keeps it listed.

Every stage writes its result before the next one runs, jobs are idempotent, and a reconciler re-queues unfinished work, so restarts and re-uploads never repeat paid AI calls. Each import gets an AI budget and pauses when it is reached. [EDGE-CASES.md](EDGE-CASES.md) lists every failure case, how it is handled and whether `pnpm test` covers it; [SCOPE.md](SCOPE.md) has the scope and architecture notes.

## Test data

`evals/` holds the sample sheets and photos used for testing and for the `/evaluations` page: `small`, `medium` and `large` labelled sets, the `final` 1 / 100 / 1,000 / 10,000-row sets, and `edge` files for the failure cases (bad encodings, formula injection, a renamed PDF, a ZIP bomb, too many rows). Each set has a README and `labels.json` with the expected products. Photo folders for the bigger sets are not committed; their `photos.zip` is. `scripts/generate_evals.py` recreates everything deterministically (`pip install pillow openpyxl`). `scripts/fake-anthropic.py` stands in for the Anthropic API and fails on purpose (rate limit, outage, timeout, invalid JSON, refusal, cut-off output, bad key), to check the cases in section 2 of EDGE-CASES.md against a running worker.

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

All server configuration goes through one zod schema in `src/server/env.ts`. Both the app and the worker refuse to start if the environment is invalid or the database is missing migrations, and list every problem.

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
| `AI_MODEL_FAST`, `AI_MODEL_STRONG`, `AI_MODEL_TRANSLATE` | no | defaults `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`; checked against the models API when the worker starts |
| `AI_BUDGET_MULTIPLIER`, `AI_BUDGET_MIN_USD` | no | import budget is the estimate times the multiplier (default 3), at least the minimum (default $1) |
| `AI_RPM` | no | cap on AI requests per minute per worker |
| `STORAGE_DIR` | no | upload and photo storage on disk, default `.data/uploads` |
| `WEBHOOKS_ALLOW_PRIVATE` | no | `true` lets webhooks reach localhost and private IPs; development only, rejected in production |
| `DB_POOL_MAX` | no | Postgres pool size per process, default 10 |
| `WORKER_QUEUES`, `*_CONCURRENCY` | no | split queues across worker processes and tune concurrency |

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm worker:dev` / `pnpm worker` | worker with or without file watching |
| `pnpm build` / `pnpm start` | production build and server |
| `pnpm start:render` | applies migrations, then runs `next start` and the worker together; either one exiting stops both |
| `pnpm db:up` | start Postgres and Redis in Docker |
| `pnpm db:generate` / `pnpm db:migrate` | create and apply Drizzle migrations |
| `pnpm db:studio` | browse the database |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest suite in `tests/`: price parsing, cleaning, grouping, photo matching, file safety, claim and attribute checks, translation masking, AI cost, exports, and 100% cleaning accuracy on every eval set; no database or AI needed |
| `pnpm test:integration` | imports the 464-product medium sheet through a real worker, Postgres and Redis against a fake Anthropic API, kills the worker mid-import with `SIGKILL`, restarts it, and checks every group finished once with no duplicate products and at most one repeated AI call per job that was in flight; then re-uploads the sheet and checks it makes no AI calls. Creates and drops a `netz_it` database and uses Redis database 9 (`IT_DATABASE_URL`, `IT_REDIS_URL` to override) |

## Deploy on Render

One web service runs everything:

- **Build command:** `pnpm install --frozen-lockfile && pnpm build`
- **Start command:** `pnpm start:render`
- **Environment:** the variables above, with `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` set to the Render URL, a hosted Postgres (Neon, Render Postgres) and a hosted Redis (Upstash, Render Key Value). Add `<url>/api/auth/callback/google` to the Google OAuth redirect URIs.
- **Disk:** uploads and photos are stored on the local filesystem, not S3. Attach a Render persistent disk and set `STORAGE_DIR` to a folder on it (for example `/var/data/uploads`); without one, uploaded files are lost on every deploy or restart. A persistent disk pins the service to one instance.

## Dashboard

| Route | Screen |
| --- | --- |
| `/imports` | upload, live progress, retry, budget and pause states |
| `/products` | catalog table, filters, bulk approve, re-run, delete, CSV / JSON / Shopify export |
| `/products/[id]` | source rows beside the AI result, edits, claims, variants, translations, SEO |
| `/storefront` | listed products, add or remove from the storefront, preview and public link to `/shop/<store>` |
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
tests/            Vitest suite (pnpm test)
evals/            sample sheets, photos and labels for testing
scripts/          eval generator, fake Anthropic API for failure tests
```
## Screenshots

<img width="1512" height="882" alt="image" src="https://github.com/user-attachments/assets/e54b0c95-5977-4959-9932-f30a25964eb0" />
<img width="1491" height="887" alt="image" src="https://github.com/user-attachments/assets/29ec2280-8b93-4b57-a4df-b1640c4d9168" />
<img width="1508" height="889" alt="image" src="https://github.com/user-attachments/assets/23e3180c-b187-4a57-8d3e-3250a7692aa9" />
<img width="1511" height="887" alt="image" src="https://github.com/user-attachments/assets/f77e80bb-1bd6-4cba-8008-5115b1374501" />
<img width="1506" height="886" alt="image" src="https://github.com/user-attachments/assets/0883a061-571b-411f-a7a4-a5aeadf767d6" />
<img width="1508" height="895" alt="image" src="https://github.com/user-attachments/assets/0a34b3f0-b876-403f-bfdb-8e1a4b04ea8a" />
<img width="1507" height="855" alt="image" src="https://github.com/user-attachments/assets/02966ad7-b656-4377-8ed6-96d2021e0f81" />
<img width="1512" height="898" alt="image" src="https://github.com/user-attachments/assets/12af9393-bef8-4a15-99ac-40a635b46ae3" />
<img width="1511" height="900" alt="image" src="https://github.com/user-attachments/assets/691d5140-2619-4106-8114-f881ef9d6276" />

