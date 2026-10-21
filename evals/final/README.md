# Final staged run

Run these in order. Only move to the next stage when the current one looks right.

| Stage | Rows | Photos | What to check |
| --- | --- | --- | --- |
| 1-row/ | 1 | 3 | One messy row through clean → AI → display. Every value is in labels.json and the stage README |
| 100-rows/ | 100 | 3 per product | Grouping, variants, review reasons, photos on every product |
| 1000-rows/ | 1,000 | 3 per product | Queue throughput, cost per product, review flow at volume |
| 10000-rows/ | 10,000 | 2,000 (the per-import cap) | Background processing, pause/resume, storefront load |

Every stage uses front, detail and side photos per product (the 10,000-row stage covers as many products as the
2,000-photo cap allows). The front photo should be the main image everywhere.

Each stage is also listed as an eval set (`final/<stage>`) on the Evaluations page.
