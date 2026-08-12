import type {Express} from "express";
import {col} from "../db/db.js";
import {requireAuth} from "../auth/middleware.js";
import {ObjectId} from "mongodb";

function tryObjectId(id: string) {
  try { return new ObjectId(id); } catch { return id as any; }
}

export function registerPrintTemplateRoutes(app: Express) {
  // List all print templates for the authenticated user
  app.get("/api/print-templates", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const templates = await col("print_templates")
      .find({ user_id: auth.userId })
      .sort({ created_at: -1 })
      .toArray();
    res.json(templates.map(t => ({ ...t, _id: t._id.toString() })));
  });

  // Get single print template
  app.get("/api/print-templates/:id", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const t = await col("print_templates").findOne({ _id: tryObjectId(req.params.id), user_id: auth.userId });
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...t, _id: t._id.toString() });
  });

  // Create print template
  app.post("/api/print-templates", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const { name, page, dir, cols, rows, cells, hasFixedFrame } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const now = new Date().toISOString();
    const doc = { user_id: auth.userId, name, page: page ?? "A4", dir: dir ?? "rtl", cols: cols ?? [], rows: rows ?? [], cells: cells ?? [], hasFixedFrame: !!hasFixedFrame, created_at: now, updated_at: now };
    const result = await col("print_templates").insertOne(doc as any);
    res.status(201).json({ ...doc, _id: result.insertedId.toString() });
  });

  // Update print template
  app.put("/api/print-templates/:id", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const { name, page, dir, cols, rows, cells, hasFixedFrame } = req.body;
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: now };
    if (name !== undefined) update.name = name;
    if (page !== undefined) update.page = page;
    if (dir !== undefined) update.dir = dir;
    if (cols !== undefined) update.cols = cols;
    if (rows !== undefined) update.rows = rows;
    if (cells !== undefined) update.cells = cells;
    if (hasFixedFrame !== undefined) update.hasFixedFrame = hasFixedFrame;
    const result = await col("print_templates").findOneAndUpdate(
      { _id: tryObjectId(req.params.id), user_id: auth.userId },
      { $set: update },
      { returnDocument: "after" }
    );
    if (!result) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...result, _id: result._id.toString() });
  });

  // Delete print template
  app.delete("/api/print-templates/:id", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const result = await col("print_templates").deleteOne({ _id: tryObjectId(req.params.id), user_id: auth.userId });
    if (result.deletedCount === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true });
  });

  // Render PDF from template + data
  app.post("/api/print-templates/:id/pdf", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const t = await col("print_templates").findOne({ _id: tryObjectId(req.params.id), user_id: auth.userId }) as any;
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
    const data: Record<string, unknown> = req.body.data ?? {};
    try {
      const html = renderTemplateHtml(t, data);
      const { default: puppeteer } = await import("puppeteer");
      const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdf = await page.pdf({ format: t.page ?? "A4", printBackground: true });
      await browser.close();
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `inline; filename="template-${t._id}.pdf"`);
      res.send(Buffer.from(pdf));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });
}

function renderTemplateHtml(t: any, data: Record<string, unknown>): string {
  const colWidths = (t.cols as { w: number }[]).map(c => c.w);
  const rows = t.rows as { h: number }[];
  const cells = t.cells as any[];
  const dir = t.dir ?? "rtl";

  // Build masked matrix
  const masked = Array.from({ length: rows.length }, () => new Array(colWidths.length).fill(false));
  for (const cell of cells) {
    const cs = cell.colSpan ?? 1;
    const rs = cell.rowSpan ?? 1;
    for (let r = cell.r; r < cell.r + rs; r++) {
      for (let c = cell.c; c < cell.c + cs; c++) {
        if (r === cell.r && c === cell.c) continue;
        if (masked[r]) masked[r][c] = true;
      }
    }
  }

  const colgroupCols = colWidths.map(w => `<col style="width:${w}px">`).join("");

  const bodyRows = rows.map((row, ri) => {
    const tds = colWidths.map((_, ci) => {
      if (masked[ri]?.[ci]) return "";
      const cell = cells.find(c => c.r === ri && c.c === ci);
      const colspan = cell?.colSpan ? ` colspan="${cell.colSpan}"` : "";
      const rowspan = cell?.rowSpan ? ` rowspan="${cell.rowSpan}"` : "";
      const align = cell?.align ?? dir === "rtl" ? "right" : "left";
      const valign = cell?.valign ?? "middle";
      const bold = cell?.bold ? "font-weight:700;" : "";
      const style = `text-align:${align};vertical-align:${valign};${bold}padding:2px 4px;`;
      let content = "";
      if (cell?.type === "label") {
        content = cell.text ?? "";
      } else if (cell?.type === "field" && cell.bind) {
        content = String(data[cell.bind] ?? "");
      }
      return `<td${colspan}${rowspan} style="${style}">${escHtml(content)}</td>`;
    }).join("");
    return `<tr style="height:${row.h}px">${tds}</tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html dir="${dir}">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; direction: ${dir}; padding: 16px; }
  table.render { border-collapse: collapse; width: 100%; table-layout: fixed; }
  table.render td { border: 1px solid #000; vertical-align: middle; overflow: hidden; }
</style>
</head>
<body>
<table class="render">
<colgroup>${colgroupCols}</colgroup>
<tbody>${bodyRows}</tbody>
</table>
</body>
</html>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
