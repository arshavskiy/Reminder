/**
 * Copy one locally-edited email template over its production counterpart.
 *
 * Templates are edited in the app against the local database, so production
 * keeps its own row for the same template under a different _id. This matches by
 * name rather than id and updates the content in place, which keeps every
 * reminder that already points at the production id working.
 *
 * Only the authored content moves: name, subject and html. Identity and wiring —
 * _id, doc_template_id, is_default, created_at — stay as production has them,
 * because those decide which template is used and are not what was edited.
 *
 * logo_path is deliberately not copied. It names a file in the local asset
 * store; production resolves it to /api/assets/<name> on its own host, so a
 * reference to a file that was never uploaded there would ship broken images in
 * real customer email.
 *
 * Dry run by default; pass --apply to write.
 *
 *   npm run templates:sync-prod -- --id=<local template _id>
 *   npm run templates:sync-prod -- --id=<local template _id> --apply
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { MongoClient, ObjectId } from "mongodb";

const apply = process.argv.includes("--apply");

function parseArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

const idArg = parseArg("id");
if (!idArg) throw new Error("Provide --id=<local email_templates _id>");
if (!ObjectId.isValid(idArg)) throw new Error(`Invalid --id "${idArg}"`);

const localUri = process.env.MONGODB_LOCAL_URI || process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const prodUri = process.env.MONGODB_PRODUCTION_URI;
if (!prodUri) throw new Error("MONGODB_PRODUCTION_URI is not set");

const localDbName = process.env.MONGODB_DB ?? "reminder-app";
const prodDbName = process.env.MONGODB_PRODUCTION_DB ?? "reminder-app";

const localClient = new MongoClient(localUri);
const prodClient = new MongoClient(prodUri);

try {
  await localClient.connect();
  await prodClient.connect();

  const localTemplates = localClient.db(localDbName).collection("email_templates");
  const prodTemplates = prodClient.db(prodDbName).collection("email_templates");

  const source = await localTemplates.findOne({ _id: new ObjectId(idArg) } as any) as any;
  if (!source) throw new Error(`Template ${idArg} not found in the local database`);

  const target = await prodTemplates.findOne({ name: source.name } as any) as any;
  if (!target) {
    throw new Error(
      `No production template named "${source.name}". This script updates an ` +
      `existing template rather than creating one; create it in production first.`,
    );
  }

  const changes: string[] = [];
  if (source.name !== target.name) changes.push("name");
  if (source.subject !== target.subject) changes.push("subject");
  if (source.html !== target.html) {
    changes.push(`html (${target.html?.length ?? 0} -> ${source.html?.length ?? 0} bytes)`);
  }

  console.log(`source (local):     ${source._id.toString()}  ${source.name}`);
  console.log(`target (production): ${target._id.toString()}  ${target.name}`);
  console.log(`production is_default: ${target.is_default ?? 0} (unchanged)`);
  console.log(`production logo_path:  ${JSON.stringify(target.logo_path ?? null)} (unchanged)`);
  console.log("");

  if (!changes.length) {
    console.log("Already identical — nothing to do.");
  } else {
    console.log(`${apply ? "Updating" : "Would update"}: ${changes.join(", ")}`);
    if (apply) {
      const result = await prodTemplates.updateOne(
        { _id: target._id } as any,
        {
          $set: {
            name: source.name,
            subject: source.subject,
            html: source.html,
            updated_at: new Date(),
          },
        } as any,
      );
      console.log(`modified: ${result.modifiedCount}`);
    } else {
      console.log("");
      console.log("Dry run. Re-run with --apply to write to production.");
    }
  }
} finally {
  await localClient.close();
  await prodClient.close();
}
