import {createReadStream, statSync} from "fs";
import {basename} from "path";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {logger} from "../logger";
import {resolveDocumentFilePath} from "../documents/fileResolver";
import {tierFeatureFlags} from "../plans/tierFeatures";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const APP_FOLDER_NAME = "RemindOCR";
const MY_DRIVE_ROOT = "root";

export function driveFolderWebUrl(folderId: string): string {
    return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

export function driveTrashWebUrl(): string {
    return "https://drive.google.com/drive/trash";
}

export type DriveFolderState = "ok" | "trashed" | "missing" | "unknown";

export interface DriveFolderHealth {
    state: DriveFolderState;
    folderId: string;
    name?: string;
    parents?: string[];
}

export async function inspectDriveFolder(accessToken: string, folderId: string): Promise<DriveFolderHealth> {
    try {
        const res = await fetch(
            `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,name,trashed,parents`,
            {headers: {Authorization: `Bearer ${accessToken}`}},
        );
        if (res.status === 404) return {state: "missing", folderId};
        if (!res.ok) return {state: "unknown", folderId};
        const file = await res.json() as {id?: string; name?: string; trashed?: boolean; parents?: string[]};
        const health: DriveFolderHealth = {state: file.trashed ? "trashed" : "ok", folderId};
        if (file.name) health.name = file.name;
        if (file.parents) health.parents = file.parents;
        return health;
    } catch {
        return {state: "unknown", folderId};
    }
}

export async function clearDriveFileLinks(userId: string): Promise<number> {
    const result = await col("documents").updateMany(
        {user_id: userId, drive_file_id: {$exists: true, $nin: [null, ""]}} as any,
        {
            $unset: {drive_file_id: "", drive_web_link: ""},
            $set: {updated_at: new Date()},
        },
    );
    return result.modifiedCount ?? 0;
}

export async function ensureHealthyDriveFolder(
    userId: string,
    accessToken: string,
    folderName?: string,
): Promise<{folderId: string; resetCount: number; recreated: boolean}> {
    const user = await col<any>("users").findOne({_id: new ObjectId(userId)} as any);
    const existingId = typeof user?.drive_folder_id === "string" ? user.drive_folder_id : null;
    const name = folderName || user?.drive_folder_name || APP_FOLDER_NAME;

    if (existingId) {
        const health = await inspectDriveFolder(accessToken, existingId);
        if (health.state === "ok" || health.state === "unknown") {
            return {folderId: existingId, resetCount: 0, recreated: false};
        }
    }

    const folderId = await ensureAppFolder(accessToken, name);
    await pinFolderToMyDrive(accessToken, folderId);
    const resetCount = existingId ? await clearDriveFileLinks(userId) : 0;
    await col("users").updateOne(
        {_id: new ObjectId(userId)} as any,
        {
            $set: {drive_folder_id: folderId},
            $unset: {drive_subfolder_invoice: "", drive_subfolder_inspection_report: ""},
        },
    );
    logger.info("drive_folder_recreated", {
        user_id: userId,
        folder_id: folderId,
        previous_folder_id: existingId,
        reset_count: resetCount,
    });
    return {folderId, resetCount, recreated: Boolean(existingId)};
}

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
}

const FOLDER_MIME = "application/vnd.google-apps.folder";
const inflightFolders = new Map<string, Promise<string>>();

function sameFolderName(left: string, right: string): boolean {
    return left.normalize("NFC").trim() === right.normalize("NFC").trim();
}

function escapeDriveQueryValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function driveFolderQuery(
    accessToken: string,
    q: string,
): Promise<{id: string; name: string}[]> {
    const res = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=100&spaces=drive`,
        {headers: {Authorization: `Bearer ${accessToken}`}},
    );
    if (!res.ok) {
        if (res.status === 403 || res.status === 401) {
            const err = new Error("drive_scope_missing") as any;
            err.code = "drive_scope_missing";
            throw err;
        }
        throw new Error(`Drive folder search failed: ${res.status}`);
    }
    const data = await res.json() as {files?: {id: string; name: string}[]};
    return data.files ?? [];
}

async function findChildFolder(
    accessToken: string,
    name: string,
    parent: string,
): Promise<string | null> {
    const escapedName = escapeDriveQueryValue(name);
    const named = await driveFolderQuery(
        accessToken,
        `name='${escapedName}' and mimeType='${FOLDER_MIME}' and trashed=false and '${parent}' in parents`,
    );
    const namedMatch = named.find((file) => sameFolderName(file.name, name)) ?? named[0];
    if (namedMatch) {
        if (named.length > 1) {
            logger.warn("drive_duplicate_folders", {
                name,
                parent,
                count: named.length,
                used_id: namedMatch.id,
            });
        }
        return namedMatch.id;
    }

    const children = await driveFolderQuery(
        accessToken,
        `'${parent}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`,
    );
    const matches = children.filter((file) => sameFolderName(file.name, name));
    if (matches.length > 1) {
        logger.warn("drive_duplicate_folders", {
            name,
            parent,
            count: matches.length,
            used_id: matches[0].id,
        });
    }
    return matches[0]?.id ?? null;
}

async function createChildFolder(accessToken: string, name: string, parent: string): Promise<string> {
    const createRes = await fetch(`${DRIVE_API}/files?fields=id,webViewLink`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name,
            mimeType: FOLDER_MIME,
            parents: [parent],
        }),
    });
    if (!createRes.ok) throw new Error(`Drive folder creation failed: ${createRes.status}`);
    const folder = await createRes.json() as {id: string};
    return folder.id;
}

export async function ensureAppFolder(accessToken: string, folderName?: string, parentId?: string): Promise<string> {
    const name = folderName || APP_FOLDER_NAME;
    const parent = parentId || MY_DRIVE_ROOT;
    const inflightKey = `${parent}\0${name}`;
    const pending = inflightFolders.get(inflightKey);
    if (pending) return pending;

    const task = (async () => {
        const existing = await findChildFolder(accessToken, name, parent);
        if (existing) return existing;
        return createChildFolder(accessToken, name, parent);
    })().finally(() => {
        inflightFolders.delete(inflightKey);
    });

    inflightFolders.set(inflightKey, task);
    return task;
}

export async function pinFolderToMyDrive(accessToken: string, folderId: string): Promise<void> {
    const getRes = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,parents`,
        {headers: {Authorization: `Bearer ${accessToken}`}},
    );
    if (!getRes.ok) return;
    const file = await getRes.json() as { parents?: string[] };
    if ((file.parents ?? []).includes(MY_DRIVE_ROOT)) return;

    await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(folderId)}?addParents=${MY_DRIVE_ROOT}&fields=id,parents`,
        {
            method: "PATCH",
            headers: {Authorization: `Bearer ${accessToken}`},
        },
    );
}

export async function renameDriveFolder(accessToken: string, folderId: string, newName: string): Promise<void> {
    const res = await fetch(`${DRIVE_API}/files/${folderId}`, {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({name: newName}),
    });
    if (!res.ok) throw new Error(`Drive folder rename failed: ${res.status}`);
}

