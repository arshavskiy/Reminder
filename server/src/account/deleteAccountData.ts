import {existsSync, unlinkSync} from "fs";
import {join} from "path";
import {ObjectId} from "mongodb";
import {col} from "../db/db";
import {logger} from "../logger";
import {getDataDir} from "../settings";
import {deleteFromSpaces} from "../storage/spaces";

const USER_SCOPED_COLLECTIONS = [
  "sessions",
  "magic_link_tokens",
  "account_invites",
  "oauth_states",
  "user_settings",
  "clients",
  "contracts",
  "contract_advances",
  "invoices",
  "reminders",
  "tasks",
  "timeline_events",
  "email_log",
  "equipment",
  "equipment_categories",
  "doc_templates",
  "print_templates",
  "print_template_drafts",
  "certificates",
  "notifications",
  "gmail_imports",
  "gmail_import_jobs",
  "document_processing_jobs",
  "drive_export_jobs",
  "calendar_links",
  "push_subscriptions",
] as const;

const SPACES_KEY_PREFIXES = [
  "users/",
  "documents/",
  "certificates/",
  "images/",
  "equipment-photos/",
] as const;

export type DeleteAccountResult = {
  userId: string;
  deletedCollections: Record<string, number>;
  storageObjectsRemoved: number;
  localFilesRemoved: number;
  storageFailures: number;
  googleTokensRevoked: number;
};

