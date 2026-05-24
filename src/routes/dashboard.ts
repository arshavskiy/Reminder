import express from "express";
import {join} from "path";
import {col} from "../db/db";
import {getDataDir} from "../settings";
import {HTTPException, requireAuth} from "../auth/middleware";

export function registerDashboardRoutes(app: express.Application) {
  app.get("/api/dashboard/stats", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const in30DaysStr = in30Days.toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);

    const isContractFilter = {
      user_id: userId,
      contract_number: { $ne: null, $exists: true },
      $and: [
        {
          $or: [
            { contract_type: null },
            { contract_type: { $not: /תסקיר|בדיקה/ } },
          ],
        },
      ],
    };
    const isInspectionFilter = {
      user_id: userId,
      contract_type: { $regex: /תסקיר|בדיקה/ },
    };

    const [
      total_documents,
      total_clients,
      total_contracts,
      active_contracts,
      total_inspections,
      pending_reminders,
      expiring_soon,
      recent_documents,
      upcoming_reminders_raw,
    ] = await Promise.all([
      col("documents").countDocuments({ user_id: userId }),
      col("clients").countDocuments({ user_id: userId }),
      col("contracts").countDocuments(isContractFilter),
      col("contracts").countDocuments({ status: "active", ...isContractFilter }),
      col("contracts").countDocuments(isInspectionFilter),
      col("reminders").countDocuments({ user_id: userId, status: "pending" }),
      col("contracts").countDocuments({
        user_id: userId,
        status: "active",
        expiry_date: { $ne: null, $gte: todayStr, $lte: in30DaysStr },
      }),
      col("documents").find({ user_id: userId }).sort({ created_at: -1 }).limit(5).toArray(),
      col("reminders").find({ user_id: userId, status: "pending" }).sort({ trigger_date: 1 }).limit(10).toArray(),
    ]);

    const upcoming_reminders = await Promise.all(
      upcoming_reminders_raw.map(async (r: any) => {
        const [client, document] = await Promise.all([
          r.client_id ? col("clients").findOne({ _id: r.client_id }) : null,
          r.document_id ? col("documents").findOne({ _id: r.document_id }) : null,
        ]);
        return {
          ...flatDoc(r),
          client_name: (client as any)?.display_name ?? null,
          document_name: (document as any)?.file_name ?? null,
        };
      })
    );

    res.json({
      total_documents,
      total_clients,
      total_contracts,
      active_contracts,
      total_inspections,
      pending_reminders,
      expiring_soon,
      recent_documents: recent_documents.map(flatDoc),
      upcoming_reminders,
      dataDir: getDataDir(),
      dbPath: join(getDataDir(), "reminder.db"),
    });
  });
}

function flatDoc(doc: any) {
  if (!doc) return doc;
  const { _id, ...rest } = doc;
  return { id: _id?.toString(), ...rest };
}
