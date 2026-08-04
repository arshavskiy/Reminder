import {copyFileSync, existsSync, mkdirSync, readFileSync, statSync} from "fs";
import {createHash} from "crypto";
import {basename, extname, join} from "path";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {getDataDir, getSettings} from "../settings";
import {parsePdf} from "./pdfParser";
import {ocrFile} from "./ocrParser";
import {parseDocx} from "./docxParser";
import {parseXlsx} from "./xlsxParser";
import {extractDocument, extractWithTemplate} from "./extractor";
import {extractCertificate} from "./certificateExtractor";
import {extractFromOcr} from "./ocrExtractor";
import {classifyDocumentKind, getOrBuildSystemPrompt, pickTemplate} from "../templates/seedTemplates";
import {generateContractReminders, generateTaskReminders} from "../reminders/scheduler";
import {getSpacesSignedUrl, spacesEnabled, uploadToSpaces} from "../storage/spaces";
import type {DocTemplate, DynamicExtraction} from "../../src/shared/types.js";
import {logger} from "../logger";

type PushFn = (event: Record<string, unknown>) => void;

export interface PipelineOptions {
  skipAi?: boolean;        // skip all AI extraction
  skipEntities?: boolean;  // skip client/contract/equipment creation
  skipReminders?: boolean; // skip reminder generation
}

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

