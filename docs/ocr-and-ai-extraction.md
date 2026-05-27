# OCR & AI Extraction — How It Works

## Overview

When a document is uploaded, the system runs a two-stage pipeline:

1. **Text extraction** — pull raw text out of the file (PDF parser or OCR)
2. **AI extraction** — send that text to a language model and get back structured JSON fields

Both stages run automatically if `autoExtract` is enabled in settings. They can also be triggered manually per-document via the "חילוץ AI" button in the document detail page.

---

## Stage 1 — Text Extraction

### PDF files (`pdfParser.ts`)

PDF text extraction runs through `pdf-parse`, with a 30-second timeout. After that it does three cleanup passes:

**1. Garbage stripping**

Hebrew PDFs that use custom CID-encoded fonts without a ToUnicode CMap produce garbage characters — Armenian, Braille, Private Use Area glyphs. The stripper keeps only:
- Hebrew Unicode block (U+0590–U+05FF) — letters, niqqud, punctuation
- ASCII Latin letters and digits
- Whitespace
- Common ASCII punctuation (`.`, `,`, `:`, `@`, etc.)

Everything else is dropped.

**2. BiDi fix (`hebrewBidi.ts`)**

Many Hebrew PDFs store characters in *visual order* — the order they appear on screen from right to left — rather than *logical order* (the Unicode standard). When read left-to-right by a text extractor, words come out reversed: `ןולמ` instead of `מלון`.

The fix works line by line:

1. Detect whether the text looks reversed using a heuristic: in correct Hebrew, final-form letters (`ך ם ן ף ץ`) appear at word *ends*. In reversed text they appear at word *starts*. If more words start with finals than end with them (and at least 3 such words exist), the block is flagged as reversed.
2. Tokenise each line into segments: Hebrew runs, Latin runs, digit runs, spaces, punctuation.
3. Reverse the *order* of all tokens on the line.
4. Reverse the *characters* within each Hebrew token.
5. Latin and digit tokens are never character-reversed — only repositioned.

Mixed strings like `"שלב 1945 הובלות בע"מ"` work correctly because digit tokens stay intact while Hebrew tokens are character-reversed along with the reordering.

**3. OCR fallback decision**

After cleanup, the parser checks whether the resulting text is good enough:

| Condition | Fallback to OCR |
|---|---|
| Fewer than 100 characters after cleanup | Yes — probably a scanned PDF |
| Hebrew ratio < 2% and total < 500 chars | Yes — almost no recognisable text |
| Hebrew ratio < 5% and total < 300 chars | Yes — sparse text, likely scanned table |
| pdf-parse throws / times out | Yes — always |

If OCR is needed, `needsOcr: true` is returned and the pipeline continues with Tesseract.

---

### Image files and OCR fallback (`ocrParser.ts`)

OCR uses **Tesseract.js** with a 2-minute timeout. Configuration:

- **Language**: controlled by the `ocrLanguage` setting (default `heb+eng` — Hebrew + English simultaneously). Can be changed in Settings → OCR.
- **Page segmentation mode 6** (`PSM 6`): treats the page as a single uniform block of text. Best for structured forms and tables rather than single lines or sparse layouts.
- **`preserve_interword_spaces = 1`**: keeps column spacing so Hebrew and Latin cells in tables don't merge into garbled runs.

After recognition, the output goes through the same `fixHebrewBidi` pass as PDF text.

The Tesseract worker is always terminated in a `finally` block to prevent memory leaks even if OCR times out.

---

### Other file types

| Extension | Parser |
|---|---|
| `.docx` | `docxParser.ts` — mammoth.js extracts raw text |
| `.xlsx` | `xlsxParser.ts` — SheetJS reads cell values |
| `.txt` / `.md` | Read directly as UTF-8 |

---

## Stage 2 — AI Extraction

Once raw text is available, it is sent to the AI model for structured field extraction. There are two extraction paths.

### Path A — Generic extraction (`extractDocument`)

Used for documents that don't match any template. Sends a fixed system prompt with a hardcoded JSON schema:

```
client_name, client_company, client_email, client_phone, client_address,
document_type, document_number, contract_number, contract_type,
start_date, expiry_date, amount, currency, parties, tasks,
summary_hebrew, confidence
```

Key rules baked into the prompt:
- All dates normalized to ISO 8601 (Hebrew calendar → Gregorian, DD/MM/YYYY → YYYY-MM-DD)
- `expiry_date` = the **next action date** (next inspection, expiry, payment due) — not the issue date
- Reversed email addresses are detected and corrected (`il.co.something@domain` → `domain@something.co.il`)
- Company names with embedded digits are reconstructed from context
- Phone numbers are formatted in Israeli style with a dash after the 3rd digit

---

### Path B — Template-driven extraction (`extractWithTemplate`)

Used when a matching template is found via `pickTemplate()`. This is the primary path for inspection reports.

#### Template matching

`pickTemplate` scans the raw text for each template's `match_keywords`. Keywords are checked case-insensitively. The first template whose keywords appear in the text wins. Built-in templates include:

