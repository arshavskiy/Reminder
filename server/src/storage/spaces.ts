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
  key: string;
  secret: string;
  bucket: string;
  forcePathStyle: boolean;
  cdnUrl?: string;
}

function normaliseEndpoint(endpoint: string): string {
  return endpoint.startsWith("http://") || endpoint.startsWith("https://")
    ? endpoint
    : `https://${endpoint}`;
}

function getStorageConfig(): StorageConfig | null {
  const railwayEndpoint = process.env.BUCKET_ENDPOINT ?? process.env.ENDPOINT;
  const railwayBucket = process.env.BUCKET_NAME ?? process.env.BUCKET;
  const railwayKey = process.env.BUCKET_ACCESS_KEY_ID ?? process.env.ACCESS_KEY_ID;
  const railwaySecret = process.env.BUCKET_SECRET_ACCESS_KEY ?? process.env.SECRET_ACCESS_KEY;
  const railwayRegion = process.env.BUCKET_REGION ?? process.env.REGION ?? "auto";

  if (railwayEndpoint && railwayBucket && railwayKey && railwaySecret) {
    return {
      endpoint: normaliseEndpoint(railwayEndpoint),
      region: railwayRegion,
      key: railwayKey,
      secret: railwaySecret,
      bucket: railwayBucket,
      forcePathStyle: process.env.BUCKET_FORCE_PATH_STYLE === "true",
      cdnUrl: process.env.BUCKET_PUBLIC_URL ? normaliseEndpoint(process.env.BUCKET_PUBLIC_URL) : undefined,
    };
  }

  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const region = process.env.DO_SPACES_REGION ?? "fra1";
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;
  const bucket = process.env.DO_SPACES_BUCKET;

  if (!endpoint || !key || !secret || !bucket) return null;

  return {
    endpoint: normaliseEndpoint(endpoint),
    region,
    key,
    secret,
    bucket,
    forcePathStyle: false,
    cdnUrl: process.env.DO_SPACES_CDN_URL ? normaliseEndpoint(process.env.DO_SPACES_CDN_URL) : undefined,
  };
}

function getClient() {
  const config = getStorageConfig();
  if (!config) return null;

  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.key, secretAccessKey: config.secret },
    forcePathStyle: config.forcePathStyle,
  });
}

export function spacesEnabled(): boolean {
  return getStorageConfig() !== null;
}

export async function uploadToSpaces(
  localPath: string,
  key: string,
  contentType: string
): Promise<string> {
  const client = getClient();
  const config = getStorageConfig();
  if (!client || !config) throw new Error("Object storage not configured");

  const body = readFileSync(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  const endpointUrl = new URL(config.endpoint);
  return `${endpointUrl.protocol}//${config.bucket}.${endpointUrl.host}/${key}`;
}

export async function uploadBufferToSpaces(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const client = getClient();
  const config = getStorageConfig();
  if (!client || !config) throw new Error("Object storage not configured");

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ACL: "public-read" as any,
    })
  );

  if (config.cdnUrl) {
    return `${config.cdnUrl.replace(/\/$/, "")}/${key}`;
  }
  const endpointUrl = new URL(config.endpoint);
  return `${endpointUrl.protocol}//${config.bucket}.${endpointUrl.host}/${key}`;
}

export async function deleteFromSpaces(key: string): Promise<void> {
  const client = getClient();
  const config = getStorageConfig();
  if (!client || !config) return;

  await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function getSpacesSignedUrl(key: string, expiresIn = 3600, fileName?: string, asAttachment = false): Promise<string> {
  const client = getClient();
  const config = getStorageConfig();
  if (!client || !config) throw new Error("Object storage not configured");

  const disposition = fileName
    ? `${asAttachment ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(fileName)}`
    : undefined;

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ...(disposition && { ResponseContentDisposition: disposition }),
    }),
    { expiresIn }
  );
}

function getPublicStorageConfig(): StorageConfig | null {
  const endpoint = process.env.BUCKET_PUBLIC_ENDPOINT;
  const bucket = process.env.BUCKET_PUBLIC_NAME;
  const key = process.env.BUCKET_PUBLIC_ACCESS_KEY_ID;
  const secret = process.env.BUCKET_PUBLIC_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !key || !secret) return null;
  return {
    endpoint: normaliseEndpoint(endpoint),
    region: process.env.BUCKET_PUBLIC_REGION ?? "auto",
    key,
    secret,
    bucket,
    forcePathStyle: process.env.BUCKET_PUBLIC_FORCE_PATH_STYLE === "true",
  };
}

export function publicBucketEnabled(): boolean {
  return getPublicStorageConfig() !== null;
}

export function publicUrlForKey(key: string): string {
  const publicBase = process.env.BUCKET_PUBLIC_URL?.trim();
  if (publicBase) return `${normaliseEndpoint(publicBase).replace(/\/$/, "")}/${key}`;

  const config = getPublicStorageConfig();
  if (config) {
    const endpointUrl = new URL(config.endpoint);
    return `${endpointUrl.protocol}//${config.bucket}.${endpointUrl.host}/${key}`;
  }

  const storageConfig = getStorageConfig();
  if (storageConfig?.cdnUrl) return `${storageConfig.cdnUrl.replace(/\/$/, "")}/${key}`;
  if (storageConfig) {
    const endpointUrl = new URL(storageConfig.endpoint);
    return `${endpointUrl.protocol}//${storageConfig.bucket}.${endpointUrl.host}/${key}`;
  }

  throw new Error("Object storage not configured");
}

export async function uploadBufferToPublicSpaces(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const config = getPublicStorageConfig();
  if (!config) throw new Error("Public object storage not configured");

  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.key, secretAccessKey: config.secret },
    forcePathStyle: config.forcePathStyle,
  });

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return publicUrlForKey(key);
}

export async function fileExistsInSpaces(key: string): Promise<boolean> {
  const client = getClient();
  const config = getStorageConfig();
  if (!client || !config) return false;

  try {
    await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
