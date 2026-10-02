import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { readSharedState } from "../../../utils/testData";

/**
 * Access control — role-specific restrictions (the OWNER vs EMPLOYEE seam).
 *
 * These routes are gated [ADMIN, EMPLOYEE] and explicitly DENY the restaurant
 * OWNER — the clearest evidence that EMPLOYEE is a distinct company-side role,
 * not "owner with fewer permissions". See TEST_PLAN.md → role model.
 *
 */
test.describe("Access — Role restrictions", () => {
  // Skip (not fail) when owner creds aren't configured — pageForRole throws
  // when the auth file is missing.
  test.skip(
    !process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Access Control");
    await allure.label("severity", "critical");
  });

  test("TC-54: OWNER is denied the publish route (EMPLOYEE/ADMIN only)", async ({
    pageForRole,
  }) => {
    const { restaurantId } = readSharedState();
    const page = await pageForRole("owner");
    await page.goto(`/restaurant/restaurantId/${restaurantId}/publish`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/access-denied/);
  });

  test("TC-55: OWNER is denied the tax route (EMPLOYEE/ADMIN only)", async ({
    pageForRole,
  }) => {
    const { restaurantId } = readSharedState();
    const page = await pageForRole("owner");
    await page.goto(`/restaurant/restaurantId/${restaurantId}/tax`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/access-denied/);
  });

  test("TC-81: OWNER is denied the loyalty route (EMPLOYEE/ADMIN only)", async ({
    pageForRole,
  }) => {
    const page = await pageForRole("owner");
    await page.goto("/restaurant/loyalty", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/access-denied/);
  });
});
