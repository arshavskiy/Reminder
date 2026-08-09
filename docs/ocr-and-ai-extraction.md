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

### Local Hebrew PDF parser CLI

For debugging one PDF without importing it, running AI, creating clients/contracts, or generating reminders, use the local script:

```powershell
cd server
npm run pdf:hebrew -- "C:\path\to\file.pdf"
```

The script runs the same Stage 1 behavior used by uploads:

1. Try `pdfParser.ts` (`pdf-parse`, garbage stripping, Hebrew BiDi fix).
2. Fall back to `ocrParser.ts` when the PDF appears scanned or the extracted text is too sparse.
3. Run `ocrExtractor.ts` over the resulting text and print the extracted regex fields.
4. Apply CLI-only invoice conveniences for local debugging, such as `לכבוד`, `לתשלום עד`, and phone numbers glued before `טלפון`. These do not affect the production upload/API pipeline.
5. Print the full raw text.

Useful flags:

| Flag | Behavior |
|---|---|
| `--ocr-only` | Skip `pdf-parse`, render PDF pages to PNG with Poppler/`pdftoppm`, then force Tesseract OCR |
| `--fields-only` | Print only the JSON fields from `extractFromOcr()` |
| `--out <txt-path>` | Save the extracted raw text to a UTF-8 text file |

Examples:

```powershell
npm run pdf:hebrew:ocr -- "C:\docs\inspection.pdf"
npm run pdf:hebrew:fields -- "C:\docs\inspection.pdf"
npm run pdf:hebrew -- "C:\docs\inspection.pdf" --out "C:\tmp\inspection-ocr.txt"
```

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

### Rate-limit retry behavior

OpenAI extraction can hit a 429 token-per-minute limit during bulk upload or rescan. The extractor retries rate-limit failures before marking a document as failed:

1. Detect 429/rate-limit errors from status, code, or message.
2. Prefer provider retry timing from `retry-after-ms` or `retry-after`.
3. Parse retry messages such as `Please try again in 731ms` when headers are not exposed.
4. Fall back to exponential backoff.
5. Retry up to 5 attempts and log each wait as `ai_extraction_rate_limited_retry`.

Full-document rescans also stagger document starts so many PDFs do not all enter AI extraction in the same token window.

Configurable env knobs:

| Env var | Default | Effect |
|---|---:|---|
| `AI_RATE_LIMIT_MAX_ATTEMPTS` | `5` | Number of total attempts for a rate-limited AI call |
| `AI_RATE_LIMIT_BASE_WAIT_MS` | `750` | Exponential backoff base when the provider does not send retry timing |
| `AI_RATE_LIMIT_MIN_WAIT_MS` | `500` | Minimum wait before retry |
| `AI_RATE_LIMIT_MAX_WAIT_MS` | `20000` | Maximum wait before retry |
| `DOCUMENT_UPLOAD_START_STAGGER_MS` | `0` | Optional delay between starting background processing for uploaded files |
| `DOCUMENT_RESCAN_START_STAGGER_MS` | `1200` | Delay between starting background processing for rescan-all documents |

Lower stagger values make batches start faster but increase 429 risk. Higher values make large batches smoother and easier to complete. The actual OpenAI organization token-per-minute/burst quota cannot be raised by app env vars; increase that in the OpenAI dashboard or use a lower-token model/input.

---

## Audit Logs

Every extraction run — successful or failed — is written to disk as a JSON file under `data/extractions/`:

```
2026-05-27T10-00-00-000Z_doc123_filename.json          ← generic extraction
2026-05-27T10-00-00-000Z_doc123_filename__tpl.json     ← template extraction
```

Each file contains: timestamp, document ID, file name, backend, model, execution time, token usage, input text, and the full raw JSON response. Useful for debugging extraction quality.

---

## Stage 1.5 — OCR Regex Baseline (`ocrExtractor.ts`)

