"""Generate labelled, deliberately messy supplier imports for testing the pipeline.

Usage: python3 scripts/generate_evals.py [small|medium|large|edge|final ...]
Writes to evals/<set>/ (gitignored). With no arguments every set is generated.
"""

import csv
import json
import random
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
EVALS = ROOT / "evals"

PREAMBLE = [
    ["Lieferant: Keramik Müller GmbH", "", "", "", "", "", "", "", ""],
    ["Export vom 12.10.2026", "", "", "", "", "", "", "", ""],
]
HEADER = ["Artikelnr", "Bezeichnung", "Size", "Farbe", "Preis", "Gewicht", "Notes", "Beschreibung", "Bild"]
FIRST_DATA_ROW = len(PREAMBLE) + 2

ROWS = [
    ["TC-PL-20", "Pflanztopf Terracota handgedreht", "20cm", "terracota", "24,99 €", "1,8 kg",
     "frost-resistant (not frost-proof, bring indoors below 0 °C)",
     '<p onclick="track()">Handgedrehter Topf aus Terrakotta mit Abzugsloch.</p><script>alert(1)</script>', "TC-PL-20_front.jpg"],
    ["MG-ST-250-WH", "Stoneware Mug", "250ml", "white", "12.99", "320g", "dishwasher safe", "<p>Glazed stoneware mug.</p>", ""],
    ["TC-PL-30", "Pflanztopf Terracota handgedreht", "11.8 in", "terracotta", "", "7.3 lbs", "", "", ""],
    ["MG-ST-250-CH", "Stoneware Mug", "250ml", "charcoal", "12.99", "320g", "dishwasher safe", "", ""],
    ["MG-ST-350-WH", "Stoneware Mug", "350 ml", "white", "14.99", "410g", "dishwasher safe", "", "MG-ST-350-WH.jpg"],
    ["MG-ST-350-WH", "Stoneware Mug", "350 ml", "white", "14.99", "410g", "dishwasher safe", "", "MG-ST-350-WH.jpg"],
    ["MG-ST-350-CH", "Stoneware Mug", "0,35 l", "antrazit", "14.99", "410g", "", "", ""],
    ["VS-GL-18", "Glass Vase", "18cm", "sage", "29,99 €", "700g", "each piece handmade, small variations", "<p>Mouth-blown glass vase.</p>", "VS-GL-18.jpg"],
    ["VS-GL-28", "Glass Vase", "11 inch", "sage", "39,99 €", "1.4 kg", "", "", ""],
    ["VS-GL-18", "Glass Vase", "18cm", "sage", "31.50", "700g", "", "", ""],
    ["CU-LN-40", "Leinen Kissenbezug", "40x40", "natrual", "£24", "180g", "wash 40 deg", "<p>Stonewashed linen cover, zip closure.</p>", "CU-LN-40.jpg"],
    ["CU-LN-50", "Leinen Kissenbezug", "20 x 20 in", "natural", "EUR 34.00", "240g", "", "", ""],
    ["CN-SY-180", "Soy Candle Fig", "180g", "white", "19.9", "260g", "vegan, no animal products", "<p>Hand-poured soy wax candle. Burn time 40h.</p>", "CN-SY-180.jpg"],
    ["CN-SY-320", "Soy Candle Fig", "11.3 oz", "white", "29,90 €", "450g", "", "", ""],
    ["BK-SG-S", "Korb Seegras", "small", "natur", "22,99 €", "0.9 lbs", "handwoven in Vietnam", "<p>Geflochtener Korb aus Seegras mit Griffen.</p>", ""],
    ["BK-SG-M", "Korb Seegras", "M", "natur", "27,99 €", "650g", "", "", ""],
    ["BK-SG-L", "Korb Seegras", "Large", "natur", "32,99 €", "900 g", "", "", ""],
    ["TH-WL-01", "Wool Throw", "130x170cm", "GrÃ¼n", "79,00 €", "1.1kg", "=HYPERLINK(\"http://evil.example\",\"click\")", "<p>Merino wool throw.</p>", ""],
    ["TC-PL-12", "Terracotta planter hand thrown", "12 cm", "Natural", "14.5", "600g", "", "", "TC-PL-12.jpg"],
    ["XX-000-1", "", "", "", "9.99", "", "", "", ""],
    ["LP-CE-32", "Tischleuchte Keramik", "32cm", "ochre", "1.299,00 €", "2,1 kg", "E27, bulb not incl.", "<p>Ceramic table lamp with linen shade.</p>", ""],
]


def row_number(index: int) -> int:
    return FIRST_DATA_ROW + index


def src(index: int, column: str) -> str:
    return f"row {row_number(index)}, column {column}"


