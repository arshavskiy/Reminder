import express from "express";
import {col} from "../db/db";
import {HTTPException, requireAuth} from "../auth/middleware";

export function registerSearchRoutes(app: express.Application) {
  app.get("/api/search", async (req, res) => {
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
    const limit = parseInt((req.query.limit as string) ?? "20");

    if (!q.trim()) {
      res.json({ documents: [], clients: [], contracts: [] });
      return;
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const [documents, clients, contracts] = await Promise.all([
      col("documents")
        .find({
          user_id: userId,
          $or: [
            { file_name: regex },
            { raw_text: regex },
            { document_type: regex },
            { document_number: regex },
          ],
        })
        .limit(limit)
        .toArray(),

      col("clients")
        .find({
          user_id: userId,
          $or: [{ display_name: regex }, { email: regex }, { id_number: regex }],
        })
        .project({ display_name: 1, email: 1, phone: 1 })
        .limit(limit)
        .toArray(),

      col("contracts")
        .find({
          user_id: userId,
          $or: [{ contract_number: regex }, { contract_type: regex }, { counterparty: regex }],
        })
        .project({ contract_number: 1, contract_type: 1, expiry_date: 1 })
        .limit(limit)
        .toArray(),
    ]);

    res.json({
      documents: documents.map(flatDoc),
      clients: clients.map(flatDoc),
      contracts: contracts.map(flatDoc),
    });
  });
}

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}
