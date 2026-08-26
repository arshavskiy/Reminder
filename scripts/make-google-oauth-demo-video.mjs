import { mkdir, writeFile, rm, stat, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import playwright from "../client/node_modules/playwright/index.js";

const { chromium } = playwright;

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const outDir = join(root, "docs", "google-oauth-demo-video");
const workDir = join(outDir, "work");
const finalVideo = join(outDir, "remindocr-google-oauth-demo.mp4");
const poster = join(outDir, "remindocr-google-oauth-demo-poster.png");

const scenes = [
  {
    key: "identity",
    title: "RemindOCR",
    eyebrow: "Public app identity",
    visual: "homepage",
    narration:
      "This is RemindOCR, a document management and reminder application for inspection reports, invoices, clients, and expiration reminders. The app uses Google sign-in for authentication and optional Gmail and Drive integrations for user-requested document import and sync. The Privacy Policy explains how Google user data is used. Gmail access is optional, read-only, and used only to list emails with attachments and import attachments selected by the user.",
  },
  {
    key: "signin",
    title: "Sign in as a test user",
    eyebrow: "Dedicated demo account",
    visual: "signin",
    narration:
      "I will sign in as a test user. This is a dedicated demo account with sample emails and sample documents only.",
  },
  {
    key: "connect",
    title: "Start Gmail connection",
    eyebrow: "User-initiated OAuth",
    visual: "gmailDisconnected",
    narration:
      "Gmail is not connected by default. The user explicitly starts the connection from the Gmail page.",
  },
  {
    key: "consent",
    title: "Google permission review",
    eyebrow: "OAuth consent screen",
    visual: "consent",
    narration:
      "Google shows the permissions requested by RemindOCR. The app requests read-only Gmail access for listing and downloading selected attachments, and Drive file access for files created or managed by RemindOCR.",
  },
  {
    key: "import",
    title: "Search and import attachments",
    eyebrow: "Gmail readonly",
    visual: "gmailImport",
    narration:
      "After consent, RemindOCR lists matching emails with attachments. It shows email metadata like sender, subject, date, and attachment file names. The user chooses which attachment to import. The app downloads the selected attachment and processes it as a RemindOCR document.",
  },
  {
    key: "document",
    title: "Imported document in RemindOCR",
    eyebrow: "OCR and structured extraction",
    visual: "document",
    narration:
      "The imported attachment is now stored as a document in RemindOCR and processed for OCR and structured extraction. This data is used to help the user manage documents, clients, invoices, inspection reports, and reminders.",
  },
  {
    key: "drive",
    title: "Google Drive sync controls",
    eyebrow: "User controlled Drive access",
    visual: "drive",
    narration:
      "Drive sync is controlled by the user. When enabled, RemindOCR stores exported or synced documents in a RemindOCR folder in My Drive, with separate folders for invoices and inspection reports.",
  },
  {
    key: "disconnect",
    title: "Disconnect and revoke access",
    eyebrow: "User control",
    visual: "disconnect",
    narration:
      "The user can disconnect Gmail inside RemindOCR at any time. The user can also revoke RemindOCR access from Google Account permissions.",
  },
  {
    key: "closing",
    title: "Complete user-controlled flow",
    eyebrow: "Google API limited use",
    visual: "closing",
    narration:
      "This demo shows the complete user-controlled flow: sign in, connect Gmail through Google OAuth, import selected attachments, optionally sync RemindOCR-created files to Google Drive, and disconnect access. Google data is used only to provide these user-facing document import and sync features.",
  },
];

function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], ...options });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else reject(new Error(`${command} ${args.join(" ")} failed with ${code}\n${stdout}\n${stderr}`));
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sceneBody(visual) {
  const bodies = {
    homepage: `
      <section class="browser">
        <div class="bar"><span></span><span></span><span></span><b>https://remindocr.com</b></div>
        <div class="hero">
          <div>
            <img class="logo" src="${pathToFileURL(join(root, "client", "src", "public", "remindocr-logo.png")).href}" />
            <h2>RemindOCR</h2>
            <p>Manage inspection reports, invoices, clients, documents, and expiration reminders.</p>
          </div>
          <div class="links"><span>Privacy Policy</span><span>Terms</span><span>Google API Limited Use</span></div>
        </div>
      </section>`,
    signin: `
      <section class="app">
        <aside><b>RemindOCR</b><span>Dashboard</span><span>Documents</span><span>Gmail Import</span></aside>
        <main class="center">
          <div class="login"><h2>Sign in</h2><button class="google">G Sign in with Google</button><small>Demo account only: sample emails and sample PDFs.</small></div>
        </main>
      </section>`,
    gmailDisconnected: `
      <section class="app">
        <aside><b>RemindOCR</b><span>Dashboard</span><span class="active">Gmail Import</span><span>Documents</span></aside>
        <main><h2>Gmail Import</h2><div class="state"><b>Gmail is disconnected</b><p>Connect Gmail only when you want to import attachments.</p><button>Connect Gmail</button></div></main>
      </section>`,
    consent: `
      <section class="consent">
        <div class="google-head">Google</div>
        <h2>RemindOCR wants access to your Google Account</h2>
        <p class="muted">Demo user: test.remindocr@example.com</p>
        <div class="scope"><b>Read your Gmail messages and settings</b><span>Used only to list emails and download selected attachments.</span></div>
        <div class="scope"><b>See, edit, create, and delete only files RemindOCR creates in Drive</b><span>Used for RemindOCR folder sync and export.</span></div>
        <div class="actions"><button class="ghost">Cancel</button><button>Allow</button></div>
      </section>`,
    gmailImport: `
      <section class="app">
        <aside><b>RemindOCR</b><span class="active">Gmail Import</span><span>Documents</span><span>Profile</span></aside>
        <main><h2>Gmail attachments</h2><div class="connected">Connected: test.remindocr@example.com</div>
          <div class="mail"><b>Inspection report 18229</b><span>sender@example.com · Aug 26, 2026</span><em>inspection-report-18229.pdf</em><button>Import selected</button></div>
          <div class="mail"><b>Invoice 40710</b><span>billing@example.com · Aug 25, 2026</span><em>invoice-40710.pdf</em><button class="secondary">Preview</button></div>
        </main>
      </section>`,
    document: `
      <section class="app">
        <aside><b>RemindOCR</b><span>Gmail Import</span><span class="active">Documents</span><span>Reminders</span></aside>
        <main><h2>inspection-report-18229.pdf</h2><div class="docgrid"><div><label>Status</label><b>Processed</b></div><div><label>Client</label><b>A. Derech Ramla Ltd.</b></div><div><label>Report No.</label><b>18229.484590</b></div><div><label>Expiration</label><b>March 14, 2027</b></div></div></main>
      </section>`,
    drive: `
      <section class="app">
        <aside><b>RemindOCR</b><span>Documents</span><span class="active">Profile</span><span>Settings</span></aside>
        <main><h2>Google Drive sync</h2><div class="state"><b>Sync enabled</b><p>RemindOCR folder in My Drive</p><div class="folders"><span>RemindOCR</span><span>Inspection Reports</span><span>Invoices</span></div><button>Open Drive folder</button></div></main>
      </section>`,
    disconnect: `
      <section class="app">
        <aside><b>RemindOCR</b><span class="active">Gmail Import</span><span>Profile</span><span>Account</span></aside>
        <main><h2>Gmail connection</h2><div class="state warning"><b>User controls access</b><p>Disconnect Gmail in RemindOCR, or revoke access from Google Account permissions.</p><button>Disconnect Gmail</button></div></main>
      </section>`,
    closing: `
      <section class="closing">
        <h2>RemindOCR uses Google data only for user-facing import and sync.</h2>
        <div class="flow"><span>Sign in</span><span>Connect Gmail</span><span>Import selected files</span><span>Sync to Drive</span><span>Disconnect</span></div>
      </section>`,
  };
  return bodies[visual];
}

