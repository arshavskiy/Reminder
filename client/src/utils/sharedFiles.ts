// Files handed to the installed PWA through the Web Share Target. The service
// worker cannot open the upload modal itself, so it parks the shared files in
// the Cache API and the dashboard picks them up on its next load.

export const SHARED_FILES_CACHE = "remindocr-shared-files";
const KEY_PREFIX = "/__shared-files__/";

export async function readSharedFiles(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(SHARED_FILES_CACHE);
  const requests = await cache.keys();
  const files: File[] = [];
  for (const request of requests) {
    const response = await cache.match(request);
    if (!response) continue;
    const name = decodeURIComponent(response.headers.get("X-File-Name") ?? "shared-file");
    const blob = await response.blob();
    files.push(new File([blob], name, { type: blob.type || response.headers.get("Content-Type") || "" }));
  }
  return files;
}

export async function clearSharedFiles(): Promise<void> {
  if (typeof caches === "undefined") return;
  await caches.delete(SHARED_FILES_CACHE);
}

export { KEY_PREFIX as SHARED_FILES_KEY_PREFIX };