export async function importFile(originalPath: string, push?: PushFn, userId?: string, displayName?: string, pipeline?: PipelineOptions): Promise<string> {
  const settings = getSettings();

  const ext = extname(originalPath);
  const fileName = displayName ?? basename(originalPath);
  const fileHash = computeHash(originalPath);
  const fileSize = statSync(originalPath).size;
  const mimeType = getMimeType(ext);

  // Dedup check — scoped to user if provided
  const dedupFilter: Record<string, any> = { file_hash: fileHash };
  if (userId) dedupFilter.user_id = userId;
  const existing = await col("documents").findOne(dedupFilter);
  if (existing) {
    logger.info("document_import_duplicate", {
      document_id: existing._id!.toString(),
      user_id: userId ?? null,
      file_name: fileName,
    });
    return existing._id!.toString();
  }

  // Copy to managed documents folder
  const docsDir = join(getDataDir(), "documents");
  mkdirSync(docsDir, { recursive: true });
  const managedPath = join(docsDir, `${fileHash}${ext}`);
  if (!existsSync(managedPath)) {
    copyFileSync(originalPath, managedPath);
  }

  // Upload to S3-compatible object storage if configured
  let spacesKey: string | null = null;
  let spacesUrl: string | null = null;
  let downloadUrl: string | null = null;
  const SIGNED_URL_TTL = 7 * 24 * 3600; // 7 days
  if (spacesEnabled()) {
    try {
      spacesKey = userId ? `documents/${userId}/${fileHash}${ext}` : `documents/${fileHash}${ext}`;
      spacesUrl = await uploadToSpaces(managedPath, spacesKey, mimeType);
      downloadUrl = await getSpacesSignedUrl(spacesKey, SIGNED_URL_TTL, fileName);
      logger.info("document_storage_uploaded", { user_id: userId ?? null, spaces_key: spacesKey });
    } catch (err) {
      logger.error("document_storage_upload_failed", { user_id: userId ?? null, file_name: fileName, error: err });
      spacesKey = null;
      spacesUrl = null;
      downloadUrl = null;
    }
  }

  const now = new Date();
  const signedUrlExpiresAt = downloadUrl ? new Date(Date.now() + SIGNED_URL_TTL * 1000) : null;
  const docRecord: Record<string, any> = {
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
    spaces_key: spacesKey,
    spaces_url: spacesUrl,
    download_url: downloadUrl,
    signed_url_expires_at: signedUrlExpiresAt,
  };
  if (userId) docRecord.user_id = userId;
  docRecord.ai_extracted = !pipeline?.skipAi;

  const insertResult = await col("documents").insertOne(docRecord);
  const documentId = insertResult.insertedId.toString();

  push?.({ type: "document:queued", documentId: documentId as any, fileName });
  logger.info("document_import_queued", {
    document_id: documentId,
    user_id: userId ?? null,
    file_name: fileName,
    mime_type: mimeType,
    file_size_bytes: fileSize,
    ai_enabled: !pipeline?.skipAi,
  });

  processDocument(documentId, managedPath, mimeType, ext, push, userId, pipeline).catch(async (err) => {
    logger.error("document_processing_failed", { document_id: documentId, user_id: userId ?? null, error: err });
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
  push?: PushFn,
  userId?: string,
  pipeline?: PipelineOptions
) {
  const settings = getSettings();
  const docFilter = { _id: new ObjectId(documentId) } as any;

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

  // ── Stage A: OCR regex baseline — always runs when there is text ────────────
  // Runs regardless of AI setting. Creates extractions row, extracted_fields,
  // client, contract and reminders from regex-parsed data.
  // AI (Stage B) will overwrite these with richer data if enabled.
  if (rawText.trim().length > 0) {
    const ocr = extractFromOcr(rawText);
    const documentKind = classifyDocumentKind(rawText);
    logger.debug("document_ocr_extracted", {
      document_id: documentId,
      user_id: userId ?? null,
      document_kind: documentKind,
      field_count: Object.keys(ocr).length,
    });

    // Always persist kind + raw OCR fields on the document
    await col("documents").updateOne(docFilter, {
      $set: {
        document_kind: documentKind,
        document_type: ocr.document_type,
        extracted_fields: JSON.stringify(ocr),
        updated_at: new Date(),
      },
    });

    // Always write an extractions row for the OCR pass
    await col("extractions").insertOne({
      document_id: documentId,
      backend: "ocr-regex",
      model: "regex",
      result_json: JSON.stringify(ocr),
      raw_text: rawText,
      parsed_ok: ocr.expiry_date || ocr.contact_name || ocr.contact_phone ? 1 : 0,
      error: null,
      exec_ms: 0,
      created_at: new Date(),
    } as any);

    // Create client / contract / reminders from OCR data (unless disabled)
    if (!pipeline?.skipEntities && (ocr.expiry_date || ocr.contact_name || ocr.contact_phone)) {
      let clientId: string | null = null;
      if (ocr.contact_name || ocr.contact_phone || ocr.contact_email) {
        clientId = await findOrCreateClient({
          displayName: ocr.contact_name ?? ocr.contact_phone ?? "לא ידוע",
          entityType: "person",
          contactPerson: ocr.contact_name,
          email: ocr.contact_email,
          phone: ocr.contact_phone,
          userId,
        });
        await col("document_clients").updateOne(
          { document_id: documentId, client_id: clientId },
          { $setOnInsert: { document_id: documentId, client_id: clientId, role: "party_a" } },
          { upsert: true }
        );
      }

      if (ocr.expiry_date) {
        const upsertResult = await col("contracts").findOneAndUpdate(
          { document_id: documentId },
          {
            $set: {
              ...(userId && { user_id: userId }),
              client_id: clientId,
              contract_type: ocr.document_type,
              start_date: null,
              expiry_date: ocr.expiry_date,
              confidence: "low",
              updated_at: new Date(),
            },
            $setOnInsert: { document_id: documentId, status: "active", created_at: new Date() },
          },
          { upsert: true, returnDocument: "after" }
        );
        const contractId = (upsertResult as any)?._id?.toString() ?? documentId;
        if (!pipeline?.skipReminders) {
          await generateContractReminders(contractId, clientId, documentId, ocr.expiry_date, userId);
        }
      }

      logger.info("document_ocr_entities_saved", {
        document_id: documentId,
        user_id: userId ?? null,
        has_expiry_date: Boolean(ocr.expiry_date),
        has_contact: Boolean(ocr.contact_name || ocr.contact_phone),
        reminders_queued: Boolean(ocr.expiry_date && !pipeline?.skipReminders),
      });
    }
  }

  // ── Stage B: AI extraction — enriches OCR baseline when enabled ─────────────
  if (settings.autoExtract && rawText.trim().length > 0 && !pipeline?.skipAi) {
    const docRow = await col("documents").findOne(docFilter) as any;

    // ── Stage 1: classify document kind by keyword scoring ───────────────────
    const documentKind = classifyDocumentKind(rawText);
    logger.info("document_classified", {
      document_id: documentId,
      user_id: userId ?? null,
      file_name: docRow?.file_name ?? null,
      document_kind: documentKind,
      text_chars: rawText.length,
    });

    // Persist the kind immediately so filters (e.g. hide certificates) work
    // even before extraction completes.
    await col("documents").updateOne(docFilter, {
      $set: { document_kind: documentKind, updated_at: new Date() },
    });

    // ── Stage 2: dispatch to the right extractor ─────────────────────────────

    if (documentKind === "certificate") {
      logger.info("document_extractor_selected", {
        document_id: documentId,
        user_id: userId ?? null,
        extractor: "certificate",
      });
      // Certificate extraction is a separate schema — handled by certificateExtractor.
      // The document stays accessible via the profile page; it is hidden from the
      // main documents list by the existing { document_kind: { $ne: "certificate" } } filter.
      const certRun = await extractCertificate(rawText, documentId, docRow?.file_name);
      await col("extractions").insertOne({
        document_id: documentId,
        backend: certRun.backend,
        model: certRun.model,
        result_json: certRun.rawJson,
        raw_text: rawText,
        parsed_ok: certRun.result ? 1 : 0,
        error: certRun.error ?? null,
        exec_ms: certRun.execMs,
        created_at: new Date(),
      } as any);

      if (certRun.result) {
        logger.info("certificate_extracted", {
          document_id: documentId,
          user_id: userId ?? null,
          certificate_type: certRun.result.certificate_type ?? null,
          has_issuer: Boolean(certRun.result.issuer),
          has_expiry_date: Boolean(certRun.result.expiry_date),
          confidence: certRun.result.confidence ?? null,
          exec_ms: certRun.execMs,
        });
        await col("documents").updateOne(docFilter, {
          $set: {
            extracted_fields: JSON.stringify(certRun.result),
            document_type: certRun.result.certificate_type ?? "תעודה",
            updated_at: new Date(),
          },
        });
      } else if (certRun.error) {
        const msg = `Certificate extraction failed: ${certRun.error}`;
        await col("documents").updateOne(docFilter, {
          $set: { processing_status: "error", error_message: msg, updated_at: new Date() },
        });
        push?.({ type: "document:done", documentId: documentId as any, status: "error", error: msg });
        return;
      }
    } else {
      // For all other kinds, pick the best matching template then extract.
      const template = await pickTemplate(rawText, userId);
      logger.info("document_extractor_selected", {
        document_id: documentId,
        user_id: userId ?? null,
        extractor: template ? "template" : "generic",
        template_name: template?.name ?? null,
      });

      if (template) {
        let inspector: Record<string, any> | undefined;
        if (userId) {
          const [engineerProfile, userRow] = await Promise.all([
            col("engineer_profiles").findOne({ user_id: userId }) as Promise<any>,
            col("users").findOne({ _id: new ObjectId(userId) as any }) as Promise<any>,
          ]);
          inspector = {
            ...(engineerProfile ?? {}),
            personal_phone: userRow?.phone ?? null,
            personal_email: userRow?.email ?? null,
            personal_name: userRow?.name ?? null,
            personal_company_name: userRow?.company_name ?? null,
          };
        }

        // Use cached prompt when no inspector exclusions are needed.
        const systemPrompt = await getOrBuildSystemPrompt(template, inspector as any);
        const run = await extractWithTemplate(rawText, template, documentId, docRow?.file_name, inspector as any, systemPrompt);
        const normalizedFields = normalizeExtractionFieldsForTemplate(rawText, template, run.fields);

        await col("extractions").insertOne({
          document_id: documentId,
          backend: run.backend,
          model: run.model,
          result_json: run.rawJson,
          raw_text: rawText,
          parsed_ok: normalizedFields ? 1 : 0,
          error: run.error ?? null,
          exec_ms: run.execMs,
          created_at: new Date(),
        } as any);

        if (normalizedFields) {
          const keyCount = Object.keys(normalizedFields).length;
          const expiryVal = template.expiry_field ? (normalizedFields[template.expiry_field] ?? null) : null;
          logger.info("template_extraction_completed", {
            document_id: documentId,
            user_id: userId ?? null,
            template_name: template.name,
            fields_extracted: keyCount,
            has_expiry_date: Boolean(expiryVal),
            confidence: normalizedFields._confidence ?? null,
            exec_ms: run.execMs,
          });
          await col("documents").updateOne(docFilter, {
            $set: {
              extracted_fields: JSON.stringify(normalizedFields),
              template_id: template.id,
              document_type: template.name,
              updated_at: new Date(),
            },
          });

          if (!pipeline?.skipEntities) {
            push?.({ type: "document:progress", documentId: documentId as any, stage: "saving_entities", progress: 75 });
            await saveTemplateEntities(documentId, template, normalizedFields, userId, pipeline?.skipReminders);
          }
        } else if (run.error) {
          const msg = `AI extraction failed: ${run.error}`;
          await col("documents").updateOne(docFilter, {
            $set: { processing_status: "error", error_message: msg, updated_at: new Date() },
          });
          push?.({ type: "document:done", documentId: documentId as any, status: "error", error: msg });
          logger.error("template_extraction_empty", {
            document_id: documentId,
            user_id: userId ?? null,
            template_name: template.name,
            error: msg,
          });
          return;
        }
      } else {
        const extraction = await extractDocument(rawText, documentId, docRow?.file_name);
        await col("extractions").insertOne({
          document_id: documentId,
          backend: extraction.backend,
          model: extraction.model,
          result_json: extraction.rawJson,
          raw_text: rawText,
          parsed_ok: extraction.result ? 1 : 0,
          error: extraction.error ?? null,
          exec_ms: extraction.execMs,
          created_at: new Date(),
        } as any);

        if (extraction.result) {
          logger.info("generic_extraction_completed", {
            document_id: documentId,
            user_id: userId ?? null,
            document_type: extraction.result.document_type ?? null,
            has_client: Boolean(extraction.result.client_company ?? extraction.result.client_name),
            has_expiry_date: Boolean(extraction.result.expiry_date),
            confidence: extraction.result.confidence ?? null,
            exec_ms: extraction.execMs,
          });
          if (!pipeline?.skipEntities) {
            push?.({ type: "document:progress", documentId: documentId as any, stage: "saving_entities", progress: 75 });
            await saveExtractionEntities(documentId, extraction.result, userId, pipeline?.skipReminders);
          }
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
  }

  await col("documents").updateOne(docFilter, {
    $set: { processing_status: "done", updated_at: new Date() },
  });
  push?.({ type: "document:done", documentId: documentId as any, status: "done" });
  logger.info("document_processing_completed", { document_id: documentId, user_id: userId ?? null });
}

async function saveExtractionEntities(
  documentId: string,
  result: import("../../src/shared/types.js").ExtractionResult,
  userId?: string,
  skipReminders?: boolean
) {
  if (result.document_type || result.document_number) {
    await col("documents").updateOne(
      { _id: new ObjectId(documentId) } as any,
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
    const contactNote =
      result.client_company && result.client_name
        ? `איש קשר: ${result.client_name}`
        : null;

    clientId = await findOrCreateClient({
      displayName,
      entityType,
      idNumber: result.client_id ?? null,
      contactPerson: result.client_name ?? null,
      email: result.client_email ?? null,
      phone: result.client_phone ?? null,
      notes: contactNote,
      userId,
    });

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
    const contractFields = {
      ...(userId && { user_id: userId }),
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
      updated_at: new Date(),
    };
    const upsertResult = await col("contracts").findOneAndUpdate(
      { document_id: documentId },
      {
        $set: contractFields,
        $setOnInsert: { document_id: documentId, status: "active", created_at: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    );
    const contractId = (upsertResult as any)?._id?.toString() ?? documentId;
    if (result.expiry_date && !skipReminders) {
      await generateContractReminders(contractId, clientId, documentId, result.expiry_date, userId);
    }
  }

  for (const task of result.tasks ?? []) {
    const taskRes = await col("tasks").insertOne({
      ...(userId && { user_id: userId }),
      document_id: documentId,
      client_id: clientId,
      description: task.description,
      due_date: task.due_date ?? null,
      status: "pending",
      created_at: new Date(),
      updated_at: new Date(),
    } as any);
    if (task.due_date && !skipReminders) {
      await generateTaskReminders(
        taskRes.insertedId.toString(),
        clientId,
        documentId,
        task.due_date,
        task.description,
        userId
      );
    }
  }
}

export async function saveTemplateEntitiesForDoc(
  documentId: string,
  template: DocTemplate,
  fields: DynamicExtraction,
  userId?: string,
  skipReminders?: boolean
) {
  return saveTemplateEntities(documentId, template, fields, userId, skipReminders);
}

/**
 * Post-processing pipeline applied to every LLM extraction result before saving.
 * Runs in this order:
 *
 * 1. removeAddressExtractionFields — drops client_address / po_box / client_zipcode
 *    (address extraction is unreliable; these fields are not used downstream).
 *
 * 2. normalizeClientCompany — cleans client_company:
 *    - Inserts spaces between Hebrew letters and digit runs (e.g. "חברה123" → "חברה 123").
 *    - Strips a stray single leading Hebrew letter+dot (e.g. "מ הנסון בע"מ" → "הנסון בע"מ"),
 *      which occurs when OCR captures "מ." or "מר" fused to the company name.
 *    - If the value starts with 3-4 digits followed by Hebrew text and the reversed form
 *      ("Text 1234") appears verbatim in the raw PDF, swaps them to match the source.
 *
 * 3. report_number (template opt-in) — if the template declares a `report_number` field
 *    and the LLM left it empty, falls back to regex on raw text:
 *    - Looks for lines starting with "מספר תסקיר" (excluding "מספר תסקיר קודם").
 *    - Splits on tabs / 2+ spaces / " | " to take only the first token.
 *
 * 4. contact_person (template opt-in) — if the template declares `contact_person` and
 *    the LLM left it empty, falls back to regex:
 *    - Matches "איש קשר: <value>" (label before value) or "<value>: איש קשר" (RTL layout).
 *    - Strips phone numbers, "נייד/טלפון/פקס" prefixes/suffixes, and trailing punctuation.
 *    - Rejects the result if it contains no Hebrew characters.
 *
 * 5. contact_email — always attempted if LLM left it empty:
 *    - First scans lines containing "מייל / דוא"ל / email" for an email pattern.
 *    - Falls back to scanning lines before the first "section boundary" keyword
 *      (תיאור / ציוד / מקום הבדיקה / מספר רישוי / סעיף 3 / 3.) or the first 20 lines.
 *    - Skips lines that look like inspector footer lines (חתימ / בודק / מהנדס …).
 *
 * 6. license_number (template opt-in) — if the template declares `license_number` and
 *    the LLM value is not 4-8 digits, runs two fallback passes:
 *    a. After "מקום הבדיקה": scans the next 3 lines for a bare 4-8 digit number.
 *    b. Line scan: matches "מספר רישוי: <digits>" or "<digits> מספר רישוי" anywhere.
 *
 * 7. Equipment backfill — if _equipment rows were extracted but flat fields are empty,
 *    copies from the first equipment row:
 *    - checked_equipment  ← first row name
 *    - equipment_description ← "מכונת הרמה" for lifting machines (heuristic),
 *      or header-extracted description, or first row name
 *    - serial_number, manufacturer, model ← first row values
 *    - load_capacity ← first row load_capacity_work joined with " / "
 */
export function normalizeExtractionFieldsForTemplate(
  rawText: string,
  template: DocTemplate,
  fields: DynamicExtraction | null
): DynamicExtraction | null {
  if (!fields) return null;

  const normalized: DynamicExtraction = { ...fields };
  removeAddressExtractionFields(normalized);
  normalizeClientCompany(rawText, normalized);
  const supportsReportNumber = template.fields.some((field) => field.key === "report_number");
  if (supportsReportNumber && !hasMeaningfulValue(normalized.report_number)) {
    const reportNumber = extractCurrentReportNumber(rawText);
    if (reportNumber) normalized.report_number = reportNumber;
  }
  const supportsContactPerson = template.fields.some((field) => field.key === "contact_person");
  if (supportsContactPerson && !hasMeaningfulValue(normalized.contact_person)) {
    const contactPerson = extractContactPerson(rawText);
    if (contactPerson) normalized.contact_person = contactPerson;
  }
  if (!hasMeaningfulValue(normalized.contact_email)) {
    const contactEmail = extractContactEmail(rawText);
    if (contactEmail) normalized.contact_email = contactEmail;
  }
  const supportsLicenseNumber = template.fields.some((field) => field.key === "license_number");
  if (supportsLicenseNumber && !isLikelyLicenseNumber(normalized.license_number)) {
    const licenseNumber = extractLicenseNumber(rawText);
    if (licenseNumber) normalized.license_number = licenseNumber;
  }

  const headerEquipmentDescription = extractEquipmentDescriptionFromHeader(rawText);

  // When flat equipment fields are empty but _equipment rows were extracted,
  // backfill from the first row so the document card shows something useful.
  const equipmentRows = Array.isArray(normalized._equipment) ? normalized._equipment as any[] : [];
  if (equipmentRows.length > 0) {
    const first = equipmentRows[0];
    if (!hasMeaningfulValue(normalized.checked_equipment) && hasMeaningfulValue(first?.name)) {
      normalized.checked_equipment = first.name;
    }
    if (shouldUseDefaultLiftingMachineDescription(rawText, template, normalized)) {
      normalized.equipment_description = "מכונת הרמה";
    }
    if (headerEquipmentDescription && shouldUseHeaderEquipmentDescription(normalized.equipment_description, first?.name)) {
      normalized.equipment_description = headerEquipmentDescription;
    }
    if (!hasMeaningfulValue(normalized.equipment_description) && hasMeaningfulValue(first?.name)) {
      normalized.equipment_description = first.name;
    }
    if (!hasMeaningfulValue(normalized.serial_number) && hasMeaningfulValue(first?.serial_number)) {
      normalized.serial_number = first.serial_number;
    }
    if (!hasMeaningfulValue(normalized.manufacturer) && hasMeaningfulValue(first?.manufacturer)) {
      normalized.manufacturer = first.manufacturer;
    }
    if (!hasMeaningfulValue(normalized.model) && hasMeaningfulValue(first?.model)) {
      normalized.model = first.model;
    }
    if (!hasMeaningfulValue(normalized.load_capacity)) {
      const work = first?.load_capacity_work;
      const val = Array.isArray(work) && work.length > 0 ? (work as string[]).join(" / ") : null;
      if (val) normalized.load_capacity = val;
    }
  } else {
    if (shouldUseDefaultLiftingMachineDescription(rawText, template, normalized)) {
      normalized.equipment_description = "מכונת הרמה";
    }
    if (headerEquipmentDescription && shouldUseHeaderEquipmentDescription(normalized.equipment_description, null)) {
      normalized.equipment_description = headerEquipmentDescription;
    }
  }

  return normalized;
}

function extractCurrentReportNumber(rawText: string): string | null {
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (/מספר\s+תסקיר\s+קודם/i.test(line)) continue;

    const match = line.match(/^מספר\s+תסקיר(?!\s+קודם)\s*[:：-]?\s*(.+)$/i);
    if (!match) continue;

    const value = match[1]
      .split(/\t|\s{2,}|\s+\|\s+/)[0]
      .trim()
      .replace(/[|]$/, "");

    if (value) return value;
  }

  return null;
}

function extractContactPerson(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).map((rawLine) => rawLine.replace(/\s+/g, " ").trim());
  for (const line of lines) {
    if (!line) continue;

    const afterLabel = line.match(/(?:^|\s)איש\s+קשר\s*[:：-]?\s*([^|:：]+)/);
    const afterLabelValue = cleanContactPersonValue(afterLabel?.[1]);
    if (afterLabelValue) return afterLabelValue;

    const beforeLabel = line.match(/([^|:：]+)\s*[:：]\s*איש\s+קשר(?:\s|$)/);
    const beforeLabelValue = cleanContactPersonValue(beforeLabel?.[1]);
    if (beforeLabelValue) return beforeLabelValue;
  }

  return null;
}

function cleanContactPersonValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\b\d{2,3}[-\s]?\d{6,7}\b/g, " ")
    .replace(/\b\d{7,10}\b/g, " ")
    .trim()
    .replace(/^(?:נייד|טלפון|פקס)\s*/g, "")
    .replace(/\s+(?:נייד|טלפון|פקס)\s*$/g, "")
    .replace(/[|:：-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return /[א-ת]/.test(cleaned) ? cleaned : null;
}

function extractContactEmail(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).map((rawLine) => rawLine.replace(/\s+/g, " ").trim());
  const labeledLines = lines.filter((line) => /מייל|דוא"?ל|דואר\s+אלקטרוני|email/i.test(line));
  for (const line of labeledLines) {
    const email = firstEmailInText(line);
    if (email && !isLikelyInspectorFooterLine(line)) return normalizeEmail(email);
  }

  const clientBlockEnd = lines.findIndex((line) => /(?:תיאור|ציוד|מקום\s+הבדיקה|מספר\s+רישוי|סעיף\s*3|3\.)/.test(line));
  const searchLines = clientBlockEnd > 0 ? lines.slice(0, clientBlockEnd) : lines.slice(0, Math.min(lines.length, 20));
  for (const line of searchLines) {
    const email = firstEmailInText(line);
    if (email && !isLikelyInspectorFooterLine(line)) return normalizeEmail(email);
  }

  return null;
}

function firstEmailInText(value: string): string | null {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? null;
}

function normalizeEmail(value: string): string {
  return value.trim().replace(/[.,;:]+$/g, "").toLowerCase();
}

function isLikelyInspectorFooterLine(line: string): boolean {
  return /חתימ|בודק|מהנדס|הנדסה|בטיחות|פקודת\s+הבטיחות|תסקיר\s+זה|footer/i.test(line);
}

function extractLicenseNumber(rawText: string): string | null {
  const locationSectionValue = extractLicenseNumberAfterInspectionLocation(rawText);
  if (locationSectionValue) return locationSectionValue;

  const lines = rawText.split(/\r?\n/).map((rawLine) => rawLine.replace(/\s+/g, " ").trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Value on same line as label (both directions); value is digits or "פנימי NNN"
    const afterLabel = line.match(/(?:^|\s)מספר\s+רישוי\s*[:：-]?\s*(פנימי\s*\d{3,5}|\d+)/i);
    const beforeLabel = line.match(/(פנימי\s*\d{3,5}|\d+)\s*[:：-]?\s*מספר\s+רישוי/i);
    const inline = cleanInlineFieldValue(afterLabel?.[1] ?? beforeLabel?.[1]);
    if (inline && isLikelyLicenseNumber(inline)) return inline;

    // Label-only line — value on the next line (common in RTL table PDFs)
    if (/^מספר\s+רישוי\s*[:：-]?$/i.test(line)) {
      for (const candidate of [lines[i + 1]?.trim(), lines[i + 2]?.trim()]) {
        if (candidate && isLikelyLicenseNumber(candidate)) return candidate;
      }
    }

    // Value-only line immediately before the label line (cell order flipped by PDF parser)
    if (/מספר\s+רישוי/i.test(line) && i > 0) {
      const prev = lines[i - 1]?.trim();
      if (prev && isLikelyLicenseNumber(prev)) return prev;
    }
  }

  // Last resort: document mentions "מספר רישוי" but value was separated from label
  // by many lines (RTL table PDF column ordering). Collect all standalone 4-8 digit
  // lines, skip ones that look like load-table values (appear on lines adjacent to
  // decimal radius values like "2.6", "4.8" etc.) or unrelated labels, then return
  // the first remaining candidate.
  if (/מספר\s+רישוי/i.test(rawText)) {
    const skipLinePattern = /מיקוד|ישוב|מייל|דוא|טלפון|פקס|תאריך|ת\.ד|כתובת/i;
    // Lines that are part of a load/radius table (decimal number, or adjacent to one)
    const isLoadTableLine = (idx: number): boolean => {
      for (let d = -1; d <= 1; d++) {
        const l = lines[idx + d]?.trim() ?? "";
        if (/^\d+\.\d+/.test(l)) return true;
      }
      return false;
    };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (skipLinePattern.test(lines[i])) continue;
      if (/^פנימי\s*\d{3,5}$/i.test(line)) return line;
      if (isLoadTableLine(i)) continue;
      if (/^\d{4,8}$/.test(line)) return line;
    }
  }

  return null;
}

function extractLicenseNumberAfterInspectionLocation(rawText: string): string | null {
  const lines = rawText.split(/\r?\n/).map((rawLine) => rawLine.replace(/\s+/g, " ").trim());
  for (let i = 0; i < lines.length; i++) {
    if (!/מקום\s+הבדיקה/.test(lines[i])) continue;
    for (const candidateLine of lines.slice(i + 1, i + 4)) {
      if (isLikelyLicenseNumber(candidateLine)) return candidateLine;
    }
  }
  return null;
}

function cleanInlineFieldValue(value: string | undefined): string | null {
  if (!value) return null;
  const cleaned = value
    .split(/\t|\s{2,}|\s+\|\s+/)[0]
    .trim()
    .replace(/[|]$/, "");
  return cleaned || null;
}

function isLikelyLicenseNumber(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^\d{4,8}$/.test(v) || /^פנימי\s*\d{3,5}$/i.test(v);
}

function hasMeaningfulValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function removeAddressExtractionFields(fields: DynamicExtraction): void {
  delete fields.client_address;
  delete fields.po_box;
  delete fields.client_zipcode;
}

function normalizeClientCompany(rawText: string, fields: DynamicExtraction): void {
  if (typeof fields.client_company !== "string") return;
  fields.client_company = normalizeClientName(fields.client_company, rawText);
}

function normalizeClientName(value: string, rawText?: string): string {
  const spaced = value
    .replace(/([א-ת])(\d{2,})/g, "$1 $2")
    .replace(/(\d{2,})([א-ת])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  // Strip a stray single Hebrew letter prefix (e.g. "מ הנסון" → "הנסון") that
  // results from OCR splitting "מ." or "מר" off a company/person name.
  const stripped = spaced.replace(/^[א-ת]\.?\s+(?=[א-ת])/, "");
  return preferHebrewNameWithNumericSuffix(stripped, rawText);
}

function preferHebrewNameWithNumericSuffix(value: string, rawText?: string): string {
  const match = value.match(/^(\d{3,4})\s+(.+[\u0590-\u05FF].*)$/);
  if (!match) return value;

  const candidate = `${match[2].trim()} ${match[1]}`;
  if (!rawText) return candidate;

  const normalizedText = rawText.replace(/\s+/g, " ");
  return normalizedText.includes(candidate) ? candidate : value;
}

function extractEquipmentDescriptionFromHeader(rawText: string): string | null {
  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line) continue;

    const inlineValue = line.match(/(?:^|\s)תיאור\s*[:：-]\s*([^|:：]+)$/);
    if (inlineValue?.[1]) {
      const value = cleanHeaderValue(inlineValue[1]);
      if (value) return value;
    }

    const labelAndValue = line.match(/(?:^|\s)תיאור\s+([^:：|]+)\s*[:：]?$/);
    if (labelAndValue?.[1]) {
      const value = cleanHeaderValue(labelAndValue[1]);
      if (value && value !== "תיאור") return value;
    }
  }

  return null;
}

function cleanHeaderValue(value: string): string | null {
  const cleaned = value
    .replace(/^[\s.،,;:：-]+|[\s.،,;:：-]+$/g, "")
    .trim();
  return cleaned || null;
}

function shouldUseHeaderEquipmentDescription(current: unknown, firstEquipmentName: unknown): boolean {
  if (!hasMeaningfulValue(current)) return true;
  const currentText = String(current).trim();
  if (/^תיאור\s+/.test(currentText)) return true;
  if (!hasMeaningfulValue(firstEquipmentName)) return false;
  return currentText === String(firstEquipmentName).trim();
}

function shouldUseDefaultLiftingMachineDescription(
  rawText: string,
  template: DocTemplate,
  fields: DynamicExtraction
): boolean {
  const checkedEquipment = fields.checked_equipment;
  const description = fields.equipment_description;
  if (!hasMeaningfulValue(checkedEquipment) || !hasMeaningfulValue(description)) return false;
  if (String(checkedEquipment).trim() !== String(description).trim()) return false;

  const templateLooksLikeInspection = template.document_kind === "inspection_report" ||
    template.match_keywords.some((keyword) => /תסקיר|בדיקה|מכונת הרמה|ציוד הרמה/.test(keyword));
  if (!templateLooksLikeInspection) return false;

  return /מכונת\s+הרמה|ציוד\s+הרמה|תסקיר\s+בדיקה/.test(rawText);
}

async function saveTemplateEntities(
  documentId: string,
  template: DocTemplate,
  fields: DynamicExtraction,
  userId?: string,
  skipReminders?: boolean
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
    const contactNote =
      clientCompany && contactPerson ? `איש קשר: ${contactPerson}` : null;

    clientId = await findOrCreateClient({
      displayName,
      entityType,
      idNumber: getStr("client_id"),
      contactPerson,
      email: getStr("contact_email"),
      phone: getStr("contact_phone"),
      notes: contactNote,
      userId,
    });

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
    const contractFields = {
      ...(userId && { user_id: userId }),
      client_id: clientId,
      contract_number: docNumber,
      contract_type: template.name,
      start_date: startDate,
      expiry_date: expiryDate,
      amount: getNum("amount"),
      currency: getStr("currency") ?? "ILS",
      summary: getStr("findings") ?? getStr("notes") ?? getStr("summary_hebrew"),
      confidence: (getStr("_confidence") as "high" | "medium" | "low") ?? "medium",
      updated_at: new Date(),
    };
    const upsertResult = await col("contracts").findOneAndUpdate(
      { document_id: documentId },
      {
        $set: contractFields,
        $setOnInsert: { document_id: documentId, status: "active", created_at: new Date() },
      },
      { upsert: true, returnDocument: "after" }
    );
    const contractId = (upsertResult as any)?._id?.toString() ?? documentId;
    if (expiryDate && !skipReminders) {
      await generateContractReminders(contractId, clientId, documentId, expiryDate, userId);
    }
  }

  // Save equipment items extracted from inspection reports
  const equipmentList = Array.isArray(f["_equipment"]) ? f["_equipment"] as any[] : [];
  for (const eq of equipmentList) {
    if (!eq || typeof eq !== "object") continue;
    const name: string = (eq.name ?? eq.description ?? "").trim();
    if (!name) continue;

    // Match by serial_number if present (most reliable), otherwise by name
    const matchFilter: Record<string, any> = eq.serial_number
      ? { serial_number: String(eq.serial_number).trim() }
      : { name };

    const now = new Date();
    await col("equipment").updateOne(
      matchFilter,
      {
        $set: {
          name,
          category: eq.category ?? "other",
          ...(eq.manufacturer != null && { manufacturer: String(eq.manufacturer) }),
          ...(eq.model != null && { model: String(eq.model) }),
          ...(eq.serial_number != null && { serial_number: String(eq.serial_number).trim() }),
          ...(eq.load_capacity_work?.length && { capacity: (eq.load_capacity_work as string[]).join(" / ") }),
          ...(eq.load_capacity_test?.length && { load_capacity_test: (eq.load_capacity_test as string[]).join(" / ") }),
          ...(eq.load_radius?.length && { load_radius: (eq.load_radius as string[]).join(" / ") }),
          document_id: documentId,
          ...(clientId != null && { client_id: clientId }),
          ...(userId && { user_id: userId }),
          updated_at: now,
        },
        $setOnInsert: {
          description: null,
          notes: null,
          is_active: 1,
          created_at: now,
        },
      },
      { upsert: true }
    );

    logger.debug("equipment_upserted_from_document", {
      user_id: userId ?? null,
      name,
      has_serial_number: Boolean(eq.serial_number),
      manufacturer: eq.manufacturer ?? null,
      model: eq.model ?? null,
    });
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Normalise a company/person name for fuzzy dedup:
// lower-case, collapse whitespace, strip common legal suffixes and punctuation
function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/["""''`״׳]/g, '"')   // normalise quote chars
    .replace(/בע"מ|בע''מ|בעמ|ltd\.?|inc\.?|llc\.?/gi, "")
    .replace(/[^\p{L}\p{N}]/gu, " ")  // non-letter/digit → space
    .replace(/\s+/g, " ")
    .trim();
}

interface ClientInput {
  displayName: string;
  entityType: "company" | "person";
  idNumber?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  userId?: string;
}

/**
 * Find an existing client by id_number, phone, or normalised name — in that
 * priority order — then merge any new fields into it.  If no match is found,
 * insert a new client.  Returns the client's _id as a string.
 */
async function findOrCreateClient(input: ClientInput): Promise<string> {
  const { displayName, entityType, idNumber, contactPerson, email, phone, notes, userId } = input;
  const normalizedDisplayName = normalizeClientName(displayName);
  const userScope = userId ? { user_id: userId } : {};

  let existing: any = null;

  // 1. Strongest signal: government-issued id / company registration number
  if (idNumber) {
    existing = await col("clients").findOne({ ...userScope, id_number: idNumber }) as any;
    if (existing) logger.debug("client_matched", { user_id: userId ?? null, strategy: "id_number", client_id: existing._id?.toString() });
  }

  // 2. Phone (normalised — strip spaces and dashes)
  if (!existing && phone) {
    const normPhone = phone.replace(/[\s\-]/g, "");
    existing = await col("clients").findOne({
      ...userScope,
      phone: { $regex: new RegExp(escapeRegex(normPhone)) },
    }) as any;
    if (existing) logger.debug("client_matched", { user_id: userId ?? null, strategy: "phone", client_id: existing._id?.toString() });
  }

  // 2b. Email
  if (!existing && email) {
    existing = await col("clients").findOne({
      ...userScope,
      email: { $regex: new RegExp(`^${escapeRegex(email.trim())}$`, "i") },
    }) as any;
    if (existing) logger.debug("client_matched", { user_id: userId ?? null, strategy: "email", client_id: existing._id?.toString() });
  }

  // 3. Exact name match (case-insensitive)
  if (!existing) {
    existing = await col("clients").findOne({
      ...userScope,
      display_name: { $regex: new RegExp(`^${escapeRegex(normalizedDisplayName)}$`, "i") },
    }) as any;
    if (existing) logger.debug("client_matched", { user_id: userId ?? null, strategy: "exact_name", client_id: existing._id?.toString() });
  }

  // 4. Normalised name match (strips bע"מ / punctuation)
  if (!existing) {
    const norm = normaliseName(normalizedDisplayName);
    if (norm.length >= 3) {
      const all = await col("clients").find(userScope).toArray() as any[];
      existing = all.find((c: any) => normaliseName(c.display_name ?? "") === norm) ?? null;
      if (existing) logger.debug("client_matched", { user_id: userId ?? null, strategy: "normalized_name", client_id: existing._id?.toString() });
    }
  }

  if (existing) {
    const clientId = existing._id.toString();
    const mergedNotes =
      notes && !(existing.notes ?? "").includes(notes)
        ? [existing.notes, notes].filter(Boolean).join("\n")
        : existing.notes;

    await col("clients").updateOne(
      { _id: existing._id },
      {
        $set: {
          ...(email && !existing.email && { email }),
          ...(phone && !existing.phone && { phone }),
          ...(contactPerson && !existing.contact_person && { contact_person: contactPerson }),
          ...(idNumber && !existing.id_number && { id_number: idNumber }),
          ...(mergedNotes !== existing.notes && { notes: mergedNotes }),
          updated_at: new Date(),
        },
      }
    );
    return clientId;
  }

  // No match — create new
  const r = await col("clients").insertOne({
    ...userScope,
    display_name: normalizedDisplayName,
    entity_type: entityType,
    contact_person: contactPerson ?? null,
    id_number: idNumber ?? null,
    email: email ?? null,
    phone: phone ?? null,
    notes: notes ?? null,
    created_at: new Date(),
    updated_at: new Date(),
  } as any);
  logger.info("client_created_from_document", {
    user_id: userId ?? null,
    client_id: r.insertedId.toString(),
    display_name: normalizedDisplayName,
  });
  return r.insertedId.toString();
}

