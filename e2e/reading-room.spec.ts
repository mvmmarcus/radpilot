import { expect, test } from "@playwright/test";

const DEMO_EMAIL = "radiologist@radpilot.test";
const DEMO_PASSWORD = "radpilot-demo";

// Study 2 (supabase/seed.sql): CT chest, incidental right lung nodule in a
// heavy smoker -> demos streaming generation, a Fleischner-guideline copilot
// suggestion, sign and FHIR export.
const STUDY_2_ACCESSION = "RP26000002";

test("login, open study 2, generate a draft, resolve a copilot issue, sign, export FHIR", async ({ page }) => {
  // 1. Log in.
  await page.goto("/login");
  await page.getByLabel("Email").fill(DEMO_EMAIL);
  await page.getByLabel("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/worklist/);

  // 2. Open study 2 from the worklist.
  await page.getByRole("link", { name: `Open study ${STUDY_2_ACCESSION}` }).click();
  await expect(page).toHaveURL(/\/studies\/.+/);

  // 3. Generate a draft from shorthand.
  const shorthandInput = page.getByPlaceholder(/RLL 8mm solid nodule/i);
  await shorthandInput.fill("RLL 8mm solid nodule, no effusion, no consolidation");
  await page.getByRole("button", { name: "Generate draft" }).click();

  // Streaming finishes once the badge for a pending AI section appears, then
  // is accepted (or the button becomes available again).
  await expect(page.getByText(/pending review/i).first()).toBeVisible({ timeout: 20_000 });

  // 4. Accept the AI-generated sections so signing is not blocked by pending review.
  const acceptButtons = page.getByRole("button", { name: "Accept" });
  while ((await acceptButtons.count()) > 0) {
    await acceptButtons.first().click();
  }

  // 5. Resolve (fix or dismiss) any copilot issue raised for the nodule finding.
  const copilotPanel = page.locator('[data-slot="copilot-panel"]');
  await expect(copilotPanel).toBeVisible();
  const fixButton = copilotPanel.getByRole("button", { name: "Fix" }).first();
  const dismissButton = copilotPanel.getByRole("button", { name: "Dismiss" }).first();
  if (await fixButton.isVisible().catch(() => false)) {
    await fixButton.click();
  } else if (await dismissButton.isVisible().catch(() => false)) {
    await dismissButton.click();
  }

  // 6. Sign.
  const signButton = page.getByRole("button", { name: /^Sign$/ });
  await expect(signButton).toBeEnabled({ timeout: 10_000 });
  await signButton.click();
  await expect(page.getByText(/report signed/i)).toBeVisible({ timeout: 10_000 });

  // 7. Export FHIR: the link appears once the report is final, and opens the
  // export route in a new tab.
  const [fhirPage] = await Promise.all([
    page.waitForEvent("popup"),
    page.getByRole("link", { name: "Export FHIR" }).click(),
  ]);
  await fhirPage.waitForLoadState();
  expect(fhirPage.url()).toMatch(/\/api\/fhir\/DiagnosticReport\//);
});
