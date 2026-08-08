import express from "express";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {requireAuth} from "../auth/middleware";
import type {PipelineProfile} from "../../src/shared/types.js";
import {logger} from "../logger";

async function currentUserId(req: express.Request): Promise<string | undefined> {
  const ctx = await requireAuth(req.headers.cookie ?? undefined);
  return ctx.userId;
}

function idOnly(id: string): Record<string, any> {
  try {
    return { _id: new ObjectId(id) };
  } catch {
    return { _id: id };
  }
}

// Mutations: strict — only the owning user's rows (shared globals are script-managed).
function idFilter(id: string, userId: string): Record<string, any> {
  return { ...idOnly(id), user_id: userId };
}

// Reads: owner rows + shared globals (user_id null / absent).
function readFilter(id: string, userId: string): Record<string, any> {
  return { ...idOnly(id), $or: [{ user_id: userId }, { user_id: null }, { user_id: { $exists: false } }] };
}

function flatRow(row: any): PipelineProfile {
  const { _id, ...rest } = row;
  return { id: _id?.toString(), ...rest } as PipelineProfile;
}

// Only these fields are accepted from the client body.
const EDITABLE = [
  "name",
  "description",
  "ai_backend",
  "ai_model",
  "ocr_language",
  "extraction_max_chars",
  "reminder_advance_days",
  "default_template_id",
  "custom_prompt_rules",
] as const;

function pickUpdates(body: Partial<PipelineProfile>): Record<string, any> {
  const updates: Record<string, any> = {};
  for (const k of EDITABLE) {
    if ((body as any)[k] !== undefined) updates[k] = (body as any)[k];
  }
  return updates;
}

export function registerPipelineProfileRoutes(app: express.Application) {
  app.get("/api/pipeline-profiles", async (req, res) => {
    const userId = await currentUserId(req).catch(() => undefined);
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    // User's own profiles + shared globals (user_id null / absent).
    const rows = await col<any>("pipeline_profiles")
      .find({ $or: [{ user_id: userId }, { user_id: null }, { user_id: { $exists: false } }] })
      .sort({ name: 1 })
      .toArray();
    res.json(rows.map(flatRow));
  });

  app.get("/api/pipeline-profiles/:id", async (req, res) => {
    const userId = await currentUserId(req).catch(() => undefined);
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const row = await col<any>("pipeline_profiles").findOne(readFilter(req.params.id, userId));
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(flatRow(row));
  });

  app.post("/api/pipeline-profiles", async (req, res) => {
    const userId = await currentUserId(req).catch(() => undefined);
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const body = req.body as Partial<PipelineProfile>;
    if (!body.name?.trim()) {
      res.status(400).json({ error: "name required" });
      return;
    }
    const now = new Date();
    const doc = {
      ...pickUpdates(body),
      name: body.name.trim(),
      user_id: userId,
      created_at: now,
      updated_at: now,
    };
    const result = await col("pipeline_profiles").insertOne(doc as any);
    const row = await col<any>("pipeline_profiles").findOne({ _id: result.insertedId });
    logger.info("pipeline_profile_created", { profile_id: result.insertedId.toString(), user_id: userId });
    res.json(flatRow(row));
  });

  app.put("/api/pipeline-profiles/:id", async (req, res) => {
    const userId = await currentUserId(req).catch(() => undefined);
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const body = req.body as Partial<PipelineProfile>;
    const updates = { ...pickUpdates(body), updated_at: new Date() };
    const result = await col("pipeline_profiles").updateOne(
      idFilter(req.params.id, userId),
      { $set: updates }
    );
    if (!result.matchedCount) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const row = await col<any>("pipeline_profiles").findOne(idFilter(req.params.id, userId));
    res.json(flatRow(row));
  });

  app.delete("/api/pipeline-profiles/:id", async (req, res) => {
    const userId = await currentUserId(req).catch(() => undefined);
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const result = await col("pipeline_profiles").deleteOne(idFilter(req.params.id, userId));
    if (!result.deletedCount) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });
}
