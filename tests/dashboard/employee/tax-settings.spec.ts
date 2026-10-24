import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerTaxPage } from "../../../pages/dashboard/owner/OwnerTaxPage";
import { readSharedState } from "../../../utils/testData";
import { apiLogin, apiRequestRaw } from "../../../utils/apiHelper";
import { requireRelease } from "../../../utils/releaseGate";

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
      "Employee changes the tax rate, saves, and verifies the value persisted on the server " +
        "(GET /api/restaurantId/:id/settings) and — once RestauNax #1036 is deployed — that the " +
        "reloaded page prefills it. The original rate is snapshotted from the API (the page did not " +
        "prefill it before #1036, so the input was an unreliable source) and restored through the API " +
        "afterwards: the tax rate feeds real order totals on the shared QA restaurant."
    );

    const { restaurantId } = readSharedState();
    const taxPage = createOwnerTaxPage(employeePage);
    const token = (await apiLogin(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD))
      .accessToken;
    const originalRate = await getSettingsTax(token, restaurantId);
    const newRate = originalRate === 8.5 ? "7.5" : "8.5";

    await allure.step("Navigate to tax settings", async () => {
      await taxPage.goto(restaurantId);
    });

    try {
      await allure.step(`Enter tax rate: ${newRate}%`, async () => {
        await taxPage.setTaxRate(newRate);
        await allure.parameter("Original rate", String(originalRate));
        await allure.parameter("New rate", newRate);
      });

      await allure.step("Save and verify success toast", async () => {
        await taxPage.save();
        await taxPage.assertSuccessToast();
      });

      await allure.step("The server holds the new rate", async () => {
        expect(await getSettingsTax(token, restaurantId)).toBe(Number(newRate));
      });

      await allure.step(
        "Reload — the page prefills the saved rate",
        async () => {
          await taxPage.goto(restaurantId);
          const prefilled = (await taxPage.taxRateInput().inputValue()) !== "";
          requireRelease(
            "bugBatch",
            prefilled,
            "the Tax page does not prefill the saved rate"
          );
          await expect(taxPage.taxRateInput()).toHaveValue(newRate);
        }
      );
    } finally {
      // Restore through the API even if an assertion failed mid-test.
      // Best-effort: a restore failure must not mask the real test result.
      await setSettingsTax(token, restaurantId, originalRate).catch((err) =>
        console.warn(
          `[tax-settings] Failed to restore original tax rate (${originalRate}):`,
          err
        )
      );
    }
  });

  test("TC-929: the Tax page shows and prefills the saved rate @bugfix-1036 @tax", async ({
    employeePage,
  }) => {
    await allure.description(
      "RestauNax #1036: the Tax page reads the rate from the settings endpoint it saves to, so the " +
        "'Current Tax Rate' chip, the input and the 'Effective Tax Rate' all show the saved value instead " +
        "of 'Not set' / an empty field. Read-only."
    );
    const { restaurantId } = readSharedState();
    const taxPage = createOwnerTaxPage(employeePage);
    const token = (await apiLogin(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD))
      .accessToken;
    const saved = await getSettingsTax(token, restaurantId);
    test.skip(saved == null, "The seed restaurant has no tax rate saved");

    await taxPage.goto(restaurantId);
    const prefilled = (await taxPage.taxRateInput().inputValue()) !== "";
    requireRelease(
      "bugBatch",
      prefilled,
      "the Tax page does not prefill the saved rate"
    );

    await expect(taxPage.taxRateInput()).toHaveValue(String(saved));
    await expect(taxPage.currentRateChip()).toHaveText(`${saved}%`);
  });
});

/** The saved rate — GET /api/restaurantId/:id/settings → tax (null = unset). */
async function getSettingsTax(
  token: string,
  restaurantId: string
): Promise<number | null> {
  const res = await apiRequestRaw<{ tax?: number | null }>(
    "GET",
    `/api/restaurantId/${restaurantId}/settings`,
    undefined,
    token
  );
  if (!res.ok) throw new Error(`GET settings → ${res.status}`);
  return res.data?.tax ?? null;
}

async function setSettingsTax(
  token: string,
  restaurantId: string,
  tax: number | null
): Promise<void> {
  const res = await apiRequestRaw(
    "PUT",
    `/api/restaurantId/${restaurantId}/settings`,
    { tax },
    token
  );
  if (!res.ok) throw new Error(`PUT settings → ${res.status}`);
}
