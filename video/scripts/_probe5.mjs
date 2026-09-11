import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";

const b = await chromium.launch({headless: true});
const c = await b.newContext({viewport: {width: 1440, height: 900}});
const p = await c.newPage();
await p.goto(process.env.M, {waitUntil: "networkidle"});
await p.goto("http://localhost:4173/dashboard", {waitUntil: "networkidle"});
await p.waitForTimeout(2500);
const info = await p.evaluate(() => ({
    url: location.pathname,
    newInspection: [...document.querySelectorAll('button')].filter(x => /תסקיר חדש/.test(x.textContent)).length,
    allButtons: [...document.querySelectorAll('button')].map(x => x.textContent.trim().slice(0, 22)).filter(Boolean).slice(0, 14),
}));
console.log(JSON.stringify(info));
const feats = await p.evaluate(() => fetch('/api/user-settings', {credentials: 'include'}).then(r => r.json()).catch(e => ({err: String(e)})));
console.log("FEATURES=" + JSON.stringify(feats.features || feats).slice(0, 300));
await b.close();
