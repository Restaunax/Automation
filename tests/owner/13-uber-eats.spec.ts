import * as allure from "allure-js-commons";
import { test } from "../../fixtures/base";
import { createOwnerUberEatsPage } from "../../pages/owner/OwnerUberEatsPage";
import { readSharedState } from "../../utils/testData";

const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Uber Eats Integration", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Uber Eats");
    await allure.label("severity", "normal");
  });

  test("TC-38: owner can reach the Uber Eats settings page", async ({ ownerPage }) => {
    await allure.description(
      "The Uber Eats settings page at /restaurant/restaurantId/:id/uber loads and shows the integration configuration."
    );

    const { restaurantId } = readSharedState();
    const uberEatsPage = createOwnerUberEatsPage(ownerPage);

    await allure.step(`Navigate to Uber Eats settings (id: ${restaurantId})`, async () => {
      await uberEatsPage.goto(restaurantId);
      await allure.parameter("restaurantId", restaurantId);
    });

    await allure.step("Verify Uber Eats page content is visible", async () => {
      await uberEatsPage.assertPageLoaded();
      await allure.parameter("URL", ownerPage.url());
    });
  });
});
