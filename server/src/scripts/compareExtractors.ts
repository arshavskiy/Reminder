import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {MongoClient, ObjectId} from "mongodb";
import {existsSync, mkdirSync, writeFileSync} from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const DOC_ID = process.argv[2] || "6a7455b9637d40b675a9b4d1";

const c = new MongoClient(process.env.MONGODB_URI!);
await c.connect();
const doc = await c.db("reminder-app").collection("documents").findOne({ _id: new ObjectId(DOC_ID) });
if (!doc) { console.error("Doc not found"); process.exit(1); }

console.log("=== CURRENT pdf-parse RAW TEXT ===\n");
console.log(doc.raw_text?.substring(0, 4000));

// Download file from S3 to temp
if (doc.spaces_key) {
  const { getSpacesSignedUrl } = await import("../storage/spaces.js");
  const url = await getSpacesSignedUrl(doc.spaces_key, 3600, doc.file_name);
  console.log("\n=== Downloading from S3... ===");
  const res = await fetch(url);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpDir = resolve(__dirname, "../../tmp");
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  const tmpPath = resolve(tmpDir, `test_${DOC_ID}.pdf`);
  writeFileSync(tmpPath, buf);
  console.log(`Saved to ${tmpPath} (${buf.length} bytes)\n`);

  // pdf-parse extraction
  console.log("=== pdf-parse output ===\n");
  const pdfParse = (await import("pdf-parse")).default;
  const pdfData = await pdfParse(buf);
  console.log(pdfData.text.substring(0, 4000));

  // pdf-table-extractor
  console.log("\n\n=== pdf-table-extractor output ===\n");
  try {
    const pdfTableExtractor = (await import("pdf-table-extractor")).default;
    const tables = await new Promise<any>((resolve, reject) => {
      pdfTableExtractor(tmpPath, resolve, reject);
    });
    if (tables?.pageTables) {
      for (const page of tables.pageTables) {
        console.log(`Page ${page.page}:`);
        for (const table of page.tables) {
          console.log(table.map((row: string[]) => row.join(" | ")).join("\n"));
          console.log("---");
        }
      }
    } else {
      console.log("No tables found");
    }
  } catch (e: any) {
    console.log("pdf-table-extractor failed:", e.message);
  }
} else {
  console.log("\nNo S3 key — can't download file");
}

await c.close();
process.exit(0);