LABELS = {
    "file": "supplier-sheet.csv",
    "header_row": len(PREAMBLE) + 1,
    "total_rows": len(ROWS),
    "products": [
        {
            "group": "TC-PL",
            "source_rows": [row_number(0), row_number(2), row_number(18)],
            "category": "Home & Garden > Planters",
            "attributes": {"material": "terracotta", "color": "terracotta"},
            "variants": [
                {"sku": "TC-PL-12", "options": {"size": "12 cm"}, "price_cents": 1450, "currency": "EUR", "weight_grams": 600},
                {"sku": "TC-PL-20", "options": {"size": "20 cm"}, "price_cents": 2499, "currency": "EUR", "weight_grams": 1800},
                {"sku": "TC-PL-30", "options": {"size": "30 cm"}, "price_cents": None, "currency": "EUR", "weight_grams": 3311},
            ],
            "allowed_claims": [
                {"text": "frost-resistant", "source": src(0, "Notes"), "must_keep_qualifier": "not frost-proof, bring indoors below 0 °C"},
                {"text": "drainage hole", "source": src(0, "Beschreibung")},
                {"text": "hand-thrown", "source": src(0, "Bezeichnung")},
            ],
            "forbidden_claims": ["frost-proof", "weatherproof", "glazed"],
            "expected_status": "needs_review",
            "expected_review_reason": "No price for size 30 cm",
            "photos": ["TC-PL-20_front.jpg", "TC-PL-20_top.jpg", "TC-PL-12.jpg"],
            "notes": "Rows out of order, German name, colour typo, inches and lbs, script and onclick must be stripped.",
        },
        {
            "group": "MG-ST",
            "source_rows": [row_number(1), row_number(3), row_number(4), row_number(6)],
            "duplicate_rows": [{"row": row_number(5), "duplicate_of": row_number(4)}],
            "category": "Kitchen & Dining > Mugs",
            "attributes": {"material": "stoneware"},
            "variants": [
                {"sku": "MG-ST-250-WH", "options": {"size": "250 ml", "color": "white"}, "price_cents": 1299, "currency": "EUR", "weight_grams": 320},
                {"sku": "MG-ST-250-CH", "options": {"size": "250 ml", "color": "charcoal"}, "price_cents": 1299, "currency": "EUR", "weight_grams": 320},
                {"sku": "MG-ST-350-WH", "options": {"size": "350 ml", "color": "white"}, "price_cents": 1499, "currency": "EUR", "weight_grams": 410},
                {"sku": "MG-ST-350-CH", "options": {"size": "350 ml", "color": "charcoal"}, "price_cents": 1499, "currency": "EUR", "weight_grams": 410},
            ],
            "allowed_claims": [{"text": "dishwasher-safe", "source": src(1, "Notes")}],
            "forbidden_claims": ["microwave-safe", "handmade"],
            "expected_status": "ready",
            "photos": ["MG-ST-350-WH.jpg"],
            "notes": "Exact duplicate row, 0,35 l means 350 ml, antrazit is charcoal, no currency symbol on 12.99.",
        },
        {
            "group": "VS-GL",
            "source_rows": [row_number(7), row_number(8), row_number(9)],
            "category": "Home & Garden > Vases",
            "attributes": {"material": "glass", "color": "sage"},
            "variants": [
                {"sku": "VS-GL-18", "options": {"size": "18 cm"}, "price_cents": None, "currency": "EUR", "weight_grams": 700},
                {"sku": "VS-GL-28", "options": {"size": "28 cm"}, "price_cents": 3999, "currency": "EUR", "weight_grams": 1400},
            ],
            "allowed_claims": [{"text": "handmade", "source": src(7, "Notes")}],
            "forbidden_claims": ["dishwasher-safe"],
            "expected_status": "needs_review",
            "expected_review_reason": f"Two prices for SKU VS-GL-18 (rows {row_number(7)} and {row_number(9)})",
            "photos": ["VS-GL-18.jpg"],
            "notes": "Same SKU with conflicting prices must not be merged silently.",
        },
        {
            "group": "CU-LN",
            "source_rows": [row_number(10), row_number(11)],
            "category": "Home > Textiles > Cushions",
            "attributes": {"material": "linen", "color": "natural"},
            "variants": [
                {"sku": "CU-LN-40", "options": {"size": "40 × 40 cm"}, "price_cents": 2400, "currency": "GBP", "weight_grams": 180},
                {"sku": "CU-LN-50", "options": {"size": "50 × 50 cm"}, "price_cents": 3400, "currency": "EUR", "weight_grams": 240},
            ],
            "allowed_claims": [{"text": "washable at 40 °C", "source": src(10, "Notes")}],
            "forbidden_claims": ["OEKO-TEX certified", "organic"],
            "expected_status": "needs_review",
            "expected_review_reason": "Mixed currencies within one product (GBP and EUR)",
            "photos": ["CU-LN-40.jpg"],
            "notes": "Colour typo natrual, size in inches, pounds sterling on one variant only.",
        },
        {
            "group": "CN-SY",
            "source_rows": [row_number(12), row_number(13)],
            "category": "Home > Fragrance > Candles",
            "attributes": {"material": "soy wax", "color": "white", "scent": "fig"},
            "variants": [
                {"sku": "CN-SY-180", "options": {"size": "180 g"}, "price_cents": 1990, "currency": "EUR", "weight_grams": 260},
                {"sku": "CN-SY-320", "options": {"size": "320 g"}, "price_cents": 2990, "currency": "EUR", "weight_grams": 450},
            ],
            "allowed_claims": [
                {"text": "vegan", "source": src(12, "Notes")},
                {"text": "hand-poured", "source": src(12, "Beschreibung")},
                {"text": "40 hour burn time", "source": src(12, "Beschreibung")},
            ],
            "forbidden_claims": ["organic", "non-toxic", "paraffin-free"],
            "expected_status": "ready",
            "photos": ["CN-SY-180.jpg"],
            "notes": "19.9 means 19.90, 11.3 oz is about 320 g. Classic trap for an invented organic claim.",
        },
        {
            "group": "BK-SG",
            "source_rows": [row_number(14), row_number(15), row_number(16)],
            "category": "Home > Storage > Baskets",
            "attributes": {"material": "seagrass", "color": "natural"},
            "variants": [
                {"sku": "BK-SG-S", "options": {"size": "S"}, "price_cents": 2299, "currency": "EUR", "weight_grams": 408},
                {"sku": "BK-SG-M", "options": {"size": "M"}, "price_cents": 2799, "currency": "EUR", "weight_grams": 650},
                {"sku": "BK-SG-L", "options": {"size": "L"}, "price_cents": 3299, "currency": "EUR", "weight_grams": 900},
            ],
            "allowed_claims": [{"text": "handwoven", "source": src(14, "Notes")}],
            "forbidden_claims": ["fair trade", "waterproof"],
            "expected_status": "ready",
            "photos": [],
            "notes": "German description must become English output, small/M/Large normalised to S/M/L.",
        },
        {
            "group": "TH-WL",
            "source_rows": [row_number(17)],
            "category": "Home > Textiles > Throws",
            "attributes": {"material": "wool", "color": "green"},
            "variants": [{"sku": "TH-WL-01", "options": {"size": "130 × 170 cm"}, "price_cents": 7900, "currency": "EUR", "weight_grams": 1100}],
            "allowed_claims": [],
            "forbidden_claims": ["merino certified", "machine washable"],
            "expected_status": "ready",
            "photos": [],
            "notes": "Mojibake GrÃ¼n is Grün (green). Notes holds a formula that must be escaped on export.",
        },
        {
            "group": "LP-CE",
            "source_rows": [row_number(20)],
            "category": "Lighting > Table Lamps",
            "attributes": {"material": "ceramic", "color": "ochre"},
            "variants": [{"sku": "LP-CE-32", "options": {"size": "32 cm"}, "price_cents": 129900, "currency": "EUR", "weight_grams": 2100}],
            "allowed_claims": [{"text": "E27 fitting", "source": src(20, "Notes")}],
            "forbidden_claims": ["bulb included", "dimmable"],
            "expected_status": "ready",
            "photos": [],
            "notes": "1.299,00 € is 129900 cents, not 1299 or 129.9.",
        },
    ],
    "failed_rows": [{"row": row_number(19), "reason": "Not enough information to build a product (no title, no description)"}],
    "photos": {
        "matched": {
            "TC-PL-20_front.jpg": "TC-PL",
            "TC-PL-20_top.jpg": "TC-PL",
            "TC-PL-12.jpg": "TC-PL",
            "MG-ST-350-WH.jpg": "MG-ST",
            "VS-GL-18.jpg": "VS-GL",
            "CU-LN-40.jpg": "CU-LN",
            "CN-SY-180.jpg": "CN-SY",
        },
        "unmatched": ["IMG_0001.jpg", "DSC_4410.jpg", "mug.jpg"],
        "duplicate_content": {"TC-PL-20_copy.jpg": "TC-PL-20_front.jpg"},
        "invalid": {"broken.jpg": "not a valid image", "notes.txt": "unsupported type"},
    },
}

