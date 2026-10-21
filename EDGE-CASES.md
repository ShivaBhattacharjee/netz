# EDGE-CASES.md

Everything that can go wrong in CatalogForge, what the app does about it, and where each case stands.
Written before the implementation and kept up to date while building.

Status values:

- **Handled + tested**: behaviour implemented and covered by an automated test in `tests/` (run with `pnpm test`). Each test name ends with the case number it covers, e.g. "(1.26)".
- **Handled, not tested**: behaviour implemented, but checking it needs the running app (queue, database, AI provider or browser) and there is no automated test for it yet.
- **Not handled**: out of scope, with the reason.

Stack these cases are written against: Next.js (app + API routes), Postgres via Drizzle, Better Auth (Google), Redis + BullMQ for the import queue, Anthropic Claude Haiku 5.5 for clean rows and translation (`AI_MODEL_FAST`, `AI_MODEL_TRANSLATE`) and Claude Sonnet 5.5 for messy rows and photos (`AI_MODEL_STRONG`).

Auth, stores, the import pipeline (upload → parse → clean → group → photos → AI build → translate, on BullMQ), review, storefront, webhooks and the public API are built.

---

## 1. Messy input

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 1.1 | File is not CSV/XLSX/ZIP/image (e.g. `.numbers`, `.pdf`) | Rejected in the browser before upload, with the file name and the accepted types. Re-checked server side by magic bytes, not extension. | Handled, not tested |
| 1.2 | Sheet over the size limit (25 MB) or a photo over 10 MB | Rejected with the exact limit and the file's actual size. | Handled, not tested |
| 1.3 | More than 10,000 rows or 2,000 photos | Import is refused at parse time with the counted number, before any AI spend. Partial imports are not started silently. | Handled, not tested |
| 1.4 | Corrupt XLSX / truncated CSV / zip bomb | Import ends **Failed** with "Could not read the file" and the parser error. ZIP extraction is capped on total uncompressed size and entry count. | Handled, not tested |
| 1.5 | Broken encoding (`TerracottaÂ Topf`, `GrÃ¼n`) | Detect encoding (BOM, chardet-style heuristics), try Windows-1252 → UTF-8 repair, record the repair on the row. | Handled + tested |
| 1.6 | Header row is not the first row, or headers are in German (`Preis`, `Farbe`) | Header detection scans the first 20 rows; a synonym map covers EN/DE/FR column names. Unknown columns are kept as raw attributes, never dropped. | Handled + tested |
| 1.7 | Prices like `1.299,00 €`, `12.5`, `£8`, `EUR 9`, `9,-`, `CA$ 12`, `A$5` | Parsed to integer cents + ISO currency (`CA$` → CAD, `A$` → AUD, also NZD, HKD, SGD; a bare `$` is USD). Decimal separator inferred per value, then checked against the sheet's dominant locale. Never stored as a float. | Handled + tested |
| 1.8 | Price missing or `0` | Variant gets no price; product goes to **Needs review** with "No price for {variant}". Never invented. | Handled + tested |
| 1.9 | Price with no currency symbol | Uses the sheet-level default currency chosen at upload; the row records that a default was applied. | Handled + tested |
| 1.10 | Mixed units (`20cm`, `8 in`, `1.8kg`, `4 lbs`) | Normalised to cm and grams as integers. Original value kept on the source row for the review screen. | Handled + tested |
| 1.11 | Colour typos (`terracota`, `antrazit`) | Fuzzy match against an EN/DE/FR colour vocabulary (edit distance with transpositions, ≤ 1 for short words, ≤ 2 otherwise). The fix is recorded on the row. Unknown colours are kept as written, never dropped. | Handled + tested |
| 1.12 | Same product split across rows (one row per size/colour) | Grouped by parent SKU column if there is one, else by the SKU with trailing size/colour segments removed (`TC-PL-20` → `TC-PL`), else by normalised title + brand. Each row becomes a variant. `source_rows` lists every row used. | Handled + tested |
| 1.13 | Exact duplicate rows | Collapsed into one; the duplicate row ends **Done** with "Duplicate of row N" so counts still add up. | Handled + tested |
| 1.14 | Duplicate SKU with conflicting data (two prices for `TC-PL-20`) | Not merged silently. The variant gets no price and the product goes to **Needs review** with "Two prices for SKU X (rows a and b)". Same for two weights. | Handled + tested |
| 1.15 | Rows out of order (variant before its parent) | Grouping runs after the whole sheet is parsed, so order does not matter. | Handled + tested |
| 1.16 | Required fields missing (no title, no SKU) | No SKU: a deterministic SKU is derived from the row hash and flagged. No title and no description: row **Failed**, "Not enough information to build a product". | Handled, not tested |
| 1.17 | Huge descriptions (100 KB of HTML) | Sanitised, then cut to 4,000 characters of text before the AI call. The row records "Description truncated from N characters" and the group is routed to the stronger model. | Handled + tested |
| 1.18 | HTML with `<script>`, `onerror=`, `javascript:` links, inline styles | Sanitised with an allowlist (p, ul, ol, li, strong, em, br, a[href=http(s)]). Done before AI and again on AI output before storage. | Handled + tested |
| 1.19 | Formula injection in exports (`=HYPERLINK(...)`) | CSV and Shopify exports prefix cells that start with `= + - @`, tab or carriage return with a quote. | Handled + tested |
| 1.20 | Photo with no matching row | Listed under "Unmatched photos" on the import, not attached anywhere. There is no manual attach yet: rename the file to the SKU or add it to the image column and re-upload. | Handled, not tested |
| 1.21 | Row references a photo that was not uploaded | Product built without it; warning on the product, not a failure. | Handled, not tested |
| 1.22 | Photo filenames that match several products (`IMG_0001.jpg`) | Match by SKU in filename first, then by explicit image column. Ambiguous matches are not guessed; the photo stays unmatched. | Handled + tested |
| 1.23 | Same photo uploaded twice under different names | Deduplicated by content hash. | Handled + tested |
| 1.24 | Supplier text in German or mixed languages | Detected per field; passed to the AI as source language, English output generated, original kept as the claim source. | Handled, not tested |
| 1.25 | Qualified claims ("frost-resistant (not frost-proof, bring indoors below 0 °C)") | The qualifier is part of the claim; the AI must not drop it. A validator checks that negations in the source are not inverted in the output. | Handled, not tested |
| 1.26 | SKUs share a prefix but are different products (`HG-PLT-001` lamp, `HG-PLT-002` throw) | A zero-padded numeric suffix (`-001`) is read as an item number, not a size: those rows are grouped together only when their titles agree, otherwise each goes to its own product by title. Other SKU-prefix groups whose titles (in the same language) share no word go to **Needs review** with "Rows a and b share SKU prefix X but have unrelated titles". | Handled + tested |
| 1.27 | Price in a currency the app does not support (`¥1200`, `₹ 499`, `1200 JPY`) | The variant gets no price and the product goes to **Needs review** with "Unsupported currency in price". The default currency is never applied to it. | Handled + tested |

