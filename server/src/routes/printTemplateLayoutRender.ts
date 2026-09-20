import type {PrintTemplateLayout, PrintTemplateSection} from "../shared/printTemplateLayout.js";
import {signatureCertificationText} from "../shared/printTemplateLayout.js";

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;");
}

function safeImageSrc(src: string | undefined): string {
  if (!src) return "";
  const value = src.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(value)) return value;
  if (value.startsWith("/")) return value;
  return "";
}

function renderImage(src: string | undefined, alt: string = "", width?: number, height?: number): string {
  const safeSrc = safeImageSrc(src);
  if (!safeSrc) return "";
  const w = width ? ` width="${width}"` : "";
  const h = height ? ` height="${height}"` : "";
  return `<img src="${escAttr(safeSrc)}" alt="${escAttr(alt)}"${w}${h} class="section-img">`;
}

function borderWidthPx(width: string | undefined): number {
  switch (width) {
    case "thick": return 3;
    case "medium": return 2;
    default: return 1;
  }
}

function fieldValue(data: Record<string, unknown>, bind: string): string {
  return escHtml(String(data[bind] ?? ""));
}

function renderCertificationHtml(template: string, data: Record<string, unknown>): string {
    const lines = template.split(/\r?\n/).filter((line) => line.length > 0);
    const htmlLines = lines.map((line, index) => {
        const filled = line.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
            const value = fieldValue(data, key);
            return key === "inspector_number" ? `<span class="sig-cert-num">${value}</span>` : value;
        });
        const cls = index === lines.length - 1 ? "sig-cert-details" : "sig-cert-line";
        return `<div class="${cls}">${filled}</div>`;
    });
    return `<div class="sig-cert">${htmlLines.join("")}</div>`;
}

function headingTextClass(section: { titleSize?: string; titleBold?: boolean; subtitleSize?: string; subtitleBold?: boolean }, which: "title" | "subtitle"): string {
  const size = which === "title" ? section.titleSize : section.subtitleSize;
  const bold = which === "title" ? section.titleBold !== false : !!section.subtitleBold;
  const classes: string[] = [];
  if (size === "small") classes.push(`hdr-${which}--small`);
  if (size === "large") classes.push(`hdr-${which}--large`);
  if (which === "title" && !bold) classes.push("hdr-title--regular");
  if (which === "subtitle" && bold) classes.push("hdr-sub--bold");
  return classes.length ? ` ${classes.join(" ")}` : "";
}

function fieldTextClass(field: { bold?: boolean; size?: string } | undefined): string {
  const classes: string[] = [];
  if (field?.size === "small") classes.push("field-text--small");
  if (field?.bold) classes.push("field-text--bold");
  return classes.join(" ");
}

function renderFieldsGrid(fields: { label: string; bind: string; bold?: boolean; size?: string }[], data: Record<string, unknown>, cols: number = 2): string {
  const rows: string[] = [];
  for (let i = 0; i < fields.length; i += cols) {
    const rowCells = [];
    for (let j = 0; j < cols; j++) {
      const f = fields[i + j];
      if (f) {
        const cls = fieldTextClass(f);
        const extra = cls ? ` ${cls}` : "";
        rowCells.push(`<td class="lbl${extra}">${escHtml(f.label)}:</td><td class="val${extra}">${fieldValue(data, f.bind)}</td>`);
      } else {
        rowCells.push(`<td></td><td></td>`);
      }
    }
    rows.push(`<tr>${rowCells.join("")}</tr>`);
  }
  return `<table class="fields-grid"><tbody>${rows.join("")}</tbody></table>`;
}

