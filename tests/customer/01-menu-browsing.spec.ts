import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerMenuPage } from "../../pages/customer/CustomerMenuPage";
import { readSharedState } from "../../utils/testData";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Customer — Menu Browsing", () => {
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

    const { restaurantId } = readSharedState();
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

    const { restaurantId, menuItemName } = readSharedState();
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
});
