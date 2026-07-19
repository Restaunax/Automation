import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerMenuPage } from "../../pages/customer/CustomerMenuPage";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { readSharedState, readRestaurantId } from "../../utils/testData";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Customer — Menu Browsing", () => {
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

  test("TC-22: customer can reach the menu page for the seed restaurant", async ({
    page,
  }) => {
    await allure.description(
      "Unauthenticated customer navigates to /menu?restaurantId=<id> and the page loads."
    );

    const restaurantId = readRestaurantId();
    const menuPage = createCustomerMenuPage(page);

    await allure.step(
      `Navigate to menu (restaurantId: ${restaurantId})`,
      async () => {
        await menuPage.goto(restaurantId);
      }
    );

    await allure.step("Verify URL contains /menu", async () => {
      await menuPage.assertPageLoaded();
      await allure.parameter("URL", page.url());
      await allure.parameter("restaurantId", restaurantId);
    });
  });

  test("TC-23: customer can open the seed menu item modal and see Add to Cart button", async ({
    page,
  }) => {
    await allure.description(
      "Customer clicks the seed menu item card, the item modal opens, and the Add to Cart button is visible."
    );

    const restaurantId = readRestaurantId();
    const { menuItemName } = readSharedState();
    const menuPage = createCustomerMenuPage(page);

    await allure.step("Navigate to menu page", async () => {
      await menuPage.goto(restaurantId);
    });

    await allure.step(`Click item card: "${menuItemName}"`, async () => {
      await menuPage.openItemModal(menuItemName);
      await allure.parameter("Item", menuItemName);
    });

    await allure.step("Verify item modal is open", async () => {
      await menuPage.assertItemModalOpen();
    });

    await allure.step("Verify Add to Cart button is visible", async () => {
      await expect(menuPage.addToCartButton()).toBeVisible({ timeout: 10_000 });
    });
  });

  test("TC-184: the ?item= deep link auto-opens that item's modal", async ({
    page,
  }) => {
    await allure.description(
      "MenuPage's landing-page deep link: /menu?restaurantId=<id>&item=<itemId> auto-opens the " +
        "item modal (and scrolls to its group) once the menu loads — no card click needed."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName } = readSharedState();
    const menuPage = createCustomerMenuPage(page);

    await allure.step(`Deep-link to item "${menuItemName}"`, async () => {
      await menuPage.gotoWithItem(restaurantId, menuItemId);
      await allure.parameter("itemId", menuItemId);
    });

    await allure.step("Verify the item modal opened by itself", async () => {
      await menuPage.assertItemModalOpen();
    });
  });

  test("TC-99: customer can add an item to the cart and reach checkout through the real UI flow", async ({
    page,
  }) => {
    await allure.description(
      "The one true end-to-end cart path: open the item modal, click Add to Cart, open the cart via " +
        "the floating View Cart button, and click through to /checkout. Every other checkout test " +
        "seeds the cart via sessionStorage for speed — this test is the safety net that the real " +
        "add-to-cart wiring (and the cart storage schema seedCart mimics) actually works."
    );

    const restaurantId = readRestaurantId();
    const { menuItemName } = readSharedState();
    const menuPage = createCustomerMenuPage(page);
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Navigate to menu and open the item modal", async () => {
      await menuPage.goto(restaurantId);
      await menuPage.openItemModal(menuItemName);
      await menuPage.assertItemModalOpen();
      await allure.parameter("Item", menuItemName);
    });

    await allure.step("Add the item to the cart", async () => {
      await menuPage.clickAddToCart();
      await menuPage.assertCartButtonVisible();
    });

    await allure.step("Open the cart and proceed to checkout", async () => {
      await menuPage.openCart();
      await menuPage.proceedToCheckout();
      await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 });
    });

    await allure.step("Verify the checkout form renders", async () => {
      await checkoutPage.assertFormVisible();
      await allure.parameter("URL", page.url());
    });
  });
});
