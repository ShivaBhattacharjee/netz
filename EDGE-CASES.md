# EDGE-CASES.md

Everything that can go wrong in CatalogForge, what the app does about it, and where each case stands.
Written before the implementation and kept up to date while building.

Status values:

- **Handled + tested**: behaviour implemented and tested, either by an automated test in `tests/` (run with `pnpm test`, or `pnpm test:integration` for the worker restart and re-upload cases, which need Postgres and Redis; both run in CI on every push, and each test name ends with the case number it covers, e.g. "(1.26)"), or by hand against the running app with the sample files in `evals/` and `scripts/fake-anthropic.py`.
- **Handled, not tested**: behaviour implemented, but not checked yet.
- **Not handled**: out of scope, with the reason.

Stack these cases are written against: Next.js (app + API routes), Postgres via Drizzle, Better Auth (Google), Redis + BullMQ for the import queue, Anthropic Claude Haiku 5.5 for clean rows and translation (`AI_MODEL_FAST`, `AI_MODEL_TRANSLATE`) and Claude Sonnet 5.5 for messy rows and photos (`AI_MODEL_STRONG`).

The brief asks for at least these groups; where each one lives:

| Brief | Section |
| --- | --- |
| Messy input: broken files, wrong prices, duplicate SKUs, missing fields, huge descriptions, photos with no matching row | 1 |
| AI problems: wrong answers, invented claims, invalid JSON, timeouts, rate limits, provider down | 2 |
| Scale: very large imports, same file twice, two imports at once, restart mid-import | 3, 8 |
| Later changes: edit, delete, translation fix, then the English changes | 4, 9 |
| Storefront: product under review, missing translation, country with no translation | 5 |
| Dashboard, export, cost and the live demo | 10, 11, 12 |

Auth, stores, the import pipeline (upload → parse → clean → group → photos → AI build → translate, on BullMQ), review, storefront, webhooks and the public API are built.

---

