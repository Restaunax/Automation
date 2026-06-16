import * as allure from "allure-js-commons";
import { test } from "../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../pages/owner/OwnerRestaurantManagementPage";
import { createOwnerAnalyticsPage } from "../../pages/owner/OwnerAnalyticsPage";
import { readSharedState } from "../../utils/testData";

const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Analytics Dashboard", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Analytics");
    await allure.label("severity", "normal");
  });

  test("TC-35: owner can navigate to Analytics and see summary metrics", async ({ ownerPage }) => {
    await allure.description(
      "Clicking Analytics in the portal sidebar loads the analytics dashboard with revenue or order summary metrics."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage      = createOwnerRestaurantManagementPage(ownerPage);
    const analyticsPage = createOwnerAnalyticsPage(ownerPage);

    await allure.step(`Navigate to restaurant management (id: ${restaurantId})`, async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Click Analytics in the sidebar", async () => {
      await analyticsPage.navigateToAnalyticsTab();
    });

    await allure.step("Verify analytics tab loaded — summary metric visible", async () => {
      await analyticsPage.assertAnalyticsTabLoaded();
      await allure.parameter("URL", ownerPage.url());
    });
  });
});
