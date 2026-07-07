import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { getMe, apiLogin } from "../../../utils/apiHelper";
import {
  generateUserEmail,
  recordUserForCleanup,
  ACCOUNT_EMAILS_ENABLED,
} from "../../../utils/testData";

const PASSWORD = "AutoTest123!@#";

test.describe("Public — Sign up", () => {
  test.beforeEach(async () => {
    await allure.label("feature", "Public Sign Up");
    await allure.label("severity", "critical");
  });

  test("TC-93: a visitor can register a new account", async ({
    signUpPage,
    page,
  }) => {
    test.skip(
      !ACCOUNT_EMAILS_ENABLED,
      "Account emails held (Mailtrap quota) — sign-up sends mail; set SEND_ACCOUNT_EMAILS=true"
    );
    await allure.description(
      "Filling the sign-up form and submitting redirects off /sign-up to the dashboard home. A fresh " +
        "self-serve account is role USER (with only VIEW_RESTAURANT) — it does not become OWNER until " +
        "the account creates a restaurant."
    );

    const email = generateUserEmail("signup");
    recordUserForCleanup(email);

    await allure.step("Navigate and fill the sign-up form", async () => {
      await signUpPage.goto();
      await signUpPage.fillForm({
        firstName: "Auto",
        lastName: "Signup",
        email,
        password: PASSWORD,
        confirmPassword: PASSWORD,
      });
      await allure.parameter("email", email);
    });

    await allure.step("Submit and verify redirect off /sign-up", async () => {
      await signUpPage.submit();
      await signUpPage.waitForSuccess();
      await expect(page).not.toHaveURL(/\/sign-up/);
    });

    await allure.step("Verify the new account's role via the API", async () => {
      const { accessToken } = await apiLogin(email, PASSWORD);
      const me = await getMe(accessToken);
      expect(me.role).toBe("USER");
      await allure.parameter("role", me.role);
    });
  });

  test("TC-94: registering with an already-used email is rejected", async ({
    signUpPage,
  }) => {
    // Registers a real account once (sends mail) before retrying the duplicate.
    test.skip(
      !ACCOUNT_EMAILS_ENABLED,
      "Account emails held (Mailtrap quota) — set SEND_ACCOUNT_EMAILS=true"
    );
    await allure.description(
      "Submitting the sign-up form with an email that already has an account shows an error banner " +
        "and keeps the visitor on /sign-up."
    );

    const email = generateUserEmail("dupsignup");
    recordUserForCleanup(email);

    await allure.step("Register the email once", async () => {
      await signUpPage.fillAndSubmit({
        firstName: "Auto",
        lastName: "Original",
        email,
        password: PASSWORD,
        confirmPassword: PASSWORD,
      });
      await signUpPage.waitForSuccess();
    });

    await allure.step("Attempt to register the same email again", async () => {
      await signUpPage.goto();
      await signUpPage.fillForm({
        firstName: "Auto",
        lastName: "Duplicate",
        email,
        password: PASSWORD,
        confirmPassword: PASSWORD,
      });
      await signUpPage.submit();
    });

    await allure.step("Verify the duplicate-email error", async () => {
      await signUpPage.assertRegisterError();
    });
  });

  test("TC-95: a mismatched confirm-password blocks submission", async ({
    signUpPage,
  }) => {
    await allure.description(
      "Filling password/confirmPassword with different values shows an inline 'Passwords must match' " +
        "error on blur (client-side validation; submit is never attempted here)."
    );

    await allure.step("Fill the form with mismatched passwords", async () => {
      await signUpPage.goto();
      await signUpPage.fillForm({
        firstName: "Auto",
        lastName: "Mismatch",
        email: generateUserEmail("mismatch"),
        password: PASSWORD,
        confirmPassword: "Different123!@#",
      });
      await signUpPage.confirmPasswordInput.press("Tab");
    });

    await allure.step(
      "Verify the inline error and no registration",
      async () => {
        await signUpPage.assertFieldError("Passwords must match");
      }
    );
  });

  test("TC-96: a weak password is rejected client-side", async ({
    signUpPage,
  }) => {
    await allure.description(
      "A password under 8 characters shows an inline validation error on blur " +
        "(client-side validation; submit is never attempted here)."
    );

    await allure.step("Fill the form with a weak password", async () => {
      await signUpPage.goto();
      await signUpPage.fillForm({
        firstName: "Auto",
        lastName: "Weak",
        email: generateUserEmail("weak"),
        password: "weak",
        confirmPassword: "weak",
      });
      await signUpPage.passwordInput.press("Tab");
    });

    await allure.step("Verify the inline password-length error", async () => {
      await signUpPage.assertFieldError(
        "Password must be at least 8 characters"
      );
    });
  });
});
