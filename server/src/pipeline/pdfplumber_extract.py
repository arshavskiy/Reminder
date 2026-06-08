"""
PDF extraction using pdfplumber — outputs JSON to stdout.
Usage: python pdfplumber_extract.py <pdf_path>

Returns JSON with:
  {
    "text": "...",
    "page_count": N,
    "tables": [ [ [row, ...], ... ], ... ],  // per-page tables
    "needs_ocr": false,
    "method": "pdfplumber"
  }
"""
import sys
import os
import json

# Add local deps folder so it works without a global install
_here = os.path.dirname(os.path.abspath(__file__))
_deps = os.path.join(_here, "..", "..", "py_deps")
if os.path.isdir(_deps):
    sys.path.insert(0, _deps)

import pdfplumber

def extract(pdf_path: str) -> dict:
    all_text_parts = []
    all_tables = []

    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)

        for page in pdf.pages:
            # Extract text with layout preservation
            text = page.extract_text(layout=True, x_tolerance=3, y_tolerance=3) or ""
            all_text_parts.append(text)

            # Extract tables — try line-based first, fall back to text-based
            tables = page.extract_tables({
                "vertical_strategy": "lines",
                "horizontal_strategy": "lines",
                "snap_tolerance": 5,
                "intersection_tolerance": 5,
            })
            if not tables:
                tables = page.extract_tables({
                    "vertical_strategy": "text",
                    "horizontal_strategy": "text",
                    "snap_tolerance": 3,
                })

            # Clean None cells
            clean_tables = []
            for tbl in tables:
                clean = [[cell if cell is not None else "" for cell in row] for row in tbl]
                if any(any(c.strip() for c in row) for row in clean):
                    clean_tables.append(clean)
            all_tables.append(clean_tables)

    full_text = "\n\n".join(p for p in all_text_parts if p.strip())

    # Decide if OCR is still needed
    heb_chars = sum(1 for c in full_text if "֐" <= c <= "׿")
    needs_ocr = len(full_text.strip()) < 100 or (heb_chars == 0 and len(full_text.strip()) < 300)

    return {
        "text": full_text,
        "page_count": page_count,
        "tables": all_tables,
        "needs_ocr": needs_ocr,
        "method": "pdfplumber",
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: pdfplumber_extract.py <pdf_path>"}))
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not os.path.isfile(pdf_path):
        print(json.dumps({"error": f"File not found: {pdf_path}"}))
        sys.exit(1)

    try:
        result = extract(pdf_path)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
