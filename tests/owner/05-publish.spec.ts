import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createOwnerPublishPage } from "../../pages/owner/OwnerPublishPage";
import { readSharedState } from "../../utils/testData";

const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Publish Restaurant", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Publish");
    await allure.label("severity", "critical");
  });

  test("TC-27: owner can reach the publish page and see the Publish Restaurant button", async ({ ownerPage }) => {
    await allure.description(
      "Owner navigates directly to the publish page for the seed restaurant and the Publish Restaurant button is visible."
    );

    const { restaurantId } = readSharedState();
    const publishPage = createOwnerPublishPage(ownerPage);

    await allure.step(`Navigate to publish page (id: ${restaurantId})`, async () => {
      await publishPage.goto(restaurantId);
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("URL", ownerPage.url());
    });

    await allure.step("Verify Publish Restaurant button is visible", async () => {
      await publishPage.assertPublishButtonVisible();
    });
  });

  test("TC-28: owner can see publish checklist items on the publish page", async ({ ownerPage }) => {
    await allure.description(
      "The publish checklist shows key requirement items the owner must complete before going live."
    );

    const { restaurantId } = readSharedState();
    const publishPage = createOwnerPublishPage(ownerPage);

    await allure.step("Navigate to publish page", async () => {
      await publishPage.goto(restaurantId);
    });

    await allure.step("Verify key checklist items are visible", async () => {
      for (const item of [
        "Hours of Operation",
        "Menu Setup",
        "Restaurant Information",
        "Payment Processing",
      ]) {
        await publishPage.assertChecklistItemVisible(item);
        await allure.parameter("Checklist item", item);
      }
    });
  });
});
