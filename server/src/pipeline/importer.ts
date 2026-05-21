import { existsSync, mkdirSync, copyFileSync, readFileSync } from "fs";
import { join, extname, basename } from "path";
import { getDb } from "../db/db";
import { getDataDir, getSettings } from "../settings";
import { parsePdf } from "./pdfParser";
import { ocrFile } from "./ocrParser";
import { parseDocx } from "./docxParser";
import { parseXlsx } from "./xlsxParser";
import { extractDocument, extractWithTemplate } from "./extractor";
import { pickTemplate } from "../templates/seedTemplates";
import { generateContractReminders } from "../reminders/scheduler";
import type { WsEvent, DocTemplate, DynamicExtraction } from "../../src/shared/types.js";

type PushFn = (event: WsEvent) => void;

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".md": "text/markdown",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

async function computeHash(filePath: string): Promise<string> {
  const buf = readFileSync(filePath);
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(buf);
  return hasher.digest("hex");
}

export async function importFile(originalPath: string, push?: PushFn): Promise<number> {
  const db = getDb();
  const settings = getSettings();

  const ext = extname(originalPath);
  const fileName = basename(originalPath);
  const fileHash = await computeHash(originalPath);
  const fileSize = (await Bun.file(originalPath).arrayBuffer()).byteLength;
  const mimeType = getMimeType(ext);

  // Dedup check
  const existing = db.prepare("SELECT id FROM documents WHERE file_hash = ?").get(fileHash) as
    | { id: number }
    | null;
  if (existing) {
    console.log(`[importer] Skipping duplicate: ${fileName}`);
    return existing.id;
  }

  // Copy to managed documents folder
  const docsDir = join(getDataDir(), "documents");
  mkdirSync(docsDir, { recursive: true });
  const managedPath = join(docsDir, `${fileHash}${ext}`);
  if (!existsSync(managedPath)) {
    copyFileSync(originalPath, managedPath);
  }

  // Insert document record
  const insertResult = db
    .prepare(
      `INSERT INTO documents (file_name, file_path, original_path, file_hash, mime_type, file_size_bytes, import_date, processing_status)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 'queued')`
    )
    .run(fileName, managedPath, originalPath, fileHash, mimeType, fileSize);
  const documentId = Number(insertResult.lastInsertRowid);

  push?.({ type: "document:queued", documentId, fileName });
  console.log(`[importer] Queued document ${documentId}: ${fileName}`);

  // Process asynchronously so the HTTP response can return immediately
  processDocument(documentId, managedPath, mimeType, ext, push).catch((err) => {
    console.error(`[importer] Fatal error processing doc ${documentId}:`, err);
    db.prepare(
      `UPDATE documents SET processing_status='error', error_message=?, updated_at=datetime('now') WHERE id=?`
    ).run(String(err), documentId);
    push?.({ type: "document:done", documentId, status: "error", error: String(err) });
  });

  return documentId;
}

