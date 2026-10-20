# EDGE-CASES.md

Everything that can go wrong in CatalogForge, what the app does about it, and where each case stands.
Written before the implementation and kept up to date while building.

Status values:

- **Handled + tested**: behaviour implemented and covered by an automated test.
- **Handled, not tested**: behaviour implemented, no automated test yet.
- **UI only**: the frontend shows the state; the backend that produces it is not built yet.
- **Planned**: designed, not implemented.
- **Not handled**: out of scope, with the reason.

At this stage only the frontend exists, so nothing is "Handled + tested" yet.

---

## 1. Messy input

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 1.1 | File is not CSV/XLSX/ZIP/image (e.g. `.numbers`, `.pdf`) | Rejected in the browser before upload, with the file name and the accepted types. Re-checked server side by magic bytes, not extension. | UI only |
| 1.2 | Sheet over the size limit (25 MB) or a photo over 10 MB | Rejected with the exact limit and the file's actual size. | UI only |
| 1.3 | More than 10,000 rows or 2,000 photos | Import is refused at parse time with the counted number, before any AI spend. Partial imports are not started silently. | Planned |
| 1.4 | Corrupt XLSX / truncated CSV / zip bomb | Import ends **Failed** with "Could not read the file" and the parser error. ZIP extraction is capped on total uncompressed size and entry count. | Planned |
| 1.5 | Broken encoding (`TerracottaÂ Topf`, `GrÃ¼n`) | Detect encoding (BOM, chardet-style heuristics), try Windows-1252 → UTF-8 repair, record the repair on the row. | Planned |
| 1.6 | Header row is not the first row, or headers are in German (`Preis`, `Farbe`) | Header detection scans the first 20 rows; a synonym map covers EN/DE/FR column names. Unknown columns are kept as raw attributes, never dropped. | Planned |
| 1.7 | Prices like `1.299,00 €`, `12.5`, `£8`, `EUR 9`, `9,-` | Parsed to integer cents + ISO currency. Decimal separator inferred per value, then checked against the sheet's dominant locale. Never stored as a float. | Planned |
| 1.8 | Price missing or `0` | Variant gets no price; product goes to **Needs review** with "No price for {variant}". Never invented. | UI only |
| 1.9 | Price with no currency symbol | Uses the sheet-level default currency chosen at upload; the row records that a default was applied. | Planned |
| 1.10 | Mixed units (`20cm`, `8 in`, `1.8kg`, `4 lbs`) | Normalised to cm and grams as integers. Original value kept on the source row for the review screen. | Planned |
| 1.11 | Colour typos (`terracota`, `antrazit`) | Fuzzy match against a colour vocabulary (edit distance ≤ 2); a fix below a threshold is applied, anything else goes to the AI with the raw value and lowers confidence. | Planned |
| 1.12 | Same product split across rows (one row per size/colour) | Grouped by normalised parent SKU, then by normalised title + brand. Each row becomes a variant. `source_rows` lists every row used. | UI only |
| 1.13 | Exact duplicate rows | Collapsed into one; the duplicate row ends **Done** with "Duplicate of row N" so counts still add up. | Planned |
| 1.14 | Duplicate SKU with conflicting data (two prices for `TC-PL-20`) | Not merged silently. Product goes to **Needs review** with both values and their row numbers. | UI only |
| 1.15 | Rows out of order (variant before its parent) | Grouping runs after the whole sheet is parsed, so order does not matter. | Planned |
| 1.16 | Required fields missing (no title, no SKU) | No SKU: a deterministic SKU is derived from the row hash and flagged. No title and no description: row **Failed**, "Not enough information to build a product". | Planned |
| 1.17 | Huge descriptions (100 KB of HTML) | Sanitised, then truncated to a token budget before the AI call; the review screen states that the source was truncated. | Planned |
| 1.18 | HTML with `<script>`, `onerror=`, `javascript:` links, inline styles | Sanitised with an allowlist (p, ul, ol, li, strong, em, br, a[href=http(s)]). Done before AI and again on AI output before storage. | Planned |
| 1.19 | Formula injection in exports (`=HYPERLINK(...)`) | CSV export prefixes cells that start with `= + - @` with a quote. | Planned |
| 1.20 | Photo with no matching row | Listed under "Unmatched photos" on the import, not attached anywhere. Merchant can attach manually. | UI only |
| 1.21 | Row references a photo that was not uploaded | Product built without it; warning on the product, not a failure. | Planned |
| 1.22 | Photo filenames that match several products (`IMG_0001.jpg`) | Match by SKU in filename first, then by explicit image column. Ambiguous matches are not guessed; the photo stays unmatched. | Planned |
| 1.23 | Same photo uploaded twice under different names | Deduplicated by content hash. | Planned |
| 1.24 | Supplier text in German or mixed languages | Detected per field; passed to the AI as source language, English output generated, original kept as the claim source. | Planned |
| 1.25 | Qualified claims ("frost-resistant (not frost-proof, bring indoors below 0 °C)") | The qualifier is part of the claim; the AI must not drop it. A validator checks that negations in the source are not inverted in the output. | Planned |

