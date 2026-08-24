import {createReadStream, statSync} from "fs";
import {basename} from "path";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {logger} from "../logger";
import {resolveDocumentFilePath} from "../documents/fileResolver";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const APP_FOLDER_NAME = "RemindOCR";

interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
}

export async function ensureAppFolder(accessToken: string, folderName?: string, parentId?: string): Promise<string> {
    const name = folderName || APP_FOLDER_NAME;
    const parentClause = parentId ? ` and '${parentId}' in parents` : "";
    const searchRes = await fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`)}&fields=files(id,name)`,
        {headers: {Authorization: `Bearer ${accessToken}`}}
    );
    if (!searchRes.ok) {
        if (searchRes.status === 403 || searchRes.status === 401) {
            const err = new Error("drive_scope_missing") as any;
            err.code = "drive_scope_missing";
            throw err;
        }
        throw new Error(`Drive folder search failed: ${searchRes.status}`);
    }
    const data = await searchRes.json() as { files: { id: string; name: string }[] };
    if (data.files.length > 0) return data.files[0].id;

    const createRes = await fetch(`${DRIVE_API}/files`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            name,
            mimeType: "application/vnd.google-apps.folder",
            ...(parentId ? {parents: [parentId]} : {}),
        }),
    });
    if (!createRes.ok) throw new Error(`Drive folder creation failed: ${createRes.status}`);
    const folder = await createRes.json() as { id: string };
    return folder.id;
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
    const cached = user?.[cacheKey];
    if (cached) return cached;

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

    const plan = String(user.plan ?? user.role ?? "").trim().toLowerCase();
    const allowed = plan === "basic" || plan === "business" || plan === "pro" || plan === "admin";
    if (!allowed) return;

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
