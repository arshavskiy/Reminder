import express from "express";
import { col } from "../db/db";
import { ObjectId } from "mongodb";
import type { Equipment, EquipmentCategory } from "../../src/shared/types.js";

export function registerEquipmentRoutes(app: express.Application) {
  // GET /api/equipment  — optional ?category=lift and ?q= filters
  app.get("/api/equipment", async (req, res) => {
    const category = req.query.category as string | undefined;
    const search = req.query.q as string | undefined;

    const filter: Record<string, any> = {};
    if (category && category !== "all") {
      filter.category = category;
    }
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: regex }, { manufacturer: regex }, { model: regex }];
    }

    const rows = await col("equipment")
      .find(filter)
      .sort({ name: 1 })
      .toArray();

    res.json(rows.map(flatDoc));
  });

  // GET /api/equipment/stats — count per category for the UI chips
  app.get("/api/equipment/stats", async (_req, res) => {
    const [counts, total] = await Promise.all([
      col("equipment")
        .aggregate([
          { $match: { is_active: 1 } },
          { $group: { _id: "$category", n: { $sum: 1 } } },
        ])
        .toArray(),
      col("equipment").countDocuments({ is_active: 1 }),
    ]);

    const map: Record<string, number> = { all: total };
    for (const c of counts as any[]) {
      map[c._id] = c.n;
    }
    res.json(map);
  });

  // GET /api/equipment/:id
  app.get("/api/equipment/:id", async (req, res) => {
    const row = await col("equipment").findOne(idFilter(req.params.id));
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(flatDoc(row));
  });

  // POST /api/equipment
  app.post("/api/equipment", async (req, res) => {
    const body = req.body as Partial<Equipment>;
    if (!body.name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    const now = new Date();
    const doc = {
      name: body.name,
      category: body.category ?? "other",
      manufacturer: body.manufacturer ?? null,
      model: body.model ?? null,
      capacity: body.capacity ?? null,
      description: body.description ?? null,
      notes: body.notes ?? null,
      is_active: body.is_active ?? 1,
      created_at: now,
      updated_at: now,
    };
    const result = await col("equipment").insertOne(doc as any);
    const inserted = await col("equipment").findOne({ _id: result.insertedId });
    res.status(201).json(flatDoc(inserted));
  });

  // PUT /api/equipment/:id
  app.put("/api/equipment/:id", async (req, res) => {
    const filter = idFilter(req.params.id);
    const body = req.body as Partial<Equipment>;

    const updates: Record<string, any> = { updated_at: new Date() };
    const fields = [
      "name", "category", "manufacturer", "model",
      "capacity", "description", "notes", "is_active",
    ];
    for (const f of fields) {
      if ((body as any)[f] !== undefined) updates[f] = (body as any)[f];
    }

    await col("equipment").updateOne(filter, { $set: updates });
    const updated = await col("equipment").findOne(filter);
    res.json(flatDoc(updated));
  });

  // DELETE /api/equipment/:id
  app.delete("/api/equipment/:id", async (req, res) => {
    await col("equipment").deleteOne(idFilter(req.params.id));
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

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}
