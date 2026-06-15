import { test } from "../../../fixtures/base";

/**
 * Staff — /staff PIN-card portal (web stub).
 *
 * Route allows [RESTAURANT_STAFF, OWNER, ADMIN]. This web page is only a thin
 * PIN card. The substantive POS authority (staffRole / StaffCapability:
 * registers, approvals, daily close) lives in device-in-store and is tested at
 * the API level — see tests/pos/README.md. SCAFFOLD placeholder.
 */
test.describe("Staff — Portal", () => {
  test.fixme("TC-XXX: a user can view/set their POS PIN", async ({
    adminPage,
  }) => {
    await adminPage.goto("/staff", { waitUntil: "domcontentloaded" });
    // TODO: assert the PIN card renders (use a RESTAURANT_STAFF session when available)
  });
});