function renderEquipmentTable(
  section: Extract<PrintTemplateSection, { type: "equipment_table" }>,
  data: Record<string, unknown>,
): string {
  const columns = section.columns;
  const head = columns.map((c) => `<th>${escHtml(c.label)}</th>`).join("");
  const minRows = Math.max(section.fixedRows?.length ?? 1, section.minRows ?? 1);
  const rowCount = (() => {
    let max = minRows;
    for (const key of Object.keys(data)) {
      for (const col of columns) {
        const prefix = `${col.bind}_`;
        if (!key.startsWith(prefix)) continue;
        const n = Number(key.slice(prefix.length));
        if (Number.isInteger(n) && n >= 2 && n <= 50) max = Math.max(max, n);
      }
    }
    return max;
  })();
  const body = Array.from({length: rowCount}, (_, rowIndex) => {
    const cells = columns.map((col, colIndex) => {
      const key = rowIndex === 0 ? col.bind : `${col.bind}_${rowIndex + 1}`;
      const fallback = colIndex === 0 ? section.fixedRows?.[rowIndex] ?? "" : "";
      const parts = String(data[key] ?? fallback).split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
      if (parts.length <= 1) return `<td>${escHtml(parts[0] ?? "")}</td>`;
      const items = parts.map((part) => `<div class="stack__item">${escHtml(part)}</div>`).join("");
      return `<td class="stack-td"><div class="stack">${items}</div></td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<table class="data equip"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderFindings(
  section: Extract<PrintTemplateSection, { type: "findings" }>,
  data: Record<string, unknown>,
  color: string,
  dir: "rtl" | "ltr" = "rtl",
): string {
  const head = dir === "ltr"
    ? `<tr><th style="width:40px">No.</th><th style="width:120px">Subject</th><th colspan="2">Details</th></tr>`
    : `<tr><th style="width:40px">מס׳</th><th style="width:120px">נושא</th><th colspan="2">פירוט</th></tr>`;
  // A finding nobody filled in prints as an empty numbered row, which reads as
  // an unanswered item rather than one that doesn't apply — same rule the
  // preview applies, so the PDF matches what the inspector saw.
  const isFilled = (bind: string) => String(data[bind] ?? "").trim() !== "";
  const bodyRows = section.rows.filter((row) => isFilled(row.bind)).map((row) =>
    `<tr><td class="num">${escHtml(row.number)}</td><td class="subj">${escHtml(row.subjectLabel)}</td><td colspan="2" class="detail">${fieldValue(data, row.bind)}</td></tr>`,
  ).join("");
  let deadline = "";
  if (section.deadlineBind && isFilled(section.deadlineBind)) {
    deadline = `<tr><td class="num">${escHtml(section.deadlineLabel ?? (dir === "ltr" ? "Within" : "תוך"))}</td><td class="detail">${fieldValue(data, section.deadlineBind)}</td><td colspan="2" class="detail">${escHtml(section.deadlineSuffix ?? "")}</td></tr>`;
  }
  return `<table class="data findings" style="border-color:${color}"><thead>${head}</thead><tbody>${bodyRows}${deadline}</tbody></table>`;
}

function renderChecklist(
  section: Extract<PrintTemplateSection, { type: "checklist" }>,
  data: Record<string, unknown>,
  color: string,
): string {
  const cols = section.columns ?? 2;
  const legend = section.codeLegend
    ? `<div class="checklist-legend">${escHtml(section.codeLegend)}</div>`
    : "";
  const groups = section.groups.map((group) => {
    const heading = group.title
      ? `<div class="checklist-group-title">${escHtml(group.title)}</div>`
      : "";
    const rows: string[] = [];
    for (let i = 0; i < group.items.length; i += cols) {
      const rowItems = group.items.slice(i, i + cols);
      const cells = rowItems.map((item) => {
        const ref = item.reference ? `<span class="checklist-ref">${escHtml(item.reference)}</span>` : "";
        const raw = String(data[item.bind] ?? "").trim();
        const marks = section.markStyle === "acceptable_na"
          ? `<span class="cl-marks"><span class="cl-box${/^(A|OK|Acceptable|Yes)$/i.test(raw) ? " on" : ""}">A</span><span class="cl-box${/^(N|NA|N-A|N\/A|Not Applicable)$/i.test(raw) ? " on" : ""}">NA</span></span>`
          : `<span class="checklist-code">${fieldValue(data, item.bind)}</span>`;
        return `<td class="checklist-cell"><span class="checklist-num">${escHtml(item.number)}.</span>${ref}<span class="checklist-label">${escHtml(item.label)}</span>${marks}</td>`;
      }).join("");
      const padCells = cols - rowItems.length > 0
        ? `<td class="checklist-cell checklist-cell--empty"></td>`.repeat(cols - rowItems.length)
        : "";
      rows.push(`<tr>${cells}${padCells}</tr>`);
    }
    return `${heading}<table class="data checklist" style="border-color:${color}"><tbody>${rows.join("")}</tbody></table>`;
  }).join("");
  return `${legend}${groups}`;
}

function sectionClass(section: PrintTemplateSection, base: string): string {
  const noBorder = "style" in section && section.style?.noBorder;
  return noBorder ? `${base} no-border` : base;
}

function renderSection(section: PrintTemplateSection, data: Record<string, unknown>, color: string, dir: "rtl" | "ltr" = "rtl"): string {
  switch (section.type) {
    case "header": {
      const startFields = dir === "ltr" ? section.fields.slice(0, 2) : section.fields.slice(2, 4);
      const endFields = dir === "ltr" ? section.fields.slice(2, 4) : section.fields.slice(0, 2);
      const startMeta = startFields.map((f) => {
        const cls = fieldTextClass(f);
        return `<div class="hdr-field${cls ? ` ${cls}` : ""}"><span class="hdr-lbl">${escHtml(f.label)}:</span><span class="hdr-val">${fieldValue(data, f.bind)}</span></div>`;
      }).join("");
      const endMeta = endFields.map((f) => {
        const cls = fieldTextClass(f);
        return `<div class="hdr-field${cls ? ` ${cls}` : ""}"><span class="hdr-lbl">${escHtml(f.label)}:</span><span class="hdr-val">${fieldValue(data, f.bind)}</span></div>`;
      }).join("");
      return `<section class="${sectionClass(section, "block header-block")}">
        <table class="header-table"><tbody>
          <tr>
            <td class="hdr-side hdr-start">${startMeta}</td>
            <td class="hdr-center">
              <div class="hdr-title${headingTextClass(section, "title")}">${escHtml(section.title)}</div>
              ${section.subtitle ? `<div class="hdr-sub${headingTextClass(section, "subtitle")}">${escHtml(section.subtitle)}</div>` : ""}
            </td>
            <td class="hdr-side hdr-end">${endMeta}</td>
          </tr>
        </tbody></table>
      </section>`;
    }
    case "fields": {
      const cols = section.columns ?? 3;
      return `<section class="${sectionClass(section, "block")}">${section.title ? `<div class="sec-title">${escHtml(section.title)}</div>` : ""}${renderFieldsGrid(section.fields, data, cols)}</section>`;
    }
    case "equipment_table":
      return `<section class="${sectionClass(section, "block")}">${section.title ? `<div class="sec-title">${escHtml(section.title)}</div>` : ""}${renderEquipmentTable(section, data)}</section>`;
    case "findings":
      return `<section class="${sectionClass(section, "block")}"><div class="sec-title">${escHtml(section.title)}</div>${renderFindings(section, data, color, dir)}</section>`;
    case "checklist":
      return `<section class="${sectionClass(section, "block")}">${section.title ? `<div class="sec-title">${escHtml(section.title)}</div>` : ""}${renderChecklist(section, data, color)}</section>`;
    case "static_text":
      return `<section class="${sectionClass(section, "block")}">${section.title ? `<div class="sec-title">${escHtml(section.title)}</div>` : ""}<p class="static">${escHtml(section.text)}</p></section>`;
    case "signature": {
      if (!section.enabled) return "";
        const certTemplate = signatureCertificationText(section, dir) ?? "";
        const cert = certTemplate ? renderCertificationHtml(certTemplate, data) : "";
      // A template may pin its own signature image; otherwise fall back to the
      // one stored on the user, so a signature uploaded once in the profile
      // reaches every template without being copied into each layout.
      const sigSrc = section.imageSrc || String(data.user_signature_url ?? "");
      const sigImg = sigSrc ? renderImage(sigSrc, dir === "ltr" ? "Signature" : "חתימה", 120) : "";
        const align = section.align ?? "left";
      return `<section class="${sectionClass(section, "block sig-block")}">
        ${cert}
        <div class="sig-mark sig-align-${align}">
          <div class="sig-label">${dir === "ltr" ? "Inspector signature:" : "חתימת הבודק:"}</div>
          <div class="sig-content">
            <div class="sig-image">${sigImg}</div>
          </div>
        </div>
      </section>`;
    }
    case "image": {
      const img = renderImage(section.src, section.alt ?? "", section.width, section.height);
      const align = section.align ?? "center";
      const title = section.title ? `<div class="sec-title">${escHtml(section.title)}</div>` : "";
      return `<section class="${sectionClass(section, "block img-block")}" style="text-align:${align}">${title}${img}</section>`;
    }
      case "footer": {
          if (!section.enabled) return "";
          const left = section.leftBind
              ? `<div class="ftr-col"><span class="ftr-lbl">${escHtml(section.leftLabel ?? "")}</span><span class="ftr-val">${fieldValue(data, section.leftBind)}</span></div>`
              : "";
          const center = section.centerBind
              ? `<div class="ftr-col ftr-center"><span class="ftr-val">${fieldValue(data, section.centerBind)}</span></div>`
              : "";
          const right = section.rightBind
              ? `<div class="ftr-col"><span class="ftr-lbl">${escHtml(section.rightLabel ?? "")}</span><span class="ftr-val">${fieldValue(data, section.rightBind)}</span></div>`
              : "";
          return `<section class="${sectionClass(section, "block ftr-block")}">
        <div class="ftr-row">${left}${center}${right}</div>
      </section>`;
      }
    default:
      return "";
  }
}

export function renderSectionTemplateHtml(
  layout: PrintTemplateLayout,
  data: Record<string, unknown>,
  dir: "rtl" | "ltr" = "rtl",
): string {
  const color = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(layout.styles.borderColor)
    ? layout.styles.borderColor
    : "#111111";
  const bw = borderWidthPx(layout.styles.borderWidth);
  const sections = layout.sections.map((s) => renderSection(s, data, color, dir)).join("\n");

  return `<!DOCTYPE html>
<html dir="${dir}">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; direction: ${dir}; padding: 4px; color: #111; }
  .block { border: ${bw}px solid ${color}; margin-bottom: 6px; padding: 6px 8px; }
  .block.no-border { border: none; }
  .sec-title { font-size: 11px; font-weight: 700; margin-bottom: 4px; }

  /* Header */
  .header-block { padding: 8px; }
  .header-table { width: 100%; border-collapse: collapse; }
  .header-table td { vertical-align: top; }
  .hdr-side { width: 28%; }
  .hdr-center { width: 44%; text-align: center; vertical-align: middle; }
  .hdr-title { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .hdr-title--small { font-size: 11px; }
  .hdr-title--large { font-size: 18px; }
  .hdr-title--regular { font-weight: 400; }
  .hdr-sub { font-size: 9px; line-height: 1.3; }
  .hdr-sub--small { font-size: 8px; }
  .hdr-sub--large { font-size: 12px; }
  .hdr-sub--bold { font-weight: 700; }
  .hdr-field { margin-bottom: 3px; font-size: 10px; }
  .hdr-lbl { font-weight: inherit; }
  .hdr-val { margin-inline-start: 4px; }
  .field-text--small { font-size: 8px; }
  .field-text--bold { font-weight: 700; }
  .hdr-start { text-align: start; }
  .hdr-end { text-align: end; }

  /* Fields grid (multi-column) */
  .fields-grid { width: 100%; border-collapse: collapse; }
  .fields-grid td { padding: 2px 4px; vertical-align: top; font-size: 10px; }
  .fields-grid td.lbl { font-weight: inherit; white-space: nowrap; width: 70px; text-align: start; }
  .fields-grid td.val { border-bottom: 1px solid #ccc; min-width: 80px; }

  /* Data tables */
  table.data { width: 100%; border-collapse: collapse; }
  table.data th, table.data td { border: 1px solid ${color}; padding: 4px 6px; text-align: center; vertical-align: middle; font-size: 10px; }
  table.data th { font-weight: 700; background: #f5f5f5; }
  table.equip td { min-height: 40px; vertical-align: middle; }
  table.equip td.stack-td { padding: 0; vertical-align: stretch; }
  .stack { display: flex; flex-direction: column; height: 100%; }
  .stack__item { flex: 1; display: flex; align-items: center; justify-content: center; padding: 4px 6px; border-bottom: 1px solid ${color}; }
  .stack__item:last-child { border-bottom: none; }
  table.findings td.num { width: 40px; }
  table.findings td.subj { width: 80px; font-weight: 600; text-align: start; }
  table.findings td.detail { text-align: start; }

  /* Checklist */
  .checklist-legend { font-size: 9px; font-style: italic; margin-bottom: 4px; }
  .checklist-group-title { font-size: 10px; font-weight: 700; background: #f0f0f0; padding: 3px 6px; margin-top: 4px; }
  table.checklist { margin-bottom: 2px; }
  table.checklist td.checklist-cell { text-align: left; vertical-align: top; padding: 3px 6px; }
  table.checklist td.checklist-cell--empty { border: none; }
  .checklist-num { font-weight: 700; margin-right: 3px; }
  .checklist-ref { display: block; font-size: 8px; color: #555; }
  .checklist-label { margin-right: 4px; }
  .checklist-code { float: inline-end; font-weight: 700; border-bottom: 1px solid #999; min-width: 24px; text-align: center; display: inline-block; }
  .cl-marks { float: inline-end; display: inline-flex; gap: 4px; }
  .cl-box { min-width: 18px; padding: 0 3px; border: 1px solid ${color}; font-size: 8px; font-weight: 700; text-align: center; }
  .cl-box.on { background: #111; color: #fff; }

  /* Static text */
  .static { line-height: 1.4; font-size: 10px; text-align: justify; }

  /* Signature */
  .sig-block { min-height: 70px; }
  .sig-cert { font-size: 10px; line-height: 1.45; margin-bottom: 8px; text-align: start; }
  .sig-cert-line { margin-bottom: 2px; }
  .sig-cert-num { text-decoration: underline; }
  .sig-cert-details { font-weight: 700; margin-top: 2px; }
  .sig-mark { display: flex; flex-wrap: nowrap; align-items: center; gap: 10px; }
  .sig-label { font-weight: 600; margin: 0; white-space: nowrap; }
  .sig-content { display: flex; gap: 16px; align-items: center; }
  .sig-align-right { justify-content: right; }
  .sig-align-center { justify-content: center; }
  .sig-align-left { justify-content: left; }
  .sig-image img { max-width: 120px; max-height: 80px; }
  .sig-details { font-size: 10px; line-height: 1.4; }
  .sig-inspector { font-weight: 600; }
  .sig-company { margin-top: 4px; }

  /* Image section */
  .img-block { padding: 8px; }
  .section-img { max-width: 100%; height: auto; }

  /* Footer */
  .ftr-block { padding: 8px; }
  .ftr-row { display: flex; justify-content: space-between; align-items: center; }
  .ftr-col { font-size: 10px; }
  .ftr-center { text-align: center; font-weight: 600; }
  .ftr-lbl { margin-left: 4px; }
  .ftr-val { }

  @media print {
    body { padding: 0; }
    .block { page-break-inside: avoid; }
  }
</style>
</head>
<body>
${sections}
</body>
</html>`;
}
