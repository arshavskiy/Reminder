/**
 * End-to-end test: upload a file through the app's /api/documents/upload endpoint
 * and verify it lands in S3.
 * Run: node --env-file=.env test_upload_s3.mjs
 */
import {existsSync, readFileSync} from "fs";
import {HeadObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = `http://localhost:${process.env.PORT ?? 3737}`;

// ── 1. Login to get session cookie ───────────────────────────────────────────
process.stdout.write("1. Login ... ");
const loginRes = await fetch(`${SERVER}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "arshavsky.pasha@gmail.com", password: process.env.TEST_PASSWORD ?? "" }),
});

let cookie = "";
if (loginRes.ok) {
  cookie = loginRes.headers.get("set-cookie") ?? "";
  console.log("✅");
} else {
  // Try reading an existing session from env
  cookie = process.env.TEST_COOKIE ?? "";
  if (!cookie) {
    console.log("⚠️  Login failed — set TEST_COOKIE=... in .env with a valid session cookie");
    process.exit(1);
  }
  console.log("⚠️  Using TEST_COOKIE from env");
}

// ── 2. Upload the test PDF ────────────────────────────────────────────────────
const pdfPath = join(__dirname, "test_certificate_hebrew.pdf");
if (!existsSync(pdfPath)) {
  console.error("❌  test_certificate_hebrew.pdf not found — run: python make_test_cert.py");
  process.exit(1);
}

process.stdout.write("2. Upload PDF to /api/documents/upload ... ");
const fd = new FormData();
fd.append("files", new Blob([readFileSync(pdfPath)], { type: "application/pdf" }), "test_certificate_hebrew.pdf");

const uploadRes = await fetch(`${SERVER}/api/documents/upload`, {
  method: "POST",
  headers: { cookie },
  body: fd,
});

if (!uploadRes.ok) {
  const err = await uploadRes.json().catch(() => ({}));
  console.log(`❌  HTTP ${uploadRes.status}:`, err);
  process.exit(1);
}
const { ids, duplicates } = await uploadRes.json();
console.log(`✅  ids=${JSON.stringify(ids)} duplicates=${JSON.stringify(duplicates)}`);

if (!ids?.length) {
  console.log("⚠️  No new document ID returned (duplicate?)");
  process.exit(0);
}
const docId = ids[0];

// ── 3. Poll until processing_status = done ───────────────────────────────────
process.stdout.write("3. Waiting for processing to complete ");
let doc;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const r = await fetch(`${SERVER}/api/documents/${docId}`, { headers: { cookie } });
  doc = await r.json();
  if (doc.processing_status === "done" || doc.processing_status === "error") break;
  process.stdout.write(".");
}
console.log(` → ${doc.processing_status}`);

if (doc.processing_status === "error") {
  console.error("❌  Processing error:", doc.error_message);
  process.exit(1);
}

// ── 4. Check S3 for the uploaded file ────────────────────────────────────────
if (!doc.spaces_key) {
  console.log("⚠️  spaces_key is null — S3 upload was skipped (PROCESS_ONLY=true?)");
  process.exit(0);
}

process.stdout.write(`4. Verify file in S3 (key: ${doc.spaces_key}) ... `);
const s3 = new S3Client({
  endpoint: process.env.ENDPOINT,
  region: process.env.REGION ?? "auto",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

const head = await s3.send(new HeadObjectCommand({ Bucket: process.env.BUCKET, Key: doc.spaces_key }));
console.log(`✅  ${head.ContentLength} bytes in S3`);
console.log(`   URL: ${doc.spaces_url}`);

console.log("\n✅  Full pipeline test passed: upload → OCR → S3 storage.");
