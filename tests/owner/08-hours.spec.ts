import * as allure from "allure-js-commons";
import { test } from "../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../pages/owner/OwnerRestaurantManagementPage";
import { createOwnerHoursPage } from "../../pages/owner/OwnerHoursPage";
import { readSharedState } from "../../utils/testData";

const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Hours of Operation", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Hours");
    await allure.label("severity", "critical");
  });

  test("TC-33: owner can navigate to Hours of Operation and see days of the week", async ({ ownerPage }) => {
    await allure.description(
      "Clicking Hours in the portal sidebar loads the hours configuration with days of the week visible."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage  = createOwnerRestaurantManagementPage(ownerPage);
    const hoursPage = createOwnerHoursPage(ownerPage);

    await allure.step(`Navigate to restaurant management (id: ${restaurantId})`, async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Click Hours in the sidebar", async () => {
      await hoursPage.navigateToHoursTab();
    });

    await allure.step("Verify hours tab loaded — Monday is visible", async () => {
      await hoursPage.assertHoursTabLoaded();
      await allure.parameter("URL", ownerPage.url());
    });

    await allure.step("Verify all days of the week are shown", async () => {
      for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
        await hoursPage.assertDayVisible(day);
      }
    });
  });
});
