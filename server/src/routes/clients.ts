import express from "express";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {HTTPException, requireAuth} from "../auth/middleware";
import {normalizeClientDisplayName, normalizePhoneIdentityKey} from "../utils/clientNames";
import {logger} from "../logger";
import {readExpiryDateValue} from "../shared/expiryField.js";
import {MergeClientsError, mergeClientsForUser, uniqueClientIds} from "../clients/mergeClients";

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

    const clientIds = rows.map((row) => String(row._id));
    const docCounts = clientIds.length
        ? await col("document_clients").aggregate([
          {$match: {client_id: {$in: clientIds}}},
          {$group: {_id: "$client_id", n: {$sum: 1}}},
        ]).toArray()
        : [];
    const docCountById = new Map(docCounts.map((row: any) => [String(row._id), Number(row.n) || 0]));

    res.json({
      rows: rows.map((row) => ({
        ...flatClient(row),
        doc_count: docCountById.get(String(row._id)) ?? 0,
      })),
      total,
    });
  });

  app.post("/api/clients/merge", async (req, res) => {
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
      const result = await mergeClientsForUser(
        userId,
        uniqueClientIds(req.body?.sourceIds),
        String(req.body?.canonicalId ?? ""),
      );
      logger.info("clients_merged", {
        user_id: userId,
        kept: result.kept,
        merged: result.merged,
        client_name: result.clientName,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof MergeClientsError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      logger.error("clients_merge_failed", {user_id: userId, error: String(err)});
      res.status(500).json({ error: "Failed to merge clients" });
    }
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
    const displayName = normalizeClientDisplayName(body.display_name);
    const phoneKey = normalizePhoneIdentityKey(body.phone);
    logger.info("client_create_request", {
      user_id: userId,
      display_name: displayName,
      entity_type: body.entity_type ?? "person",
      id_number: body.id_number ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      phone_key: phoneKey,
    });

    const existingByPhone = await findClientByPhone(userId, body.phone);
    if (existingByPhone) {
      const updates: Record<string, any> = { updated_at: now };
      if (body.display_name !== undefined && !existingByPhone.display_name) updates.display_name = normalizeClientDisplayName(body.display_name);
      if (body.entity_type !== undefined && !existingByPhone.entity_type) updates.entity_type = body.entity_type;
      if (body.contact_person !== undefined && !existingByPhone.contact_person) updates.contact_person = body.contact_person;
      if (body.id_number !== undefined && !existingByPhone.id_number) updates.id_number = body.id_number;
      if (body.email !== undefined && !existingByPhone.email) updates.email = body.email;
      if (body.mobile !== undefined && !existingByPhone.mobile) updates.mobile = body.mobile;
      if (body.fax !== undefined && !existingByPhone.fax) updates.fax = body.fax;
      if (body.address !== undefined && !existingByPhone.address) updates.address = body.address;
      if (body.city !== undefined && !existingByPhone.city) updates.city = body.city;
      if (body.po_box !== undefined && !existingByPhone.po_box) updates.po_box = body.po_box;
      if (body.client_zipcode !== undefined && !existingByPhone.client_zipcode) updates.client_zipcode = body.client_zipcode;
      if (body.notes !== undefined && !existingByPhone.notes) updates.notes = body.notes;
      if (body.tags !== undefined && !existingByPhone.tags) updates.tags = body.tags;
      await col("clients").updateOne({_id: existingByPhone._id}, {$set: updates});
      const updated = await col("clients").findOne({_id: existingByPhone._id});
      logger.info("client_create_reused_existing", {
        user_id: userId,
        strategy: "phone",
        client_id: existingByPhone._id?.toString(),
        display_name: displayName,
        matched_display_name: existingByPhone.display_name ?? null,
        phone: body.phone ?? null,
        phone_key: phoneKey,
      });
      res.status(200).json(flatClient(updated));
      return;
    }
    const doc = {
      user_id: userId,
      display_name: displayName,
      entity_type: body.entity_type ?? "person",
      contact_person: body.contact_person ?? null,
      id_number: body.id_number ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      mobile: body.mobile ?? null,
      fax: body.fax ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      po_box: body.po_box ?? null,
      client_zipcode: body.client_zipcode ?? null,
      notes: body.notes ?? null,
      tags: body.tags ?? null,
      created_at: now,
      updated_at: now,
    };
    const result = await col("clients").insertOne(doc as any);
    const inserted = await col("clients").findOne({ _id: result.insertedId });
    logger.info("client_created_from_api", {
      user_id: userId,
      client_id: result.insertedId.toString(),
      display_name: doc.display_name,
      entity_type: doc.entity_type,
      id_number: doc.id_number,
      email: doc.email,
      phone: doc.phone,
      phone_key: phoneKey,
    });
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
    if (body.mobile !== undefined) updates.mobile = body.mobile;
    if (body.fax !== undefined) updates.fax = body.fax;
    if (body.address !== undefined) updates.address = body.address;
    if (body.city !== undefined) updates.city = body.city;
    if (body.po_box !== undefined) updates.po_box = body.po_box;
    if (body.client_zipcode !== undefined) updates.client_zipcode = body.client_zipcode;
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

async function findClientByPhone(userId: string, phone: unknown): Promise<any | null> {
  const phoneKey = normalizePhoneIdentityKey(phone);
  if (!phoneKey) return null;
  const clients = await col("clients").find({user_id: userId, phone: {$exists: true, $ne: null}}).toArray() as any[];
  return clients.find((client) => normalizePhoneIdentityKey(client.phone) === phoneKey) ?? null;
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
  const { _id, ...rest } = doc;
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
    expiry_date: readExpiryDateValue(fields),
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
