import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {logger} from "../logger";

/**
 * One-way copy of the primary (Railway) bucket into Cloudflare R2, the bucket the
 * desktop app reads. A temporary bridge: once users are on the desktop app R2 is
 * the only storage, and removing the MIRROR_R2_* variables turns all of this off.
 *
 * Mirror writes are best-effort — a failure is logged and never fails the web
 * request. The reconcile job (r2Reconcile.ts) copies anything that was missed.
 */

interface MirrorConfig {
  endpoint: string;
  bucket: string;
  key: string;
  secret: string;
}

function getMirrorConfig(): MirrorConfig | null {
  const endpoint = process.env.MIRROR_R2_ENDPOINT?.trim();
  const bucket = process.env.MIRROR_R2_BUCKET?.trim();
  const key = process.env.MIRROR_R2_ACCESS_KEY_ID?.trim();
  const secret = process.env.MIRROR_R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !key || !secret) return null;
  return {
    endpoint: endpoint.startsWith("https://") || endpoint.startsWith("http://") ? endpoint : `https://${endpoint}`,
    bucket,
    key,
    secret,
  };
}

function getMirrorClient(config: MirrorConfig) {
  return new S3Client({
    endpoint: config.endpoint,
    region: "auto",
    credentials: {accessKeyId: config.key, secretAccessKey: config.secret},
    forcePathStyle: true,
  });
}

export function r2MirrorEnabled(): boolean {
  return getMirrorConfig() !== null;
}

function isNotFound(err: any): boolean {
  const code = String(err?.name ?? err?.Code ?? "");
  return code === "NotFound" || code === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
}

/** Writes to R2 and throws on failure. Used by the reconcile job, which counts failures itself. */
export async function putToR2(key: string, body: Buffer, contentType: string): Promise<void> {
  const config = getMirrorConfig();
  if (!config) throw new Error("R2 mirror not configured");
  await getMirrorClient(config).send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

/** True when the key exists in R2. Throws on errors other than not-found. */
export async function existsInR2(key: string): Promise<boolean> {
  const config = getMirrorConfig();
  if (!config) throw new Error("R2 mirror not configured");
  try {
    await getMirrorClient(config).send(new HeadObjectCommand({Bucket: config.bucket, Key: key}));
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

export async function mirrorPut(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!r2MirrorEnabled()) return;
  try {
    await putToR2(key, body, contentType);
  } catch (err) {
    logger.warn("r2_mirror_put_failed", {key, error: String(err)});
  }
}

/**
 * Mirrors a primary-bucket copy. R2 may not hold the source yet (older object),
 * so on not-found the target is read back from the primary bucket instead.
 */
export async function mirrorCopy(
  sourceKey: string,
  targetKey: string,
  readTarget: () => Promise<{body: Buffer; contentType: string} | null>,
): Promise<void> {
  const config = getMirrorConfig();
  if (!config || sourceKey === targetKey) return;
  try {
    await getMirrorClient(config).send(new CopyObjectCommand({
      Bucket: config.bucket,
      CopySource: `${config.bucket}/${sourceKey}`,
      Key: targetKey,
    }));
  } catch (err) {
    if (!isNotFound(err)) {
      logger.warn("r2_mirror_copy_failed", {sourceKey, targetKey, error: String(err)});
      return;
    }
    try {
      const object = await readTarget();
      if (object) await putToR2(targetKey, object.body, object.contentType);
    } catch (fallbackErr) {
      logger.warn("r2_mirror_copy_failed", {sourceKey, targetKey, error: String(fallbackErr)});
    }
  }
}

export async function mirrorDelete(keys: string[]): Promise<void> {
  const config = getMirrorConfig();
  if (!config || !keys.length) return;
  const client = getMirrorClient(config);
  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    try {
      const result: any = await client.send(new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: {Objects: chunk.map((Key) => ({Key})), Quiet: true},
      }));
      for (const err of result?.Errors ?? []) {
        logger.warn("r2_mirror_delete_failed", {key: String(err.Key), error: String(err.Message ?? err.Code ?? "unknown")});
      }
    } catch (err) {
      logger.warn("r2_mirror_delete_failed", {keys: chunk.length, error: String(err)});
    }
  }
}
