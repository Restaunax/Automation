# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/public/01-demo-request.spec.ts >> Demo Request — Public Form >> TC-75: submitting an invalid email format does not submit the form
- Location: tests/dashboard/public/01-demo-request.spec.ts:77:7

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('input[name="firstName"]') to be visible
    - waiting for" https://qa.restaunax.com/get-started" navigation to finish...
    - navigated to "https://qa.restaunax.com/get-started"

```

# Page snapshot

```yaml
- 'heading "Application error: a client-side exception has occurred while loading qa.restaunax.com (see the browser console for more information)." [level=2] [ref=e4]'
```

# Test source

```ts
  1  | import { type Page, type Locator, expect } from "@playwright/test";
  2  | 
  3  | export interface DemoFormData {
  4  |   firstName: string;
  5  |   lastName: string;
  6  |   email: string;
  7  |   phone: string;
  8  |   restaurantName: string;
  9  |   preferredContact: "email" | "phone";
  10 |   bestTimeToContact?: "morning" | "afternoon" | "evening";
  11 |   agreeToTerms: boolean;
  12 | }
  13 | 
  14 | const buildLocators = (page: Page) => ({
  15 |   firstNameInput: page.locator('input[name="firstName"]'),
  16 |   lastNameInput: page.locator('input[name="lastName"]'),
  17 |   emailInput: page.locator('input[name="email"]'),
  18 |   phoneInput: page.locator('input[name="phone"]'),
  19 |   restaurantNameInput: page.locator('input[name="restaurantName"]'),
  20 |   agreeToTermsCheckbox: page.locator('input[name="agreeToTerms"]'),
  21 |   submitButton: page.locator('button[type="submit"]'),
  22 |   successDialog: page.locator("#success-dialog-title"),
  23 |   successDialogCloseButton: page
  24 |     .locator('[role="dialog"]')
  25 |     .getByRole("button")
  26 |     .last(),
  27 |   preferredContactRadio: (value: "email" | "phone"): Locator =>
  28 |     page.locator(`input[name="preferredContact"][value="${value}"]`),
  29 | });
  30 | 
  31 | export const createDemoBookingPage = (page: Page) => {
  32 |   const els = buildLocators(page);
  33 | 
  34 |   const goto = async (): Promise<void> => {
  35 |     await page.goto("/demo", { waitUntil: "domcontentloaded" });
> 36 |     await els.firstNameInput.waitFor({ state: "visible", timeout: 15_000 });
     |                              ^ TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
  37 |   };
  38 | 
  39 |   const fillForm = async (data: DemoFormData): Promise<void> => {
  40 |     await els.firstNameInput.fill(data.firstName);
  41 |     await els.lastNameInput.fill(data.lastName);
  42 |     await els.emailInput.fill(data.email);
  43 |     await els.phoneInput.fill(data.phone);
  44 |     await els.restaurantNameInput.fill(data.restaurantName);
  45 |     await els.preferredContactRadio(data.preferredContact).check();
  46 |     await els.agreeToTermsCheckbox.scrollIntoViewIfNeeded();
  47 |     if (data.agreeToTerms) await els.agreeToTermsCheckbox.check();
  48 |   };
  49 | 
  50 |   const submit = async (): Promise<void> => {
  51 |     await els.submitButton.scrollIntoViewIfNeeded();
  52 |     await els.submitButton.click();
  53 |   };
  54 | 
  55 |   const waitForSuccess = async (): Promise<void> => {
  56 |     await expect(els.successDialog).toBeVisible({ timeout: 15_000 });
  57 |   };
  58 | 
  59 |   // Neither the missing-terms-checkbox nor invalid-email case renders a
  60 |   // visible inline error — the form just silently declines to submit
  61 |   // (native HTML5 validation blocks it). toBeHidden alone proves nothing
  62 |   // here (it resolves immediately while the dialog is still hidden), so the
  63 |   // authoritative negative signal is that no POST /api/demo-requests fires
  64 |   // within a real observation window after the click.
  65 |   const submitExpectingNoRequest = async (): Promise<void> => {
  66 |     await els.submitButton.scrollIntoViewIfNeeded();
  67 |     const requestPromise = page
  68 |       .waitForRequest((r) => r.url().includes("/api/demo-requests"), {
  69 |         timeout: 2_500,
  70 |       })
  71 |       .catch(() => null);
  72 |     await els.submitButton.click();
  73 |     const fired = await requestPromise;
  74 |     expect(fired, "form must not POST /api/demo-requests").toBeNull();
  75 |     await expect(els.successDialog).toBeHidden();
  76 |     await expect(page).toHaveURL(/\/demo$/);
  77 |   };
  78 | 
  79 |   const fillAndSubmit = async (data: DemoFormData): Promise<void> => {
  80 |     await goto();
  81 |     await fillForm(data);
  82 |     await submit();
  83 |     await waitForSuccess();
  84 |   };
  85 | 
  86 |   return {
  87 |     successDialog: els.successDialog,
  88 |     goto,
  89 |     fillForm,
  90 |     submit,
  91 |     waitForSuccess,
  92 |     submitExpectingNoRequest,
  93 |     fillAndSubmit,
  94 |   };
  95 | };
  96 | 
  97 | export type DemoBookingPage = ReturnType<typeof createDemoBookingPage>;
  98 | 
```