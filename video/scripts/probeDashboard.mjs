import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";
import {resolve} from "node:path";
import {appMagicUrl} from "./demoAssets.mjs";

const magicUrl = process.env.DEMO_MAGIC_LINK_URL;
const appUrl = process.env.DEMO_APP_URL ?? "http://localhost:4173";
const loginUrl = appMagicUrl(magicUrl, appUrl);
const browser = await chromium.launch({headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const magicResponse = await page.goto(loginUrl, {waitUntil: "networkidle"});
console.log("after_magic", page.url(), magicResponse?.status(), magicResponse?.headers()["set-cookie"]);
await page.waitForTimeout(1500);
console.log("cookies", (await page.context().cookies()).map((c) => ({name: c.name, domain: c.domain, path: c.path, secure: c.secure, sameSite: c.sameSite})));
await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
await page.waitForTimeout(2000);
const me = await page.evaluate(async () => {
  const response = await fetch("/api/me", {credentials: "include"});
  const text = await response.text();
  return {status: response.status, text: text.slice(0, 300)};
});
console.log("api_me", me);
const info = await page.evaluate(() => ({
  url: location.href,
  title: document.title,
  dialogs: [...document.querySelectorAll("[role=dialog]")].map((el) => el.textContent?.slice(0, 120)),
  drop: Boolean(document.querySelector(".drop-strip")),
  newContract: Boolean(document.querySelector(".dash__new-contract")),
  body: document.body.innerText.slice(0, 800),
}));
console.log(JSON.stringify(info, null, 2));
await page.screenshot({path: resolve("video/recordings/probe-dashboard.png"), fullPage: true});
await browser.close();
