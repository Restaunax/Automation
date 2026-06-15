import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Restaurant Management Portal", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Restaurant Management");
    await allure.label("severity", "critical");
  });

  test("TC-15: owner can navigate to the restaurant management page and the portal shell loads", async ({ ownerPage }) => {
    await allure.description(
      "Navigating to /restaurant/restaurantId/:id/restaurantManagement loads the portal shell with a sidebar drawer."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);

    await allure.step(`Navigate to restaurant management (id: ${restaurantId})`, async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Verify portal shell drawer is visible", async () => {
      await mgmtPage.assertPortalShellLoaded();
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("URL", ownerPage.url());
    });
  });

  test("TC-16: owner can navigate to Store Settings via the sidebar", async ({ ownerPage }) => {
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
});