## 1. Messy input

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 1.1 | File is not CSV/XLSX/ZIP/image (e.g. `.numbers`, `.pdf`) | Rejected in the browser before upload, with the file name and the accepted types. Re-checked server side by magic bytes, not extension. | Handled + tested |
| 1.2 | Sheet over the size limit (25 MB) or a photo over 10 MB | Rejected with the exact limit and the file's actual size. | Handled + tested |
| 1.3 | More than 10,000 rows or 2,000 photos | Import is refused at parse time with the counted number, before any AI spend. Partial imports are not started silently. | Handled + tested |
| 1.4 | Corrupt XLSX / truncated CSV / zip bomb | Import ends **Failed** with "Could not read the file" and the parser error. ZIP extraction is capped on total uncompressed size and entry count. | Handled + tested |
| 1.5 | Broken encoding (`TerracottaÂ Topf`, `GrÃ¼n`) | Detect encoding (BOM, chardet-style heuristics), try Windows-1252 → UTF-8 repair, record the repair on the row. | Handled + tested |
| 1.6 | Header row is not the first row, or headers are in German (`Preis`, `Farbe`) | Header detection scans the first 20 rows; a synonym map covers EN/DE/FR column names. Unknown columns are kept as raw attributes, never dropped. | Handled + tested |
| 1.7 | Prices like `1.299,00 €`, `12.5`, `£8`, `EUR 9`, `9,-`, `CA$ 12`, `A$5` | Parsed to integer cents + ISO currency (`CA$` → CAD, `A$` → AUD, also NZD, HKD, SGD; a bare `$` is USD). Decimal separator inferred per value, then checked against the sheet's dominant locale. Never stored as a float. | Handled + tested |
| 1.8 | Price missing or `0` | Variant gets no price; product goes to **Needs review** with "No price for {variant}". Never invented. | Handled + tested |
| 1.9 | Price with no currency symbol | Uses the import's default currency: `default_currency` when the import is started through the API, otherwise EUR. The row records that a default was applied. | Handled + tested |
| 1.10 | Mixed units (`20cm`, `8 in`, `1.8kg`, `4 lbs`) | Normalised to cm and grams as integers. Original value kept on the source row for the review screen. | Handled + tested |
| 1.11 | Colour typos (`terracota`, `antrazit`) | Fuzzy match against an EN/DE/FR colour vocabulary (edit distance with transpositions, ≤ 1 for short words, ≤ 2 otherwise). The fix is recorded on the row. Unknown colours are kept as written, never dropped. | Handled + tested |
| 1.12 | Same product split across rows (one row per size/colour) | Grouped by parent SKU column if there is one, else by the SKU with trailing size/colour segments removed (`TC-PL-20` → `TC-PL`), else by normalised title + brand. Each row becomes a variant. `source_rows` lists every row used. | Handled + tested |
| 1.13 | Exact duplicate rows | Collapsed into one; the duplicate row ends **Done** with "Duplicate of row N" so counts still add up. | Handled + tested |
| 1.14 | Duplicate SKU with conflicting data (two prices for `TC-PL-20`) | Not merged silently. The variant gets no price and the product goes to **Needs review** with "Two prices for SKU X (rows a and b)". Same for two weights. | Handled + tested |
| 1.15 | Rows out of order (variant before its parent) | Grouping runs after the whole sheet is parsed, so order does not matter. | Handled + tested |
| 1.16 | Required fields missing (no title, no SKU) | No SKU: a deterministic SKU is derived from the row hash and flagged. No title and no description: row **Failed**, "Not enough information to build a product". | Handled + tested |
| 1.17 | Huge descriptions (100 KB of HTML) | Sanitised, then cut to 4,000 characters of text before the AI call. The row records "Description truncated from N characters" and the group is routed to the stronger model. | Handled + tested |
| 1.18 | HTML with `<script>`, `onerror=`, `javascript:` links, inline styles | Sanitised with an allowlist (p, ul, ol, li, strong, em, br, a[href=http(s)]). Done before AI and again on AI output before storage. | Handled + tested |
| 1.19 | Formula injection in exports (`=HYPERLINK(...)`) | CSV and Shopify exports prefix cells that start with `= + - @`, tab or carriage return with a quote. | Handled + tested |
| 1.20 | Photo with no matching row | Listed under "Unmatched photos" on the import, not attached anywhere. When the import finishes, a background job sends each unmatched photo with the import's product list (title, SKUs, options; capped at 400 products, those sharing words with the file name first) to the fast model. At 85% confidence or more it is attached to that product; from 50% it is shown as a suggestion the merchant attaches or dismisses; below that it stays unmatched with the model's reason. A photo whose image the product already has is not attached twice. Each photo is checked once, so a restart resumes where it stopped; **Match with AI** on the panel re-runs it if the job failed. Not available in demo mode. | Handled + tested |
| 1.21 | Row references a photo that was not uploaded | Product built without it; warning on the product, not a failure. | Handled + tested |
| 1.22 | Photo filenames that match several products (`IMG_0001.jpg`) | Match by the explicit image column first, then by SKU in the file name. Ambiguous matches are not guessed; the photo stays unmatched. The AI match (1.20) also returns no match when two products fit equally well. | Handled + tested |
| 1.23 | Same photo uploaded twice under different names | Deduplicated by content hash. | Handled + tested |
| 1.24 | Supplier text in German or mixed languages | Detected per field; passed to the AI as source language, English output generated, original kept as the claim source. | Handled + tested |
| 1.25 | Qualified claims ("frost-resistant (not frost-proof, bring indoors below 0 °C)") | The qualifier is part of the claim; the AI must not drop it. A validator checks that negations in the source are not inverted in the output. | Handled + tested |
| 1.26 | SKUs share a prefix but are different products (`HG-PLT-001` lamp, `HG-PLT-002` throw) | A zero-padded numeric suffix (`-001`) is read as an item number, not a size: those rows are grouped together only when their titles agree, otherwise each goes to its own product by title. Other SKU-prefix groups whose titles (in the same language) share no word go to **Needs review** with "Rows a and b share SKU prefix X but have unrelated titles". | Handled + tested |
| 1.27 | Price in a currency the app does not support (`¥1200`, `₹ 499`, `1200 JPY`) | The variant gets no price and the product goes to **Needs review** with "Unsupported currency in price". The default currency is never applied to it. | Handled + tested |
| 1.28 | Empty sheet or zero-byte photo (`evals/edge/empty.csv`, `zero-byte-photo.jpg`) | Rejected at upload by content sniffing: "{file} is empty". | Handled + tested |
| 1.29 | Header row with no data under it (`header-only.csv`) | Import ends **Failed** with "No data rows under the header". No AI spend. | Handled + tested |
| 1.30 | No recognisable header in the first 20 rows (a title block, a logo row, a pivot table) | Import ends **Failed** with "Could not find a header row in the first 20 rows (expected columns like SKU, Title, Price)". | Handled + tested |
| 1.31 | Semicolon- or tab-separated CSV saved by German Excel in Windows-1252 (`semicolon-cp1252.csv`) | Delimiter detected by papaparse, the text decoded as Windows-1252, `°C` and umlauts intact. | Handled + tested |
| 1.32 | Exactly 10,000 rows (`exactly-10000-rows.csv`) | Accepted; the limit is inclusive. 10,001 is refused (1.3). | Handled + tested |
| 1.33 | ZIP made on macOS: `__MACOSX/`, `.DS_Store`, photos in nested folders (`zip-with-junk.zip`) | `__MACOSX` entries and dot files are skipped; nested photos are matched by file name, not path; `../` entries are refused (7.8). | Handled + tested |
| 1.34 | XLSX whose first tab is a cover sheet, instructions or a price list, with the products on another tab | Every tab is read and the one whose header matches the most product columns (SKU, title, price…) is imported. A workbook with no product header on any tab fails with the header message (1.30). | Handled + tested |
| 1.35 | XLSX cells with formulas, dates and number formats (`=B2*1.19`, `12,50 €` as a formatted number) | Cells are read as Excel displays them (the cached formula value, the formatted number), then go through the same price and unit parsing as CSV. Formulas are never evaluated by the app. | Handled + tested |
| 1.36 | Title with no Latin letters (`花瓶`, `🌱🌱`) or two different products with the same title | The handle falls back to `product`; a taken handle gets `-2`, `-3`… (unique per store), so two products never share a storefront URL. | Handled + tested |
| 1.37 | Price column with a name the synonym map does not know (`Betrag`, `Amount`) | The synonym list covers the common retail names in EN/DE/FR (`VK brutto`, `Endpreis`, `prix de vente`, `prix TTC`, `selling price`…). If no header matches, the column where at least 80% of the first 200 values look like money (a digit next to `€ £ $ EUR GBP USD CHF`) becomes the price. Purchase-price columns are never picked (1.38). If nothing qualifies, the variants get no price and go to **Needs review** (1.8). | Handled + tested |
| 1.38 | Sheet has both a purchase price and a retail price (`EK netto`, `Cost`, `Wholesale`) | Purchase-price headers (`EK`, `Einkauf…`, `cost`, `purchase`, `wholesale`, `prix d'achat`) are never used as the price, by name or by content. They stay raw attributes and never reach the storefront. | Handled + tested |
| 1.39 | Exported CSV opened in Excel on Windows (`Grün`, `Größe`, `°C`) | CSV and Shopify exports are written as UTF-8 with a byte order mark, so Excel reads umlauts and symbols correctly; Shopify, Numbers and Google Sheets ignore the mark. | Handled + tested |

