import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerMenuPage } from "../../../pages/dashboard/owner/OwnerMenuPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

// Shared across TC-20 to TC-45 within this file (workers: 1, sequential).
const TEST_CATEGORY_NAME = "Test Starters";
const TEST_CATEGORY_RENAMED = "Test Starters Edited";
const TEST_ITEM_NAME = "Automation Bruschetta";
const TEST_ITEM_RENAMED = "Automation Bruschetta Edited";

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

  test("TC-42: owner can edit a menu category name", async ({ ownerPage }) => {
    await allure.description(
      "Owner clicks the edit icon on a category, renames it, saves, and verifies the new name appears."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    await allure.step("Navigate to Menu tab", async () => {
      await mgmtPage.goto(restaurantId);
      await menuPage.navigateToMenuTab();
    });

    await allure.step(
      `Rename "${TEST_CATEGORY_NAME}" to "${TEST_CATEGORY_RENAMED}"`,
      async () => {
        await menuPage.editCategory(TEST_CATEGORY_NAME, TEST_CATEGORY_RENAMED);
        await allure.parameter("Old name", TEST_CATEGORY_NAME);
        await allure.parameter("New name", TEST_CATEGORY_RENAMED);
      }
    );

    await allure.step("Verify renamed category is visible", async () => {
      await menuPage.assertCategoryVisible(TEST_CATEGORY_RENAMED);
    });
  });

  test("TC-43: owner can edit a menu item name and price", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Owner clicks the edit icon on a menu item, changes the name and price, saves, and verifies the updated item."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    await allure.step("Navigate to Menu tab", async () => {
      await mgmtPage.goto(restaurantId);
      await menuPage.navigateToMenuTab();
    });

    await allure.step(
      `Edit item "${TEST_ITEM_NAME}" in "${TEST_CATEGORY_RENAMED}"`,
      async () => {
        await menuPage.editMenuItem(
          TEST_CATEGORY_RENAMED,
          TEST_ITEM_NAME,
          TEST_ITEM_RENAMED,
          "12.99"
        );
        await allure.parameter("Old name", TEST_ITEM_NAME);
        await allure.parameter("New name", TEST_ITEM_RENAMED);
        await allure.parameter("New price", "12.99");
      }
    );

    await allure.step("Verify updated item is visible", async () => {
      await menuPage.assertMenuItemUpdateToast();
    });
  });

  test("TC-44: owner can delete a menu item", async ({ ownerPage }) => {
    await allure.description(
      "Owner deletes a menu item from a category and verifies it no longer appears."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    await allure.step("Navigate to Menu tab", async () => {
      await mgmtPage.goto(restaurantId);
      await menuPage.navigateToMenuTab();
    });

    await allure.step(
      `Delete item "${TEST_ITEM_RENAMED}" from "${TEST_CATEGORY_RENAMED}"`,
      async () => {
        await menuPage.deleteMenuItem(TEST_CATEGORY_RENAMED, TEST_ITEM_RENAMED);
        await allure.parameter("Item", TEST_ITEM_RENAMED);
        await allure.parameter("Category", TEST_CATEGORY_RENAMED);
      }
    );

    await allure.step("Verify item is no longer visible", async () => {
      await menuPage.assertItemDeleted(
        TEST_CATEGORY_RENAMED,
        TEST_ITEM_RENAMED
      );
    });
  });

  test("TC-45: owner can delete a menu category", async ({ ownerPage }) => {
    await allure.description(
      "Owner deletes an empty category and verifies it no longer appears in the menu list."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    await allure.step("Navigate to Menu tab", async () => {
      await mgmtPage.goto(restaurantId);
      await menuPage.navigateToMenuTab();
    });

    await allure.step(
      `Delete category "${TEST_CATEGORY_RENAMED}"`,
      async () => {
        await menuPage.deleteCategory(TEST_CATEGORY_RENAMED);
        await allure.parameter("Category", TEST_CATEGORY_RENAMED);
      }
    );

    await allure.step("Verify category is no longer visible", async () => {
      await menuPage.assertCategoryDeleted(TEST_CATEGORY_RENAMED);
    });
  });
});