## 2. AI problems

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 2.1 | Model returns invalid JSON | Claude is called with structured outputs (`output_config.format` with a JSON schema), but the output is still validated with zod: structured output narrows the shape, it does not guarantee it. One repair retry with the validation error in the prompt, then exponential backoff retries, then row **Failed** with "Model output did not match the schema". | Handled, not tested |
| 2.2 | Model invents a claim (`organic`, `dishwasher-safe`) | Every claim must cite a source row and column plus a quote. A post-check verifies the quote appears in that cell (after normalising case, accents and punctuation) and that the cell does not negate the claim. Unsupported claims are removed and the product goes to **Needs review**. Risky terms (`organic`, `waterproof`, `handmade`…) anywhere in the output with no source also send it to review. | Handled + tested |
| 2.3 | Model changes a price, SKU or weight | Prices, SKUs and weights never come from the model; they come from the cleaning step. The model output schema has no fields for them. | Handled + tested |
| 2.4 | Low confidence on a field | Fields under 70% are highlighted; any required field under 70% sends the product to **Needs review** with the field name as the reason. | Handled + tested |
| 2.5 | Category not in the taxonomy | Validated against the allowed taxonomy; unknown category → **Needs review**, "Category not recognised". | Handled + tested |
| 2.6 | Timeout | Treated as retryable. Exponential backoff with jitter, max 5 attempts, then **Failed** with the last error. | Handled, not tested |
| 2.7 | Rate limit (429 `rate_limit_error`) | The whole import queue pauses (BullMQ queue-level rate limit) until the `retry-after` header, or a backoff when none is given. Exhausted credits or a workspace spend limit are reported as billing errors and pause longer. UI shows "Rate limited · resumes in X min". No attempts are burned while paused. | Handled, not tested |
| 2.8 | Provider down (5xx / 529 `overloaded_error` for minutes) | Circuit breaker in Redis, shared by every worker: 10 provider failures inside 60 s pause the AI queues for 30 s instead of burning attempts; the next success resets it. | Handled, not tested |
| 2.9 | Message Batches job takes hours or partially fails | Imports do not use the Message Batches API. Every group goes through the normal queue with per-call retries, so there is no long-running batch to lose or reconcile. Batches would halve the price but can take up to 24 hours, which does not fit a merchant watching an import finish. Pricing already supports a batch discount if it is added later. | Not handled (real-time calls only) |
| 2.10 | Model output contains HTML/script | Sanitised with the same allowlist as input. | Handled + tested |
| 2.11 | Prompt injection in supplier text ("ignore previous instructions") | Supplier text is passed as data in a delimited field, never as instructions. Output is schema-validated and claims are source-checked, which limits the damage. | Handled, not tested |
| 2.12 | Cost runaway (retry storm, huge rows) | Per-import AI budget. At parse time the spend is estimated from the prompt and row sizes (about 4 characters per token, photos at about 800 tokens, build plus two translations per group); the budget is 3× the estimate with a $1 floor (`AI_BUDGET_MULTIPLIER`, `AI_BUDGET_MIN_USD`). Actual spend is tracked from `usage` on every response. Before each paid build call the worker checks spend against the budget; once it is reached the import pauses with "AI budget reached" and stays paused (rate-limit resumes do not touch it) until the merchant raises the budget from the import menu, which re-queues the pending groups. | Handled, not tested |
| 2.13 | Response blocked (`stop_reason: "refusal"`) | Not retried with the same input (it would refuse again). Row goes to **Needs review**, "Model declined to generate". Never shown as an empty product. | Handled, not tested |
| 2.14 | Output cut off (`stop_reason: "max_tokens"`) | Treated as a retryable failure, not parsed as partial JSON. Each retry doubles the output budget (4k → 8k → 16k tokens). A prompt over the context window (`model_context_window_exceeded`) is a non-retryable bad request. | Handled, not tested |
| 2.15 | Photo the model cannot take (HEIC, 40 MP, animated, CMYK) | Photos are re-encoded server side with sharp to JPEG, max 768 px, before they go to the model (at most 3 per product). Undecodable images are marked invalid at import time. | Handled, not tested |
| 2.16 | API key missing, invalid or revoked (401 / 403) | Not retryable. Worker start checks the key against the models endpoint; a bad key or exhausted credits pause the AI queues for 5 minutes at a time and imports show as paused instead of failing every row. They resume once the key works (worker restart picks up a new key). | Handled, not tested |
| 2.17 | Model retired or renamed | Model IDs come from env, not code. Worker start resolves every configured model (`AI_MODEL_FAST`, `AI_MODEL_STRONG`, `AI_MODEL_TRANSLATE`) on the models endpoint and refuses to start with the missing IDs if one is gone; a missing re-run model only logs a warning. | Handled, not tested |
| 2.18 | Same input, different output (non-determinism) | The Claude 5.5 models take no temperature; extraction runs with structured output and low effort instead. The stored AI result per job key is reused on retry (see 3.5), so a re-run happens only when the merchant asks for one. | Handled, not tested |

