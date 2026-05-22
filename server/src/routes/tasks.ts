import express from "express";
import { col } from "../db/db";
import { ObjectId } from "mongodb";

export function registerTaskRoutes(app: express.Application) {
  // GET /api/tasks
  app.get("/api/tasks", async (req, res) => {
    const status = req.query.status as string | undefined;
    const clientId = req.query.clientId as string | undefined;

    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (clientId) filter.client_id = clientId;

    const tasks = await col("tasks").find(filter).sort({ due_date: 1 }).toArray();

    // Enrich with client_name
    const rows = await Promise.all(
      tasks.map(async (t: any) => {
        const client = t.client_id ? await col("clients").findOne({ _id: t.client_id }) : null;
        return {
          ...flatDoc(t),
          client_name: (client as any)?.display_name ?? null,
        };
      })
    );

    res.json(rows);
  });

  // PUT /api/tasks/:id
  app.put("/api/tasks/:id", async (req, res) => {
    const id = req.params.id;
    const body = req.body as Record<string, unknown>;

    const updates: Record<string, any> = { updated_at: new Date() };
    if (body.description !== undefined) updates.description = body.description;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.status !== undefined) updates.status = body.status;

    let filter: Record<string, any>;
    try {
      filter = { _id: new ObjectId(id) };
    } catch {
      filter = { _id: id };
    }

    await col("tasks").updateOne(filter, { $set: updates });
    const updated = await col("tasks").findOne(filter);
    res.json(flatDoc(updated));
  });
}

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}
