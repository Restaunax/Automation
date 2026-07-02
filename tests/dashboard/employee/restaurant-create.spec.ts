import { test } from "../../../fixtures/base";

/**
 * Employee — Create restaurant (/restaurant/new).
 *
 * Gated by the CREATE_RESTAURANT permission — held by EMPLOYEE/ADMIN, NOT OWNER
 * (see TEST_PLAN.md role model). EMPLOYEE is the company-side setup role.
 *
 * SCAFFOLD placeholder. The `employeePage` fixture now exists (fixtures/base.ts,
 * auth saved by globalSetup) — implement with it.
 */
test.describe("Employee — Create restaurant", () => {
  test.fixme("TC-XXX: employee creates a restaurant on behalf of a client", async () => {
    // Arrange: sign in as EMPLOYEE, open /restaurant/new
    // Act: fill restaurant details, submit
    // Assert: restaurant is created and assigned to the owner
  });
});
