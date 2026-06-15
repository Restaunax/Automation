import { test } from "../../../fixtures/base";
import { readSharedState } from "../../../utils/testData";

/**
 * Owner — Invite POS staff.
 *
 * This is an OWNER-only action: EMPLOYEE cannot invite staff (see TEST_PLAN.md
 * role model). SCAFFOLD placeholder.
 */
test.describe("Owner — Staff invite", () => {
  test.fixme("TC-XXX: owner invites a staff member", async ({ ownerPage }) => {
    const { restaurantId } = readSharedState();
    await ownerPage.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Staff`,
      { waitUntil: "domcontentloaded" }
    );
    // TODO: invite a staff member and assert they appear in the staff list
  });
});
