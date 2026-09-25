import express from "express";
import {Collection, Db, Document, MongoClient} from "mongodb";
import {getPrimaryDb, getPrimaryUri} from "./db";
import {logger} from "../logger";

/**
 * SEED data — marketing leads, email campaigns and unsubscribe scans — lives in
 * one place for every environment: the production database. Local, dev and
 * production servers all read and write it there, regardless of the admin's
 * Local/Production switch, so sends and unsubscribes never split across copies.
 *
 * Resolution:
 *   1. SEED_MONGODB_URI (+ SEED_MONGODB_DB)
 *   2. MONGODB_PRODUCTION_URI (+ MONGODB_PRODUCTION_DB)
 *   3. the server's own database, but only on the real production server
 *      (APP_ENV=production) — dev.remindocr.com also runs on Railway, so
 *      "Railway" alone does not mean production.
 * Anything else is "unconfigured": SEED routes answer 503 instead of silently
 * using a dev copy.
 */

export const SEED_COLLECTIONS = ["inspector_leads", "email_campaigns", "unsubscribe_scans"] as const;

export class SeedDbNotConfiguredError extends Error {
  constructor() {
    super("SEED database not configured: set SEED_MONGODB_URI (or MONGODB_PRODUCTION_URI) to the production database");
    this.name = "SeedDbNotConfiguredError";
  }
}

type SeedTarget = {mode: "primary"} | {mode: "dedicated"; uri: string; dbName: string} | {mode: "unconfigured"};

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function resolveSeedTarget(): SeedTarget {
  const uri = env("SEED_MONGODB_URI") ?? env("MONGODB_PRODUCTION_URI");
  if (uri) {
    const dbName = env("SEED_MONGODB_DB") ?? env("MONGODB_PRODUCTION_DB") ?? "reminder-app";
    // On production the primary pool already points here; don't open a second one.
    if (uri === getPrimaryUri() && dbName === safePrimaryDbName()) return {mode: "primary"};
    return {mode: "dedicated", uri, dbName};
  }
  if (env("APP_ENV") === "production") return {mode: "primary"};
  return {mode: "unconfigured"};
}

function safePrimaryDbName(): string | null {
  try {
    return getPrimaryDb().databaseName;
  } catch {
    return null;
  }
}

function redactUri(uri: string): string {
  return uri.replace(/\/\/[^@/]*@/, "//***:***@").replace(/\?.*$/, "");
}

let seedClient: MongoClient | null = null;
let seedDb: Db | null = null;
let connecting: Promise<Db> | null = null;

async function openDedicated(uri: string, dbName: string): Promise<Db> {
  // Bounded on purpose: the driver default is 100 with no wait-queue timeout, so a
  // saturated pool would hang requests instead of failing fast.
  const client = new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    waitQueueTimeoutMS: 10_000,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 15_000,
  });
  await client.connect();
  const db = client.db(dbName);
  const leads = db.collection("inspector_leads");
  await Promise.all([
    leads.createIndex({email: 1}, {sparse: true}),
    leads.createIndex({phone: 1}, {sparse: true}),
    leads.createIndex({website: 1}, {sparse: true}),
    leads.createIndex({source: 1}),
    leads.createIndex({contactStatus: 1, leadScore: -1}),
    leads.createIndex({leadScore: -1}),
  ]);
  seedClient = client;
  logger.info("seed_db_connected", {db_name: dbName, uri: redactUri(uri)});
  return db;
}

/** The SEED database; throws SeedDbNotConfiguredError when no production SEED DB is configured. */
export async function getSeedDb(): Promise<Db> {
  const target = resolveSeedTarget();
  if (target.mode === "unconfigured") throw new SeedDbNotConfiguredError();
  if (target.mode === "primary") return getPrimaryDb();
  if (seedDb) return seedDb;
  if (!connecting) {
    connecting = openDedicated(target.uri, target.dbName)
      .then((db) => { seedDb = db; return db; })
      .finally(() => { connecting = null; });
  }
  return connecting;
}

export async function seedCollection<T extends Document = Document>(name: (typeof SEED_COLLECTIONS)[number]): Promise<Collection<T>> {
  return (await getSeedDb()).collection<T>(name);
}

/** Where SEED data is read from, for the admin UI. */
export function seedDbStatus(): {mode: SeedTarget["mode"]; dbName: string | null; host: string | null} {
  const target = resolveSeedTarget();
  if (target.mode === "dedicated") {
    return {mode: "dedicated", dbName: target.dbName, host: target.uri.match(/@([^/?]+)/)?.[1] ?? null};
  }
  if (target.mode === "primary") {
    return {mode: "primary", dbName: safePrimaryDbName(), host: getPrimaryUri()?.match(/@([^/?]+)/)?.[1] ?? null};
  }
  return {mode: "unconfigured", dbName: null, host: null};
}

/**
 * Put in front of SEED routes: opens the SEED DB before the handler runs and
 * answers 503 with the reason if it can't, since Express 4 does not catch
 * errors thrown inside async handlers.
 */
export async function requireSeedDb(_req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    await getSeedDb();
    next();
  } catch (err: any) {
    const configured = !(err instanceof SeedDbNotConfiguredError);
    if (configured) logger.error("seed_db_unavailable", {error: err?.message ?? String(err)});
    res.status(503).json({error: configured ? `SEED database unavailable: ${err?.message ?? err}` : err.message});
  }
}

export async function closeSeedDb(): Promise<void> {
  const client = seedClient;
  seedClient = null;
  seedDb = null;
  if (client) await client.close();
}
