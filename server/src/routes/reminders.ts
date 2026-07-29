import express from "express";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {sendReminderEmail} from "../reminders/emailSender";
import {advanceContractAfterSentReminder, generateContractReminders} from "../reminders/scheduler";
import type {EquipmentCategory, ReminderWithContext} from "../../src/shared/types.js";
import {HTTPException, requireAuth} from "../auth/middleware";

const HYDRAULIC_CATEGORIES: EquipmentCategory[] = ["lift", "scaffold", "ladder"];
const HYDRAULIC_INTERVAL_MONTHS = [4, 6, 12, 14] as const;

function parseIsoDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (d.getFullYear() !== Number(match[1]) || d.getMonth() !== Number(match[2]) - 1 || d.getDate() !== Number(match[3])) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatIsoDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayDateOnly(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Atomically allocates the next sequential inspection/report number for this
 * user and combines it with their inspector_number into a report number, e.g.
 * "484590/18168".
 * (nextInspectionId), but actually persisted here instead of just displayed.
 * Seeds the counter from engineer_profiles.inspector_id_start on first use,
 * or from this user's existing report numbers if the explicit seed is missing.
 */
async function allocateReportNumber(userId: string): Promise<string | null> {
  const profile = await col("engineer_profiles").findOne({ user_id: userId }) as any;
  const inspectorNumber = String(profile?.inspector_number ?? "").trim();
  if (!inspectorNumber) return null;

  const parsedSeed = parseInt(profile?.inspector_id_start ?? "", 10);
  const seed = Number.isFinite(parsedSeed) && parsedSeed > 0 ? parsedSeed : null;
  const existingContracts = await col("contracts")
    .find({ user_id: userId, contract_number: { $regex: inspectorNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } })
    .project({ contract_number: 1 })
    .toArray();
  const maxExistingSeq = existingContracts.reduce((max, row: any) => {
    const seq = extractInspectionSequence(row?.contract_number, inspectorNumber);
    return seq && seq > max ? seq : max;
  }, seed ? seed - 1 : 0);
  const storedSeq = Number.isFinite(Number(profile?.next_inspection_seq))
    ? Number(profile.next_inspection_seq)
    : seed ? seed - 1 : 0;
  if (!seed && maxExistingSeq <= 0 && storedSeq <= 0) return null;
  const nextSeq = Math.max(seed ?? 1, storedSeq + 1, maxExistingSeq + 1);

  await col("engineer_profiles").updateOne(
    { user_id: userId },
    { $set: { next_inspection_seq: nextSeq } }
  );

  return `${inspectorNumber}/${nextSeq}`;
}

export function registerReminderRoutes(app: express.Application) {
  // GET /api/reminders
  app.get("/api/reminders", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const status = req.query.status as string | undefined;
    const days = req.query.days as string | undefined;
    const limit = parseInt((req.query.limit as string) ?? "50");
    const offset = parseInt((req.query.offset as string) ?? "0");

    const filter: Record<string, any> = { user_id: userId };
    if (status) filter.status = status;
    if (days) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const future = new Date(today.getTime() + parseInt(days) * 24 * 60 * 60 * 1000);
      filter.trigger_date = {
        $gte: today.toISOString().slice(0, 10),
        $lte: future.toISOString().slice(0, 10),
      };
    }

    const [reminderDocs, total] = await Promise.all([
      col("reminders")
        .find(filter)
        .sort({ trigger_date: 1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      col("reminders").countDocuments(filter),
    ]);

    const rows = await Promise.all(
      reminderDocs.map(async (r: any) => {
        const [client, document, contract] = await Promise.all([
          r.client_id ? col("clients").findOne({ _id: tryObjectId(r.client_id) }) : null,
          r.document_id ? col("documents").findOne({ _id: tryObjectId(r.document_id) }) : null,
          resolveReminderContract(r, userId),
        ]);
        return {
          ...flatDoc(r),
          client_name: (client as any)?.display_name ?? null,
          document_name: (document as any)?.file_name ?? null,
          contract_number: (contract as any)?.contract_number ?? null,
          contract_type: (contract as any)?.contract_type ?? null,
        };
      })
    );

    res.json({ rows, total });
  });

  // POST /api/reminders
  app.post("/api/reminders", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const now = new Date();
    const doc = {
      user_id: userId,
      source_type: body.source_type ?? "manual",
      source_id: body.source_id ?? null,
      client_id: body.client_id ?? null,
      document_id: body.document_id ?? null,
      trigger_date: body.trigger_date,
      advance_days: body.advance_days ?? 0,
      title: body.title,
      body: body.body ?? null,
      email_to: body.email_to ?? null,
      email_template_id: body.email_template_id ?? null,
      status: "pending",
      equipment_type: body.equipment_type ?? null,
      manufacturer: body.manufacturer ?? null,
      model: body.model ?? null,
      serial_number: body.serial_number ?? null,
      created_at: now,
      updated_at: now,
    };
    const result = await col("reminders").insertOne(doc as any);
    const inserted = await col("reminders").findOne({ _id: result.insertedId });
    res.status(201).json(flatDoc(inserted));
  });

  // POST /api/reminders/hydraulic-check — manual entry: creates a business (client),
  // a hydraulic equipment record (lift/scaffold/ladder), and a next-check due date
  // `intervalMonths` from `check_date` (defaults to today). Reminders fire using
  // the existing global advance-warning days (reminderAdvanceDays) counting down
  // to that due date.
  app.post("/api/reminders/hydraulic-check", async (req, res) => {
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
      await handleHydraulicCheck(req, res, userId);
    } catch (err) {
      // A crash here (e.g. an unanticipated Mongo error) must not become an
      // unhandled rejection — that can take the whole process down and hang
      // every other in-flight request until the process watcher restarts it.
      console.error("[reminders] hydraulic-check failed:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
      }
    }
  });

  async function handleHydraulicCheck(req: express.Request, res: express.Response, userId: string) {
    const body = req.body as {
      client_id?: string;
      contract_number?: string;
      business?: {
        display_name?: string;
        entity_type?: string;
        id_number?: string;
        contact_person?: string;
        email?: string;
        phone?: string;
        address?: string;
        po_box?: string;
        client_zipcode?: string;
        notes?: string;
      };
      equipment?: {
        category?: string;
        name?: string;
        manufacturer?: string;
        model?: string;
        serial_number?: string;
        load_capacity_work?: string;
        load_capacity_test?: string;
        load_radius?: string;
        description?: string;
      };
      check_date?: string;
      next_inspection_date?: string;
      interval_months?: number;
    };

    const category = body.equipment?.category as EquipmentCategory | undefined;
    if (!category || !HYDRAULIC_CATEGORIES.includes(category)) {
      res.status(400).json({ error: `equipment.category must be one of: ${HYDRAULIC_CATEGORIES.join(", ")}` });
      return;
    }

    const intervalMonths = body.interval_months ?? 4;
    if (!intervalMonths || !HYDRAULIC_INTERVAL_MONTHS.includes(intervalMonths as any)) {
      res.status(400).json({ error: `interval_months must be one of: ${HYDRAULIC_INTERVAL_MONTHS.join(", ")}` });
      return;
    }

    let checkDate: Date;
    if (body.check_date) {
      const parsed = parseIsoDateOnly(body.check_date);
      if (!parsed) {
        res.status(400).json({ error: "check_date must be a valid date (YYYY-MM-DD)" });
        return;
      }
      checkDate = parsed;
    } else {
      checkDate = todayDateOnly();
    }

    const now = new Date();
    let clientId: string;
    let clientDisplayName: string;
    let selectedClient: any = null;

    if (body.client_id) {
      let existingOid: any;
      try { existingOid = new ObjectId(body.client_id); } catch { existingOid = body.client_id; }
      const existing = await col("clients").findOne({ _id: existingOid, user_id: userId }) as any;
      if (!existing) {
        res.status(404).json({ error: "client_id not found" });
        return;
      }
      selectedClient = existing;
      clientId = existing._id.toString();
      clientDisplayName = existing.display_name;
    } else {
      const businessName = body.business?.display_name?.trim();
      if (!businessName) {
        res.status(400).json({ error: "business.display_name or client_id required" });
        return;
      }

      const clientDoc = {
        user_id: userId,
        display_name: businessName,
        entity_type: body.business?.entity_type ?? "company",
        id_number: body.business?.id_number?.trim() || null,
        contact_person: body.business?.contact_person?.trim() || null,
        email: body.business?.email?.trim() || null,
        phone: body.business?.phone?.trim() || null,
        address: body.business?.address?.trim() || null,
        notes: body.business?.notes?.trim() || null,
        tags: null,
        created_at: now,
        updated_at: now,
      };
      const clientResult = await col("clients").insertOne(clientDoc as any);
      clientId = clientResult.insertedId.toString();
      clientDisplayName = businessName;
    }

    const equipmentName = body.equipment?.name?.trim() || clientDisplayName;
    const requestedSerial = body.equipment?.serial_number?.trim() || undefined;
    const contactPerson = body.business?.contact_person?.trim() || selectedClient?.contact_person || null;
    const contactEmail = body.business?.email?.trim() || selectedClient?.email || null;
    const contactPhone = body.business?.phone?.trim() || selectedClient?.phone || null;
    const clientAddress = body.business?.address?.trim() || selectedClient?.address || null;
    const poBox = body.business?.po_box?.trim() || null;
    const clientZipcode = body.business?.client_zipcode?.trim() || null;
    const equipmentDescription = body.equipment?.description?.trim() || equipmentName || null;

    // serial_number has a globally unique index (not scoped per user), so two
    // different accounts can legitimately submit the same value (a shared
    // generic serial, a coincidence, or a retried request). Reusing another
    // user's equipment record would leak data across tenants, so: if it's
    // this user's own equipment, reuse it; if it belongs to someone else,
    // drop the serial number rather than crash the whole request on a
    // duplicate-key error.
    let reusedEquipmentId: ObjectId | undefined;
    let serialNumber = requestedSerial;
    if (requestedSerial) {
      const existingEquipment = await col("equipment").findOne({ serial_number: requestedSerial }) as any;
      if (existingEquipment && existingEquipment.user_id === userId) {
        await col("equipment").updateOne(
          { _id: existingEquipment._id },
          { $set: { client_id: clientId, updated_at: now } }
        );
        reusedEquipmentId = existingEquipment._id;
      } else if (existingEquipment) {
        serialNumber = undefined; // belongs to another user — drop it to avoid the unique-index conflict
      }
    }

    let equipmentId: ObjectId;
    if (reusedEquipmentId) {
      equipmentId = reusedEquipmentId;
    } else {
      const equipmentDoc = {
        user_id: userId,
        name: equipmentName,
        category,
        manufacturer: body.equipment?.manufacturer?.trim() || null,
        model: body.equipment?.model?.trim() || null,
        ...(serialNumber && { serial_number: serialNumber }),
        capacity: null,
        load_capacity_test: body.equipment?.load_capacity_test?.trim() || null,
        load_radius: body.equipment?.load_radius?.trim() || null,
        description: equipmentDescription,
        notes: null,
        client_id: clientId,
        document_id: null,
        is_active: 1,
        created_at: now,
        updated_at: now,
      };
      equipmentId = (await col("equipment").insertOne(equipmentDoc as any)).insertedId;
    }

    const dueDate = body.next_inspection_date ? parseIsoDateOnly(body.next_inspection_date) : new Date(checkDate);
    if (body.next_inspection_date) {
      if (!dueDate) {
        res.status(400).json({ error: "next_inspection_date must be a valid date (YYYY-MM-DD)" });
        return;
      }
      if (dueDate.getTime() < todayDateOnly().getTime()) {
        res.status(400).json({ error: "next_inspection_date cannot be in the past" });
        return;
      }
    } else {
      dueDate!.setMonth(dueDate!.getMonth() + intervalMonths);
    }
    const expiryDate = formatIsoDateOnly(dueDate!);
    const startDate = formatIsoDateOnly(checkDate);
    const reportNumber = body.contract_number?.trim() || await allocateReportNumber(userId);
    if (!reportNumber) {
      res.status(400).json({ error: "Enter contract_number manually or set inspector_number and inspector_id_start in the engineer profile" });
      return;
    }
    if (reportNumber) {
      await syncInspectionSequenceFromReportNumber(userId, reportNumber);
    }

    const contractDoc = {
      user_id: userId,
      client_id: clientId,
      contract_type: "בדיקה הידראולית",
      contract_number: reportNumber,
      start_date: startDate,
      expiry_date: expiryDate,
      inspection_interval_months: intervalMonths,
      summary: equipmentDescription,
      manual_fields: {
        inspection_interval_months: intervalMonths,
        contact_person: contactPerson,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        client_address: clientAddress,
        po_box: poBox,
        client_zipcode: clientZipcode,
        equipment_description: equipmentDescription,
        _equipment: [{
          name: equipmentName,
          manufacturer: body.equipment?.manufacturer?.trim() || null,
          model: body.equipment?.model?.trim() || null,
          serial_number: serialNumber ?? null,
          load_capacity_work: body.equipment?.load_capacity_work?.trim()
            ? [body.equipment.load_capacity_work.trim()]
            : [],
          load_capacity_test: body.equipment?.load_capacity_test?.trim()
            ? [body.equipment.load_capacity_test.trim()]
            : [],
          load_radius: body.equipment?.load_radius?.trim()
            ? [body.equipment.load_radius.trim()]
            : [],
          category,
        }],
      },
      status: "active",
      created_at: now,
      updated_at: now,
    };
    const contractResult = await col("contracts").insertOne(contractDoc as any);
    const contractId = contractResult.insertedId.toString();

    await generateContractReminders(contractId, clientId, null, expiryDate, userId);

    await col("reminders").updateMany(
      { source_type: "contract_expiry", source_id: contractId },
      {
        $set: {
          ...(contactEmail && { email_to: JSON.stringify([contactEmail]) }),
          equipment_type: category,
          manufacturer: body.equipment?.manufacturer?.trim() || null,
          model: body.equipment?.model?.trim() || null,
          serial_number: serialNumber ?? null,
          updated_at: now,
        },
      }
    );

    const reminders = await col("reminders")
      .find({ source_type: "contract_expiry", source_id: contractId })
      .sort({ trigger_date: 1 })
      .toArray();

    res.status(201).json({
      client: flatDoc(await col("clients").findOne({ _id: tryObjectId(clientId) })),
      equipment: flatDoc(await col("equipment").findOne({ _id: equipmentId })),
      contract: flatDoc(await col("contracts").findOne({ _id: contractResult.insertedId })),
      reminders: reminders.map(flatDoc),
    });
  }

  // PUT /api/reminders/:id
  app.put("/api/reminders/:id", async (req, res) => {
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
    const body = req.body as Record<string, unknown>;

    const updates: Record<string, any> = { updated_at: new Date() };
    const fields = [
      "title", "body", "trigger_date", "email_to", "status", "email_template_id",
      "equipment_type", "manufacturer", "model", "serial_number",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }

    await col("reminders").updateOne(filter, { $set: updates });
    const updated = await col("reminders").findOne(filter);
    res.json(flatDoc(updated));
  });

  // DELETE /api/reminders/:id
  app.delete("/api/reminders/:id", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    await col("reminders").deleteOne({ ...idFilter(req.params.id), user_id: userId });
    res.json({ ok: true });
  });

  // POST /api/reminders/:id/dismiss
  app.post("/api/reminders/:id/dismiss", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    await col("reminders").updateOne(
      { ...idFilter(req.params.id), user_id: userId },
      { $set: { status: "dismissed", updated_at: new Date() } }
    );
    res.json({ ok: true });
  });

  // POST /api/reminders/:id/snooze
  app.post("/api/reminders/:id/snooze", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const { until } = req.body as { until: string };
    await col("reminders").updateOne(
      { ...idFilter(req.params.id), user_id: userId },
      { $set: { status: "snoozed", snoozed_until: until, trigger_date: until, updated_at: new Date() } }
    );
    res.json({ ok: true });
  });

  // POST /api/reminders/:id/send-now
  app.post("/api/reminders/:id/send-now", async (req, res) => {
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
    const r = (await col("reminders").findOne(filter)) as any;
    if (!r) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const [client, document, contract] = await Promise.all([
      r.client_id ? col("clients").findOne({ _id: tryObjectId(r.client_id) }) as any : null,
      r.document_id ? col("documents").findOne({ _id: tryObjectId(r.document_id) }) as any : null,
      resolveReminderContract(r, userId),
    ]);

    const reminder: ReminderWithContext & { client_email?: string } = {
      ...flatDoc(r),
      client_name: client?.display_name ?? null,
      document_name: document?.file_name ?? null,
      contract_number: contract?.contract_number ?? null,
      contract_type: contract?.contract_type ?? null,
      client_email: client?.email ?? undefined,
    } as any;

    let recipients: string[] = [];
    try {
      recipients = reminder.email_to ? JSON.parse(reminder.email_to) : [];
    } catch {
      recipients = [];
    }
    if (recipients.length === 0 && reminder.client_email) {
      recipients = [reminder.client_email];
    }

    const result = await sendReminderEmail(reminder, recipients);

    if (result.success) {
      await col("reminders").updateOne(filter, {
        $set: { status: "sent", updated_at: new Date() },
      });
      await advanceContractAfterSentReminder(reminder);
      await col("email_log").insertOne({
        reminder_id: req.params.id,
        to_address: recipients.join(", "),
        subject: `[תזכורת] ${reminder.title}`,
        sent_at: new Date(),
        success: 1,
        smtp_host: "manual",
      } as any);
    }

    res.json(result);
  });
}

