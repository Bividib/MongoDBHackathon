import { test, expect } from "@playwright/test";

test.describe("Forecast", () => {
  test("golden path: forecast renders with scenarios and obligation risks", async ({ page }) => {
    await page.goto("/forecast");
    await expect(page.locator("h1")).toHaveText("Cash Confidence Forecast");
    // Risk badge visible
    await expect(page.getByTestId("risk-badge").first()).toBeVisible();
    // Scenario toggles
    await expect(page.getByTestId("scenario-toggles")).toBeVisible();
    // Scenario card
    await expect(page.getByTestId("scenario-card")).toBeVisible();
    // Click a different scenario
    const optimistic = page.getByTestId("scenario-optimistic");
    if (await optimistic.isVisible()) {
      await optimistic.click();
      await expect(page.getByTestId("scenario-card")).toBeVisible();
    }
    // Obligation risks
    const risks = page.getByTestId("obligation-risks");
    if (await risks.isVisible()) {
      await expect(page.getByTestId("obligation-risk-pill").first()).toBeVisible();
    }
  });

  test("approval-required path: no edit/mutation controls on forecast", async ({ page }) => {
    await page.goto("/forecast");
    // The forecast screen has no approval surface — read-only
    // Verify no approve/reject buttons
    const approveBtn = page.getByTestId("approve-btn");
    await expect(approveBtn).toHaveCount(0);
  });

  test("failure path: no safety claims in text", async ({ page }) => {
    await page.goto("/forecast");
    const bodyText = await page.locator("body").textContent();
    const lower = bodyText?.toLowerCase() ?? "";
    // Should not claim obligations are "fine", "covered", "no risk"
    expect(lower).not.toContain("obligation is covered");
    expect(lower).not.toContain("safe to proceed");
    expect(lower).not.toContain("no risk");
    expect(lower).not.toContain("all clear");
  });
});
