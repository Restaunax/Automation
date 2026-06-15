import { test } from "../../../fixtures/base";

/**
 * Owner — Rewards / Loyalty.
 *
 * NOTE: the /restaurant/loyalty route is gated [ADMIN, EMPLOYEE] (NOT OWNER) —
 * confirm the owner-scoped rewards entry point in QA before wiring the fixture.
 * See TEST_PLAN.md → role model. SCAFFOLD placeholder.
 */
test.describe("Owner — Rewards", () => {
  test.fixme("TC-XXX: configure a loyalty reward program", async ({
    ownerPage,
  }) => {
    await ownerPage.goto("/restaurant/loyalty", {
      waitUntil: "domcontentloaded",
    });
    // TODO: assert the loyalty configuration UI
  });
});
