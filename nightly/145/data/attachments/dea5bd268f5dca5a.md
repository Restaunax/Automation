# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/public/sign-in.spec.ts >> Public — Sign in >> TC-59: valid credentials reach the dashboard @smoke
- Location: tests/dashboard/public/sign-in.spec.ts:29:7

# Error details

```
Error: expect(page).not.toHaveURL(expected) failed

Expected pattern: not /\/sign-in/
Received string: "https://app.qa.restaunax.com/sign-in"
Timeout: 15000ms

Call log:
  - Expect "not toHaveURL" with timeout 15000ms
    33 × unexpected value "https://app.qa.restaunax.com/sign-in"

```

```yaml
- banner:
  - img
  - button "Affiliate Partner"
  - button "Book a Demo"
  - button "Log in"
  - button "Select Language":
    - img
    - text: EN
  - button
- heading "Sign In" [level=1]
- button "Continue with Google"
- button "Continue with Apple"
- separator: or
- text: Email
- textbox "Email": romel8545@gmail.com
- text: Password
- textbox "Password": AAAa1234!
- button "toggle password visibility"
- checkbox "Remember me"
- text: Remember me
- button "Sign in"
- separator
- paragraph: Don't have an account?
- link "Create New Account":
  - /url: /sign-up
  - button "Create New Account"
- button "Forgot your password?"
```

# Test source

```ts
  1  | import { type Page, expect } from "@playwright/test";
  2  | 
  3  | const buildLocators = (page: Page) => ({
  4  |   emailInput: page.locator('input[name="email"]'),
  5  |   passwordInput: page.locator('input[name="password"]'),
  6  |   submitButton: page.locator('button[type="submit"]'),
  7  |   errorAlert: page.locator('[role="alert"]'),
  8  | });
  9  | 
  10 | export const createSignInPage = (page: Page) => {
  11 |   const els = buildLocators(page);
  12 | 
  13 |   const goto = async (): Promise<void> => {
  14 |     await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  15 |     await els.emailInput.waitFor({ state: "visible", timeout: 15_000 });
  16 |   };
  17 | 
  18 |   const login = async (email: string, password: string): Promise<void> => {
  19 |     await els.emailInput.fill(email);
  20 |     await els.passwordInput.fill(password);
  21 |     await els.submitButton.click();
  22 |   };
  23 | 
  24 |   const waitForDashboard = async (): Promise<void> => {
  25 |     // URL leaving /sign-in is the authoritative signal that login succeeded.
  26 |     // Avoid networkidle — the dashboard has background polling that never settles.
> 27 |     await expect(page).not.toHaveURL(/\/sign-in/, { timeout: 15_000 });
     |                            ^ Error: expect(page).not.toHaveURL(expected) failed
  28 |   };
  29 | 
  30 |   const loginAndWait = async (
  31 |     email: string,
  32 |     password: string
  33 |   ): Promise<void> => {
  34 |     await goto();
  35 |     await login(email, password);
  36 |     await waitForDashboard();
  37 |   };
  38 | 
  39 |   // Login failure (any reason) surfaces as a role="alert" banner on /sign-in
  40 |   // rather than a redirect. The banner text is generic ("session expired")
  41 |   // even for bad credentials — assert presence, not exact wording.
  42 |   const assertLoginError = async (): Promise<void> => {
  43 |     await expect(els.errorAlert).toBeVisible({ timeout: 10_000 });
  44 |     await expect(page).toHaveURL(/\/sign-in/);
  45 |   };
  46 | 
  47 |   return { goto, login, waitForDashboard, loginAndWait, assertLoginError };
  48 | };
  49 | 
  50 | export type SignInPage = ReturnType<typeof createSignInPage>;
  51 | 
```