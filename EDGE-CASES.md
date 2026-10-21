# EDGE-CASES.md

Everything that can go wrong in CatalogForge, what the app does about it, and where each case stands.
Written before the implementation and kept up to date while building.

Status values:

- **Handled + tested**: behaviour implemented and covered by an automated test.
- **Handled, not tested**: behaviour implemented, no automated test yet.
- **UI only**: the frontend shows the state; the backend that produces it is not built yet.
- **Planned**: designed, not implemented.
- **Not handled**: out of scope, with the reason.

Stack these cases are written against: Next.js (app + API routes), Postgres via Drizzle, Better Auth (Google), Redis + BullMQ for the import queue, Gemini for parsing, extraction and translation (`GEMINI_MODEL_FAST` for clean rows, `GEMINI_MODEL_STRONG` for messy rows and photos).

Auth, stores and the import pipeline (upload → parse → clean → group → photos → AI build → translate, on BullMQ) are built. They were checked by hand against `evals/` (small, medium, 1,000 rows, 10,000 rows, and every file in `edge/`) in `AI_MODE=mock`; the Gemini calls themselves have not run yet because no API key is configured. There are no automated tests yet, so nothing is "Handled + tested".

---

## 1. Messy input

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 1.1 | File is not CSV/XLSX/ZIP/image (e.g. `.numbers`, `.pdf`) | Rejected in the browser before upload, with the file name and the accepted types. Re-checked server side by magic bytes, not extension. | Handled, not tested |
| 1.2 | Sheet over the size limit (25 MB) or a photo over 10 MB | Rejected with the exact limit and the file's actual size. | Handled, not tested |
| 1.3 | More than 10,000 rows or 2,000 photos | Import is refused at parse time with the counted number, before any AI spend. Partial imports are not started silently. | Handled, not tested |
| 1.4 | Corrupt XLSX / truncated CSV / zip bomb | Import ends **Failed** with "Could not read the file" and the parser error. ZIP extraction is capped on total uncompressed size and entry count. | Handled, not tested |
| 1.5 | Broken encoding (`TerracottaÂ Topf`, `GrÃ¼n`) | Detect encoding (BOM, chardet-style heuristics), try Windows-1252 → UTF-8 repair, record the repair on the row. | Handled, not tested |
| 1.6 | Header row is not the first row, or headers are in German (`Preis`, `Farbe`) | Header detection scans the first 20 rows; a synonym map covers EN/DE/FR column names. Unknown columns are kept as raw attributes, never dropped. | Handled, not tested |
| 1.7 | Prices like `1.299,00 €`, `12.5`, `£8`, `EUR 9`, `9,-` | Parsed to integer cents + ISO currency. Decimal separator inferred per value, then checked against the sheet's dominant locale. Never stored as a float. | Handled, not tested |
| 1.8 | Price missing or `0` | Variant gets no price; product goes to **Needs review** with "No price for {variant}". Never invented. | Handled, not tested |
| 1.9 | Price with no currency symbol | Uses the sheet-level default currency chosen at upload; the row records that a default was applied. | Handled, not tested |
| 1.10 | Mixed units (`20cm`, `8 in`, `1.8kg`, `4 lbs`) | Normalised to cm and grams as integers. Original value kept on the source row for the review screen. | Handled, not tested |
| 1.11 | Colour typos (`terracota`, `antrazit`) | Fuzzy match against an EN/DE/FR colour vocabulary (edit distance with transpositions, ≤ 1 for short words, ≤ 2 otherwise). The fix is recorded on the row. Unknown colours are kept as written, never dropped. | Handled, not tested |
| 1.12 | Same product split across rows (one row per size/colour) | Grouped by normalised parent SKU, then by normalised title + brand. Each row becomes a variant. `source_rows` lists every row used. | Handled, not tested |
| 1.13 | Exact duplicate rows | Collapsed into one; the duplicate row ends **Done** with "Duplicate of row N" so counts still add up. | Handled, not tested |
| 1.14 | Duplicate SKU with conflicting data (two prices for `TC-PL-20`) | Not merged silently. The variant gets no price and the product goes to **Needs review** with "Two prices for SKU X (rows a and b)". Same for two weights. | Handled, not tested |
| 1.15 | Rows out of order (variant before its parent) | Grouping runs after the whole sheet is parsed, so order does not matter. | Handled, not tested |
| 1.16 | Required fields missing (no title, no SKU) | No SKU: a deterministic SKU is derived from the row hash and flagged. No title and no description: row **Failed**, "Not enough information to build a product". | Handled, not tested |
| 1.17 | Huge descriptions (100 KB of HTML) | Sanitised, then cut to 4,000 characters of text before the AI call. The row records "Description truncated from N characters" and the group is routed to the stronger model. | Handled, not tested |
| 1.18 | HTML with `<script>`, `onerror=`, `javascript:` links, inline styles | Sanitised with an allowlist (p, ul, ol, li, strong, em, br, a[href=http(s)]). Done before AI and again on AI output before storage. | Handled, not tested |
| 1.19 | Formula injection in exports (`=HYPERLINK(...)`) | CSV export prefixes cells that start with `= + - @` with a quote. | Planned |
| 1.20 | Photo with no matching row | Listed under "Unmatched photos" on the import, not attached anywhere. Merchant can attach manually. | Handled, not tested |
| 1.21 | Row references a photo that was not uploaded | Product built without it; warning on the product, not a failure. | Handled, not tested |
| 1.22 | Photo filenames that match several products (`IMG_0001.jpg`) | Match by SKU in filename first, then by explicit image column. Ambiguous matches are not guessed; the photo stays unmatched. | Handled, not tested |
| 1.23 | Same photo uploaded twice under different names | Deduplicated by content hash. | Handled, not tested |
| 1.24 | Supplier text in German or mixed languages | Detected per field; passed to the AI as source language, English output generated, original kept as the claim source. | Handled, not tested (needs a live Gemini run) |
| 1.25 | Qualified claims ("frost-resistant (not frost-proof, bring indoors below 0 °C)") | The qualifier is part of the claim; the AI must not drop it. A validator checks that negations in the source are not inverted in the output. | Handled, not tested (needs a live Gemini run) |

