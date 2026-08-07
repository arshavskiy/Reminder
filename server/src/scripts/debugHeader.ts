import {config} from "dotenv";
import {dirname, resolve} from "path";
import {fileURLToPath} from "url";
import {MongoClient, ObjectId} from "mongodb";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

const c = new MongoClient(process.env.MONGODB_URI!);
await c.connect();
const doc = await c.db("reminder-app").collection("documents").findOne({ _id: new ObjectId("6a7455b8637d40b675a9b4ca") });
const rawText: string = doc!.raw_text;

const lines = rawText.split(/\r?\n/).map(l => l.replace(/\s+/g, " ").trim());
for (let i = 0; i < lines.length; i++) {
  if (/תיאור\s+מכונת\s+הרמה/i.test(lines[i])) {
    console.log(`HEADER at line ${i}: "${lines[i]}"`);
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const known = /פרטי\s+הלקוח|מקום\s+הבדיקה|יש\s+לשמור|הערות|ליקוי/i.test(lines[j]);
      const eq = lines[j].match(/(עגורן\s*שער|עגרן\s*שער|אביזרי\s*הרמה|מלגזה|מנוף|במת?\s*הרמה|עגורן|מגבה|מהפכי?)/i);
      console.log(`  line ${j}: "${lines[j]}" ${known ? "[STOP]" : ""} ${eq ? "[MATCH: " + eq[1] + "]" : ""}`);
      if (known) break;
    }
  }
}
await c.close();
process.exit(0);
