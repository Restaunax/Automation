import { test, expect } from "../../../fixtures/base";
import { readSharedState } from "../../../utils/testData";

/**
 * Access control — role-specific restrictions (the OWNER vs EMPLOYEE seam).
 *
 * These routes are gated [ADMIN, EMPLOYEE] and explicitly DENY the restaurant
 * OWNER — the clearest evidence that EMPLOYEE is a distinct company-side role,
 * not "owner with fewer permissions". See TEST_PLAN.md → role model.
 *
 * SCAFFOLD: test.fixme placeholders.
 */
test.describe("Access — Role restrictions", () => {
  test.fixme("TC-XXX: OWNER is denied the publish route (EMPLOYEE/ADMIN only)", async ({ pageForRole }) => {
    const { restaurantId } = readSharedState();
    const page = await pageForRole("owner");
    await page.goto(`/restaurant/restaurantId/${restaurantId}/publish`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/access-denied/);
  });

  test.fixme("TC-XXX: OWNER is denied the tax route (EMPLOYEE/ADMIN only)", async ({ pageForRole }) => {
    const { restaurantId } = readSharedState();
    const page = await pageForRole("owner");
    await page.goto(`/restaurant/restaurantId/${restaurantId}/tax`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/access-denied/);
  });
});
