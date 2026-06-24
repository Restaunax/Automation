import * as allure from "allure-js-commons";
import { test } from "../../../fixtures/base";
import { createOwnerTaxPage } from "../../../pages/dashboard/owner/OwnerTaxPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Tax Settings", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Restaurant Management");
    await allure.label("severity", "normal");
  });

  test("TC-17: owner can navigate to tax settings and see the tax rate form", async ({
    ownerPage,
  }) => {
    test.skip(
      true,
      "Tax settings page is restricted to ADMIN/EMPLOYEE roles — move to employee spec when employee credentials are available"
    );
    await allure.description(
      "Navigating directly to /restaurant/restaurantId/:id/tax renders the Tax Rate (%) input field."
    );

    const { restaurantId } = readSharedState();
    const taxPage = createOwnerTaxPage(ownerPage);

    await allure.step(
      `Navigate to tax settings (id: ${restaurantId})`,
      async () => {
        await taxPage.goto(restaurantId);
      }
    );

    await allure.step("Verify tax rate input is visible", async () => {
      await taxPage.assertFormVisible();
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("URL", ownerPage.url());
    });
  });

  test("TC-18: owner can set a tax rate and save — success toast appears", async ({
    ownerPage,
  }) => {
    test.skip(
      true,
      "Tax settings page is restricted to ADMIN/EMPLOYEE roles — move to employee spec when employee credentials are available"
    );
    await allure.description(
      "Owner fills in a tax rate value, saves, and verifies the success toast notification."
    );

    const { restaurantId } = readSharedState();
    const taxPage = createOwnerTaxPage(ownerPage);
    const TAX_RATE = "8.5";

    await allure.step("Navigate to tax settings", async () => {
      await taxPage.goto(restaurantId);
    });

    await allure.step(`Enter tax rate: ${TAX_RATE}%`, async () => {
      await taxPage.setTaxRate(TAX_RATE);
      await allure.parameter("Tax rate", TAX_RATE);
    });

    await allure.step("Click Save Tax Settings", async () => {
      await taxPage.save();
    });

    await allure.step("Verify success toast appears", async () => {
      await taxPage.assertSuccessToast();
    });
  });
});
