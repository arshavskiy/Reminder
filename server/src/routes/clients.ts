import express from "express";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {HTTPException, requireAuth} from "../auth/middleware";
import {normalizeClientDisplayName} from "../utils/clientNames";

export function registerClientRoutes(app: express.Application) {
  // GET /api/clients
  app.get("/api/clients", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const q = (req.query.q as string) ?? "";
    const limit = parseInt((req.query.limit as string) ?? "50");
    const offset = parseInt((req.query.offset as string) ?? "0");

    const filter: Record<string, any> = { user_id: userId };
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ display_name: regex }, { contact_person: regex }, { email: regex }];
    }

    const [rows, total] = await Promise.all([
      col("clients")
        .find(filter)
        .sort({ display_name: 1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      col("clients").countDocuments(filter),
    ]);

    res.json({ rows: rows.map(flatClient), total });
  });

  // GET /api/clients/:id
  app.get("/api/clients/:id", async (req, res) => {
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
    const client = await col("clients").findOne(filter);
    if (!client) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const id = req.params.id;
    const [doc_count, contract_count, open_reminder_count] = await Promise.all([
      col("document_clients").countDocuments({ client_id: id }),
      col("contracts").countDocuments({ client_id: id, user_id: userId }),
      col("reminders").countDocuments({ client_id: id, status: "pending", user_id: userId }),
    ]);

    res.json({ ...flatClient(client), doc_count, contract_count, open_reminder_count });
  });

  // POST /api/clients
  app.post("/api/clients", async (req, res) => {
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
      display_name: normalizeClientDisplayName(body.display_name),
      entity_type: body.entity_type ?? "person",
      contact_person: body.contact_person ?? null,
      id_number: body.id_number ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      notes: body.notes ?? null,
      tags: body.tags ?? null,
      created_at: now,
      updated_at: now,
    };
    const result = await col("clients").insertOne(doc as any);
    const inserted = await col("clients").findOne({ _id: result.insertedId });
    res.status(201).json(flatClient(inserted));
  });

  // PUT /api/clients/:id
  app.put("/api/clients/:id", async (req, res) => {
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
    if (body.display_name !== undefined) updates.display_name = normalizeClientDisplayName(body.display_name);
    if (body.entity_type !== undefined) updates.entity_type = body.entity_type;
    if (body.contact_person !== undefined) updates.contact_person = body.contact_person;
    if (body.id_number !== undefined) updates.id_number = body.id_number;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.tags !== undefined) updates.tags = body.tags;

    await col("clients").updateOne(filter, { $set: updates });
    const updated = await col("clients").findOne(filter);
    res.json(flatClient(updated));
  });

  // DELETE /api/clients/:id
  app.delete("/api/clients/:id", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    await col("clients").deleteOne({ ...idFilter(req.params.id), user_id: userId });
    res.json({ ok: true });
  });

  // DELETE /api/clients — delete all clients for the user
  app.delete("/api/clients", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }
    const result = await col("clients").deleteMany({ user_id: userId });
    res.json({ ok: true, deleted: result.deletedCount });
  });

  // GET /api/clients/:id/timeline
  app.get("/api/clients/:id/timeline", async (req, res) => {
    try {
      await requireAuth(req.headers.cookie);
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const rows = await col("timeline_events")
      .find({ client_id: req.params.id })
      .sort({ event_date: -1 })
      .limit(100)
      .toArray();
    res.json(rows.map(flatDoc));
  });

  // GET /api/clients/:id/documents
  app.get("/api/clients/:id/documents", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const links = await col("document_clients")
      .find({ client_id: req.params.id })
      .toArray();

    const docIds = links.map((l: any) => l.document_id);
    const docs = docIds.length
      ? await col("documents")
          .find({
            _id: { $in: docIds.map((d: string) => { try { return new ObjectId(d); } catch { return d; } }) },
            user_id: userId,
          } as any)
          .sort({ import_date: -1 })
          .toArray()
      : [];

    res.json(docs.map(flatClientDocument));
  });
}

function idFilter(id: string): Record<string, any> {
  try {
    return { _id: new ObjectId(id) };
  } catch {
    return { _id: id };
  }
}

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}

function flatClient(doc: any) {
  if (!doc) return doc;
  const { _id, address: _address, ...rest } = doc;
  return {
    id: _id?.toString(),
    ...rest,
    display_name: normalizeClientDisplayName(rest.display_name),
    contact_person: rest.contact_person ?? extractContactPersonFromNotes(rest.notes),
  };
}

function flatClientDocument(doc: any) {
  const flat = flatDoc(doc);
  const fields = parseObjectJson(doc?.extracted_fields);
  return {
    ...flat,
    inspection_date: stringField(fields, "inspection_date"),
    next_inspection_date: stringField(fields, "next_inspection_date") ?? stringField(fields, "expiry_date"),
  };
}

function extractContactPersonFromNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(?:^|\n)\s*איש\s+קשר\s*[:：-]\s*([^\n]+)/);
  return match?.[1]?.trim() || null;
}

function parseObjectJson(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function stringField(fields: Record<string, unknown> | null, key: string): string | null {
  const value = fields?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
