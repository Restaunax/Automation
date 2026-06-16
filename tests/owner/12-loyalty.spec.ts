import * as allure from "allure-js-commons";
import { test } from "../../fixtures/base";
import { createOwnerLoyaltyPage } from "../../pages/owner/OwnerLoyaltyPage";

const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Loyalty Program", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Loyalty");
    await allure.label("severity", "normal");
  });

  test("TC-37: owner can reach the Loyalty program page", async ({ ownerPage }) => {
    await allure.description(
      "The loyalty page at /restaurant/loyalty loads with a heading and rewards program setup options visible."
    );

    const loyaltyPage = createOwnerLoyaltyPage(ownerPage);

    await allure.step("Navigate to loyalty page", async () => {
      await loyaltyPage.goto();
      await allure.parameter("URL", ownerPage.url());
    });

    await allure.step("Verify loyalty heading is visible", async () => {
      await loyaltyPage.assertPageLoaded();
    });

    await allure.step("Verify rewards program content is visible", async () => {
      await loyaltyPage.assertSetupOptionVisible();
    });
  });
});
