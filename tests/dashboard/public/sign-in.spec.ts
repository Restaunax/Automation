import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { apiLogin, adminCreateUser } from "../../../utils/apiHelper";
import {
  generateUserEmail,
  recordUserForCleanup,
} from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const TEST_USER_PASSWORD = "AutoTest123!@#";

/**
 * Public — Sign in.
 */
test.describe("Public — Sign in", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Public Sign In");
    await allure.label("severity", "critical");
  });

  test("TC-59: valid credentials reach the dashboard", async ({
    signInPage,
    page,
  }) => {
    // Arrange + Act
    await signInPage.loginAndWait(OWNER_EMAIL, OWNER_PASSWORD);
    // Assert
    await expect(page).not.toHaveURL(/\/sign-in/);
  });

  test("TC-60: invalid credentials show an error", async ({ signInPage }) => {
    // Deliberately failing a login every run against the shared QA owner
    // account risks lockout/rate-limiting of the account the whole suite
    // depends on — seed a throwaway user and fail against that instead.
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD needed to seed a throwaway user"
    );
    const adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD))
      .accessToken;
    const email = generateUserEmail("badpw");
    recordUserForCleanup(email);
    await adminCreateUser(adminToken, {
      firstName: "Auto",
      lastName: "BadPassword",
      email,
      password: TEST_USER_PASSWORD,
      role: "USER",
    });

    await signInPage.goto();
    await signInPage.login(email, "definitely-wrong-password");
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
