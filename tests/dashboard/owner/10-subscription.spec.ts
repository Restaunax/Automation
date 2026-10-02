import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerSubscriptionPage } from "../../../pages/dashboard/owner/OwnerSubscriptionPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Subscription & Billing", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Subscription");
    await allure.label("severity", "normal");
  });

  test("TC-84: owner can reach the Subscription Management page", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Owner navigates to /restaurant/restaurantId/:id/subscription — this route is permission-gated " +
        "(MODIFY_RESTAURANT), not role-gated, and the seed owner holds that permission."
    );

    const { restaurantId } = readSharedState();
    const subscriptionPage = createOwnerSubscriptionPage(ownerPage);

    await allure.step("Navigate to subscription page", async () => {
      await subscriptionPage.goto(restaurantId);
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("URL", ownerPage.url());
    });

    await allure.step(
      "Verify page loaded, not redirected to access-denied",
      async () => {
        await subscriptionPage.assertPageLoaded();
        await expect(ownerPage).not.toHaveURL(/access-denied/);
      }
    );
  });

  test("TC-85: subscription page shows plan details", async ({ ownerPage }) => {
    await allure.description(
      "The subscription page shows a Plan Details section with the current plan and price — " +
        "read-only assertions only, no mutation of the shared QA account's real billing state."
    );

    const { restaurantId } = readSharedState();
    const subscriptionPage = createOwnerSubscriptionPage(ownerPage);

    await allure.step("Navigate to subscription page", async () => {
      await subscriptionPage.goto(restaurantId);
    });

    await allure.step("Verify Plan Details section is visible", async () => {
      await subscriptionPage.assertPlanDetailsVisible();
    });
  });
});
