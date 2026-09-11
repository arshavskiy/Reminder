import {chromium} from "../../client/node_modules/@playwright/test/index.mjs";
import {mkdir, readdir, rename, rm} from "node:fs/promises";
import {resolve} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);

const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const appUrl = arg("app-url") ?? process.env.DEMO_APP_URL ?? "http://localhost:4173";
const magicUrl = arg("magic-url") ?? process.env.DEMO_MAGIC_LINK_URL;
const recordingDate = arg("date") ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const only = arg("only") ?? "";
const outputDir = resolve("video/recordings/pages", recordingDate);
const expectedPageVideos = new Set([
    "01-dashboard.webm", "02-documents.webm", "03-document-detail.webm",
    "04-quotes.webm", "05-quote-detail.webm", "06-clients.webm",
    "07-client-detail.webm", "08-reminders.webm", "09-equipment.webm",
    "10-reports.webm", "11-profile-settings.webm", "12-search.webm",
    "13-templates.webm", "RemindOCR-site-tour.webm",
]);
if (!magicUrl) throw new Error("Set DEMO_MAGIC_LINK_URL before recording.");
await mkdir(outputDir, {recursive: true});
for (const file of await readdir(outputDir)) {
    if (file.endsWith(".webm") && (!only || file === `${only}.webm`)) await rm(resolve(outputDir, file), {force: true});
}

const browser = await chromium.launch({headless: true});
const context = await browser.newContext({viewport: {width: 1440, height: 900}, recordVideo: {dir: outputDir, size: {width: 1440, height: 900}}});
const auth = await context.newPage();
await auth.goto(magicUrl, {waitUntil: "networkidle"});
await auth.evaluate(() => localStorage.removeItem("walkthrough_completed"));
await auth.waitForTimeout(700);
const onboarding = auth.getByRole("dialog").filter({hasText: "ברוכים הבאים ל-RemindOCR"});
if (await onboarding.isVisible().catch(() => false)) await onboarding.getByRole("button", {name: "דלג על ההגדרה"}).click();
await auth.close();

async function caption(page, text) {
  await page.evaluate((value) => {
    const old = document.querySelector("#video-caption"); old?.remove();
    const el = document.createElement("div"); el.id = "video-caption"; el.textContent = value;
    Object.assign(el.style, {position:"fixed",top:"22px",left:"50%",transform:"translateX(-50%)",zIndex:"2147483647",padding:"12px 24px",borderRadius:"14px",background:"rgba(20,45,37,.92)",color:"white",font:"700 22px Arial",direction:"rtl"});
    document.body.appendChild(el);
  }, text);
    await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector("#video-caption")?.remove());
}

async function installVisibleCursor(page) {
    await page.evaluate(() => {
        document.querySelector("#video-mouse")?.remove();
        const cursor = document.createElement("div");
        cursor.id = "video-mouse";
        Object.assign(cursor.style, {
            position: "fixed",
            left: "20px",
            top: "20px",
            width: "22px",
            height: "22px",
            border: "3px solid #18a058",
            borderRadius: "50%",
            background: "rgba(255,255,255,.9)",
            boxShadow: "0 2px 8px rgba(0,0,0,.45)",
            zIndex: "2147483646",
            pointerEvents: "none",
            transform: "translate(-50%,-50%)",
            transition: "left .3s ease,top .3s ease"
        });
        document.body.appendChild(cursor);
        window.addEventListener("mousemove", (event) => {
            cursor.style.left = `${event.clientX}px`;
            cursor.style.top = `${event.clientY}px`;
        });
    });
}

async function moveTo(page, locator) {
    const box = await locator.boundingBox().catch(() => null);
    if (!box) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 12});
    await page.waitForTimeout(350);
}

async function visualClick(page, locator) {
    await moveTo(page, locator);
    await locator.click();
}

async function trimPageVideo(target) {
    const trimmed = target.replace(/\.webm$/, ".trimmed.webm");
    try {
        await execFileAsync("ffmpeg", ["-y", "-i", target, "-t", "15", "-c", "copy", trimmed]);
        await rm(target, {force: true});
        await rename(trimmed, target);
    } catch (error) {
        await rm(trimmed, {force: true});
        console.warn(`[record] Could not trim ${target} to 15 seconds: ${error instanceof Error ? error.message : error}`);
    }
}

