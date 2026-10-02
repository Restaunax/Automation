/**
 * 02-free-delivery-coupon.spec.ts — Device In Store (POS), API level.
 *
 * The POS (a React Native app) prices locally and relies on POST
 * /api/coupons/validate to (a) reject a FREE_DELIVERY code on a non-delivery
 * order and (b) hand back the fee-waiver estimate + cap it renders. This drives
 * that exact backend contract — the POS client's dependency — without the RN
 * app. The server-authoritative waiver at order creation is covered by the
 * backend's computeDeliveryWaiver unit tests; a full tablet create-order E2E is
 * deferred (it needs a live Uber quote + staff/register session harness).
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import {
  apiLogin,
  createCouponRaw,
  validateCouponRaw,
} from "../../utils/apiHelper";
import { readSharedState, generateCouponCode } from "../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("POS — Free-delivery coupon (validate contract)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  let restaurantId = "";
  // FREE_DELIVERY, minimum $1, fee cap $5. AUTO* → swept by globalTeardown.
  let couponCode = "";

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    ({ restaurantId } = readSharedState());
    couponCode = generateCouponCode();
    const res = await createCouponRaw(accessToken, restaurantId, {
      code: couponCode,
      type: "FREE_DELIVERY",
      value: 0,
      minOrderAmount: 1,
      maxDiscount: 5,
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: "ACTIVE",
    });
    expect(res.ok, `coupon seed failed: ${JSON.stringify(res.data)}`).toBe(
      true
    );
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS Free Delivery");
    await allure.label("severity", "critical");
  });

  test("TC-219: validate returns the capped waiver + cap for a DELIVERY order", async () => {
    await allure.description(
      "With serviceType DELIVERY and a fee above the cap, validate returns a " +
        "deliveryDiscount limited to the coupon's $5 cap and echoes the cap — " +
        "the values the POS renders as the waived-fee line."
    );
    const res = await validateCouponRaw({
      code: couponCode,
      restaurantId,
      orderAmount: 25,
      serviceType: "DELIVERY",
      deliveryFee: 8,
    });
    expect(res.ok, JSON.stringify(res.data)).toBe(true);
    expect(res.data.coupon?.type).toBe("FREE_DELIVERY");
    // min(fee 8, cap 5) = 5
    expect(res.data.deliveryDiscount).toBe(5);
    expect(res.data.coupon?.maxDiscount).toBe(5);
    // FREE_DELIVERY never discounts items.
    expect(res.data.discountAmount).toBe(0);
  });

  test("TC-220: validate rejects the code on a PICKUP order", async () => {
    await allure.description(
      "serviceType PICKUP → the backend rejects a FREE_DELIVERY code with the " +
        "delivery-only message; the POS surfaces it instead of applying a $0 " +
        "coupon."
    );
    const res = await validateCouponRaw({
      code: couponCode,
      restaurantId,
      orderAmount: 25,
      serviceType: "PICKUP",
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(String(res.data.message ?? res.data.error ?? "")).toMatch(
      /only applies to delivery/i
    );
  });

  test("TC-221: validate rejects an order below the minimum", async () => {
    await allure.description(
      "The margin guardrail applies at the POS too: an order below the coupon's " +
        "minimum is rejected before any waiver is computed."
    );
    const res = await validateCouponRaw({
      code: couponCode,
      restaurantId,
      orderAmount: 0.5,
      serviceType: "DELIVERY",
      deliveryFee: 8,
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(String(res.data.message ?? res.data.error ?? "")).toMatch(
      /must be at least/i
    );
  });
});
