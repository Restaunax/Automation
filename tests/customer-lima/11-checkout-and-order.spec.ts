import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaCheckoutPage } from "../../pages/lima/LimaCheckoutPage";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { STRIPE_CARDS } from "../../utils/stripeCards";
import { fillStripePaymentElement } from "../../utils/stripeHelper";
import {
  generateUserEmail,
  generateSeedPhone,
  readRestaurantSlug,
  readSharedState,
} from "../../utils/testData";

/**
 * Ordering parity — checkout and payment.
 *
 * The money path. Everything upstream is only worth having if an order can
 * actually be placed and paid for under a tenant basename.
 */
test.describe("Lima — checkout and payment", () => {
  const restaurantSlug = readRestaurantSlug();

  test.skip(!restaurantSlug, "Ordering slug not seeded");

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering");
    await allure.label("severity", "blocker");
  });

  /** Menu → item → cart. Lima's coupon box lives here, not on checkout. */
  const reachCart = async (
    page: Parameters<typeof createLimaStorefrontPage>[0]
  ) => {
    const state = readSharedState();
    const lima = createLimaStorefrontPage(page);
    const checkout = createLimaCheckoutPage(page);

    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    await lima.openItemModal(state.menuItemName);
    await lima.clickAddToCart();

    await page.goto(`${lima.tenantRoot(restaurantSlug)}/cart`, {
      waitUntil: "domcontentloaded",
    });
    await expect(checkout.proceedToCheckoutButton()).toBeVisible({
      timeout: 20_000,
    });
    return { lima, checkout };
  };

  /** … → checkout, Pickup chosen and the customer form filled. */
  const reachCheckout = async (
    page: Parameters<typeof createLimaStorefrontPage>[0]
  ) => {
    const { lima, checkout } = await reachCart(page);
    await checkout.goToCheckout();

    // Fresh context → the service slice defaults to PICKUP; prove it rather
    // than assume it (a delivery order would need an address to validate).
    await checkout.assertPickupSelected();

    await checkout.fillCustomerInfo({
      firstName: "Auto",
      lastName: "Lima",
      email: generateUserEmail("lima"),
      phone: generateSeedPhone(),
    });

    return { lima, checkout };
  };

  test("TC-L40: a customer can complete an order and reach confirmation @smoke", async ({
    page,
  }) => {
    await allure.description(
      "Full path with a Stripe test card, on the shared ordering host under a " +
        "path slug. Confirms the order lands and the confirmation URL stays " +
        "inside the tenant."
    );

    const { checkout } = await reachCheckout(page);

    await allure.step("Pay with a succeeding test card", async () => {
      await checkout.proceedToPayment();
      await fillStripePaymentElement(page, STRIPE_CARDS.VISA_SUCCESS);
      await checkout.placeOrder();
    });

    await checkout.assertOrderConfirmed();
    // The confirmation is a route like any other — it must not escape the slug.
    expect(page.url()).toContain(`/${restaurantSlug}/order-confirmation/`);
  });

  test("TC-L41: a declined card shows an error and places no order", async ({
    page,
  }) => {
    const { checkout } = await reachCheckout(page);

    await checkout.proceedToPayment();
    await fillStripePaymentElement(page, STRIPE_CARDS.DECLINED);
    await checkout.placeOrder();

    // PaymentSection surfaces Stripe's own decline message in an error Alert.
    await expect(
      page.getByRole("alert").filter({ hasText: /declined/i })
    ).toBeVisible({ timeout: 30_000 });
    // Still on checkout: a declined card must not advance the customer.
    await checkout.assertOnCheckout();
    expect(page.url()).not.toContain("order-confirmation");
  });

  test("TC-L42: an invalid coupon is rejected", async ({ page }) => {
    // Lima validates coupons on the CART (ShoppingCart → POST
    // /api/coupons/validate); checkout has no coupon box.
    const { checkout } = await reachCart(page);

    const before = await checkout.readCartTotal();
    const [resp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes("/api/coupons/validate") &&
          r.request().method() === "POST"
      ),
      checkout.applyCoupon("DEFINITELY-NOT-A-REAL-CODE"),
    ]);

    // Unknown code → 404 with success:false; the cart shows the server's own
    // message (not a client-side guess) under the box.
    expect(resp.status()).toBe(404);
    const body = (await resp.json()) as { success: boolean; message: string };
    expect(body.success).toBe(false);
    await expect(page.getByText(body.message, { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    // Not applied: the code stays in the box (an applied coupon clears it).
    await expect(checkout.couponInput()).toHaveValue(
      "DEFINITELY-NOT-A-REAL-CODE"
    );

    const after = await checkout.readCartTotal();
    await allure.parameter("total before", String(before));
    await allure.parameter("total after", String(after));
    // A rejected code must not quietly move the total.
    expect(before).not.toBeNull();
    expect(after).toBe(before);
  });

  test("TC-L43: an invalid gift card is rejected", async ({ page }) => {
    const { checkout } = await reachCheckout(page);

    const input = checkout.giftCardInput();
    test.skip(
      (await input.count()) === 0,
      "Gift cards not enabled for the seed restaurant"
    );

    const before = await checkout.readTotal();
    await input.fill("0000-0000-0000-0000");
    await page
      .getByRole("button", { name: /^apply$/i })
      .last()
      .click();

    // GiftCardSection marks the field invalid and shows a caption — never a
    // role=alert — and applies nothing.
    await expect(input).toHaveAttribute("aria-invalid", "true", {
      timeout: 20_000,
    });
    await expect(checkout.giftCardAppliedBanner()).toHaveCount(0);
    const after = await checkout.readTotal();
    expect(before).not.toBeNull();
    expect(after).toBe(before);
  });
});
