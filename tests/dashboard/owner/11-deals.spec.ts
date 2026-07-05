import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerDealsPage } from "../../../pages/dashboard/owner/OwnerDealsPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Deals", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Deals");
    await allure.label("severity", "normal");
  });

  test("TC-86: owner can reach the Manage Deals tab", async ({ ownerPage }) => {
    await allure.description(
      "Owner expands the Deals flyout section in the sidebar and clicks Manage Deals, landing on " +
        "?tab=deals with the Manage Deals heading visible."
    );

    const { restaurantId } = readSharedState();
    const dealsPage = createOwnerDealsPage(ownerPage);

    await allure.step("Navigate to Manage Deals", async () => {
      await dealsPage.navigateToManageDeals(restaurantId);
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("URL", ownerPage.url());
    });

    await allure.step("Verify Manage Deals tab loaded", async () => {
      await dealsPage.assertManageDealsLoaded();
    });
  });

  test("TC-87: Manage Deals tab shows the Create Deal action", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The Manage Deals tab exposes a Create Deal button — navigation-only coverage for now; a full " +
        "create-and-cleanup flow needs a deals API helper that doesn't exist yet."
    );

    const { restaurantId } = readSharedState();
    const dealsPage = createOwnerDealsPage(ownerPage);

    await allure.step("Navigate to Manage Deals", async () => {
      await dealsPage.navigateToManageDeals(restaurantId);
    });

    await allure.step("Verify Create Deal button is visible", async () => {
      await expect(dealsPage.createDealButton()).toBeVisible({
        timeout: 10_000,
      });
    });
  });
});
