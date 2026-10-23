/**
 * S3 connectivity test — run with:
 *   node --env-file=.env test_s3.mjs
 */
import {DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";

// ── Read config from env ──────────────────────────────────────────────────────
const endpoint  = process.env.S3_ENDPOINT        ?? process.env.ENDPOINT;
const bucket    = process.env.S3_BUCKET_NAME     ?? process.env.BUCKET;
const accessKey = process.env.AWS_ACCESS_KEY_ID;
const secret    = process.env.AWS_SECRET_ACCESS_KEY;
const region    = process.env.S3_REGION          ?? process.env.REGION ?? "auto";

if (!endpoint || !bucket || !accessKey || !secret) {
  console.error("❌  Missing env vars. Need: ENDPOINT, BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY");
  process.exit(1);
}

// Normalise endpoint
const ep = endpoint.startsWith("http") ? endpoint : `https://${endpoint}`;
const isRailway = ep.includes("storage.railway.app");
const forcePathStyle = !isRailway;

console.log("╔══════════════════════════════════════════════════");
console.log("║  S3 Connection Test");
console.log("╠══════════════════════════════════════════════════");
console.log(`║  Endpoint   : ${ep}`);
console.log(`║  Bucket     : ${bucket}`);
console.log(`║  Region     : ${region}`);
console.log(`║  Key prefix : ${accessKey.slice(0, 8)}...`);
console.log(`║  PathStyle  : ${forcePathStyle}`);
console.log("╚══════════════════════════════════════════════════\n");

const client = new S3Client({
  endpoint: ep,
  region,
  credentials: { accessKeyId: accessKey, secretAccessKey: secret },
  forcePathStyle,
});

const TEST_KEY  = `test/s3-test-${Date.now()}.txt`;
const TEST_BODY = `S3 test upload — ${new Date().toISOString()}`;

async function run() {
  // 1. Upload
  process.stdout.write("1. Upload ... ");
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: TEST_KEY,
    Body: TEST_BODY,
    ContentType: "text/plain",
  }));
  console.log("✅");

  // 2. HeadObject (confirm it exists)
  process.stdout.write("2. HeadObject ... ");
  const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: TEST_KEY }));
  console.log(`✅  (${head.ContentLength} bytes)`);

  // 3. Get & verify content
  process.stdout.write("3. GetObject ... ");
  const get = await client.send(new GetObjectCommand({ Bucket: bucket, Key: TEST_KEY }));
  const body = await get.Body.transformToString();
  if (body !== TEST_BODY) throw new Error(`Content mismatch: got "${body}"`);
  console.log("✅");

  // 4. Presigned URL
  process.stdout.write("4. Presigned URL ... ");
  const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: TEST_KEY }), { expiresIn: 300 });
  console.log("✅");
  console.log(`   ${url.slice(0, 100)}...`);

  // 5. Delete
  process.stdout.write("5. Delete ... ");
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: TEST_KEY }));
  console.log("✅");

  console.log("\n✅  All S3 operations passed.");
}

run().catch(err => {
  console.error("\n❌  Test failed:", err.message ?? err);
  if (err.$metadata) console.error("   HTTP status:", err.$metadata.httpStatusCode);
  process.exit(1);
});
