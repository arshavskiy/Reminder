import {config} from "dotenv";
import {MongoClient} from "mongodb";

config({path: new URL("../.env.local", import.meta.url), quiet: true});
config({path: new URL("../.env", import.meta.url), quiet: true});

/**
 * Lower-cased addresses flagged unsubscribed in inspector_leads (set by the admin
 * "Scan Gmail for unsubscribes" button). Production by default; dev cluster with {dev: true}.
 */
export async function loadUnsubscribedEmails({dev = false} = {}) {
  const uri = dev ? (process.env.MONGODB_LOCAL_URI || process.env.MONGODB_URI) : process.env.MONGODB_PRODUCTION_URI;
  const dbName = dev ? (process.env.MONGODB_DB || "reminder-dev") : (process.env.MONGODB_PRODUCTION_DB || "reminder-app");
  if (!uri) throw new Error(dev ? "MONGODB_LOCAL_URI or MONGODB_URI is required" : "MONGODB_PRODUCTION_URI is required (or pass --dev)");
  const client = new MongoClient(uri, {serverSelectionTimeoutMS: 15000});
  try {
    await client.connect();
    const rows = await client.db(dbName).collection("inspector_leads")
      .find({unsubscribed: true, email: {$type: "string"}}, {projection: {email: 1}})
      .toArray();
    return {db: dbName, emails: new Set(rows.map(row => row.email.trim().toLowerCase()))};
  } finally {
    await client.close();
  }
}
