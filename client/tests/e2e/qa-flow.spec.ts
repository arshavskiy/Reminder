import {expect, type Page, test} from "@playwright/test";

// ── helpers ──────────────────────────────────────────────────────────────────

async function fillNInput(page: Page, placeholder: string, value: string) {
  await page.locator(`input[placeholder="${placeholder}"]`).fill(value);
}

// ── 1. Auth ───────────────────────────────────────────────────────────────────

test("redirects unauthenticated users to /login", async ({ browser }) => {
  const ctx = await browser.newContext(); // no storageState
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await ctx.close();
});

test("dashboard loads after login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  // Hebrew greeting present
  await expect(page.locator(".dash__greet")).toContainText(/טוב/);
});

// ── 2. Clients ────────────────────────────────────────────────────────────────

test("create and delete a client", async ({ page }) => {
  await page.goto("/clients");
  await expect(page.locator("h1")).toContainText("לקוחות");

  // Open create modal
  await page.getByRole("button", { name: /לקוח חדש/ }).click();
  await expect(page.locator(".n-modal-container")).toBeVisible();

  // Fill form
  await fillNInput(page, "שם העסק", "QA Test Client");
  await fillNInput(page, "אימייל", "qa-test@example.com");

  // Save
  await page.getByRole("button", { name: "צור" }).click();
  await expect(page.locator(".n-message")).toContainText("נוצר");

  // Verify row appears
  await expect(page.getByText("QA Test Client")).toBeVisible();

  // Delete via kebab menu
  await page.getByText("QA Test Client").hover();
  await page.locator(".kebab-btn").first().click();
  await page.getByRole("menuitem", { name: /מחק/ }).click();
  await page.getByRole("button", { name: "מחק" }).click();
  await expect(page.getByText("QA Test Client")).not.toBeVisible();
});

// ── 3. Contracts / reminders ──────────────────────────────────────────────────

test("create a contract and add a reminder", async ({ page }) => {
  await page.goto("/contracts");
  await expect(page.locator("h1")).toContainText("תסקירים");

  // Create contract
  await page.getByRole("button", { name: /תסקיר חדש/ }).click();
  await fillNInput(page, "לדוגמה: 15935", "QA-99999");

  // Pick first client from n-select
  await page.locator(".n-base-selection").first().click();
  await page.locator(".n-base-select-option").first().click();

  await page.getByRole("button", { name: "צור" }).click();
  await expect(page.locator(".n-message")).toContainText("נוצרה");

  // Find the new card
  const card = page.locator(".card", { hasText: "QA-99999" });
  await expect(card).toBeVisible();

  // Open add-reminder modal
  await card.getByRole("button", { name: "+ תזכורת חדשה" }).click();
  const modal = page.locator(".n-modal-container");
  await expect(modal).toBeVisible();

  // Confirm email pre-filled or fill it
  const emailInput = modal.locator("input").filter({ hasText: "" }).nth(1);
  // Set trigger date
  await modal.locator(".n-date-picker input").fill("2026-07-01");
  await page.keyboard.press("Escape"); // close date picker popup

  // Save
  await modal.getByRole("button", { name: "צור תזכורת" }).click();
  await expect(page.locator(".n-message")).toContainText("נוצרה");

  // Reminder row should appear on card
  await expect(card.locator(".reminder-row")).toBeVisible();
  await expect(card.locator(".rbadge--pending")).toBeVisible();
});

test("send a pending reminder", async ({ page }) => {
  await page.goto("/contracts");

  // Find first card that has a pending reminder
  const sendBtn = page.locator(".btn--xs", { hasText: "📤 שלח" }).first();
  await expect(sendBtn).toBeVisible({ timeout: 10_000 });

  await sendBtn.click();
  await expect(page.locator(".n-message")).toContainText("נשלחה");
});

// ── 4. Smoke: navigate all main routes ───────────────────────────────────────

for (const [route, title] of [
  ["/documents", "מסמכים"],
  ["/clients", "לקוחות"],
  ["/contracts", "תסקירים"],
  ["/reminders", "תזכורות"],
  ["/settings", "הגדרות"],
] as const) {
  test(`smoke: ${route} loads`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("h1")).toContainText(title, { timeout: 8_000 });
  });
}