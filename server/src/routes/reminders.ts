import express from "express";
import { col } from "../db/db";
import { ObjectId } from "mongodb";
import { sendReminderEmail } from "../reminders/emailSender";
import type { ReminderWithContext } from "../../src/shared/types.js";

export function registerReminderRoutes(app: express.Application) {
  // GET /api/reminders
  app.get("/api/reminders", async (req, res) => {
    const status = req.query.status as string | undefined;
    const days = req.query.days as string | undefined;
    const limit = parseInt((req.query.limit as string) ?? "50");
    const offset = parseInt((req.query.offset as string) ?? "0");

    const filter: Record<string, any> = {};
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
    const body = req.body as Record<string, unknown>;
    const now = new Date();
    const doc = {
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

  // PUT /api/reminders/:id
  app.put("/api/reminders/:id", async (req, res) => {
    const filter = idFilter(req.params.id);
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
    await col("reminders").updateOne(idFilter(req.params.id), {
      $set: { status: "dismissed", updated_at: new Date() },
    });
    res.json({ ok: true });
  });

  // POST /api/reminders/:id/snooze
  app.post("/api/reminders/:id/snooze", async (req, res) => {
    const { until } = req.body as { until: string };
    await col("reminders").updateOne(idFilter(req.params.id), {
      $set: { status: "snoozed", snoozed_until: until, trigger_date: until, updated_at: new Date() },
    });
    res.json({ ok: true });
  });

  // POST /api/reminders/:id/send-now
  app.post("/api/reminders/:id/send-now", async (req, res) => {
    const filter = idFilter(req.params.id);
    const r = (await col("reminders").findOne(filter)) as any;
    if (!r) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    // Enrich with client info
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
