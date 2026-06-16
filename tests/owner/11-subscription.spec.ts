import * as allure from "allure-js-commons";
import { test } from "../../fixtures/base";
import { createOwnerSubscriptionPage } from "../../pages/owner/OwnerSubscriptionPage";
import { readSharedState } from "../../utils/testData";

const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Billing & Subscription", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Subscription");
    await allure.label("severity", "normal");
  });

  test("TC-36: owner can reach the subscription page and see plan information", async ({ ownerPage }) => {
    await allure.description(
      "The subscription page at /restaurant/restaurantId/:id/subscription loads and shows the current plan details."
    );

    const { restaurantId } = readSharedState();
    const subscriptionPage = createOwnerSubscriptionPage(ownerPage);

    await allure.step(`Navigate to subscription page (id: ${restaurantId})`, async () => {
      await subscriptionPage.goto(restaurantId);
      await allure.parameter("restaurantId", restaurantId);
    });

    await allure.step("Verify subscription/plan content is visible", async () => {
      await subscriptionPage.assertPageLoaded();
      await allure.parameter("URL", ownerPage.url());
    });
  });
});
