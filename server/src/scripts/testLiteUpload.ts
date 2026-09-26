import dns from "dns";
dns.setDefaultResultOrder("verbatim");

import "./loadEnv";
import { connectDb, col } from "../db/db";
import { createSession } from "../auth/session";
import { ObjectId } from "mongodb";

const EMAIL = "test-lite@example.com";

const DOC_CONTENT = `HOME RENTAL AGREEMENT — SHORT TERM LEASE

Property Owner: Pacific Heights Realty LLC
Tenant: Alex Rivera
Property Address: 2200 Pacific Ave, Unit 5C, San Francisco, CA 94115

Lease Start: November 1, 2026
Lease End / Expiry Date: April 30, 2027
Monthly Rent: $4,500

Move-in deposit: $9,000
Pet deposit: $500

This is a unique test document created on ${new Date().toISOString()}
Agreement ID: LT-${Date.now()}
`;

async function main() {
  await connectDb();

  const user = await col("users").findOne({ email: EMAIL }) as any;
  if (!user) {
    console.error("Test user not found.");
    process.exit(1);
  }

  const { cookies } = await createSession(user._id.toString());
  const cookieHeader = cookies.map(c => c.split(";")[0]).join("; ");

  // LITE import
  console.log("━━━ Uploading LITE import ━━━");
  const form = new FormData();
  form.append("files", new File([DOC_CONTENT], `Home-Rental-Lite-${Date.now()}.txt`, { type: "text/plain" }));

  const url = "http://localhost:3737/api/documents/upload?skipCloudStorage=true&liteImport=true";
  const res = await fetch(url, {
    method: "POST",
    headers: { Cookie: cookieHeader },
    body: form,
  });
  const body = await res.json() as any;
  console.log("Status:", res.status, "ID:", body.ids?.[0]);

  if (!body.ids?.[0]) {
    console.error("Upload failed:", body);
    process.exit(1);
  }

  console.log("\nWaiting 15s for processing...\n");
  await new Promise(r => setTimeout(r, 15000));

  const docId = body.ids[0];
  const doc = await col("documents").findOne({ _id: new ObjectId(docId) }) as any;
  console.log("Document:");
  console.log("  lite_import:", doc?.lite_import);
  console.log("  document_kind:", doc?.document_kind);
  console.log("  template_id:", doc?.template_id ?? "none");
  console.log("  extracted_fields:", doc?.extracted_fields ? "yes" : "no");

  // Check reminder
  const reminders = await col("reminders").find({
    user_id: user._id.toString(),
    source_type: "personal",
    created_at: { $gte: new Date(Date.now() - 60000) },
  }).toArray() as any[];

  if (reminders.length) {
    for (const r of reminders) {
      console.log("\n  Reminder created:");
      console.log("    title:", r.title);
      console.log("    trigger_date:", r.trigger_date);
      console.log("    category:", r.reminder_category);
      console.log("    calendar_sync:", r.calendar_sync);
      console.log("    email_to:", r.email_to);
    }
  } else {
    console.log("\n  No reminder created");

    // Check OCR data
    if (doc?.ocr_text || doc?.preservedOcr) {
      console.log("  OCR text available — checking for expiry date...");
    }
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
