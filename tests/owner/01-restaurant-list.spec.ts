import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createOwnerRestaurantListPage } from "../../pages/owner/OwnerRestaurantListPage";
import { readSharedState } from "../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — My Restaurants List", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Restaurant Management");
    await allure.label("severity", "critical");
  });

  test("TC-13: owner can reach /restaurant/stores and see the My Restaurants heading", async ({ ownerPage }) => {
    await allure.description(
      "Pre-authenticated owner navigates to /restaurant/stores and verifies the page heading."
    );

    const listPage = createOwnerRestaurantListPage(ownerPage);

    await allure.step("Navigate to My Restaurants page", async () => {
      await listPage.goto();
    });

    await allure.step("Verify My Restaurants heading is visible", async () => {
      await listPage.assertHeadingVisible();
      await allure.parameter("URL", ownerPage.url());
    });
  });

  test("TC-14: seed restaurant card is visible with the correct restaurant name", async ({ ownerPage }) => {
    await allure.description(
      "The restaurant created in globalSetup appears as a card on the list page."
    );

    const { restaurantName } = readSharedState();
    const listPage = createOwnerRestaurantListPage(ownerPage);

    await allure.step("Navigate to My Restaurants page", async () => {
      await listPage.goto();
    });

    await allure.step(`Verify card for "${restaurantName}" is visible`, async () => {
      await listPage.assertCardVisible(restaurantName);
      await allure.parameter("Restaurant name", restaurantName);
    });
  });
});