## 3. Scale

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 3.1 | 10,000-row import | Upload stores the file and returns immediately. Parsing and AI run in a durable background queue in batches. | Handled, not tested |
| 3.2 | Same file uploaded twice | File and row hashes identify content. Per product group an input hash (cells + photo hashes) is compared with the stored product: unchanged groups are skipped with "Unchanged since last import" and make no AI call; changed groups update the product keyed by (store, group). A group whose SKUs already belong to one existing product takes that product's group key, so a changed title or a new parent SKU column updates the product instead of creating a second one. | Handled, not tested |
| 3.3 | Two imports at once for the same store | Both run; products are keyed by (store, group) and variants by (store, SKU), both with unique constraints, so a race cannot create two products. Last writer wins per field, merchant edits are never overwritten. | Handled, not tested |
| 3.4 | Server restarts mid-import | Every row and group state is in Postgres. Jobs are keyed by `(import, group, stage)`, so re-adding them is a no-op. On start (and every 5 minutes) a reconciler re-enqueues pending groups; jobs held by a dead worker are recovered by BullMQ stall detection within ~30 s. When BullMQ gives up on a job (retries used up, or stalled twice), the worker marks that group's rows **Failed** with "Gave up after N attempt(s): …", so no row stays pending and Retry can pick it up. | Handled, not tested |
| 3.5 | Worker crashes after the AI call but before saving | The AI result is stored with the job key before the product write; the retry reuses it instead of paying again. | Handled, not tested |
| 3.6 | Row counts do not add up | Invariant: done + needs review + failed + pending = total rows. Checked at import completion; a mismatch is logged and shown. | Handled, not tested |
| 3.7 | Storefront under load during a big import | Storefront reads only published, pre-translated data, 24 products per page, without the AI cost aggregates the dashboard uses, served from the Next.js data cache per store and page (60 s TTL, invalidated when a product is approved, unlisted, deleted, edited or sent back). Workers run in separate processes with a capped DB pool. On the single Render service the worker shares the machine's CPU with the web server; split it into its own service for real isolation. The storefront is public at `/shop/<store>` with no sign-in; `/store` and the dashboard Preview button open it with a merchant banner (`?preview=1`). | Handled, not tested |
| 3.8 | Browser tab closed during upload | Resumable/chunked upload is not built; the merchant re-uploads. Because of 3.2 that is safe. | Not handled (re-upload is idempotent) |

