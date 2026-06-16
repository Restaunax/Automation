import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../pages/owner/OwnerRestaurantManagementPage";
import { createOwnerOrdersPage } from "../../pages/owner/OwnerOrdersPage";
import { readSharedState } from "../../utils/testData";

const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Orders Tab", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Orders");
    await allure.label("severity", "critical");
  });

  test("TC-29: owner can navigate to the Orders tab and see the orders search bar", async ({ ownerPage }) => {
    await allure.description(
      "Clicking Orders in the portal sidebar loads the orders tab with a search bar and table column headers."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage   = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step(`Navigate to restaurant management (id: ${restaurantId})`, async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Click Orders in the sidebar", async () => {
      await ordersPage.navigateToOrdersTab();
    });

    await allure.step("Verify Orders tab loaded — search bar is visible", async () => {
      await ordersPage.assertOrdersTabLoaded();
      await allure.parameter("URL", ownerPage.url());
    });

    await allure.step("Verify Filters button is visible", async () => {
      await expect(ordersPage.filtersButton()).toBeVisible({ timeout: 10_000 });
    });
  });
});