## 2. AI problems

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 2.1 | Model returns invalid JSON | Gemini is called with `responseMimeType: application/json` and a `responseSchema`, but the output is still validated with zod: structured output narrows the shape, it does not guarantee it. One repair retry with the validation error in the prompt, then exponential backoff retries, then row **Failed** with "Model output did not match the schema". | Handled, not tested (needs a live Gemini run) |
| 2.2 | Model invents a claim (`organic`, `dishwasher-safe`) | Every claim must cite a source row and column. A post-check verifies the cited text actually contains the claim (normalised substring / synonym match). Unsupported claims are removed and the product goes to **Needs review**. | Handled, not tested |
| 2.3 | Model changes a price, SKU or weight | Prices, SKUs and weights never come from the model; they come from the cleaning step. The model output for those fields is ignored. | Handled, not tested |
| 2.4 | Low confidence on a field | Fields under 70% are highlighted; any required field under 70% sends the product to **Needs review** with the field name as the reason. | Handled, not tested |
| 2.5 | Category not in the taxonomy | Validated against the allowed taxonomy; unknown category → **Needs review**, "Category not recognised". | Handled, not tested |
| 2.6 | Timeout | Treated as retryable. Exponential backoff with jitter, max 5 attempts, then **Failed** with the last error. | Handled, not tested |
| 2.7 | Rate limit (429 `RESOURCE_EXHAUSTED`) | The whole import queue pauses (BullMQ queue-level rate limit) until the delay in Gemini's `RetryInfo`, or a backoff when none is given. Per-minute (RPM/TPM) and per-day quotas are told apart: a daily quota pauses until the reset instead of retrying. UI shows "Paused, resuming in X minutes". No attempts are burned while paused. | Handled, not tested |
| 2.8 | Provider down (5xx / `UNAVAILABLE` for minutes) | Circuit breaker in Redis, shared by every worker: 10 provider failures inside 60 s pause the AI queues for 30 s instead of burning attempts; the next success resets it. | Handled, not tested |
| 2.9 | Gemini Batch job takes hours or partially fails | The batch job name is stored on the import before submission, so a restart polls the same job instead of resubmitting. Results are reconciled per item by key; failed or missing items re-enter the normal queue. A batch that expires unfinished is resubmitted only for unfinished items. | Planned |
| 2.10 | Model output contains HTML/script | Sanitised with the same allowlist as input. | Handled, not tested |
| 2.11 | Prompt injection in supplier text ("ignore previous instructions") | Supplier text is passed as data in a delimited field, never as instructions. Output is schema-validated and claims are source-checked, which limits the damage. | Handled, not tested |
| 2.12 | Cost runaway (retry storm, huge rows) | Per-import token budget, estimated up front with `countTokens` and tracked from `usageMetadata` on every response; the import pauses and asks the merchant when it is exceeded. | Planned |
| 2.13 | Response blocked (`finishReason: SAFETY` / `RECITATION`, or `promptFeedback.blockReason`) | Not retried with the same input (it would block again). Row goes to **Needs review**, "Model declined to generate", with the block reason. Never shown as an empty product. | Handled, not tested |
| 2.14 | Output cut off (`finishReason: MAX_TOKENS`) | Treated as a retryable failure, not parsed as partial JSON. Each retry doubles the output budget (4k → 8k → 16k tokens). | Handled, not tested |
| 2.15 | Photo the model cannot take (HEIC, 40 MP, animated, CMYK) | Photos are re-encoded server side with sharp to JPEG, max 768 px, before they go to the model (at most 3 per product). Undecodable images are marked invalid at import time. | Handled, not tested |
| 2.16 | API key missing, invalid or revoked (400 `API_KEY_INVALID` / 403) | Not retryable. The AI queues pause for 5 minutes at a time and the import shows as paused instead of failing every row; it resumes once the key works (worker restart picks up a new key). | Partly handled (pause works; startup key check Planned) |
| 2.17 | Model retired or renamed | Model IDs come from env, not code. Worker start calls the models endpoint and refuses to process with a clear error if a configured model is unavailable. | Planned |
| 2.18 | Same input, different output (non-determinism) | Temperature fixed low for extraction; the stored AI result per job key is reused on retry (see 3.5), so a re-run happens only when the merchant asks for one. | Handled, not tested |