function htmlForScene(scene, index) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; width: 1920px; height: 1080px; font-family: "Segoe UI", Arial, sans-serif; background: #eef7f3; color: #13231e; }
  .frame { width: 100%; height: 100%; padding: 70px 92px; background: radial-gradient(circle at 12% 15%, #ffffff 0 18%, transparent 28%), linear-gradient(135deg, #f5fbf8 0%, #e8f4ef 48%, #f9fbff 100%); }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 36px; }
  h1 { margin: 0; font-size: 74px; line-height: 1.02; letter-spacing: 0; color: #16352b; }
  .eyebrow { color: #18735c; font-weight: 800; text-transform: uppercase; font-size: 26px; letter-spacing: .06em; }
  .badge { border: 2px solid #b9ded1; color: #176d58; padding: 12px 18px; border-radius: 999px; font-size: 24px; font-weight: 700; }
  .stage { height: 760px; display: grid; grid-template-columns: 1.03fr .78fr; gap: 48px; align-items: stretch; }
  .panel { background: rgba(255,255,255,.92); border: 2px solid #c8e2d8; box-shadow: 0 24px 60px rgba(25,70,55,.12); border-radius: 22px; overflow: hidden; }
  .narration { padding: 42px 46px; display: flex; flex-direction: column; justify-content: center; }
  .narration p { font-size: 35px; line-height: 1.42; margin: 0; color: #233832; }
  .browser, .app, .consent, .closing { height: 100%; background: #fff; }
  .bar { height: 62px; display: flex; align-items: center; gap: 12px; padding: 0 20px; border-bottom: 1px solid #d9e7e1; background: #f6faf8; }
  .bar span { width: 16px; height: 16px; border-radius: 50%; background: #83cab4; }
  .bar b { margin-left: 18px; color: #4c645d; font-size: 18px; }
  .hero { height: calc(100% - 62px); padding: 70px; display: flex; flex-direction: column; justify-content: space-between; }
  .logo { width: 112px; height: 112px; object-fit: contain; margin-bottom: 28px; }
  h2 { font-size: 48px; margin: 0 0 18px; color: #132f27; }
  p { font-size: 25px; line-height: 1.38; margin: 0; color: #516660; }
  .links, .flow, .folders { display: flex; gap: 14px; flex-wrap: wrap; }
  .links span, .flow span, .folders span { background: #e8f7f1; border: 1px solid #acd8c9; color: #176d58; padding: 14px 18px; border-radius: 10px; font-size: 22px; font-weight: 700; }
  .app { display: grid; grid-template-columns: 240px 1fr; }
  aside { background: #122d25; color: #d9fff1; padding: 36px 26px; display: flex; flex-direction: column; gap: 20px; font-size: 22px; }
  aside b { font-size: 30px; margin-bottom: 16px; }
  aside span { padding: 13px 14px; border-radius: 8px; color: #b9d8ce; }
  aside .active { background: #1f5c4b; color: #fff; }
  main { padding: 58px 64px; }
  .center { display: grid; place-items: center; }
  .login, .state, .mail, .docgrid div, .scope { border: 2px solid #d7e8e2; border-radius: 14px; padding: 28px; background: #fbfefd; }
  .login { width: 480px; text-align: center; }
  button { background: #18a058; border: 0; color: #fff; border-radius: 9px; padding: 14px 24px; font-size: 22px; font-weight: 800; }
  .google { margin: 18px 0; width: 100%; background: #fff; color: #293a35; border: 2px solid #d4ded9; }
  small { display: block; color: #60756e; font-size: 20px; }
  .state b, .mail b, .scope b { display: block; font-size: 30px; margin-bottom: 12px; }
  .state button, .mail button { margin-top: 26px; }
  .warning { border-color: #efcaca; background: #fffafa; }
  .connected { color: #18735c; font-size: 22px; margin-bottom: 22px; font-weight: 800; }
  .mail { margin: 18px 0; }
  .mail span, .mail em, .scope span { display: block; font-size: 21px; color: #516660; margin-top: 8px; font-style: normal; }
  .secondary, .ghost { background: #e8f7f1; color: #176d58; }
  .docgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 36px; }
  label { display: block; color: #647870; font-size: 20px; margin-bottom: 10px; }
  .docgrid b { font-size: 28px; }
  .consent { padding: 58px 72px; }
  .google-head { color: #4285f4; font-size: 34px; font-weight: 700; margin-bottom: 30px; }
  .muted { margin-bottom: 30px; }
  .scope { margin: 18px 0; }
  .actions { display: flex; justify-content: flex-end; gap: 14px; margin-top: 28px; }
  .closing { padding: 90px; display: flex; flex-direction: column; justify-content: center; }
  .closing h2 { font-size: 58px; line-height: 1.12; max-width: 980px; margin-bottom: 60px; }
  .footer { position: absolute; bottom: 34px; left: 92px; right: 92px; display: flex; justify-content: space-between; color: #60756e; font-size: 20px; }
</style>
</head>
<body>
  <div class="frame">
    <header>
      <div><div class="eyebrow">${escapeHtml(scene.eyebrow)}</div><h1>${escapeHtml(scene.title)}</h1></div>
      <div class="badge">Google OAuth demo</div>
    </header>
    <div class="stage">
      <div class="panel">${sceneBody(scene.visual)}</div>
      <div class="panel narration"><p>${escapeHtml(scene.narration)}</p></div>
    </div>
    <div class="footer"><span>RemindOCR Google OAuth verification</span><span>${index + 1} / ${scenes.length}</span></div>
  </div>
</body>
</html>`;
}

async function synthesize(scene, wavPath) {
  const textPath = join(workDir, `${scene.key}.txt`);
  await writeFile(textPath, scene.narration, "utf8");
  const filterPath = textPath.replaceAll("\\", "/").replace(":", "\\:");
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `flite=textfile='${filterPath}':voice=slt`,
    "-ar",
    "44100",
    "-ac",
    "2",
    wavPath,
  ]);
}

async function durationSeconds(file) {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Math.max(Number.parseFloat(stdout.trim()) || 4, 4);
}

async function main() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  const concatLines = [];
  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    const htmlPath = join(workDir, `${scene.key}.html`);
    const pngPath = join(workDir, `${scene.key}.png`);
    const wavPath = join(workDir, `${scene.key}.wav`);
    const mp4Path = join(workDir, `${scene.key}.mp4`);

    await writeFile(htmlPath, htmlForScene(scene, i), "utf8");
    await page.goto(pathToFileURL(htmlPath).href);
    await page.screenshot({ path: pngPath, fullPage: false });
    if (i === 0) await copyFile(pngPath, poster);

    await synthesize(scene, wavPath);
    const duration = (await durationSeconds(wavPath)) + 0.35;
    await run("ffmpeg", [
      "-y",
      "-loop",
      "1",
      "-i",
      pngPath,
      "-i",
      wavPath,
      "-t",
      String(duration),
      "-vf",
      "scale=1920:1080,format=yuv420p",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      mp4Path,
    ]);
    concatLines.push(`file '${mp4Path.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`);
  }

  await browser.close();

  const concatPath = join(workDir, "concat.txt");
  await writeFile(concatPath, concatLines.join("\n"), "utf8");
  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-c",
    "copy",
    finalVideo,
  ]);

  const { size } = await stat(finalVideo);
  if (!existsSync(finalVideo) || size < 1024 * 100) {
    throw new Error("Video export failed or produced an unexpectedly small file.");
  }
  console.log(finalVideo);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
