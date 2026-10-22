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
2. **Parse**: header detection (EN/DE/FR), encoding repair, prices to integer cents, units to cm and grams, colour typo fixes, grouping into products and variants, duplicate and conflict detection, photo matching by the image column and by SKU in the file name. Photos left over are matched by Claude when the import finishes (see EDGE-CASES.md 1.20).
3. **Route**: clean groups go to the fast model, messy groups and groups with photos to the strong model.
4. **Build**: Claude returns structured JSON with per-field confidence and a quoted source cell for every claim and attribute. Code checks each quote against the sheet and removes what it cannot find, prices and SKUs never come from the model, and low confidence sends the product to review. System prompts are marked for prompt caching. Anthropic caches only prompts above a per-model minimum length, which the build prompt (about 1,900 tokens) passes on Sonnet; cost tracking reads the cached-token counts from each response, so spend is exact either way.
5. **Translate**: title, description, SEO and attribute values go to German and French in one call, with brand names, placeholders and measurements protected. Manual fixes are never overwritten.
6. **Review and publish**: approve products in bulk or one by one. Approved products show on the public storefront at `/shop/<store>`, 24 per page, with no sign-in. A re-import that changes an approved product without raising a review reason keeps it listed.

Every stage writes its result before the next one runs, jobs are idempotent, and a reconciler re-queues unfinished work, so restarts and re-uploads never repeat paid AI calls. Each import gets an AI budget and pauses when it is reached. [EDGE-CASES.md](EDGE-CASES.md) lists every failure case, how it is handled and whether it is tested; [SCOPE.md](SCOPE.md) has the scope and architecture notes.

## Design decisions

- **Postgres is the source of truth, Redis only delivers work.** Every row, group, AI result and translation is a Postgres row with a status. Redis can lose its queue and the reconciler rebuilds it from Postgres.
- **The model never touches money or identity.** Prices, currencies, SKUs and weights come from the cleaning step; the model's output schema has no field for them, so it cannot change them.
- **Claims must quote the sheet.** The model returns a quote and a cell for every claim and attribute. Code looks for that quote in that cell and drops anything it cannot find or that the cell negates. Accuracy does not depend on the model behaving.
- **Unsure means review, never a guess.** Conflicting rows, a missing price, low confidence, an unknown category or a model concern all become **Needs review** with a reason a merchant can act on.
- **Separate processes for web and worker.** Import load never runs on the storefront's event loop, and queues can be split across workers with `WORKER_QUEUES`.
- **Storefront reads a finished read model.** Only approved, already-translated rows, 24 per page, cached per store and page. It never calls the AI.

## Scale strategy

- **Upload returns immediately.** Files stream to disk with type and size checks while streaming; the import row is written to Postgres as `queued` before anything is enqueued, so a Redis outage at upload time loses nothing.
- **Queues:** `parse` → `ai.cheap` / `ai.strong` → `translate` → `webhooks`, each with its own concurrency. One AI call builds a whole product group (all its rows and variants); one translation call returns German and French for every field of a product.
- **No duplicates.** Jobs are keyed by `(import, group, stage)`, so re-adding one is a no-op. Products are unique on `(store, group)`, variants on `(store, SKU)`, handles on `(store, handle)`. A re-upload hashes each group's cells and photos: unchanged groups are skipped without an AI call, changed ones update the existing product in place.
- **Restarts.** The AI result is stored before the product is written, so a crash between the two reuses the result instead of paying again. BullMQ's stall detection recovers jobs held by a dead worker, and a reconciler on start and every 5 minutes re-queues anything Postgres says is unfinished. `pnpm test:integration` kills the worker with `SIGKILL` mid-import and checks every group finishes exactly once.
- **Every row ends somewhere.** Done, Needs review or Failed with a reason; cancelling marks pending rows Failed. The counts are checked to add up to the sheet.
- **AI failures.** Timeouts, 5xx and invalid JSON retry with exponential backoff and jitter (invalid JSON first gets one repair call with the validation error). A 429 pauses the whole queue until `retry-after` and the UI shows "Rate limited · resumes in X min"; no attempts are burned while paused. A Redis circuit breaker shared by all workers pauses the AI queues when the provider is down. A per-import budget stops a retry storm from running up the bill.