function extractInspectionSequence(contractNumber: unknown, inspectorNumber: string): number | null {
  if (typeof contractNumber !== "string") return null;
  const [left, right] = contractNumber.split("/").map((part) => part.trim());
  if (!left || !right) return null;
  if (left === inspectorNumber && /^\d+$/.test(right)) return parseInt(right, 10);
  if (right === inspectorNumber && /^\d+$/.test(left)) return parseInt(left, 10);
  return null;
}

async function syncInspectionSequenceFromReportNumber(userId: string, reportNumber: string): Promise<void> {
  const profile = await col("engineer_profiles").findOne({ user_id: userId }) as any;
  const inspectorNumber = String(profile?.inspector_number ?? "").trim();
  if (!inspectorNumber) return;
  const seq = extractInspectionSequence(reportNumber, inspectorNumber);
  if (!seq) return;
  await col("engineer_profiles").updateOne(
    { user_id: userId },
    { $max: { next_inspection_seq: seq } }
  );
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

async function resolveReminderContract(reminder: any, userId: string): Promise<any | null> {
  if (reminder.source_type !== "contract_expiry" || !reminder.source_id) return null;
  const sourceId = String(reminder.source_id);
  return col("contracts").findOne({
    user_id: userId,
    $or: [
      { _id: tryObjectId(sourceId) },
      { id: sourceId },
    ],
  });
}

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}
