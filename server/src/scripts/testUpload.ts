import dns from "dns";
dns.setDefaultResultOrder("verbatim");

import "./loadEnv";
import { connectDb, col } from "../db/db";
import { createSession } from "../auth/session";
import { ObjectId } from "mongodb";

const EMAIL = "test-lite@example.com";

const DOCS = [
  {
    name: "Auto-Insurance-Policy-StateFarm-2026-v2.txt",
    label: "Car Insurance Policy",
    content: `STATE FARM MUTUAL AUTOMOBILE INSURANCE COMPANY

PERSONAL AUTO POLICY DECLARATIONS

Policy Number: 92-BX-7743-1
Policy Period: From April 1, 2026 to October 1, 2026
               (12:01 AM Standard Time)

Expiration Date: October 1, 2026

Named Insured: Jane M. Doe
Address: 456 Ocean Avenue, Apt 12
         San Francisco, CA 94102

Vehicle: 2023 Toyota Camry SE
VIN: 4T1BZ1HK3PU123456
Usage: Commute (15 miles one way)

COVERAGE SUMMARY:
  Bodily Injury Liability:     $100,000 / $300,000
  Property Damage Liability:   $50,000
  Uninsured Motorist:          $100,000 / $300,000
  Collision Deductible:        $500
  Comprehensive Deductible:    $250
  Rental Reimbursement:        $50/day, 30 days max
  Roadside Assistance:         Included

PREMIUM SUMMARY:
  Bodily Injury:     $312.00
  Property Damage:   $198.00
  Collision:         $445.00
  Comprehensive:     $167.00
  Total 6-Month Premium: $1,122.00

Agent: Robert Chen, License #0H55821
Phone: (415) 555-0192

THIS POLICY IS A LEGAL CONTRACT. READ IT CAREFULLY.
`,
  },
  {
    name: "CPA-License-California-2026-v2.txt",
    label: "Professional CPA License",
    content: `CALIFORNIA BOARD OF ACCOUNTANCY
DEPARTMENT OF CONSUMER AFFAIRS

CERTIFICATE TO PRACTICE PUBLIC ACCOUNTANCY

License Number: CPA 142857
Issue Date: January 15, 2024
Expiration Date: January 31, 2027

This certifies that

MICHAEL R. THOMPSON

has met all requirements prescribed by law and is hereby
authorized to practice as a CERTIFIED PUBLIC ACCOUNTANT
in the State of California.

Continuing Education Requirements:
  Total hours required per renewal cycle: 80
  Ethics hours required: 4
  Hours completed this cycle: 52 of 80
  Next CE deadline: December 31, 2026

Disciplinary History: None

License Status: ACTIVE
Specialty Designations: Forensic Accounting, Tax

Board Chair: Patricia Williams, CPA
Executive Officer: David L. Nance

California Board of Accountancy
2450 Venture Oaks Way, Suite 300
Sacramento, CA 95833
Phone: (916) 263-3680

This license must be renewed biennially. Failure to renew
by the expiration date will result in delinquent status.
`,
  },
  {
    name: "Warranty-Certificate-Samsung-TV-2026-v2.txt",
    label: "Product Warranty Certificate",
    content: `SAMSUNG ELECTRONICS WARRANTY CERTIFICATE

WARRANTY REGISTRATION CONFIRMATION

Product: Samsung 65" Neo QLED 4K Smart TV
Model Number: QN65QN85CAFXZA
Serial Number: 09GH3CKN500789T
Purchase Date: June 15, 2025
Warranty Expiration Date: June 15, 2027

Registered Owner: Sarah J. Martinez
Email: sarah.martinez@email.com
Phone: (310) 555-0847
Address: 789 Sunset Blvd, Los Angeles, CA 90028

WARRANTY COVERAGE:
  Parts:  24 months from date of purchase
  Labor:  24 months from date of purchase
  Panel:  24 months from date of purchase

WHAT IS COVERED:
  - Manufacturing defects in materials and workmanship
  - Panel defects (dead pixels exceeding manufacturer threshold)
  - Internal component failure under normal use
  - Software/firmware issues affecting core functionality

WHAT IS NOT COVERED:
  - Physical damage, misuse, or unauthorized modifications
  - Damage from power surges (use a surge protector)
  - Burn-in from static images displayed for extended periods
  - Cosmetic damage that does not affect functionality
  - Products with removed or altered serial numbers

Purchase Price: $1,299.99
Retailer: Best Buy Store #1142, Los Angeles

For warranty service call: 1-800-SAMSUNG (726-7864)
Or visit: samsung.com/us/support

Warranty Registration ID: WR-2025-0615-SM789
`,
  },
];