export async function processDocument(
  documentId: number,
  filePath: string,
  mimeType: string,
  ext: string,
  push?: PushFn
) {
  const db = getDb();
  const settings = getSettings();

  db.prepare(
    `UPDATE documents SET processing_status='processing', updated_at=datetime('now') WHERE id=?`
  ).run(documentId);
  push?.({ type: "document:progress", documentId, stage: "extracting_text", progress: 10 });

  // Step 1: Extract raw text
  let rawText = "";
  let pageCount: number | null = null;

  try {
    if (mimeType === "application/pdf") {
      const pdfResult = await parsePdf(filePath);
      pageCount = pdfResult.pageCount;
      if (pdfResult.needsOcr) {
        push?.({ type: "document:progress", documentId, stage: "ocr", progress: 25 });
        rawText = await ocrFile(filePath);
      } else {
        rawText = pdfResult.text;
      }
    } else if (mimeType.startsWith("image/")) {
      push?.({ type: "document:progress", documentId, stage: "ocr", progress: 25 });
      rawText = await ocrFile(filePath);
    } else if (ext === ".docx") {
      rawText = await parseDocx(filePath);
    } else if (ext === ".xlsx") {
      rawText = parseXlsx(filePath);
    } else {
      rawText = await Bun.file(filePath).text();
    }
  } catch (err) {
    const msg = `Text extraction failed: ${err}`;
    db.prepare(
      `UPDATE documents SET processing_status='error', error_message=?, updated_at=datetime('now') WHERE id=?`
    ).run(msg, documentId);
    push?.({ type: "document:done", documentId, status: "error", error: msg });
    return;
  }

  db.prepare(
    `UPDATE documents SET raw_text=?, page_count=?, processing_status='processing', updated_at=datetime('now') WHERE id=?`
  ).run(rawText, pageCount, documentId);

  push?.({ type: "document:progress", documentId, stage: "ai_extraction", progress: 50 });

  // Step 2: AI extraction — template-driven
  if (settings.autoExtract && rawText.trim().length > 0) {
    const docRow = db
      .prepare("SELECT file_name FROM documents WHERE id = ?")
      .get(documentId) as { file_name: string } | null;

    // Pick the best template (by keyword match → default → first)
    const template = pickTemplate(db, rawText);

    if (template) {
      const run = await extractWithTemplate(rawText, template, documentId, docRow?.file_name);

      // Persist as an extractions row (use raw JSON; keep backend/model)
      db.prepare(
        `INSERT INTO extractions (document_id, backend, model, result_json, parsed_ok, error, exec_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        documentId,
        run.backend,
        run.model,
        run.rawJson,
        run.fields ? 1 : 0,
        run.error,
        run.execMs
      );

      if (run.fields) {
        // Save the dynamic fields blob + link to template
        db.prepare(
          `UPDATE documents SET extracted_fields = ?, template_id = ?,
                                document_type = ?,
                                updated_at = datetime('now')
           WHERE id = ?`
        ).run(JSON.stringify(run.fields), template.id, template.name, documentId);

        push?.({ type: "document:progress", documentId, stage: "saving_entities", progress: 75 });
        await saveTemplateEntities(documentId, template, run.fields);
      } else if (run.error) {
        const msg = `AI extraction failed: ${run.error}`;
        db.prepare(
          `UPDATE documents SET processing_status='error', error_message=?, updated_at=datetime('now') WHERE id=?`
        ).run(msg, documentId);
        push?.({ type: "document:done", documentId, status: "error", error: msg });
        console.error(`[importer] ${msg}`);
        return;
      }
    } else {
      // No templates configured — fall back to the legacy fixed prompt
      const extraction = await extractDocument(rawText, documentId, docRow?.file_name);
      db.prepare(
        `INSERT INTO extractions (document_id, backend, model, result_json, parsed_ok, error, exec_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(documentId, extraction.backend, extraction.model, extraction.rawJson,
            extraction.result ? 1 : 0, extraction.error, extraction.execMs);
      if (extraction.result) {
        push?.({ type: "document:progress", documentId, stage: "saving_entities", progress: 75 });
        await saveExtractionEntities(documentId, extraction.result);
      } else if (extraction.error) {
        const msg = `AI extraction failed: ${extraction.error}`;
        db.prepare(
          `UPDATE documents SET processing_status='error', error_message=?, updated_at=datetime('now') WHERE id=?`
        ).run(msg, documentId);
        push?.({ type: "document:done", documentId, status: "error", error: msg });
        return;
      }
    }
  }

  // Step 3: Mark done
  db.prepare(
    `UPDATE documents SET processing_status='done', updated_at=datetime('now') WHERE id=?`
  ).run(documentId);
  push?.({ type: "document:done", documentId, status: "done" });
  console.log(`[importer] Done processing document ${documentId}`);
}

async function saveExtractionEntities(
  documentId: number,
  result: import("../../src/shared/types.js").ExtractionResult
) {
  const db = getDb();

  // Persist document_type / document_number on the document row
  if (result.document_type || result.document_number) {
    db.prepare(
      `UPDATE documents SET document_type=COALESCE(?,document_type),
                            document_number=COALESCE(?,document_number),
                            updated_at=datetime('now')
       WHERE id=?`
    ).run(result.document_type ?? null, result.document_number ?? null, documentId);
  }

  // ── Upsert client ──────────────────────────────────────────────────────────
  // Prefer COMPANY as the client (matches business expectation: track companies,
  // contact person is stored in notes). Fall back to person if no company found.
  let clientId: number | null = null;
  const displayName = result.client_company ?? result.client_name;
  const entityType: "company" | "person" = result.client_company ? "company" : "person";

  if (displayName) {
    const existing = db
      .prepare("SELECT id, email, phone, address, notes FROM clients WHERE display_name = ? COLLATE NOCASE")
      .get(displayName) as
      | { id: number; email: string | null; phone: string | null; address: string | null; notes: string | null }
      | null;

    // Build a notes line with the contact person (when client is a company)
    const contactNote =
      result.client_company && result.client_name ? `איש קשר: ${result.client_name}` : null;

    if (existing) {
      clientId = existing.id;
      const mergedNotes =
        contactNote && !(existing.notes ?? "").includes(contactNote)
          ? [existing.notes, contactNote].filter(Boolean).join("\n")
          : existing.notes;

      db.prepare(
        `UPDATE clients SET
           email   = COALESCE(email,   ?),
           phone   = COALESCE(phone,   ?),
           address = COALESCE(address, ?),
           id_number = COALESCE(id_number, ?),
           notes   = COALESCE(?, notes),
           updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        result.client_email ?? null,
        result.client_phone ?? null,
        result.client_address ?? null,
        result.client_id ?? null,
        mergedNotes,
        clientId
      );
    } else {
      const r = db
        .prepare(
          `INSERT INTO clients (display_name, entity_type, id_number, email, phone, address, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          displayName,
          entityType,
          result.client_id ?? null,
          result.client_email ?? null,
          result.client_phone ?? null,
          result.client_address ?? null,
          contactNote
        );
      clientId = Number(r.lastInsertRowid);
    }

    // Link document ↔ client
    db.prepare(
      `INSERT OR IGNORE INTO document_clients (document_id, client_id, role) VALUES (?, ?, 'party_a')`
    ).run(documentId, clientId, );

    // Timeline event
    db.prepare(
      `INSERT INTO timeline_events (client_id, event_type, title, description, event_date, source_id, source_type)
       VALUES (?, 'document_added', ?, ?, datetime('now'), ?, 'document')`
    ).run(
      clientId,
      result.document_type ? `${result.document_type} יובא` : "מסמך חדש יובא",
      result.summary_hebrew ?? null,
      documentId
    );
  }

  // ── Save contract / inspection record ──────────────────────────────────────
  // Any document with an expiry_date (next inspection / next renewal / next
  // action date) gets a "contract" row so a reminder can be generated.
  if (result.expiry_date || result.start_date || result.contract_number || result.document_number) {
    const r = db
      .prepare(
        `INSERT INTO contracts (document_id, client_id, contract_number, contract_type, start_date, expiry_date, amount, currency, counterparty, summary, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        documentId,
        clientId,
        result.contract_number ?? result.document_number ?? null,
        result.contract_type ?? result.document_type ?? null,
        result.start_date ?? null,
        result.expiry_date ?? null,
        result.amount ?? null,
        result.currency ?? "ILS",
        (result.parties ?? [])
          .filter((p) => p !== (result.client_company ?? result.client_name))
          .join(", ") || null,
        result.summary_hebrew ?? null,
        result.confidence ?? "medium"
      );
    const contractId = Number(r.lastInsertRowid);

    if (result.expiry_date) {
      generateContractReminders(contractId, clientId, documentId, result.expiry_date);
    }
  }

  // ── Save tasks ─────────────────────────────────────────────────────────────
  for (const task of result.tasks ?? []) {
    db.prepare(
      `INSERT INTO tasks (document_id, client_id, description, due_date) VALUES (?, ?, ?, ?)`
    ).run(documentId, clientId, task.description, task.due_date ?? null);
  }
}

/**
 * Project a template-extracted flat object onto the existing entity tables.
 * Conventions (looked up by `key` in the template fields):
 *   - client_company / client_name / contact_person  → clients.display_name (+ notes)
 *   - contact_phone / contact_email / client_address → clients.phone/email/address
 *   - contract_number / report_number / invoice_number → contracts.contract_number
 *   - start_date / inspection_date / issue_date      → contracts.start_date
 *   - template.expiry_field value                    → contracts.expiry_date (drives reminders!)
 *   - amount / currency                               → contracts.amount/currency
 *
 * Any field the template defines but we don't know how to project is still
 * preserved verbatim in documents.extracted_fields (already saved earlier).
 */
async function saveTemplateEntities(
  documentId: number,
  template: DocTemplate,
  fields: DynamicExtraction
) {
  const db = getDb();
  const f = fields;

  const getStr = (k: string): string | null => {
    const v = f[k];
    if (v === undefined || v === null || v === "") return null;
    return String(v);
  };
  const getNum = (k: string): number | null => {
    const v = f[k];
    if (v === undefined || v === null || v === "") return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  };

  // ── Client ────────────────────────────────────────────────────────────────
  const clientCompany = getStr("client_company");
  const contactPerson = getStr("contact_person") ?? getStr("client_name");
  const displayName = clientCompany ?? contactPerson;
  const entityType: "company" | "person" = clientCompany ? "company" : "person";

  let clientId: number | null = null;
  if (displayName) {
    const existing = db
      .prepare("SELECT id, notes FROM clients WHERE display_name = ? COLLATE NOCASE")
      .get(displayName) as { id: number; notes: string | null } | null;

    const contactNote =
      clientCompany && contactPerson ? `איש קשר: ${contactPerson}` : null;

    if (existing) {
      clientId = existing.id;
      const mergedNotes =
        contactNote && !(existing.notes ?? "").includes(contactNote)
          ? [existing.notes, contactNote].filter(Boolean).join("\n")
          : existing.notes;
      db.prepare(
        `UPDATE clients SET
           email = COALESCE(email, ?), phone = COALESCE(phone, ?),
           address = COALESCE(address, ?), id_number = COALESCE(id_number, ?),
           notes = COALESCE(?, notes), updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        getStr("contact_email"),
        getStr("contact_phone"),
        getStr("client_address"),
        getStr("client_id"),
        mergedNotes,
        clientId
      );
    } else {
      const r = db
        .prepare(
          `INSERT INTO clients (display_name, entity_type, id_number, email, phone, address, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          displayName,
          entityType,
          getStr("client_id"),
          getStr("contact_email"),
          getStr("contact_phone"),
          getStr("client_address"),
          contactNote
        );
      clientId = Number(r.lastInsertRowid);
    }

    db.prepare(
      `INSERT OR IGNORE INTO document_clients (document_id, client_id, role) VALUES (?, ?, 'party_a')`
    ).run(documentId, clientId);

    db.prepare(
      `INSERT INTO timeline_events (client_id, event_type, title, description, event_date, source_id, source_type)
       VALUES (?, 'document_added', ?, ?, datetime('now'), ?, 'document')`
    ).run(clientId, `${template.name} יובא`, null, documentId);
  }

  // ── Contract / Inspection record ─────────────────────────────────────────
  const docNumber =
    getStr("contract_number") ?? getStr("report_number") ?? getStr("invoice_number");
  const startDate =
    getStr("start_date") ?? getStr("inspection_date") ?? getStr("issue_date");
  const expiryDate = template.expiry_field ? getStr(template.expiry_field) : null;

  if (docNumber || startDate || expiryDate) {
    const r = db
      .prepare(
        `INSERT INTO contracts (document_id, client_id, contract_number, contract_type,
                                start_date, expiry_date, amount, currency, summary, confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        documentId,
        clientId,
        docNumber,
        template.name,
        startDate,
        expiryDate,
        getNum("amount"),
        getStr("currency") ?? "ILS",
        getStr("findings") ?? getStr("notes") ?? getStr("summary_hebrew"),
        (getStr("_confidence") as "high" | "medium" | "low") ?? "medium"
      );
    const contractId = Number(r.lastInsertRowid);
    if (expiryDate) {
      generateContractReminders(contractId, clientId, documentId, expiryDate);
    }
  }
}
