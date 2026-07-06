import { test } from "../../../fixtures/base";

/**
 * Employee — Publish menu (/restaurant/restaurantId/:id/publish).
 *
 * Route allows [ADMIN, EMPLOYEE] only — OWNER is denied (see TEST_PLAN.md role
 * model). This is a key OWNER-vs-EMPLOYEE difference worth a dedicated test.
 *
 * SCAFFOLD placeholder. The `employeePage` fixture now exists (fixtures/base.ts,
 * auth saved by globalSetup) — implement with it.
 * Tracked: https://github.com/Restaunax/Automation/issues/14
 */
// The OWNER-is-denied-publish check lives in the access matrix
// (tests/dashboard/access/role-restrictions.spec.ts), not here.
test.describe("Employee — Publish menu", () => {
  test.fixme("TC-XXX: employee can publish a menu", async () => {
    // Arrange: sign in as EMPLOYEE, open the publish page
    // Act: publish the menu
    // Assert: menu goes live on the customer site
  });
});
