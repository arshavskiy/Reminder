import type {PrintTemplateLayout, PrintTemplateSection} from "../shared/printTemplateLayout.js";

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

function renderFieldsGrid(fields: { label: string; bind: string }[], data: Record<string, unknown>, cols: number = 2): string {
  const rows: string[] = [];
  for (let i = 0; i < fields.length; i += cols) {
    const rowCells = [];
    for (let j = 0; j < cols; j++) {
      const f = fields[i + j];
      if (f) {
        rowCells.push(`<td class="lbl">${escHtml(f.label)}:</td><td class="val">${fieldValue(data, f.bind)}</td>`);
      } else {
        rowCells.push(`<td></td><td></td>`);
      }
    }
    rows.push(`<tr>${rowCells.join("")}</tr>`);
  }
  return `<table class="fields-grid"><tbody>${rows.join("")}</tbody></table>`;
}

function renderEquipmentTable(columns: { label: string; bind: string }[], data: Record<string, unknown>): string {
  const head = columns.map((c) => `<th>${escHtml(c.label)}</th>`).join("");
  const cells = columns.map((c) => `<td>${fieldValue(data, c.bind)}</td>`).join("");
  return `<table class="data equip"><thead><tr>${head}</tr></thead><tbody><tr>${cells}</tr></tbody></table>`;
}

function renderFindings(section: Extract<PrintTemplateSection, { type: "findings" }>, data: Record<string, unknown>, color: string): string {
  const head = `<tr><th style="width:40px">מס׳</th><th style="width:120px">נושא</th><th colspan="2">פירוט</th></tr>`;
  const bodyRows = section.rows.map((row) =>
    `<tr><td class="num">${escHtml(row.number)}</td><td class="subj">${escHtml(row.subjectLabel)}</td><td colspan="2" class="detail">${fieldValue(data, row.bind)}</td></tr>`,
  ).join("");
  let deadline = "";
  if (section.deadlineBind) {
    deadline = `<tr><td class="num">${escHtml(section.deadlineLabel ?? "תוך")}</td><td class="detail">${fieldValue(data, section.deadlineBind)}</td><td colspan="2" class="detail">${escHtml(section.deadlineSuffix ?? "")}</td></tr>`;
  }
  return `<table class="data findings" style="border-color:${color}"><thead>${head}</thead><tbody>${bodyRows}${deadline}</tbody></table>`;
}