function isSpacesKey(path: string): boolean {
  return SPACES_KEY_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Resolve a stored URL / s3:key / bare key to a Spaces object key when possible. */
export function spacesKeyFromUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let trimmed = value.trim();
  if (trimmed.startsWith("s3:")) trimmed = trimmed.slice(3).trim();
  if (isSpacesKey(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    if (isSpacesKey(path)) return path;
  } catch {
    // not a URL
  }
  return null;
}

function equipmentLocalPathFromPhotoKey(equipmentId: string, key: string): string | null {
  if (key.startsWith("s3:")) return null;
  if (key.startsWith("/api/equipment/") && key.includes("/photos/")) {
    const fileName = key.split("/photos/")[1];
    if (!fileName) return null;
    return join(getDataDir(), "equipment-photos", equipmentId, fileName);
  }
  if (!key.includes("://") && !key.startsWith("/")) {
    return join(getDataDir(), "equipment-photos", equipmentId, key);
  }
  return null;
}

async function removeStorageKey(
  key: string | null | undefined,
  counters: {storage: number; failures: number},
): Promise<void> {
  if (!key) return;
  try {
    await deleteFromSpaces(key);
    counters.storage += 1;
  } catch (err) {
    counters.failures += 1;
    logger.warn("account_delete_spaces_failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function removeLocalFile(
  path: string | null | undefined,
  counters: {local: number; failures: number},
): Promise<void> {
  if (!path || typeof path !== "string") return;
  if (!existsSync(path)) return;
  try {
    unlinkSync(path);
    counters.local += 1;
  } catch (err) {
    counters.failures += 1;
    logger.warn("account_delete_local_failed", {
      path,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function revokeGoogleToken(token: unknown, counters: {revoked: number}): Promise<void> {
  const value = typeof token === "string" ? token.trim() : "";
  if (!value) return;
  try {
    const res = await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: `token=${encodeURIComponent(value)}`,
    });
    if (res.ok || res.status === 400) {
      // 400 = already invalid/revoked
      counters.revoked += 1;
    } else {
      logger.warn("account_delete_google_revoke_failed", {status: res.status});
    }
  } catch (err) {
    logger.warn("account_delete_google_revoke_error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Permanently delete a user account and all associated application data.
 * Irreversible. Does not delete global catalogs (features, gmail_search_providers, shared email templates).
 */
export async function deleteAccountData(userId: string): Promise<DeleteAccountResult> {
  if (!ObjectId.isValid(userId)) {
    throw new Error("invalid_user_id");
  }

  const userOid = new ObjectId(userId);
  const user = await col("users").findOne({_id: userOid as any}) as Record<string, unknown> | null;
  if (!user) {
    throw new Error("user_not_found");
  }

  const counters = {storage: 0, local: 0, failures: 0};
  const googleCounters = {revoked: 0};
  const deletedCollections: Record<string, number> = {};

  // Revoke Google grants before wiping tokens/user row.
  await revokeGoogleToken(user.gmail_refresh_token, googleCounters);
  await revokeGoogleToken(user.gmail_access_token, googleCounters);
  await revokeGoogleToken(user.drive_refresh_token, googleCounters);
  await revokeGoogleToken(user.drive_access_token, googleCounters);
  await revokeGoogleToken(user.calendar_refresh_token, googleCounters);
  await revokeGoogleToken(user.calendar_access_token, googleCounters);

  const documents = await col("documents")
    .find({user_id: userId} as any, {
      projection: {_id: 1, file_path: 1, spaces_key: 1, thumbnail_key: 1, thumbnail_path: 1},
    } as any)
    .toArray() as Array<{
      _id: ObjectId;
      file_path?: string | null;
      spaces_key?: string | null;
      thumbnail_key?: string | null;
      thumbnail_path?: string | null;
    }>;

  const documentIds = documents.map((doc) => doc._id.toString());
  const documentObjectIds = documents.map((doc) => doc._id);
  const documentIdValues = [...documentIds, ...documentObjectIds];

  for (const doc of documents) {
    await removeStorageKey(doc.spaces_key ?? null, counters);
    await removeStorageKey(doc.thumbnail_key ?? null, counters);
    await removeLocalFile(doc.file_path ?? null, counters);
    await removeLocalFile(doc.thumbnail_path ?? null, counters);
  }

  const invoices = await col("invoices")
    .find({user_id: userId} as any, {
      projection: {spaces_key: 1, thumbnail_key: 1, file_path: 1, thumbnail_path: 1},
    } as any)
    .toArray() as Array<{
      spaces_key?: string | null;
      thumbnail_key?: string | null;
      file_path?: string | null;
      thumbnail_path?: string | null;
    }>;
  for (const invoice of invoices) {
    await removeStorageKey(invoice.spaces_key ?? null, counters);
    await removeStorageKey(invoice.thumbnail_key ?? null, counters);
    await removeLocalFile(invoice.file_path ?? null, counters);
    await removeLocalFile(invoice.thumbnail_path ?? null, counters);
  }

  const certificates = await col("certificates")
    .find({user_id: userId} as any, {
      projection: {spaces_key: 1, file_path: 1, file_url: 1},
    } as any)
    .toArray() as Array<{
      spaces_key?: string | null;
      file_path?: string | null;
      file_url?: string | null;
    }>;
  for (const cert of certificates) {
    await removeStorageKey(cert.spaces_key ?? null, counters);
    await removeStorageKey(spacesKeyFromUrl(cert.file_url), counters);
    await removeLocalFile(cert.file_path ?? null, counters);
  }

  const equipmentRows = await col("equipment")
    .find({user_id: userId} as any, {
      projection: {_id: 1, photo_urls: 1},
    } as any)
    .toArray() as Array<{
      _id: ObjectId;
      photo_urls?: Array<{key?: string} | string> | null;
    }>;
  for (const eq of equipmentRows) {
    const eqId = eq._id.toString();
    for (const entry of eq.photo_urls ?? []) {
      const key = typeof entry === "string" ? entry : String(entry?.key ?? "");
      if (!key) continue;
      await removeStorageKey(spacesKeyFromUrl(key), counters);
      await removeLocalFile(equipmentLocalPathFromPhotoKey(eqId, key), counters);
    }
  }

  await removeStorageKey(typeof user.picture_storage_key === "string" ? user.picture_storage_key : null, counters);
  await removeStorageKey(spacesKeyFromUrl(user.picture_url), counters);

  await removeStorageKey(spacesKeyFromUrl(user.company_logo_url), counters);
  await removeStorageKey(
    typeof user.company_logo_storage_key === "string" ? user.company_logo_storage_key : null,
    counters,
  );

  const derivedFilters = documentIdValues.length
    ? {
      extractions: {
        $or: [
          {document_id: {$in: documentIdValues}},
          {user_id: userId},
        ],
      },
      document_clients: {
        $or: [
          {document_id: {$in: documentIdValues}},
          {user_id: userId},
        ],
      },
    }
    : {
      extractions: {user_id: userId},
      document_clients: {user_id: userId},
    };

  const derived = await Promise.all([
    col("extractions").deleteMany(derivedFilters.extractions as any),
    col("document_clients").deleteMany(derivedFilters.document_clients as any),
    documentIds.length
      ? col("timeline_events").deleteMany({
        source_type: "document",
        source_id: {$in: documentIds},
      } as any)
      : Promise.resolve({deletedCount: 0}),
  ]);
  deletedCollections.extractions = derived[0].deletedCount ?? 0;
  deletedCollections.document_clients = derived[1].deletedCount ?? 0;
  deletedCollections.timeline_events_documents = derived[2].deletedCount ?? 0;

  const docsDelete = await col("documents").deleteMany({user_id: userId} as any);
  deletedCollections.documents = docsDelete.deletedCount ?? 0;

  for (const name of USER_SCOPED_COLLECTIONS) {
    const result = await col(name as any).deleteMany({user_id: userId} as any);
    deletedCollections[name] = result.deletedCount ?? 0;
  }

  const sessionsByOid = await col("sessions").deleteMany({user_id: userOid as any} as any);
  deletedCollections.sessions += sessionsByOid.deletedCount ?? 0;

  const userDelete = await col("users").deleteOne({_id: userOid as any});
  deletedCollections.users = userDelete.deletedCount ?? 0;

  return {
    userId,
    deletedCollections,
    storageObjectsRemoved: counters.storage,
    localFilesRemoved: counters.local,
    storageFailures: counters.failures,
    googleTokensRevoked: googleCounters.revoked,
  };
}

export const ACCOUNT_DELETE_CONFIRM_PHRASE = "DELETE_ACCOUNT";
