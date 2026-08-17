import * as allure from "allure-js-commons";
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
 */
const ROLES_WITH_MENU_ACCESS = ["owner", "admin", "employee"] as const;
const TC_NUMBERS: Record<(typeof ROLES_WITH_MENU_ACCESS)[number], number> = {
  owner: 56,
  admin: 57,
  employee: 58,
};

// Skip (not fail) a role whose credentials aren't configured in this
// environment — pageForRole throws when the auth file is missing, which used
// to surface as a confusing failure instead of the intended skip.
const CREDS_SET: Record<(typeof ROLES_WITH_MENU_ACCESS)[number], boolean> = {
  owner: !!(process.env.OWNER_EMAIL && process.env.OWNER_PASSWORD),
  admin: !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD),
  employee: !!(process.env.EMPLOYEE_EMAIL && process.env.EMPLOYEE_PASSWORD),
};

test.describe("Access — Restaurant management (shared screens)", () => {
  test.beforeEach(async () => {
    await allure.label("feature", "Access Control");
    await allure.label("severity", "critical");
  });

  for (const role of ROLES_WITH_MENU_ACCESS) {
    test(`TC-${TC_NUMBERS[role]}: ${role} can reach menu management${role === "owner" ? " @smoke" : ""}`, async ({
      pageForRole,
    }) => {
      test.skip(
        !CREDS_SET[role],
        `${role.toUpperCase()}_EMAIL / ${role.toUpperCase()}_PASSWORD not set in .env`
      );
      const { restaurantId } = readSharedState();
      const page = await pageForRole(role);
      await createMenuManagementPage(page).goto(restaurantId);
      await expect(page).not.toHaveURL(/access-denied|sign-in/);
    });
  }
});