## 2. AI problems

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 2.1 | Model returns invalid JSON | Claude is called with structured outputs (`output_config.format` with a JSON schema), but the output is still validated with zod: structured output narrows the shape, it does not guarantee it. One repair retry with the validation error in the prompt, then exponential backoff retries, then row **Failed** with "Model output did not match the schema". | Handled + tested |
| 2.2 | Model invents a claim (`organic`, `dishwasher-safe`) | Every claim must cite a source row and column plus a quote. A post-check verifies the quote appears in that cell (after normalising case, accents and punctuation) and that the cell does not negate the claim. Unsupported claims are removed and the product goes to **Needs review**. Model-written attributes (material, care, origin…) go through the same check: each quotes its source cell in the supplier's language, and one whose quote is missing is removed with a review reason. Risky terms (`organic`, `waterproof`, `handmade`…) anywhere in the output with no source also send it to review. | Handled + tested |
| 2.3 | Model changes a price, SKU or weight | Prices, SKUs and weights never come from the model; they come from the cleaning step. The model output schema has no fields for them. | Handled + tested |
| 2.4 | Low confidence on a field | Fields under 70% are highlighted; any required field under 70% sends the product to **Needs review** with the field name as the reason. | Handled + tested |
| 2.5 | Category not in the taxonomy | Validated against the allowed taxonomy; unknown category → **Needs review**, "Category not recognised". | Handled + tested |
| 2.6 | Timeout | Treated as retryable. Exponential backoff with jitter, max 5 attempts, then **Failed** with the last error. | Handled + tested |
| 2.7 | Rate limit (429 `rate_limit_error`) | The whole import queue pauses (BullMQ queue-level rate limit) until the `retry-after` header, or a backoff when none is given. Exhausted credits or a workspace spend limit are reported as billing errors and pause longer. UI shows "Rate limited · resumes in X min". No attempts are burned while paused. | Handled + tested |
| 2.8 | Provider down (5xx / 529 `overloaded_error` for minutes) | Circuit breaker in Redis, shared by every worker: 10 provider failures inside 60 s pause the AI queues for 30 s instead of burning attempts; the next success resets it. | Handled + tested |
| 2.9 | Message Batches job takes hours or partially fails | Imports do not use the Message Batches API. Every group goes through the normal queue with per-call retries, so there is no long-running batch to lose or reconcile. Batches would halve the price but can take up to 24 hours, which does not fit a merchant watching an import finish. Pricing already supports a batch discount if it is added later. | Not handled (real-time calls only) |
| 2.10 | Model output contains HTML/script | Sanitised with the same allowlist as input. | Handled + tested |
| 2.11 | Prompt injection in supplier text ("ignore previous instructions") | Supplier text is passed as data in a delimited field, never as instructions. Output is schema-validated and claims are source-checked, which limits the damage. | Handled + tested |
| 2.12 | Cost runaway (retry storm, huge rows) | Per-import AI budget. At parse time the spend is estimated from the prompt and row sizes (about 4 characters per token, photos at about 800 tokens, build plus one translation call per group); the budget is 3× the estimate with a $1 floor (`AI_BUDGET_MULTIPLIER`, `AI_BUDGET_MIN_USD`). Actual spend is tracked from `usage` on every response. Before each paid build call the worker checks spend against the budget; once it is reached the import pauses with "AI budget reached" and stays paused (rate-limit resumes do not touch it) until the merchant raises the budget from the import menu, which re-queues the pending groups. | Handled + tested |
| 2.13 | Response blocked (`stop_reason: "refusal"`) | Not retried with the same input (it would refuse again). Row goes to **Needs review**, "Model declined to generate". Never shown as an empty product. | Handled + tested |
| 2.14 | Output cut off (`stop_reason: "max_tokens"`) | Treated as a retryable failure, not parsed as partial JSON. Each retry doubles the output budget (4k → 8k → 16k tokens). A prompt over the context window (`model_context_window_exceeded`) is a non-retryable bad request. | Handled + tested |
| 2.15 | Photo the model cannot take (HEIC, 40 MP, animated, CMYK) | Photos are re-encoded server side with sharp to JPEG, max 768 px, before they go to the model (at most 3 per product). Undecodable images are marked invalid at import time. | Handled + tested |
| 2.16 | API key missing, invalid or revoked (401 / 403) | Not retryable. Worker start checks the key against the models endpoint; a bad key or exhausted credits pause the AI queues for 5 minutes at a time and imports show as paused instead of failing every row. They resume once the key works (worker restart picks up a new key). | Handled + tested |
| 2.17 | Model retired or renamed | Model IDs come from env, not code. Worker start resolves every configured model (`AI_MODEL_FAST`, `AI_MODEL_STRONG`, `AI_MODEL_TRANSLATE`) on the models endpoint and refuses to start with the missing IDs if one is gone; a missing re-run model only logs a warning. | Handled + tested |
| 2.18 | Same input, different output (non-determinism) | The Claude 5.5 models take no temperature; extraction runs with structured output and low effort instead. The stored AI result per job key is reused on retry (see 3.5), so a re-run happens only when the merchant asks for one. | Handled + tested |