export async function uploadToDrive(
    accessToken: string,
    filePath: string,
    mimeType: string,
    folderId: string,
    fileName?: string,
): Promise<DriveFile> {
    const name = fileName ?? basename(filePath);
    const fileSize = statSync(filePath).size;

    const metadata = JSON.stringify({
        name,
        parents: [folderId],
    });

    const boundary = "----RemindOCRBoundary" + Date.now();
    const fileStream = createReadStream(filePath);
    const fileBuffer = await streamToBuffer(fileStream);

    const body = Buffer.concat([
        Buffer.from(
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
        ),
        fileBuffer,
        Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,webViewLink`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
            "Content-Length": String(body.length),
        },
        body,
    });

    if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Drive upload failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    return res.json() as Promise<DriveFile>;
}

export async function resolveDriveToken(userId: string): Promise<string | null> {
    const user = await col<any>("users").findOne({_id: new ObjectId(userId)} as any);
    if (!user) return null;

    if (user.gmail_access_token) {
        if (user.gmail_token_expires_at && new Date(user.gmail_token_expires_at) > new Date()) {
            return user.gmail_access_token;
        }
        if (user.gmail_refresh_token) {
            const refreshed = await refreshDriveToken(user.gmail_refresh_token, userId);
            if (refreshed) return refreshed;
        }
    }
    return null;
}

async function refreshDriveToken(refreshToken: string, userId: string): Promise<string | null> {
    const {getSettings} = await import("../settings");
    const settings = getSettings();
    try {
        const res = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
            body: new URLSearchParams({
                client_id: settings.googleClientId || "",
                client_secret: settings.googleClientSecret || "",
                refresh_token: refreshToken,
                grant_type: "refresh_token",
            }),
        });
        if (!res.ok) return null;
        const data = await res.json() as { access_token: string; expires_in: number };
        await col("users").updateOne(
            {_id: new ObjectId(userId)} as any,
            {
                $set: {
                    gmail_access_token: data.access_token,
                    gmail_token_expires_at: new Date(Date.now() + data.expires_in * 1000)
                }
            }
        );
        return data.access_token;
    } catch {
        return null;
    }
}

const SUB_FOLDERS: Record<string, string> = {
    invoice: "חשבוניות",
    inspection_report: "תסקירי בדיקה",
};

async function resolveSubFolder(
    accessToken: string,
    parentFolderId: string,
    userId: string,
    documentKind: string | undefined,
): Promise<string> {
    const subFolderName = documentKind ? SUB_FOLDERS[documentKind] : undefined;
    if (!subFolderName) return parentFolderId;

    const cacheKey = `drive_subfolder_${documentKind}` as string;
    const user = await col<any>("users").findOne({_id: new ObjectId(userId)} as any);
    const cached = typeof user?.[cacheKey] === "string" ? user[cacheKey] as string : "";
    if (cached) {
        const health = await inspectDriveFolder(accessToken, cached);
        const parents = health.parents ?? [];
        const inExpectedParent = parents.length === 0
            || parents.includes(parentFolderId)
            || parentFolderId === MY_DRIVE_ROOT;
        if (health.state === "ok" && inExpectedParent) return cached;
    }

    const subFolderId = await ensureAppFolder(accessToken, subFolderName, parentFolderId);
    await col("users").updateOne(
        {_id: new ObjectId(userId)} as any,
        {$set: {[cacheKey]: subFolderId}}
    );
    return subFolderId;
}

export async function syncDocumentToDrive(documentId: string, userId: string): Promise<void> {
    const user = await col<any>("users").findOne({_id: new ObjectId(userId)} as any);
    if (!user?.drive_sync_enabled) return;

    if (!tierFeatureFlags(user.plan ?? user.role).googleDriveSync) return;

    const doc = await col<any>("documents").findOne({_id: new ObjectId(documentId)} as any);
    if (!doc?.file_path && !doc?.spaces_key) return;
    if (doc.drive_file_id) return;

    const accessToken = await resolveDriveToken(userId);
    if (!accessToken) {
        logger.warn("drive_sync_no_token", {document_id: documentId, user_id: userId});
        return;
    }

    try {
        const rootFolderId = user.drive_folder_id || await ensureAppFolder(accessToken, user.drive_folder_name);

        if (!user.drive_folder_id) {
            await pinFolderToMyDrive(accessToken, rootFolderId);
            await col("users").updateOne(
                {_id: new ObjectId(userId)} as any,
                {$set: {drive_folder_id: rootFolderId}}
            );
        }

        const targetFolderId = await resolveSubFolder(accessToken, rootFolderId, userId, doc.document_kind);
        const localPath = await resolveDocumentFilePath(doc);

        const driveFile = await uploadToDrive(
            accessToken,
            localPath,
            doc.mime_type || "application/pdf",
            targetFolderId,
            doc.file_name,
        );

        await col("documents").updateOne(
            {_id: new ObjectId(documentId)} as any,
            {$set: {drive_file_id: driveFile.id, drive_web_link: driveFile.webViewLink ?? null, updated_at: new Date()}}
        );

        logger.info("drive_sync_uploaded", {
            document_id: documentId,
            user_id: userId,
            drive_file_id: driveFile.id,
        });
    } catch (err) {
        logger.error("drive_sync_failed", {document_id: documentId, user_id: userId, error: err});
    }
}

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}
