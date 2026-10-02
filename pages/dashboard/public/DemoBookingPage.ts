import { type Page, type Response, expect } from "@playwright/test";

export interface DemoFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  restaurantName: string;
  // Still part of the API payload (backend enum + SLA thresholds key off it),
  // but the public form no longer asks: since restaunax-web 022af42
  // (2026-09-29) it always submits "phone". Only the raw-API seeders use this.
  preferredContact: "email" | "phone";
  bestTimeToContact?: "morning" | "afternoon" | "evening";
  agreeToTerms: boolean;
}

// The demo form lives on the marketing site (restaunax-web /get-started) since
// 2026-08-08. The dashboard's /demo is a permanent client-side redirect there
// (restaunax-frontend DemoRedirect.tsx) that must never be removed — affiliate
// links and printed QR codes point at it — so goto() still enters via /demo and
// asserts the hop.
const FORM_PATH = /\/get-started(\?|$)/;

const buildLocators = (page: Page) => ({
  firstNameInput: page.locator('input[name="firstName"]'),
  lastNameInput: page.locator('input[name="lastName"]'),
  emailInput: page.locator('input[name="email"]'),
  phoneInput: page.locator('input[name="phone"]'),
  // A freeSolo Autocomplete (business suggestions) — typing is still the value.
  restaurantNameInput: page.locator('input[name="restaurantName"]'),
  agreeToTermsCheckbox: page.locator('input[name="agreeToTerms"]'),
  submitButton: page.locator("#demo-form").locator('button[type="submit"]'),
  // The success Dialog has no id/aria-label; its h5 title is the hook
  // ("Request Submitted!" for the default restaurant plan — content.ts).
  successDialog: page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Request Submitted!" }) }),
});

const isDemoRequestPost = (r: { url(): string; method(): string }) =>
  r.url().includes("/api/demo-requests") && r.method() === "POST";

export const createDemoBookingPage = (page: Page) => {
  const els = buildLocators(page);

  const goto = async (): Promise<void> => {
    await page.goto("/demo", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(FORM_PATH, { timeout: 30_000 });
    await els.firstNameInput.waitFor({ state: "visible", timeout: 15_000 });
  };

  const fillForm = async (data: DemoFormData): Promise<void> => {
    await els.firstNameInput.fill(data.firstName);
    await els.lastNameInput.fill(data.lastName);
    await els.emailInput.fill(data.email);
    await els.phoneInput.fill(data.phone);
    await els.restaurantNameInput.fill(data.restaurantName);
    // Close any business-suggestion dropdown so it can't cover the checkbox.
    await els.restaurantNameInput.press("Escape");
    await els.agreeToTermsCheckbox.scrollIntoViewIfNeeded();
    if (data.agreeToTerms) await els.agreeToTermsCheckbox.check();
  };

  // Resolves with the POST /api/demo-requests response the click fires.
  const submit = async (): Promise<Response> => {
    await els.submitButton.scrollIntoViewIfNeeded();
    const [response] = await Promise.all([
      page.waitForResponse((r) => isDemoRequestPost(r.request()), {
        timeout: 30_000,
      }),
      els.submitButton.click(),
    ]);
    return response;
  };

  const waitForSuccess = async (): Promise<void> => {
    await expect(els.successDialog).toBeVisible({ timeout: 15_000 });
  };

  // The form is noValidate with its own validate(): a bad field renders an
  // inline helper text and focuses the field, and no request is sent. The
  // authoritative negative signal is still that no POST /api/demo-requests
  // fires within a real observation window after the click (toBeHidden alone
  // resolves immediately); `expectedError` additionally pins WHY it refused.
  const submitExpectingNoRequest = async (
    expectedError?: string
  ): Promise<void> => {
    await els.submitButton.scrollIntoViewIfNeeded();
    const requestPromise = page
      .waitForRequest(isDemoRequestPost, { timeout: 2_500 })
      .catch(() => null);
    await els.submitButton.click();
    const fired = await requestPromise;
    expect(fired, "form must not POST /api/demo-requests").toBeNull();
    if (expectedError) {
      await expect(
        page.getByText(expectedError, { exact: true })
      ).toBeVisible();
    }
    await expect(els.successDialog).toBeHidden();
    await expect(page).toHaveURL(FORM_PATH);
  };

  const fillAndSubmit = async (data: DemoFormData): Promise<void> => {
    await goto();
    await fillForm(data);
    await submit();
    await waitForSuccess();
  };

  return {
    successDialog: els.successDialog,
    goto,
    fillForm,
    submit,
    waitForSuccess,
    submitExpectingNoRequest,
    fillAndSubmit,
  };
};

export type DemoBookingPage = ReturnType<typeof createDemoBookingPage>;
