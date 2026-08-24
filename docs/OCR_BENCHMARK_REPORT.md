# OCR Benchmark Report

Date: 2026-08-24

## Goal

Evaluate OCR and PDF extraction options for Hebrew invoices and inspection-report PDFs, especially files where native PDF extraction returns dense or hard-to-read raw text.

The target production constraint is Railway support. Heavy OCR frameworks must stay optional unless they are moved to a separate worker image.

## Tested Inputs

- Folder: `C:\Users\User\Desktop\Reminder\pdf`
- Files compared: 32 PDFs
- Extra single-file checks:
  - `C:\Users\User\Downloads\מענבי שרשרת יהודה פרץ  תסקיר 18160.484590.pdf`

## Flows Tested

### Current Regular Flow

1. Run current native PDF parser.
2. Fall back to current OCR only when needed.
3. Run the existing deterministic field extractor.

This is represented in the benchmark as `parsePdf->ocrFile fallback`.

### Proposed Hybrid Flow

1. Try native PDF text extraction first.
2. Try native table-aware extraction with `pdfplumber`.
3. If native text is weak, or when running comparison mode, render PDF pages to images.
4. Run image OCR with `heb+eng`.
5. Run image preprocessing and OCR again with `heb+eng`.
6. Score candidates by text quality and extracted fields.
7. Keep invoice or reminder creation gated behind storage plus extraction/classification success.

This is represented by:

- `pdf-parse native text`
- `pdfplumber native text + tables`
- `render->ocr heb+eng`
- `render->preprocess->ocr heb+eng`

### Optional External Engine Hooks

The benchmark includes hooks for these engines, but they are not installed locally and are not required in Railway production:

- Docling: layout/document conversion benchmark candidate.
- pdfmux: PDF extraction benchmark candidate.
- AyonPal/craft: Hebrew horizontal OCR benchmark candidate through an external CLI.

All three are optional. Missing dependencies produce benchmark rows, not application failures.

## Frameworks And Repositories Reviewed

### LiveWithCodeAnkit/AI-OCR

Repository: https://github.com/LiveWithCodeAnkit/AI-OCR

Useful idea: render PDF pages to images before OCR.

Limitations found:

- Active PDF path appears incomplete for our use case.
- Uses English OCR by default.
- Has Windows-specific Tesseract setup.
- Does not solve Hebrew or RTL handling for us directly.

### Docling

Repository: https://github.com/docling-project/docling

Potential value:

- Document layout extraction.
- Markdown-like structured output.
- May help with complex table documents.

Railway note:

- Treat as optional or separate-worker dependency. It is too heavy to silently add to the main Railway web service without a deployment decision.

### pdfmux

Repository: https://github.com/viking-sudo-rm/pdfmux

Potential value:

- PDF extraction comparison.
- Useful as a benchmark reference for page-level fallback thinking.

Railway note:

- Optional only for now.

### AyonPal/craft

Repository: https://github.com/AyonPal/craft

Potential value:

- Hebrew-oriented OCR flow.
- Uses image preprocessing/cropping ideas before Tesseract.

Railway note:

- Optional external CLI only. The audit script supports `CRAFT_OCR_CLI` if we install it in a local or worker environment.

### Other Invoice OCR Examples

Reviewed as pattern references:

- https://github.com/Nagarjuna325/invoice-extraction-ocr
- https://github.com/codebywiam/invoice-ocr
- https://github.com/ronyginosar/basicOCR

Useful pattern:

- Separate raw OCR quality from final field acceptance.
- Do not create business records until storage and classification/extraction pass.

## Benchmark Results

Report files:

- JSON: `server/data/ocr-engine-benchmark-reminder-pdfs.json`
- Markdown: `server/data/ocr-engine-benchmark-reminder-pdfs.md`

Summary:

| Metric | Result |
|---|---:|
| PDFs tested | 32 |
| Selected result same as regular flow | 24 |
| Selected text unusable | 0 |
| Missing expiry date | 0 |
| Missing contact phone | 17 |
| Missing contact email | 8 |

Selected engines:

| Engine | Wins |
|---|---:|
| `pdf-parse native text` | 24 |
| `render->ocr heb+eng` | 5 |
| `render->preprocess->ocr heb+eng` | 3 |

External engines:

| Engine | Local status |
|---|---|
| Docling | Not installed |
| pdfmux | Not installed |
| CRAFT | `CRAFT_OCR_CLI` not configured |

## Notable Findings

Native PDF text is still the best primary source for most inspection reports. It preserved the expiry date reliably across the tested folder.

Image OCR improved important contact fields in multiple files, especially phone numbers and email addresses. For example:

- `במת  בניטה תסקיר 16027.484590.pdf`: image OCR found `053-8801490` and `benitaliftingplat@gmail.com`.
- `גיא שחם מנוף palfinger...pdf`: preprocessed OCR found `uri@s-guy.co.il`.
- `גק גירים A5 שלב...pdf`: image OCR corrected the email to `klodin@shelev1945.co.il`.
- `תסקיר 18172.484590 כימוגרף...pdf`: image OCR found `054-5214931` and `eli@chemograf.com`.

Image OCR can also lose or corrupt fields that native extraction gets right. The tested יהודה פרץ chain-sling PDF showed why OCR should not simply replace native text. Native extraction preserved the expiry date more reliably in that file, while image OCR produced more readable text for other sections.

`pdfplumber` can expose table-like content, but in this sample it did not preserve Hebrew well enough to win. It is still useful as a secondary diagnostic candidate.

## Production Recommendation

Use a field-level hybrid, not a single global winner.

Recommended production flow:

1. Store the source document first.
2. Extract native PDF text.
3. If text is weak or required fields are missing, render pages and OCR with `heb+eng`.
4. Optionally preprocess rendered pages and OCR again.
5. Classify document type from the strongest available text.
6. Resolve fields per field:
   - Prefer native text for expiry dates when valid.
   - Prefer OCR for phone/email when native output is reversed or malformed.
   - Keep both raw texts for debugging and future reprocessing.
7. Create invoice/reminder records only after storage plus extraction/classification passes.

## Railway Deployment Guidance

Keep the main Railway web service lean:

- Do not add Docling/pdfmux/CRAFT as required dependencies in the main app yet.
- Keep benchmark bridges optional.
- If heavier OCR is needed, create a separate worker service or Docker image with Poppler, Tesseract Hebrew data, and optional OCR frameworks.
- Queue OCR jobs so multiple users do not overload CPU or memory.

## Commands Used

```powershell
cd E:\Projects\Reminder\server
npm run ocr:audit-flow -- --dir "C:\Users\User\Desktop\Reminder\pdf" --limit 100 --compare-all --external --out data\ocr-engine-benchmark-reminder-pdfs.json
npm run build
```

Build result: passed.