## 3. Scale

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 3.1 | 10,000-row import | Upload stores the file and returns immediately. Parsing and AI run in a durable background queue in batches. | Handled + tested |
| 3.2 | Same file uploaded twice | File and row hashes identify content. Per product group an input hash (cells + photo hashes) is compared with the stored product: unchanged groups are skipped with "Unchanged since last import" and make no AI call; changed groups update the product keyed by (store, group). A group whose SKUs already belong to one existing product takes that product's group key, so a changed title or a new parent SKU column updates the product instead of creating a second one. | Handled + tested |
| 3.3 | Two imports at once for the same store | Both run; products are keyed by (store, group) and variants by (store, SKU), both with unique constraints, so a race cannot create two products. Last writer wins per field, merchant edits are never overwritten. | Handled + tested |
| 3.4 | Server restarts mid-import | Every row and group state is in Postgres. Jobs are keyed by `(import, group, stage)`, so re-adding them is a no-op. On start (and every 5 minutes) a reconciler re-enqueues pending groups; jobs held by a dead worker are recovered by BullMQ stall detection within ~30 s. When BullMQ gives up on a job (retries used up, or stalled twice), the worker marks that group's rows **Failed** with "Gave up after N attempt(s): …", so no row stays pending and Retry can pick it up. | Handled + tested |
| 3.5 | Worker crashes after the AI call but before saving | The AI result is stored with the job key before the product write; the retry reuses it instead of paying again. | Handled + tested |
| 3.6 | Row counts do not add up, or a finished import shows rows still pending | Invariant: done + needs review + failed + pending = total rows, checked on every refresh and at completion; a mismatch is logged and shown. Many workers finish rows at once, so each refresh locks the import row before counting: an older count can never overwrite a newer one. | Handled + tested |
| 3.7 | Storefront under load during a big import | Storefront reads only published, pre-translated data, 24 products per page, without the AI cost aggregates the dashboard uses, served from the Next.js data cache per store and page (60 s TTL, invalidated when a product is approved, unlisted, deleted, edited or sent back). Workers run in separate processes with a capped DB pool. On the single Render service the worker shares the machine's CPU with the web server; split it into its own service for real isolation. The storefront is public at `/shop/<store>` with no sign-in; `/store` and the dashboard Preview button open it with a merchant banner (`?preview=1`). | Handled + tested |
| 3.8 | Browser tab closed during upload | Resumable/chunked upload is not built; the merchant re-uploads. Because of 3.2 that is safe. | Not handled (re-upload is idempotent) |

