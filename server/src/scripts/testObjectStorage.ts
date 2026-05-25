import "dotenv/config";
import {mkdirSync, writeFileSync} from "fs";
import {join} from "path";
import {getDataDir} from "../settings";
import {
    deleteFromSpaces,
    fileExistsInSpaces,
    getSpacesSignedUrl,
    spacesEnabled,
    uploadToSpaces,
} from "../storage/spaces";

async function main() {
  if (!spacesEnabled()) {
    throw new Error("Object storage is not configured. Add Railway bucket variables first.");
  }

  const tmpDir = join(getDataDir(), "tmp");
  mkdirSync(tmpDir, { recursive: true });

  const key = `health-check/${Date.now()}-${Math.random().toString(16).slice(2)}.txt`;
  const body = `railway bucket smoke test ${new Date().toISOString()}`;
  const localPath = join(tmpDir, "object-storage-smoke-test.txt");
  writeFileSync(localPath, body, "utf-8");

  console.log(`[storage-test] Uploading ${key}`);
  await uploadToSpaces(localPath, key, "text/plain");

  const exists = await fileExistsInSpaces(key);
  if (!exists) throw new Error("Uploaded object was not found by HeadObject");
  console.log("[storage-test] HeadObject succeeded");

  const signedUrl = await getSpacesSignedUrl(key, 120);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error(`Signed URL fetch failed: ${response.status}`);

  const downloaded = await response.text();
  if (downloaded !== body) throw new Error("Downloaded object content did not match upload");
  console.log("[storage-test] Signed URL download matched uploaded content");

  await deleteFromSpaces(key);
  console.log("[storage-test] Deleted test object");
  console.log("[storage-test] OK");
}

main().catch((err) => {
  console.error("[storage-test] Failed:", err);
  process.exitCode = 1;
});
