import { existsSync, mkdirSync, copyFileSync, readFileSync, statSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { join, extname, basename } from "path";
import { col } from "../db/db";
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

function computeHash(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export async function importFile(originalPath: string, push?: PushFn): Promise<string> {
  const settings = getSettings();

  const ext = extname(originalPath);
  const fileName = basename(originalPath);
  const fileHash = computeHash(originalPath);
  const fileSize = statSync(originalPath).size;
  const mimeType = getMimeType(ext);

  // Dedup check
  const existing = await col("documents").findOne({ file_hash: fileHash });
  if (existing) {
    console.log(`[importer] Skipping duplicate: ${fileName}`);
    return existing._id!.toString();
  }

  // Copy to managed documents folder
  const docsDir = join(getDataDir(), "documents");
  mkdirSync(docsDir, { recursive: true });
  const managedPath = join(docsDir, `${fileHash}${ext}`);
  if (!existsSync(managedPath)) {
    copyFileSync(originalPath, managedPath);
  }

  const now = new Date();
  const docRecord = {
    file_name: fileName,
    file_path: managedPath,
    original_path: originalPath,
    file_hash: fileHash,
    mime_type: mimeType,
    file_size_bytes: fileSize,
    import_date: now,
    processing_status: "queued",
    created_at: now,
    updated_at: now,
  };

  const insertResult = await col("documents").insertOne(docRecord as any);
  const documentId = insertResult.insertedId.toString();

  push?.({ type: "document:queued", documentId: documentId as any, fileName });
  console.log(`[importer] Queued document ${documentId}: ${fileName}`);

  processDocument(documentId, managedPath, mimeType, ext, push).catch(async (err) => {
    console.error(`[importer] Fatal error processing doc ${documentId}:`, err);
    await col("documents").updateOne(
      { _id: insertResult.insertedId },
      { $set: { processing_status: "error", error_message: String(err), updated_at: new Date() } }
    );
    push?.({ type: "document:done", documentId: documentId as any, status: "error", error: String(err) });
  });

  return documentId;
}

export async function processDocument(
  documentId: string,
  filePath: string,
  mimeType: string,
  ext: string,
  push?: PushFn
) {
  const settings = getSettings();
  const docFilter = { _id: documentId } as any;

  await col("documents").updateOne(docFilter, {
    $set: { processing_status: "processing", updated_at: new Date() },
  });
  push?.({ type: "document:progress", documentId: documentId as any, stage: "extracting_text", progress: 10 });

  let rawText = "";
  let pageCount: number | null = null;

  try {
    if (mimeType === "application/pdf") {
      const pdfResult = await parsePdf(filePath);
      pageCount = pdfResult.pageCount;
      if (pdfResult.needsOcr) {
        push?.({ type: "document:progress", documentId: documentId as any, stage: "ocr", progress: 25 });
        rawText = await ocrFile(filePath);
      } else {
        rawText = pdfResult.text;
      }
    } else if (mimeType.startsWith("image/")) {
      push?.({ type: "document:progress", documentId: documentId as any, stage: "ocr", progress: 25 });
      rawText = await ocrFile(filePath);
    } else if (ext === ".docx") {
      rawText = await parseDocx(filePath);
    } else if (ext === ".xlsx") {
      rawText = parseXlsx(filePath);
    } else {
      rawText = readFileSync(filePath, "utf-8");
    }
  } catch (err) {
    const msg = `Text extraction failed: ${err}`;
    await col("documents").updateOne(docFilter, {
      $set: { processing_status: "error", error_message: msg, updated_at: new Date() },
    });
    push?.({ type: "document:done", documentId: documentId as any, status: "error", error: msg });
    return;
  }

  await col("documents").updateOne(docFilter, {
    $set: { raw_text: rawText, page_count: pageCount, processing_status: "processing", updated_at: new Date() },
  });

  push?.({ type: "document:progress", documentId: documentId as any, stage: "ai_extraction", progress: 50 });

  if (settings.autoExtract && rawText.trim().length > 0) {
    const docRow = await col("documents").findOne(docFilter) as any;

    const template = await pickTemplate(rawText);

    if (template) {
      const run = await extractWithTemplate(rawText, template, documentId, docRow?.file_name);

      await col("extractions").insertOne({
        document_id: documentId,
        backend: run.backend,
        model: run.model,
        result_json: run.rawJson,
        parsed_ok: run.fields ? 1 : 0,
        error: run.error ?? null,
        exec_ms: run.execMs,
        created_at: new Date(),
      } as any);

      if (run.fields) {
        await col("documents").updateOne(docFilter, {
          $set: {
            extracted_fields: JSON.stringify(run.fields),
            template_id: template.id,
            document_type: template.name,
            updated_at: new Date(),
          },
        });

        push?.({ type: "document:progress", documentId: documentId as any, stage: "saving_entities", progress: 75 });
        await saveTemplateEntities(documentId, template, run.fields);
      } else if (run.error) {
        const msg = `AI extraction failed: ${run.error}`;
        await col("documents").updateOne(docFilter, {
          $set: { processing_status: "error", error_message: msg, updated_at: new Date() },
        });
        push?.({ type: "document:done", documentId: documentId as any, status: "error", error: msg });
        console.error(`[importer] ${msg}`);
        return;
      }
    } else {
      const extraction = await extractDocument(rawText, documentId, docRow?.file_name);
      await col("extractions").insertOne({
        document_id: documentId,
        backend: extraction.backend,
        model: extraction.model,
        result_json: extraction.rawJson,
        parsed_ok: extraction.result ? 1 : 0,
        error: extraction.error ?? null,
        exec_ms: extraction.execMs,
        created_at: new Date(),
      } as any);

      if (extraction.result) {
        push?.({ type: "document:progress", documentId: documentId as any, stage: "saving_entities", progress: 75 });
        await saveExtractionEntities(documentId, extraction.result);
      } else if (extraction.error) {
        const msg = `AI extraction failed: ${extraction.error}`;
        await col("documents").updateOne(docFilter, {
          $set: { processing_status: "error", error_message: msg, updated_at: new Date() },
        });
        push?.({ type: "document:done", documentId: documentId as any, status: "error", error: msg });
        return;
      }
    }
  }

  await col("documents").updateOne(docFilter, {
    $set: { processing_status: "done", updated_at: new Date() },
  });
  push?.({ type: "document:done", documentId: documentId as any, status: "done" });
  console.log(`[importer] Done processing document ${documentId}`);
}

async function saveExtractionEntities(
  documentId: string,
  result: import("../../src/shared/types.js").ExtractionResult
) {
  if (result.document_type || result.document_number) {
    await col("documents").updateOne(
      { _id: documentId } as any,
      {
        $set: {
          ...(result.document_type && { document_type: result.document_type }),
          ...(result.document_number && { document_number: result.document_number }),
          updated_at: new Date(),
        },
      }
    );
  }

  let clientId: string | null = null;
  const displayName = result.client_company ?? result.client_name;
  const entityType: "company" | "person" = result.client_company ? "company" : "person";

  if (displayName) {
    const existing = await col("clients").findOne({
      display_name: { $regex: new RegExp(`^${escapeRegex(displayName)}$`, "i") },
    }) as any;

    const contactNote =
      result.client_company && result.client_name
        ? `איש קשר: ${result.client_name}`
        : null;

    if (existing) {
      clientId = existing._id.toString();
      const mergedNotes =
        contactNote && !(existing.notes ?? "").includes(contactNote)
          ? [existing.notes, contactNote].filter(Boolean).join("\n")
          : existing.notes;

      await col("clients").updateOne(
        { _id: existing._id },
        {
          $set: {
            ...(result.client_email && !existing.email && { email: result.client_email }),
            ...(result.client_phone && !existing.phone && { phone: result.client_phone }),
            ...(result.client_address && !existing.address && { address: result.client_address }),
            ...(result.client_id && !existing.id_number && { id_number: result.client_id }),
            ...(mergedNotes !== existing.notes && { notes: mergedNotes }),
            updated_at: new Date(),
          },
        }
      );
    } else {
      const r = await col("clients").insertOne({
        display_name: displayName,
        entity_type: entityType,
        id_number: result.client_id ?? null,
        email: result.client_email ?? null,
        phone: result.client_phone ?? null,
        address: result.client_address ?? null,
        notes: contactNote,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      clientId = r.insertedId.toString();
    }

    await col("document_clients").updateOne(
      { document_id: documentId, client_id: clientId },
      { $setOnInsert: { document_id: documentId, client_id: clientId, role: "party_a" } },
      { upsert: true }
    );

    await col("timeline_events").insertOne({
      client_id: clientId,
      event_type: "document_added",
      title: result.document_type ? `${result.document_type} יובא` : "מסמך חדש יובא",
      description: result.summary_hebrew ?? null,
      event_date: new Date(),
      source_id: documentId,
      source_type: "document",
      created_at: new Date(),
    } as any);
  }

  if (result.expiry_date || result.start_date || result.contract_number || result.document_number) {
    const r = await col("contracts").insertOne({
      document_id: documentId,
      client_id: clientId,
      contract_number: result.contract_number ?? result.document_number ?? null,
      contract_type: result.contract_type ?? result.document_type ?? null,
      start_date: result.start_date ?? null,
      expiry_date: result.expiry_date ?? null,
      amount: result.amount ?? null,
      currency: result.currency ?? "ILS",
      counterparty:
        (result.parties ?? [])
          .filter((p) => p !== (result.client_company ?? result.client_name))
          .join(", ") || null,
      summary: result.summary_hebrew ?? null,
      confidence: result.confidence ?? "medium",
      status: "active",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    const contractId = r.insertedId.toString();
    if (result.expiry_date) {
      await generateContractReminders(contractId, clientId, documentId, result.expiry_date);
    }
  }

  for (const task of result.tasks ?? []) {
    await col("tasks").insertOne({
      document_id: documentId,
      client_id: clientId,
      description: task.description,
      due_date: task.due_date ?? null,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);
  }
}

async function saveTemplateEntities(
  documentId: string,
  template: DocTemplate,
  fields: DynamicExtraction
) {
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

  const clientCompany = getStr("client_company");
  const contactPerson = getStr("contact_person") ?? getStr("client_name");
  const displayName = clientCompany ?? contactPerson;
  const entityType: "company" | "person" = clientCompany ? "company" : "person";

  let clientId: string | null = null;
  if (displayName) {
    const existing = await col("clients").findOne({
      display_name: { $regex: new RegExp(`^${escapeRegex(displayName)}$`, "i") },
    }) as any;

    const contactNote =
      clientCompany && contactPerson ? `איש קשר: ${contactPerson}` : null;

    if (existing) {
      clientId = existing._id.toString();
      const mergedNotes =
        contactNote && !(existing.notes ?? "").includes(contactNote)
          ? [existing.notes, contactNote].filter(Boolean).join("\n")
          : existing.notes;

      await col("clients").updateOne(
        { _id: existing._id },
        {
          $set: {
            ...(getStr("contact_email") && !existing.email && { email: getStr("contact_email") }),
            ...(getStr("contact_phone") && !existing.phone && { phone: getStr("contact_phone") }),
            ...(getStr("client_address") && !existing.address && { address: getStr("client_address") }),
            ...(getStr("client_id") && !existing.id_number && { id_number: getStr("client_id") }),
            ...(mergedNotes !== existing.notes && { notes: mergedNotes }),
            updated_at: new Date(),
          },
        }
      );
    } else {
      const r = await col("clients").insertOne({
        display_name: displayName,
        entity_type: entityType,
        id_number: getStr("client_id"),
        email: getStr("contact_email"),
        phone: getStr("contact_phone"),
        address: getStr("client_address"),
        notes: contactNote,
        created_at: new Date(),
        updated_at: new Date(),
      } as any);
      clientId = r.insertedId.toString();
    }

    await col("document_clients").updateOne(
      { document_id: documentId, client_id: clientId },
      { $setOnInsert: { document_id: documentId, client_id: clientId, role: "party_a" } },
      { upsert: true }
    );

    await col("timeline_events").insertOne({
      client_id: clientId,
      event_type: "document_added",
      title: `${template.name} יובא`,
      description: null,
      event_date: new Date(),
      source_id: documentId,
      source_type: "document",
      created_at: new Date(),
    } as any);
  }

  const docNumber =
    getStr("contract_number") ?? getStr("report_number") ?? getStr("invoice_number");
  const startDate =
    getStr("start_date") ?? getStr("inspection_date") ?? getStr("issue_date");
  const expiryDate = template.expiry_field ? getStr(template.expiry_field) : null;

  if (docNumber || startDate || expiryDate) {
    const r = await col("contracts").insertOne({
      document_id: documentId,
      client_id: clientId,
      contract_number: docNumber,
      contract_type: template.name,
      start_date: startDate,
      expiry_date: expiryDate,
      amount: getNum("amount"),
      currency: getStr("currency") ?? "ILS",
      summary: getStr("findings") ?? getStr("notes") ?? getStr("summary_hebrew"),
      confidence: (getStr("_confidence") as "high" | "medium" | "low") ?? "medium",
      status: "active",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    const contractId = r.insertedId.toString();
    if (expiryDate) {
      await generateContractReminders(contractId, clientId, documentId, expiryDate);
    }
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
