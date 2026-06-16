import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../pages/owner/OwnerRestaurantManagementPage";
import { createOwnerEditRestaurantInfoPage } from "../../pages/owner/OwnerEditRestaurantInfoPage";
import { readSharedState } from "../../utils/testData";

const OWNER_EMAIL    = process.env.OWNER_EMAIL    ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Edit Restaurant Info", () => {
  test.skip(!OWNER_EMAIL || !OWNER_PASSWORD, "OWNER_EMAIL / OWNER_PASSWORD not set in .env");

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Edit Restaurant Info");
    await allure.label("severity", "critical");
  });

  test("TC-40: owner can open the Restaurant Info form and see key fields", async ({ ownerPage }) => {
    await allure.description(
      "Navigating to Store Settings → Restaurant Info shows a form with the restaurant name field and other editable details."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const infoPage = createOwnerEditRestaurantInfoPage(ownerPage);

    await allure.step(`Navigate to restaurant management (id: ${restaurantId})`, async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Expand Store Settings and open Restaurant Info", async () => {
      await infoPage.navigateToRestaurantInfo();
    });

    await allure.step("Verify restaurant name input is visible", async () => {
      await infoPage.assertFormVisible();
      await allure.parameter("URL", ownerPage.url());
    });

    await allure.step("Verify phone input is visible", async () => {
      await expect(infoPage.phoneInput()).toBeVisible({ timeout: 10_000 });
    });
  });

  test("TC-41: owner can edit the restaurant phone number and save", async ({ ownerPage }) => {
    await allure.description(
      "An owner can change the restaurant phone number and save — receiving a success confirmation."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const infoPage = createOwnerEditRestaurantInfoPage(ownerPage);

    const testPhone = "5551234567";

    await allure.step(`Navigate to restaurant management (id: ${restaurantId})`, async () => {
      await mgmtPage.goto(restaurantId);
    });

    await allure.step("Open Restaurant Info form", async () => {
      await infoPage.navigateToRestaurantInfo();
    });

    await allure.step("Update phone number", async () => {
      await infoPage.editPhoneNumber(testPhone);
      await allure.parameter("Phone", testPhone);
    });

    await allure.step("Save and verify success message", async () => {
      await infoPage.save();
      await infoPage.assertSuccessToast();
    });
  });
});
