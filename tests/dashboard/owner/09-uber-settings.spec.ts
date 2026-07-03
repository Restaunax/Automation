import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerUberSettingsPage } from "../../../pages/dashboard/owner/OwnerUberSettingsPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Uber Eats Delivery Settings", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Uber Eats Settings");
    await allure.label("severity", "normal");
  });

  test("TC-82: owner can reach the Uber Eats delivery settings page", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Owner navigates to /restaurant/restaurantId/:id/uber and the Uber Direct Delivery Settings " +
        "heading is visible — this route is owner-reachable (guard includes Role.OWNER), unlike " +
        "publish/tax/loyalty which are employee/admin-only."
    );

    const { restaurantId } = readSharedState();
    const uberPage = createOwnerUberSettingsPage(ownerPage);

    await allure.step("Navigate to Uber Eats settings", async () => {
      await uberPage.goto(restaurantId);
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("URL", ownerPage.url());
    });

    await allure.step(
      "Verify page loaded, not redirected to access-denied",
      async () => {
        await uberPage.assertPageLoaded();
        await expect(ownerPage).not.toHaveURL(/access-denied/);
      }
    );
  });

  test("TC-83: Uber Eats delivery settings page shows the delivery configuration section", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The page shows a Delivery Configuration section describing the mode/provider/environment."
    );

    const { restaurantId } = readSharedState();
    const uberPage = createOwnerUberSettingsPage(ownerPage);

    await allure.step("Navigate to Uber Eats settings", async () => {
      await uberPage.goto(restaurantId);
    });

    await allure.step(
      "Verify Delivery Configuration section is visible",
      async () => {
        await uberPage.assertDeliveryConfigVisible();
      }
    );
  });
});