PALETTE = {
    "terracotta": (196, 98, 64),
    "white": (236, 233, 226),
    "charcoal": (70, 72, 76),
    "sage": (150, 168, 140),
    "natural": (214, 196, 160),
    "ochre": (204, 150, 60),
}


def draw_product(kind: str, color: tuple[int, int, int], seed: int) -> Image.Image:
    img = Image.new("RGB", (1200, 1200), (244 - seed % 8, 241 - seed % 6, 236))
    d = ImageDraw.Draw(img)
    shade = tuple(max(0, c - 40) for c in color)
    d.ellipse((330, 980, 870, 1060), fill=(220, 216, 208))
    if kind == "planter":
        d.polygon([(340, 420), (860, 420), (790, 1010), (410, 1010)], fill=color)
        d.rectangle((320, 380, 880, 440), fill=shade)
        d.polygon([(560, 560), (720, 380), (760, 400), (600, 580)], fill=(90, 130, 80))
    elif kind == "mug":
        d.rounded_rectangle((380, 470, 760, 1010), radius=40, fill=color)
        d.ellipse((700, 580, 920, 860), outline=color, width=48)
        d.ellipse((380, 440, 760, 500), fill=shade)
    elif kind == "vase":
        d.ellipse((380, 560, 820, 1010), fill=color)
        d.rectangle((520, 300, 680, 640), fill=color)
        d.ellipse((500, 270, 700, 330), fill=shade)
    elif kind == "cushion":
        d.rounded_rectangle((300, 380, 900, 980), radius=90, fill=color)
        d.line((300, 680, 900, 680), fill=shade, width=6)
    elif kind == "candle":
        d.rounded_rectangle((420, 520, 780, 1010), radius=24, fill=color)
        d.ellipse((420, 490, 780, 560), fill=shade)
        d.line((600, 440, 600, 520), fill=(40, 40, 40), width=8)
        d.ellipse((580, 380, 620, 450), fill=(240, 170, 60))
    return img


PHOTO_SPECS = [
    ("TC-PL-20_front.jpg", "planter", "terracotta"),
    ("TC-PL-20_top.jpg", "planter", "terracotta"),
    ("TC-PL-12.jpg", "planter", "natural"),
    ("MG-ST-350-WH.jpg", "mug", "white"),
    ("VS-GL-18.jpg", "vase", "sage"),
    ("CU-LN-40.jpg", "cushion", "natural"),
    ("CN-SY-180.jpg", "candle", "white"),
    ("IMG_0001.jpg", "vase", "ochre"),
    ("DSC_4410.jpg", "planter", "charcoal"),
    ("mug.jpg", "mug", "charcoal"),
]


def write_csv(path: Path, rows: list[list[str]], preamble: list[list[str]] = PREAMBLE) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerows(preamble)
        w.writerow(HEADER)
        w.writerows(rows)


