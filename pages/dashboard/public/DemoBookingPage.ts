import { type Page, type Locator, expect } from "@playwright/test";

export interface DemoFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  restaurantName: string;
  preferredContact: "email" | "phone";
  bestTimeToContact?: "morning" | "afternoon" | "evening";
  agreeToTerms: boolean;
}

const buildLocators = (page: Page) => ({
  firstNameInput: page.locator('input[name="firstName"]'),
  lastNameInput: page.locator('input[name="lastName"]'),
  emailInput: page.locator('input[name="email"]'),
  phoneInput: page.locator('input[name="phone"]'),
  restaurantNameInput: page.locator('input[name="restaurantName"]'),
  agreeToTermsCheckbox: page.locator('input[name="agreeToTerms"]'),
  submitButton: page.locator('button[type="submit"]'),
  successDialog: page.locator("#success-dialog-title"),
  successDialogCloseButton: page
    .locator('[role="dialog"]')
    .getByRole("button")
    .last(),
  preferredContactRadio: (value: "email" | "phone"): Locator =>
    page.locator(`input[name="preferredContact"][value="${value}"]`),
});

export const createDemoBookingPage = (page: Page) => {
  const els = buildLocators(page);

  const goto = async (): Promise<void> => {
    await page.goto("/demo", { waitUntil: "domcontentloaded" });
    await els.firstNameInput.waitFor({ state: "visible", timeout: 15_000 });
  };

  const fillForm = async (data: DemoFormData): Promise<void> => {
    await els.firstNameInput.fill(data.firstName);
    await els.lastNameInput.fill(data.lastName);
    await els.emailInput.fill(data.email);
    await els.phoneInput.fill(data.phone);
    await els.restaurantNameInput.fill(data.restaurantName);
    await els.preferredContactRadio(data.preferredContact).check();
    await els.agreeToTermsCheckbox.scrollIntoViewIfNeeded();
    if (data.agreeToTerms) await els.agreeToTermsCheckbox.check();
  };

  const submit = async (): Promise<void> => {
    await els.submitButton.scrollIntoViewIfNeeded();
    await els.submitButton.click();
  };

  const waitForSuccess = async (): Promise<void> => {
    await expect(els.successDialog).toBeVisible({ timeout: 15_000 });
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
    fillAndSubmit,
  };
};

export type DemoBookingPage = ReturnType<typeof createDemoBookingPage>;
