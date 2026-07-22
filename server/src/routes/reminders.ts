import express from "express";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {sendReminderEmail} from "../reminders/emailSender";
import {generateContractReminders} from "../reminders/scheduler";
import type {EquipmentCategory, ReminderWithContext} from "../../src/shared/types.js";
import {HTTPException, requireAuth} from "../auth/middleware";

const HYDRAULIC_CATEGORIES: EquipmentCategory[] = ["lift", "scaffold", "ladder"];
const HYDRAULIC_INTERVAL_MONTHS = [4, 6, 12, 14] as const;

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
        const [client, document] = await Promise.all([
          r.client_id ? col("clients").findOne({ _id: tryObjectId(r.client_id) }) : null,
          r.document_id ? col("documents").findOne({ _id: tryObjectId(r.document_id) }) : null,
        ]);
        return {
          ...flatDoc(r),
          client_name: (client as any)?.display_name ?? null,
          document_name: (document as any)?.file_name ?? null,
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

    const body = req.body as {
      client_id?: string;
      business?: {
        display_name?: string;
        entity_type?: string;
        id_number?: string;
        email?: string;
        phone?: string;
        address?: string;
        notes?: string;
      };
      equipment?: {
        category?: string;
        name?: string;
        manufacturer?: string;
        model?: string;
        serial_number?: string;
      };
      check_date?: string;
      interval_months?: number;
    };

    const category = body.equipment?.category as EquipmentCategory | undefined;
    if (!category || !HYDRAULIC_CATEGORIES.includes(category)) {
      res.status(400).json({ error: `equipment.category must be one of: ${HYDRAULIC_CATEGORIES.join(", ")}` });
      return;
    }

    const intervalMonths = body.interval_months;
    if (!intervalMonths || !HYDRAULIC_INTERVAL_MONTHS.includes(intervalMonths as any)) {
      res.status(400).json({ error: `interval_months must be one of: ${HYDRAULIC_INTERVAL_MONTHS.join(", ")}` });
      return;
    }

    let checkDate: Date;
    if (body.check_date) {
      checkDate = new Date(body.check_date);
      if (isNaN(checkDate.getTime())) {
        res.status(400).json({ error: "check_date must be a valid date (YYYY-MM-DD)" });
        return;
      }
    } else {
      checkDate = new Date();
    }

    const now = new Date();
    let clientId: string;
    let clientDisplayName: string;

    if (body.client_id) {
      let existingOid: any;
      try { existingOid = new ObjectId(body.client_id); } catch { existingOid = body.client_id; }
      const existing = await col("clients").findOne({ _id: existingOid, user_id: userId }) as any;
      if (!existing) {
        res.status(404).json({ error: "client_id not found" });
        return;
      }
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
    const serialNumber = body.equipment?.serial_number?.trim() || undefined;
    const equipmentDoc = {
      user_id: userId,
      name: equipmentName,
      category,
      manufacturer: body.equipment?.manufacturer?.trim() || null,
      model: body.equipment?.model?.trim() || null,
      ...(serialNumber && { serial_number: serialNumber }),
      capacity: null,
      load_capacity_test: null,
      load_radius: null,
      description: null,
      notes: null,
      client_id: clientId,
      document_id: null,
      is_active: 1,
      created_at: now,
      updated_at: now,
    };
    const equipmentResult = await col("equipment").insertOne(equipmentDoc as any);

    const dueDate = new Date(checkDate);
    dueDate.setMonth(dueDate.getMonth() + intervalMonths);
    const expiryDate = dueDate.toISOString().slice(0, 10);
    const startDate = checkDate.toISOString().slice(0, 10);

    const contractDoc = {
      user_id: userId,
      client_id: clientId,
      contract_type: "בדיקה הידראולית",
      start_date: startDate,
      expiry_date: expiryDate,
      status: "active",
      created_at: now,
      updated_at: now,
    };
    const contractResult = await col("contracts").insertOne(contractDoc as any);
    const contractId = contractResult.insertedId.toString();

    await generateContractReminders(contractId, clientId, null, expiryDate, userId);

    const reminders = await col("reminders")
      .find({ source_type: "contract_expiry", source_id: contractId })
      .sort({ trigger_date: 1 })
      .toArray();

    res.status(201).json({
      client: flatDoc(await col("clients").findOne({ _id: tryObjectId(clientId) })),
      equipment: flatDoc(await col("equipment").findOne({ _id: equipmentResult.insertedId })),
      contract: flatDoc(await col("contracts").findOne({ _id: contractResult.insertedId })),
      reminders: reminders.map(flatDoc),
    });
  });

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
    const fields = ["title", "body", "trigger_date", "email_to", "status", "email_template_id"];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }

    await col("reminders").updateOne(filter, { $set: updates });
    const updated = await col("reminders").findOne(filter);
    res.json(flatDoc(updated));
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

    const client = r.client_id ? (await col("clients").findOne({ _id: tryObjectId(r.client_id) })) as any : null;
    const document = r.document_id ? (await col("documents").findOne({ _id: tryObjectId(r.document_id) })) as any : null;

    const reminder: ReminderWithContext & { client_email?: string } = {
      ...flatDoc(r),
      client_name: client?.display_name ?? null,
      document_name: document?.file_name ?? null,
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

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}