## 4. Later changes

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 4.1 | Merchant edits a product field | `PATCH /api/products/{id}` saves the edit and marks the field as manual. Later imports and AI re-runs never overwrite a manual field. | Handled + tested |
| 4.2 | English text changes after translation | Only the changed field is re-translated (per-field source hash). | Handled + tested |
| 4.3 | Merchant fixed a translation, then English changes | The manual translation is kept and marked **Out of date**. It is not replaced by the AI. | Handled + tested |
| 4.4 | Merchant deletes a product, then re-uploads the sheet | Delete (one product or in bulk from the table) sets a tombstone on the product group; the re-import does not resurrect it and reports "Skipped: deleted by merchant". | Handled + tested |
| 4.5 | Merchant sends a product back for re-generation | Send back or Re-run puts the product back on the queue with the merchant's note added to the prompt; manual fields are still locked and approved products are skipped. | Handled + tested |
| 4.6 | Variant removed from the new sheet | Not deleted automatically. The variant is marked with the import that dropped it, shown as "Not in latest import", and the product goes to **Needs review** with "Missing from latest import: SKU…". The mark clears if a later sheet brings the SKU back. | Handled + tested |
| 4.7 | Supplier fixes a product title in the next sheet (`Terracota Pot` → `Terracotta Pot`) and the rows have no parent SKU | The group is matched to the existing product through its SKUs, so the product is updated in place (same handle, manual fields kept) instead of a second product being created. If it was approved and the new build raises no review reason it stays listed; otherwise it goes to Needs review. | Handled + tested |
| 4.8 | Merchant edits an attribute (material, colour, care) | The attribute is marked manual and its German and French translations are re-queued. | Handled + tested |

## 5. Storefront

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 5.1 | Product still under review | Only approved ("listed") products are shown. Direct URL returns 404, and its photos return 404 from the public photo route (`/api/shop/<store>/photos/<id>`), which serves only photos of listed products. | Handled + tested |
| 5.2 | Translation missing for a field | Falls back to English for that field only (title, description and each attribute separately). | Handled + tested |
| 5.3 | Visitor from a country with no translation (e.g. Spain) | English. | Handled + tested |
| 5.4 | Austria / Germany | German. France → French. | Handled + tested |
| 5.5 | Variant with no price | Shown as unavailable; cannot be selected. | Handled + tested |
| 5.6 | Price display per locale | Formatted with `Intl.NumberFormat` from integer cents; the stored value is never rounded. | Handled + tested |
| 5.7 | Placeholders, units, brand names in translations | Brand and store names, `{{placeholders}}` and measurements (`20 cm`, `1.8 kg`, `40 °C`, `E27`) are replaced with `⟦n⟧` tokens before translation and restored after, with a decimal comma for German and French. The validator fails a field if a token, HTML tag or number is lost or changed. | Handled + tested |
| 5.8 | Attribute values on the product page (material, colour, care) | Translated with the title and description in one call that returns German and French together; the brand is never translated. The storefront shows the translation when it is current for the English value, otherwise English. | Handled + tested |
| 5.9 | 5,000 approved products | The collection page shows 24 per page with previous / next links, so page size and query cost do not grow with the catalog. | Handled + tested |
| 5.10 | Fixed text that no source supports (shipping times, guarantees) | The storefront shows only catalog data and interface labels; it makes no promises the supplier sheet does not contain. | Handled + tested |

