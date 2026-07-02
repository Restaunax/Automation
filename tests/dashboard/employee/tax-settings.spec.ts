import * as allure from "allure-js-commons";
import { test } from "../../../fixtures/base";
import { createOwnerTaxPage } from "../../../pages/dashboard/owner/OwnerTaxPage";
import { readSharedState } from "../../../utils/testData";

const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? "";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? "";

/**
 * Employee — Tax settings (/restaurant/restaurantId/:id/tax).
 *
 * Route allows [ADMIN, EMPLOYEE] only — OWNER is denied (see TEST_PLAN.md role
 * model). These tests originally lived in tests/dashboard/owner/03-tax-settings
 * as permanent skips; moved here now that the employeePage fixture and
 * EMPLOYEE auth session exist. The tax-page POM is role-agnostic — reused from
 * pages/dashboard/owner/OwnerTaxPage.
 */
test.describe("Employee — Tax Settings", () => {
  test.skip(
    !EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD,
    "EMPLOYEE_EMAIL / EMPLOYEE_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Employee Restaurant Setup");
    await allure.label("severity", "normal");
  });

  test("TC-17: employee can navigate to tax settings and see the tax rate form", async ({
    employeePage,
  }) => {
    await allure.description(
      "Navigating directly to /restaurant/restaurantId/:id/tax renders the Tax Rate (%) input field."
    );

    const { restaurantId } = readSharedState();
    const taxPage = createOwnerTaxPage(employeePage);

    await allure.step(
      `Navigate to tax settings (id: ${restaurantId})`,
      async () => {
        await taxPage.goto(restaurantId);
      }
    );

    await allure.step("Verify tax rate input is visible", async () => {
      await taxPage.assertFormVisible();
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("URL", employeePage.url());
    });
  });

  test("TC-18: employee can set a tax rate and save — success toast appears", async ({
    employeePage,
  }) => {
    await allure.description(
      "Employee fills in a tax rate value, saves, and verifies the success toast notification."
    );

    const { restaurantId } = readSharedState();
    const taxPage = createOwnerTaxPage(employeePage);
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