Before AI runs, a lightweight regex pass extracts structured fields directly from the raw text. This stage **always runs** when there is text, regardless of whether AI is enabled.

### Extracted fields

| Field | Description |
|---|---|
| `expiry_date` | ISO date — matched against Hebrew expiry labels (`בתוקף עד`, `תאריך בדיקה הבאה`, `תוקף עד`, etc.) |
| `contact_name` | Client/company name — matched against `איש קשר`, `שם הלקוח`, `תופש`, etc. |
| `contact_phone` | Israeli mobile or landline number, normalised to `XXX-XXXXXXX` format |
| `contact_email` | Email address; reversed bidi emails (`il.co.domain@user`) are auto-corrected |
| `client_address` | Street or city extracted from `כתובת`, `ישוב`, or `פרטים מלאים` labels |
| `po_box` | P.O. Box (`ת.ד`) number |
| `document_type` | One of: `תסקיר בדיקה`, `חוזה`, `הסכם`, `חשבונית`, `תעודה` |

### Hebrew BiDi pattern support

Many Israeli PDFs produce text where the label and value are reversed (right-to-left visual order read as left-to-right). Every pattern supports both orderings:

- **Forward** (label before value): `בתוקף עד: 23.07.2027`
- **Reversed** (value before label): `2027/07/23: בתוקף עד`

### Noise filtering (`contact_name`)

Heavily bidi-garbled PDFs sometimes produce values that look like a concatenated row of label names (e.g. `פקס: טלפוןתקופתית: סוג בדיקה`). The extractor rejects any candidate name that:

- Starts with a known label word (`פקס`, `טלפון`, `נייד`, `מייל`, `כתובת`, etc.)
- Contains inspection-table header fragments (`תקופתית`, `סוג בדיקה`, `מספר רישוי`, `מיקוד`)
- Contains no Hebrew letters at all

### Reversed email detection

A reversed bidi email appears as `domain.tld@username` (the domain — which has dots — is before the `@`, and the username — no dots — is after it). Detection rule: if the part before `@` contains a dot **and** the part after `@` does not, the address is reversed and is returned as `username@domain.tld`. This correctly handles both standard TLDs (`co.il`) and non-standard domains that appear in real documents.

### What happens with the results

- The extraction is always persisted: `document.extracted_fields`, `document.document_kind`, and an `extractions` row with `backend: "ocr-regex"`.
- If `skipEntities` is false and at least one of `expiry_date` / `contact_name` / `contact_phone` was found, client + contract + reminders are created from the regex data.
- If AI (Stage B) runs afterward, it **overwrites** these fields with richer data — the regex result is just the baseline.

---

## Full Pipeline Flow

```
Upload
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
        ▼  Stage A — always runs when text is present
  extractFromOcr(rawText)          ← regex-based, no LLM
  Save client / contract / reminders from OCR data
        │
        ▼  Stage B — only when autoExtract=true AND skipAi=false
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
  Update document.extracted_fields  (overwrites Stage A)
  Save contracts / clients / equipment
  Generate reminders from expiry_date
```

---

## Rebuild Behavior After Extraction

`documents.extracted_fields` is the source snapshot for document-derived entities.

When upload, rescan, or manual **חלץ AI** runs:

1. OCR regex may create a baseline `extracted_fields` snapshot.
2. AI/template extraction overwrites that snapshot when it succeeds.
3. Client, contract, equipment, and reminder data are rebuilt from the latest fields.

Manual field edits on the document detail page should also flow back into the linked contract/reminder data. This prevents the document view and contract/reminder view from drifting apart after a user fixes extracted values.

Important cleanup rules:

- Do not save UI/client company names with the label prefix `פרטי הלקוח/תופש:`.
- Normalize broken `בע"מ` artifacts such as `בע\"מ`.
- Use `client_email` as the single email field shown in the document UI.
- Do not copy `דגם` into `מספר רישוי`; if both are the same because of parsing noise, keep the model and leave the license empty unless the source explicitly labels it as license.
