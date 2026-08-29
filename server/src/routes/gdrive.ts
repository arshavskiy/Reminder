import express from "express";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {requireAuth} from "../auth/middleware";
import {pinFolderToMyDrive, renameDriveFolder, resolveDriveToken, syncDocumentToDrive, driveFolderWebUrl, driveTrashWebUrl, inspectDriveFolder, ensureHealthyDriveFolder, copyDocumentDriveLinksToInvoices} from "../storage/gdrive";
import {logger} from "../logger";
import {tierFeatureFlags} from "../plans/tierFeatures";
import {isObjectStorageMissingError} from "../documents/fileResolver";

function planAllowsGoogleDrive(planOrRole: string | null | undefined): boolean {
    return tierFeatureFlags(planOrRole).googleDriveSync;
}

const DRIVE_JOB_STALE_MS = 10 * 60 * 1000;
const HAS_FILE_FILTER = {
    $or: [
        {file_path: {$exists: true, $ne: null}},
        {spaces_key: {$exists: true, $ne: null}},
    ],
};
const EXPORTABLE_FILE_FILTER = {
    ...HAS_FILE_FILTER,
    storage_status: {$ne: "missing"},
    file_missing: {$ne: true},
};

type DriveExportJobStatus = "queued" | "running" | "completed" | "failed";
type DriveExportJobResult = {documentId: string; fileName: string; status: "uploaded" | "failed" | "skipped"; error?: string};
type DriveExportJob = {
    _id: ObjectId;
    user_id: string;
    status: DriveExportJobStatus;
    document_ids: string[];
    cursor: number;
    total: number;
    processed: number;
    uploaded: number;
    failed: number;
    skipped: number;
    results: DriveExportJobResult[];
    folder_id: string | null;
    folder_name: string;
    folder_url: string | null;
    recreated: boolean;
    reset_count: number;
    error: string | null;
    created_at: Date;
    updated_at: Date;
    started_at?: Date;
    completed_at?: Date | null;
};

function presentDriveExportJob(job: DriveExportJob) {
    return {
        jobId: job._id.toString(),
        status: job.status,
        ok: job.status === "completed",
        uploaded: job.uploaded,
        failed: job.failed,
        skipped: job.skipped,
        processed: job.processed,
        total: job.total,
        folderId: job.folder_id,
        folderName: job.folder_name,
        folderUrl: job.folder_url,
        recreated: job.recreated,
        resetCount: job.reset_count,
        error: job.error ?? null,
        results: (job.results ?? []).slice(-12),
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        completedAt: job.completed_at ?? null,
    };
}

let driveExportWorkerRunning = false;

export function startDriveExportJobWorker() {
    if (driveExportWorkerRunning) return;
    driveExportWorkerRunning = true;
    void processDriveExportJobs().finally(() => {
        driveExportWorkerRunning = false;
    });
}

async function processDriveExportJobs() {
    await recoverStaleDriveExportJobs();
    while (true) {
        const job = await claimNextDriveExportJob();
        if (!job) return;
        try {
            await runDriveExportJob(job);
        } catch (err: any) {
            logger.error("drive_export_job_failed", {job_id: job._id.toString(), user_id: job.user_id, error: err.message});
            await col("drive_export_jobs").updateOne(
                {_id: job._id} as any,
                {$set: {status: "failed", error: err.message ?? "drive_export_failed", updated_at: new Date(), completed_at: new Date()}} as any,
            );
        }
    }
}

async function recoverStaleDriveExportJobs() {
    const staleBefore = new Date(Date.now() - DRIVE_JOB_STALE_MS);
    const result = await col("drive_export_jobs").updateMany(
        {status: "running", updated_at: {$lt: staleBefore}} as any,
        {$set: {status: "queued", updated_at: new Date()}} as any,
    );
    if (result.modifiedCount) {
        logger.warn("drive_export_jobs_requeued_stale", {count: result.modifiedCount});
    }
}

