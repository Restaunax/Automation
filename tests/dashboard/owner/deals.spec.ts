import { test } from "../../../fixtures/base";
import { readSharedState } from "../../../utils/testData";

/**
 * Owner — Deals (entitlement-gated tab; requires the DEALS feature).
 *
 * SCAFFOLD placeholder. TODO: add a role-agnostic DealsPage POM under
 * pages/dashboard/restaurant/ (Deals is a shared restaurant-management screen).
 */
test.describe("Owner — Deals", () => {
  test.fixme("TC-XXX: owner can create a deal", async ({ ownerPage }) => {
    const { restaurantId } = readSharedState();
    await ownerPage.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=deals`,
      { waitUntil: "domcontentloaded" }
    );
    // TODO: create a deal and assert it appears
  });
});