async function advanceWalkthrough(page, deadline) {
    const button = page.locator(".wt-btn--primary");
    await button.waitFor({state: "visible", timeout: 1200}).catch(() => {
    });
    let steps = 0;
    while (await button.isVisible().catch(() => false)) {
        const remaining = deadline - Date.now();
        if (remaining < 800) break;
        await page.waitForTimeout(Math.min(3000, Math.max(0, remaining - 500)));
        if (Date.now() >= deadline || !(await button.isVisible().catch(() => false))) break;
        await visualClick(page, button);
        steps += 1;
        if (steps >= 4) break;
    }
    const close = page.locator(".wt-tooltip__close");
    if (await close.isVisible().catch(() => false)) await close.click();
    return steps;
}

async function scrollIfNeeded(page, deadline) {
    const canScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 80);
    if (!canScroll || deadline - Date.now() < 3500) return;
    await page.mouse.move(1390, 760, {steps: 12});
    await page.mouse.wheel(0, 650);
    await page.waitForTimeout(Math.min(3000, deadline - Date.now()));
}

function loadedSelectorForRoute(route) {
    if (route === "/documents") return ".document-table-row, .documents-empty";
    if (/^\/documents\/.+/.test(route)) return ".doc-detail__grid";
    if (route === "/quotes") return ".quote-row, .quotes-empty";
    if (/^\/quotes\/.+/.test(route)) return ".quote-detail__grid";
    if (route === "/clients") return ".clients-row, .clients-empty";
    if (/^\/clients\/.+/.test(route)) return ".client-detail .details-card";
    if (route.startsWith("/equipment")) return ".equipment-page, .equipment-list, .equipment-grid";
    if (route.startsWith("/reminders")) return ".reminders-page, .reminders-table, .reminder-list";
    if (route.startsWith("/reports")) return ".reports-page, .reports-layout, .report-card";
    return "main, .page, .content";
}

async function waitForEverythingLoaded(page, route) {
    await page.waitForLoadState("networkidle", {timeout: 15000}).catch(() => {
    });
    await page.locator(loadedSelectorForRoute(route)).first().waitFor({state: "visible", timeout: 15000}).catch(() => {
    });
    await page.waitForFunction(() => {
        const visible = (element) => {
            const style = getComputedStyle(element);
            const box = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
        };
        return ![...document.querySelectorAll(".n-spin--show, .n-spin-body[aria-busy='true'], [aria-busy='true']")].some(visible);
    }, {timeout: 15000}).catch(() => {
    });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("remindocr:everything-loaded")));
    await page.waitForTimeout(3000);
}

async function findDashboardReminders(page, deadline) {
    const calendar = page.locator(".rcal");
    if (!(await calendar.isVisible().catch(() => false))) return;
    const calendarPreference = page.locator(".calendar-pref .n-switch");
    if (await calendarPreference.isVisible().catch(() => false) && await calendarPreference.getAttribute("aria-checked") !== "true") {
        await visualClick(page, calendarPreference);
        await page.waitForTimeout(700);
    }
    await calendar.scrollIntoViewIfNeeded();
    const nextMonth = page.locator(".rcal__nav-btn").nth(1);
    for (let month = 0; month < 12 && deadline - Date.now() > 1200; month += 1) {
        const reminders = page.locator(".rcal__pill:visible");
        if (await reminders.count()) {
            await moveTo(page, reminders.first());
            await page.waitForTimeout(Math.min(1200, deadline - Date.now()));
            const showAll = page.locator(".rcal__cell:has(.rcal__pill:visible) .rcal__cell-all").first();
            if (await showAll.isVisible().catch(() => false)) {
                await visualClick(page, showAll);
                const modalRow = page.locator(".rcal__day-modal .rcal__day-row").first();
                await modalRow.waitFor({state: "visible", timeout: 1500}).catch(() => {
                });
                if (await modalRow.isVisible().catch(() => false)) {
                    await moveTo(page, modalRow);
                    await page.waitForTimeout(Math.min(3000, Math.max(0, deadline - Date.now())));
                }
            }
            return;
        }
        const box = await nextMonth.boundingBox().catch(() => null);
        if (!box) return;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps: 6});
        await nextMonth.click();
        await page.waitForTimeout(180);
    }
}

