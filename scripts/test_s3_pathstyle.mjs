import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";

const ep = process.env.ENDPOINT ?? "";
const bucket = process.env.BUCKET ?? "";
const accessKey = process.env.AWS_ACCESS_KEY_ID ?? "";
const secret = process.env.AWS_SECRET_ACCESS_KEY ?? "";

for (const forcePathStyle of [false, true]) {
  const client = new S3Client({
    endpoint: ep,
    region: "auto",
    credentials: { accessKeyId: accessKey, secretAccessKey: secret },
    forcePathStyle,
  });
  process.stdout.write(`forcePathStyle=${forcePathStyle} ... `);
  try {
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: "test/ping.txt", Body: "ping", ContentType: "text/plain" }));
    console.log("✅ SUCCESS");
  } catch (e) {
    console.log(`❌ ${e.message} (HTTP ${e.$metadata?.httpStatusCode})`);
  }
}
