import * as allure from "allure-js-commons";
import { test } from "../../../fixtures/base";
import { createOwnerPaymentSettingsPage } from "../../../pages/dashboard/owner/OwnerPaymentSettingsPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Payment Settings (Stripe Setup)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Payment Settings");
    await allure.label("severity", "critical");
  });

  // ── Setup page (/restaurant/restaurantId/:id/setupStripe) ─────────────────

  test.describe("Setup page", () => {
    let restaurantId: string;

    test.beforeEach(async ({ ownerPage }) => {
      ({ restaurantId } = readSharedState());
      const paymentPage = createOwnerPaymentSettingsPage(ownerPage);
      await paymentPage.goto(restaurantId);
    });

    test("TC-46: setup page loads with Payment Setup heading", async ({
      ownerPage,
    }) => {
      await allure.description(
        "Owner navigates to /setupStripe and the Payment Setup heading is visible."
      );
      const paymentPage = createOwnerPaymentSettingsPage(ownerPage);
      await allure.step("Verify Payment Setup heading", async () => {
        await paymentPage.assertPageLoaded();
        await allure.parameter("restaurantId", restaurantId);
        await allure.parameter("URL", ownerPage.url());
      });
    });

    test("TC-47: setup page shows the 4-step Stripe onboarding stepper", async ({
      ownerPage,
    }) => {
      await allure.description(
        "The stepper shows all four steps: Check Status, Create Account, Verify Details, Start Accepting."
      );
      const paymentPage = createOwnerPaymentSettingsPage(ownerPage);
      await allure.step("Verify all 4 stepper steps are visible", async () => {
        await paymentPage.assertStepperVisible();
      });
    });

    test("TC-48: setup page shows the header description", async ({
      ownerPage,
    }) => {
      await allure.description(
        "The subtitle tells the owner they can connect Stripe to accept payments."
      );
      const paymentPage = createOwnerPaymentSettingsPage(ownerPage);
      await allure.step("Verify header description text", async () => {
        await paymentPage.assertHeaderDescription();
      });
    });

    test("TC-49: owner without Stripe sees the Set Up Stripe Account button", async () => {
      test.skip(
        true,
        "The QA owner account already has Stripe connected (shows 'You're All Set!'). " +
          "The pre-setup UI ('Set Up Stripe Account' button) is only visible before Stripe is configured."
      );
    });

    test("TC-50: setup page shows the What You'll Need requirements section", async () => {
      test.skip(
        true,
        "The QA owner account already has Stripe connected (shows 'You're All Set!'). " +
          "The 'What You'll Need' requirements section is only visible before Stripe is configured."
      );
    });
  });

  // ── Success / return page (/stripe-onboarding-success?restaurantId=<id>) ──

  test.describe("Success callback page", () => {
    let restaurantId: string;

    test.beforeEach(async ({ ownerPage }) => {
      ({ restaurantId } = readSharedState());
      const paymentPage = createOwnerPaymentSettingsPage(ownerPage);
      await paymentPage.gotoSuccessPage(restaurantId);
    });

    test("TC-51: success callback page loads after Stripe redirect", async ({
      ownerPage,
    }) => {
      await allure.description(
        "After Stripe redirects back to /stripe-onboarding-success the page shows either " +
          "'Stripe Account Successfully Connected!' or 'Stripe Account Setup In Progress', " +
          "and the Restaurant Dashboard button is always present."
      );
      const paymentPage = createOwnerPaymentSettingsPage(ownerPage);
      await allure.step(
        "Verify success or in-progress heading is visible",
        async () => {
          await paymentPage.assertSuccessPageLoaded();
          await allure.parameter("restaurantId", restaurantId);
          await allure.parameter("URL", ownerPage.url());
        }
      );
      await allure.step(
        "Verify Restaurant Dashboard button is visible",
        async () => {
          await paymentPage.assertRestaurantDashboardButtonVisible();
        }
      );
    });

    test("TC-52: clicking Restaurant Dashboard redirects to restaurant management", async ({
      ownerPage,
    }) => {
      await allure.description(
        "Clicking 'Restaurant Dashboard' on the success page navigates to " +
          "/restaurant/restaurantId/<id>/restaurantManagement."
      );
      const paymentPage = createOwnerPaymentSettingsPage(ownerPage);
      await allure.step("Click Restaurant Dashboard button", async () => {
        await paymentPage.clickRestaurantDashboard();
        await allure.parameter("restaurantId", restaurantId);
      });
      await allure.step(
        "Verify redirect to restaurant management portal",
        async () => {
          await paymentPage.assertRedirectedToManagement(restaurantId);
          await allure.parameter("Final URL", ownerPage.url());
        }
      );
    });
  });
});