const navLabelForRoute = (route) => {
    if (route.startsWith("/documents") || route.startsWith("/quotes")) return "תסקירים";
    if (route.startsWith("/clients")) return "לקוחות";
    if (route.startsWith("/reminders")) return "תזכורות";
    if (route.startsWith("/equipment")) return "ציוד";
    if (route.startsWith("/reports")) return "דוחות";
    return "ראשי";
};

async function navigateFromDashboard(page, route) {
    if (route === "/dashboard") return;
    const intermediateTour = route.startsWith("/documents/") || route.startsWith("/quotes")
        ? "documents"
        : route.startsWith("/clients/") ? "clients" : "";
    if (intermediateTour) {
        await page.evaluate((tourId) => {
            const key = "walkthrough_completed";
            let completed = [];
            try {
                completed = JSON.parse(localStorage.getItem(key) || "[]");
            } catch {
            }
            if (!completed.includes(tourId)) localStorage.setItem(key, JSON.stringify([...completed, tourId]));
        }, intermediateTour);
    }
    const navLabel = navLabelForRoute(route);
    const navLink = page.locator(".appbar__nav .navlink").filter({hasText: navLabel}).first();
    if (await navLink.isVisible().catch(() => false)) {
        await visualClick(page, navLink);
        await page.waitForTimeout(500);
    }
    if (route.startsWith("/documents/")) {
        await waitForEverythingLoaded(page, "/documents");
        await visualClick(page, page.locator(".document-table-row").first());
    } else if (route.startsWith("/quotes")) {
        await waitForEverythingLoaded(page, "/documents");
        await visualClick(page, page.locator(".documents-workspace-tabs a").filter({hasText: "הצעות מחיר"}).first());
        if (route.startsWith("/quotes/")) {
            await waitForEverythingLoaded(page, "/quotes");
            await visualClick(page, page.locator(".quote-row").first());
        }
    } else if (route.startsWith("/clients/")) {
        await waitForEverythingLoaded(page, "/clients");
        await visualClick(page, page.locator(".clients-row").first());
    } else {
        const current = `${new URL(page.url()).pathname}${new URL(page.url()).search}`;
        if (current !== route) {
            await page.goto(`${appUrl}${route}`, {waitUntil: "domcontentloaded"});
            await installVisibleCursor(page);
        }
    }
    await waitForEverythingLoaded(page, route);
}
async function record(name, route, title, action) {
  const page = await context.newPage(); const video = page.video();
    await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
    await installVisibleCursor(page);
    await page.waitForTimeout(500);
    await navigateFromDashboard(page, route);
    const deadline = Date.now() + 15000;
    await page.waitForTimeout(850);
  await caption(page, title);
    if (action) await action(page, deadline);
    const walkthroughSteps = await advanceWalkthrough(page, deadline);
    if (!walkthroughSteps) await scrollIfNeeded(page, deadline);
    if (deadline - Date.now() > 0) await page.waitForTimeout(Math.min(700, deadline - Date.now()));
    const raw = await video.path();
    await page.close();
    const target = resolve(outputDir, `${name}.webm`);
    await rm(target, {force: true});
    await rename(raw, target);
    await trimPageVideo(target);
}

