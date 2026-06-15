import { test, expect } from "../../../fixtures/base";
import { createMenuManagementPage } from "../../../pages/dashboard/restaurant/MenuManagementPage";
import { readSharedState } from "../../../utils/testData";

/**
 * Access control — who can reach the shared restaurant-management screens.
 *
 * Menu / Orders / Coupons live on /restaurant/restaurantId/:id and are reachable
 * by OWNER, EMPLOYEE, and ADMIN (route [ADMIN, OWNER, EMPLOYEE] + MODIFY_RESTAURANT).
 *
 * Feature behavior is tested ONCE under the primary actor (tests/dashboard/owner/).
 * This suite only asserts REACHABILITY per role via the pageForRole fixture — it
 * does not re-run the full feature flow. See TEST_PLAN.md → "Shared capabilities".
 *
 * SCAFFOLD: test.fixme placeholders. (`employee` needs the future employeePage
 * session — see TEST_PLAN.md → "Future infrastructure".)
 */
const ROLES_WITH_MENU_ACCESS = ["owner", "admin", "employee"] as const;

test.describe("Access — Restaurant management (shared screens)", () => {
  for (const role of ROLES_WITH_MENU_ACCESS) {
    test.fixme(`TC-XXX: ${role} can reach menu management`, async ({ pageForRole }) => {
      const { restaurantId } = readSharedState();
      const page = await pageForRole(role);
      await createMenuManagementPage(page).goto(restaurantId);
      await expect(page).not.toHaveURL(/access-denied|sign-in/);
    });
  }
});
