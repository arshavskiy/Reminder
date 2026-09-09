import express from "express";
import {ObjectId} from "mongodb";
import {createHash} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {col} from "../db/db";
import {HTTPException, requireAuth} from "../auth/middleware";
import {getDataDir} from "../settings";
import {parseObjectRecord} from "../contracts/contractEmail";
import {renderHtmlPdf} from "../routes/printTemplates";
import {spacesEnabled, uploadToSpaces} from "../storage/spaces";
import {syncDocumentToDrive} from "../storage/gdrive";
import {resolveDocumentFilePath} from "../documents/fileResolver";
import {sendEmailWithAttachments} from "../reminders/emailSender";
import {BILLING_DOCUMENT_LABELS, type BillingDocumentKind, calculateCharges, formatBillingDocumentNumber, renderPaymentRequestHtml, validateRates} from "./pricing";

function id(value: unknown): ObjectId {
  if (typeof value !== "string" || !/^[a-f\d]{24}$/i.test(value)) throw new HTTPException(400, "מזהה לא תקין");
  return new ObjectId(value);
}
const reportType = (contract: any) => String(parseObjectRecord(contract.manual_fields)?.report_type || contract.contract_type || "תסקיר");
interface RecordedPayment {paymentKey: string; amountCents: number; method: string; reference: string; paidDate: string; recordedAt: Date; receiptStatus: string}
const requests = () => col<any>("payment_requests");
const pricebooks = () => col<any>("inspection_pricebooks");
const documentKinds = new Set<BillingDocumentKind>(["quote", "payment_request", "service_specification"]);
function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export async function initializePaymentCollections() {
  await Promise.all([
    pricebooks().createIndex({user_id: 1}, {unique: true}),
    requests().createIndex({user_id: 1, requestKey: 1}, {unique: true}),
    requests().createIndex({user_id: 1, createdAt: -1}),
    col("payment_counters").createIndex({user_id: 1, year: 1}, {unique: true}),
  ]);
}

async function archiveRequest(request: any) {
  const userId = request.user_id;
  const documentKind = (documentKinds.has(request.documentKind) ? request.documentKind : "payment_request") as BillingDocumentKind;
  const documentLabel = BILLING_DOCUMENT_LABELS[documentKind];
  const existingDocument = request.documentId
    ? await col<any>("documents").findOne({_id: id(request.documentId), user_id: userId})
    : null;
  const pdf = existingDocument
    ? await readFile(await resolveDocumentFilePath(existingDocument))
    : Buffer.from(await renderHtmlPdf(renderPaymentRequestHtml(request)));
  const folder = join(getDataDir(), "payment-requests", userId);
  await mkdir(folder, {recursive: true});
  const filePath = join(folder, `${request._id}.pdf`);
  await writeFile(filePath, pdf);
  const documentId = request.documentId ? id(request.documentId) : new ObjectId();
  await col("documents").updateOne({_id: documentId, user_id: userId}, {$set: {
    user_id: userId, file_name: `${request.number}.pdf`, file_path: filePath, file_hash: createHash("sha256").update(pdf).digest("hex"),
    mime_type: "application/pdf", file_size_bytes: pdf.length, document_kind: documentKind, document_type: documentLabel,
    processing_status: "done", document_source: "generated", payment_request_id: request._id.toString(), import_date: new Date(), updated_at: new Date(),
  }, $setOnInsert: {created_at: new Date()}}, {upsert: true});
  await requests().updateOne({_id: request._id}, {$set: {documentId: documentId.toString()}});
  const storage: Record<string, string> = {local: "saved", object: "not_configured", drive: "not_synced"};
  if (spacesEnabled()) {
    try {
      const key = `documents/${userId}/billing/${documentKind}/${request._id}.pdf`;
      const url = await uploadToSpaces(filePath, key, "application/pdf");
      await col("documents").updateOne({_id: documentId, user_id: userId}, {$set: {spaces_key: key, spaces_url: url}});
      storage.object = "saved";
    } catch { storage.object = "failed"; }
  }
  try {
    await syncDocumentToDrive(documentId.toString(), userId);
    const saved = await col<any>("documents").findOne({_id: documentId, user_id: userId});
    storage.drive = saved?.drive_file_id ? "saved" : "not_synced";
  } catch { storage.drive = "failed"; }
  await requests().updateOne({_id: request._id}, {$set: {storage, updatedAt: new Date()}});
  return {documentId: documentId.toString(), storage};
}

