import {config} from "dotenv";

/**
 * Side-effect module that loads env vars. Import this FIRST in any script,
 * before ../db/db or ../storage/spaces.
 *
 * ESM hoists all imports above statement code, so calling dotenv.config() in a
 * script body runs after its imports have already evaluated. db.ts reads
 * MONGODB_URI into a top-level const at import time, so loading env later leaves
 * it on the localhost fallback — the script then silently targets the wrong
 * database. Importing this module first makes the load part of the import
 * graph, which is ordered. src/index.ts does the same for the server.
 */
config({path: ".env.local"});
config();

export {};