def col_letter(i: int) -> str:
    s = ""
    i += 1
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def write_xlsx(path: Path, data: list[list[str]], preamble: list[list[str]] = PREAMBLE) -> None:
    rows = preamble + [HEADER] + data
    sheet_rows = []
    for r, values in enumerate(rows, start=1):
        cells = "".join(
            f'<c r="{col_letter(c)}{r}" t="inlineStr"><is><t xml:space="preserve">{escape(v)}</t></is></c>'
            for c, v in enumerate(values)
            if v != ""
        )
        sheet_rows.append(f'<row r="{r}">{cells}</row>')
    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Artikel" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{"".join(sheet_rows)}</sheetData></worksheet>',
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name, body in files.items():
            z.writestr(name, body)


def zip_photos(photos: Path, target: Path) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(photos.iterdir()):
            z.write(p, p.name)


def write_small_photos(out: Path) -> None:
    photos = out / "photos"
    photos.mkdir(parents=True, exist_ok=True)
    for i, (name, kind, color) in enumerate(PHOTO_SPECS):
        draw_product(kind, PALETTE[color], i).save(photos / name, "JPEG", quality=85)
    (photos / "TC-PL-20_copy.jpg").write_bytes((photos / "TC-PL-20_front.jpg").read_bytes())
    (photos / "broken.jpg").write_bytes(b"\xff\xd8\xff\xe0not really a jpeg")
    (photos / "notes.txt").write_text("supplier notes, not an image\n")
    zip_photos(photos, out / "photos.zip")


SMALL_README = """# Small eval set

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
"""


def generate_small() -> None:
    out = EVALS / "small"
    out.mkdir(parents=True, exist_ok=True)
    write_csv(out / "supplier-sheet.csv", ROWS)
    write_xlsx(out / "supplier-sheet.xlsx", ROWS)
    write_small_photos(out)
    (out / "labels.json").write_text(json.dumps(LABELS, indent=2, ensure_ascii=False) + "\n")
    (out / "README.md").write_text(SMALL_README)


# ---------------------------------------------------------------------------
# Procedural sets (medium, large)

TYPES = [
    {
        "kind": "planter", "en": "Planter", "de": "Pflanztopf", "category": "Home & Garden > Planters",
        "materials": [("terracotta", "Terrakotta"), ("stoneware", "Steinzeug"), ("concrete", "Beton")],
        "colors": ["terracotta", "natural", "charcoal", "sage"],
        "sizes": [("12 cm", 12, 600), ("20 cm", 20, 1800), ("30 cm", 30, 4200)], "unit": "cm", "base": 1499,
        "claims": [("frost-resistant", "frost-resistant (not frost-proof, bring indoors below 0 °C)"), ("drainage hole", "with drainage hole")],
        "forbidden": ["frost-proof", "weatherproof", "UV-resistant"],
    },
    {
        "kind": "mug", "en": "Mug", "de": "Tasse", "category": "Kitchen & Dining > Mugs",
        "materials": [("stoneware", "Steinzeug"), ("porcelain", "Porzellan")],
        "colors": ["white", "charcoal", "sage", "ochre"],
        "sizes": [("250 ml", 250, 320), ("350 ml", 350, 410)], "unit": "ml", "base": 1299,
        "claims": [("dishwasher-safe", "spülmaschinenfest / dishwasher safe"), ("microwave-safe", "microwave ok")],
        "forbidden": ["lead-free", "handmade", "oven-safe"],
    },
    {
        "kind": "vase", "en": "Vase", "de": "Vase", "category": "Home & Garden > Vases",
        "materials": [("glass", "Glas"), ("stoneware", "Steinzeug")],
        "colors": ["sage", "natural", "ochre", "white"],
        "sizes": [("18 cm", 18, 700), ("28 cm", 28, 1400)], "unit": "cm", "base": 2499,
        "claims": [("handmade", "each piece handmade, small variations")],
        "forbidden": ["dishwasher-safe", "watertight guarantee"],
    },
    {
        "kind": "cushion", "en": "Cushion Cover", "de": "Kissenbezug", "category": "Home > Textiles > Cushions",
        "materials": [("linen", "Leinen"), ("cotton", "Baumwolle")],
        "colors": ["natural", "sage", "charcoal", "ochre"],
        "sizes": [("40 × 40 cm", 40, 180), ("50 × 50 cm", 50, 240)], "unit": "square", "base": 2999,
        "claims": [("washable at 40 °C", "wash 40 deg"), ("OEKO-TEX certified", "OEKO-TEX Standard 100 cert. no. 21.HUS.12345")],
        "forbidden": ["organic", "hypoallergenic"],
    },
    {
        "kind": "candle", "en": "Candle", "de": "Kerze", "category": "Home > Fragrance > Candles",
        "materials": [("soy wax", "Sojawachs")],
        "colors": ["white", "natural"],
        "sizes": [("180 g", 180, 260), ("320 g", 320, 450)], "unit": "g", "base": 1999,
        "claims": [("vegan", "vegan, no animal products")],
        "forbidden": ["organic", "non-toxic", "paraffin-free"],
    },
]

COLOR_WORDS = {
    "terracotta": ("terracotta", "Terrakotta", "terracota"),
    "natural": ("natural", "Natur", "natrual"),
    "charcoal": ("charcoal", "Anthrazit", "antrazit"),
    "sage": ("sage", "Salbei", "saeg"),
    "white": ("white", "Weiß", "whte"),
    "ochre": ("ochre", "Ocker", "ocher"),
}

LINES = ["Alba", "Fjord", "Olea", "Sora", "Mira", "Terra", "Nord", "Lumen", "Cala", "Rhea", "Vela", "Iris", "Kiva", "Lotta", "Juno"]