## 6. Auth and stores

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 6.1 | Signed-out visitor opens a dashboard URL | Middleware sees no session cookie and redirects to `/login`. The cookie check is only a fast path; the dashboard layout re-validates the session against the database on every request. | Handled + tested |
| 6.2 | Session cookie present but expired, revoked or forged | `auth.api.getSession` returns nothing (signature + DB lookup), layout redirects to `/login`. | Handled + tested |
| 6.3 | Signed-in user opens `/login` | Redirected to `/imports`. | Handled + tested |
| 6.4 | New user after first Google sign-in | Sent to `/onboarding` (`newUserCallbackURL`) to create a store. | Handled + tested |
| 6.5 | Existing user with no store (skipped onboarding, or was removed from their last store) | Every dashboard page redirects to `/onboarding`. There is no dashboard without a store. | Handled + tested |
| 6.6 | Invalid store details (1-char name, `not a domain`, unknown currency) | Validated server side with zod in the server action (client checks are not trusted). Per-field errors, typed values kept. Name 2–60 chars, trimmed. Domain optional, normalised (`https://Shop.com/x` → `shop.com`). Currency from an allowlist. | Handled + tested |
| 6.7 | Two stores with the same name | Slug has a unique constraint; on conflict a random suffix is added and the insert retried (max 5). | Handled + tested |
| 6.8 | Store row created but membership insert fails | Both inserts run in one transaction, so there is never a store without an owner. | Handled + tested |
| 6.9 | Double-clicking "Create store" | Button disabled while the action is pending. The form carries a request ID claimed in Redis (`SET NX`, 10 minutes): a repeat submit of the same form is told it is in progress, or lands on the store the first submit created. Two separate tabs are two forms and create two stores on purpose. | Handled + tested |
| 6.10 | User creates stores in a loop | Max 10 owned stores per user, checked server side. The count and the insert run in one transaction behind a per-user advisory lock, so a burst cannot exceed it. | Handled + tested |
| 6.11 | `active_store` cookie points to a store the user is not a member of (forged, or they were removed) | Ignored: the active store is always picked from the user's memberships, falling back to the first one. `switchStore` checks membership before setting the cookie. The cookie is httpOnly. | Handled + tested |
| 6.12 | Google sign-in cancelled or fails | Better Auth redirects to `/login?error=…`; the page shows a readable message. | Handled + tested |
| 6.13 | Same email arrives from a second sign-in method | Account linking is explicit: only Google is trusted to link to an existing user with the same email. Any other method lands on `/login` with `account_not_linked`. Adding a provider means adding it to `trustedProviders` on purpose. | Handled + tested |
| 6.14 | Sole owner deletes their account | Memberships cascade, so the store would be left with no owner. Better Auth's `deleteUser` runs a `beforeDelete` check and refuses while the user is the only owner of any store, naming how many. There is no delete-account screen yet; the check guards the API. | Handled + tested |
| 6.15 | Signed out in another tab | Next server request has no session and redirects to `/login`. Open client state is discarded. | Handled + tested |
| 6.16 | Google client ID/secret missing | Better Auth logs a warning at boot; the sign-in button shows the error instead of hanging. | Handled + tested |
| 6.17 | Inviting teammates to a store | Not built. Roles exist (`owner`, `member`) so invites can be added without a migration. | Not handled (single-owner stores for now) |

## 7. Server-side checks

Nothing the browser sends is trusted. These apply to every API route, server action and worker job.

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 7.1 | Request hits an API route or server action directly, skipping the UI | Every handler resolves the session or API key itself (`withStore` on every API route). Middleware is never the only check. | Handled + tested |
| 7.2 | Request sends a `store_id` for someone else's store | `store_id` is never read from the body or query. It comes from the session + membership lookup or the API key. Every query on store data filters by it. | Handled + tested |
| 7.3 | Request for another store's import/product by ID (`/imports/imp_123`) | Looked up by `(id, store_id)`; a miss returns 404, not 403, so IDs from other stores cannot be probed. | Handled + tested |
| 7.4 | Malformed or extra fields in a request body | zod schema per handler; unknown keys stripped; errors return 400 with field messages, never a stack trace. | Handled + tested |
| 7.5 | Cross-site request forgery | Better Auth checks `Origin` against trusted origins; Next.js server actions reject a mismatched `Origin`/`Host`. Session cookie is `SameSite=Lax`. | Handled + tested |
| 7.6 | Brute force / abuse of auth endpoints | Better Auth's rate limiter, always on, stored in Redis through an atomic counter so limits hold across instances: 100 requests a minute per IP overall, 10 social sign-ins and 20 callbacks a minute, 3 account deletions an hour. | Handled + tested |
| 7.7 | Upload or API flood from one store or key | Fixed-window limits in Redis: 1,200 API requests a minute per store, 600 per API key, 5,000 uploads an hour per store; over the limit returns 429 with `Retry-After`. At most 3 imports run at once per store. If Redis is down the limiter lets requests through rather than taking the API down. | Handled + tested |
| 7.8 | Uploaded file lies about its type, or a ZIP entry is named `../../etc/passwd` | Type from magic bytes; size limits enforced while streaming, not after; ZIP entry names normalised and rejected if they escape the target; stored under random keys, never the user's filename. | Handled + tested |
| 7.9 | Large upload through a server action | Server actions keep the 1 MB body limit. Files go through a streaming upload route or presigned URL. | Handled + tested |
| 7.10 | API key leaked or guessed | Keys are `cf_` + 192 random bits, stored only as SHA-256 hashes with a visible prefix, shown once, scoped to one store, revocable, `last_used_at` tracked. A key cannot create keys or manage webhooks (session only). | Handled + tested |
| 7.11 | Webhook URL points at `localhost`, `169.254.169.254` or a private range (SSRF) | Rejected at creation (https only, no credentials, no private IP literals). At delivery every resolved address is checked inside the socket `lookup`, so DNS rebinding cannot slip a private IP in; redirects are not followed; 10 s timeout. Body signed `HMAC-SHA256(secret, "<t>.<body>")` in `x-catalogforge-signature`. `WEBHOOKS_ALLOW_PRIVATE=true` only for local development. | Handled + tested |
| 7.12 | Secret reaches the browser | `ANTHROPIC_API_KEY`, `BETTER_AUTH_SECRET`, `DATABASE_URL` have no `NEXT_PUBLIC_` prefix; server modules import `server-only`. Env is validated with zod at boot in both processes (`instrumentation.ts` for the app, worker start for the worker), so a missing or short secret fails at start, not mid-import. | Handled + tested |
| 7.13 | Logs capture secrets or merchant data | Logs carry IDs, counts and error codes. The log writer also scrubs every line: fields named like secrets, tokens, prompts, cells or descriptions are replaced, and Anthropic keys, `cf_` API keys, bearer tokens and passwords in URLs are masked inside messages. | Handled + tested |
| 7.14 | Worker job payload tampered in Redis | Jobs carry IDs only (`import_id`, `group_key`, `stage`); the worker re-reads data and the store from Postgres. | Handled + tested |

