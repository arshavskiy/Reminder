import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { col, connectDb } from "../db/db.js";
import { fileExistsInSpaces, spacesEnabled } from "../storage/spaces.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const DRY_RUN = !process.argv.includes("--delete");

await connectDb();

if (!spacesEnabled()) {
  console.error("Object storage not configured.");
  process.exit(1);
}

const docs = await col("documents")
  .find({ spaces_key: { $exists: true, $ne: null } })
  .project({ _id: 1, file_name: 1, spaces_key: 1, user_id: 1 })
  .toArray();

console.log(`Checking ${docs.length} documents with storage keys...\n`);

const missing: typeof docs = [];
let checked = 0;

for (const doc of docs) {
  checked++;
  const exists = await fileExistsInSpaces(doc.spaces_key as string);
  if (!exists) {
    missing.push(doc);
    console.log(`MISSING  ${doc._id}  ${doc.file_name ?? "(no name)"}  key=${doc.spaces_key}`);
  }
  if (checked % 50 === 0) {
    console.log(`  ... checked ${checked}/${docs.length}`);
  }
}

console.log(`\nDone. ${checked} checked, ${missing.length} missing files.\n`);

if (missing.length === 0) {
  console.log("All files accounted for.");
  process.exit(0);
}

if (DRY_RUN) {
  console.log("Dry run — pass --delete to remove orphaned DB records.");
  console.log("\nMissing document IDs:");
  for (const doc of missing) {
    console.log(`  ${doc._id}  user=${doc.user_id}  file=${doc.file_name}`);
  }
} else {
  console.log("Deleting orphaned document records...");
  const ids = missing.map((d) => d._id);
  const result = await col("documents").deleteMany({ _id: { $in: ids } });
  console.log(`Deleted ${result.deletedCount} orphaned documents.`);
}

process.exit(0);
