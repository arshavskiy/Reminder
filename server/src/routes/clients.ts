import express from "express";
import { col } from "../db/db";
import { ObjectId } from "mongodb";

export function registerClientRoutes(app: express.Application) {
  // GET /api/clients
  app.get("/api/clients", async (req, res) => {
    const q = (req.query.q as string) ?? "";
    const limit = parseInt((req.query.limit as string) ?? "50");
    const offset = parseInt((req.query.offset as string) ?? "0");

    const filter: Record<string, any> = {};
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ display_name: regex }, { email: regex }];
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

    res.json({ rows: rows.map(flatDoc), total });
  });

  // GET /api/clients/:id
  app.get("/api/clients/:id", async (req, res) => {
    const filter = idFilter(req.params.id);

    const client = await col("clients").findOne(filter);
    if (!client) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const id = req.params.id;
    const [doc_count, contract_count, open_reminder_count] = await Promise.all([
      col("document_clients").countDocuments({ client_id: id }),
      col("contracts").countDocuments({ client_id: id }),
      col("reminders").countDocuments({ client_id: id, status: "pending" }),
    ]);

    res.json({ ...flatDoc(client), doc_count, contract_count, open_reminder_count });
  });

  // POST /api/clients
  app.post("/api/clients", async (req, res) => {
    const body = req.body as Record<string, unknown>;
    const now = new Date();
    const doc = {
      display_name: body.display_name,
      entity_type: body.entity_type ?? "person",
      id_number: body.id_number ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      address: body.address ?? null,
      notes: body.notes ?? null,
      tags: body.tags ?? null,
      created_at: now,
      updated_at: now,
    };
    const result = await col("clients").insertOne(doc as any);
    const inserted = await col("clients").findOne({ _id: result.insertedId });
    res.status(201).json(flatDoc(inserted));
  });

  // PUT /api/clients/:id
  app.put("/api/clients/:id", async (req, res) => {
    const filter = idFilter(req.params.id);
    const body = req.body as Record<string, unknown>;

    const updates: Record<string, any> = { updated_at: new Date() };
    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.entity_type !== undefined) updates.entity_type = body.entity_type;
    if (body.id_number !== undefined) updates.id_number = body.id_number;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.address !== undefined) updates.address = body.address;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.tags !== undefined) updates.tags = body.tags;

    await col("clients").updateOne(filter, { $set: updates });
    const updated = await col("clients").findOne(filter);
    res.json(flatDoc(updated));
  });

  // DELETE /api/clients/:id
  app.delete("/api/clients/:id", async (req, res) => {
    await col("clients").deleteOne(idFilter(req.params.id));
    res.json({ ok: true });
  });

  // GET /api/clients/:id/timeline
  app.get("/api/clients/:id/timeline", async (req, res) => {
    const rows = await col("timeline_events")
      .find({ client_id: req.params.id })
      .sort({ event_date: -1 })
      .limit(100)
      .toArray();
    res.json(rows.map(flatDoc));
  });

  // GET /api/clients/:id/documents
  app.get("/api/clients/:id/documents", async (req, res) => {
    const links = await col("document_clients")
      .find({ client_id: req.params.id })
      .toArray();

    const docIds = links.map((l: any) => l.document_id);
    const docs = docIds.length
      ? await col("documents")
          .find({ _id: { $in: docIds.map((d: string) => { try { return new ObjectId(d); } catch { return d; } }) } } as any)
          .sort({ import_date: -1 })
          .toArray()
      : [];

    res.json(docs.map(flatDoc));
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
