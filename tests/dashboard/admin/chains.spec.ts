import { test } from "../../../fixtures/base";

/**
 * Admin — Chain management (/admin?tab=chains).
 *
 * SCAFFOLD placeholder. TODO: add an AdminChainsPage POM under pages/dashboard/admin/.
 * Tracked: https://github.com/Restaunax/Automation/issues/12
 */
test.describe("Admin — Chains", () => {
  test.fixme("TC-181: admin can view and manage restaurant chains", async ({
    adminPage,
  }) => {
    await adminPage.goto("/admin?tab=chains", {
      waitUntil: "domcontentloaded",
    });
    // TODO: assert chains table; create/edit a chain
  });
});