## Cost optimisation

- **Routing.** Clean groups go to Claude Haiku 5.5. A group goes to Claude Sonnet 5.5 only when it needs it: non-English source text, conflicting rows, negated or qualified claims, very long descriptions, many variants, or photos with no description (the only case where photos are sent to the model). The reasons are stored on the group.
- **No repeated work.** Unchanged groups on re-upload make no AI call, stored results are reused on retry, duplicate photos are hashed once, and photos are resized to 768 px before they reach the model.
- **AI photo matching only for leftovers.** Only photos the file-name rules could not match go to Haiku, one at a time; the product list sits in the cached system prompt, so each extra photo pays mostly for the image.
- **One call per product, one per translation.** Not one call per field or per language.
- **Prompt caching.** System prompts are marked for caching; cached-token counts from each response feed the cost tracker, so spend is exact.
- **No Batch API, on purpose.** The Message Batches API would halve the price but can take up to 24 hours; a merchant watching an import finish should not wait that long. The pricing code already supports the batch discount if a "cheap and slow" import mode is added.
- **Tracking.** Every call stores model, prompt version, tokens, cost and latency. `/metrics` shows cost per model, per import and per day, and the money saved by routing (each call priced again as if it had run on the strong model).

## Test data

`evals/` holds the sample sheets and photos used for testing. To score one on `/evaluations`, upload its `supplier-sheet.csv` and `labels.json` there as a labelled set. The sets are: `small`, `medium` and `large` labelled sets, the `final` 1 / 100 / 1,000 / 10,000-row sets, and `edge` files for the failure cases (bad encodings, formula injection, a renamed PDF, a ZIP bomb, too many rows). Each set has a README and `labels.json` with the expected products. Photo folders for the bigger sets are not committed; their `photos.zip` is. `scripts/generate_evals.py` recreates everything deterministically (`pip install pillow openpyxl`). `scripts/fake-anthropic.py` stands in for the Anthropic API and fails on purpose (rate limit, outage, timeout, invalid JSON, refusal, cut-off output, bad key), to check the cases in section 2 of EDGE-CASES.md against a running worker.

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
| `/evaluations` | upload labelled sets (a sheet plus `labels.json`) and score accuracy per field against them |
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

## Technical write-up

### What was the hardest part?

Grouping rows into products. Suppliers split one product across rows by size and colour, repeat rows, and reuse SKU prefixes for unrelated items (`HG-PLT-001` is a lamp, `HG-PLT-002` a throw). Group too eagerly and a lamp becomes a variant of a blanket; too cautiously and one planter becomes five products. The grouping runs on parent SKU, then SKU with size and colour segments stripped, then normalised title and brand, and it treats zero-padded numeric suffixes as item numbers rather than sizes. When two rows in a group disagree on price or weight, it refuses to pick one and sends the product to review. Getting this to 100% on every labelled eval set took more iterations than any other part.

The second hardest part was keeping the row counts honest under concurrency. Every row has to end Done, Needs review or Failed, and with many workers finishing rows at once a progress refresh could overwrite a newer count with an older one. Counting now happens under a lock on the import row.

### How did you make extraction accurate, and stop invented claims?

- **Clean before the AI.** Prices, currencies, units, encodings, colours, grouping and duplicates are handled in code with unit tests, so the model starts from clean, grouped input. Prices, SKUs and weights never come from the model.
- **Cite or drop.** Every claim and every attribute must come with the row, column and a verbatim quote. Code normalises case, accents and punctuation, checks the quote is in that cell, and checks the cell does not negate it ("not frost-proof" can never support "frost-proof"). Anything that fails is removed and the product goes to review.
- **Confidence per field.** Any required field under 70% goes to review with the field named. Categories must be in the taxonomy.
- **Structured output plus zod.** The schema narrows what the model can return, zod checks it, and one repair call carries the validation error.
- **Measured against labels.** `evals/` has labelled sets with expected groups, prices, allowed and forbidden claims and statuses; upload one, or your own in the same format, on `/evaluations` to score each field, and `pnpm test` asserts 100% cleaning accuracy on every set.