export function registerPaymentRoutes(app: express.Application) {
  const router = express.Router();
  router.use(async (req, res, next) => {
    try { res.locals.auth = await requireAuth(req.headers.cookie); next(); }
    catch { res.status(401).json({error: "נדרשת התחברות"}); }
  });
  const route = (fn: (req: express.Request, res: express.Response, userId: string) => Promise<void>): express.RequestHandler =>
    (req, res) => { void fn(req, res, res.locals.auth.userId).catch(error => {
      res.status(error instanceof HTTPException ? error.status : 500).json({error: error instanceof HTTPException ? error.message : "הפעולה נכשלה. נסה שוב."});
    }); };
  const owned = async (requestId: string, userId: string) => {
    const request = await requests().findOne({_id: id(requestId), user_id: userId});
    if (!request) throw new HTTPException(404, "דרישת התשלום לא נמצאה");
    return request;
  };
  router.get("/", route(async (_req, res, userId) => {
    const [pricebook, rows, contracts] = await Promise.all([
      pricebooks().findOne({user_id: userId}), requests().find({user_id: userId}).sort({createdAt: -1}).limit(200).toArray(),
      col<any>("contracts").find({user_id: userId, status: {$ne: "cancelled"}}).sort({created_at: -1}).limit(1000).toArray(),
    ]);
    res.json({rates: pricebook?.rates || [], rows, receiptMode: "not_configured", contracts: contracts.map(contract => ({
      id: contract._id.toString(), number: contract.contract_number, reportType: reportType(contract), customer: contract.counterparty,
      equipment: parseObjectRecord(contract.manual_fields)?._equipment || [],
    }))});
  }));
  router.put("/rates", route(async (req, res, userId) => {
    let rates;
    try { rates = validateRates(req.body?.rates); } catch (error) { throw new HTTPException(400, (error as Error).message); }
    await pricebooks().updateOne({user_id: userId}, {$set: {rates, updatedAt: new Date()}}, {upsert: true});
    res.json({rates});
  }));
  router.post("/requests", route(async (req, res, userId) => {
    const body = req.body;
    const documentKind = body?.documentKind as BillingDocumentKind;
    if (!documentKinds.has(documentKind)) throw new HTTPException(400, "סוג מסמך תשלום לא תקין");
    if (typeof body?.requestKey !== "string" || !/^[a-f\d-]{36}$/i.test(body.requestKey)) throw new HTTPException(400, "מפתח בקשה נדרש");
    const previous = await requests().findOne({user_id: userId, requestKey: body.requestKey});
    const inputHash = createHash("sha256").update(JSON.stringify({documentKind, contractId: body.contractId, lines: body.lines, inlineRates: body.inlineRates, vatBasisPoints: body.vatBasisPoints, dueDate: body.dueDate, notes: body.notes})).digest("hex");
    if (previous) {
      if (previous.inputHash !== inputHash) throw new HTTPException(409, "מפתח בקשה כבר בשימוש לדרישה אחרת");
      res.json(previous); return;
    }
    const contract = await col<any>("contracts").findOne({_id: id(body.contractId), user_id: userId});
    if (!contract) throw new HTTPException(404, "התסקיר לא נמצא");
    const client = contract.client_id ? await col<any>("clients").findOne({_id: id(String(contract.client_id)), user_id: userId}) : null;
    const [pricebook, user] = await Promise.all([
      pricebooks().findOne({user_id: userId}),
      col<any>("users").findOne({_id: id(userId)}),
    ]);
    let totals;
    try {
      const inlineRates = body.inlineRates === undefined ? [] : validateRates(body.inlineRates);
      const savedRates = pricebook?.rates || [];
      const savedIds = new Set(savedRates.map((rate: any) => rate.id));
      if (inlineRates.some(rate => savedIds.has(rate.id))) throw new Error("מזהה סעיף אוטומטי מתנגש במחירון השמור");
      totals = calculateCharges([...savedRates, ...inlineRates], reportType(contract), body.lines, body.vatBasisPoints);
    }
    catch (error) { throw new HTTPException(400, (error as Error).message); }
    if (!validDate(body.dueDate)) throw new HTTPException(400, "תאריך תשלום לא תקין");
    if (typeof body.notes !== "string" || body.notes.length > 3000) throw new HTTPException(400, "הערות לא תקינות");
    const manual = parseObjectRecord(contract.manual_fields) || {};
    const request = {_id: new ObjectId(), user_id: userId, requestKey: body.requestKey, inputHash, documentKind, contractId: contract._id.toString(), reportNumber: contract.contract_number,
      reportType: reportType(contract), ...totals, status: "draft", paidCents: 0, payments: [], createdAt: new Date(), updatedAt: new Date(), dueDate: body.dueDate, notes: body.notes,
      customer: {name: client?.display_name || contract.counterparty || manual.client_company || "", registration: client?.id_number || "", email: client?.email || manual.client_email || ""},
      issuer: {
        name: user?.company_name || user?.name || "",
        subtitle: user?.company_subtitle || "",
        registration: user?.company_registration || "",
        email: user?.company_email || user?.email || "",
        phone: user?.company_phone || user?.phone || "",
        address: [user?.address, user?.city].filter(Boolean).join(", "),
        logoUrl: user?.company_logo_url || "",
      }};
    await requests().insertOne(request);
    res.status(201).json(request);
  }));
  router.post("/requests/:id/issue", route(async (req, res, userId) => {
    const request = await owned(req.params.id, userId);
    if (request.status === "issued") { res.json(request); return; }
    const lock = await requests().findOneAndUpdate({_id: request._id, user_id: userId, $or: [{status: "draft"}, {status: "issuing", issuingAt: {$lt: new Date(Date.now() - 300000)}}]}, {$set: {status: "issuing", issuingAt: new Date()}}, {returnDocument: "after"});
    if (!lock) throw new HTTPException(409, "הדרישה אינה טיוטה זמינה להפקה");
    try {
      if (!lock.number) {
        const year = new Date().getUTCFullYear();
        const counterYear = lock.documentKind === "quote" ? 0 : year;
        const counter = await col<any>("payment_counters").findOneAndUpdate({user_id: userId, year: counterYear}, {$inc: {value: 1}}, {upsert: true, returnDocument: "after"});
        lock.number = formatBillingDocumentNumber(lock.documentKind, counter!.value, year);
        await requests().updateOne({_id: request._id}, {$set: {number: lock.number}});
      }
      await archiveRequest(lock);
      await requests().updateOne({_id: request._id}, {$set: {status: "issued", issuedAt: new Date()}});
      res.json(await owned(req.params.id, userId));
    } catch (error) { await requests().updateOne({_id: request._id}, {$set: {status: "draft"}}); throw error; }
  }));
  router.post("/requests/:id/archive", route(async (req, res, userId) => {
    const request = await owned(req.params.id, userId);
    if (request.status !== "issued") throw new HTTPException(409, "יש להפיק את הדרישה תחילה");
    await archiveRequest(request); res.json(await owned(req.params.id, userId));
  }));
  router.get("/requests/:id/pdf", route(async (req, res, userId) => {
    const request = await owned(req.params.id, userId);
    if (request.status !== "issued" || !request.documentId) throw new HTTPException(409, "המסמך טרם הופק");
    const document = await col<any>("documents").findOne({_id: id(request.documentId), user_id: userId});
    if (!document) throw new HTTPException(404, "המסמך לא נמצא");
    res.type("application/pdf").send(await readFile(await resolveDocumentFilePath(document)));
  }));
  router.post("/requests/:id/send", route(async (req, res, userId) => {
    const request = await owned(req.params.id, userId);
    if (request.status !== "issued" || !request.documentId) throw new HTTPException(409, "יש להפיק את הדרישה לפני שליחה");
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw new HTTPException(400, "כתובת מייל לא תקינה");
    const sendId = req.body?.sendId;
    if (typeof sendId !== "string" || !/^[a-f\d-]{36}$/i.test(sendId)) throw new HTTPException(400, "מפתח שליחה נדרש");
    if (request.sendId === sendId && request.sendState === "sent") {
      if (request.lastSentTo !== email) throw new HTTPException(409, "מפתח השליחה כבר בשימוש לכתובת אחרת");
      res.json({ok: true}); return;
    }
    const claimed = await requests().findOneAndUpdate({_id: request._id, user_id: userId, sendState: {$nin: ["sending", "unknown"]}}, {$set: {sendState: "sending", sendId, sendStartedAt: new Date()}}, {returnDocument: "after"});
    if (!claimed) throw new HTTPException(409, "שליחה קודמת פעילה או דורשת בדיקה לפני שליחה נוספת");
    try {
      const document = await col<any>("documents").findOne({_id: id(request.documentId), user_id: userId});
      if (!document) throw new Error("document missing");
      const pdf = await readFile(await resolveDocumentFilePath(document));
      const label = BILLING_DOCUMENT_LABELS[request.documentKind as BillingDocumentKind] ?? BILLING_DOCUMENT_LABELS.payment_request;
      const result = await sendEmailWithAttachments([email], `${label} ${request.number} — ${request.issuer.name}`,
        `שלום ${request.customer.name}, מצורף מסמך ${label} בגין תסקיר ${request.reportNumber}.`, [{filename: `${request.number}.pdf`, content: pdf, contentType: "application/pdf"}], renderPaymentRequestHtml(request));
      await requests().updateOne({_id: request._id, sendId}, {$set: {sendState: result.success ? "sent" : "unknown", lastSentTo: email, lastSendAt: new Date()}});
      if (!result.success) throw new HTTPException(502, "לא ניתן לאשר שליחה. בדוק את יומן הדוא״ל לפני ניסיון נוסף");
      res.json({ok: true});
    } catch (error) { await requests().updateOne({_id: request._id, sendId, sendState: "sending"}, {$set: {sendState: "unknown"}}); throw error; }
  }));
  router.post("/requests/:id/payments", route(async (req, res, userId) => {
    const request = await owned(req.params.id, userId);
    const {amountCents, paymentKey, method, reference, paidDate} = req.body || {};
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || typeof paymentKey !== "string" || !/^[a-f\d-]{36}$/i.test(paymentKey)
      || !["bank_transfer", "cash", "card", "check", "other"].includes(method) || typeof reference !== "string" || reference.length > 200
      || !validDate(paidDate)) throw new HTTPException(400, "פרטי תשלום לא תקינים");
    const existing = request.payments.find((payment: any) => payment.paymentKey === paymentKey);
    if (existing) {
      if (existing.amountCents !== amountCents || existing.method !== method || existing.reference !== reference || existing.paidDate !== paidDate) throw new HTTPException(409, "מפתח תשלום כבר בשימוש");
      res.json(request); return;
    }
    const payment = {paymentKey, amountCents, method, reference, paidDate, recordedAt: new Date(), receiptStatus: "awaiting_provider"};
    const updated = await col<{payments: RecordedPayment[]; paidCents: number; totalCents: number; user_id: string; status: string; updatedAt: Date}>("payment_requests").findOneAndUpdate({_id: request._id, user_id: userId, status: "issued", "payments.paymentKey": {$ne: paymentKey},
      $expr: {$lte: [{$add: ["$paidCents", amountCents]}, "$totalCents"]}}, {$inc: {paidCents: amountCents}, $push: {payments: payment}, $set: {updatedAt: new Date()}}, {returnDocument: "after"});
    if (!updated) throw new HTTPException(409, "התשלום חורג מהיתרה, כבר נרשם או שהדרישה טרם הופקה");
    res.json(updated);
  }));
  app.use("/api/payment-requests", router);
}
