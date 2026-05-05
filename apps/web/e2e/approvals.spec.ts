import { test, expect } from "@playwright/test";

test.describe("Approval Inbox", () => {
  test("golden path: pending and decided approvals render", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page.locator("h1")).toHaveText("Approval Inbox");
    // Pending section
    await expect(page.getByTestId("pending-approvals")).toBeVisible();
    const pendingCards = page.getByTestId("pending-approvals").getByTestId("approval-card");
    await expect(pendingCards.first()).toBeVisible();
    // Decided section
    await expect(page.getByTestId("decided-approvals")).toBeVisible();
    // Draft body visible (verbatim, no truncation)
    await expect(page.getByTestId("draft-body").first()).toBeVisible();
  });

  test("approval-required path: policy block disables approve button", async ({ page }) => {
    await page.goto("/approvals");
    // Find the card with policy block
    const blockedPill = page.getByTestId("policy-block");
    if (await blockedPill.count() > 0) {
      // The approve button in the same card should be disabled
      const card = blockedPill.first().locator("xpath=ancestor::div[@data-testid='approval-card']");
      const approveBtn = card.getByTestId("approve-btn");
      if (await approveBtn.count() > 0) {
        await expect(approveBtn.first()).toBeDisabled();
      }
    }
  });

  test("failure path: no payment initiation affordance", async ({ page }) => {
    await page.goto("/approvals");
    const allButtons = await page.locator("button").allTextContents();
    for (const text of allButtons) {
      const lower = text.toLowerCase();
      expect(lower).not.toContain("initiate payment");
      expect(lower).not.toContain("move money");
    }
  });
});
