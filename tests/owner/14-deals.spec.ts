import * as allure from "allure-js-commons";
import { test } from "../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../pages/owner/OwnerRestaurantManagementPage";
import { createOwnerDealsPage } from "../../pages/owner/OwnerDealsPage";
import { readSharedState } from "../../utils/testData";

const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Deals", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Deals");
    await allure.label("severity", "normal");
  });

  test("TC-39: owner can navigate to Deals and see the Create Deal button", async ({ ownerPage }) => {
    await allure.description(
      "Clicking Deals in the portal sidebar loads the deals management area with a Create Deal button."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage  = createOwnerRestaurantManagementPage(ownerPage);
    const dealsPage = createOwnerDealsPage(ownerPage);

    await allure.step(`Navigate to restaurant management (id: ${restaurantId})`, async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Click Deals in the sidebar", async () => {
      await dealsPage.navigateToDealsTab();
    });

    await allure.step("Verify deals tab loaded — Create Deal button visible", async () => {
      await dealsPage.assertDealsTabLoaded();
      await allure.parameter("URL", ownerPage.url());
    });
  });
});
