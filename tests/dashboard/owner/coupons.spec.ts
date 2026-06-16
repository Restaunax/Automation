import { test } from "../../../fixtures/base";
import { createCouponsPage } from "../../../pages/dashboard/restaurant/CouponsPage";
import { readSharedState } from "../../../utils/testData";

/**
 * Owner — Coupons.
 *
 * GOTCHA: the Coupons tab only renders when the restaurant is entitled to the
 * COUPONS feature and is not a shipping/email-only store (see TEST_PLAN.md →
 * "Three gating layers"). Target a suitably-configured restaurant. SCAFFOLD.
 */
test.describe("Owner — Coupons", () => {
  test.fixme("TC-XXX: owner can create a coupon", async ({ ownerPage }) => {
    const { restaurantId } = readSharedState();
    const coupons = createCouponsPage(ownerPage);
    await coupons.goto(restaurantId);
    await coupons.startCreateCoupon();
    // Assert: TODO fill the coupon form and verify the coupon appears
  });
});
