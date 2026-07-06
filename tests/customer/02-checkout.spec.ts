import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import {
  readSharedState,
  readRestaurantId,
  generateCouponCode,
} from "../../utils/testData";
import {
  apiLogin,
  createCouponRaw,
  getRestaurantCoupons,
} from "../../utils/apiHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Customer — Checkout", () => {
  // No default here on purpose: Template Wind is deployed per-restaurant, and
  // the qa.restaunax.com root serves the marketing site — the env var must
  // point at a real customer-site deployment.
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-24: customer with pre-seeded cart can reach checkout and see the form", async ({
    page,
  }) => {
    await allure.description(
      "Cart is injected via sessionStorage; customer navigates to /checkout and sees the customer info form."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and navigate to checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("Item", menuItemName);
    });

    await allure.step("Verify checkout form is visible", async () => {
      await checkoutPage.assertFormVisible();
      await allure.parameter("URL", page.url());
    });
  });

  test("TC-25: customer can fill checkout form and proceed to payment step", async ({
    page,
  }) => {
    await allure.description(
      "Customer fills First Name, Last Name, Email, Phone, selects Pickup, and clicks Proceed to Payment. Stripe payment section appears."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and navigate to checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
    });

    await allure.step("Fill customer info", async () => {
      await checkoutPage.fillCustomerInfo(
        "Jane",
        "Tester",
        "jane@restaunax-test.com",
        "5559876543"
      );
      await allure.parameter("Name", "Jane Tester");
      await allure.parameter("Email", "jane@restaunax-test.com");
    });

    await allure.step("Select Pickup service type", async () => {
      await checkoutPage.selectPickup();
    });

    await allure.step("Click Proceed to Payment", async () => {
      await checkoutPage.clickProceedToPayment();
    });

    await allure.step("Verify Stripe payment section is visible", async () => {
      await checkoutPage.assertPaymentSectionVisible();
    });
  });
});

// ── Coupon redemption + delivery — the revenue paths the suite was missing.
// Separate describe so the coupon seed's beforeAll is scoped to these tests.
test.describe("Customer — Checkout coupon & delivery", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  // A percentage coupon the customer will redeem at checkout. The AUTO* prefix
  // means globalTeardown's deleteAutomationCoupons sweep cleans it up — no
  // per-file cleanup needed. Seeded via the owner API for determinism.
  let couponCode = "";

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const restaurantId = readRestaurantId();
    couponCode = generateCouponCode();
    const res = await createCouponRaw(accessToken, restaurantId, {
      code: couponCode,
      type: "PERCENTAGE",
      value: 10,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: "ACTIVE",
    });
    expect(res.ok, `coupon seed failed: ${JSON.stringify(res.data)}`).toBe(
      true
    );
    // Confirm it's queryable before the UI tries to validate it.
    const coupons = await getRestaurantCoupons(accessToken, restaurantId);
    expect(coupons.some((c) => c.code === couponCode)).toBe(true);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-125: a valid coupon applied at checkout shows the discount, an invalid one is rejected", async ({
    page,
  }) => {
    await allure.description(
      "The customer coupon-redemption path (previously untested): applying the " +
        "seeded percentage coupon at checkout shows the discount in the order " +
        "summary; a bogus code is rejected with an error and no discount."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and open checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
    });

    await allure.step(`Apply valid coupon ${couponCode}`, async () => {
      await checkoutPage.applyCoupon(couponCode);
      await checkoutPage.assertCouponApplied(couponCode);
      await allure.parameter("Coupon", couponCode);
    });

    await allure.step("Apply a bogus coupon and verify rejection", async () => {
      // Reload to clear the applied coupon, then try a code that can't exist.
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
      await checkoutPage.applyCoupon("NOPE" + Date.now());
      await checkoutPage.assertCouponRejected();
    });
  });

  test("TC-126: selecting Delivery drives the address → quote round-trip", async ({
    page,
  }) => {
    await allure.description(
      "Quote-wiring coverage for delivery (not a full delivery order — that " +
        "needs QA's delivery provider + a deliverable address): selecting " +
        "Delivery and entering an address fires /api/delivery/quote and the UI " +
        "resolves to either an available fee or a not-available message. Skips " +
        "cleanly when the restaurant is pickup-only or Google Places yields no " +
        "suggestion (external dependency)."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and open checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
    });

    // Delivery is hidden on pickup-only / ship-only restaurants — skip, don't fail.
    const deliveryAvailable = await checkoutPage.isDeliveryAvailable();
    test.skip(
      !deliveryAvailable,
      "This restaurant does not offer Delivery (pickup-only or ship-only)"
    );

    await allure.step("Select Delivery and enter an address", async () => {
      await checkoutPage.selectDelivery();
      await checkoutPage.fillDeliveryAddress("350 5th Ave, New York");
    });

    // Google Places is external — if no suggestion appears, skip rather than fail.
    const suggestion = checkoutPage.firstAddressSuggestion();
    const hasSuggestion = await suggestion
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !hasSuggestion,
      "Google Places returned no suggestion (external dependency unavailable)"
    );

    await allure.step(
      "Pick the suggestion and verify the quote resolved",
      async () => {
        await suggestion.click();
        await checkoutPage.assertDeliveryQuoteResolved();
      }
    );
  });
});
