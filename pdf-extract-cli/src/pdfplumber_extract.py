"""
PDF table + text extraction using pdfplumber, with per-cell bounding boxes
and full-page rasterization — outputs JSON to stdout.

Usage: python pdfplumber_extract.py <pdf_path> [--rasterize <out_dir>]

Returns JSON with:
  {
    "text": "...",
    "page_count": N,
    "pages": [
      {
        "width": 595.0, "height": 842.0,      // PDF points
        "raster_path": "out_dir/page0.png" | null,
        "raster_scale": 2.0,
        "tables": [                            // usually 0 or 1 per page
          {
            "rows": [                          // extracted text, [row][col]
              ["07/07/2026", "...", "...", "...", "..."],
              ...
            ],
            "cell_bboxes": [                   // same shape as rows, (x0, top, x1, bottom) in PDF points
              [[12.0, 245.2, 71.8, 256.7], ...],
              ...
            ]
          }
        ]
      }
    ],
    "needs_ocr": false
  }

`raster_path` is populated only when --rasterize is passed; used by the
Node side to crop+OCR individual cells whose text pdfplumber couldn't
decode (common with PDFs using a custom subset font with a broken/missing
Hebrew ToUnicode CMap — garbled text is unrecoverable from the text layer
at all in that case, so OCR on the rendered pixels is the only fix).
"""
import sys
import os
import json

import pdfplumber

TABLE_SETTINGS_CANDIDATES = [
    {
        "vertical_strategy": "lines",
        "horizontal_strategy": "lines",
        "snap_tolerance": 5,
        "intersection_tolerance": 5,
    },
    {
        "vertical_strategy": "text",
        "horizontal_strategy": "text",
        "snap_tolerance": 3,
    },
]

# Multi-page documents (e.g. a paginated bank statement) can have pdfplumber's
# text-based table strategy detect a DIFFERENT column count per page — e.g.
# a phone number wrapping across a different text boundary on one page splits
# what's a single column elsewhere into two. Confirmed on a real Bank
# Hapoalim statement: 3 of 19 pages had 5 columns, the other 16 had 6, with
# the extra boundary appearing at a different x-position each time. This
# makes naive same-column-index merging silently misalign data.
#
# Fix: after extracting all pages, find the most common column x-boundary
# set (by count) across pages and treat it as canonical. For any page whose
# table doesn't match, re-bucket each of its cells into the nearest
# canonical column by x-position (merging cell text if two source cells map
# to the same canonical column). This is a heuristic, not a guarantee — see
# README "Known limitations".
def _row_boundaries(cell_bboxes_row):
    return tuple(c[0] for c in cell_bboxes_row)


def _pick_canonical_boundaries(tables_with_bboxes):
    """Pick the most common COLUMN COUNT across tables (x-positions vary
    slightly page to page even for the "same" logical table, so grouping by
    exact position would rarely match — group by count instead), then
    average the x-position per column index across all tables with that
    count to get stable canonical boundaries."""
    from collections import Counter

    by_count = {}
    for cell_bboxes in tables_with_bboxes:
        if not cell_bboxes or not cell_bboxes[0]:
            continue
        bounds = _row_boundaries(cell_bboxes[0])
        by_count.setdefault(len(bounds), []).append(bounds)

    if not by_count:
        return None

    counts = Counter({n: len(v) for n, v in by_count.items()})
    winning_count = counts.most_common(1)[0][0]
    winning_sets = by_count[winning_count]

    return tuple(
        sum(s[i] for s in winning_sets) / len(winning_sets) for i in range(winning_count)
    )


def _nearest_bucket(x, canonical):
    best_i, best_dist = 0, abs(x - canonical[0])
    for i, cx in enumerate(canonical[1:], start=1):
        dist = abs(x - cx)
        if dist < best_dist:
            best_i, best_dist = i, dist
    return best_i