## 4. Later changes

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 4.1 | Merchant edits a product field | `PATCH /api/products/{id}` saves the edit and marks the field as manual. Later imports and AI re-runs never overwrite a manual field. | Handled, not tested |
| 4.2 | English text changes after translation | Only the changed field is re-translated (per-field source hash). | Handled, not tested |
| 4.3 | Merchant fixed a translation, then English changes | The manual translation is kept and marked **Out of date**. It is not replaced by the AI. | Handled, not tested |
| 4.4 | Merchant deletes a product, then re-uploads the sheet | Delete (one product or in bulk from the table) sets a tombstone on the product group; the re-import does not resurrect it and reports "Skipped: deleted by merchant". | Handled, not tested |
| 4.5 | Merchant sends a product back for re-generation | Send back or Re-run puts the product back on the queue with the merchant's note added to the prompt; manual fields are still locked and approved products are skipped. | Handled, not tested |
| 4.6 | Variant removed from the new sheet | Not deleted automatically. The variant is marked with the import that dropped it, shown as "Not in latest import", and the product goes to **Needs review** with "Missing from latest import: SKU…". The mark clears if a later sheet brings the SKU back. | Handled, not tested |
| 4.7 | Supplier fixes a product title in the next sheet (`Terracota Pot` → `Terracotta Pot`) and the rows have no parent SKU | The group is matched to the existing product through its SKUs, so the product is updated in place (same handle, manual fields kept) instead of a second product being created. Like any changed product it goes back to Ready or Needs review and has to be approved again. | Handled, not tested |
| 4.8 | Merchant edits an attribute (material, colour, care) | The attribute is marked manual and its German and French translations are re-queued. | Handled, not tested |