| Template | Keywords |
|---|---|
| תסקיר בדיקה | `תסקיר`, `בדיקה תקופתית`, `פקודת הבטיחות` |
| חוזה שירות | `חוזה`, `הסכם`, `הסכם שירות` |
| חשבונית | `חשבונית`, `מספר חשבונית`, `תשלום` |

#### Dynamic prompt building (`buildPromptForTemplate`)

The system prompt is assembled from the template's field list. Each field contributes one line to the JSON schema:

```
"field_key": type
    // label: "שם שדה" · required · hint: ... · example: ...
```

Field types map to TypeScript-style annotations:

| Type | Schema annotation |
|---|---|
| `text` | `string \| null` |
| `date` | `"YYYY-MM-DD" \| null` |
| `phone` | `string \| null (keep Israeli format)` |
| `email` | `string \| null` |
| `currency` | `number \| null` |
| `list` | `string[]` |

If the template has an `expiry_field`, an extra instruction is appended: *"this field is the FUTURE DATE the user must be reminded about — always pick the next-action date, not the issue date."*

#### Equipment extraction (inspection templates)

When the template matches inspection keywords, a special `_equipment` array is appended to the schema. The AI extracts every row from the inspection table as an object:

```json
{
  "name": "...",
  "manufacturer": "...",
  "model": "...",
  "serial_number": "...",
  "load_capacity_work": ["3200 קג"],
  "load_capacity_test": ["4800 קג"],
  "load_radius": ["3.5 מ"],
  "category": "lift"
}
```

Special handling the prompt instructs the model on:

- **Multiple serial numbers on one row** (e.g. רצועות הרמה with 3 serials separated by `/`): create one object *per serial number*, copying all other fields to each sibling.
- **Merged-cell tables** (one item, multiple load configurations): create ONE object per equipment item and put each load sub-row as an array element in `load_capacity_work` / `load_capacity_test` / `load_radius`.

After extraction, the server saves each equipment object to the `equipment` collection, linking it to the document and client.

#### Sections the model is told to ignore

The prompt explicitly lists boilerplate that appears in every Israeli inspection report and must not contribute to client fields:

- סעיף 4 / הערות נוספות
- פקודת הבטיחות בעבודה legal text (סעיפים 75, 76, 81, 86...)
- "תסקיר זה מייצג / אינו..." disclaimer paragraphs
- Inspector's signature block
- **Page footer / letterhead** — the inspector's own company name, email, phone printed at the bottom of every page

#### Inspector identity exclusion

When extraction is triggered, the server loads the logged-in user's details from two sources:

| Source | Fields |
|---|---|
| `users` collection | `name`, `email`, `phone`, `company_name` |
| `engineer_profiles` collection | `company_name`, `company_email`, `company_phone` |

If any of these are populated, the prompt gets an additional rule:

> *"The inspector/author of this report has the following details: personal name "X", personal phone "Y", company "Z". These values belong to the inspector, NOT to the client. If any of these exact values appear in the document, do NOT assign them to client fields."*

This prevents the AI from confusing the inspector's footer contact details with the client's contact details. Configure these values in **Profile → פרטים אישיים** (שם חברה, נייד) and **Profile → פרופיל מהנדס** (שם החברה, טלפון, אימייל).

---

## AI Backend

The model is selected in Settings:

| Backend | Default model | How to configure |
|---|---|---|
| **OpenAI** | `gpt-4o-mini` | Set `OPENAI_LOCAL_API_KEY` env var + model in Settings |
| **Ollama** (local) | configurable | Set Ollama URL + model name in Settings |

All extraction calls use:
- `temperature: 0` — deterministic output
- `response_format: { type: "json_object" }` — forces valid JSON response

The input text is truncated to `extractionMaxChars` (default: 12,000 characters) before sending.

---

## Audit Logs

Every extraction run — successful or failed — is written to disk as a JSON file under `data/extractions/`:

```
2026-05-27T10-00-00-000Z_doc123_filename.json          ← generic extraction
2026-05-27T10-00-00-000Z_doc123_filename__tpl.json     ← template extraction
```

Each file contains: timestamp, document ID, file name, backend, model, execution time, token usage, input text, and the full raw JSON response. Useful for debugging extraction quality.

---

## Full Pipeline Flow

```
Upload / Watch folder
        │
        ▼
  Parse text from file
  ┌─────────────────────────────────────┐
  │ PDF?                                │
  │  → pdf-parse (30s timeout)          │
  │  → strip garbage chars              │
  │  → fixHebrewBidi                    │
  │  → if result too short → OCR        │
  │                                     │
  │ Image / scanned PDF?                │
  │  → Tesseract OCR (2min timeout)     │
  │  → fixHebrewBidi                    │
  │                                     │
  │ DOCX → mammoth.js                   │
  │ XLSX → SheetJS                      │
  └─────────────────────────────────────┘
        │
        ▼
  raw_text saved to document record
        │
        ▼ (if autoExtract = true)
  pickTemplate(rawText)
        │
   ┌────┴──────────────────────┐
   │ Template found            │ No template
   ▼                           ▼
extractWithTemplate        extractDocument
(dynamic schema +          (fixed schema)
 equipment table +
 inspector exclusion)
        │
        ▼
  Save to extractions collection
  Update document.extracted_fields
  Save contracts / clients / equipment
  Generate reminders from expiry_date
```
