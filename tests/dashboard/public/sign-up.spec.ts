import { test } from "../../../fixtures/base";

/**
 * Public — Sign up.
 *
 * SCAFFOLD placeholder. TODO: add a SignUpPage POM under pages/dashboard/auth/
 * following the factory pattern (model it on pages/dashboard/auth/SignInPage.ts).
 */
test.describe("Public — Sign up", () => {
  test.fixme("TC-XXX: a new owner can register an account", async ({
    page,
  }) => {
    await page.goto("/sign-up", { waitUntil: "domcontentloaded" });
    // TODO: fill the registration form, submit, assert success
  });
});
