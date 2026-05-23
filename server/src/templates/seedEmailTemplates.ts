// Seed the default email template on first boot.
// Users can edit / clone / disable. Bound to no doc_template = used as fallback.

import { col } from "../db/db";
import { loadReminderTemplate } from "../email-templates/loader";
import type { EmailTemplate } from "../../src/shared/types.js";

const DEFAULT_HTML    = loadReminderTemplate("default");
const INSPECTION_HTML = loadReminderTemplate("inspection");
const CONTRACT_HTML   = loadReminderTemplate("contract");
const INVOICE_HTML    = loadReminderTemplate("invoice");

interface TemplateSeed {
  name: string;
  subject: string;
  html: string;
  is_default: number;
  doc_template_name: string | null; // matched by name to find doc_template_id
}

const SEEDS: TemplateSeed[] = [
  {
    name: "ברירת מחדל",
    subject: "[תזכורת] {{title}}",
    html: DEFAULT_HTML,
    is_default: 1,
    doc_template_name: null,
  },
  {
    name: "תסקיר בדיקה תקופתית",
    subject: "[תזכורת בדיקה] {{client_company}} — {{advance_days}} ימים לבדיקה",
    html: INSPECTION_HTML,
    is_default: 0,
    doc_template_name: "תסקיר בדיקה",
  },
  {
    name: "פקיעת חוזה שירות",
    subject: "[פקיעת חוזה] {{client_company}} — {{advance_days}} ימים לפקיעה",
    html: CONTRACT_HTML,
    is_default: 0,
    doc_template_name: "חוזה שירות",
  },
  {
    name: "תזכורת תשלום חשבונית",
    subject: "[תשלום] {{client_company}} — חשבונית {{document_number}}",
    html: INVOICE_HTML,
    is_default: 0,
    doc_template_name: "חשבונית",
  },
];

export async function seedDefaultEmailTemplate(): Promise<void> {
  for (const seed of SEEDS) {
    let doc_template_id: string | null = null;
    if (seed.doc_template_name) {
      const dt = await col("doc_templates").findOne({ name: seed.doc_template_name }) as any;
      if (dt) doc_template_id = dt._id?.toString() ?? null;
    }

    const now = new Date();
    await col("email_templates").updateOne(
      { name: seed.name },
      {
        // Always refresh html + subject from disk so stale DB rows get fixed on boot
        $set: {
          html: seed.html,
          subject: seed.subject,
          updated_at: now,
        },
        $setOnInsert: {
          name: seed.name,
          is_default: seed.is_default,
          doc_template_id,
          logo_path: null,
          created_at: now,
        },
      },
      { upsert: true }
    );
  }
}

export async function loadEmailTemplate(id: string | number): Promise<EmailTemplate | null> {
  const { ObjectId } = await import("mongodb");
  let filter: Record<string, any>;
  try {
    filter = { _id: new ObjectId(String(id)) };
  } catch {
    filter = { _id: id };
  }
  const row = await col("email_templates").findOne(filter) as any;
  if (!row) return null;
  const { _id, ...rest } = row;
  return { id: _id?.toString(), ...rest } as any;
}

export async function pickEmailTemplate(docTemplateId: string | number | null): Promise<EmailTemplate | null> {
  if (docTemplateId) {
    const bound = await col("email_templates").findOne(
      { doc_template_id: String(docTemplateId) },
      { sort: { is_default: -1, _id: 1 } }
    ) as any;
    if (bound) {
      const { _id, ...rest } = bound;
      return { id: _id?.toString(), ...rest } as any;
    }
  }

  const def = await col("email_templates").findOne(
    { is_default: 1 },
    { sort: { _id: 1 } }
  ) as any;
  if (def) {
    const { _id, ...rest } = def;
    return { id: _id?.toString(), ...rest } as any;
  }

  const any = await col("email_templates").findOne({}, { sort: { _id: 1 } }) as any;
  if (!any) return null;
  const { _id, ...rest } = any;
  return { id: _id?.toString(), ...rest } as any;
}
