import { expect, test } from "@playwright/test";

const DEMO_EMAIL = "radiologist@radpilot.test";
const DEMO_PASSWORD = "radpilot-demo";

test("log in, see STAT studies first, and claim one", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/worklist/);

  const rows = page.locator("table tbody tr");
  await expect(rows.first()).toBeVisible();

  // The worklist is sorted by compareWorklistOrder: STAT studies first. The
  // seeded data (docs/sessions.md Session 0b) has multiple STAT studies, so
  // the very first row must show the STAT badge.
  await expect(rows.first().getByText("STAT", { exact: true })).toBeVisible();

  // Claim the first unassigned study and confirm the row now offers Release
  // instead of Claim (claim succeeded and the worklist re-rendered).
  const claimButton = rows.first().getByRole("button", { name: "Claim" });
  await claimButton.click();

  await expect(rows.first().getByRole("button", { name: "Release" })).toBeVisible();
});
