import express from "express";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {HTTPException, requireAuth} from "../auth/middleware";

export function registerTaskRoutes(app: express.Application) {
  // GET /api/tasks
  app.get("/api/tasks", async (req, res) => {
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
    const clientId = req.query.clientId as string | undefined;

    const filter: Record<string, any> = { user_id: userId };
    if (status) filter.status = status;
    if (clientId) filter.client_id = clientId;

    const tasks = await col("tasks").find(filter).sort({ due_date: 1 }).toArray();

    const rows = await Promise.all(
      tasks.map(async (t: any) => {
        const client = t.client_id ? await col("clients").findOne({ _id: tryObjectId(t.client_id) }) : null;
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
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const id = req.params.id;
    const body = req.body as Record<string, unknown>;

    const updates: Record<string, any> = { updated_at: new Date() };
    if (body.description !== undefined) updates.description = body.description;
    if (body.due_date !== undefined) updates.due_date = body.due_date;
    if (body.status !== undefined) updates.status = body.status;

    let baseFilter: Record<string, any>;
    try {
      baseFilter = { _id: new ObjectId(id) };
    } catch {
      baseFilter = { _id: id };
    }
    const filter = { ...baseFilter, user_id: userId };

    await col("tasks").updateOne(filter, { $set: updates });
    const updated = await col("tasks").findOne(filter);
    res.json(flatDoc(updated));
  });
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
