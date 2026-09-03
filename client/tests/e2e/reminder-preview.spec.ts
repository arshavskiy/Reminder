import {expect, test} from "@playwright/test";

// ── Reminder email preview ──────────────────────────────────────────────────
//
// Regression coverage for the eye button on a linked contract card: it emits
// preview-reminder, and the page it's on has to both listen for that event and
// mount ReminderPreviewModal, or the click does nothing. That was true on
// DocumentDetailPage until it was wired up — this guards against it silently
// breaking again on any page that renders ContractCard.

async function findDocumentWithReminder(request: import("@playwright/test").APIRequestContext) {
  const res = await request.get("/api/reminders?limit=200");
  expect(res.ok()).toBeTruthy();
  const {rows} = (await res.json()) as { rows: Array<{ document_id?: string | null }> };
  return rows.find((r) => r.document_id)?.document_id ?? null;
}

test("reminder email preview opens from the document detail page", async ({page, request}) => {
  const documentId = await findDocumentWithReminder(request);
  test.skip(!documentId, "No reminder with a linked document in this account — nothing to click through.");

  await page.goto(`/documents/${documentId}`);
  await expect(page.locator(".linked-contracts")).toBeVisible({timeout: 10_000});

  const previewBtn = page.locator(".linked-contracts button[title=\"תצוגת תזכורת\"]").first();
  await expect(previewBtn).toBeVisible();
  await previewBtn.click();

  const modal = page.locator(".reminder-preview-modal");
  await expect(modal).toBeVisible();

  // Either the email renders, or the modal surfaces a real error — never silence.
  await expect(
    modal.locator(".reminder-preview__frame, .reminder-preview__alert")
  ).toBeVisible({timeout: 10_000});
  await expect(modal.locator(".reminder-preview__alert")).not.toBeVisible();
});
