import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerMenuPage } from "../../../pages/dashboard/owner/OwnerMenuPage";
import { readSharedState, generateRunId } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

const RUN_ID = generateRunId();
// RUN_ID (uuid-based) keeps names unique per run AND per retry — retries run
// in a fresh worker, so the module re-evaluates and a failed first attempt's
// category can't collide with the retry's. globalTeardown sweeps any
// "Test Starters *"/"TC45 Delete *" categories left behind (this run's and
// prior interrupted runs') via deleteAutomationMenuGroups.
const TEST_CATEGORY_NAME = `Test Starters ${RUN_ID}`;
const TEST_ITEM_NAME = `Automation Bruschetta ${RUN_ID}`;
const TEST_ITEM_PRICE = "9.99";
const TEST_ITEM_DESCRIPTION = "Test item created by Playwright automation";
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

  // ── Category & item CRUD ─────────────────────────────────────────────────
  // Navigation to the menu tab is shared via beforeEach so individual tests
  // focus on their specific assertion rather than repeating setup.
  //
  // Serial: TC-21 needs the category TC-20 created, and TC-43 needs the item
  // TC-21 created. Serial mode makes that dependency explicit — dependents are
  // skipped (not failed confusingly) when a predecessor fails, and the chain
  // survives --grep / retries / future parallelization changes.

  test.describe("Category and item CRUD", () => {
    test.describe.configure({ mode: "serial" });

    let restaurantId: string;
    let mgmtPage: ReturnType<typeof createOwnerRestaurantManagementPage>;
    let menuPage: ReturnType<typeof createOwnerMenuPage>;

    test.beforeEach(async ({ ownerPage }) => {
      ({ restaurantId } = readSharedState());
      mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
      menuPage = createOwnerMenuPage(ownerPage);
      await mgmtPage.goto(restaurantId);
      await menuPage.navigateToMenuTab();
    });

    test("TC-20: owner can create a new menu category", async () => {
      await allure.description(
        "Owner clicks New Category, types a name, saves it, and verifies the new category tab appears."
      );

      await allure.step(`Create category "${TEST_CATEGORY_NAME}"`, async () => {
        await menuPage.createCategory(TEST_CATEGORY_NAME);
        await allure.parameter("Category name", TEST_CATEGORY_NAME);
      });

      await allure.step("Verify category tab is visible", async () => {
        await menuPage.assertCategoryVisible(TEST_CATEGORY_NAME);
      });
    });

    test("TC-21: owner can add a menu item to a category", async () => {
      await allure.description(
        "Owner clicks 'Add [Category] Item', completes the 4-step wizard, and verifies the item appears on the menu page."
      );

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

      await allure.step(
        "Verify the item actually appears on the menu page",
        async () => {
          // Not just the toast: activate the category tab and confirm the
          // created item card really renders (i.e. the create persisted).
          await menuPage.activateCategory(TEST_CATEGORY_NAME);
          await menuPage.assertItemVisible(TEST_CATEGORY_NAME, TEST_ITEM_NAME);
        }
      );
    });

    test("TC-67: owner cannot delete a category that has items", async () => {
      await allure.description(
        "A category that still contains items must not be deletable — the owner-facing menu editor hides the category 'Delete' button until the category is empty, preventing accidental bulk-deletion of its items. (Runs after TC-21, which leaves an item in the category.)"
      );

      await allure.step(
        `Verify "${TEST_CATEGORY_NAME}" (holding "${TEST_ITEM_NAME}") exposes no Delete button`,
        async () => {
          await menuPage.assertCategoryNotDeletable(
            TEST_CATEGORY_NAME,
            TEST_ITEM_NAME
          );
          await allure.parameter("Category", TEST_CATEGORY_NAME);
          await allure.parameter("Item", TEST_ITEM_NAME);
        }
      );
    });

    test("TC-62: menu item wizard blocks Next when name and price are blank", async () => {
      await allure.description(
        "Opening the Add Item wizard and blurring name/price with both left blank shows inline " +
          "required-field errors and keeps the Next button disabled."
      );

      await allure.step("Open Add Item wizard for a category", async () => {
        await menuPage.openAddItemWizard(TEST_CATEGORY_NAME);
      });

      await allure.step(
        "Blur name and price without filling them",
        async () => {
          await menuPage.itemNameInput().press("Tab");
          await menuPage.basePriceInput().press("Tab");
        }
      );

      await allure.step(
        "Verify required-field errors and disabled Next button",
        async () => {
          await expect(menuPage.fieldErrors()).toContainText([
            "Item name is required",
            "Price is required",
          ]);
          await expect(menuPage.nextButton()).toBeDisabled();
        }
      );
    });

    test("TC-42: owner can edit a menu category name", async () => {
      test.skip(
        true,
        "Edit category name is not available in the current UI (no edit button on category header). " +
          "Category names can only be set at creation time."
      );
    });

    test("TC-43: owner can edit a menu item name and price", async () => {
      await allure.description(
        "Owner clicks Edit Item on an existing menu item, updates name and price in the wizard, and verifies the success toast."
      );

      const EDITED_NAME = `${TEST_ITEM_NAME} Edited`;
      const EDITED_PRICE = "12.99";

      await allure.step(`Click Edit on "${TEST_ITEM_NAME}"`, async () => {
        // Activate the category tab so its items are rendered in the DOM
        // before looking for the card — non-active panels may be unmounted.
        await menuPage.activateCategory(TEST_CATEGORY_NAME);
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

      await allure.step(
        "Verify the edited name actually appears on the menu page",
        async () => {
          // Not just the toast: the card must now show the edited name.
          await menuPage.activateCategory(TEST_CATEGORY_NAME);
          await menuPage.assertItemVisible(TEST_CATEGORY_NAME, EDITED_NAME);
        }
      );
    });

    test("TC-44: owner can delete a menu item", async () => {
      test.skip(
        true,
        "The menu item CARD has no delete button — only Edit Item and Clone Item. Item deletion lives on the " +
          "item DETAIL page (Delete → soft delete, gated by DELETE_MENU_ITEM) and is covered by TC-302 in " +
          "04c-menu-item-editor.spec.ts (plus the 409 deal-blocker path in TC-303)."
      );
    });

    test("TC-45: owner can delete a menu category", async () => {
      await allure.description(
        "Owner creates an empty category, then deletes it and verifies it no longer appears in the category tabs."
      );

      await allure.step(
        `Create empty category "${DELETE_CATEGORY_NAME}"`,
        async () => {
          await menuPage.createCategory(DELETE_CATEGORY_NAME);
          await allure.parameter("Category", DELETE_CATEGORY_NAME);
        }
      );

      await allure.step(
        `Delete category "${DELETE_CATEGORY_NAME}"`,
        async () => {
          await menuPage.deleteCategory(DELETE_CATEGORY_NAME);
        }
      );

      await allure.step("Verify category tab is gone", async () => {
        await menuPage.assertCategoryDeleted(DELETE_CATEGORY_NAME);
      });
    });
  });
});
