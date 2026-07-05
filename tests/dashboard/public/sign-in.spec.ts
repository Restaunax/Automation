import { test, expect } from "../../../fixtures/base";

/**
 * Public — Sign in.
 */
test.describe("Public — Sign in", () => {
  test("TC-59: valid credentials reach the dashboard", async ({
    signInPage,
    page,
  }) => {
    // Arrange + Act
    await signInPage.loginAndWait(
      process.env.OWNER_EMAIL ?? "",
      process.env.OWNER_PASSWORD ?? ""
    );
    // Assert
    await expect(page).not.toHaveURL(/\/sign-in/);
  });

  test("TC-60: invalid credentials show an error", async ({ signInPage }) => {
    await signInPage.goto();
    await signInPage.login(
      process.env.OWNER_EMAIL ?? "",
      "definitely-wrong-password"
    );
    await signInPage.assertLoginError();
  });

  test("TC-61: unknown email shows an error", async ({ signInPage }) => {
    await signInPage.goto();
    await signInPage.login(
      "no-such-user@restaunax-test.com",
      "whatever-password"
    );
    await signInPage.assertLoginError();
  });
});
