import express from "express";
import { HTTPException, requireAuth } from "../auth/middleware";
import { approveReviews, correctReview, countPendingReviews, dismissReview, listReviewItems } from "../review/reviewStore";
import type { ReviewStatus } from "../review/reviewRules";

const STATUSES = new Set<ReviewStatus>(["pending", "approved", "dismissed"]);

async function authedUserId(req: express.Request, res: express.Response): Promise<string | null> {
  try {
    return (await requireAuth(req.headers.cookie)).userId;
  } catch (e) {
    const err = e as HTTPException;
    res.status(err.status ?? 401).json({ error: err.message });
    return null;
  }
}

function intParam(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Review queue for documents that Gmail import, email-in or Drive brought in unattended. */
export function registerReviewRoutes(app: express.Application) {
  // GET /api/review?status=pending|approved|dismissed&limit=&offset=
  app.get("/api/review", async (req, res) => {
    const userId = await authedUserId(req, res);
    if (!userId) return;
    const requested = String(req.query.status ?? "pending") as ReviewStatus;
    const status = STATUSES.has(requested) ? requested : "pending";
    res.json(await listReviewItems(userId, { status, limit: intParam(req.query.limit, 50), offset: intParam(req.query.offset, 0) }));
  });

  // GET /api/review/count — registered before /:id routes. Drives the badge and the dashboard banner.
  app.get("/api/review/count", async (req, res) => {
    const userId = await authedUserId(req, res);
    if (!userId) return;
    res.json({ pending: await countPendingReviews(userId) });
  });

  // POST /api/review/approve { ids } — "looks right" for one or many.
  app.post("/api/review/approve", async (req, res) => {
    const userId = await authedUserId(req, res);
    if (!userId) return;
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map((id: unknown) => String(id)).slice(0, 500) : [];
    if (!ids.length) {
      res.status(400).json({ error: "ids required" });
      return;
    }
    res.json({ ok: true, approved: await approveReviews(userId, ids), pending: await countPendingReviews(userId) });
  });

  app.put("/api/review/:id/corrections", async (req, res) => {
    const userId = await authedUserId(req, res);
    if (!userId) return;
    const body = req.body ?? {};
    const supplier = typeof body.supplier_name === "string" ? body.supplier_name.trim() : "";
    const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
    const date = typeof body.issue_date === "string" ? body.issue_date : "";
    const parsed = new Date(date);
    if (!supplier || supplier.length > 300 || typeof body.amount !== "number" || !Number.isFinite(body.amount)
      || !/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      res.status(400).json({error: "Valid supplier, amount, currency and issue date are required"});
      return;
    }
    try {
      const ok = await correctReview(userId, String(req.params.id), {
        supplier_name: supplier, amount: body.amount, currency, issue_date: date,
      });
      res.status(ok ? 200 : 404).json(ok ? {ok: true} : {error: "Pending invoice review not found"});
    } catch {
      res.status(500).json({error: "Could not save corrections"});
    }
  });

  // POST /api/review/:id/dismiss — "not wanted": archive the invoice and dismiss its reminders.
  app.post("/api/review/:id/dismiss", async (req, res) => {
    const userId = await authedUserId(req, res);
    if (!userId) return;
    const result = await dismissReview(userId, String(req.params.id ?? ""));
    if (!result.ok) {
      res.status(404).json({ error: "Not found in the review queue" });
      return;
    }
    res.json({ ok: true, remindersDismissed: result.remindersDismissed, pending: await countPendingReviews(userId) });
  });
}
