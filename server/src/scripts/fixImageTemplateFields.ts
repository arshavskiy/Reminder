import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../.env") });

import { readFileSync } from "fs";
const { connectDb, col } = await import("../db/db.js");
await connectDb();

const name = "תזכורת בדיקה — פצ׳רסקי (תמונה)";
const posterUrl = process.env.POSTER_URL || "https://app.handcoded.tech/pechersky-reminder-poster.png";

// Store the raw template HTML with the {{poster_url}} placeholder — the render
// layer now substitutes poster_url from the template field, so no seed-time bake.
const html = readFileSync(
  resolve(__dirname, "../email-templates/reminders/pechersky-inspection-image.html"),
  "utf-8",
);

const res = await col("email_templates").updateOne(
  { name },
  { $set: { html, poster_url: posterUrl, updated_at: new Date() } },
);

console.log("Matched:", res.matchedCount, "Modified:", res.modifiedCount);
console.log("poster_url set to:", posterUrl);
console.log("html has placeholder {{poster_url}}:", html.includes("{{poster_url}}"));
process.exit(0);
