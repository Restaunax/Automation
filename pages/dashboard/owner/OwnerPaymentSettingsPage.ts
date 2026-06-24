import { type Page, expect } from "@playwright/test";

export const createOwnerPaymentSettingsPage = (page: Page) => {
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

  const connectStripeButton = () =>
    page.getByRole("button", { name: "Set Up Stripe Account" });

  const assertConnectButtonVisible = () =>
    expect(connectStripeButton()).toBeVisible({ timeout: 10_000 });

  const assertRequirementsVisible = async () => {
    await expect(
      page.getByText("What You'll Need", { exact: true })
    ).toBeVisible({ timeout: 10_000 });
    for (const item of [
      "Personal Information",
      "Business Details",
      "Bank Account",
      "Payout Settings",
    ]) {
      await expect(page.getByText(item, { exact: true })).toBeVisible({
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

  // ── Success / return page (/stripe-onboarding-success?restaurantId=<id>) ──

  const gotoSuccessPage = async (restaurantId: string) => {
    await page.goto(`/stripe-onboarding-success?restaurantId=${restaurantId}`, {
      waitUntil: "domcontentloaded",
    });
    // Page fetches Stripe status — wait for either heading to settle.
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
    connectStripeButton,
    assertConnectButtonVisible,
    assertRequirementsVisible,
    assertHeaderDescription,
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