## 8. Infrastructure (Postgres, Redis)

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 8.1 | Redis restarts | AOF persistence (`appendfsync everysec`), so at most about a second of queue writes is lost. Postgres is the source of truth for row state: a reconciler re-enqueues rows that are `pending`/`processing` with no live job. | Handled + tested |
| 8.2 | Redis runs out of memory | `maxmemory-policy noeviction`: BullMQ keys are never silently evicted; writes fail loudly and enqueue retries. | Handled + tested |
| 8.3 | Redis down at upload time | Import is written to Postgres as `queued` first (outbox); enqueue happens after, and the reconciler retries it. The upload does not fail. | Handled + tested |
| 8.4 | Worker dies while holding a job | BullMQ stalled-job detection re-queues it after the lock expires; after `maxStalledCount` it fails with a reason. Jobs are idempotent (3.4). | Handled + tested |
| 8.5 | Finished jobs pile up in Redis | `removeOnComplete` / `removeOnFail` with age and count caps. History lives in Postgres. | Handled + tested |
| 8.6 | Postgres connections run out | One pool per process (reused across hot reloads in dev), capped by `DB_POOL_MAX` (default 10) so imports cannot starve the app. | Handled + tested |
| 8.7 | Schema change on deploy | `pnpm db:migrate` runs before the new code starts. Both the app and the worker compare `drizzle/meta/_journal.json` with the applied migrations at boot and refuse to start, naming the missing ones, if the database is behind. Changes are additive first, destructive later. | Handled + tested |
| 8.8 | Many dashboard tabs open on live progress | `GET /api/imports/stream` (SSE) is scoped to the signed-in user's active store. Each app process holds one Redis subscriber and fans events out in memory, so connections do not each open a Redis connection. 15 s heartbeat keeps proxies from closing idle streams; the browser reconnects after 3 s. | Handled + tested |
| 8.9 | Webhook endpoint down or slow | Each delivery is a queue job retried up to 8 times with jittered backoff; every attempt is logged with status, duration and error. Disabled endpoints receive nothing. | Handled + tested |

## 9. Translation

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 9.1 | A translated field fails the validator on every attempt (lost token, changed number, broken HTML) | The fields that passed are saved; the failing ones are retried with the job and, after the last attempt, left untranslated and logged with the reason. The storefront shows English for those fields only (5.2) and the Metrics coverage shows the gap. A bad translation is never stored. | Handled + tested |
| 9.2 | AI translation finishes after the merchant already fixed that field by hand | The translation upsert only overwrites rows whose origin is `ai`, so a late AI result can never replace a manual fix. | Handled + tested |
| 9.3 | Merchant edits the English while its translation job is still queued | The job re-reads the product from Postgres when it runs and hashes the current English, so it translates the edited text, not the text from when it was queued. | Handled + tested |
| 9.4 | SEO title and description per language | Generated with the product (meta title cut to 70 characters, description to 170), translated with the other fields, editable per language. Manual SEO edits follow the same manual-wins and Out of date rules as other fields (4.3). | Handled + tested |
| 9.5 | Translation of a deleted or failed product | Skipped: the translate job checks the product is live and not failed before calling the model, so no money is spent on it. | Handled + tested |
| 9.6 | A store wants a language other than German and French (Spanish, Italian) | The supported locales are fixed in code (`de`, `fr`) and every other country gets English (5.3). | Not handled (adding a locale means adding it to the locale map and the translate prompt; the data model already stores translations per locale) |

