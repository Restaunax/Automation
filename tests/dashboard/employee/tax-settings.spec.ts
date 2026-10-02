import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
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

  test("TC-18: employee can set a tax rate and save — change persists", async ({
    employeePage,
  }) => {
    await allure.description(
      "Employee changes the tax rate, saves, and verifies the value actually persisted (reload, " +
        "not just the toast). The original rate is restored afterward — the tax rate feeds real " +
        "order totals on the shared QA restaurant, so this test must not leave it mutated."
    );

    const { restaurantId } = readSharedState();
    const taxPage = createOwnerTaxPage(employeePage);

    await allure.step("Navigate to tax settings", async () => {
      await taxPage.goto(restaurantId);
    });

    // Snapshot the current rate and pick a value guaranteed to differ from it.
    const originalRate = await taxPage.taxRateInput().inputValue();
    const newRate = originalRate === "8.5" ? "7.5" : "8.5";

    try {
      await allure.step(`Enter tax rate: ${newRate}%`, async () => {
        await taxPage.setTaxRate(newRate);
        await allure.parameter("Original rate", originalRate);
        await allure.parameter("New rate", newRate);
      });

      await allure.step("Save and verify success toast", async () => {
        await taxPage.save();
        await taxPage.assertSuccessToast();
      });

      await allure.step("Reload and verify the rate persisted", async () => {
        await taxPage.goto(restaurantId);
        await expect(taxPage.taxRateInput()).toHaveValue(newRate);
      });
    } finally {
      // Restore the original rate even if an assertion failed mid-test.
      // Best-effort: a restore failure must not mask the real test result.
      try {
        await taxPage.goto(restaurantId);
        await taxPage.setTaxRate(originalRate);
        await taxPage.save();
        await taxPage.assertSuccessToast();
      } catch (err) {
        console.warn(
          `[tax-settings] Failed to restore original tax rate (${originalRate}%):`,
          err
        );
      }
    }
  });
});
