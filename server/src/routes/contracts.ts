import express from "express";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {generateContractReminders} from "../reminders/scheduler";
import {upsertEquipmentForClient, type EquipmentInput} from "../reminders/equipmentUpsert";
import {HTTPException, requireAuth} from "../auth/middleware";

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
      const doc: Record<string, any> = {
        user_id: userId,
        client_id: body.client_id ?? null,
        contract_number: body.contract_number ?? null,
        contract_type: body.contract_type ?? null,
        start_date: body.start_date ?? null,
        expiry_date: body.expiry_date ?? null,
        amount: body.amount != null ? Number(body.amount) : null,
        currency: body.currency ?? "ILS",
        counterparty: body.counterparty ?? null,
        summary: body.summary ?? null,
        confidence: body.confidence ?? "medium",
        status: body.status ?? "active",
        created_at: now,
        updated_at: now,
      };
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

      if (doc.expiry_date) {
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
    if (clientId) filter.client_id = clientId;
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
        return {
          ...flatDoc(c),
          client_name: (client as any)?.display_name ?? null,
          document_name: docAny?.file_name ?? null,
          contact_person: extractedFields.contact_person ?? null,
          contact_phone: extractedFields.contact_phone ?? null,
          contact_email: extractedFields.contact_email ?? null,
          client_address: extractedFields.client_address ?? null,
          po_box: extractedFields.po_box ?? null,
          client_zipcode: extractedFields.client_zipcode ?? null,
          equipment_description: extractedFields.equipment_description ?? null,
          _confidence: extractedFields._confidence ?? null,
          _equipment: Array.isArray(extractedFields._equipment) ? extractedFields._equipment : [],
        };
      })
    );

    res.json({ rows, total });
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
    res.json({
      ...flatDoc(c),
      client_name: (client as any)?.display_name ?? null,
      document_name: (document as any)?.file_name ?? null,
    });
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

      const updates: Record<string, any> = { updated_at: new Date() };
      const fields = [
        "contract_number", "contract_type", "start_date", "expiry_date",
        "amount", "currency", "counterparty", "summary", "status",
      ];
      for (const f of fields) {
        if (body[f] !== undefined) updates[f] = body[f];
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

      if (body.expiry_date) {
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
        return {
          ...flatDoc(c),
          client_name: (client as any)?.display_name ?? null,
          document_name: docAny?.file_name ?? null,
          contact_person: extractedFields.contact_person ?? null,
          contact_phone: extractedFields.contact_phone ?? null,
          contact_email: extractedFields.contact_email ?? null,
          client_address: extractedFields.client_address ?? null,
          po_box: extractedFields.po_box ?? null,
          client_zipcode: extractedFields.client_zipcode ?? null,
          equipment_description: extractedFields.equipment_description ?? null,
          _confidence: extractedFields._confidence ?? null,
          _equipment: Array.isArray(extractedFields._equipment) ? extractedFields._equipment : [],
        };
      })
    );

    res.json(rows);
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

    await col("contracts").deleteOne({ ...idFilter(req.params.id), user_id: userId });
    res.json({ ok: true });
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
