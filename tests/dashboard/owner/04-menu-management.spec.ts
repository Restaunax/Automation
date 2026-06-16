import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerMenuPage } from "../../../pages/dashboard/owner/OwnerMenuPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

// Shared across TC-20 and TC-21 within this file (workers: 1, sequential).
const TEST_CATEGORY_NAME = "Test Starters";

test.describe("Owner — Menu Management", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Menu Management");
    await allure.label("severity", "normal");
  });

  test("TC-19: owner can navigate to the Menu tab and see the category section", async ({
    ownerPage,
  }) => {
    await allure.description(
      "From the portal shell, clicking Menu in the sidebar reveals the category management UI."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    await allure.step("Navigate to restaurant management portal", async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Click Menu in the sidebar", async () => {
      await menuPage.navigateToMenuTab();
    });

    await allure.step("Verify Add Category button is visible", async () => {
      await expect(menuPage.addCategoryButton()).toBeVisible({
        timeout: 10_000,
      });
      await allure.parameter("restaurantId", restaurantId);
    });
  });

  test("TC-20: owner can create a new menu category", async ({ ownerPage }) => {
    await allure.description(
      "Owner clicks Add Category, types a name, saves it, and verifies the new category appears in the menu."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    await allure.step("Navigate to Menu tab", async () => {
      await mgmtPage.goto(restaurantId);
      await menuPage.navigateToMenuTab();
    });

    await allure.step(`Create category "${TEST_CATEGORY_NAME}"`, async () => {
      await menuPage.createCategory(TEST_CATEGORY_NAME);
      await allure.parameter("Category name", TEST_CATEGORY_NAME);
    });

    await allure.step(
      "Verify category is visible in the menu list",
      async () => {
        await menuPage.assertCategoryVisible(TEST_CATEGORY_NAME);
      }
    );
  });

  test("TC-21: owner can add a menu item to a category", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Owner adds a menu item with name, price, and description to an existing category."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    const ITEM_NAME = "Automation Bruschetta";
    const ITEM_PRICE = "9.99";
    const ITEM_DESCRIPTION = "Test item created by Playwright automation";

    await allure.step("Navigate to Menu tab", async () => {
      await mgmtPage.goto(restaurantId);
      await menuPage.navigateToMenuTab();
    });

    await allure.step(
      `Verify category "${TEST_CATEGORY_NAME}" exists`,
      async () => {
        await menuPage.assertCategoryVisible(TEST_CATEGORY_NAME);
      }
    );

    await allure.step(
      `Add item "${ITEM_NAME}" to "${TEST_CATEGORY_NAME}"`,
      async () => {
        await menuPage.createMenuItem(
          TEST_CATEGORY_NAME,
          ITEM_NAME,
          ITEM_PRICE,
          ITEM_DESCRIPTION
        );
        await allure.parameter("Item name", ITEM_NAME);
        await allure.parameter("Price", ITEM_PRICE);
        await allure.parameter("Category", TEST_CATEGORY_NAME);
      }
    );

    await allure.step("Verify success toast appears", async () => {
      await menuPage.assertMenuItemSuccessToast();
    });
  });
});
