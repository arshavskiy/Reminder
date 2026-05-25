import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3";

const ep = process.env.ENDPOINT ?? "";
const bucket = process.env.BUCKET ?? "";
const accessKey = process.env.ACCESS_KEY_ID ?? "";
const secret = process.env.SECRET_ACCESS_KEY ?? "";

// storageapi.dev may require a specific region in the signature
for (const region of ["auto", "us-east-1", "eu-west-1"]) {
  for (const forcePathStyle of [true, false]) {
    const client = new S3Client({
      endpoint: ep,
      region,
      credentials: { accessKeyId: accessKey, secretAccessKey: secret },
      forcePathStyle,
    });
    process.stdout.write(`region=${region} pathStyle=${forcePathStyle} ... `);
    try {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: "test/ping.txt", Body: "ping", ContentType: "text/plain" }));
      console.log("✅ SUCCESS");
    } catch (e) {
      console.log(`❌ ${e.message?.slice(0, 60)} (HTTP ${e.$metadata?.httpStatusCode})`);
    }
  }
}