function renderSection(section: PrintTemplateSection, data: Record<string, unknown>, color: string): string {
  switch (section.type) {
    case "header": {
      const leftFields = section.fields.slice(0, 2);
      const rightFields = section.fields.slice(2, 4);
      const leftMeta = leftFields.map((f) =>
        `<div class="hdr-field"><span class="hdr-lbl">${escHtml(f.label)}:</span><span class="hdr-val">${fieldValue(data, f.bind)}</span></div>`,
      ).join("");
      const rightMeta = rightFields.map((f) =>
        `<div class="hdr-field"><span class="hdr-lbl">${escHtml(f.label)}:</span><span class="hdr-val">${fieldValue(data, f.bind)}</span></div>`,
      ).join("");
      return `<section class="block header-block">
        <table class="header-table"><tbody>
          <tr>
            <td class="hdr-side hdr-right">${rightMeta}</td>
            <td class="hdr-center">
              <div class="hdr-title">${escHtml(section.title)}</div>
              ${section.subtitle ? `<div class="hdr-sub">${escHtml(section.subtitle)}</div>` : ""}
            </td>
            <td class="hdr-side hdr-left">${leftMeta}</td>
          </tr>
        </tbody></table>
      </section>`;
    }
    case "fields":
      return `<section class="block"><div class="sec-title">${escHtml(section.title)}</div>${renderFieldsGrid(section.fields, data, 3)}</section>`;
    case "equipment_table":
      return `<section class="block"><div class="sec-title">${escHtml(section.title)}</div>${renderEquipmentTable(section.columns, data)}</section>`;
    case "findings":
      return `<section class="block"><div class="sec-title">${escHtml(section.title)}</div>${renderFindings(section, data, color)}</section>`;
    case "static_text":
      return `<section class="block"><div class="sec-title">${escHtml(section.title)}</div><p class="static">${escHtml(section.text)}</p></section>`;
    case "signature": {
      if (!section.enabled) return "";
      const sigImg = section.imageSrc ? renderImage(section.imageSrc, "חתימה", 120) : "";
      const inspector = section.inspectorText ? `<div class="sig-inspector">${escHtml(section.inspectorText)}</div>` : "";
      const company = section.companyName ? `<div class="sig-company">${escHtml(section.companyName)}</div>` : "";
      return `<section class="block sig-block">
        <div class="sig-label">חתימת הבודק:</div>
        <div class="sig-content">
          <div class="sig-image">${sigImg}</div>
          <div class="sig-details">${inspector}${company}</div>
        </div>
      </section>`;
    }
    case "image": {
      const img = renderImage(section.src, section.alt ?? "", section.width, section.height);
      const align = section.align ?? "center";
      const title = section.title ? `<div class="sec-title">${escHtml(section.title)}</div>` : "";
      return `<section class="block img-block" style="text-align:${align}">${title}${img}</section>`;
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
  const sections = layout.sections.map((s) => renderSection(s, data, color)).join("\n");

  return `<!DOCTYPE html>
<html dir="${dir}">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11px; direction: ${dir}; padding: 12px; color: #111; }
  .block { border: ${bw}px solid ${color}; margin-bottom: 6px; padding: 6px 8px; }
  .sec-title { font-size: 11px; font-weight: 700; margin-bottom: 4px; }

  /* Header */
  .header-block { padding: 8px; }
  .header-table { width: 100%; border-collapse: collapse; }
  .header-table td { vertical-align: top; }
  .hdr-side { width: 28%; }
  .hdr-center { width: 44%; text-align: center; vertical-align: middle; }
  .hdr-title { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
  .hdr-sub { font-size: 9px; line-height: 1.3; }
  .hdr-field { margin-bottom: 3px; font-size: 10px; }
  .hdr-lbl { font-weight: 600; }
  .hdr-val { margin-right: 4px; }
  .hdr-right { text-align: right; }
  .hdr-left { text-align: left; }

  /* Fields grid (multi-column) */
  .fields-grid { width: 100%; border-collapse: collapse; }
  .fields-grid td { padding: 2px 4px; vertical-align: top; font-size: 10px; }
  .fields-grid td.lbl { font-weight: 600; white-space: nowrap; width: 70px; text-align: right; }
  .fields-grid td.val { border-bottom: 1px solid #ccc; min-width: 80px; }

  /* Data tables */
  table.data { width: 100%; border-collapse: collapse; }
  table.data th, table.data td { border: 1px solid ${color}; padding: 4px 6px; text-align: center; vertical-align: middle; font-size: 10px; }
  table.data th { font-weight: 700; background: #f5f5f5; }
  table.equip td { min-height: 40px; }
  table.findings td.num { width: 40px; }
  table.findings td.subj { width: 80px; font-weight: 600; text-align: right; }
  table.findings td.detail { text-align: right; }

  /* Static text */
  .static { line-height: 1.4; font-size: 10px; text-align: justify; }

  /* Signature */
  .sig-block { min-height: 70px; }
  .sig-label { font-weight: 600; margin-bottom: 8px; }
  .sig-content { display: flex; gap: 16px; align-items: flex-start; }
  .sig-image img { max-width: 120px; max-height: 80px; }
  .sig-details { font-size: 10px; line-height: 1.4; }
  .sig-inspector { font-weight: 600; }
  .sig-company { margin-top: 4px; }

  /* Image section */
  .img-block { padding: 8px; }
  .section-img { max-width: 100%; height: auto; }

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
