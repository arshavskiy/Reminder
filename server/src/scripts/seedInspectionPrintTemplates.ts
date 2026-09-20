import dotenv from "dotenv";

dotenv.config({path: ".env.local"});
dotenv.config();

import {closeDb, connectDb} from "../db/db.js";
import {
    createInspectionPrintTemplateSeeds,
    INSPECTION_PRINT_TEMPLATE_PRESETS,
    INSPECTION_PRINT_TEMPLATE_PRESETS_EN,
} from "../shared/printTemplateLayout.js";

const apply = process.argv.includes("--apply");
const now = new Date().toISOString();
const seeds = createInspectionPrintTemplateSeeds(now);

console.table([...INSPECTION_PRINT_TEMPLATE_PRESETS, ...INSPECTION_PRINT_TEMPLATE_PRESETS_EN].map((preset) => ({
    key: preset.key,
    name: preset.name,
    intervalMonths: preset.intervalMonths,
    contractType: preset.contractType,
})));

if (!apply) {
    console.log("Dry run only. Run with --apply to upsert shared print templates.");
    process.exit(0);
}

const db = await connectDb();
try {
    for (const seed of seeds) {
        const {created_at: createdAt, ...setFields} = seed;
        await db.collection("print_templates").updateOne(
            {system_key: seed.system_key},
            {
                $set: setFields,
                $setOnInsert: {created_at: createdAt},
            },
            {upsert: true},
        );
    }
    console.log(`Upserted ${seeds.length} shared inspection print templates.`);
} finally {
    await closeDb();
}
