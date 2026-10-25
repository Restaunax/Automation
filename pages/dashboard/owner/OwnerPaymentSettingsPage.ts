import { type Page, expect } from "@playwright/test";
import { RELEASED_ON_QA } from "../../../utils/releaseGate";

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
      // RestauNax #1036 renamed "Payout Settings" → "Automatic Payouts"
      // (payouts are automatic and daily; there is nothing to choose).
      // Either until #1036 is on QA, then only the new one.
      RELEASED_ON_QA.bugBatch
        ? "Automatic Payouts"
        : /^(Automatic Payouts|Payout Settings)$/,
    ]) {
      await expect(page.getByRole("heading", { name: item })).toBeVisible({
        timeout: 10_000,
      });
    }
  };

  // ── Fees + help copy (RestauNax #1036) ─────────────────────────────────
  // stripe.json → onboarding.features.transparentPricingDesc, faq.fees,
  // faq.help. The old copy promised a flat "2.9% + $0.30" and pointed at a
  // placeholder support@yourplatform.com.
  const transparentPricingText = () =>
    page.getByText(
      "Stripe's standard card rates with no markup: 2.9% + 30¢ online, 2.7% + 5¢ in person",
      { exact: true }
    );
  const feesFaqAnswer = () =>
    page.getByText(/^Card payments are charged at Stripe's standard rates/);
  const helpFaqAnswer = () =>
    page.getByText(
      "Contact our support team at support@restaunax.com or (877) 801-1141.",
      { exact: true }
    );
  /** FAQ answers are collapsed; clicking the card shows the answer. */
  const expandFaq = async (question: string) => {
    await page.getByText(question, { exact: true }).click();
  };
  const placeholderSupportEmail = () =>
    page.getByText(/support@yourplatform\.com/);

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
    transparentPricingText,
    feesFaqAnswer,
    helpFaqAnswer,
    placeholderSupportEmail,
    expandFaq,
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
