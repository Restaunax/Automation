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

  /** Menu → item → cart → checkout, with the customer form filled. */
  const reachCheckout = async (
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
    await checkout.goToCheckout();

    await checkout
      .serviceTypeButton("PICKUP")
      .click()
      .catch(() => {
        // Pickup is usually the default; only click it when offered.
      });

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
      await fillStripePaymentElement(page, STRIPE_CARDS.VISA_SUCCESS);
      await checkout.placeOrderButton().click();
    });

    await checkout.assertOrderConfirmed();
    // The confirmation is a route like any other — it must not escape the slug.
    expect(page.url()).toContain(`/${restaurantSlug}/order-confirmation/`);
  });

  test("TC-L41: a declined card shows an error and places no order", async ({
    page,
  }) => {
    const { checkout } = await reachCheckout(page);

    await fillStripePaymentElement(page, STRIPE_CARDS.DECLINED);
    await checkout.placeOrderButton().click();

    await expect(checkout.errorAlert()).toBeVisible({ timeout: 30_000 });
    // Still on checkout: a declined card must not advance the customer.
    await checkout.assertOnCheckout();
    expect(page.url()).not.toContain("order-confirmation");
  });

  test("TC-L42: an invalid coupon is rejected", async ({ page }) => {
    const { checkout } = await reachCheckout(page);

    const before = await checkout.readTotal();
    await checkout.applyCoupon("DEFINITELY-NOT-A-REAL-CODE");

    await expect(checkout.errorAlert()).toBeVisible({ timeout: 20_000 });
    const after = await checkout.readTotal();
    await allure.parameter("total before", String(before));
    await allure.parameter("total after", String(after));
    // A rejected code must not quietly move the total.
    if (before !== null && after !== null) expect(after).toBe(before);
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
    await page.getByRole("button", { name: /apply/i }).last().click();

    await expect(checkout.errorAlert()).toBeVisible({ timeout: 20_000 });
    const after = await checkout.readTotal();
    if (before !== null && after !== null) expect(after).toBe(before);
  });
});
