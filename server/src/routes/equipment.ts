import express from "express";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {existsSync, mkdirSync, writeFileSync} from "fs";
import {dirname, extname, join} from "path";
import {fileURLToPath} from "url";
import type {Equipment} from "../../src/shared/types.js";
import {HTTPException, requireAuth} from "../auth/middleware";
import {getDataDir} from "../settings";
import {getSpacesSignedUrl, spacesEnabled, uploadToSpaces} from "../storage/spaces";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEBREW_FONT = join(__dirname, "../../../scripts/NotoSansHebrew.ttf");

type EquipmentDoc = Partial<Equipment> & {
  _id?: ObjectId | string;
  client_id?: string | null;
  document_id?: string | null;
};

export function registerEquipmentRoutes(app: express.Application) {
  // GET /api/equipment  — optional ?category=lift and ?q= filters
  app.get("/api/equipment", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const category = req.query.category as string | undefined;
    const search = req.query.q as string | undefined;
    const clientId = req.query.client_id as string | undefined;

    const filter: Record<string, any> = { user_id: userId };
    if (category && category !== "all") filter.category = category;
    if (search) {
      const regex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [{ name: regex }, { manufacturer: regex }, { model: regex }];
    }

    if (clientId) {
      const docLinks = await col("document_clients").find({ client_id: clientId }).toArray() as any[];
      const docIds = docLinks.map((d: any) => String(d.document_id));
      filter.$or = [
        { client_id: clientId },
        ...(docIds.length ? [{ document_id: { $in: docIds } }] : []),
      ];
    }

    const rows = await col<EquipmentDoc>("equipment")
      .find(filter)
      .sort({ name: 1 })
      .toArray();

    const enriched = await Promise.all(rows.map(async (row: any) => {
      const flat = flatDoc(row) as any;
      if (row.client_id) {
        try {
          const clientOid = new ObjectId(String(row.client_id));
          const client = await col("clients").findOne({ _id: clientOid }) as any;
          flat.client_name = client?.display_name ?? null;
        } catch { flat.client_name = null; }
      }
      if (row.document_id) {
        try {
          const docOid = new ObjectId(String(row.document_id));
          const doc = await col("documents").findOne({ _id: docOid }) as any;
          flat.document_name = doc?.file_name ?? null;
        } catch { flat.document_name = null; }
      }
      return flat;
    }));

    res.json(enriched);
  });

  // GET /api/equipment/expiry-calendar — inspection contracts with expiry dates for calendar view
  app.get("/api/equipment/expiry-calendar", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const filter: Record<string, any> = {
      user_id: userId,
      expiry_date: { $ne: null },
      status: { $in: ["active", "expired"] },
      $or: [
        { contract_type: { $regex: "תסקיר|בדיקה|inspection|certificate", $options: "i" } },
        { contract_type: null },
      ],
    };
    if (from) filter.expiry_date.$gte = from;
    if (to) filter.expiry_date.$lte = to;

    const contracts = await col("contracts").find(filter).sort({ expiry_date: 1 }).toArray();

    const today = new Date().toISOString().slice(0, 10);

    const enriched = await Promise.all(contracts.map(async (c: any) => {
      let documentFields: Record<string, unknown> | null = null;
      if (c.document_id) {
        try {
          const doc = await col("documents").findOne({ _id: new ObjectId(String(c.document_id)), user_id: userId }) as any;
          documentFields = parseManualFields(doc?.extracted_fields);
        } catch { /* ignore */ }
      }
      const contactFields = contactFieldsFromContract(c, documentFields);
      let client_name: string | null = null;
      let contact_person: string | null = contactFields.contact_person;
      let contact_email: string | null = contactFields.contact_email;
      let contact_phone: string | null = contactFields.contact_phone;
      let equipment_name: string | null = null;

      if (c.client_id) {
        try {
          const client = await col("clients").findOne({ _id: new ObjectId(String(c.client_id)) }) as any;
          client_name = textField(client?.display_name) ?? null;
          contact_person = textField(client?.contact_person) ?? contact_person ?? extractContactPersonFromNotes(client?.notes);
          contact_email = textField(client?.email) ?? contact_email;
          contact_phone = textField(client?.phone) ?? contact_phone;
        } catch { /* ignore */ }
      }
      if (c.document_id) {
        try {
          const eq = await col("equipment").findOne({ document_id: String(c.document_id), user_id: userId }) as any;
          if (eq) equipment_name = eq.name ?? null;
        } catch { /* ignore */ }
      }

      const expiry = c.expiry_date as string;
      const daysUntil = Math.ceil((new Date(expiry).getTime() - new Date(today).getTime()) / 86400000);
      const urgency: "overdue" | "critical" | "warning" | "ok" =
        daysUntil < 0 ? "overdue" :
        daysUntil <= 30 ? "critical" :
        daysUntil <= 90 ? "warning" : "ok";

      return {
        id: c._id?.toString(),
        document_id: c.document_id ?? null,
        expiry_date: expiry,
        contract_type: c.contract_type ?? null,
        contract_number: c.contract_number ?? null,
        client_name,
        contact_person,
        contact_email,
        contact_phone,
        equipment_name,
        days_until: daysUntil,
        urgency,
      };
    }));

    res.json(enriched);
  });

  // GET /api/equipment/stats — count per category for the UI chips
  app.get("/api/equipment/stats", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const [counts, total] = await Promise.all([
      col("equipment")
        .aggregate([
          { $match: { is_active: 1, user_id: userId } },
          { $group: { _id: "$category", n: { $sum: 1 } } },
        ])
        .toArray(),
      col("equipment").countDocuments({ is_active: 1, user_id: userId }),
    ]);

    const map: Record<string, number> = { all: total };
    for (const c of counts as any[]) {
      map[c._id] = c.n;
    }
    res.json(map);
  });

  // GET /api/equipment/:id/history — inspection history for a piece of equipment
  app.get("/api/equipment/:id/history", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const eq = await col<EquipmentDoc>("equipment").findOne({ ...idFilter(req.params.id), user_id: userId });
    if (!eq) { res.status(404).json({ error: "Not found" }); return; }

    // Collect document IDs linked to this equipment (direct + by serial number)
    const docIdSet = new Set<string>();
    if ((eq as any).document_id) docIdSet.add(String((eq as any).document_id));

    if ((eq as any).serial_number) {
      const siblings = await col("equipment")
        .find({ serial_number: (eq as any).serial_number, user_id: userId })
        .project({ document_id: 1 })
        .toArray();
      for (const s of siblings as any[]) {
        if (s.document_id) docIdSet.add(String(s.document_id));
      }
    }

    const docIds = [...docIdSet];

    // Fetch contracts linked to those documents
    const contracts = docIds.length
      ? await col("contracts")
          .find({ document_id: { $in: docIds }, user_id: userId })
          .sort({ start_date: -1 })
          .toArray()
      : [];

    // Fetch documents for extra metadata
    const events = await Promise.all(contracts.map(async (c: any) => {
      let document_name: string | null = null;
      let inspector: string | null = null;
      let extracted: Record<string, any> = {};

      if (c.document_id) {
        try {
          const doc = await col("documents").findOne({ _id: new ObjectId(String(c.document_id)) }) as any;
          document_name = doc?.file_name ?? null;
          if (doc?.extracted_fields) {
            try { extracted = JSON.parse(doc.extracted_fields); } catch {}
          }
          inspector = extracted.inspector ?? extracted.contact_person ?? null;
        } catch {}
      }

      const today = new Date().toISOString().slice(0, 10);
      const expiry = c.expiry_date as string | null;
      const daysUntil = expiry
        ? Math.ceil((new Date(expiry).getTime() - new Date(today).getTime()) / 86400000)
        : null;

      return {
        id: c._id?.toString(),
        contract_type: c.contract_type ?? null,
        contract_number: c.contract_number ?? null,
        start_date: c.start_date ?? null,
        expiry_date: expiry,
        status: c.status ?? null,
        document_id: c.document_id ?? null,
        document_name,
        inspector,
        load_capacity_test: extracted.load_capacity_test ?? null,
        test_pressure: extracted.test_pressure ?? null,
        pass_fail: extracted.pass_fail ?? extracted.result ?? null,
        days_until: daysUntil,
      };
    }));

    res.json(events);
  });

  // GET /api/equipment/:id/report.pdf
  app.get("/api/equipment/:id/report.pdf", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const eq = await col<EquipmentDoc>("equipment").findOne({ ...idFilter(req.params.id), user_id: userId });
    if (!eq) { res.status(404).json({ error: "Not found" }); return; }

    // Fetch history events (same logic as /history)
    const docIdSet = new Set<string>();
    if ((eq as any).document_id) docIdSet.add(String((eq as any).document_id));
    if ((eq as any).serial_number) {
      const siblings = await col("equipment")
        .find({ serial_number: (eq as any).serial_number, user_id: userId })
        .project({ document_id: 1 }).toArray();
      for (const s of siblings as any[]) if (s.document_id) docIdSet.add(String(s.document_id));
    }
    const docIds = [...docIdSet];
    const contracts = docIds.length
      ? await col("contracts").find({ document_id: { $in: docIds }, user_id: userId }).sort({ start_date: -1 }).toArray()
      : [];
    const events = await Promise.all(contracts.map(async (c: any) => {
      let document_name: string | null = null;
      let inspector: string | null = null;
      let extracted: Record<string, any> = {};
      if (c.document_id) {
        try {
          const doc = await col("documents").findOne({ _id: new ObjectId(String(c.document_id)) }) as any;
          document_name = doc?.file_name ?? null;
          if (doc?.extracted_fields) { try { extracted = JSON.parse(doc.extracted_fields); } catch {} }
          inspector = extracted.inspector ?? extracted.contact_person ?? null;
        } catch {}
      }
      const today = new Date().toISOString().slice(0, 10);
      const expiry = c.expiry_date as string | null;
      const daysUntil = expiry ? Math.ceil((new Date(expiry).getTime() - new Date(today).getTime()) / 86400000) : null;
      return { contract_type: c.contract_type ?? null, contract_number: c.contract_number ?? null, start_date: c.start_date ?? null, expiry_date: expiry, status: c.status ?? null, document_name, inspector, load_capacity_test: extracted.load_capacity_test ?? null, pass_fail: extracted.pass_fail ?? extracted.result ?? null, days_until: daysUntil };
    }));

    // Build PDF — buffer entirely before sending so errors can return proper HTTP status
    try {
      const PDFDocument = (await import("pdfkit")).default;

      // Collect the PDF into a buffer first
      const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: `Equipment Report` } });
        const chunks: Buffer[] = [];
        doc.on("data", (c: Buffer) => chunks.push(c));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        const fontAvailable = existsSync(HEBREW_FONT);
        if (fontAvailable) {
          doc.registerFont("Hebrew", HEBREW_FONT);
          doc.font("Hebrew");
        }

        const setFont = (size: number) => {
          doc.font(fontAvailable ? "Hebrew" : "Helvetica").fontSize(size);
        };

        // For Hebrew: font renders correctly; without font just output as-is (latin fallback)
        const t = (s: string | null | undefined, fallback = "") => s ?? fallback;

        // ── Header ────────────────────────────────────────────────────────
        setFont(18);
        doc.text(t(eq.name, "Equipment Report"), { align: "right" });
        doc.moveDown(0.2);
        setFont(10);
        doc.text(new Date().toLocaleDateString("he-IL"), { align: "right" });
        doc.moveDown(0.8);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#cccccc");
        doc.moveDown(0.8);

        // ── Equipment details ─────────────────────────────────────────────
        setFont(13);
        doc.text("פרטי הציוד", { align: "right" });
        doc.moveDown(0.4);
        setFont(10);

        const detailRows: [string, string | null | undefined][] = [
          ["יצרן", eq.manufacturer],
          ["דגם", eq.model],
          ["מספר סידורי", eq.serial_number],
          ["קטגוריה", eq.category],
          ["עומס עבודה", eq.capacity],
          ["עומס מבחן", eq.load_capacity_test],
          ["רדיוס עומס", eq.load_radius],
          ["לקוח", (eq as any).client_name],
        ];
        for (const [label, value] of detailRows) {
          if (!value) continue;
          doc.text(`${t(label)}: ${value}`, { align: "right" });
        }
        if (eq.description) {
          doc.moveDown(0.3);
          doc.text(`תיאור: ${eq.description}`, { align: "right" });
        }

        // ── Inspection history ────────────────────────────────────────────
        doc.moveDown(0.8);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke("#cccccc");
        doc.moveDown(0.8);
        setFont(13);
        doc.text("היסטוריית בדיקות", { align: "right" });
        doc.moveDown(0.5);

        if (events.length === 0) {
          setFont(10);
          doc.text("אין רשומות בדיקה", { align: "right" });
        } else {
          for (const ev of events) {
            setFont(11);
            const num = ev.contract_number ? ` (#${ev.contract_number})` : "";
            doc.text(`${t(ev.contract_type, "בדיקה")}${num}`, { align: "right" });
            setFont(10);
            if (ev.start_date) doc.text(`תאריך: ${ev.start_date}`, { align: "right" });
            if (ev.expiry_date) {
              const daysStr = ev.days_until !== null
                ? (ev.days_until < 0 ? ` (פג לפני ${Math.abs(ev.days_until)} ימים)` : ` (${ev.days_until} ימים)`)
                : "";
              doc.text(`פקיעה: ${ev.expiry_date}${daysStr}`, { align: "right" });
            }
            if (ev.inspector) doc.text(`בודק: ${ev.inspector}`, { align: "right" });
            if (ev.load_capacity_test) doc.text(`עומס מבחן: ${ev.load_capacity_test}`, { align: "right" });
            if (ev.pass_fail) doc.text(`תוצאה: ${ev.pass_fail}`, { align: "right" });
            doc.moveDown(0.5);
          }
        }

        doc.end();
      });

      // Filename: use equipment name + serial/report number
      const safeName = (eq.name ?? "equipment").replace(/[^\w֐-׿\s-]/g, "").trim().replace(/\s+/g, "_");
      const safeSerial = (eq.serial_number ?? req.params.id).replace(/[^\w-]/g, "");
      const filename = `${safeName}_${safeSerial}.pdf`;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader("Content-Length", pdfBuffer.length);
      res.end(pdfBuffer);

    } catch (err) {
      console.error("[PDF] generation error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: String(err) });
      }
    }
  });

  // POST /api/equipment/:id/photos — upload a field photo, save to S3/local, append URL
  app.post("/api/equipment/:id/photos", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const eq = await col<EquipmentDoc>("equipment").findOne({ ...idFilter(req.params.id), user_id: userId });
    if (!eq) { res.status(404).json({ error: "Not found" }); return; }

    const multer = await import("multer");
    const upload = multer.default({
      storage: multer.default.memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 },
    }).single("photo");

    upload(req as any, res as any, async (err: any) => {
      if (err) { res.status(400).json({ error: err.message }); return; }
      const file = (req as any).file as { buffer: Buffer; mimetype: string; originalname: string } | undefined;
      if (!file) { res.status(400).json({ error: "No photo file" }); return; }

      const ext = extname(file.originalname).toLowerCase() || ".jpg";
      const key = `equipment-photos/${req.params.id}/${Date.now()}${ext}`;
      let photoUrl: string;

      if (spacesEnabled()) {
        // Save buffer to a temp file then upload to S3
        const tmpDir = join(getDataDir(), "uploads");
        mkdirSync(tmpDir, { recursive: true });
        const tmpPath = join(tmpDir, `photo-${Date.now()}${ext}`);
        writeFileSync(tmpPath, file.buffer);
        await uploadToSpaces(tmpPath, key, file.mimetype);
        photoUrl = await getSpacesSignedUrl(key, 7 * 24 * 3600);
        // Store the S3 key so we can refresh the URL later; encode as "s3:<key>|<url>"
        photoUrl = `s3:${key}`;
      } else {
        // Local fallback — save to data/equipment-photos/
        const photosDir = join(getDataDir(), "equipment-photos", req.params.id);
        mkdirSync(photosDir, { recursive: true });
        const fileName = `${Date.now()}${ext}`;
        writeFileSync(join(photosDir, fileName), file.buffer);
        photoUrl = `/api/equipment/${req.params.id}/photos/${fileName}`;
      }

      const taken_at = new Date().toISOString();
      const photoEntry = { key: photoUrl, taken_at };

      await col("equipment").updateOne(
        idFilter(req.params.id),
        { $push: { photo_urls: photoEntry } as any, $set: { updated_at: new Date() } }
      );

      // Return the URL to display — resolve S3 key to signed URL for the response
      let displayUrl = photoUrl;
      if (photoUrl.startsWith("s3:")) {
        displayUrl = await getSpacesSignedUrl(photoUrl.slice(3), 7 * 24 * 3600);
      }

      res.json({ url: displayUrl, key: photoUrl, taken_at });
    });
  });

  // DELETE /api/equipment/:id/photos — remove a photo by its stored key
  app.delete("/api/equipment/:id/photos", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const { key } = req.body as { key?: string };
    if (!key) { res.status(400).json({ error: "key required" }); return; }

    await col("equipment").updateOne(
      { ...idFilter(req.params.id), user_id: userId },
      { $pull: { photo_urls: { key } } as any, $set: { updated_at: new Date() } }
    );

    if (key.startsWith("s3:")) {
      const { deleteFromSpaces } = await import("../storage/spaces.js");
      await deleteFromSpaces(key.slice(3)).catch(() => {});
    }

    res.json({ ok: true });
  });

  // GET /api/equipment/:id/photos/:filename — serve locally stored photo
  app.get("/api/equipment/:id/photos/:filename", async (req, res) => {
    try {
      const ctx = await requireAuth(req.headers.cookie);
      const userId = ctx.userId;
      const eq = await col("equipment").findOne({ ...idFilter(req.params.id), user_id: userId });
      if (!eq) { res.status(404).end(); return; }
    } catch {
      res.status(401).end(); return;
    }

    const { createReadStream, existsSync } = await import("fs");
    const filePath = join(getDataDir(), "equipment-photos", req.params.id, req.params.filename);
    if (!existsSync(filePath)) { res.status(404).end(); return; }
    const ext = extname(req.params.filename).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.setHeader("Content-Type", mime);
    createReadStream(filePath).pipe(res);
  });

  // GET /api/equipment/:id/photos/signed — refresh signed URLs for all S3 photos
  app.get("/api/equipment/:id/photos/signed", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const eq = await col<EquipmentDoc>("equipment").findOne({ ...idFilter(req.params.id), user_id: userId });
    if (!eq) { res.status(404).json({ error: "Not found" }); return; }

    const stored: { key: string; taken_at: string }[] = (eq as any).photo_urls ?? [];
    const resolved = await Promise.all(stored.map(async (entry) => {
      let url: string | null = entry.key;
      if (entry.key.startsWith("s3:")) {
        try { url = await getSpacesSignedUrl(entry.key.slice(3), 7 * 24 * 3600); } catch { url = null; }
      }
      return url ? { url, key: entry.key, taken_at: entry.taken_at } : null;
    }));

    const photos = resolved.filter(Boolean) as { url: string; key: string; taken_at: string }[];
    res.json({ photos });
  });

  // GET /api/equipment/:id
  app.get("/api/equipment/:id", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const row = await col<EquipmentDoc>("equipment").findOne({ ...idFilter(req.params.id), user_id: userId });
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const flat = flatDoc(row) as any;
    if (row.client_id) {
      try {
        const client = await col("clients").findOne({ _id: new ObjectId(String(row.client_id)) }) as any;
        flat.client_name = client?.display_name ?? null;
      } catch { flat.client_name = null; }
    }
    if (row.document_id) {
      try {
        const doc = await col("documents").findOne({ _id: new ObjectId(String(row.document_id)) }) as any;
        flat.document_name = doc?.file_name ?? null;
      } catch { flat.document_name = null; }
    }
    res.json(flat);
  });

  // POST /api/equipment
  app.post("/api/equipment", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const body = req.body as Partial<Equipment>;
    if (!body.name) {
      res.status(400).json({ error: "name required" });
      return;
    }
    const now = new Date();
    const doc = {
      user_id: userId,
      name: body.name,
      category: body.category ?? "other",
      manufacturer: body.manufacturer ?? null,
      model: body.model ?? null,
      serial_number: body.serial_number ?? null,
      license_number: (body as any).license_number ?? null,
      capacity: body.capacity ?? null,
      load_capacity_test: (body as any).load_capacity_test ?? null,
      load_radius: (body as any).load_radius ?? null,
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
    const body = req.body as Partial<Equipment>;

    const updates: Record<string, any> = { updated_at: new Date() };
    const fields = [
      "name", "category", "manufacturer", "model", "serial_number",
      "license_number", "capacity", "load_capacity_test", "load_radius",
      "description", "notes", "is_active", "client_id",
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
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    await col("equipment").deleteOne({ ...idFilter(req.params.id), user_id: userId });
    res.json({ ok: true });
  });

  // DELETE /api/equipment — delete all equipment for the user
  app.delete("/api/equipment", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const result = await col("equipment").deleteMany({ user_id: userId });
    res.json({ ok: true, deleted: result.deletedCount });
  });

  // POST /api/equipment/import-xlsx — parse XLSX and return preview rows (no save)
  app.post("/api/equipment/import-xlsx/preview", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const multer = await import("multer");
    const upload = multer.default({ storage: multer.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single("file");

    upload(req as any, res as any, async (err: any) => {
      if (err) { res.status(400).json({ error: err.message }); return; }
      const file = (req as any).file as { buffer: Buffer } | undefined;
      if (!file) { res.status(400).json({ error: "No file" }); return; }

      const XLSX = await import("xlsx");
      const wb = XLSX.read(file.buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });

      const headers: string[] = (rawRows[0] ?? []).map((h: any) => String(h ?? "").trim());
      const dataRows = rawRows.slice(1).filter((r: string[]) => r.some((c: any) => String(c ?? "").trim()));

      const preview = dataRows.slice(0, 5).map((r: string[]) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = String(r[i] ?? "").trim(); });
        return obj;
      });

      res.json({ headers, total: dataRows.length, preview });
    });
  });

  // POST /api/equipment/import-xlsx/confirm — save mapped rows as equipment
  app.post("/api/equipment/import-xlsx/confirm", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    const multer = await import("multer");
    const upload = multer.default({ storage: multer.default.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).fields([
      { name: "file", maxCount: 1 },
      { name: "mapping", maxCount: 1 },
    ]);

    upload(req as any, res as any, async (err: any) => {
      if (err) { res.status(400).json({ error: err.message }); return; }

      const files = (req as any).files as Record<string, { buffer: Buffer }[]> | undefined;
      const fileBuffer = files?.["file"]?.[0]?.buffer;
      if (!fileBuffer) { res.status(400).json({ error: "No file" }); return; }

      let mapping: Record<string, string> = {};
      try { mapping = JSON.parse((req as any).body?.mapping ?? "{}"); } catch {}

      const XLSX = await import("xlsx");
      const wb = XLSX.read(fileBuffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });

      const headers: string[] = (rawRows[0] ?? []).map((h: any) => String(h ?? "").trim());
      const dataRows = rawRows.slice(1).filter((r: string[]) => r.some((c: any) => String(c ?? "").trim()));

      const now = new Date();
      let created = 0;
      let skipped = 0;

      for (const row of dataRows) {
        const get = (field: string): string => {
          const col = mapping[field];
          if (!col) return "";
          const idx = headers.indexOf(col);
          return idx >= 0 ? String(row[idx] ?? "").trim() : "";
        };

        const name = get("name");
        if (!name) { skipped++; continue; }

        const serial_number = get("serial_number") || null;

        // Dedup by serial number
        if (serial_number) {
          const exists = await col("equipment").findOne({ serial_number, user_id: userId });
          if (exists) { skipped++; continue; }
        }

        const doc: Record<string, any> = {
          user_id: userId,
          name,
          category: get("category") || "other",
          manufacturer: get("manufacturer") || null,
          model: get("model") || null,
          serial_number,
          capacity: get("capacity") || null,
          load_capacity_test: get("load_capacity_test") || null,
          load_radius: get("load_radius") || null,
          description: get("description") || null,
          notes: get("notes") || null,
          is_active: 1,
          created_at: now,
          updated_at: now,
        };

        await col("equipment").insertOne(doc as any);
        created++;

        // If next_inspection_date is mapped and has a value, create a reminder
        const nextInspection = get("next_inspection_date");
        if (nextInspection && nextInspection.match(/\d{4}-\d{2}-\d{2}/)) {
          const { generateContractReminders } = await import("../reminders/scheduler.js");
          // create a stub contract to hang the reminder on
          const contractDoc = {
            user_id: userId,
            contract_type: "בדיקה",
            expiry_date: nextInspection,
            status: "active",
            created_at: now,
            updated_at: now,
          };
          const r = await col("contracts").insertOne(contractDoc as any);
          await generateContractReminders(r.insertedId.toString(), null, null, nextInspection, userId);
        }
      }

      res.json({ ok: true, created, skipped });
    });
  });

  // POST /api/equipment/backfill — patch equipment records missing document_id/client_id
  app.post("/api/equipment/backfill", async (req, res) => {
    let userId: string;
    try {
      const ctx = await requireAuth(req.headers.cookie);
      userId = ctx.userId;
    } catch (e) {
      const err = e as HTTPException;
      res.status(err.status ?? 401).json({ error: err.message });
      return;
    }

    let patched = 0;
    const extractions = await col("extractions").find({}).toArray();

    for (const ext of extractions as any[]) {
      let fields: any;
      if (ext.result_json && typeof ext.result_json === "object" && !Array.isArray(ext.result_json)) {
        fields = ext.result_json;
      } else {
        try { fields = JSON.parse(ext.result_json ?? "{}"); } catch { continue; }
      }
      const equipmentList: any[] = Array.isArray(fields._equipment) ? fields._equipment : [];
      if (!equipmentList.length) continue;

      const documentId: string = String(ext.document_id);

      // Resolve client_id: try document_clients first, fall back to contracts
      let clientId: string | null = null;
      const dc = await col("document_clients").findOne({ document_id: documentId }) as any;
      if (dc?.client_id) {
        clientId = String(dc.client_id);
      } else {
        const contract = await col("contracts").findOne({ document_id: documentId }) as any;
        if (contract?.client_id) clientId = String(contract.client_id);
      }

      for (const eq of equipmentList) {
        if (!eq?.serial_number && !eq?.name) continue;
        const matchFilter: Record<string, any> = eq.serial_number
          ? { serial_number: String(eq.serial_number).trim() }
          : { name: String(eq.name ?? "").trim() };

        const result = await col("equipment").updateOne(
          {
            ...matchFilter,
            user_id: userId,
            $or: [
              { document_id: { $exists: false } },
              { document_id: null },
              { client_id: { $exists: false } },
              { client_id: null },
            ],
          },
          {
            $set: {
              document_id: documentId,
              ...(clientId && { client_id: clientId }),
              updated_at: new Date(),
            },
          }
        );
        if (result.modifiedCount > 0) patched++;
      }
    }

    res.json({ ok: true, patched });
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

function extractContactPersonFromNotes(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(?:^|\n)\s*איש\s+קשר\s*[:：-]\s*([^\n]+)/);
  return match?.[1]?.trim() || null;
}

function contactFieldsFromContract(contract: any, documentFields: Record<string, unknown> | null = null): {
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
} {
  const fields = parseManualFields(contract?.manual_fields);
  return {
    contact_person: textField(fields?.contact_person) ?? textField(documentFields?.contact_person) ?? textField(documentFields?.client_name),
    contact_email: textField(fields?.contact_email) ?? textField(documentFields?.contact_email) ?? textField(documentFields?.client_email) ?? textField(documentFields?.email),
    contact_phone: textField(fields?.contact_phone) ?? textField(documentFields?.contact_phone) ?? textField(documentFields?.client_phone) ?? textField(documentFields?.phone),
  };
}

function parseManualFields(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function textField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