What the numbers show: with a fake model that answers every row confidently, the 1,000-row medium set ends exactly as labelled (427 ready, 37 needs review). With real Claude Haiku the same sheet sent 363 of 464 products to review, almost all because of the model's own "confirm with the supplier" concerns rather than failed checks. The model errs on the side of caution, which is the right direction, but it is too cautious. The next step is to send only concerns about missing or conflicting facts to review and show the rest as notes.

### Measured numbers

Measured on an Apple M5 machine with Postgres and Redis in Docker, a production build (`next build && next start`) and one worker process on the same machine.

| What | Number | How |
| --- | --- | --- |
| Rows per minute, real AI | ~120 rows/min | 1,000-row medium sheet with Claude Haiku 5.5: 498 s from start to finish, with 790 rate-limit (429) responses along the way |
| Rows per minute, pipeline only | ~5,300 rows/min | 10,000-row large sheet against a fake model that answers in 50 ms: 10,000 rows (4,592 products) in 113 s, which is the cost of parsing, cleaning, grouping, queueing and writing without the AI, while the storefront was under load for 60 s of it |
| Storefront latency, idle | collection page p50 128 ms, p99 154 ms at ~384 req/s; product page p50 47 ms, p99 62 ms at ~1,025 req/s | autocannon, 50 concurrent connections, 20 s per page, 461 listed products, 0 errors |
| Storefront latency, during a 10,000-row import | collection page p50 128 ms, p99 156 ms at ~385 req/s; product page p50 48 ms, p99 63 ms at ~1,010 req/s | same, 30 s per page, while the worker built the 10,000-row import on the same machine. No measurable slowdown: the storefront reads a cached read model and the worker is a separate process |
| Cost per 1,000 products | ~$1.48 | $0.69 for the 465 products of the 1,000-row sheet, build and DE + FR translation included. 70 of the 71 groups routed to the strong model ran on Haiku in this run, so this is close to an all-Haiku price; Sonnet on every strong group would raise it |

### What breaks first at 1,000,000 products in 8 languages?

1. **The products table in the dashboard.** It loads every product into the browser and pages there. At a million products that is gigabytes. Fix: server-side paging, sorting and filtering with keyset pagination and Postgres trigram or full-text indexes.
2. **The `translation` table and the translate queue.** 1M products × 8 languages × ~6 fields is about 50M rows and 8M translation calls. Fix: partition `translation` by locale, batch several products per call, use the Batch API for back-catalog translation where nobody is waiting, and translate a language only for products sold in that country.
3. **Rate limits and cost before compute.** At ~$1.50 per 1,000 products, 1M products is about $1,500 for English, and every language adds translation cost. Fix: Batch API at half the price for bulk imports, prompt caching across products, and per-store AI budgets (already in place per import).
4. **One local disk for uploads.** Fix: object storage (S3/R2) with presigned uploads, so web and worker scale horizontally.
5. **Storefront cache invalidation per store.** Approving one product clears the store's cached pages. Fix: tag the cache per product and collection page, and put a CDN in front of `/shop`.

Postgres itself copes with a million products and their variants; the indexes are already per store.

### What did you learn?

- Accuracy comes from what the code checks after the model answers, not from the prompt. Quotes that must appear in a cell did more for "no invented claims" than any instruction in the prompt.
- Postgres as the source of truth and Redis as delivery makes restarts boring, which is the goal. The bugs that remained were about concurrent writers, not lost jobs.
- Measure with real keys early. The fake model made the pipeline look fast and accurate; the real model hit rate limits on the first big import and sent most products to review.

### How did you use AI while building this?

Claude Code wrote most of the code from a plan I set: EDGE-CASES.md and SCOPE.md came first, then the frontend on mock data, then the pipeline one stage at a time. I reviewed each change, ran the imports myself, and checked the UI by hand. Claude also wrote the eval generator and the fake Anthropic server used to test failures. The product decisions were mine: review over guessing, Postgres as the source of truth, and no Batch API for interactive imports. Claude Haiku 5.5 and Sonnet 5.5 are also the models inside the product.

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