## 5. Storefront

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 5.1 | Product still under review | Only approved ("listed") products are shown. Direct URL returns 404, and its photos return 404 from the public photo route (`/api/shop/<store>/photos/<id>`), which serves only photos of listed products. | Handled, not tested |
| 5.2 | Translation missing for a field | Falls back to English for that field only (title, description and each attribute separately). | Handled + tested |
| 5.3 | Visitor from a country with no translation (e.g. Spain) | English. | Handled + tested |
| 5.4 | Austria / Germany | German. France → French. | Handled + tested |
| 5.5 | Variant with no price | Shown as unavailable; cannot be selected. | Handled, not tested |
| 5.6 | Price display per locale | Formatted with `Intl.NumberFormat` from integer cents; the stored value is never rounded. | Handled + tested |
| 5.7 | Placeholders, units, brand names in translations | Brand and store names, `{{placeholders}}` and measurements (`20 cm`, `1.8 kg`, `40 °C`, `E27`) are replaced with `⟦n⟧` tokens before translation and restored after, with a decimal comma for German and French. The validator fails a field if a token, HTML tag or number is lost or changed. | Handled + tested |
| 5.8 | Attribute values on the product page (material, colour, care) | Translated with the title and description in the same call per language; the brand is never translated. The storefront shows the translation when it is current for the English value, otherwise English. | Handled, not tested |
| 5.9 | 5,000 approved products | The collection page shows 24 per page with previous / next links, so page size and query cost do not grow with the catalog. | Handled, not tested |
| 5.10 | Fixed text that no source supports (shipping times, guarantees) | The storefront shows only catalog data and interface labels; it makes no promises the supplier sheet does not contain. | Handled, not tested |

