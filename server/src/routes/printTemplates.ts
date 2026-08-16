import type {Express} from "express";
import {existsSync, mkdirSync, statSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {col} from "../db/db.js";
import {requireAuth} from "../auth/middleware.js";
import {ObjectId} from "mongodb";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {getDataDir} from "../settings.js";
import {getSpacesSignedUrl, spacesEnabled, uploadToSpaces} from "../storage/spaces.js";
import {renderSectionTemplateHtml} from "./printTemplateLayoutRender.js";

async function getEngineerData(userId: string): Promise<Record<string, string>> {
    try {
        const [engineerProfile, user] = await Promise.all([
            col("engineer_profiles").findOne({user_id: userId}),
            col("users").findOne({_id: tryObjectId(userId)}),
        ]) as [any, any];
        const companyName = engineerProfile?.company_name || user?.company_name || "";
        return {
            engineer_name: engineerProfile?.full_name || user?.name || "",
            engineer_email: engineerProfile?.company_email || user?.email || "",
            engineer_phone: engineerProfile?.company_phone || user?.phone || "",
            engineer_company: companyName,
            inspector_number: engineerProfile?.inspector_number || "",
            company_name: companyName,
            company_registration: engineerProfile?.company_registration || "",
            engineer_address: engineerProfile?.address || "",
        };
    } catch {
        return {};
    }
}

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

  app.get("/api/print-templates/drafts", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const drafts = await col("print_template_drafts")
      .find({ user_id: auth.userId })
      .sort({ updated_at: -1 })
      .limit(200)
      .toArray();
    const templateIds = drafts.map((draft: any) => tryObjectId(String(draft.template_id)));
    const clientIds = drafts.map((draft: any) => draft.client_id).filter(Boolean).map((id: string) => tryObjectId(String(id)));
    const contractIds = drafts.map((draft: any) => draft.contract_id).filter(Boolean).map((id: string) => tryObjectId(String(id)));
    const [templates, clients, contracts] = await Promise.all([
      templateIds.length ? col("print_templates").find({ _id: { $in: templateIds }, user_id: auth.userId } as any).toArray() : [],
      clientIds.length ? col("clients").find({ _id: { $in: clientIds }, user_id: auth.userId } as any).toArray() : [],
      contractIds.length ? col("contracts").find({ _id: { $in: contractIds }, user_id: auth.userId } as any).toArray() : [],
    ]);
    const templateMap = new Map((templates as any[]).map((template) => [String(template._id), template]));
    const clientMap = new Map((clients as any[]).map((client) => [String(client._id), client]));
    const contractMap = new Map((contracts as any[]).map((contract) => [String(contract._id), contract]));
    res.json(drafts.map((draft: any) => {
      const template = templateMap.get(String(draft.template_id));
      const client = draft.client_id ? clientMap.get(String(draft.client_id)) : null;
      const contract = draft.contract_id ? contractMap.get(String(draft.contract_id)) : null;
      return {
        _id: draft._id.toString(),
        template_id: draft.template_id,
        template_name: template?.name ?? "תבנית",
        client_id: draft.client_id ?? null,
        client_name: client?.display_name ?? client?.name ?? client?.company ?? null,
        contract_id: draft.contract_id ?? null,
        contract_number: contract?.contract_number ?? draft.data?.document_number ?? draft.data?.contract_number ?? draft.data?.report_number ?? null,
        contract_type: contract?.contract_type ?? draft.data?.inspection_type ?? "טיוטת תסקיר",
        updated_at: draft.updated_at ?? draft.created_at ?? null,
        data: draft.data ?? {},
        meta: draft.meta ?? {},
      };
    }));
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
    const { name, page, dir, cols, rows, cells, hasFixedFrame, editorType, layout } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const now = new Date().toISOString();
    const isSections = editorType === "sections";
    const doc = {
      user_id: auth.userId,
      name,
      page: page ?? "A4",
      dir: dir ?? "rtl",
      cols: cols ?? [],
      rows: rows ?? [],
      cells: cells ?? [],
      hasFixedFrame: !!hasFixedFrame,
      editorType: isSections ? "sections" : "grid",
      layout: isSections ? layout ?? null : null,
      created_at: now,
      updated_at: now,
    };
    const result = await col("print_templates").insertOne(doc as any);
    res.status(201).json({ ...doc, _id: result.insertedId.toString() });
  });

  // Update print template
  app.put("/api/print-templates/:id", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const { name, page, dir, cols, rows, cells, hasFixedFrame, editorType, layout } = req.body;
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: now };
    if (name !== undefined) update.name = name;
    if (page !== undefined) update.page = page;
    if (dir !== undefined) update.dir = dir;
    if (cols !== undefined) update.cols = cols;
    if (rows !== undefined) update.rows = rows;
    if (cells !== undefined) update.cells = cells;
    if (hasFixedFrame !== undefined) update.hasFixedFrame = hasFixedFrame;
    if (editorType !== undefined) update.editorType = editorType === "sections" ? "sections" : "grid";
    if (layout !== undefined) update.layout = layout;
    const result = await col("print_templates").findOneAndUpdate(
      { _id: tryObjectId(req.params.id), user_id: auth.userId },
      { $set: update },
      { returnDocument: "after" }
    );
    if (!result) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ...result, _id: result._id.toString() });
  });

  // Get saved fill draft for a template
  app.get("/api/print-templates/:id/draft", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const template = await col("print_templates").findOne({ _id: tryObjectId(req.params.id), user_id: auth.userId });
    if (!template) { res.status(404).json({ error: "Not found" }); return; }
    const contractId = typeof req.query.contractId === "string" && req.query.contractId.trim() ? req.query.contractId.trim() : null;
    const draft = contractId
      ? await col("print_template_drafts").findOne({ user_id: auth.userId, template_id: req.params.id, contract_id: contractId }) as any
      : await col("print_template_drafts").findOne({ user_id: auth.userId, template_id: req.params.id, contract_id: { $in: [null, undefined] } }) as any;
    res.json({
      data: draft?.data ?? {},
      meta: draft?.meta ?? {},
      client_id: draft?.client_id ?? draft?.meta?.client_id ?? null,
      contract_id: draft?.contract_id ?? draft?.meta?.contract_id ?? null,
      updated_at: draft?.updated_at ?? null,
    });
  });

  // Save fill draft for a template
  app.put("/api/print-templates/:id/draft", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const template = await col("print_templates").findOne({ _id: tryObjectId(req.params.id), user_id: auth.userId });
    if (!template) { res.status(404).json({ error: "Not found" }); return; }
    const data = sanitizeDraftData(req.body?.data ?? {});
    const meta = sanitizeDraftMeta(req.body?.meta ?? {});
    const clientId = typeof meta.client_id === "string" && meta.client_id.trim() ? meta.client_id.trim() : null;
    const contractId = typeof meta.contract_id === "string" && meta.contract_id.trim() ? meta.contract_id.trim() : null;
    const now = new Date().toISOString();
    const filter: Record<string, unknown> = contractId
      ? { user_id: auth.userId, contract_id: contractId }
      : { user_id: auth.userId, template_id: req.params.id, contract_id: { $in: [null, undefined] } };
    await col("print_template_drafts").updateOne(
      filter,
      {
        $set: {
          user_id: auth.userId,
          template_id: req.params.id,
          data,
          meta,
          client_id: clientId,
          contract_id: contractId,
          updated_at: now,
        },
        $setOnInsert: { created_at: now },
      },
      { upsert: true }
    );
    res.json({ ok: true, data, meta, client_id: clientId, contract_id: contractId, updated_at: now });
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
      const clientData: Record<string, unknown> = req.body.data ?? {};
      const engineerDefaults = await getEngineerData(auth.userId);
      const data: Record<string, unknown> = {...engineerDefaults, ...clientData};
    try {
      const pdf = await renderTemplatePdf(t, data);
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `inline; filename="template-${t._id}.pdf"`);
      res.send(Buffer.from(pdf));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post("/api/print-templates/:id/pdf/save", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const t = await col("print_templates").findOne({ _id: tryObjectId(req.params.id), user_id: auth.userId }) as any;
    if (!t) { res.status(404).json({ error: "Not found" }); return; }
      const clientData: Record<string, unknown> = req.body.data ?? {};
      const engineerDefaults = await getEngineerData(auth.userId);
      const data: Record<string, unknown> = {...engineerDefaults, ...clientData};
    const meta = sanitizeDraftMeta(req.body?.meta ?? {});
    try {
      const pdf = Buffer.from(await renderTemplatePdf(t, data));
      const savedDocument = await saveGeneratedPdfDocument({
        userId: auth.userId,
        template: t,
        data,
        meta,
        pdf,
      });
      // The document now exists, so the compose draft has served its purpose —
      // remove it so it stops showing as a stale טיוטה alongside the contract.
      await deleteMatchingDraft(auth.userId, String(t._id), meta);
      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(generatedPdfFileName(t, data))}`);
      res.set("X-Document-Id", savedDocument.documentId);
      res.set("X-Saved-To-S3", savedDocument.savedToS3 ? "true" : "false");
      res.send(pdf);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Delete a saved compose draft. Scoped by contract when provided (a draft is
  // keyed by (user, contract) once linked, else by (user, template)).
  app.delete("/api/print-templates/:id/draft", async (req, res) => {
    let auth: Awaited<ReturnType<typeof requireAuth>>;
    try { auth = await requireAuth(req.headers.cookie ?? undefined); } catch { res.status(401).json({ error: "Unauthorized" }); return; }
    const contractId = typeof req.query.contractId === "string" && req.query.contractId.trim() ? req.query.contractId.trim() : null;
    const filter = contractId
      ? { user_id: auth.userId, contract_id: contractId }
      : { user_id: auth.userId, template_id: req.params.id, contract_id: { $in: [null, undefined] } };
    const result = await col("print_template_drafts").deleteOne(filter);
    res.json({ ok: true, deleted: result.deletedCount });
  });
}

async function deleteMatchingDraft(userId: string, templateId: string, meta: Record<string, unknown>): Promise<void> {
  const contractId = typeof meta.contract_id === "string" && meta.contract_id.trim() ? meta.contract_id.trim() : null;
  const filter = contractId
    ? { user_id: userId, contract_id: contractId }
    : { user_id: userId, template_id: templateId, contract_id: { $in: [null, undefined] } };
  try {
    await col("print_template_drafts").deleteOne(filter);
  } catch (err) {
    console.error("[print-templates] failed to delete draft after PDF save:", err);
  }
}

async function renderTemplatePdf(t: any, data: Record<string, unknown>): Promise<Uint8Array> {
  const html = t.editorType === "sections" && t.layout
    ? renderSectionTemplateHtml(t.layout, data, t.dir ?? "rtl")
    : renderTemplateHtml(t, data);
  const { default: puppeteer } = await import("puppeteer-core");
  const launch = await resolveBrowserLaunch();
  const browser = await puppeteer.launch(launch);
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: t.page ?? "A4", printBackground: true });
  } finally {
    await browser.close();
  }
}

type BrowserLaunchOptions = {
  executablePath: string;
  args: string[];
  headless?: boolean | "shell";
};

// Prefer a real system browser (fast, no download). Fall back to the bundled
// @sparticuz/chromium so hosts without a working Chromium (e.g. a snap stub at
// /usr/bin/chromium-browser that only errors) can still render PDFs.
async function resolveBrowserLaunch(): Promise<BrowserLaunchOptions> {
  // chromiumExecutablePath() already filters out broken snap stubs, so a
  // non-null result here is a launchable browser.
  const systemPath = chromiumExecutablePath();
  if (systemPath) {
    return {
      executablePath: systemPath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };
  }
  try {
    const { default: chromium } = await import("@sparticuz/chromium");
    const executablePath = await chromium.executablePath();
    if (executablePath) {
      return {
        executablePath,
        args: chromium.args,
        headless: chromium.headless as boolean | "shell",
      };
    }
  } catch (err) {
    console.error("[print-templates] @sparticuz/chromium fallback failed:", err);
  }
  throw new Error(
    "No usable Chromium found. Set PUPPETEER_EXECUTABLE_PATH/CHROME_BIN/CHROMIUM_PATH or ensure @sparticuz/chromium is installed."
  );
}

// Ubuntu snap ships /usr/bin/chromium-browser as a wrapper that fails to launch
// unless the chromium snap is installed. The file exists, so existsSync passes,
// but puppeteer.launch() errors with "requires the chromium snap".
function isBrokenSnapStub(path: string): boolean {
  if (!/chromium(-browser)?$/.test(path)) return false;
  try {
    const probe = spawnSync(path, ["--version"], { encoding: "utf8", timeout: 5000 });
    const output = `${probe.stdout ?? ""}${probe.stderr ?? ""}`;
    if (probe.status !== 0) return true;
    return /requires the chromium snap|snap install chromium/i.test(output);
  } catch {
    return true;
  }
}

async function saveGeneratedPdfDocument(args: {
  userId: string;
  template: any;
  data: Record<string, unknown>;
  meta: Record<string, unknown>;
  pdf: Buffer;
}): Promise<{ documentId: string; savedToS3: boolean }> {
  const {userId, template, data, meta, pdf} = args;
  const fileHash = createHash("sha256").update(pdf).digest("hex");
  const fileName = generatedPdfFileName(template, data);
  const now = new Date();
  const docsDir = join(getDataDir(), "documents");
  mkdirSync(docsDir, { recursive: true });
  const managedPath = join(docsDir, `${fileHash}.pdf`);
  if (!existsSync(managedPath)) writeFileSync(managedPath, pdf);

  let spacesKey: string | null = null;
  let spacesUrl: string | null = null;
  let downloadUrl: string | null = null;
  const SIGNED_URL_TTL = 7 * 24 * 3600;
  if (spacesEnabled()) {
    try {
      spacesKey = `documents/${userId}/${fileHash}.pdf`;
      spacesUrl = await uploadToSpaces(managedPath, spacesKey, "application/pdf");
      downloadUrl = await getSpacesSignedUrl(spacesKey, SIGNED_URL_TTL, fileName);
    } catch (err) {
      console.warn("[warn] generated_pdf_s3_upload_failed", err);
      spacesKey = null;
      spacesUrl = null;
      downloadUrl = null;
    }
  }

  const signedUrlExpiresAt = downloadUrl ? new Date(Date.now() + SIGNED_URL_TTL * 1000) : null;
  const contractId = typeof meta.contract_id === "string" && meta.contract_id.trim() ? meta.contract_id.trim() : null;
  const clientId = typeof meta.client_id === "string" && meta.client_id.trim() ? meta.client_id.trim() : null;
  const docRecord: Record<string, any> = {
    user_id: userId,
    file_name: fileName,
    file_path: managedPath,
    original_path: managedPath,
    file_hash: fileHash,
    mime_type: "application/pdf",
    file_size_bytes: statSync(managedPath).size,
    import_date: now,
    processing_status: "done",
    document_source: "generated",
    document_kind: "generated_print_template_pdf",
    template_id: String(template._id),
    client_id: clientId,
    contract_id: contractId,
    extracted_fields: data,
    ai_extracted: false,
    created_at: now,
    updated_at: now,
    spaces_key: spacesKey,
    spaces_url: spacesUrl,
    download_url: downloadUrl,
    signed_url_expires_at: signedUrlExpiresAt,
  };

  const existing = await col("documents").findOne({ user_id: userId, file_hash: fileHash });
  let documentId: string;
  if (existing) {
    documentId = existing._id.toString();
    await col("documents").updateOne(
      { _id: existing._id },
      { $set: {...docRecord, updated_at: now} }
    );
  } else {
    documentId = (await col("documents").insertOne(docRecord)).insertedId.toString();
  }

  if (clientId) {
    await col("document_clients").updateOne(
      { document_id: documentId, client_id: clientId },
      { $setOnInsert: { document_id: documentId, client_id: clientId, user_id: userId, created_at: now } },
      { upsert: true }
    );
  }
  if (contractId) {
    await col("contracts").updateOne(
      { _id: tryObjectId(contractId), user_id: userId },
      { $set: { document_id: documentId, updated_at: now } }
    );
  }
  return {documentId, savedToS3: Boolean(spacesKey)};
}

function generatedPdfFileName(template: any, data: Record<string, unknown>): string {
  const stem = [
    pickFirstString(data, ["equipment_type", "inspection_type", "contract_type", "type", "checked_equipment"]),
    pickFirstString(data, ["license_number", "lisence_number"]),
    pickFirstString(data, ["client_company", "client_name", "company", "counterparty"]),
    pickFirstString(data, ["contract_number", "document_number", "report_number"]),
  ].filter(Boolean).join(" ");
  return `${safeFileStem(stem || "template")}.pdf`;
}

function pickFirstString(data: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function safeFileStem(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ") || "template";
}

function chromiumExecutablePath(): string | undefined {
  const configured = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    process.env.CHROMIUM_PATH,
  ].find((value) => value && existsSync(value));
  if (configured) return configured;

  const envCandidates = [
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
    process.env["PROGRAMFILES(X86)"] ? `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe` : undefined,
    process.env.PROGRAMFILES ? `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe` : undefined,
    process.env["PROGRAMFILES(X86)"] ? `${process.env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe` : undefined,
    // Nix-provided Chromium (Railway/Nixpacks) — real binary, prefer over the
    // Ubuntu snap stub at /usr/bin/chromium-browser which only errors.
    "/nix/var/nix/profiles/default/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ];
  const existingCandidate = envCandidates.find(
    (value) => value && existsSync(value) && !isBrokenSnapStub(value)
  );
  if (existingCandidate) return existingCandidate;

  const onPath = findExecutableOnPath(["chromium", "google-chrome", "chrome", "msedge", "chromium-browser"]);
  return onPath && !isBrokenSnapStub(onPath) ? onPath : undefined;
}

function findExecutableOnPath(names: string[]): string | undefined {
  const command = process.platform === "win32" ? "where" : "which";
  for (const name of names) {
    const result = spawnSync(command, [name], { encoding: "utf8" });
    const first = result.stdout?.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
    if (result.status === 0 && first && existsSync(first)) return first;
  }
  return undefined;
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

    const totalW = colWidths.reduce((s, w) => s + w, 0) || 1;
    const colgroupCols = colWidths.map(w => `<col style="width:${((w / totalW) * 100).toFixed(4)}%">`).join("");

  const bodyRows = rows.map((row, ri) => {
    const tds = colWidths.map((_, ci) => {
      if (masked[ri]?.[ci]) return "";
      const cell = cells.find(c => c.r === ri && c.c === ci);
      const colspan = cell?.colSpan ? ` colspan="${cell.colSpan}"` : "";
      const rowspan = cell?.rowSpan ? ` rowspan="${cell.rowSpan}"` : "";
      const align = cell?.align ?? (dir === "rtl" ? "right" : "left");
      const valign = cell?.valign ?? "middle";
      const bold = cell?.bold ? "font-weight:700;" : "";
      const color = cell?.color ? `color:${cssColor(cell.color)};` : "";
      const border = cellBorderCss(cell?.border);
      const fontSize = typeof cell?.fontSize === "number" && cell.fontSize > 0 ? `font-size:${cell.fontSize}px;` : "";
        const cellW = typeof cell?.cellWidth === "number" && cell.cellWidth > 0 ? `width:${cell.cellWidth}px;` : "";
        const style = `text-align:${align};vertical-align:${valign};${bold}${color}${border}${fontSize}${cellW}`;
      let content = "";
      if (cell?.type === "label") {
        content = cell.html ? sanitizeRichHtml(cell.html) : escHtml(cell.text ?? "");
      } else if (cell?.type === "field" && cell.bind) {
        content = escHtml(String(data[cell.bind] ?? ""));
      } else if (cell?.type === "image") {
        content = imageHtml(cell);
      }
      return `<td${colspan}${rowspan} dir="auto" style="${style}">${content}</td>`;
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
  table.render { border-collapse: collapse; width: 100%; table-layout: auto; }
  table.render td { vertical-align: middle; padding: 2px 4px; }
  table.render img.cell-img { display: block; max-width: 100%; max-height: 100%; margin: 0 auto; object-fit: contain; }
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

function borderSideCss(style: unknown): string {
  switch (style) {
    case "medium": return "2px solid #000";
    case "thick":  return "3px solid #000";
    case "double": return "3px double #000";
    case "thin":   return "1px solid #000";
    default:       return "none";
  }
}

function resolveBorderSides(border: unknown): { top: unknown; right: unknown; bottom: unknown; left: unknown } {
  if (border === undefined) return { top: "thin", right: "thin", bottom: "thin", left: "thin" };
  if (border === "none") return { top: undefined, right: undefined, bottom: undefined, left: undefined };
  if (typeof border === "string") return { top: border, right: border, bottom: border, left: border };
  const b = border as Record<string, unknown>;
  return { top: b.top, right: b.right, bottom: b.bottom, left: b.left };
}

// Emit explicit per-side border declarations (the table CSS no longer sets a
// default td border, so "none" sides truly clear).
function cellBorderCss(border: unknown): string {
  const s = resolveBorderSides(border);
  return `border-top:${borderSideCss(s.top)};border-right:${borderSideCss(s.right)};border-bottom:${borderSideCss(s.bottom)};border-left:${borderSideCss(s.left)};`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeDraftData(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || value == null) continue;
    clean[key] = String(value);
  }
  return clean;
}

function sanitizeDraftMeta(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || value == null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      clean[key] = value;
    } else if (Array.isArray(value)) {
      clean[key] = value
        .filter((item) => ["string", "number", "boolean"].includes(typeof item))
        .map((item) => String(item));
    }
  }
  return clean;
}

function imageHtml(cell: any): string {
  const src = safeImageSrc(String(cell?.src ?? ""));
  if (!src) return "";
  return `<img class="cell-img" src="${escAttr(src)}" alt="${escAttr(String(cell?.alt ?? ""))}">`;
}

function safeImageSrc(src: string): string {
  const value = src.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,/i.test(value)) return value;
  if (value.startsWith("/")) return value;
  return "";
}

function sanitizeRichHtml(html: string): string {
  const tokens: string[] = [];
  const protectedHtml = html.replace(
    /<\/?(?:b|strong)>|<br\s*\/?>|<span\s+style=["']color:\s*#[0-9a-f]{3}(?:[0-9a-f]{3})?["']\s*>|<\/span>/gi,
    (tag) => {
      const normalized = normalizeRichTag(tag);
      if (!normalized) return "";
      const idx = tokens.push(normalized) - 1;
      return `@@RICH_${idx}@@`;
    },
  );
  return escHtml(protectedHtml).replace(/@@RICH_(\d+)@@/g, (_match, index) => tokens[Number(index)] ?? "");
}

function cssColor(color: unknown): string {
  const value = String(color ?? "").trim();
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) ? value : "inherit";
}

function escAttr(s: string): string {
  return escHtml(s).replace(/"/g, "&quot;");
}

function normalizeRichTag(tag: string): string {
  if (/^<br/i.test(tag)) return "<br>";
  if (/^<\/(?:b|strong)>$/i.test(tag)) return "</strong>";
  if (/^<(?:b|strong)>$/i.test(tag)) return "<strong>";
  if (/^<\/span>$/i.test(tag)) return "</span>";
  const color = tag.match(/color:\s*(#[0-9a-f]{3}(?:[0-9a-f]{3})?)/i)?.[1];
  return color ? `<span style="color:${color}">` : "";
}
