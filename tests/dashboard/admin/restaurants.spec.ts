import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
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

  test("TC-32: admin can navigate to the Restaurants tab and see the list @smoke", async ({
    adminPage,
  }) => {
    await allure.description(
      "The admin Restaurants tab loads a table of restaurants, and searching finds the seed restaurant's row."
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

    await allure.step("Verify the table lists restaurants", async () => {
      await expect(restaurantsPage.anyRow()).toBeVisible({ timeout: 15_000 });
    });

    // The list is server-paginated and sorted newest-first (QA holds 100+
    // restaurants, plus automation's per-run ones), so the long-lived seed
    // restaurant is not on page 1 — find it the way an admin does: search.
    await allure.step(
      `Search finds seed restaurant "${restaurantName}"`,
      async () => {
        await restaurantsPage.searchInput().fill(restaurantName.trim());
        await restaurantsPage.assertRestaurantRowVisible(restaurantName);
        await allure.parameter("restaurantName", restaurantName);
      }
    );
  });
});
