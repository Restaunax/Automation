import { test } from "../../../fixtures/base";

/**
 * Employee — Tax settings (/restaurant/restaurantId/:id/tax).
 *
 * Route allows [ADMIN, EMPLOYEE] only — OWNER is denied (see TEST_PLAN.md role
 * model). SCAFFOLD placeholder.
 * NOTE: needs an EMPLOYEE-role session (future `employeePage` fixture).
 */
test.describe("Employee — Tax settings", () => {
  test.fixme("TC-XXX: employee can configure tax", async () => {
    // Arrange: sign in as EMPLOYEE, open the tax page
    // Act: set a tax rate
    // Assert: the rate is saved
  });
});