## 10. Dashboard, review and export

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 10.1 | Merchant edits a price to `12.5`, `-3` or a currency the store does not use | The edit API takes integer cents only (1 to 100,000,000) and a currency from the allowlist (EUR, GBP, USD, CHF); anything else returns 400 with the field message. Weights are integer grams. | Handled + tested |
| 10.2 | Bulk approve with failed products in the selection | Failed products are never approved; the rest are approved and the storefront cache is cleared. Products in **Needs review** can be approved: the merchant has looked at them, and the review reason is cleared. | Handled + tested |
| 10.3 | Export with rows selected, or with a filter or search active | Exports the selected products; with nothing selected, exactly the rows the current filter and search show. CSV, JSON and Shopify CSV all go through the same selection. | Handled + tested |
| 10.4 | Shopify CSV for products with one variant, several options, or a draft status | One row per variant, product fields only on the first row, `Default Title` when there are no options, `Published` true only for approved products, weights in grams. | Handled + tested |
| 10.5 | Merchant cancels a running import | Rows already finished are kept; pending groups and rows end **Failed** with "Import cancelled before this row was processed", so the counts still add up to the sheet. Jobs already in the queue see the cancelled status and stop without calling the model. | Handled + tested |
| 10.6 | Merchant deletes an import that is still running | Refused with "Cancel the import before deleting it". | Handled + tested |
| 10.7 | Retry on an import whose failed rows have no product group (no title, no description) | Refused with "Nothing to retry: failed rows without a product group … need a fixed sheet". Retrying cannot fix missing source data, so it does not pretend to. | Handled + tested |
| 10.8 | Retry on an import that failed before parsing (Redis down, bad file read) | The parse step runs again from the stored upload; nothing is uploaded twice. | Handled + tested |
| 10.9 | Products table with 10,000 products | The full product list is loaded into the browser once, then paged (10 / 25 / 50 / 100), sorted and filtered there. Fine for tens of thousands; the payload grows with the catalog. | Not handled (server-side paging is the fix past ~50k products; see the README write-up) |

## 11. Cost and metrics

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 11.1 | Import goes over its AI budget (2.12) | Paused with the spend shown. Raising the budget needs a signed-in merchant (API keys cannot), must be above what was already spent, and re-queues the pending groups. | Handled + tested |
| 11.2 | "Money saved" would show a negative number (strong model cheaper on a day, or a mock run) | Savings are measured per call against running the same tokens on the strong model and floored at zero per day. | Handled + tested |
| 11.3 | Failed and retried calls in the cost total | Every call is recorded with its model, tokens, latency and error code. A failed call that still used tokens (invalid JSON, cut-off output) is charged, because the provider charges it; one that never reached the model (429, timeout) costs nothing. A retry that reuses a stored result (3.5) is not charged twice. | Handled + tested |
| 11.4 | Metrics for a store with no imports yet | Every chart and rate renders empty with zero values; no division by zero, no error. | Handled + tested |

## 12. Live demo and deliverables

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 12.1 | Someone runs the app without an Anthropic key | `AI_MODE` defaults to `mock` when `ANTHROPIC_API_KEY` is empty: the whole pipeline (parse, clean, group, route, build, translate, review, storefront) runs with deterministic output and zero cost. | Handled + tested |
| 12.2 | `AI_MODE=anthropic` set without a key | Env validation fails at boot with "AI_MODE=anthropic needs ANTHROPIC_API_KEY" instead of failing every row later. | Handled + tested |
| 12.3 | Reviewers import their own messy files, not our samples | Nothing is tuned to the sample files: header synonyms in three languages, content-based price detection (1.37), unknown columns kept, every unclear case sent to **Needs review** with a reason rather than guessed. `evals/edge` holds broken, oversized and malicious files to try first. | Handled + tested |
| 12.4 | The demo host restarts or redeploys during an import | Same path as 3.4: the reconciler re-enqueues unfinished groups on start. Uploads live on the persistent disk (`STORAGE_DIR`), so the sheet and photos are still there. | Handled + tested |
| 12.5 | Showing rate limits, outages and bad JSON in the recording without waiting for a real 429 | `scripts/fake-anthropic.py` stands in for the API and fails on purpose (`MODE=429`, `529`, `401`, `timeout`, `badjson`, `refusal`, `maxtokens`). | Handled + tested |
| 12.6 | Sample data for testers | `evals/` ships small, medium, large (10,000 rows, 2,000 photos) and staged 1 → 10,000-row sets with labels, plus `evals/edge` for failure cases; `scripts/generate_evals.py` rebuilds them. | Handled + tested |
