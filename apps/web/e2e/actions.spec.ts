import { test, expect } from "@playwright/test";

test.describe("Daily Cash Actions", () => {
  test("golden path: actions render with evidence and draft", async ({ page }) => {
    await page.goto("/actions");
    // Page loads with title
    await expect(page.locator("h1")).toHaveText("Daily Cash Actions");
    // Forecast summary renders
    await expect(page.getByTestId("forecast-summary")).toBeVisible();
    // At least one action row
    const rows = page.getByTestId("action-row");
    await expect(rows.first()).toBeVisible();
    // Priority chip visible
    await expect(page.getByTestId("priority-chip").first()).toBeVisible();
    // Evidence trigger present
    await expect(page.getByTestId("evidence-trigger").first()).toBeVisible();
    // Click evidence and verify drawer opens
    await page.getByTestId("evidence-trigger").first().click();
    await expect(page.getByTestId("evidence-drawer")).toBeVisible();
    // Draft preview trigger
    await expect(page.getByTestId("draft-preview-trigger").first()).toBeVisible();
  });

  test("approval-required path: request approval button present", async ({ page }) => {
    await page.goto("/actions");
    // All actions should have "Request approval" button (no approval yet)
    const approvalBtns = page.getByTestId("request-approval-btn");
    await expect(approvalBtns.first()).toBeVisible();
  });

  test("failure path: no payment initiation button exists anywhere", async ({ page }) => {
    await page.goto("/actions");
    // Search for any button with payment-related text
    const allButtons = await page.locator("button").allTextContents();
    for (const text of allButtons) {
      const lower = text.toLowerCase();
      expect(lower).not.toContain("initiate payment");
      expect(lower).not.toContain("send payment");
      expect(lower).not.toContain("transfer funds");
    }
  });
});
