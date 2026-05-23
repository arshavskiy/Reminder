import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync } from "fs";

function getClient() {
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const region = process.env.DO_SPACES_REGION ?? "fra1";
  const key = process.env.DO_SPACES_KEY;
  const secret = process.env.DO_SPACES_SECRET;

  if (!endpoint || !key || !secret) return null;

  return new S3Client({
    endpoint: `https://${endpoint}`,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  });
}

export function spacesEnabled(): boolean {
  return !!(
    process.env.DO_SPACES_KEY &&
    process.env.DO_SPACES_SECRET &&
    process.env.DO_SPACES_ENDPOINT &&
    process.env.DO_SPACES_BUCKET
  );
}

export async function uploadToSpaces(
  localPath: string,
  key: string,
  contentType: string
): Promise<string> {
  const client = getClient();
  const bucket = process.env.DO_SPACES_BUCKET!;
  if (!client) throw new Error("DO Spaces not configured");

  const body = readFileSync(localPath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: "private",
    })
  );

  const endpoint = process.env.DO_SPACES_ENDPOINT!;
  return `https://${bucket}.${endpoint}/${key}`;
}

export async function deleteFromSpaces(key: string): Promise<void> {
  const client = getClient();
  const bucket = process.env.DO_SPACES_BUCKET!;
  if (!client) return;

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getSpacesSignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const client = getClient();
  const bucket = process.env.DO_SPACES_BUCKET!;
  if (!client) throw new Error("DO Spaces not configured");

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn }
  );
}

export async function fileExistsInSpaces(key: string): Promise<boolean> {
  const client = getClient();
  const bucket = process.env.DO_SPACES_BUCKET!;
  if (!client) return false;

  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