def _rebucket_table(rows, cell_bboxes, canonical):
    """Re-map a table's rows into `len(canonical)` columns using each cell's
    x0 position, merging text when multiple source cells land in the same
    bucket. Always run (not just for mismatched tables) since nearest-bucket
    assignment for an already-matching table is a stable identity mapping —
    simpler than maintaining a separate "already matches" fast path."""
    if not rows:
        return rows, cell_bboxes

    new_rows = []
    new_bboxes = []
    for row, bboxes in zip(rows, cell_bboxes):
        bucketed_text = [""] * len(canonical)
        bucketed_bbox = [None] * len(canonical)
        for cell_text, bbox in zip(row, bboxes):
            if not bbox:
                continue
            bucket = _nearest_bucket(bbox[0], canonical)
            if cell_text and cell_text.strip():
                bucketed_text[bucket] = (
                    (bucketed_text[bucket] + " " + cell_text).strip()
                    if bucketed_text[bucket]
                    else cell_text
                )
                bucketed_bbox[bucket] = bbox
        new_rows.append(bucketed_text)
        new_bboxes.append([b if b is not None else [0, 0, 0, 0] for b in bucketed_bbox])
    return new_rows, new_bboxes


def extract(pdf_path: str, rasterize_dir: str | None) -> dict:
    pages_out = []
    raster_scale = 2.0

    pdfium_pdf = None
    if rasterize_dir:
        import pypdfium2 as pdfium
        os.makedirs(rasterize_dir, exist_ok=True)
        pdfium_pdf = pdfium.PdfDocument(pdf_path)

    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)

        for page_index, page in enumerate(pdf.pages):
            text = page.extract_text(layout=True, x_tolerance=3, y_tolerance=3) or ""

            found_tables = []
            for settings in TABLE_SETTINGS_CANDIDATES:
                found_tables = page.find_tables(settings)
                if found_tables:
                    break

            tables_out = []
            for table in found_tables:
                rows_data = table.extract()
                # rows_data may have fewer rows than table.rows in edge cases;
                # zip stops at the shorter of the two, which is safe here.
                cell_bboxes = [[list(cell) for cell in row.cells] for row in table.rows]
                clean_rows = [[c if c is not None else "" for c in row] for row in rows_data]
                if any(any(c.strip() for c in row) for row in clean_rows):
                    tables_out.append({"rows": clean_rows, "cell_bboxes": cell_bboxes})

            raster_path = None
            if pdfium_pdf is not None:
                pdfium_page = pdfium_pdf[page_index]
                bitmap = pdfium_page.render(scale=raster_scale)
                pil_img = bitmap.to_pil()
                raster_path = os.path.join(rasterize_dir, f"page{page_index}.png")
                pil_img.save(raster_path)

            pages_out.append({
                "width": page.width,
                "height": page.height,
                "raster_path": raster_path,
                "raster_scale": raster_scale if raster_path else None,
                "text": text,
                "tables": tables_out,
            })

    # Normalize column boundaries across pages so a multi-page table (e.g.
    # a paginated bank statement) merges correctly instead of silently
    # misaligning data when a page's table has extra/fewer columns.
    all_cell_bboxes = [t["cell_bboxes"] for p in pages_out for t in p["tables"]]
    canonical = _pick_canonical_boundaries(all_cell_bboxes)
    if canonical:
        for p in pages_out:
            for t in p["tables"]:
                t["rows"], t["cell_bboxes"] = _rebucket_table(t["rows"], t["cell_bboxes"], canonical)

    full_text = "\n\n".join(p["text"] for p in pages_out if p["text"].strip())
    heb_chars = sum(1 for c in full_text if "֐" <= c <= "׿")
    needs_ocr = len(full_text.strip()) < 100 or (heb_chars == 0 and len(full_text.strip()) < 300)

    return {
        "text": full_text,
        "page_count": page_count,
        "pages": pages_out,
        "needs_ocr": needs_ocr,
        "method": "pdfplumber",
    }


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        print(json.dumps({"error": "Usage: pdfplumber_extract.py <pdf_path> [--rasterize <out_dir>]"}))
        sys.exit(1)

    pdf_path = args[0]
    rasterize_dir = None
    if "--rasterize" in args:
        idx = args.index("--rasterize")
        if idx + 1 < len(args):
            rasterize_dir = args[idx + 1]

    if not os.path.isfile(pdf_path):
        print(json.dumps({"error": f"File not found: {pdf_path}"}))
        sys.exit(1)

    try:
        result = extract(pdf_path, rasterize_dir)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
