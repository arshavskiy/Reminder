import express from "express";
import {col} from "../db/db";
import {ObjectId} from "mongodb";
import {requireAuth} from "../auth/middleware";
import {ensureAppFolder, renameDriveFolder, resolveDriveToken, syncDocumentToDrive} from "../storage/gdrive";
import {logger} from "../logger";

function normalizeDrivePlan(planOrRole: string | null | undefined): "free" | "basic" | "business" {
    const value = String(planOrRole ?? "").trim().toLowerCase();
    if (value === "admin" || value === "business") return "business";
    if (value === "pro" || value === "basic") return "basic";
    return "free";
}

function planAllowsGoogleDrive(planOrRole: string | null | undefined): boolean {
    return normalizeDrivePlan(planOrRole) !== "free";
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

        res.json({connected: hasToken, syncEnabled: allowed && syncEnabled, folderId, folderName, allowed});
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
            const folderId = await ensureAppFolder(accessToken, customName);
            await col("users").updateOne(
                {_id: new ObjectId(ctx.userId)} as any,
                {
                    $set: {
                        drive_sync_enabled: true,
                        drive_folder_id: folderId, ...(customName ? {drive_folder_name: customName} : {})
                    }
                }
            );
            logger.info("drive_sync_enabled", {user_id: ctx.userId, folder_id: folderId});
            res.json({ok: true, folderId});
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

        logger.info("drive_export_all_complete", {user_id: ctx.userId, uploaded, failed, total: docs.length});
        res.json({ok: true, uploaded, failed, total: docs.length});
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
