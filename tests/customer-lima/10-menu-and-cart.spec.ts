import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaCheckoutPage } from "../../pages/lima/LimaCheckoutPage";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { readRestaurantSlug, readSharedState } from "../../utils/testData";

/**
 * Ordering parity — menu browse through cart.
 *
 * These mirror the journey tests/customer covers for template-wind. They are
 * not a copy: same assertions, Lima's own locators, because the two apps share
 * a REST contract and nothing else.
 */
test.describe("Lima — menu and cart", () => {
  const restaurantSlug = readRestaurantSlug();

  test.skip(!restaurantSlug, "Ordering slug not seeded");

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-L30: the menu renders the seed item @smoke", async ({ page }) => {
    const state = readSharedState();
    const lima = createLimaStorefrontPage(page);

    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();

    await expect(lima.menuItemCard(state.menuItemName)).toBeVisible({
      timeout: 20_000,
    });
  });

  test("TC-L31: opening an item shows Add to Cart @smoke", async ({ page }) => {
    const state = readSharedState();
    const lima = createLimaStorefrontPage(page);

    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    await lima.openItemModal(state.menuItemName);

    await expect(lima.addToCartButton()).toBeVisible({ timeout: 15_000 });
  });

  test("TC-L32: adding an item and proceeding reaches checkout @smoke", async ({
    page,
  }) => {
    await allure.description(
      "The core journey: menu → item → cart → checkout, entirely through the " +
        "real UI, under a tenant basename."
    );

    const state = readSharedState();
    const lima = createLimaStorefrontPage(page);
    const checkout = createLimaCheckoutPage(page);

    await allure.step("Add the seed item", async () => {
      await lima.gotoMenu(restaurantSlug);
      await lima.assertOnMenu();
      await lima.openItemModal(state.menuItemName);
      await lima.clickAddToCart();
      expect(await lima.cartBadgeCount()).toBeGreaterThan(0);
    });

    await allure.step("Open the cart and proceed", async () => {
      await page.goto(`${lima.tenantRoot(restaurantSlug)}/cart`, {
        waitUntil: "domcontentloaded",
      });
      await checkout.goToCheckout();
    });

    // Every hop must stay inside the tenant — this is where a lost basename
    // would surface as a customer on the origin root.
    expect(page.url()).toContain(`/${restaurantSlug}/checkout`);
  });

  test("TC-L33: the cart survives a reload", async ({ page }) => {
    await allure.description(
      "Session-scoped and tenant-namespaced, but it must still persist within " +
        "the tenant — a customer who refreshes mid-order should not lose it."
    );

    const state = readSharedState();
    const lima = createLimaStorefrontPage(page);

    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    await lima.openItemModal(state.menuItemName);
    await lima.clickAddToCart();
    const before = await lima.cartBadgeCount();
    expect(before).toBeGreaterThan(0);

    await page.reload({ waitUntil: "domcontentloaded" });

    expect(await lima.cartBadgeCount()).toBe(before);
  });

  test("TC-L34: checkout with an empty cart does not offer payment", async ({
    page,
  }) => {
    const lima = createLimaStorefrontPage(page);
    const checkout = createLimaCheckoutPage(page);

    await page.goto(`${lima.tenantRoot(restaurantSlug)}/checkout`, {
      waitUntil: "domcontentloaded",
    });

    // Either an explicit empty-cart message or simply no way to pay — both are
    // correct; silently offering to charge for nothing is not.
    const hasEmptyMessage = await checkout
      .emptyCartMessage()
      .isVisible()
      .catch(() => false);
    const canPay = await checkout
      .placeOrderButton()
      .isVisible()
      .catch(() => false);

    await allure.parameter("empty message", String(hasEmptyMessage));
    await allure.parameter("pay button visible", String(canPay));
    expect(hasEmptyMessage || !canPay).toBe(true);
  });
});
