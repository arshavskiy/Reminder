import {execFile} from "node:child_process";
import {readdir, rename, rm} from "node:fs/promises";
import {resolve} from "node:path";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const directory = resolve(process.argv[2] ?? "video/recordings/pages");

for (const name of await readdir(directory)) {
    if (!/^\d{2}-.+\.webm$/.test(name)) continue;
    const source = resolve(directory, name);
    const target = resolve(directory, name.replace(/\.webm$/, ".trimmed.webm"));
    await execFileAsync("ffmpeg", ["-y", "-i", source, "-t", "15", "-c", "copy", target]);
    await rm(source, {force: true});
    await rename(target, source);
}

console.log(directory);