## 3. Scale

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 3.1 | 10,000-row import | Upload stores the file and returns immediately. Parsing and AI run in a durable background queue in batches. | Handled, not tested |
| 3.2 | Same file uploaded twice | File and row hashes identify content. Per product group an input hash (cells + photo hashes) is compared with the stored product: unchanged groups are skipped with "Unchanged since last import" and make no AI call; changed groups update the product keyed by (store, group). Checked by hand: re-uploading the 1,000-row set made 0 AI calls and 0 new products. | Handled, not tested |
| 3.3 | Two imports at once for the same store | Both run; product upserts are keyed by (store, SKU) with a unique constraint, so a race cannot create two products. Last writer wins per field, merchant edits are never overwritten. | Handled, not tested |
| 3.4 | Server restarts mid-import | Every row and group state is in Postgres. Jobs are keyed by `(import, group, stage)`, so re-adding them is a no-op. On start (and every 5 minutes) a reconciler re-enqueues pending groups; jobs held by a dead worker are recovered by BullMQ stall detection within ~30 s. Checked by hand: `kill -9` at 220/464 groups on the 1,000-row set, restart finished with 464 products, 959 variants, no duplicates. | Handled, not tested |
| 3.5 | Worker crashes after the AI call but before saving | The AI result is stored with the job key before the product write; the retry reuses it instead of paying again. | Handled, not tested |
| 3.6 | Row counts do not add up | Invariant: done + needs review + failed + pending = total rows. Checked at import completion; a mismatch is logged and shown. | Handled, not tested |
| 3.7 | Storefront under load during a big import | Storefront reads only published, pre-translated data, served from cache. Workers run in separate processes with a capped DB pool. | Partly handled (separate worker, capped pool; storefront cache Planned) |
| 3.8 | Browser tab closed during upload | Resumable/chunked upload is not built; the merchant re-uploads. Because of 3.2 that is safe. | Not handled (re-upload is idempotent) |

