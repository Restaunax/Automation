import { test } from "../../../fixtures/base";

/**
 * Admin — Restaurant management (/admin?tab=restaurant).
 *
 * SCAFFOLD placeholder. TODO: add an AdminRestaurantsPage POM under
 * pages/dashboard/admin/ (model it on AdminDemoManagementPage.ts).
 */
test.describe("Admin — Restaurants", () => {
  test.fixme("TC-XXX: admin can view the restaurants list", async ({ adminPage }) => {
    await adminPage.goto("/admin?tab=restaurant", { waitUntil: "domcontentloaded" });
    // TODO: assert the restaurants table renders
  });
});
