import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerMenuPage } from "../../../pages/dashboard/owner/OwnerMenuPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

// Unique suffix prevents duplicate-name errors when tests re-run against the
// same restaurant without a cleanup step between runs.
const RUN_ID = Date.now().toString().slice(-5);

// Shared names for TC-20 → TC-21 (sequential within this file).
const TEST_CATEGORY_NAME = `Test Starters ${RUN_ID}`;
const TEST_ITEM_NAME = "Automation Bruschetta";
const TEST_ITEM_PRICE = "9.99";
const TEST_ITEM_DESCRIPTION = "Test item created by Playwright automation";

// Name for the isolated delete test in TC-45 (does not depend on prior tests).
const DELETE_CATEGORY_NAME = `TC45 Delete ${RUN_ID}`;

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
      "From the restaurant management portal, navigating to the menu editor reveals the 'New Category' button."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    await allure.step("Navigate to restaurant management portal", async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Navigate to the menu editor", async () => {
      await menuPage.navigateToMenuTab();
    });

    await allure.step("Verify New Category button is visible", async () => {
      await expect(menuPage.addCategoryButton()).toBeVisible({
        timeout: 10_000,
      });
      await allure.parameter("restaurantId", restaurantId);
    });
  });

  test("TC-20: owner can create a new menu category", async ({ ownerPage }) => {
    await allure.description(
      "Owner clicks New Category, types a name, saves it, and verifies the new category tab appears."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    await allure.step("Navigate to Menu editor", async () => {
      await mgmtPage.goto(restaurantId);
      await menuPage.navigateToMenuTab();
    });

    await allure.step(`Create category "${TEST_CATEGORY_NAME}"`, async () => {
      await menuPage.createCategory(TEST_CATEGORY_NAME);
      await allure.parameter("Category name", TEST_CATEGORY_NAME);
    });

    await allure.step("Verify category tab is visible", async () => {
      await menuPage.assertCategoryVisible(TEST_CATEGORY_NAME);
    });
  });

  test("TC-21: owner can add a menu item to a category", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Owner clicks 'Add [Category] Item', completes the 4-step wizard, and verifies the item appears on the menu page."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    await allure.step("Navigate to Menu editor", async () => {
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
      `Add item "${TEST_ITEM_NAME}" to "${TEST_CATEGORY_NAME}"`,
      async () => {
        await menuPage.createMenuItem(
          TEST_CATEGORY_NAME,
          TEST_ITEM_NAME,
          TEST_ITEM_PRICE,
          TEST_ITEM_DESCRIPTION
        );
        await allure.parameter("Item name", TEST_ITEM_NAME);
        await allure.parameter("Price", TEST_ITEM_PRICE);
        await allure.parameter("Category", TEST_CATEGORY_NAME);
      }
    );

    await allure.step("Verify success toast appears", async () => {
      await menuPage.assertMenuItemSuccessToast();
    });
  });

  test("TC-42: owner can edit a menu category name", async () => {
    test.skip(
      true,
      "Edit category name is not available in the current UI (no edit button on category header). " +
        "Category names can only be set at creation time."
    );
  });

  test("TC-43: owner can edit a menu item name and price", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Owner clicks Edit Item on an existing menu item, updates name and price in the wizard, and verifies the success toast."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);
    const EDITED_NAME = `${TEST_ITEM_NAME} Edited`;
    const EDITED_PRICE = "12.99";

    await allure.step("Navigate to Menu editor", async () => {
      await mgmtPage.goto(restaurantId);
      await menuPage.navigateToMenuTab();
    });

    await allure.step(`Click Edit on "${TEST_ITEM_NAME}"`, async () => {
      await menuPage.clickEditItem(TEST_ITEM_NAME);
      await allure.parameter("Item", TEST_ITEM_NAME);
    });

    await allure.step(
      "Update name and price in wizard, then save",
      async () => {
        await menuPage.editItemInWizard(EDITED_NAME, EDITED_PRICE);
        await allure.parameter("New name", EDITED_NAME);
        await allure.parameter("New price", EDITED_PRICE);
      }
    );

    await allure.step("Verify edit success toast", async () => {
      await menuPage.assertEditSuccessToast();
    });
  });

  test("TC-44: owner can delete a menu item", async () => {
    test.skip(
      true,
      "The current menu item card UI has no delete button — only Edit Item and Clone Item icon buttons. " +
        "Item deletion is not available from the owner-facing menu editor."
    );
  });

  test("TC-45: owner can delete a menu category", async ({ ownerPage }) => {
    await allure.description(
      "Owner creates an empty category, then deletes it and verifies it no longer appears in the category tabs."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const menuPage = createOwnerMenuPage(ownerPage);

    await allure.step("Navigate to Menu editor", async () => {
      await mgmtPage.goto(restaurantId);
      await menuPage.navigateToMenuTab();
    });

    await allure.step(
      `Create empty category "${DELETE_CATEGORY_NAME}"`,
      async () => {
        await menuPage.createCategory(DELETE_CATEGORY_NAME);
        await allure.parameter("Category", DELETE_CATEGORY_NAME);
      }
    );

    await allure.step(`Delete category "${DELETE_CATEGORY_NAME}"`, async () => {
      await menuPage.deleteCategory(DELETE_CATEGORY_NAME);
    });

    await allure.step("Verify category tab is gone", async () => {
      await menuPage.assertCategoryDeleted(DELETE_CATEGORY_NAME);
    });
  });
});