## 4. Later changes

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 4.1 | Merchant edits a product field | Field marked as manual. Later imports and AI re-runs never overwrite a manual field. | Partly handled (pipeline respects manual fields; edit API Planned) |
| 4.2 | English text changes after translation | Only the changed field is re-translated (per-field source hash). | Handled, not tested |
| 4.3 | Merchant fixed a translation, then English changes | The manual translation is kept and marked **Out of date**. It is not replaced by the AI. | Handled, not tested |
| 4.4 | Merchant deletes a product, then re-uploads the sheet | Deletion is a tombstone keyed by SKU; the re-import does not resurrect it and reports "Skipped: deleted by merchant". | Partly handled (re-import skips deleted products; delete API Planned) |
| 4.5 | Merchant sends a product back for re-generation | Product goes back to the queue with the merchant's note added to the prompt; manual fields are still locked. | UI only |
| 4.6 | Variant removed from the new sheet | Not deleted automatically; flagged "Missing from latest import" for review. | Partly handled (variants never deleted; flag Planned) |

## 5. Storefront

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 5.1 | Product still under review | Not shown on the storefront. Direct URL returns 404. | UI only |
| 5.2 | Translation missing for a field | Falls back to English for that field only. | UI only |
| 5.3 | Visitor from a country with no translation (e.g. Spain) | English. | UI only |
| 5.4 | Austria / Germany | German. France → French. | UI only |
| 5.5 | Variant with no price | Shown as unavailable; cannot be selected. | UI only |
| 5.6 | Price display per locale | Formatted with `Intl.NumberFormat` from integer cents; the stored value is never rounded. | UI only |
| 5.7 | Placeholders, units, brand names in translations | Protected tokens are masked before translation and restored after; a validator fails the translation if a token is lost. | Planned |

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
| 6.9 | Double-clicking "Create store" | Button disabled while the action is pending. Two tabs submitting at once can still create two stores; needs an idempotency token on the form. | Planned |
| 6.10 | User creates stores in a loop | Max 10 owned stores per user, checked server side. The count and insert are not atomic, so a burst can exceed it by one. | Handled, not tested |
| 6.11 | `active_store` cookie points to a store the user is not a member of (forged, or they were removed) | Ignored: the active store is always picked from the user's memberships, falling back to the first one. `switchStore` checks membership before setting the cookie. The cookie is httpOnly. | Handled, not tested |
| 6.12 | Google sign-in cancelled or fails | Better Auth redirects to `/login?error=…`; the page shows a readable message. | Handled, not tested |
| 6.13 | Same email arrives from a second sign-in method | Better Auth account-linking rules apply; unlinked accounts land on `/login` with `account_not_linked`. Policy to be set explicitly when a second provider is added. | Planned |
| 6.14 | Sole owner deletes their account | Memberships cascade; the store would be left with no owner. Account deletion is blocked while the user is the only owner of a store. | Planned |
| 6.15 | Signed out in another tab | Next server request has no session and redirects to `/login`. Open client state is discarded. | Handled, not tested |
| 6.16 | Google client ID/secret missing | Better Auth logs a warning at boot; the sign-in button shows the error instead of hanging. | Handled, not tested |
| 6.17 | Inviting teammates to a store | Not built. Roles exist (`owner`, `member`) so invites can be added without a migration. | Not handled (single-owner stores for now) |

## 7. Server-side checks

