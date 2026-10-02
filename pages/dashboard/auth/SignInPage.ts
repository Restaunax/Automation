import { type Page, expect } from "@playwright/test";

const buildLocators = (page: Page) => ({
  emailInput: page.locator('input[name="email"]'),
  passwordInput: page.locator('input[name="password"]'),
  submitButton: page.locator('button[type="submit"]'),
  errorAlert: page.locator('[role="alert"]'),
});

export const createSignInPage = (page: Page) => {
  const els = buildLocators(page);

  const goto = async (): Promise<void> => {
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await els.emailInput.waitFor({ state: "visible", timeout: 15_000 });
  };

  const login = async (email: string, password: string): Promise<void> => {
    await els.emailInput.fill(email);
    await els.passwordInput.fill(password);
    await els.submitButton.click();
  };

  const waitForDashboard = async (): Promise<void> => {
    // URL leaving /sign-in is the authoritative signal that login succeeded.
    // Avoid networkidle — the dashboard has background polling that never settles.
    await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 });
  };

  const loginAndWait = async (
    email: string,
    password: string
  ): Promise<void> => {
    await goto();
    await login(email, password);
    await waitForDashboard();
  };

  // Login failure (any reason) surfaces as a role="alert" banner on /sign-in
  // rather than a redirect. The banner text is generic ("session expired")
  // even for bad credentials — assert presence, not exact wording.
  const assertLoginError = async (): Promise<void> => {
    await expect(els.errorAlert).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/sign-in/);
  };

  return { goto, login, waitForDashboard, loginAndWait, assertLoginError };
};

export type SignInPage = ReturnType<typeof createSignInPage>;
