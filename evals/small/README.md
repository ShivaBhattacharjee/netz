# Small eval set

Small, hand-checkable import for reviewing the pipeline before the large sets.

| File | What it is |
| --- | --- |
| supplier-sheet.csv | 21 data rows, UTF-8 with BOM, two junk lines above the header, mixed German/English headers |
| supplier-sheet.xlsx | Same data as XLSX, sheet "Artikel" |
| photos/ | 10 generated JPGs plus a duplicate, a corrupt file and a .txt |
| photos.zip | Everything in photos/ zipped |
| labels.json | Ground truth: grouping, variants, prices in cents, allowed and forbidden claims, expected status |

What it exercises: header not on row 1, rows out of order, an exact duplicate row, the same SKU with two prices,
prices like `1.299,00 €`, `19.9`, `£24`, `EUR 34.00` and a missing price, sizes in inches and `0,35 l`, weights in lbs and oz,
colour typos (`terracota`, `antrazit`, `natrual`), mojibake (`GrÃ¼n`), `<script>` and `onclick` in descriptions,
a qualified claim that must keep its qualifier, a formula in a cell, a row with too little data to build a product,
and photos that are unmatched, ambiguous, duplicated or broken.

Regenerate with `python3 scripts/generate_evals.py`.
