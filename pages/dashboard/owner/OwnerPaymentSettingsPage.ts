import { type Page, expect } from "@playwright/test";

export const createOwnerPaymentSettingsPage = (page: Page) => {
  // ── Setup page (/restaurant/restaurantId/:id/setupStripe) ──────────────────

  const goto = async (restaurantId: string) => {
    await page.goto(`/restaurant/restaurantId/${restaurantId}/setupStripe`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "Payment Setup" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const pageHeading = () =>
    page.getByRole("heading", { name: "Payment Setup" });

  const assertPageLoaded = () =>
    expect(pageHeading()).toBeVisible({ timeout: 10_000 });

  // 4-step stepper on the QA setup page.
  const assertStepperVisible = async () => {
    for (const step of [
      "Check Status",
      "Create Account",
      "Verify Details",
      "Start Accepting",
    ]) {
      await expect(page.getByText(step, { exact: true })).toBeVisible({
        timeout: 10_000,
      });
    }
  };

  const assertHeaderDescription = () =>
    expect(
      page.getByText(
        "Connect with Stripe to start accepting payments and grow your restaurant business",
        { exact: true }
      )
    ).toBeVisible({ timeout: 10_000 });

  // Visible only when hasAccount === false (mocked or genuinely unconnected).
  const connectStripeButton = () =>
    page.getByRole("button", { name: "Set Up Stripe Account" });

  const assertConnectButtonVisible = () =>
    expect(connectStripeButton()).toBeVisible({ timeout: 10_000 });

  // Pre-connection: "What You'll Need" checklist rendered when hasAccount: false.
  const assertRequirementsVisible = async () => {
    await expect(
      page.getByRole("heading", { name: "What You'll Need" })
    ).toBeVisible({ timeout: 10_000 });
    for (const item of [
      "Personal Information",
      "Business Details",
      "Bank Account",
      "Payout Settings",
    ]) {
      await expect(page.getByRole("heading", { name: item })).toBeVisible({
        timeout: 10_000,
      });
    }
  };

  // ── Success / return page (/stripe-onboarding-success?restaurantId=<id>) ──

  const gotoSuccessPage = async (restaurantId: string) => {
    await page.goto(`/stripe-onboarding-success?restaurantId=${restaurantId}`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", {
        name: /Stripe Account Successfully Connected|Stripe Account Setup In Progress/i,
      })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const successPageHeading = () =>
    page.getByRole("heading", {
      name: /Stripe Account Successfully Connected|Stripe Account Setup In Progress/i,
    });

  const restaurantDashboardButton = () =>
    page.getByRole("button", { name: "Restaurant Dashboard" });

  const assertSuccessPageLoaded = () =>
    expect(successPageHeading()).toBeVisible({ timeout: 10_000 });

  const assertRestaurantDashboardButtonVisible = () =>
    expect(restaurantDashboardButton()).toBeVisible({ timeout: 10_000 });

  const clickRestaurantDashboard = () => restaurantDashboardButton().click();

  const assertRedirectedToManagement = (restaurantId: string) =>
    expect(page).toHaveURL(
      new RegExp(
        `/restaurant/restaurantId/${restaurantId}/restaurantManagement`
      ),
      { timeout: 15_000 }
    );

  return {
    goto,
    pageHeading,
    assertPageLoaded,
    assertStepperVisible,
    assertHeaderDescription,
    connectStripeButton,
    assertConnectButtonVisible,
    assertRequirementsVisible,
    gotoSuccessPage,
    successPageHeading,
    restaurantDashboardButton,
    assertSuccessPageLoaded,
    assertRestaurantDashboardButtonVisible,
    clickRestaurantDashboard,
    assertRedirectedToManagement,
  };
};

export type OwnerPaymentSettingsPage = ReturnType<
  typeof createOwnerPaymentSettingsPage
>;