Nothing the browser sends is trusted. These apply to every API route, server action and worker job.

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 7.1 | Request hits an API route or server action directly, skipping the UI | Every handler resolves the session itself. Middleware is never the only check. | Handled for store actions; Planned for import/product routes |
| 7.2 | Request sends a `store_id` for someone else's store | `store_id` is never read from the body or query. It comes from the session + membership lookup. Every query on store data filters by it. | Handled for store actions and import routes; Planned for product routes |
| 7.3 | Request for another store's import/product by ID (`/imports/imp_123`) | Looked up by `(id, store_id)`; a miss returns 404, not 403, so IDs from other stores cannot be probed. | Handled for imports; Planned for products |
| 7.4 | Malformed or extra fields in a request body | zod schema per handler; unknown keys stripped; errors return 400 with field messages, never a stack trace. | Handled for store creation and imports; Planned elsewhere |
| 7.5 | Cross-site request forgery | Better Auth checks `Origin` against trusted origins; Next.js server actions reject a mismatched `Origin`/`Host`. Session cookie is `SameSite=Lax`. | Handled (framework) |
| 7.6 | Brute force / abuse of auth endpoints | Better Auth's rate limiter. In production it moves to Redis (`secondaryStorage`) so limits hold across instances. | Planned |
| 7.7 | Upload or API flood from one store or key | Sliding-window limits in Redis per store and per API key; 429 with `Retry-After`. Concurrent imports per store capped. | Planned |
| 7.8 | Uploaded file lies about its type, or a ZIP entry is named `../../etc/passwd` | Type from magic bytes; size limits enforced while streaming, not after; ZIP entry names normalised and rejected if they escape the target; stored under random keys, never the user's filename. | Handled, not tested |
| 7.9 | Large upload through a server action | Server actions keep the 1 MB body limit. Files go through a streaming upload route or presigned URL. | Handled, not tested |
| 7.10 | API key leaked or guessed | Keys stored as SHA-256 hashes with a visible prefix, shown once, scoped to one store, revocable, `last_used_at` tracked. Compared in constant time. | Planned |
| 7.11 | Webhook URL points at `localhost`, `169.254.169.254` or a private range (SSRF) | URL resolved and every IP checked against private/link-local ranges before each delivery; redirects not followed; short timeout. Payload signed with HMAC + timestamp. | Planned |
| 7.12 | Secret reaches the browser | `GEMINI_API_KEY`, `BETTER_AUTH_SECRET`, `DATABASE_URL` have no `NEXT_PUBLIC_` prefix; server modules import `server-only`. Env validated with zod at boot so a missing key fails at start, not mid-import. | Partly handled (`server-only`, env validated at worker start); app env validation Planned |
| 7.13 | Logs capture secrets or merchant data | Logs carry IDs, counts and error codes; no API keys, tokens, prompts or supplier text. | Planned |
| 7.14 | Worker job payload tampered in Redis | Jobs carry IDs only (`import_id`, `group_key`, `stage`); the worker re-reads data and the store from Postgres. | Handled, not tested |

## 8. Infrastructure (Postgres, Redis)

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 8.1 | Redis restarts | AOF persistence (`appendfsync everysec`), so at most about a second of queue writes is lost. Postgres is the source of truth for row state: a reconciler re-enqueues rows that are `pending`/`processing` with no live job. | Handled, not tested |
| 8.2 | Redis runs out of memory | `maxmemory-policy noeviction`: BullMQ keys are never silently evicted; writes fail loudly and enqueue retries. | Handled (config) |
| 8.3 | Redis down at upload time | Import is written to Postgres as `queued` first (outbox); enqueue happens after, and the reconciler retries it. The upload does not fail. | Handled, not tested |
| 8.4 | Worker dies while holding a job | BullMQ stalled-job detection re-queues it after the lock expires; after `maxStalledCount` it fails with a reason. Jobs are idempotent (3.4). | Handled, not tested |
| 8.5 | Finished jobs pile up in Redis | `removeOnComplete` / `removeOnFail` with age and count caps. History lives in Postgres. | Handled, not tested |
| 8.6 | Postgres connections run out | One pool per process (reused across hot reloads in dev); worker pool size capped so imports cannot starve the app. | Partly handled (single pool, `DB_POOL_MAX`) |
| 8.7 | Schema change on deploy | Drizzle migrations run before the new code starts; changes are additive first, destructive later. | Planned |
| 8.8 | Many dashboard tabs open on live progress | `GET /api/imports/stream` (SSE) is scoped to the signed-in user's active store. Each app process holds one Redis subscriber and fans events out in memory, so connections do not each open a Redis connection. 15 s heartbeat keeps proxies from closing idle streams; the browser reconnects after 3 s. | Handled, not tested |