## 6. Auth and stores

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 6.1 | Signed-out visitor opens a dashboard URL | Middleware sees no session cookie and redirects to `/login`. The cookie check is only a fast path; the dashboard layout re-validates the session against the database on every request. | Handled, not tested |
| 6.2 | Session cookie present but expired, revoked or forged | `auth.api.getSession` returns nothing (signature + DB lookup), layout redirects to `/login`. | Handled, not tested |
| 6.3 | Signed-in user opens `/login` | Redirected to `/imports`. | Handled, not tested |
| 6.4 | New user after first Google sign-in | Sent to `/onboarding` (`newUserCallbackURL`) to create a store. | Handled, not tested |
| 6.5 | Existing user with no store (skipped onboarding, or was removed from their last store) | Every dashboard page redirects to `/onboarding`. There is no dashboard without a store. | Handled, not tested |
| 6.6 | Invalid store details (1-char name, `not a domain`, unknown currency) | Validated server side with zod in the server action (client checks are not trusted). Per-field errors, typed values kept. Name 2–60 chars, trimmed. Domain optional, normalised (`https://Shop.com/x` → `shop.com`). Currency from an allowlist. | Handled, not tested |
| 6.7 | Two stores with the same name | Slug has a unique constraint; on conflict a random suffix is added and the insert retried (max 5). | Handled, not tested |
| 6.8 | Store row created but membership insert fails | Both inserts run in one transaction, so there is never a store without an owner. | Handled, not tested |
| 6.9 | Double-clicking "Create store" | Button disabled while the action is pending. The form carries a request ID claimed in Redis (`SET NX`, 10 minutes): a repeat submit of the same form is told it is in progress, or lands on the store the first submit created. Two separate tabs are two forms and create two stores on purpose. | Handled, not tested |
| 6.10 | User creates stores in a loop | Max 10 owned stores per user, checked server side. The count and the insert run in one transaction behind a per-user advisory lock, so a burst cannot exceed it. | Handled, not tested |
| 6.11 | `active_store` cookie points to a store the user is not a member of (forged, or they were removed) | Ignored: the active store is always picked from the user's memberships, falling back to the first one. `switchStore` checks membership before setting the cookie. The cookie is httpOnly. | Handled, not tested |
| 6.12 | Google sign-in cancelled or fails | Better Auth redirects to `/login?error=…`; the page shows a readable message. | Handled, not tested |
| 6.13 | Same email arrives from a second sign-in method | Account linking is explicit: only Google is trusted to link to an existing user with the same email. Any other method lands on `/login` with `account_not_linked`. Adding a provider means adding it to `trustedProviders` on purpose. | Handled, not tested |
| 6.14 | Sole owner deletes their account | Memberships cascade, so the store would be left with no owner. Better Auth's `deleteUser` runs a `beforeDelete` check and refuses while the user is the only owner of any store, naming how many. There is no delete-account screen yet; the check guards the API. | Handled, not tested |
| 6.15 | Signed out in another tab | Next server request has no session and redirects to `/login`. Open client state is discarded. | Handled, not tested |
| 6.16 | Google client ID/secret missing | Better Auth logs a warning at boot; the sign-in button shows the error instead of hanging. | Handled, not tested |
| 6.17 | Inviting teammates to a store | Not built. Roles exist (`owner`, `member`) so invites can be added without a migration. | Not handled (single-owner stores for now) |

## 7. Server-side checks

Nothing the browser sends is trusted. These apply to every API route, server action and worker job.

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 7.1 | Request hits an API route or server action directly, skipping the UI | Every handler resolves the session or API key itself (`withStore` on every API route). Middleware is never the only check. | Handled, not tested |
| 7.2 | Request sends a `store_id` for someone else's store | `store_id` is never read from the body or query. It comes from the session + membership lookup or the API key. Every query on store data filters by it. | Handled, not tested |
| 7.3 | Request for another store's import/product by ID (`/imports/imp_123`) | Looked up by `(id, store_id)`; a miss returns 404, not 403, so IDs from other stores cannot be probed. | Handled, not tested |
| 7.4 | Malformed or extra fields in a request body | zod schema per handler; unknown keys stripped; errors return 400 with field messages, never a stack trace. | Handled, not tested |
| 7.5 | Cross-site request forgery | Better Auth checks `Origin` against trusted origins; Next.js server actions reject a mismatched `Origin`/`Host`. Session cookie is `SameSite=Lax`. | Handled, not tested |
| 7.6 | Brute force / abuse of auth endpoints | Better Auth's rate limiter, always on, stored in Redis through an atomic counter so limits hold across instances: 100 requests a minute per IP overall, 10 social sign-ins and 20 callbacks a minute, 3 account deletions an hour. | Handled, not tested |
| 7.7 | Upload or API flood from one store or key | Fixed-window limits in Redis: 1,200 API requests a minute per store, 600 per API key, 5,000 uploads an hour per store; over the limit returns 429 with `Retry-After`. At most 3 imports run at once per store. If Redis is down the limiter lets requests through rather than taking the API down. | Handled, not tested |
| 7.8 | Uploaded file lies about its type, or a ZIP entry is named `../../etc/passwd` | Type from magic bytes; size limits enforced while streaming, not after; ZIP entry names normalised and rejected if they escape the target; stored under random keys, never the user's filename. | Handled, not tested |
| 7.9 | Large upload through a server action | Server actions keep the 1 MB body limit. Files go through a streaming upload route or presigned URL. | Handled, not tested |
| 7.10 | API key leaked or guessed | Keys are `cf_` + 192 random bits, stored only as SHA-256 hashes with a visible prefix, shown once, scoped to one store, revocable, `last_used_at` tracked. A key cannot create keys or manage webhooks (session only). | Handled, not tested |
| 7.11 | Webhook URL points at `localhost`, `169.254.169.254` or a private range (SSRF) | Rejected at creation (https only, no credentials, no private IP literals). At delivery every resolved address is checked inside the socket `lookup`, so DNS rebinding cannot slip a private IP in; redirects are not followed; 10 s timeout. Body signed `HMAC-SHA256(secret, "<t>.<body>")` in `x-catalogforge-signature`. `WEBHOOKS_ALLOW_PRIVATE=true` only for local development. | Handled, not tested |
| 7.12 | Secret reaches the browser | `ANTHROPIC_API_KEY`, `BETTER_AUTH_SECRET`, `DATABASE_URL` have no `NEXT_PUBLIC_` prefix; server modules import `server-only`. Env is validated with zod at boot in both processes (`instrumentation.ts` for the app, worker start for the worker), so a missing or short secret fails at start, not mid-import. | Handled, not tested |
| 7.13 | Logs capture secrets or merchant data | Logs carry IDs, counts and error codes. The log writer also scrubs every line: fields named like secrets, tokens, prompts, cells or descriptions are replaced, and Anthropic keys, `cf_` API keys, bearer tokens and passwords in URLs are masked inside messages. | Handled, not tested |
| 7.14 | Worker job payload tampered in Redis | Jobs carry IDs only (`import_id`, `group_key`, `stage`); the worker re-reads data and the store from Postgres. | Handled, not tested |

