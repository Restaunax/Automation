import * as allure from "allure-js-commons";
import { test } from "../../../fixtures/base";
import { createAdminRestaurantsPage } from "../../../pages/dashboard/admin/AdminRestaurantsPage";
import { readSharedState } from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Admin — Restaurant Management", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Admin Restaurants");
    await allure.label("severity", "critical");
  });

  test("TC-32: admin can navigate to the Restaurants tab and see the list", async ({
    adminPage,
  }) => {
    await allure.description(
      "The admin Restaurants tab loads a table with at least the seed restaurant visible."
    );

    const { restaurantName } = readSharedState();
    const restaurantsPage = createAdminRestaurantsPage(adminPage);

    await allure.step("Navigate to admin restaurants tab", async () => {
      await restaurantsPage.goto();
    });

    await allure.step("Verify page heading is visible", async () => {
      await restaurantsPage.assertPageLoaded();
      await allure.parameter("URL", adminPage.url());
    });

    await allure.step(
      `Verify seed restaurant "${restaurantName}" row is visible`,
      async () => {
        await restaurantsPage.assertRestaurantRowVisible(restaurantName);
        await allure.parameter("restaurantName", restaurantName);
      }
    );
  });
});