async function claimNextDriveExportJob(): Promise<DriveExportJob | null> {
    const now = new Date();
    return await col<DriveExportJob>("drive_export_jobs").findOneAndUpdate(
        {status: "queued"} as any,
        {$set: {status: "running", started_at: now, updated_at: now}} as any,
        {sort: {created_at: 1}, returnDocument: "after"},
    ) as DriveExportJob | null;
}

async function runDriveExportJob(job: DriveExportJob) {
    logger.info("drive_export_job_started", {job_id: job._id.toString(), user_id: job.user_id, total: job.total});
    const ids = job.document_ids ?? [];
    let uploaded = job.uploaded ?? 0;
    let failed = job.failed ?? 0;
    let skipped = job.skipped ?? 0;
    let processed = job.processed ?? 0;

    for (let index = job.cursor ?? 0; index < ids.length; index += 1) {
        const documentId = ids[index];
        const doc = await col<any>("documents").findOne({_id: new ObjectId(documentId)} as any);
        const fileName = String(doc?.file_name ?? documentId);
        let result: DriveExportJobResult = {documentId, fileName, status: "failed"};
        try {
            if (!doc) {
                skipped += 1;
                result = {documentId, fileName, status: "skipped", error: "document_missing"};
                continue;
            }
            if (doc.file_missing === true || doc.storage_status === "missing") {
                skipped += 1;
                result = {documentId, fileName, status: "skipped", error: "storage_missing"};
                continue;
            }
            await syncDocumentToDrive(documentId, job.user_id);
            const updated = await col<any>("documents").findOne({_id: new ObjectId(documentId)} as any);
            if (updated?.drive_file_id) {
                uploaded += 1;
                result = {documentId, fileName, status: "uploaded"};
            } else {
                failed += 1;
                result = {documentId, fileName, status: "failed", error: "drive_upload_unconfirmed"};
            }
        } catch (err: any) {
            const storageMissing = isObjectStorageMissingError(err);
            if (storageMissing) {
                skipped += 1;
                result = {documentId, fileName, status: "skipped", error: "storage_missing"};
            } else {
                failed += 1;
                result = {documentId, fileName, status: "failed", error: String(err?.message ?? err)};
            }
            logger.error("drive_export_file_failed", {document_id: documentId, job_id: job._id.toString(), error: err});
        } finally {
            processed = index + 1;
            await col("drive_export_jobs").updateOne(
                {_id: job._id} as any,
                {
                    $set: {cursor: processed, processed, uploaded, failed, skipped, updated_at: new Date()},
                    $push: {results: {$each: [result], $slice: -20}},
                } as any,
            );
        }
    }

    try {
        await copyDocumentDriveLinksToInvoices(job.user_id);
    } catch (err) {
        logger.warn("drive_export_invoice_link_failed", {user_id: job.user_id, error: err});
    }

    const latestUser = await col<any>("users").findOne({_id: new ObjectId(job.user_id)} as any);
    const folderId = (latestUser?.drive_folder_id ?? job.folder_id ?? null) as string | null;
    const accessToken = await resolveDriveToken(job.user_id);
    if (folderId && accessToken) {
        await pinFolderToMyDrive(accessToken, folderId);
    }
    const folderName = latestUser?.drive_folder_name ?? job.folder_name ?? "RemindOCR";
    const folderUrl = folderId ? driveFolderWebUrl(folderId) : null;
    const now = new Date();
    await col("drive_export_jobs").updateOne(
        {_id: job._id} as any,
        {
            $set: {
                status: "completed",
                processed,
                uploaded,
                failed,
                skipped,
                folder_id: folderId,
                folder_name: folderName,
                folder_url: folderUrl,
                error: null,
                updated_at: now,
                completed_at: now,
            },
        } as any,
    );
    logger.info("drive_export_all_complete", {
        user_id: job.user_id,
        job_id: job._id.toString(),
        uploaded,
        failed,
        total: ids.length,
        folder_id: folderId,
        recreated: job.recreated,
        reset_count: job.reset_count,
    });
}

