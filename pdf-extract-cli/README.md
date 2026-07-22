# pdf-extract-cli

Universal local PDF reader: extract clean text from **any PDF**, fully
locally — Tesseract.js for OCR, an optional local [Ollama](https://ollama.com)
model if you want to ask a free-form question about a document's content.
No OpenAI dependency, no API costs, works offline, no fixed business schema.

If a PDF contains a detectable table (bank statements, price lists, etc.),
it's also exported as a **CSV**, alongside an **HTML** rendering of the whole
document (text + any tables). See [Output files](#output-files).

This tool is **decoupled from `server/`** by design — it has its own copies
of the parsing/OCR logic (ported from `server/src/pipeline/`), not imports.
It won't automatically stay in sync with future changes to the main app's
pipeline.

## Why local instead of a cloud model?

Offline batch processing, no per-document API cost, and works on documents
you don't want to send to a third party. Text extraction and OCR never call
any AI model — only `--ask` (or its interactive-mode equivalent) does, and
that's fully optional.

**Note:** OCR uses Tesseract.js, not a vision-language model. Local VLMs
(Qwen-VL, Llama Vision, MiniCPM-V, etc.) don't have reliable Hebrew OCR
support as of this writing and are prone to hallucinating text that "should"
be there rather than failing visibly — risky for a tool whose output you
might trust. Tesseract remains the safer, proven choice here.

## Setup

### 1. Install CLI dependencies

```bash
cd pdf-extract-cli
npm install
cp .env.example .env
```

Plain text extraction and OCR work with just this step — no Ollama or
Python required.

### 2. (Optional) Python + pdfplumber, for table/CSV extraction

Table detection uses Python's `pdfplumber` (structural table detection) +
`pypdfium2` (page rasterization, so garbled table cells can be recovered via
OCR — see [How table extraction works](#how-table-extraction-works)).
Without this, the CLI still extracts text/HTML fine; it just won't produce a
`.csv`.

```bash
pip install pdfplumber pypdfium2
```

**Important:** `python`/`python3` on your PATH can resolve to a *different*
interpreter than the one you just installed packages into — this bit us
during development (Windows had multiple Python installs with different
packages). Verify with the exact interpreter you intend to use:

```bash
<path-to-python> -c "import pdfplumber, pypdfium2; print('ok')"
```

If that's not what `PYTHON_PATH` in `.env` points to, update it to the full
path of the interpreter that printed `ok`.

### 3. (Optional) Ollama, for `--ask`

Only needed if you want to ask questions about a document's content.

```bash
# Install from ollama.com, then:
ollama pull qwen3:4b
```

For **4GB VRAM** GPUs (e.g. RTX A2000 Laptop), `qwen3:4b` (~2.5GB) is the
recommended default — see [Ollama performance notes](#ollama-performance-notes)
for context-window and reasoning-mode settings that matter a lot for speed.
Avoid models ≥7B — no VRAM headroom left for context on a 4GB card.

### 4. (Optional) Install globally

```bash
npm run build
npm link
```

Symlinks the `pdf-extract` command into npm's global bin (`package.json` →
`"pdf-extract": "./dist/cli.js"`). Future edits just need `npm run build`
again — no re-link needed. `.env` resolves relative to this package's
install directory, so it works no matter what directory you run
`pdf-extract` from. Remove later with `npm unlink -g pdf-extract-cli`.

## Usage

If installed globally, replace `npm start --` with `pdf-extract` below —
`npm start` runs from source via `tsx`; `pdf-extract` runs the compiled
`dist/` build.

### Interactive mode (recommended)

```bash
npm start
# or, if installed globally:
pdf-extract
```

Launches a guided wizard: pick a file/folder (live path search), optionally
ask a question about the content (picks an Ollama model from what's
installed locally), choose whether to save output, then a readable results
screen per document — including a table/CSV summary if one was found.

### Scripted / flag mode

```bash
# Print extracted text to stdout
pdf-extract ./document.pdf

# Save output files to a folder
pdf-extract ./document.pdf --out ./results
pdf-extract ./reports/ --out ./results        # process every PDF in a folder

# Ask a question about the document (requires Ollama)
pdf-extract ./document.pdf --ask "What is the due date mentioned in this document?"
pdf-extract ./document.pdf --ask "מה תאריך הבדיקה הבאה?" --model qwen3:1.7b

# Verbose (OCR-vs-parsed decisions, timing)
pdf-extract ./document.pdf --verbose
```

Or, without installing globally:

```bash
npm run build
node dist/cli.js ./document.pdf
```

## Output files

With `--out <dir>` (or the wizard's save option), each PDF produces:

| File | Contents |
|---|---|
| `<name>.txt` | Full extracted text |
| `<name>.json` | Metadata (OCR used?, char count, CSV row count, AI answer if asked) |
| `<name>.html` | Self-contained HTML — the text plus any detected table(s), rendered |
| `<name>.csv` | Only written if a table was detected — see below |

Without `--out`, extracted text prints to stdout; a note is printed if a
table was found (`[table found: N rows — use --out to save as CSV]`).

## How table extraction works

1. `pdfplumber` (Python) detects table structure per page — tries a
   line-based strategy first, falls back to a text-position-based one.
2. Each page is also rasterized to a PNG (`pypdfium2`) so cells can be
   cropped and OCR'd if needed.
3. **Some PDFs embed a custom subset font with a broken or missing Hebrew
   character map** — this is a genuinely different problem from bidi
   (reversed word order, which `hebrewBidi.ts` already fixes): the character
   *identity* itself is unrecoverable from the text layer, decoding to `�`
   no matter how you reinterpret the bytes. Confirmed against a real Bank
   Hapoalim statement PDF (`Poalim-Regular` font) — the Hebrew "description"
   column decoded to replacement characters while dates/amounts came through
   fine. For cells where more than ~30% of characters are `�`, this tool
   crops that cell's exact region (using pdfplumber's per-cell bounding box)
   out of the rasterized page and OCRs just that crop — cheaper and more
   targeted than OCR'ing every page in full.
4. Tables spanning multiple pages (e.g. a paginated statement) are merged
   into one logical table when consecutive pages share an identical header
   row.
5. The merged table is written as CSV; the same data also renders as an
   HTML `<table>`.

### Known limitations (real, found while testing against the bank statement)

- **The garbled-cell detector isn't perfect.** It flags a cell only if
  *most* of its text is `�` — a mostly-clean cell with just the ₪ currency
  symbol broken won't get repaired, so `₪` can still show as `�` in some
  numeric columns.
- **Page headers/metadata can end up mixed into table rows** near the top of
  a page if pdfplumber's table-boundary detection includes them — inspect
  the CSV before treating it as fully clean tabular data.
- **Multi-page header-matching for merging is exact-string-based** — if a
  repeated header wraps slightly differently between pages (observed: a
  phone number splitting across a different character on different pages),
  tables that are logically one continuous table can end up not merged.
- OCR'd cells can contain minor noise (stray `|`, `:`, `[` characters) from
  imperfect crop boundaries.

Fixed since initial testing: multi-row-per-transaction bloat (some source
tables split one logical record across a data row + footnote-marker rows +
blank separator rows — `src/rowConsolidate.ts` now merges these into one
row per record, e.g. 1750 → 448 rows on the real bank statement tested) and
Excel showing Hebrew as mojibake (CSV now starts with a UTF-8 BOM, which
Excel's importer requires to detect the encoding correctly — plain UTF-8
without it gets misread as the system codepage).

These are known, not silently hidden — the interactive wizard's results
screen shows a rough "original text lines vs. CSV rows" comparison as a
sanity signal (not a correctness proof) so you can eyeball whether something
looks off before trusting the CSV.

## Asking questions about a document (`--ask`)

`--ask` sends the extracted text plus your question to Ollama's `/api/chat`
as a plain free-form request — no JSON Schema, no fixed fields, just a
text answer. Useful for one-off questions ("what's the total?", "who signed
this?") without needing a rigid extraction schema.

```bash
pdf-extract ./document.pdf --ask "What is the next inspection date?"
```

## Ollama performance notes

If you use `--ask`, two settings in `.env` matter a lot for speed on a small
GPU:

1. **`OLLAMA_NUM_CTX`** — Ollama defaults to a 65536-token context window
   regardless of model size. On a 4GB card this forces most of even a small
   model off the GPU and onto much slower CPU inference (confirmed: loading
   `qwen3:4b` with no explicit cap ballooned memory to 13GB and pushed 84%
   of inference onto CPU — a single document took over 6 minutes). This
   CLI sets `OLLAMA_NUM_CTX=16384` by default, paired with
   `EXTRACTION_MAX_CHARS=24000` — raise both together if you need more.
2. **Reasoning models "think" by default** — `qwen3` and similar emit a long
   internal chain-of-thought before the actual answer, even for a simple
   question. This CLI passes `think: false` in the Ollama request
   (`src/ask.ts`), which cut response time roughly in half in testing with
   no quality loss for this use case.

Verify GPU usage with `ollama ps` after a run — expect a **mixed CPU/GPU
split** (e.g. `42%/58% CPU/GPU`) for a 4B model at 16384 context on a 4GB
card; that's normal and still reasonably fast. If you see ~100% CPU and a
`SIZE` much larger than the model's file size, `OLLAMA_NUM_CTX` isn't being
applied — check `.env` is loaded.

## Known limitations of small local models (for `--ask`)

Compared to a larger cloud model, small local models are less reliable at
picking the *correct* answer in ambiguous cases (e.g. a document mentioning
several dates) and can occasionally produce a stray leftover `<think>` block
if `think: false` doesn't take effect for a given model/Ollama version —
inspect the raw answer if something looks off. `qwen3:4b` is the more
reliable default; smaller variants (`qwen3:1.7b`) are faster but noticeably
less careful about which entity/date in a document actually answers the
question asked.
