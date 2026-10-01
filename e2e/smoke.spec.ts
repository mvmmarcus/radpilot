import { expect, test } from "@playwright/test";

test("signed-out visitors are redirected to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Sign in to RadPilot")).toBeVisible();
});