const ids = await (async () => {
  const page = await context.newPage();
  await page.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
    const result = await page.evaluate(async () => {
        const readJson = async (url) => {
            const response = await fetch(url, {credentials: "include"});
            if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return {};
            return response.json();
        };
        const [documents, clients, quotes] = await Promise.all([
            readJson("/api/documents?limit=1"),
            readJson("/api/clients?limit=1"),
            readJson("/api/payment-requests/"),
        ]);
        const quoteRows = Array.isArray(quotes) ? quotes : quotes.rows ?? [];
        return {
            documentId: documents.rows?.[0]?.id ?? documents.rows?.[0]?._id ?? "",
            clientId: clients.rows?.[0]?.id ?? clients.rows?.[0]?._id ?? "",
            quoteId: quoteRows[0]?._id ?? quoteRows[0]?.id ?? "",
        };
    });
    await page.close();
    return Object.fromEntries(Object.entries(result).map(([key, value]) => [key, String(value ?? "")]));
})();

const recordIfSelected = (name, route, title, action) => (!only || only === name) ? record(name, route, title, action) : Promise.resolve();
await recordIfSelected("01-dashboard", "/dashboard", "דשבורד — מסמכים, לקוחות ותזכורות במקום אחד", findDashboardReminders);
await recordIfSelected("02-documents", "/documents", "תסקירים — מסמכים לאחר OCR וחילוץ AI");
await recordIfSelected("03-document-detail", ids.documentId ? `/documents/${ids.documentId}` : "/documents", "פרטי תסקיר — המידע שחולץ מהקובץ");
await recordIfSelected("04-quotes", "/quotes", "הצעות מחיר — סעיפי שירות ו-PDF");
await recordIfSelected("05-quote-detail", ids.quoteId ? `/quotes/${ids.quoteId}` : "/quotes", "הצעת מחיר — פרטים ותצוגת PDF");
await recordIfSelected("06-clients", "/clients", "לקוחות — פרטי קשר, מסמכים ותסקירים");
await recordIfSelected("07-client-detail", ids.clientId ? `/clients/${ids.clientId}` : "/clients", "כרטיס לקוח — תסקירים, ציוד ותזכורות");
await recordIfSelected("08-reminders", "/reminders", "תזכורות — בדיקות קרובות ומעקב");
await recordIfSelected("09-equipment", "/equipment", "ציוד — מכונות והיסטוריית בדיקות");
await recordIfSelected("10-reports", "/reports", "דוחות — הורדה ושליחה במייל");
await recordIfSelected("11-profile-settings", "/profile?section=personal", "פרופיל והגדרות — לוגו, חתימה ומיתוג");
await recordIfSelected("12-search", "/search", "חיפוש — איתור תסקירים ולקוחות");
await recordIfSelected("13-templates", "/print-templates", "תבניות — יצירת מסמכי PDF מקצועיים");

if (!only || only === "RemindOCR-site-tour") {
const tour = await context.newPage(); const tourVideo = tour.video();
    await tour.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
    await installVisibleCursor(tour);
    await caption(tour, "דשבורד");
    await findDashboardReminders(tour, Date.now() + 15000);
    for (const [route, title] of [["/documents", "תסקירים"], ["/quotes", "הצעות מחיר"], ["/clients", "לקוחות"], ["/reminders", "תזכורות"], ["/equipment", "ציוד"], ["/reports", "דוחות"], ["/profile?section=personal", "פרופיל והגדרות"], ["/search", "חיפוש"], ["/print-templates", "תבניות"]]) {
        await tour.goto(`${appUrl}/dashboard`, {waitUntil: "networkidle"});
        await installVisibleCursor(tour);
        await tour.evaluate(() => localStorage.removeItem("walkthrough_completed"));
        await navigateFromDashboard(tour, route);
        await tour.waitForTimeout(850);
        await caption(tour, title);
        const segmentDeadline = Date.now() + 14500;
        const steps = await advanceWalkthrough(tour, segmentDeadline);
        if (!steps) await scrollIfNeeded(tour, segmentDeadline);
}
    const tourRaw = await tourVideo.path();
    await tour.close();
    const tourTarget = resolve(outputDir, "RemindOCR-site-tour.webm");
    await rm(tourTarget, {force: true});
    await rename(tourRaw, tourTarget);
}
await context.close(); await browser.close();
for (const file of await readdir(outputDir)) {
    if (file.endsWith(".webm") && !expectedPageVideos.has(file)) {
        await rm(resolve(outputDir, file), {force: true});
    }
}
console.log(outputDir);