def raw_size(rng: random.Random, t: dict, label: str, value: int) -> str:
    unit = t["unit"]
    if unit == "cm":
        return rng.choice([f"{value}cm", f"{value} cm", f"{value / 2.54:.1f} in", f"{value / 2.54:.0f} inch"])
    if unit == "ml":
        return rng.choice([f"{value}ml", f"{value} ml", f"{value / 1000:.2f} l".replace(".", ",")])
    if unit == "g":
        return rng.choice([f"{value}g", f"{value / 28.35:.1f} oz"])
    return rng.choice([f"{value}x{value}", f"{value} x {value} cm", f"{value / 2.54:.0f} x {value / 2.54:.0f} in"])


def raw_weight(rng: random.Random, grams: int) -> tuple[str, int]:
    """Returns the cell text and the grams that text actually states, which is what the label must expect."""
    raw = rng.choice([f"{grams}g", f"{grams} g", f"{grams / 1000:g} kg", f"{grams / 1000:g} kg".replace(".", ","), f"{grams / 453.6:.1f} lbs"])
    if raw.endswith(" lbs"):
        return raw, round(float(raw[:-4]) * 453.59237)
    return raw, grams


def raw_price(rng: random.Random, cents: int) -> tuple[str, str]:
    euros = f"{cents / 100:.2f}"
    style = rng.random()
    if style < 0.35:
        return f"{euros.replace('.', ',')} €", "EUR"
    if style < 0.6:
        return euros.rstrip("0").rstrip(".") if rng.random() < 0.4 else euros, "EUR"
    if style < 0.8:
        return f"EUR {euros}", "EUR"
    if cents >= 100000:
        return f"{cents // 100:,},{euros[-2:]} €".replace(",", ".", 1), "EUR"
    return f"{euros.replace('.', ',')}€", "EUR"


VIEWS = ("_front", "_detail", "_side")


def view_image(kind: str, color: tuple[int, int, int], seed: int, view: str) -> Image.Image:
    img = draw_product(kind, color, seed)
    if view == "_detail":
        return img.crop((300, 300, 900, 900)).resize(img.size)
    if view == "_side":
        return ImageOps.mirror(draw_product(kind, tuple(max(0, c - 25) for c in color), seed + 3))
    return img


