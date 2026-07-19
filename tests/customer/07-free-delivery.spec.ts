import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import {
  readRestaurantId,
  readSharedState,
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

/**
 * Customer — FREE_DELIVERY coupons at checkout (Template Wind).
 *
 * The customer-visible half of the free-delivery feature: the fee is waived
 * and displayed as "Free" instead of showing a discount amount, and the code
 * is delivery-only.
 *
 * DEPENDS ON template-wind PR #60 being deployed to the QA storefront: it
 * makes the checkout send `serviceType` on validate (powering the pickup
 * rejection) and renders the waived fee. Before that deploy, TC-214 sees the
 * coupon accepted with a $0.00 saving instead of rejected.
 */
test.describe("Customer — Free-delivery coupon", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  // Seeded via the owner API; AUTO* prefix → swept by globalTeardown.
  let couponCode = "";

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const restaurantId = readRestaurantId();
    couponCode = generateCouponCode();
    const res = await createCouponRaw(accessToken, restaurantId, {
      code: couponCode,
      type: "FREE_DELIVERY",
      value: 0,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: "ACTIVE",
    });
    expect(res.ok, `coupon seed failed: ${JSON.stringify(res.data)}`).toBe(
      true
    );
    const coupons = await getRestaurantCoupons(accessToken, restaurantId);
    expect(coupons.some((c) => c.code === couponCode)).toBe(true);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-214: a free-delivery code is rejected on a pickup order", async ({
    page,
  }) => {
    await allure.description(
      "FREE_DELIVERY is delivery-only: applying the code while the order is " +
        "Pickup sends serviceType to validate and the backend rejects it with " +
        "a delivery-only message — no discount, no $0.00 'saving'."
    );
    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and open checkout (pickup)", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
    });

    await allure.step(`Apply ${couponCode} → rejected`, async () => {
      await checkoutPage.applyCoupon(couponCode);
      await checkoutPage.assertCouponRejected();
    });
  });

  test("TC-215: on a delivery order the code waives the fee and shows Free", async ({
    page,
  }) => {
    await allure.description(
      "Select Delivery, resolve a fee quote, then apply the free-delivery " +
        "code: the coupon applies and the order summary shows the delivery fee " +
        "waived ('Free'). Skips cleanly when the restaurant is pickup-only, " +
        "Google Places yields no suggestion, or delivery is not available at " +
        "the address (external dependencies, mirroring TC-126)."
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

    const deliveryAvailable = await checkoutPage.isDeliveryAvailable();
    test.skip(!deliveryAvailable, "Restaurant is pickup-only on QA");

    await allure.step("Select Delivery and resolve a quote", async () => {
      await checkoutPage.selectDelivery();
      await checkoutPage.fillDeliveryAddress("350 5th Ave, New York");
      const suggestion = checkoutPage.firstAddressSuggestion();
      const hasSuggestion = await suggestion
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      test.skip(!hasSuggestion, "Google Places returned no suggestion");
      await suggestion.click();
      await checkoutPage.assertDeliveryQuoteResolved();
    });

    const quoteAvailable =
      (await page.getByText(/Delivery Available/i).count()) > 0;
    test.skip(
      !quoteAvailable,
      "Delivery not available at the test address on QA"
    );

    await allure.step(`Apply ${couponCode} → fee waived`, async () => {
      await checkoutPage.applyCoupon(couponCode);
      // Free-delivery coupons carry no item discount, so the applied state is
      // the coupon chip/line plus the fee row flipping to "Free" — not a
      // "Saving $X" amount.
      await expect(
        page.getByText(new RegExp(`Coupon\\s*\\(${couponCode}\\)`, "i"))
      ).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/^Free$/).first()).toBeVisible({
        timeout: 15_000,
      });
    });
  });
});
