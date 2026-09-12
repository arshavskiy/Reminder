import express from "express";
import {join} from "path";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {getDataDir} from "../settings";
import {HTTPException, requireAuth} from "../auth/middleware";
import {mainDocumentsFilter} from "../documents/documentVisibility";

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
    // A contract only counts as a completed inspection report once it actually
    // produced a PDF document - contracts saved as a draft and never printed
    // still have no document_id, and shouldn't inflate this count.
    const isInspectionFilter = {
      user_id: userId,
      contract_type: { $regex: /תסקיר|בדיקה/ },
      document_id: { $ne: null, $exists: true },
    };

    const [
      total_documents,
      total_clients,
      total_contracts,
      active_contracts,
      total_inspections,
      total_equipment,
      total_doc_templates,
      total_email_templates,
      pending_reminders,
      expiring_soon,
      recent_documents,
      upcoming_reminders_raw,
    ] = await Promise.all([
      col("documents").countDocuments(mainDocumentsFilter(userId)),
      col("clients").countDocuments({ user_id: userId }),
      col("contracts").countDocuments(isContractFilter),
      col("contracts").countDocuments({ status: "active", ...isContractFilter }),
      col("contracts").countDocuments(isInspectionFilter),
      col("equipment").countDocuments({ user_id: userId, is_active: 1 }),
      col("doc_templates").countDocuments({}),
      col("email_templates").countDocuments({}),
      col("reminders").countDocuments({ user_id: userId, status: "pending" }),
      col("contracts").countDocuments({
        user_id: userId,
        status: "active",
        expiry_date: { $ne: null, $gte: todayStr, $lte: in30DaysStr },
      }),
      col("documents").find({ user_id: userId }).sort({ created_at: -1 }).limit(5).toArray(),
      col("reminders").find({ user_id: userId, status: "pending" }).sort({ trigger_date: 1 }).limit(10).toArray(),
    ]);

    const reminderIds = upcoming_reminders_raw.map((r: any) => String(r._id));
    const calendarLinks = reminderIds.length
      ? await col<any>("calendar_links")
        .find({ user_id: userId, source_type: "reminder", source_id: { $in: reminderIds } })
        .toArray()
      : [];
    const calendarLinkByReminderId = new Map(calendarLinks.map((link: any) => [String(link.source_id), link]));

    // Batched like the calendar links above. The page caps this at ten reminders,
    // so the per-row version was survivable, but it is the same shape that made
    // the reminders list saturate the connection pool.
    const dashClientIds = [...new Set(
      upcoming_reminders_raw.map((r: any) => r.client_id).filter(Boolean).map(String)
    )];
    const dashDocumentIds = [...new Set(
      upcoming_reminders_raw.map((r: any) => r.document_id).filter(Boolean).map(String)
    )];
    const dashContractSourceIds = [...new Set(
      upcoming_reminders_raw
        .filter((r: any) => r.source_id && r.source_type === "contract_expiry")
        .map((r: any) => String(r.source_id))
    )];

    const [dashClients, dashDocuments, dashContracts] = await Promise.all([
      dashClientIds.length
        ? col<any>("clients").find({ _id: { $in: dashClientIds.map(tryObjectId) } } as any).toArray()
        : Promise.resolve([]),
      dashDocumentIds.length
        ? col<any>("documents").find({ _id: { $in: dashDocumentIds.map(tryObjectId) } } as any).toArray()
        : Promise.resolve([]),
      dashContractSourceIds.length
        ? col<any>("contracts").find({
            user_id: userId,
            $or: [
              { _id: { $in: dashContractSourceIds.map(tryObjectId) } },
              { id: { $in: dashContractSourceIds } },
            ],
          } as any).toArray()
        : Promise.resolve([]),
    ]);
    const dashClientById = new Map(dashClients.map((c: any) => [String(c._id), c]));
    const dashDocumentById = new Map(dashDocuments.map((d: any) => [String(d._id), d]));
    const dashContractBySourceId = new Map<string, any>();
    for (const c of dashContracts as any[]) {
      dashContractBySourceId.set(String(c._id), c);
      if (c.id != null) dashContractBySourceId.set(String(c.id), c);
    }

    const upcoming_reminders = upcoming_reminders_raw.map((r: any) => {
      const client = r.client_id ? dashClientById.get(String(r.client_id)) ?? null : null;
      const document = r.document_id ? dashDocumentById.get(String(r.document_id)) ?? null : null;
      const contract = r.source_id && r.source_type === "contract_expiry"
        ? dashContractBySourceId.get(String(r.source_id)) ?? null
        : null;
      const calendarLink = calendarLinkByReminderId.get(String(r._id));
      return {
        ...flatDoc(r),
        client_name: (client as any)?.display_name ?? null,
        document_name: (document as any)?.file_name ?? null,
        contract_number: (contract as any)?.contract_number ?? null,
        contract_type: (contract as any)?.contract_type ?? null,
        calendar_synced: Boolean(calendarLink?.gcal_event_id),
        calendar_event_id: calendarLink?.gcal_event_id ?? null,
        calendar_last_synced_at: calendarLink?.last_synced_at ?? null,
      };
    });

    res.json({
      total_documents,
      total_clients,
      total_contracts,
      active_contracts,
      total_inspections,
      total_equipment,
      total_doc_templates,
      total_email_templates,
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

function tryObjectId(id: string): any {
  try {
    return new ObjectId(id);
  } catch {
    return id;
  }
}

