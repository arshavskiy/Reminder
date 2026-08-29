# OCR Regex Extractor — Reference

`server/src/pipeline/ocrExtractor.ts`

A lightweight, zero-LLM extraction pass that runs on every document immediately after text is available. It uses regex patterns to pull structured fields from raw Hebrew text, including bidi-garbled layouts produced by Israeli PDF generators.

---

## Extracted fields

| Field | Type | Notes |
|---|---|---|
| `expiry_date` | `YYYY-MM-DD \| null` | Next action date (inspection, contract expiry, payment due) |
| `contact_name` | `string \| null` | Client or company name |
| `contact_phone` | `string \| null` | Normalised to `XXX-XXXXXXX` format |
| `contact_email` | `string \| null` | Bidi-reversed emails are auto-corrected (see [known gaps](#known-gaps)) |
| `client_address` | `string \| null` | Street, city, or full address |
| `po_box` | `string \| null` | P.O. Box (`ת.ד`) number |
| `document_type` | `string \| null` | One of: `תסקיר בדיקה`, `חוזה`, `הסכם`, `חשבונית`, `תעודה` |

---

## How each field is extracted

### `expiry_date`

Matches Hebrew expiry labels in both directions:

**Forward** (label → value):
```
בתוקף עד: 23/07/2027
תאריך בדיקה הבאה: 20.06.2026
מועד חידוש: 31/12/2025
תאריך פקיעה: 01/03/2027
תוקף עד: 15/01/2026
```

**Reversed** (value → label, bidi PDF artifact):
```
2027/07/23: בתוקף עד
2026/11/19: בדיקה הבאה
```

Date formats accepted: `DD/MM/YYYY`, `DD.MM.YYYY`, `YYYY-MM-DD`, `YYYY/MM/DD` (bidi).  
All output is normalised to ISO `YYYY-MM-DD`.

---

### `contact_name`

Matched against forward labels in priority order:

1. `איש קשר: <name>`
2. `שם איש קשר: <name>`
3. `שם מלא: <name>`
4. `שם הלקוח: <name>`
5. `שם מעביד / בעל הציוד: <name>`
6. `שם החברה: <name>`
7. `תופש: <name>`

Then falls back to reversed-label patterns:

- `<value>: תופש/פרטי הלקוח`
- `<value>: שם הלקוח`
- `<value>: שם החברה`

**Noise filtering** — a candidate is rejected if it:
- Starts with a label keyword (`פקס`, `טלפון`, `נייד`, `מייל`, `כתובת`, `רחוב`, `מיקוד`, `שם`, `תאריך`, `מספר`)
- Contains inspection-table header fragments (`תקופתית`, `סוג בדיקה`, `מספר רישוי`, `ת.ד`, `מיקוד`)
- Contains no Hebrew letters (pure ASCII/digits)

---

### `contact_phone`

Three matching strategies, tried in order:

1. **Labelled forward**: `נייד / טלפון / טל / mobile / phone: 05X-XXXXXXX`
2. **Labelled reversed**: `05XXXXXXXXX: נייד` or `05XXXXXXXXX: טלפון`
3. **Bare last resort**: any 10-digit Israeli mobile (`05X...`) — only used when no label is present

Output normalised: 10-digit `0XXXXXXXXX` → `0XX-XXXXXXX`.

---

### `contact_email`

Matches any `user@domain` pattern, then runs `normalizeEmail`
(`server/src/pipeline/importer.ts`). Hebrew inspection PDFs are laid out
right-to-left, so the text layer often captures an address out of order. The rules
below are applied in sequence — the **first** one that matches wins.

**0. Always: trim, strip trailing punctuation, lowercase**

| Input | Output |
|---|---|
| `"  Info@Example.COM  "` | `info@example.com` |
| `user@gmail.com.` | `user@gmail.com` |

**1. Fully reversed** — when the local part's dot-segments reversed end in a known
TLD and the domain's last segment does not. Both sides swap and each has its dot
segments reversed.

| Input | Output |
|---|---|
| `com.gmail@mezeg.car` | `car.mezeg@gmail.com` |

**2. Domain in local part** — local contains a dot, domain does not.

| Input | Output |
|---|---|
| `com.gmail@username` | `username@gmail.com` |

**3. Digit glue on the local part** — a trailing digit in an RTL line renders at the
visual start, so `rampa2@` is captured as `2rampa@`. Any leading digit run moves back
to the end. Single digits count: they are the common case (9 of 11 observed records).

| Input | Output |
|---|---|
| `2rampa@yasca.co.il` | `rampa2@yasca.co.il` |
| `7760yair.yo@gmail.com` | `yair.yo7760@gmail.com` |

**4. Otherwise unchanged** — `normal@gmail.com`, `info@012.net.il`, `noatsign`.

#### Known gaps

These are **not** repaired, and have caused real bounces:

| Input | Actual | Should be | Why |
|---|---|---|---|
| `klodin@1945shelev.co.il` | unchanged | `klodin@shelev1945.co.il` | rule 3 only inspects the local part, never the domain |
| `uri@guy-s.co.il` | unchanged | `uri@s-guy.co.il` | reversed hyphen segments in a domain are not handled |

Rule 1 is also weaker than it looks: `li.oc.allaw@8yale` returns
`8yale@allaw.oc.li` rather than the intended `elay8@walla.co.il`, because segment
reversal alone does not un-reverse the characters inside each segment.

#### Rule 3 is a heuristic, not a certainty

A leading digit can be legitimate. `155david@012.net.il` is rewritten to
`david155@012.net.il`, but `012.net.il` is a real Israeli ISP and the original may
well be correct. Treat rule-3 rewrites on existing records as candidates for review
against the source PDF, not as safe bulk corrections.

**Validating with MX** would have caught both known gaps — `1945shelev.co.il` and
`guy-s.co.il` have no MX records, while the corrected domains resolve.

---

### `client_address`

**Forward labels**:
```
כתובת: רוטשילד 22, תל אביב
רחוב: הרצל 10, תל אביב
```

**Reversed — `פרטים מלאים` line**:
```
ב אשדוד העצמאות רח: פרטים מלאים
```
Phone numbers and the word `טלפון` are stripped from the captured value before returning.

**Reversed — `ישוב` line**:
```
אשדוד: ישוב
```
Skipped if the value contains `מיקוד` (zipcode concatenation artifact).

---

### `po_box`

```
ת.ד: 679          ← forward
679: ת.ד           ← reversed
P.O. Box 12345    ← Latin
```

Accepts 3–6 digit values only.

---

### `document_type`

Simple keyword search on the full text:

| Keyword | Returned value |
|---|---|
| `תסקיר` | `תסקיר בדיקה` |
| `חוזה` | `חוזה` |
| `הסכם` | `הסכם` |
| `חשבונית` | `חשבונית` |
| `תעודה` | `תעודה` |

---

## Performance on real documents (2026-06-08)

Tested against 253 real extraction dumps:

| Field | Extraction rate |
|---|---|
| `expiry_date` | 140 / 253 (55%) |
| `contact_name` | 143 / 253 (57%) |
| `contact_phone` | 141 / 253 (56%) |
| `contact_email` | 224 / 253 (89%) |
| `client_address` | 145 / 253 (57%) |
| `po_box` | 0 / 253 (0%) — format varies too much |
| `document_type` | 224 / 253 (89%) |

**Overall fill rate: 64.3%** vs 49.3% for the forward-label-only baseline (v1).  
The bidi-aware patterns win on 140 out of 253 documents; zero regressions.

---

## Adding a new pattern

1. Add the regex to the relevant `extract*` function in `ocrExtractor.ts`.
2. Add a matching test case to `server/test_ocr_extractor.mjs` and confirm it passes.
3. Run `node test_ocr_compare.mjs` to verify the real-world fill rate did not regress.

---

## Test scripts

| Script | Purpose |
|---|---|
| `server/test_ocr_extractor.mjs` | Synthetic unit tests — runs in seconds, no data files needed |
| `server/test_ocr_compare.mjs` | Compares v1 vs v2 logic across all dumps in `data/extractions/` |
| `server/test_ocr_real.mjs` | Runs v2 against a single real dump file (pass filename as arg) |
| `server/test_ocr_pipeline.mjs` | End-to-end test including bidi fix and full pipeline |
