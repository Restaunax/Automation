import * as allure from "allure-js-commons";
import type { Page } from "@playwright/test";
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
import {
  assertSums,
  readWindCheckoutLines,
  type Line,
} from "../../utils/orderBreakdown";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";

/** The green applied-code pill: the code alone, once the server took it. */
const codePill = (page: Page, code: string) =>
  page.getByText(new RegExp(`^${code}$`, "i"));

/**
 * The checkout summary lines once the server's FREE_DELIVERY line is on
 * screen (the quote after the code is applied has landed).
 */
const waiverLines = async (page: Page): Promise<Line[]> => {
  await expect(page.getByTestId("breakdown-totals-FREE_DELIVERY")).toBeVisible({
    timeout: 15_000,
  });
  return readWindCheckoutLines(page);
};
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

/**
 * Customer — FREE_DELIVERY coupons at checkout (Template Wind).
 *
 * The customer-visible half of the free-delivery feature: the summary keeps
 * the delivery fee line and adds the server's FREE_DELIVERY line taking it
 * back (all of it, or the coupon's fee cap), and the code is delivery-only.
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
  // Three FREE_DELIVERY coupons: the baseline (waives the whole fee), one gated
  // by a high minimum order (TC-217), and one with a $1 fee cap (TC-218).
  let couponCode = "";
  let minOrderCouponCode = "";
  let cappedCouponCode = "";

  const startDate = () =>
    new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const endDate = () =>
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const restaurantId = readRestaurantId();
    const { menuItemPrice } = readSharedState();

    couponCode = generateCouponCode();
    minOrderCouponCode = generateCouponCode();
    cappedCouponCode = generateCouponCode();

    // FREE_DELIVERY now requires a minimum order + fee cap (the margin
    // guardrail). Baseline: low minimum, generous cap → still waives the whole
    // fee, so TC-214/215 behave as before.
    const seeds: Record<string, unknown>[] = [
      {
        code: couponCode,
        type: "FREE_DELIVERY",
        value: 0,
        minOrderAmount: 1,
        maxDiscount: 50,
        startDate: startDate(),
        endDate: endDate(),
        status: "ACTIVE",
      },
      // Minimum well above a single-item cart → the gate rejects it (TC-217).
      {
        code: minOrderCouponCode,
        type: "FREE_DELIVERY",
        value: 0,
        minOrderAmount: Math.ceil(menuItemPrice) + 500,
        maxDiscount: 50,
        startDate: startDate(),
        endDate: endDate(),
        status: "ACTIVE",
      },
      // $1 cap → on a real delivery fee (> $1) only $1 is waived (TC-218).
      {
        code: cappedCouponCode,
        type: "FREE_DELIVERY",
        value: 0,
        minOrderAmount: 1,
        maxDiscount: 1,
        startDate: startDate(),
        endDate: endDate(),
        status: "ACTIVE",
      },
    ];

    for (const body of seeds) {
      const res = await createCouponRaw(accessToken, restaurantId, body);
      expect(res.ok, `coupon seed failed: ${JSON.stringify(res.data)}`).toBe(
        true
      );
    }
    const coupons = await getRestaurantCoupons(accessToken, restaurantId);
    for (const code of [couponCode, minOrderCouponCode, cappedCouponCode]) {
      expect(coupons.some((c) => c.code === code)).toBe(true);
    }
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
      // The specific delivery-only message (api:error.pricingCouponDeliveryOnly),
      // not just any rejection — this is the serviceType contract under test.
      await checkoutPage.assertCouponRejected(/only applies to delivery/i);
    });
  });

  test("TC-215: on a delivery order the code takes back the whole delivery fee", async ({
    page,
  }) => {
    await allure.description(
      "Select Delivery, resolve a fee quote, then apply the free-delivery " +
        "code: the coupon applies and the order summary shows the delivery fee " +
        "taken back in full by the FREE_DELIVERY line. Skips cleanly when the restaurant is pickup-only, " +
        "the geo proxy yields no suggestion, or delivery is not available at " +
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
      test.skip(
        !hasSuggestion,
        "The geo proxy returned no suggestion (external dependency)"
      );
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
      await expect(codePill(page, couponCode)).toBeVisible({
        timeout: 15_000,
      });
      // The summary renders the server breakdown: the fee stays on its own
      // line and a FREE_DELIVERY line takes all of it back.
      const lines = await waiverLines(page);
      const fee = lines.find((l) => l.kind === "DELIVERY_FEE");
      const waiver = lines.find((l) => l.kind === "FREE_DELIVERY");
      expect(fee?.amount, JSON.stringify(lines)).toBeGreaterThan(0);
      expect(waiver?.amount, JSON.stringify(lines)).toBeCloseTo(
        -fee!.amount,
        2
      );
      assertSums(lines, "wind checkout");
    });
  });

  test("TC-217: a free-delivery code below its minimum order is rejected", async ({
    page,
  }) => {
    await allure.description(
      "The margin guardrail: a FREE_DELIVERY coupon carries a minimum order. " +
        "Applying it to a cart below that minimum is rejected with the " +
        "'Order must be at least $X' message — the waiver never applies to a " +
        "tiny order."
    );
    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step(
      "Seed a single-item cart (below the minimum)",
      async () => {
        await checkoutPage.seedCart(
          restaurantId,
          menuItemId,
          menuItemName,
          menuItemPrice
        );
      }
    );

    await allure.step(`Apply ${minOrderCouponCode} → rejected`, async () => {
      await checkoutPage.applyCoupon(minOrderCouponCode);
      // Backend #1020/#1021 (2026-10): a code short of its minimum answers
      // "Add $X more to use this promotion (minimum $Y)." (api:…minOrderShortBy)
      // instead of "Order must be at least $Y".
      await checkoutPage.assertCouponRejected(
        /Add \$\d+\.\d{2} more to use this promotion \(minimum \$\d+\.\d{2}\)/
      );
    });
  });

  test("TC-218: a fee cap limits the waiver to the capped amount", async ({
    page,
  }) => {
    await allure.description(
      "A FREE_DELIVERY coupon with a $1 fee cap on a delivery order whose fee " +
        "exceeds $1: the summary's FREE_DELIVERY line takes back only $1 of the fee, " +
        "and the summary still adds up. Skips " +
        "cleanly on the same external-dependency conditions as TC-215."
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
      test.skip(
        !hasSuggestion,
        "The geo proxy returned no suggestion (external dependency)"
      );
      await suggestion.click();
      await checkoutPage.assertDeliveryQuoteResolved();
    });

    const quoteAvailable =
      (await page.getByText(/Delivery Available/i).count()) > 0;
    test.skip(
      !quoteAvailable,
      "Delivery not available at the test address on QA"
    );

    await allure.step(
      `Apply ${cappedCouponCode} → only $1 waived`,
      async () => {
        await checkoutPage.applyCoupon(cappedCouponCode);
        await expect(codePill(page, cappedCouponCode)).toBeVisible({
          timeout: 15_000,
        });
        // Only the $1 cap comes back off a fee larger than $1.
        const lines = await waiverLines(page);
        const fee = lines.find((l) => l.kind === "DELIVERY_FEE");
        const waiver = lines.find((l) => l.kind === "FREE_DELIVERY");
        expect(fee?.amount, JSON.stringify(lines)).toBeGreaterThan(1);
        expect(waiver?.amount, JSON.stringify(lines)).toBeCloseTo(-1, 2);
        assertSums(lines, "wind checkout");
        // No "total drops by $1" check: on QA the delivery fee is taxable, so
        // the waiver also lowers the tax. assertSums above already proves the
        // lines (fee, −$1 waiver, tax) add up to the total shown.
      }
    );
  });
});