def build_bulk(name: str, target_rows: int, target_photos: int, seed: int, views: tuple[str, ...] | None = None) -> None:
    """With `views`, every product gets one photo per view until the photo budget runs out, and no photo noise is added."""
    rng = random.Random(seed)
    out = EVALS / name
    photos_dir = out / "photos"
    photos_dir.mkdir(parents=True, exist_ok=True)

    products = []
    rows: list[dict] = []
    index = 0
    while len(rows) < target_rows:
        index += 1
        t = rng.choice(TYPES)
        material, material_de = rng.choice(t["materials"])
        line = rng.choice(LINES)
        prefix = f"{line[:2].upper()}-{t['kind'][:3].upper()}-{index:05d}"
        sizes = t["sizes"][: rng.randint(1, len(t["sizes"]))]
        colors = rng.sample(t["colors"], 2) if rng.random() < 0.3 else [rng.choice(t["colors"])]
        german = rng.random() < 0.3
        name_text = f"{t['de']} {line} {material_de}" if german else f"{line} {material.title()} {t['en']}"
        claims = [c for c in t["claims"] if rng.random() < 0.6]
        description = f"<p>{line} {t['en'].lower()} in {material}.</p>"
        if rng.random() < 0.08:
            description += "<script>track()</script>"
        if rng.random() < 0.03:
            description = description * 400

        variants = []
        product_rows = []
        for color in colors:
            for size_label, size_value, grams in sizes:
                cents = t["base"] + (size_value // 10) * 500 + rng.choice([0, 0, 100, 200])
                sku = f"{prefix}-{size_value}" + (f"-{color[:2].upper()}" if len(colors) > 1 else "")
                price_raw, currency = raw_price(rng, cents)
                color_raw = COLOR_WORDS[color][1] if german else COLOR_WORDS[color][0]
                if rng.random() < 0.08:
                    color_raw = COLOR_WORDS[color][2]
                if rng.random() < 0.02:
                    color_raw = color_raw.encode("utf-8").decode("latin-1") if any(ord(ch) > 127 for ch in color_raw) else color_raw
                options = {"size": size_label}
                if len(colors) > 1:
                    options["color"] = color
                size_raw = raw_size(rng, t, size_label, size_value)
                weight_raw, weight_grams = raw_weight(rng, grams)
                variant = {"sku": sku, "options": options, "price_cents": cents, "currency": currency, "weight_grams": weight_grams}
                row = {
                    "cells": [sku, name_text, size_raw, color_raw, price_raw, weight_raw, "", "", ""],
                    "product": prefix,
                }
                variants.append(variant)
                product_rows.append(row)

        reason = None
        if rng.random() < 0.06:
            v = rng.choice(variants)
            v["price_cents"] = None
            next(r for r in product_rows if r["cells"][0] == v["sku"])["cells"][4] = ""
            reason = f"No price for size {v['options']['size']}"
        elif rng.random() < 0.03 and len(product_rows) > 0:
            v = variants[0]
            conflict = dict(product_rows[0])
            conflict = {"cells": list(product_rows[0]["cells"]), "product": prefix}
            conflict["cells"][4] = f"{(v['price_cents'] + 250) / 100:.2f}"
            product_rows.append(conflict)
            v["price_cents"] = None
            reason = f"Two prices for SKU {v['sku']}"

        first = product_rows[0]["cells"]
        first[6] = "; ".join(note for _, note in claims)
        first[7] = description
        if rng.random() < 0.01:
            first[6] = '=HYPERLINK("http://evil.example","click")'

        products.append({
            "group": prefix,
            "category": t["category"],
            "attributes": {"material": material, **({"color": colors[0]} if len(colors) == 1 else {})},
            "variants": variants,
            "allowed_claims": [{"text": text, "column": "Notes"} for text, _ in claims],
            "forbidden_claims": t["forbidden"],
            "expected_status": "needs_review" if reason else "ready",
            "expected_review_reason": reason,
            "kind": t["kind"],
            "color": colors[0],
            "rows": product_rows,
        })
        rows.extend(product_rows)

        if rng.random() < 0.03:
            dup = {"cells": list(product_rows[0]["cells"]), "product": prefix, "duplicate": True}
            rows.append(dup)

        if rng.random() < 0.01:
            rows.append({"cells": [f"XX-{index:05d}", "", "", "", "9.99", "", "", "", ""], "failed": True})

    rows = rows[:target_rows]
    rng.shuffle(rows)
    for i, row in enumerate(rows):
        row["row"] = FIRST_DATA_ROW + i

    kept = {r["product"] for r in rows if "product" in r}
    duplicates, failed = [], []
    first_row_of: dict[str, int] = {}
    for row in sorted(rows, key=lambda r: r["row"]):
        if row.get("failed"):
            failed.append({"row": row["row"], "reason": "Not enough information to build a product (no title, no description)"})
        elif row.get("duplicate"):
            duplicates.append(row)
        else:
            first_row_of.setdefault(row["cells"][0], row["row"])
    for dup in duplicates:
        dup["duplicate_of"] = first_row_of.get(dup["cells"][0])

    label_products = []
    counts = {"done": 0, "needs_review": 0, "failed": len(failed)}
    for p in products:
        if p["group"] not in kept:
            continue
        own = [r for r in rows if r.get("product") == p["group"] and not r.get("duplicate")]
        status = p["expected_status"]
        counts["done" if status == "ready" else "needs_review"] += len(own)
        variants = [v for v in p["variants"] if any(r["cells"][0] == v["sku"] for r in own)]
        attributes = p["attributes"]
        kept_colors = {v["options"]["color"] for v in variants if "color" in v["options"]}
        if len(kept_colors) == 1:
            # The row cut at target_rows left one colour, so colour is no longer an option but a product attribute.
            variants = [{**v, "options": {k: o for k, o in v["options"].items() if k != "color"}} for v in variants]
            attributes = {**attributes, "color": kept_colors.pop()}
        label_products.append({
            "group": p["group"],
            "source_rows": sorted(r["row"] for r in own),
            "category": p["category"],
            "attributes": attributes,
            "variants": variants,
            "allowed_claims": p["allowed_claims"],
            "forbidden_claims": p["forbidden_claims"],
            "expected_status": status,
            "expected_review_reason": p["expected_review_reason"],
        })
    counts["done"] += len(duplicates)

    photo_map: dict[str, str] = {}
    unmatched: list[str] = []
    duplicate_photos: dict[str, str] = {}
    kept_skus = {r["cells"][0] for r in rows if "product" in r}
    candidates = [p for p in products if p["group"] in kept]
    rng.shuffle(candidates)
    size = 800 if target_photos > 500 else 1000
    n = 0
    for p in candidates:
        if n + len(views or ()) > target_photos or (not views and n >= target_photos * 0.9):
            break
        sku = next(v["sku"] for v in p["variants"] if v["sku"] in kept_skus)
        for suffix in views or VIEWS[: rng.choices((1, 2, 3), weights=(25, 35, 40))[0]]:
            name_ = f"{sku}{suffix}.jpg"
            img = view_image(p["kind"], PALETTE[p["color"]], n, suffix).resize((size, size))
            img.save(photos_dir / name_, "JPEG", quality=80)
            photo_map[name_] = p["group"]
            n += 1
    while not views and n < target_photos - max(2, target_photos // 50):
        name_ = f"IMG_{n:04d}.jpg"
        draw_product(rng.choice(TYPES)["kind"], rng.choice(list(PALETTE.values())), n).resize((size, size)).save(photos_dir / name_, "JPEG", quality=80)
        unmatched.append(name_)
        n += 1
    matched_names = [] if views else list(photo_map)
    while n < target_photos and matched_names:
        original = rng.choice(matched_names)
        copy = f"copy_{n:04d}.jpg"
        (photos_dir / copy).write_bytes((photos_dir / original).read_bytes())
        duplicate_photos[copy] = original
        n += 1

    sheet = [r["cells"] for r in rows]
    write_csv(out / "supplier-sheet.csv", sheet)
    write_xlsx(out / "supplier-sheet.xlsx", sheet)
    zip_photos(photos_dir, out / "photos.zip")

    labels = {
        "file": "supplier-sheet.csv",
        "header_row": len(PREAMBLE) + 1,
        "total_rows": len(rows),
        "expected_row_counts": counts,
        "products": label_products,
        "duplicate_rows": [{"row": d["row"], "duplicate_of": d["duplicate_of"]} for d in duplicates],
        "failed_rows": failed,
        "photos": {"matched": photo_map, "unmatched": unmatched, "duplicate_content": duplicate_photos},
    }
    (out / "labels.json").write_text(json.dumps(labels, indent=1, ensure_ascii=False) + "\n")
    (out / "README.md").write_text(
        f"# {name.replace('/', ' ').title()} eval set\n\n"
        f"Generated with seed {seed}. {len(rows):,} rows, {len(label_products):,} products, {n:,} photos.\n\n"
        f"Expected row outcomes: {counts['done']:,} done, {counts['needs_review']:,} needs review, {counts['failed']:,} failed "
        f"(sum {sum(counts.values()):,}).\n\n"
        "Same kinds of mess as the small set, mixed at random: rows shuffled, German names, EU and prefixed prices, "
        "missing and conflicting prices, inches/oz/lbs, colour typos, mojibake, scripts in HTML, oversized descriptions, "
        "formula cells, exact duplicate rows, rows that should fail"
        + (
            f". Photos: {len(views)} per product ({', '.join(v.strip('_') for v in views)}) for {len(photo_map) // len(views):,} of {len(label_products):,} products, "
            "no unmatched or duplicate photos.\n"
            if views
            else f". Photos: 1 to 3 per product (front, detail, side) for {len({g for g in photo_map.values()}):,} products, plus unmatched and duplicated photos.\n"
        )
    )
    print(f"wrote evals/{name}: {len(rows):,} rows, {len(label_products):,} products, {n:,} photos")


# ---------------------------------------------------------------------------
# Edge cases: files that should be rejected or need special handling

def build_edge() -> None:
    out = EVALS / "edge"
    out.mkdir(parents=True, exist_ok=True)
    rng = random.Random(7)
    sample = ROWS[:4]
    expected = {}

    (out / "empty.csv").write_bytes(b"")
    expected["empty.csv"] = "Rejected before upload: the file is empty"

    write_csv(out / "header-only.csv", [], preamble=[])
    expected["header-only.csv"] = "Import fails: no data rows under the header"

    (out / "truncated-quotes.csv").write_text(",".join(HEADER) + '\nTC-PL-20,"Pflanztopf,20cm,terracota,"24,99 €\n')
    expected["truncated-quotes.csv"] = "Import fails with the parser error and line number, no partial import"

    with (out / "semicolon-cp1252.csv").open("w", encoding="cp1252", newline="") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(HEADER)
        for r in sample:
            w.writerow([c.replace("€", "EUR") if "€" in c else c for c in r])
    expected["semicolon-cp1252.csv"] = "Parses: semicolon delimiter detected, Windows-1252 decoded (°C in the Notes column intact)"

    big = [list(ROWS[1]) for _ in range(10_050)]
    for i, r in enumerate(big):
        r[0] = f"MG-ST-{i:05d}"
    write_csv(out / "too-many-rows.csv", big, preamble=[])
    expected["too-many-rows.csv"] = "Rejected: 10,050 rows, the limit is 10,000. Nothing processed, no AI spend"

    write_csv(out / "exactly-10000-rows.csv", big[:10_000], preamble=[])
    expected["exactly-10000-rows.csv"] = "Accepted: exactly at the limit"

    huge = [list(ROWS[0])]
    huge[0][7] = "<p>" + ("Handgedrehter Topf aus Terrakotta. " * 6000) + "</p>"
    write_csv(out / "huge-description.csv", huge, preamble=[])
    expected["huge-description.csv"] = "Parses: description truncated to the token budget before the AI call, flagged as truncated"

    formula = [list(ROWS[1])]
    formula[0][1] = "=cmd|' /C calc'!A0"
    formula[0][6] = "+SUM(1+1)"
    formula[0][7] = "@SUM(A1)"
    write_csv(out / "formula-injection.csv", formula, preamble=[])
    expected["formula-injection.csv"] = "Parses: values stored as text; CSV export prefixes = + - @ cells with a quote"

    reupload = [list(r) for r in ROWS]
    reupload[1][4] = "13.49"
    write_csv(out / "reupload-small-changed.csv", reupload)
    expected["reupload-small-changed.csv"] = "Upload after small/: only MG-ST-250-WH changes price, no duplicate products created"

    write_csv(out / "reupload-small-identical.csv", ROWS)
    expected["reupload-small-identical.csv"] = "Upload after small/: nothing changes, every row skipped as unchanged"

    (out / "catalog.numbers").write_bytes(b"PK\x03\x04 not a supported sheet")
    expected["catalog.numbers"] = "Rejected before upload: unsupported file type"

    (out / "renamed-pdf.csv").write_bytes(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj << >> endobj\n")
    expected["renamed-pdf.csv"] = "Rejected by content sniffing: a PDF renamed to .csv"

    oversized = Image.effect_noise((3200, 3200), 120).convert("RGB")
    oversized.save(out / "oversized-photo.png", "PNG")
    expected["oversized-photo.png"] = "Rejected before upload: over the 10 MB photo limit"

    (out / "zero-byte-photo.jpg").write_bytes(b"")
    expected["zero-byte-photo.jpg"] = "Rejected before upload: the file is empty"

    with zipfile.ZipFile(out / "zip-with-junk.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("__MACOSX/._TC-PL-20.jpg", b"\x00\x05\x16\x07")
        z.writestr(".DS_Store", b"\x00\x00\x00\x01Bud1")
        z.writestr("nested/deeper/TC-PL-20_front.jpg", (EVALS / "small" / "photos" / "TC-PL-20_front.jpg").read_bytes())
        z.writestr("../escape.jpg", b"path traversal attempt")
    expected["zip-with-junk.zip"] = "Extracts only nested/deeper/TC-PL-20_front.jpg; skips __MACOSX, .DS_Store, and refuses ../ paths"

    with zipfile.ZipFile(out / "zip-bomb-lite.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("zeros.jpg", b"\x00" * (200 * 1024 * 1024))
    expected["zip-bomb-lite.zip"] = "Rejected: uncompressed size over the cap (200 MB from a tiny archive)"

    (out / "expected.json").write_text(json.dumps(expected, indent=2, ensure_ascii=False) + "\n")
    (out / "README.md").write_text(
        "# Edge-case files\n\nEach file and the behaviour the app should show is listed in expected.json. "
        "Several map directly to rows in EDGE-CASES.md.\n"
    )
    _ = rng
    print(f"wrote evals/edge: {len(expected)} files")


# ---------------------------------------------------------------------------
# Final staged run: one row first, then 100 → 1,000 → 10,000 rows, every product with several photos

ONE_ROW = [
    "TC-PL-20", "Pflanztopf Terracota handgedreht", "20cm", "terracota", "24,99 €", "1,8 kg",
    "frost-resistant (not frost-proof, bring indoors below 0 °C)",
    '<p onclick="track()">Handgedrehter Topf aus Terrakotta mit Abzugsloch.</p><script>alert(1)</script>', "",
]


def generate_final_one_row() -> None:
    out = EVALS / "final" / "1-row"
    photos = out / "photos"
    photos.mkdir(parents=True, exist_ok=True)
    write_csv(out / "supplier-sheet.csv", [ONE_ROW])
    write_xlsx(out / "supplier-sheet.xlsx", [ONE_ROW])
    for i, view in enumerate(VIEWS):
        view_image("planter", PALETTE["terracotta"], i, view).save(photos / f"TC-PL-20{view}.jpg", "JPEG", quality=85)
    zip_photos(photos, out / "photos.zip")
    labels = {
        "file": "supplier-sheet.csv",
        "header_row": len(PREAMBLE) + 1,
        "total_rows": 1,
        "expected_row_counts": {"done": 1, "needs_review": 0, "failed": 0},
        "products": [{
            "group": "TC-PL",
            "source_rows": [row_number(0)],
            "category": "Home & Garden > Planters",
            "attributes": {"material": "terracotta", "color": "terracotta"},
            "variants": [{"sku": "TC-PL-20", "options": {"size": "20 cm"}, "price_cents": 2499, "currency": "EUR", "weight_grams": 1800}],
            "allowed_claims": [
                {"text": "frost-resistant", "source": src(0, "Notes"), "must_keep_qualifier": "not frost-proof, bring indoors below 0 °C"},
                {"text": "drainage hole", "source": src(0, "Beschreibung")},
                {"text": "hand-thrown", "source": src(0, "Bezeichnung")},
            ],
            "forbidden_claims": ["frost-proof", "weatherproof", "glazed"],
            "expected_status": "ready",
            "photos": [f"TC-PL-20{v}.jpg" for v in VIEWS],
        }],
        "duplicate_rows": [],
        "failed_rows": [],
        "photos": {"matched": {f"TC-PL-20{v}.jpg": "TC-PL" for v in VIEWS}, "unmatched": [], "duplicate_content": {}},
    }
    (out / "labels.json").write_text(json.dumps(labels, indent=2, ensure_ascii=False) + "\n")
    (out / "README.md").write_text(
        "# Final stage 1: one row\n\n"
        "One messy row end to end: upload → clean → AI → display.\n\n"
        "Cleaning should give: price 24,99 € → 2499 EUR cents, `20cm` → 20 cm, `1,8 kg` → 1800 g, `terracota` → terracotta, "
        "`<script>` and `onclick` stripped, German name and description turned into English.\n\n"
        "AI should keep the qualifier on frost-resistant and must not say frost-proof.\n\n"
        "Display: three photos matched; the front shot is the main image, detail and side follow on the product page.\n"
    )
    print("wrote evals/final/1-row: 1 row, 1 product, 3 photos")


FINAL_README = """# Final staged run

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
"""


def generate_final() -> None:
    generate_final_one_row()
    build_bulk("final/100-rows", 100, 2_000, seed=100, views=VIEWS)
    build_bulk("final/1000-rows", 1_000, 2_000, seed=1_001, views=VIEWS)
    build_bulk("final/10000-rows", 10_000, 2_000, seed=10_001, views=VIEWS)
    (EVALS / "final" / "README.md").write_text(FINAL_README)


SETS = {
    "small": generate_small,
    "medium": lambda: build_bulk("medium", 1_000, 1_200, seed=1000),
    "large": lambda: build_bulk("large", 10_000, 2_000, seed=10_000),
    "edge": build_edge,
    "final": generate_final,
}


def main() -> None:
    wanted = sys.argv[1:] or list(SETS)
    if "edge" in wanted and "small" not in wanted and not (EVALS / "small" / "photos").exists():
        wanted.insert(0, "small")
    for name in wanted:
        if name not in SETS:
            raise SystemExit(f"unknown set {name!r}, choose from {', '.join(SETS)}")
        SETS[name]()
    (EVALS / "README.md").write_text(EVALS_README)


EVALS_README = """# Eval sets

Generated by `python3 scripts/generate_evals.py` (gitignored, regenerate any time).

| Set | Rows | Photos | Use it for |
| --- | --- | --- | --- |
| small/ | 21 | 13 | Hand-checkable; every expected value written out in labels.json |
| medium/ | 1,000 | 300 | Day-to-day testing of grouping, cleaning and review flow |
| large/ | 10,000 | 2,000 | The brief's maximum: background processing, restarts, storefront load |
| edge/ | varies | varies | Broken, oversized and malicious files; expected behaviour in expected.json |
| final/ | 1 → 100 → 1,000 → 10,000 | 3 per product | Staged end-to-end run, one row first; see final/README.md |

Each set has supplier-sheet.csv and .xlsx with the same data, photos/ plus photos.zip, and labels.json with
the ground truth: grouping, variants, prices in integer cents, allowed and forbidden claims, expected status,
and expected row outcomes that sum to the row count.
"""


if __name__ == "__main__":
    main()