export function registerGdriveRoutes(app: express.Express) {
    app.get("/api/drive/status", async (req, res) => {
        const cookieHeader = req.headers.cookie ?? undefined;
        let ctx: Awaited<ReturnType<typeof requireAuth>>;
        try {
            ctx = await requireAuth(cookieHeader);
        } catch {
            res.status(401).json({error: "unauthorized"});
            return;
        }

        const user = await col<any>("users").findOne({_id: new ObjectId(ctx.userId)} as any);
        const hasToken = Boolean(user?.drive_access_token || user?.gmail_access_token) && user?.drive_scope_granted !== false;
        const syncEnabled = Boolean(user?.drive_sync_enabled);
        const folderId = user?.drive_folder_id ?? null;
        const folderName = user?.drive_folder_name ?? "RemindOCR";
        const allowed = planAllowsGoogleDrive(user?.plan ?? ctx.user.plan ?? ctx.user.role);
        const [syncedFileCount, pendingFileCount, missingFileCount, latestJob, totalFileCount] = await Promise.all([
            col("documents").countDocuments({
                user_id: ctx.userId,
                drive_file_id: {$exists: true, $nin: [null, ""]},
                ...EXPORTABLE_FILE_FILTER,
            } as any),
            col("documents").countDocuments({
                user_id: ctx.userId,
                drive_file_id: {$exists: false},
                ...EXPORTABLE_FILE_FILTER,
            } as any),
            col("documents").countDocuments({
                user_id: ctx.userId,
                $or: [{storage_status: "missing"}, {file_missing: true}],
            } as any),
            col<DriveExportJob>("drive_export_jobs").findOne(
                {user_id: ctx.userId} as any,
                {sort: {created_at: -1}} as any,
            ),
            // Everything eligible for Drive, so the UI can show synced out of total
            // instead of two counts the user has to add up.
            col("documents").countDocuments({
                user_id: ctx.userId,
                ...EXPORTABLE_FILE_FILTER,
            } as any),
        ]);

        let folderState: "ok" | "trashed" | "missing" | "unknown" | null = folderId ? "unknown" : null;
        if (folderId) {
            const accessToken = await resolveDriveToken(ctx.userId);
            if (accessToken) {
                folderState = (await inspectDriveFolder(accessToken, folderId)).state;
            }
        }

        const folderHealthy = folderState === "ok";
        res.json({
            connected: hasToken,
            syncEnabled: allowed && syncEnabled,
            folderId: folderHealthy || folderState === "unknown" ? folderId : null,
            folderName,
            folderUrl: folderHealthy && folderId ? driveFolderWebUrl(folderId) : null,
            folderState,
            syncedFileCount,
            totalFileCount,
            pendingFileCount,
            missingFileCount,
            latestJob: latestJob ? presentDriveExportJob(latestJob) : null,
            trashUrl: folderState === "trashed" ? driveTrashWebUrl() : null,
            allowed,
        });
    });

    app.post("/api/drive/enable", async (req, res) => {
        const cookieHeader = req.headers.cookie ?? undefined;
        let ctx: Awaited<ReturnType<typeof requireAuth>>;
        try {
            ctx = await requireAuth(cookieHeader);
        } catch {
            res.status(401).json({error: "unauthorized"});
            return;
        }

        const user = await col<any>("users").findOne({_id: new ObjectId(ctx.userId)} as any);
        if (!planAllowsGoogleDrive(user?.plan ?? ctx.user.plan ?? ctx.user.role)) {
            res.status(403).json({
                error: "drive_plan_required",
                message: "סנכרון Google Drive זמין במסלולים בסיסי ועסקי בלבד",
            });
            return;
        }

        const accessToken = await resolveDriveToken(ctx.userId);
        if (!accessToken) {
            res.status(403).json({error: "no_google_token", message: "חבר את חשבון Google כדי להפעיל סנכרון Drive"});
            return;
        }

        try {
            const customName = typeof req.body?.folderName === "string" && req.body.folderName.trim() ? req.body.folderName.trim() : undefined;
            const healthy = await ensureHealthyDriveFolder(ctx.userId, accessToken, customName);
            await col("users").updateOne(
                {_id: new ObjectId(ctx.userId)} as any,
                {
                    $set: {
                        drive_sync_enabled: true,
                        drive_folder_id: healthy.folderId, ...(customName ? {drive_folder_name: customName} : {})
                    }
                }
            );
            logger.info("drive_sync_enabled", {user_id: ctx.userId, folder_id: healthy.folderId, recreated: healthy.recreated});
            res.json({ok: true, folderId: healthy.folderId, folderUrl: driveFolderWebUrl(healthy.folderId), recreated: healthy.recreated, resetCount: healthy.resetCount});
        } catch (err: any) {
            if (err?.code === "drive_scope_missing" || err?.message === "drive_scope_missing") {
                logger.warn("drive_enable_scope_missing", {user_id: ctx.userId});
                res.status(403).json({
                    error: "drive_scope_missing",
                    message: "יש להתחבר מחדש ל-Gmail כדי לאשר גישה ל-Drive"
                });
                return;
            }
            logger.error("drive_enable_failed", {user_id: ctx.userId, error: err});
            res.status(500).json({error: "drive_setup_failed"});
        }
    });

    app.post("/api/drive/export-all", async (req, res) => {
        const cookieHeader = req.headers.cookie ?? undefined;
        let ctx: Awaited<ReturnType<typeof requireAuth>>;
        try {
            ctx = await requireAuth(cookieHeader);
        } catch {
            res.status(401).json({error: "unauthorized"});
            return;
        }

        const user = await col<any>("users").findOne({_id: new ObjectId(ctx.userId)} as any);
        if (!planAllowsGoogleDrive(user?.plan ?? ctx.user.plan ?? ctx.user.role)) {
            res.status(403).json({
                error: "drive_plan_required",
                message: "ייצוא ל-Google Drive זמין במסלולים בסיסי ועסקי בלבד",
            });
            return;
        }
        if (!user?.drive_sync_enabled) {
            res.status(400).json({error: "drive_not_enabled"});
            return;
        }

        const accessToken = await resolveDriveToken(ctx.userId);
        if (!accessToken) {
            res.status(403).json({error: "no_google_token"});
            return;
        }

        const existing = await col<DriveExportJob>("drive_export_jobs").findOne({
            user_id: ctx.userId,
            status: {$in: ["queued", "running"]},
        } as any);
        if (existing) {
            startDriveExportJobWorker();
            res.status(202).json(presentDriveExportJob(existing));
            return;
        }

        let healthy: Awaited<ReturnType<typeof ensureHealthyDriveFolder>>;
        try {
            healthy = await ensureHealthyDriveFolder(ctx.userId, accessToken);
        } catch (err: any) {
            if (err?.code === "drive_scope_missing" || err?.message === "drive_scope_missing") {
                res.status(403).json({
                    error: "drive_scope_missing",
                    message: "יש להתחבר מחדש ל-Gmail כדי לאשר גישה ל-Drive",
                });
                return;
            }
            logger.error("drive_export_folder_failed", {user_id: ctx.userId, error: err});
            res.status(500).json({error: "drive_export_failed"});
            return;
        }
        if (healthy.recreated) {
            logger.info("drive_export_folder_recreated", {
                user_id: ctx.userId,
                folder_id: healthy.folderId,
                reset_count: healthy.resetCount,
            });
        }

        const pendingDocs = await col<any>("documents").find({
            user_id: ctx.userId,
            drive_file_id: {$exists: false},
            ...EXPORTABLE_FILE_FILTER,
        } as any).project({_id: 1, file_name: 1}).toArray();
        const skipped = await col("documents").countDocuments({
            user_id: ctx.userId,
            drive_file_id: {$exists: true, $nin: [null, ""]},
            ...EXPORTABLE_FILE_FILTER,
        } as any);

        const folderId = healthy.folderId;
        const folderName = user.drive_folder_name ?? "RemindOCR";
        const now = new Date();
        const insert = await col<DriveExportJob>("drive_export_jobs").insertOne({
            user_id: ctx.userId,
            status: "queued",
            document_ids: pendingDocs.map((doc) => String(doc._id)),
            cursor: 0,
            total: pendingDocs.length,
            processed: 0,
            uploaded: 0,
            failed: 0,
            skipped,
            results: [],
            folder_id: folderId,
            folder_name: folderName,
            folder_url: folderId ? driveFolderWebUrl(folderId) : null,
            recreated: healthy.recreated,
            reset_count: healthy.resetCount,
            error: null,
            created_at: now,
            updated_at: now,
            completed_at: null,
        } as any);
        startDriveExportJobWorker();
        const job = await col<DriveExportJob>("drive_export_jobs").findOne({_id: insert.insertedId} as any);
        res.status(202).json(presentDriveExportJob(job as DriveExportJob));
        return;
    });

    app.get("/api/drive/export-jobs/:jobId", async (req, res) => {
        const cookieHeader = req.headers.cookie ?? undefined;
        let ctx: Awaited<ReturnType<typeof requireAuth>>;
        try {
            ctx = await requireAuth(cookieHeader);
        } catch {
            res.status(401).json({error: "unauthorized"});
            return;
        }

        const jobId = String(req.params.jobId ?? "");
        if (!ObjectId.isValid(jobId)) {
            res.status(400).json({error: "invalid_job_id"});
            return;
        }
        startDriveExportJobWorker();
        const job = await col<DriveExportJob>("drive_export_jobs").findOne({
            _id: new ObjectId(jobId),
            user_id: ctx.userId,
        } as any);
        if (!job) {
            res.status(404).json({error: "job_not_found"});
            return;
        }
        res.json(presentDriveExportJob(job));
    });

    app.post("/api/drive/rename-folder", async (req, res) => {
        const cookieHeader = req.headers.cookie ?? undefined;
        let ctx: Awaited<ReturnType<typeof requireAuth>>;
        try {
            ctx = await requireAuth(cookieHeader);
        } catch {
            res.status(401).json({error: "unauthorized"});
            return;
        }

        const userForPlan = await col<any>("users").findOne({_id: new ObjectId(ctx.userId)} as any);
        if (!planAllowsGoogleDrive(userForPlan?.plan ?? ctx.user.plan ?? ctx.user.role)) {
            res.status(403).json({
                error: "drive_plan_required",
                message: "סנכרון Google Drive זמין במסלולים בסיסי ועסקי בלבד"
            });
            return;
        }

        const newName = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : null;
        if (!newName) {
            res.status(400).json({error: "missing_name"});
            return;
        }

        const user = userForPlan;
        if (!user?.drive_folder_id) {
            res.status(400).json({error: "no_drive_folder"});
            return;
        }

        const accessToken = await resolveDriveToken(ctx.userId);
        if (!accessToken) {
            res.status(403).json({error: "no_google_token"});
            return;
        }

        try {
            await renameDriveFolder(accessToken, user.drive_folder_id, newName);
            await col("users").updateOne(
                {_id: new ObjectId(ctx.userId)} as any,
                {$set: {drive_folder_name: newName}}
            );
            logger.info("drive_folder_renamed", {user_id: ctx.userId, new_name: newName});
            res.json({ok: true, folderName: newName});
        } catch (err) {
            logger.error("drive_folder_rename_failed", {user_id: ctx.userId, error: err});
            res.status(500).json({error: "rename_failed"});
        }
    });

    app.post("/api/drive/disable", async (req, res) => {
        const cookieHeader = req.headers.cookie ?? undefined;
        let ctx: Awaited<ReturnType<typeof requireAuth>>;
        try {
            ctx = await requireAuth(cookieHeader);
        } catch {
            res.status(401).json({error: "unauthorized"});
            return;
        }

        await col("users").updateOne(
            {_id: new ObjectId(ctx.userId)} as any,
            {$set: {drive_sync_enabled: false}}
        );
        logger.info("drive_sync_disabled", {user_id: ctx.userId});
        res.json({ok: true});
    });
}