## 8. Infrastructure (Postgres, Redis)

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 8.1 | Redis restarts | AOF persistence (`appendfsync everysec`), so at most about a second of queue writes is lost. Postgres is the source of truth for row state: a reconciler re-enqueues rows that are `pending`/`processing` with no live job. | Handled, not tested |
| 8.2 | Redis runs out of memory | `maxmemory-policy noeviction`: BullMQ keys are never silently evicted; writes fail loudly and enqueue retries. | Handled, not tested |
| 8.3 | Redis down at upload time | Import is written to Postgres as `queued` first (outbox); enqueue happens after, and the reconciler retries it. The upload does not fail. | Handled, not tested |
| 8.4 | Worker dies while holding a job | BullMQ stalled-job detection re-queues it after the lock expires; after `maxStalledCount` it fails with a reason. Jobs are idempotent (3.4). | Handled, not tested |
| 8.5 | Finished jobs pile up in Redis | `removeOnComplete` / `removeOnFail` with age and count caps. History lives in Postgres. | Handled, not tested |
| 8.6 | Postgres connections run out | One pool per process (reused across hot reloads in dev), capped by `DB_POOL_MAX` (default 10) so imports cannot starve the app. | Handled, not tested |
| 8.7 | Schema change on deploy | `pnpm db:migrate` runs before the new code starts. Both the app and the worker compare `drizzle/meta/_journal.json` with the applied migrations at boot and refuse to start, naming the missing ones, if the database is behind. Changes are additive first, destructive later. | Handled, not tested |
| 8.8 | Many dashboard tabs open on live progress | `GET /api/imports/stream` (SSE) is scoped to the signed-in user's active store. Each app process holds one Redis subscriber and fans events out in memory, so connections do not each open a Redis connection. 15 s heartbeat keeps proxies from closing idle streams; the browser reconnects after 3 s. | Handled, not tested |
| 8.9 | Webhook endpoint down or slow | Each delivery is a queue job retried up to 8 times with jittered backoff; every attempt is logged with status, duration and error. Disabled endpoints receive nothing. | Handled, not tested |

