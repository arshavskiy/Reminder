import express from "express";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {requireAuth} from "../auth/middleware";
import {pinFolderToMyDrive, renameDriveFolder, resolveDriveToken, syncDocumentToDrive, driveFolderWebUrl, driveTrashWebUrl, inspectDriveFolder, ensureHealthyDriveFolder} from "../storage/gdrive";
import {logger} from "../logger";
import {tierFeatureFlags} from "../plans/tierFeatures";

function planAllowsGoogleDrive(planOrRole: string | null | undefined): boolean {
    return tierFeatureFlags(planOrRole).googleDriveSync;
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
        const hasToken = Boolean(user?.gmail_access_token);
        const syncEnabled = Boolean(user?.drive_sync_enabled);
        const folderId = user?.drive_folder_id ?? null;
        const folderName = user?.drive_folder_name ?? "RemindOCR";
        const allowed = planAllowsGoogleDrive(user?.plan ?? ctx.user.plan ?? ctx.user.role);
        const syncedFileCount = await col("documents").countDocuments({
            user_id: ctx.userId,
            drive_file_id: {$exists: true, $nin: [null, ""]},
        } as any);

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

        const docs = await col<any>("documents").find({
            user_id: ctx.userId,
            drive_file_id: {$exists: false},
            $or: [
                {file_path: {$exists: true, $ne: null}},
                {spaces_key: {$exists: true, $ne: null}},
            ],
        } as any).toArray();

        let uploaded = 0;
        let failed = 0;

        for (const doc of docs) {
            try {
                await syncDocumentToDrive(doc._id.toString(), ctx.userId);
                const updated = await col<any>("documents").findOne({_id: doc._id} as any);
                if (updated?.drive_file_id) uploaded++;
                else failed++;
            } catch (err) {
                logger.error("drive_export_file_failed", {document_id: doc._id.toString(), error: err});
                failed++;
            }
        }

        const latestUser = await col<any>("users").findOne({_id: new ObjectId(ctx.userId)} as any);
        const folderId = (latestUser?.drive_folder_id ?? healthy.folderId ?? null) as string | null;
        if (folderId) {
            await pinFolderToMyDrive(accessToken, folderId);
        }
        const folderName = latestUser?.drive_folder_name ?? user.drive_folder_name ?? "RemindOCR";
        const folderUrl = folderId ? driveFolderWebUrl(folderId) : null;

        logger.info("drive_export_all_complete", {
            user_id: ctx.userId,
            uploaded,
            failed,
            total: docs.length,
            folder_id: folderId,
            recreated: healthy.recreated,
            reset_count: healthy.resetCount,
        });
        res.json({
            ok: true,
            uploaded,
            failed,
            total: docs.length,
            folderId,
            folderName,
            folderUrl,
            recreated: healthy.recreated,
            resetCount: healthy.resetCount,
        });
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
