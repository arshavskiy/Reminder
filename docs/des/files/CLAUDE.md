# Reminder — in-app תסקיר (safety-inspection report) designer

## Context
Client: **M.A.D — הנדסה ובטיחות** (Michael Pechersky, license 484590). The Reminder app
is an annual safety-inspection reminder system. Today the inspector authors each
תסקיר **in Excel**, exports a PDF, and mails it to the equipment owner. We are moving
the authoring **into the web app** so Excel disappears.

The core win: the PDF becomes a *view* of structured data that already lives in Mongo.
Reminder reads Mongo — it does **not** OCR reports authored in-app. (The Surya OCR
sidecar stays only for third-party PDFs we didn't generate.)

## Stack
- Frontend: **Vue 3** + **Naive UI** (Composition API, `<script setup>`)
- Backend: **Bun** + **Express** + **Mongoose**, **MongoDB Atlas**
- Deploy: **Railway** (monorepo)
- PDF render: **Puppeteer** (headless Chromium), server-side

## Architecture decision — READ BEFORE SUGGESTING LIBRARIES
The document is a grid of merged cells with variable column widths / row heights.
We author it with an **HTML `<table>` template designer**, NOT a spreadsheet engine.

Why HTML table instead of a spreadsheet lib:
- `colSpan`/`rowSpan` = merges, `<colgroup>` = per-column width, row height = per-row height.
- Browser DOM renders **Hebrew RTL** perfectly (bidi engine). Puppeteer prints the
  *same markup* → pixel-faithful PDF with a real text layer.
- Every value cell is a **named field (`bind`)**, so data stays structured → no OCR.

Do NOT reach for these (evaluated and rejected):
- **Univer** — best OSS Excel-in-browser (Apache-2.0) but RTL content rendering is
  still WIP as of mid-2026. Breaks Hebrew output.
- **pdfme / pdfmake** — pdf-lib renderer; weak RTL/bidi, Hebrew reverses / tofu.
- **Handsontable** — supports RTL but commercial license required (client is commercial).

Drag/resize interactions: plain pointer handlers (or **interact.js**, MIT) over our own
`<table>`. No framework needed.

## Data model
Two separate objects in Mongo:
1. **Template** (layout) — designed rarely, reused. Shape:
   ```json
   {
     "page": "A4", "dir": "rtl",
     "cols": [{ "w": 250 }, { "w": 90 }],
     "rows": [{ "h": 34 }, { "h": 30 }],
     "cells": [
       { "r": 0, "c": 0, "type": "label", "text": "תיאור", "bold": true, "align": "center", "colSpan": 6 },
       { "r": 2, "c": 3, "type": "field", "bind": "serial", "align": "center" }
     ]
   }
   ```
2. **Report instance** — `{ templateId, data: { serial: "17013293", swl: 1000, ... }, meta }`.
   `data` keys == the `bind` names in the template. This is what Reminder queries.

## Data flow
designer → save Template JSON to Mongo → inspector fills a Naive UI form of the
template's `field` cells → save instance `data` → Puppeteer renders template+data to
PDF for mailing. Same template string powers the Vue live preview (`<iframe srcdoc>`)
and the server-side PDF, so WYSIWYG holds.

## Railway / Puppeteer
Bare `puppeteer` needs Chromium in the image. Nixpacks won't add it automatically:
add `chromium` to `nixPkgs` in `nixpacks.toml` and set `PUPPETEER_EXECUTABLE_PATH`,
or use a Dockerfile from `node:20-slim` + `apt-get install -y chromium`. Launch with
`--no-sandbox` on Railway.

## Reference prototype
`table-designer.jsx` is a working React prototype of the designer (resizable cols/rows,
merge, label/field toggle, RTL, schema export). **Port it to a Vue 3 + Naive UI SFC.**
The schema shape and merge/resize logic are framework-agnostic — reuse them directly.

## Next tasks
- [ ] Port `table-designer.jsx` → `TableDesigner.vue` (Naive UI toolbar + inspector).
- [ ] Mongoose schemas for `Template` and `Report`.
- [ ] `renderReportHTML(template, data)` shared util (Vue preview + Puppeteer both call it).
- [ ] `POST /reports/:id/pdf` endpoint → Puppeteer → stream PDF.
- [ ] Naive UI fill-form auto-generated from a template's `field` cells.
