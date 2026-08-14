import express from "express";
import {existsSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {generateContractReminders} from "../reminders/scheduler";
import {type EquipmentInput, upsertEquipmentForClient} from "../reminders/equipmentUpsert";
import {HTTPException, requireAuth} from "../auth/middleware";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEBREW_FONT = join(__dirname, "../../../scripts/NotoSansHebrew.ttf");

export function registerContractRoutes(app: express.Application) {
  // POST /api/contracts — create a contract manually
  app.post("/api/contracts", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    try {
      const body = req.body as Record<string, unknown>;
      const now = new Date();
      const contractNumber = typeof body.contract_number === "string" ? body.contract_number.trim() : "";
      if (contractNumber) {
        const existing = await col("contracts").findOne({ user_id: userId, contract_number: contractNumber });
        if (existing) {
          res.status(409).json({ error: `Contract number already exists: ${contractNumber}` });
          return;
        }
      }
      const doc: Record<string, any> = {
        user_id: userId,
        client_id: body.client_id ?? null,
        contract_number: contractNumber || null,
        contract_type: body.contract_type ?? null,
        start_date: body.start_date ?? null,
        expiry_date: body.expiry_date ?? null,
        amount: body.amount != null ? Number(body.amount) : null,
        currency: body.currency ?? "ILS",
        counterparty: body.counterparty ?? null,
        summary: body.summary ?? null,
        manual_fields: body.manual_fields ?? null,
        confidence: body.confidence ?? "medium",
        created_at: now,
        updated_at: now,
      };
      const today = now.toISOString().slice(0, 10);
      const isPast = doc.expiry_date && String(doc.expiry_date) < today;
      doc.status = body.status === "draft" ? "active" : body.status ?? (isPast ? "expired" : "active");

      // Only set document_id when it's a real id — a stored null collides under
      // the unique index, so leave the field absent for manual contracts.
      if (body.document_id) doc.document_id = body.document_id;

      const r = await col("contracts").insertOne(doc);
      const contractId = r.insertedId.toString();

      // Optionally link/create equipment for this contract's client so its
      // manufacturer/model/serial flow into reminder emails.
      const equipment = body.equipment as EquipmentInput | undefined;
      if (equipment && doc.client_id) {
        const client = await col("clients").findOne({ _id: tryObjectId(String(doc.client_id)) }) as any;
        await upsertEquipmentForClient(
          equipment,
          String(doc.client_id),
          client?.display_name ?? "",
          userId,
          now
        );
      }

      if (doc.expiry_date && !isPast && body.skip_reminders !== true) {
        await generateContractReminders(contractId, doc.client_id, doc.document_id ?? null, String(doc.expiry_date), userId);
      }
      const inserted = await col("contracts").findOne({ _id: r.insertedId });
      res.status(201).json(flatDoc(inserted));
    } catch (err) {
      console.error("[contracts] create failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
      }
    }
  });

  // GET /api/contracts
  app.get("/api/contracts", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const clientId = req.query.clientId as string | undefined;
    const status = req.query.status as string | undefined;
    const kind = req.query.kind as string | undefined;
    const limit = parseInt((req.query.limit as string) ?? "50");
    const offset = parseInt((req.query.offset as string) ?? "0");

    const filter: Record<string, any> = { user_id: userId };
    if (clientId) {
      const clientIds: any[] = [clientId];
      try {
        clientIds.push(new ObjectId(clientId));
      } catch { /* not an ObjectId-shaped client id */ }
      filter.client_id = { $in: clientIds };
    }
    if (status) filter.status = status;
    if (kind === "contract") {
      filter.contract_number = { $ne: null, $exists: true };
      filter.$and = [
        {
          $or: [
            { contract_type: null },
            { contract_type: { $not: /תסקיר|בדיקה/ } },
          ],
        },
      ];
    } else if (kind === "inspection") {
      filter.contract_type = { $regex: /תסקיר|בדיקה/ };
    }

    const [contractDocs, total] = await Promise.all([
      col("contracts")
        .find(filter)
        .sort({ expiry_date: 1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      col("contracts").countDocuments(filter),
    ]);

    const rows = await Promise.all(
      contractDocs.map(async (c: any) => {
        const [client, document] = await Promise.all([
          c.client_id ? col("clients").findOne({ _id: tryObjectId(c.client_id) }) : null,
          c.document_id ? col("documents").findOne({ _id: tryObjectId(c.document_id) }) : null,
        ]);
        const docAny = document as any;
        let extractedFields: Record<string, any> = {};
        if (docAny?.extracted_fields) {
          try { extractedFields = JSON.parse(docAny.extracted_fields); } catch {}
        }
        const mergedFields = mergeContractFields(c, extractedFields);
        return {
          ...flatDoc(c),
          client_name: (client as any)?.display_name ?? null,
          document_name: docAny?.file_name ?? null,
          contact_person: mergedFields.contact_person ?? null,
          contact_phone: mergedFields.contact_phone ?? null,
          contact_email: mergedFields.contact_email ?? null,
          client_address: mergedFields.client_address ?? null,
          po_box: mergedFields.po_box ?? null,
          client_zipcode: mergedFields.client_zipcode ?? null,
          equipment_description: mergedFields.equipment_description ?? null,
          _confidence: mergedFields._confidence ?? null,
          _equipment: Array.isArray(mergedFields._equipment) ? mergedFields._equipment : [],
        };
      })
    );

    res.json({ rows, total });
  });

  // GET /api/contracts/monthly-report.pdf
  app.get("/api/contracts/monthly-report.pdf", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    try {
      const now = new Date();
      const year = Number(req.query.year ?? now.getFullYear());
      const month = Number(req.query.month ?? now.getMonth() + 1);
      const kind = String(req.query.kind ?? "all");
      if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Number.isInteger(month) || month < 1 || month > 12) {
        res.status(400).json({ error: "year and month must be valid" });
        return;
      }

      const from = `${year}-${String(month).padStart(2, "0")}-01`;
      const next = new Date(year, month, 1);
      const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
      const filter: Record<string, any> = {
        user_id: userId,
        start_date: { $gte: from, $lt: to },
      };
      if (kind === "inspection") filter.contract_type = { $regex: /תסקיר|בדיקה/ };
      if (kind === "contract") {
        filter.$and = [{ $or: [{ contract_type: null }, { contract_type: { $not: /תסקיר|בדיקה/ } }] }];
      }

      const contracts = await col("contracts").find(filter).sort({ start_date: 1, contract_number: 1 }).toArray();
      const rows = await Promise.all(contracts.map(async (contract: any) => {
        const [client, document, reminders] = await Promise.all([
          contract.client_id ? col("clients").findOne({ _id: tryObjectId(String(contract.client_id)) }) : null,
          contract.document_id ? col("documents").findOne({ _id: tryObjectId(String(contract.document_id)) }) : null,
          col("reminders").find({ user_id: userId, source_id: String(contract._id) }).sort({ trigger_date: 1 }).toArray(),
        ]);
        let extracted: Record<string, any> = {};
        if ((document as any)?.extracted_fields) {
          try { extracted = JSON.parse((document as any).extracted_fields); } catch {}
        }
        const fields = mergeContractFields(contract, extracted);
        return { contract, client: client as any, document: document as any, fields, reminders };
      }));

      const PDFDocument = (await import("pdfkit")).default;
      const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 44, info: { Title: `Contracts report ${year}-${month}` } });
        const chunks: Buffer[] = [];
        let pageNo = 1;
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        doc.on("pageAdded", () => {
          pageNo += 1;
          doc.font(fontAvailable ? "Hebrew" : "Helvetica").fontSize(8).fillColor("#777777")
            .text(`עמוד ${pageNo}`, 44, 780, { width: 507, align: "center" });
          doc.fillColor("#111111");
        });

        const fontAvailable = existsSync(HEBREW_FONT);
        if (fontAvailable) doc.registerFont("Hebrew", HEBREW_FONT);
        const setFont = (size: number) => doc.font(fontAvailable ? "Hebrew" : "Helvetica").fontSize(size).fillColor("#111111");
        const value = (raw: unknown) => raw == null || raw === "" ? "-" : String(raw);
        const label = (name: string, raw: unknown) => {
          setFont(9);
          doc.text(`${name}: ${value(raw)}`, { align: "right", width: 507 });
        };
        const section = (title: string) => {
          if (doc.y > 710) doc.addPage();
          doc.moveDown(0.45);
          setFont(12);
          doc.text(title, { align: "right" });
          doc.moveDown(0.2);
          doc.moveTo(44, doc.y).lineTo(551, doc.y).stroke("#cfd5dc");
          doc.moveDown(0.3);
        };

        setFont(18);
        doc.text("דוח חודשי - חוזים ותסקירים", { align: "right" });
        setFont(11);
        doc.text(`חודש הדוח: ${new Date(year, month - 1, 1).toLocaleDateString("he-IL", { month: "long", year: "numeric" })}`, { align: "right" });
        doc.text(`נוצר בתאריך: ${new Date().toLocaleDateString("he-IL")}`, { align: "right" });
        doc.moveDown(0.6);
        doc.moveTo(44, doc.y).lineTo(551, doc.y).stroke("#8aa0b5");
        doc.moveDown(0.5);
        setFont(11);
        doc.text(`סה"כ רשומות: ${rows.length}`, { align: "right" });

        if (!rows.length) {
          doc.moveDown(1.2);
          setFont(13);
          doc.text("לא נמצאו חוזים או תסקירים בחודש שנבחר.", { align: "right" });
        }

        for (const row of rows) {
          const c = row.contract;
          const f = row.fields ?? {};
          section(`${value(c.contract_number)} - ${value(c.contract_type ?? "חוזה / תסקיר")}`);
          label("לקוח", row.client?.display_name);
          label("מספר מזהה לקוח", row.client?.id_number);
          label("איש קשר", f.contact_person);
          label("טלפון", f.contact_phone);
          label("אימייל", f.contact_email);
          label("כתובת", f.client_address);
          label("תאריך התחלה / בדיקה", c.start_date);
          label("בתוקף עד / בדיקה הבאה", c.expiry_date);
          label("סטטוס", c.status);
          label("סכום", c.amount == null ? null : `${c.amount} ${c.currency ?? "ILS"}`);
          label("מסמך מקור", row.document?.file_name);
          label("תיאור", c.summary ?? f.equipment_description);
          const equipment = Array.isArray(f._equipment) ? f._equipment : [];
          if (equipment.length) {
            section("ציוד");
            equipment.forEach((eq: any, index: number) => {
              setFont(10);
              doc.text(`ציוד ${index + 1}`, { align: "right" });
              label("שם", eq.name);
              label("יצרן", eq.manufacturer);
              label("דגם", eq.model);
              label("מספר סידורי", eq.serial_number);
              label("עומס עבודה", eq.load_capacity_work);
              label("עומס מבחן", eq.load_capacity_test);
              label("רדיוס", eq.load_radius);
            });
          }
          if (row.reminders.length) {
            section("תזכורות");
            row.reminders.forEach((reminder: any) => label(`${value(reminder.title)} (${value(reminder.status)})`, reminder.trigger_date));
          }
        }

        doc.end();
      });

      const filename = `contracts-report-${year}-${String(month).padStart(2, "0")}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.end(pdfBuffer);
    } catch (err) {
      console.error("[contracts] monthly PDF failed:", err);
      if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
    }
  });
  // GET /api/contracts/expiring
  app.get("/api/contracts/expiring", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const days = parseInt((req.query.days as string) ?? "30");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const future = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
    const todayStr = today.toISOString().slice(0, 10);
    const futureStr = future.toISOString().slice(0, 10);

    const contractDocs = await col("contracts")
      .find({
        user_id: userId,
        status: "active",
        expiry_date: { $ne: null, $gte: todayStr, $lte: futureStr },
      })
      .sort({ expiry_date: 1 })
      .toArray();

    const rows = await Promise.all(
      contractDocs.map(async (c: any) => {
        const [client, document] = await Promise.all([
          c.client_id ? col("clients").findOne({ _id: tryObjectId(c.client_id) }) : null,
          c.document_id ? col("documents").findOne({ _id: tryObjectId(c.document_id) }) : null,
        ]);
        return {
          ...flatDoc(c),
          client_name: (client as any)?.display_name ?? null,
          document_name: (document as any)?.file_name ?? null,
        };
      })
    );

    res.json(rows);
  });

  app.get("/api/contracts/:contractId/print-draft", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const contract = await col("contracts").findOne({ ...idFilter(req.params.contractId), user_id: userId }) as any;
    if (!contract) {
      res.status(404).json({ error: "Contract not found" });
      return;
    }
    const draft = await col("print_template_drafts").findOne({ user_id: userId, contract_id: req.params.contractId }) as any;
    if (!draft) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    const template = await col("print_templates").findOne({ _id: tryObjectId(String(draft.template_id)), user_id: userId }) as any;
    res.json({
      template_id: draft.template_id,
      template_name: template?.name ?? "תבנית",
      data: draft.data ?? {},
      meta: draft.meta ?? {},
      client_id: draft.client_id ?? draft.meta?.client_id ?? contract.client_id ?? null,
      contract_id: draft.contract_id ?? req.params.contractId,
      updated_at: draft.updated_at ?? null,
    });
  });

  // GET /api/contracts/:id
  app.get("/api/contracts/:id", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const filter = { ...idFilter(req.params.id), user_id: userId };
    const c = await col("contracts").findOne(filter) as any;
    if (!c) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const [client, document] = await Promise.all([
      c.client_id ? col("clients").findOne({ _id: tryObjectId(c.client_id) }) : null,
      c.document_id ? col("documents").findOne({ _id: tryObjectId(c.document_id) }) : null,
    ]);
    const docAny = document as any;
    let extractedFields: Record<string, any> = {};
    if (docAny?.extracted_fields) {
      try { extractedFields = JSON.parse(docAny.extracted_fields); } catch {}
    }
    const mergedFields = mergeContractFields(c, extractedFields);
    res.json({
      ...flatDoc(c),
      client_name: (client as any)?.display_name ?? null,
      document_name: docAny?.file_name ?? null,
      contact_person: mergedFields.contact_person ?? null,
      contact_phone: mergedFields.contact_phone ?? null,
      contact_email: mergedFields.contact_email ?? null,
      client_address: mergedFields.client_address ?? null,
      po_box: mergedFields.po_box ?? null,
      client_zipcode: mergedFields.client_zipcode ?? null,
      equipment_description: mergedFields.equipment_description ?? null,
      _confidence: mergedFields._confidence ?? null,
      _equipment: Array.isArray(mergedFields._equipment) ? mergedFields._equipment : [],
    });
  });

  app.post("/api/contracts/:id/reminder", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    try {
      const filter = { ...idFilter(req.params.id), user_id: userId };
      const contract = await col("contracts").findOne(filter) as any;
      if (!contract) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!contract.expiry_date) {
        res.status(400).json({ error: "Contract has no expiry_date" });
        return;
      }
      const contractId = contract._id?.toString() ?? req.params.id;
      const before = await col("reminders").countDocuments({
        user_id: userId,
        source_type: "contract_expiry",
        source_id: contractId,
        status: { $in: ["pending", "snoozed", "error"] },
      });
      await generateContractReminders(
        contractId,
        contract.client_id ?? null,
        contract.document_id ?? null,
        String(contract.expiry_date),
        userId
      );
      const manualFields = contract.manual_fields && typeof contract.manual_fields === "object" ? contract.manual_fields : {};
      const equipment = Array.isArray(manualFields._equipment) ? manualFields._equipment[0] : null;
      await col("reminders").updateMany(
        { user_id: userId, source_type: "contract_expiry", source_id: contractId },
        {
          $set: {
            ...(manualFields.contact_email && { email_to: JSON.stringify([manualFields.contact_email]) }),
            equipment_type: equipment?.category ?? null,
            manufacturer: equipment?.manufacturer ?? null,
            model: equipment?.model ?? null,
            serial_number: equipment?.serial_number ?? null,
            updated_at: new Date(),
          },
        }
      );
      const reminders = await col("reminders")
        .find({ user_id: userId, source_type: "contract_expiry", source_id: contractId })
        .sort({ trigger_date: 1 })
        .toArray();
      res.json({ ok: true, replaced: before, reminders: reminders.map(flatDoc) });
    } catch (err) {
      console.error("[contracts] create reminder failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
      }
    }
  });

  // PUT /api/contracts/:id
  app.put("/api/contracts/:id", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    try {
      const filter = { ...idFilter(req.params.id), user_id: userId };
      const body = req.body as Record<string, unknown>;
      const requestedContractNumber = typeof body.contract_number === "string" ? body.contract_number.trim() : "";
      if (requestedContractNumber) {
        const existing = await col("contracts").findOne({
          user_id: userId,
          contract_number: requestedContractNumber,
          _id: { $ne: tryObjectId(req.params.id) },
        });
        if (existing) {
          res.status(409).json({ error: `Contract number already exists: ${requestedContractNumber}` });
          return;
        }
      }

      const updates: Record<string, any> = { updated_at: new Date() };
      const fields = [
        "contract_number", "contract_type", "start_date", "expiry_date",
        "amount", "currency", "counterparty", "summary", "status", "manual_fields",
      ];
      for (const f of fields) {
        if (body[f] !== undefined) updates[f] = body[f];
      }
      if (requestedContractNumber) updates.contract_number = requestedContractNumber;
      if (updates.status === "draft") updates.status = "active";

      // Auto-set overdue when expiry_date is changed to a past date (unless caller explicitly sets status)
      if (body.expiry_date && !body.status) {
        const today = new Date().toISOString().slice(0, 10);
        if (String(body.expiry_date) < today) {
          updates.status = "expired";
        }
      }

      await col("contracts").updateOne(filter, { $set: updates });

      const equipment = body.equipment as EquipmentInput | undefined;
      if (equipment) {
        const contract = await col("contracts").findOne(filter) as any;
        if (contract?.client_id) {
          const client = await col("clients").findOne({ _id: tryObjectId(String(contract.client_id)) }) as any;
          await upsertEquipmentForClient(
            equipment,
            String(contract.client_id),
            client?.display_name ?? "",
            userId,
            new Date()
          );
        }
      }

      if (body.expiry_date && body.skip_reminders !== true) {
        const contract = await col("contracts").findOne(filter) as any;
        if (contract) {
          await generateContractReminders(
            req.params.id,
            contract.client_id ?? null,
            contract.document_id ?? null,
            String(body.expiry_date),
            userId
          );
        }
      }

      const updated = await col("contracts").findOne(filter);
      res.json(flatDoc(updated));
    } catch (err) {
      console.error("[contracts] update failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
      }
    }
  });

  // GET /api/contracts/by-document/:documentId
  app.get("/api/contracts/by-document/:documentId", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const docId = req.params.documentId;
    const contractDocs = await col("contracts")
      .find({ user_id: userId, document_id: docId })
      .sort({ expiry_date: 1 })
      .toArray();

    const rows = await Promise.all(
      contractDocs.map(async (c: any) => {
        const [client, document] = await Promise.all([
          c.client_id ? col("clients").findOne({ _id: tryObjectId(c.client_id) }) : null,
          c.document_id ? col("documents").findOne({ _id: tryObjectId(c.document_id) }) : null,
        ]);
        const docAny = document as any;
        let extractedFields: Record<string, any> = {};
        if (docAny?.extracted_fields) {
          try { extractedFields = JSON.parse(docAny.extracted_fields); } catch {}
        }
        const mergedFields = mergeContractFields(c, extractedFields);
        return {
          ...flatDoc(c),
          client_name: (client as any)?.display_name ?? null,
          document_name: docAny?.file_name ?? null,
          contact_person: mergedFields.contact_person ?? null,
          contact_phone: mergedFields.contact_phone ?? null,
          contact_email: mergedFields.contact_email ?? null,
          client_address: mergedFields.client_address ?? null,
          po_box: mergedFields.po_box ?? null,
          client_zipcode: mergedFields.client_zipcode ?? null,
          equipment_description: mergedFields.equipment_description ?? null,
          _confidence: mergedFields._confidence ?? null,
          _equipment: Array.isArray(mergedFields._equipment) ? mergedFields._equipment : [],
        };
      })
    );

    res.json(rows);
  });

  // DELETE /api/contracts — delete all contracts for the current user
  app.delete("/api/contracts", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }
    const result = await col("contracts").deleteMany({ user_id: userId });
    const draftResult = await col("print_template_drafts").deleteMany({
      user_id: userId,
      contract_id: { $exists: true, $ne: null },
    });
    res.json({ ok: true, deleted: result.deletedCount, drafts_deleted: draftResult.deletedCount ?? 0 });
  });

  // DELETE /api/contracts/:id
  app.delete("/api/contracts/:id", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const deleteRelatedReminders = req.query.deleteRelatedReminders === "true";
    const contractFilter = { ...idFilter(req.params.id), user_id: userId };
    const contract = await col("contracts").findOne(contractFilter);
    if (!contract) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    let remindersDeleted = 0;
    let emailLogsDeleted = 0;
    if (deleteRelatedReminders) {
      const sourceIds = [req.params.id, contract._id?.toString()].filter(Boolean);
      const reminders = await col("reminders")
        .find({ user_id: userId, source_type: "contract_expiry", source_id: { $in: sourceIds } })
        .project({ _id: 1 })
        .toArray();
      const reminderIds = reminders.map((r: any) => r._id?.toString()).filter(Boolean);
      if (reminderIds.length) {
        const emailResult = await col("email_log").deleteMany({ reminder_id: { $in: reminderIds } });
        emailLogsDeleted = emailResult.deletedCount ?? 0;
      }
      const reminderResult = await col("reminders").deleteMany({
        user_id: userId,
        source_type: "contract_expiry",
        source_id: { $in: sourceIds },
      });
      remindersDeleted = reminderResult.deletedCount ?? 0;
    }

    await col("contracts").deleteOne(contractFilter);
    const sourceIds = [req.params.id, contract._id?.toString()].filter(Boolean);
    const draftResult = await col("print_template_drafts").deleteMany({
      user_id: userId,
      contract_id: { $in: sourceIds },
    });
    res.json({
      ok: true,
      reminders_deleted: remindersDeleted,
      email_logs_deleted: emailLogsDeleted,
      drafts_deleted: draftResult.deletedCount ?? 0,
    });
  });
}

function idFilter(id: string): Record<string, any> {
  try {
    return { _id: new ObjectId(id) };
  } catch {
    return { _id: id };
  }
}

function tryObjectId(id: string): any {
  try {
    return new ObjectId(id);
  } catch {
    return id;
  }
}

function mergeContractFields(contract: any, extractedFields: Record<string, any>) {
  const manualFields = contract?.manual_fields && typeof contract.manual_fields === "object"
    ? contract.manual_fields
    : {};
  return {
    ...manualFields,
    ...Object.fromEntries(
      Object.entries(extractedFields).filter(([, value]) =>
        value !== undefined &&
        value !== null &&
        !(Array.isArray(value) && value.length === 0) &&
        value !== ""
      )
    ),
  };
}

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}
