import {chmodSync, copyFileSync, existsSync, mkdirSync} from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const gitDir = join(root, ".git");
if (!existsSync(gitDir)) process.exit(0);

const destDir = join(gitDir, "hooks");
mkdirSync(destDir, {recursive: true});
const dest = join(destDir, "pre-push");
copyFileSync(join(root, "scripts", "git-hooks", "pre-push"), dest);
try {
  chmodSync(dest, 0o755);
} catch {
  // Windows may not support POSIX mode bits.
}