async function main() {
  await connectDb();

  const user = await col("users").findOne({ email: EMAIL }) as any;
  if (!user) {
    console.error("Test user not found. Run seedTestUser first.");
    process.exit(1);
  }

  const { cookies } = await createSession(user._id.toString());
  const cookieHeader = cookies.map(c => c.split(";")[0]).join("; ");
  console.log("Session created for", EMAIL, "\n");

  const results: { name: string; id: string; mode: string }[] = [];

  // Upload all 3 with FULL pipeline (auto-template generation)
  for (const doc of DOCS) {
    console.log(`\n━━━ Uploading: ${doc.label} (FULL pipeline) ━━━`);
    const formData = new FormData();
    formData.append("files", new File([doc.content], doc.name, { type: "text/plain" }));

    const url = "http://localhost:3737/api/documents/upload?skipCloudStorage=true&reprocessDuplicates=true";
    const res = await fetch(url, {
      method: "POST",
      headers: { Cookie: cookieHeader },
      body: formData,
    });
    const body = await res.json() as any;
    console.log("  Status:", res.status, "ID:", body.ids?.[0] ?? "none");
    if (body.ids?.[0]) results.push({ name: doc.label, id: body.ids[0], mode: "full" });
  }

  // Upload the insurance doc again with LITE import
  console.log(`\n━━━ Uploading: ${DOCS[0].label} (LITE import) ━━━`);
  const liteForm = new FormData();
  liteForm.append("files", new File([DOCS[0].content], "Insurance-Lite-Test-v2.txt", { type: "text/plain" }));

  const liteUrl = "http://localhost:3737/api/documents/upload?skipCloudStorage=true&liteImport=true";
  const liteRes = await fetch(liteUrl, {
    method: "POST",
    headers: { Cookie: cookieHeader },
    body: liteForm,
  });
  const liteBody = await liteRes.json() as any;
  console.log("  Status:", liteRes.status, "ID:", liteBody.ids?.[0] ?? "none");
  if (liteBody.ids?.[0]) results.push({ name: "Insurance (LITE)", id: liteBody.ids[0], mode: "lite" });

  // Wait for pipeline
  console.log("\n⏳ Waiting 45s for pipeline processing...\n");
  await new Promise(r => setTimeout(r, 45000));

  // Check results
  for (const r of results) {
    console.log(`\n═══ ${r.name} (${r.mode}) ═══`);
    const doc = await col("documents").findOne({ _id: new ObjectId(r.id) }) as any;
    console.log("  Status:", doc?.status ?? "no status field");
    console.log("  Document kind:", doc?.document_kind ?? "none");
    console.log("  Template ID:", doc?.template_id ?? "none");
    console.log("  Lite import:", doc?.lite_import ?? false);

    if (doc?.template_id) {
      const tmpl = await col("doc_templates").findOne({ _id: new ObjectId(doc.template_id) }) as any;
      if (tmpl) {
        console.log("  Template name:", tmpl.name);
        console.log("  Auto-generated:", tmpl.auto_generated ?? "no");
        console.log("  Keywords:", tmpl.match_keywords?.join(", ") ?? "none");
        console.log("  Fields:", tmpl.fields?.map((f: any) => f.key || f.name).join(", ") ?? "none");
      }
    }

    if (doc?.extracted_fields) {
      const fields = typeof doc.extracted_fields === "string"
        ? JSON.parse(doc.extracted_fields)
        : doc.extracted_fields;
      console.log("  Extracted fields:");
      for (const [k, v] of Object.entries(fields)) {
        if (v !== null && v !== undefined && v !== "") {
          const val = typeof v === "object" ? JSON.stringify(v) : String(v);
          console.log(`    ${k}: ${val.slice(0, 100)}`);
        }
      }
    }

    // Check if reminder was created (for lite import)
    if (r.mode === "lite") {
      const reminder = await col("reminders").findOne({
        user_id: user._id.toString(),
        source_type: "personal",
        created_at: { $gte: new Date(Date.now() - 120000) },
      }) as any;
      if (reminder) {
        console.log("  ✓ Reminder created:", reminder.title, "due:", reminder.trigger_date);
      } else {
        console.log("  ✗ No reminder created");
      }
    }
  }

  // Check auto-generated templates
  console.log("\n\n═══ Auto-generated templates ═══");
  const autoTemplates = await col("doc_templates").find({ auto_generated: 1 }).toArray() as any[];
  if (autoTemplates.length === 0) {
    console.log("  None found. Checking all recent templates...");
    const recent = await col("doc_templates").find({
      created_at: { $gte: new Date(Date.now() - 300000) },
    }).toArray() as any[];
    for (const t of recent) {
      console.log(`  - ${t.name} (auto: ${t.auto_generated ?? "no"}, keywords: ${t.match_keywords?.join(", ")})`);
    }
  } else {
    for (const t of autoTemplates) {
      console.log(`  - ${t.name}`);
      console.log(`    Keywords: ${t.match_keywords?.join(", ")}`);
      console.log(`    Fields: ${t.fields?.map((f: any) => f.key || f.name).join(", ")}`);
    }
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