## 2. AI problems

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 2.1 | Model returns invalid JSON | Validated against a schema (zod). One repair retry with the validation error in the prompt, then exponential backoff retries, then row **Failed** with "Model output did not match the schema". | Planned |
| 2.2 | Model invents a claim (`organic`, `dishwasher-safe`) | Every claim must cite a source row and column. A post-check verifies the cited text actually contains the claim (normalised substring / synonym match). Unsupported claims are removed and the product goes to **Needs review**. | UI only |
| 2.3 | Model changes a price, SKU or weight | Prices, SKUs and weights never come from the model; they come from the cleaning step. The model output for those fields is ignored. | Planned |
| 2.4 | Low confidence on a field | Fields under 70% are highlighted; any required field under 70% sends the product to **Needs review** with the field name as the reason. | UI only |
| 2.5 | Category not in the taxonomy | Validated against the allowed taxonomy; unknown category → **Needs review**, "Category not recognised". | UI only |
| 2.6 | Timeout | Treated as retryable. Exponential backoff with jitter, max 5 attempts, then **Failed** with the last error. | Planned |
| 2.7 | Rate limit (429) | The whole import queue pauses until the `retry-after` time. UI shows "Paused, resuming in X minutes". No attempts are burned while paused. | UI only |
| 2.8 | Provider down (5xx for minutes) | Circuit breaker opens after N failures; import pauses instead of failing every row. Resumes automatically when a probe succeeds. | Planned |
| 2.9 | Batch API job takes hours or partially fails | Batch results are reconciled per item; failed items re-enter the normal queue. | Planned |
| 2.10 | Model output contains HTML/script | Sanitised with the same allowlist as input. | Planned |
| 2.11 | Prompt injection in supplier text ("ignore previous instructions") | Supplier text is passed as data in a delimited field, never as instructions. Output is schema-validated and claims are source-checked, which limits the damage. | Planned |
| 2.12 | Cost runaway (retry storm, huge rows) | Per-import token budget; the import pauses and asks the merchant when it is exceeded. | Planned |

## 3. Scale

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 3.1 | 10,000-row import | Upload stores the file and returns immediately. Parsing and AI run in a durable background queue in batches. | UI only |
| 3.2 | Same file uploaded twice | File hash identifies it; each row has a content hash. Unchanged rows are skipped, changed rows update existing products (matched by SKU). No duplicates. | Planned |
| 3.3 | Two imports at once for the same store | Both run; product upserts are keyed by (store, SKU) with a unique constraint, so a race cannot create two products. Last writer wins per field, merchant edits are never overwritten. | Planned |
| 3.4 | Server restarts mid-import | Every row's state is persisted. Jobs are idempotent and keyed by (import, row group). On restart, in-flight jobs are re-queued; completed ones are skipped. | Planned |
| 3.5 | Worker crashes after the AI call but before saving | The AI result is stored with the job key before the product write; the retry reuses it instead of paying again. | Planned |
| 3.6 | Row counts do not add up | Invariant: done + needs review + failed + pending = total rows. Checked at import completion; a mismatch is logged and shown. | UI only |
| 3.7 | Storefront under load during a big import | Storefront reads only published, pre-translated data, served from cache. Workers run in separate processes with a capped DB pool. | Planned |
| 3.8 | Browser tab closed during upload | Resumable/chunked upload is not built; the merchant re-uploads. Because of 3.2 that is safe. | Not handled (re-upload is idempotent) |

## 4. Later changes

| # | What happens | What the app does | Status |
| --- | --- | --- | --- |
| 4.1 | Merchant edits a product field | Field marked as manual. Later imports and AI re-runs never overwrite a manual field. | UI only |
| 4.2 | English text changes after translation | Only the changed field is re-translated (per-field source hash). | Planned |
| 4.3 | Merchant fixed a translation, then English changes | The manual translation is kept and marked **Out of date**. It is not replaced by the AI. | UI only |
| 4.4 | Merchant deletes a product, then re-uploads the sheet | Deletion is a tombstone keyed by SKU; the re-import does not resurrect it and reports "Skipped: deleted by merchant". | Planned |
| 4.5 | Merchant sends a product back for re-generation | Product goes back to the queue with the merchant's note added to the prompt; manual fields are still locked. | UI only |
| 4.6 | Variant removed from the new sheet | Not deleted automatically; flagged "Missing from latest import" for review. | Planned |

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
