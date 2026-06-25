import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerPaymentSettingsPage } from "../../../pages/dashboard/owner/OwnerPaymentSettingsPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

/**
 * Stripe status API mock — "not yet connected" state.
 *
 * The QA component reads response.data.hasAccount directly (no ApiResponse
 * wrapper). Providing a flat body with hasAccount: false causes the page to
 * render the pre-setup UI (What You'll Need checklist + Set Up Stripe Account).
 */
const STRIPE_NOT_CONNECTED = {
  hasAccount: false,
  detailsSubmitted: false,
  chargesEnabled: false,
  payoutsEnabled: false,
};

/**
 * Fake Stripe create-account response.
 * The QA component reads response.data.accountLinkUrl directly, so the URL
 * must live at the top level of the JSON body (not nested under a "data" key).
 * We also include the ApiResponse wrapper shape so the same mock works if the
 * component is ever updated to use unwrapAndExtract().
 */
const STRIPE_CREATE_RESPONSE = {
  accountLinkUrl: "https://connect.stripe.com/setup/s/mock_test_link",
  accountId: "acct_mock_test",
  success: true,
  data: {
    accountLinkUrl: "https://connect.stripe.com/setup/s/mock_test_link",
    accountId: "acct_mock_test",
  },
};

/** Intercept the Stripe status endpoint and return "not connected". */
async function mockStripeNotConnected(page: import("@playwright/test").Page) {
  await page.route(
    (url) =>
      url.pathname.includes("/api/stripe/account/") &&
      url.pathname.endsWith("/stripe/status"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STRIPE_NOT_CONNECTED),
      })
  );
}

test.describe("Owner — Payment Settings (Stripe Setup)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Payment Settings");
    await allure.label("severity", "critical");
  });

  // ── Setup page — real QA account (already connected) ──────────────────────
  //
  // TC-46, TC-47, TC-48 assert elements visible regardless of connection state.

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
  });

  // ── Setup page — pre-connection state (mocked) ─────────────────────────────
  //
  // TC-49, TC-50, TC-53 need the pre-setup UI. The QA account already has
  // Stripe connected, so these tests mock the status API before navigating.

  test.describe("Setup page — pre-connection state (mocked)", () => {
    let restaurantId: string;

    test.beforeEach(() => {
      ({ restaurantId } = readSharedState());
    });

    test("TC-49: owner without Stripe sees the Set Up Stripe Account button", async ({
      ownerPage,
    }) => {
      await allure.description(
        "When the Stripe status API returns hasAccount: false the page renders " +
          "the 'Set Up Stripe Account' button. Route-mocked so the test is " +
          "independent of the QA account's real Stripe state."
      );
      const paymentPage = createOwnerPaymentSettingsPage(ownerPage);

      await allure.step("Mock Stripe status as not connected", async () => {
        await mockStripeNotConnected(ownerPage);
      });

      await allure.step("Navigate to setup page", async () => {
        await paymentPage.goto(restaurantId);
        await allure.parameter("restaurantId", restaurantId);
        await allure.parameter("URL", ownerPage.url());
      });

      await allure.step(
        "Verify Set Up Stripe Account button is visible",
        async () => {
          await paymentPage.assertConnectButtonVisible();
        }
      );
    });

    test("TC-50: setup page shows the What You'll Need requirements section", async ({
      ownerPage,
    }) => {
      await allure.description(
        "When Stripe is not connected the page shows a 'What You'll Need' checklist " +
          "with Personal Information, Business Details, Bank Account, and Payout Settings."
      );
      const paymentPage = createOwnerPaymentSettingsPage(ownerPage);

      await allure.step("Mock Stripe status as not connected", async () => {
        await mockStripeNotConnected(ownerPage);
      });

      await allure.step("Navigate to setup page", async () => {
        await paymentPage.goto(restaurantId);
        await allure.parameter("restaurantId", restaurantId);
      });

      await allure.step(
        "Verify What You'll Need section and all checklist items are visible",
        async () => {
          await paymentPage.assertRequirementsVisible();
        }
      );
    });

    test("TC-53: clicking Set Up Stripe Account calls the create API and redirects to Stripe", async ({
      ownerPage,
    }) => {
      await allure.description(
        "When the owner clicks 'Set Up Stripe Account' the frontend POSTs to " +
          "/api/stripe/account/restaurant/:id/create, receives an accountLinkUrl, " +
          "and sets window.location.href to that URL (redirecting to Stripe)."
      );
      const paymentPage = createOwnerPaymentSettingsPage(ownerPage);

      await allure.step("Mock Stripe status as not connected", async () => {
        await mockStripeNotConnected(ownerPage);
      });

      let createApiCalled = false;
      let createApiUrl = "";
      await allure.step("Mock Stripe create-account endpoint", async () => {
        await ownerPage.route(
          (url) =>
            url.pathname.includes("/api/stripe/account/") &&
            url.pathname.endsWith("/create"),
          (route) => {
            createApiCalled = true;
            createApiUrl = route.request().url();
            return route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(STRIPE_CREATE_RESPONSE),
            });
          }
        );
      });

      // Fulfill the Stripe redirect so the navigation succeeds and we can assert
      // the URL without the browser actually leaving the test environment.
      await allure.step("Mock Stripe Connect domain", async () => {
        await ownerPage.route("https://connect.stripe.com/**", (route) =>
          route.fulfill({
            status: 200,
            contentType: "text/html",
            body: "<html><body>Stripe Mock</body></html>",
          })
        );
      });

      await allure.step("Navigate to setup page", async () => {
        await paymentPage.goto(restaurantId);
        await allure.parameter("restaurantId", restaurantId);
      });

      await allure.step("Click Set Up Stripe Account button", async () => {
        await paymentPage.connectStripeButton().click();
      });

      await allure.step(
        "Verify browser redirected to Stripe Connect",
        async () => {
          await ownerPage.waitForURL(/connect\.stripe\.com/, {
            timeout: 10_000,
          });
          await allure.parameter("Stripe URL", ownerPage.url());
        }
      );

      await allure.step(
        "Verify create API was called for the correct restaurant",
        async () => {
          expect(createApiCalled).toBe(true);
          expect(createApiUrl).toContain(restaurantId);
          await allure.parameter("Create API URL", createApiUrl);
        }
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
