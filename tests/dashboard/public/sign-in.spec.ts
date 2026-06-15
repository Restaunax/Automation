import { test, expect } from "../../../fixtures/base";

/**
 * Public — Sign in.
 *
 * SCAFFOLD: test.fixme placeholders define the structure + intent without
 * running (they show as skipped). To make real: rename fixme→test, fill the
 * Arrange-Act-Assert body, and add allure labels — see the worked example in
 * tests/dashboard/admin/demo/01-demo-management.spec.ts and TEST_PLAN.md.
 */
test.describe("Public — Sign in", () => {
  test.fixme("TC-XXX: valid credentials reach the dashboard", async ({ signInPage, page }) => {
    // Arrange + Act
    await signInPage.loginAndWait(process.env.OWNER_EMAIL ?? "", process.env.OWNER_PASSWORD ?? "");
    // Assert
    await expect(page).not.toHaveURL(/\/sign-in/);
  });

  test.fixme("TC-XXX: invalid credentials show an error", async ({ signInPage }) => {
    await signInPage.goto();
    // TODO: submit bad credentials and assert an error message is shown
  });
});
