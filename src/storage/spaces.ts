import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {getSignedUrl} from "@aws-sdk/s3-request-presigner";
import {readFileSync} from "fs";

interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

function normaliseEndpoint(ep: string): string {
  return ep.startsWith("http://") || ep.startsWith("https://") ? ep : `https://${ep}`;
}

function getStorageConfig(): StorageConfig | null {
  // Priority 1: Railway-style S3_* variables (as per Railway bucket guide)
  const s3Endpoint  = process.env.S3_ENDPOINT;
  const s3Key       = process.env.S3_ACCESS_KEY_ID;
  const s3Secret    = process.env.S3_SECRET_ACCESS_KEY;
  const s3Bucket    = process.env.S3_BUCKET_NAME;
  const s3Region    = process.env.S3_REGION ?? "auto";

  if (s3Endpoint && s3Key && s3Secret && s3Bucket) {
    return {
      endpoint: normaliseEndpoint(s3Endpoint),
      region: s3Region,
      accessKeyId: s3Key,
      secretAccessKey: s3Secret,
      bucket: s3Bucket,
      forcePathStyle: false, // Railway uses virtual-hosted style
    };
  }

  // Priority 2: generic ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY
  const endpoint  = process.env.BUCKET_ENDPOINT ?? process.env.ENDPOINT;
  const bucket    = process.env.BUCKET_NAME     ?? process.env.BUCKET;
  const key       = process.env.BUCKET_ACCESS_KEY_ID ?? process.env.ACCESS_KEY_ID;
  const secret    = process.env.BUCKET_SECRET_ACCESS_KEY ?? process.env.SECRET_ACCESS_KEY;
  const region    = process.env.BUCKET_REGION   ?? process.env.REGION ?? "auto";

  if (endpoint && bucket && key && secret) {
    // Use path-style for non-Railway S3-compatible endpoints (MinIO, storageapi.dev, etc.)
    const isRailway = endpoint.includes("storage.railway.app");
    const forcePathStyle = process.env.BUCKET_FORCE_PATH_STYLE === "true" || !isRailway;
    return {
      endpoint: normaliseEndpoint(endpoint),
      region,
      accessKeyId: key,
      secretAccessKey: secret,
      bucket,
      forcePathStyle,
    };
  }

  // Priority 3: legacy DO_SPACES_* variables
  const doEndpoint = process.env.DO_SPACES_ENDPOINT;
  const doKey      = process.env.DO_SPACES_KEY;
  const doSecret   = process.env.DO_SPACES_SECRET;
  const doBucket   = process.env.DO_SPACES_BUCKET;
  const doRegion   = process.env.DO_SPACES_REGION ?? "fra1";

  if (doEndpoint && doKey && doSecret && doBucket) {
    return {
      endpoint: normaliseEndpoint(doEndpoint),
      region: doRegion,
      accessKeyId: doKey,
      secretAccessKey: doSecret,
      bucket: doBucket,
      forcePathStyle: false,
    };
  }

  return null;
}

function makeClient(config: StorageConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  });
}

export function spacesEnabled(): boolean {
  return getStorageConfig() !== null;
}

export async function uploadToSpaces(localPath: string, key: string, contentType: string): Promise<string> {
  const config = getStorageConfig();
  if (!config) throw new Error("Object storage not configured");

  const client = makeClient(config);
  const body = readFileSync(localPath);

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));

  // Return a virtual-hosted or path-style public URL depending on provider
  const url = new URL(config.endpoint);
  if (config.forcePathStyle) {
    return `${url.protocol}//${url.host}/${config.bucket}/${key}`;
  }
  return `${url.protocol}//${config.bucket}.${url.host}/${key}`;
}

export async function deleteFromSpaces(key: string): Promise<void> {
  const config = getStorageConfig();
  if (!config) return;
  const client = makeClient(config);
  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function getSpacesSignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const config = getStorageConfig();
  if (!config) throw new Error("Object storage not configured");
  const client = makeClient(config);
  return getSignedUrl(client, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn });
}

export async function fileExistsInSpaces(key: string): Promise<boolean> {
  const config = getStorageConfig();
  if (!config) return false;
  const client = makeClient(config);
  try {
    await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
