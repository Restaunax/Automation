import { test } from "../../../fixtures/base";

/**
 * Admin — User management (/admin?tab=user).
 *
 * SCAFFOLD placeholder. TODO: add an AdminUsersPage POM under pages/dashboard/admin/.
 */
test.describe("Admin — Users", () => {
  test.fixme("TC-XXX: admin can invite a user and change their role", async ({
    adminPage,
  }) => {
    await adminPage.goto("/admin?tab=user", { waitUntil: "domcontentloaded" });
    // TODO: invite a user, change role, assert
  });
});
