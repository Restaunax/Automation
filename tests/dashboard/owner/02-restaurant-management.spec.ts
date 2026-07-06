import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Restaurant Management Portal", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Restaurant Management");
    await allure.label("severity", "critical");
  });

  test("TC-15: owner can navigate to the restaurant management page and the portal shell loads", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Navigating to /restaurant/restaurantId/:id/restaurantManagement loads the portal shell with a sidebar drawer."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);

    await allure.step(
      `Navigate to restaurant management (id: ${restaurantId})`,
      async () => {
        await mgmtPage.goto(restaurantId);
      }
    );

    await allure.step("Verify portal shell drawer is visible", async () => {
      await mgmtPage.assertPortalShellLoaded();
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("URL", ownerPage.url());
    });
  });

  test("TC-16: owner can navigate to Store Settings via the sidebar", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Clicking Store Settings in the portal sidebar appends ?tab=Store%20Settings to the URL."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);

    await allure.step("Navigate to restaurant management portal", async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Click Store Settings in the sidebar", async () => {
      await mgmtPage.clickSidebarItem("Store Settings");
    });

    await allure.step("Verify URL contains tab=Store Settings", async () => {
      await expect(ownerPage).toHaveURL(/tab=Store/, { timeout: 10_000 });
      await allure.parameter("URL after click", ownerPage.url());
    });
  });

  test("TC-88: owner can edit and save a Store Settings field", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Changing the delivery order standard prep time and clicking Save changes PUTs the update and " +
        "shows a success toast. The test restores the original value afterward so it doesn't leave " +
        "the shared QA restaurant's data mutated."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    let originalValue = "";

    await allure.step("Navigate to Store Settings", async () => {
      await mgmtPage.goto(restaurantId);
      await mgmtPage.navigateToStoreSettings();
    });

    try {
      await allure.step("Change the delivery prep time and save", async () => {
        originalValue = await mgmtPage.deliveryPrepTimeInput().inputValue();
        const changedValue = String(Number(originalValue) + 1);
        await mgmtPage.setDeliveryPrepTime(changedValue);
        await mgmtPage.saveStoreSettings();
      });

      await allure.step("Verify the save succeeded", async () => {
        await mgmtPage.assertSettingsSavedToast();
      });
    } finally {
      // Restore in a finally so a mid-test failure can't leave the shared QA
      // restaurant's settings mutated. Best-effort: never mask the real result.
      if (originalValue) {
        try {
          await mgmtPage.setDeliveryPrepTime(originalValue);
          await mgmtPage.saveStoreSettings();
          await mgmtPage.assertSettingsSavedToast();
          await expect(mgmtPage.deliveryPrepTimeInput()).toHaveValue(
            originalValue
          );
        } catch (err) {
          console.warn(
            `[restaurant-management] Failed to restore prep time (${originalValue}):`,
            err
          );
        }
      }
    }
  });
});
