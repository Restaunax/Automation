import { type Page, expect } from "@playwright/test";

const buildLocators = (page: Page) => ({
  firstNameInput: page.locator('input[name="firstName"]'),
  lastNameInput: page.locator('input[name="lastName"]'),
  emailInput: page.locator('input[name="email"]'),
  passwordInput: page.locator('input[name="password"]'),
  confirmPasswordInput: page.locator('input[name="confirmPassword"]'),
  submitButton: page.getByRole("button", { name: "Sign up", exact: true }),
  errorAlert: page.locator('[role="alert"]'),
  fieldErrors: page.locator(".MuiFormHelperText-root"),
});

export interface SignUpData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export const createSignUpPage = (page: Page) => {
  const els = buildLocators(page);

  const goto = async (): Promise<void> => {
    await page.goto("/sign-up", { waitUntil: "domcontentloaded" });
    await els.firstNameInput.waitFor({ state: "visible", timeout: 15_000 });
  };

  const fillForm = async (data: SignUpData): Promise<void> => {
    await els.firstNameInput.fill(data.firstName);
    await els.lastNameInput.fill(data.lastName);
    await els.emailInput.fill(data.email);
    await els.passwordInput.fill(data.password);
    await els.confirmPasswordInput.fill(data.confirmPassword);
  };

  const submit = async (): Promise<void> => {
    await els.submitButton.click();
  };

  // A successful plain (non-invite) sign-up redirects off /sign-up to the
  // dashboard home ("Welcome back, <name>" screen), not into a restaurant —
  // a fresh account is role USER until it creates a restaurant.
  const waitForSuccess = async (): Promise<void> => {
    await expect(page).not.toHaveURL(/\/sign-up/, { timeout: 15_000 });
  };

  const fillAndSubmit = async (data: SignUpData): Promise<void> => {
    await goto();
    await fillForm(data);
    await submit();
  };

  // Registration failure (e.g. duplicate email) surfaces as a role="alert"
  // banner and keeps the visitor on /sign-up.
  const assertRegisterError = async (): Promise<void> => {
    await expect(els.errorAlert.first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/sign-up/);
  };

  // Client-side (yup) validation errors render as MUI FormHelperText under
  // the offending field and block the /register request entirely.
  const assertFieldError = (message: string) =>
    expect(els.fieldErrors.filter({ hasText: message })).toBeVisible({
      timeout: 5_000,
    });

  return {
    goto,
    fillForm,
    submit,
    waitForSuccess,
    fillAndSubmit,
    assertRegisterError,
    assertFieldError,
    confirmPasswordInput: els.confirmPasswordInput,
    passwordInput: els.passwordInput,
  };
};

export type SignUpPage = ReturnType<typeof createSignUpPage>;
