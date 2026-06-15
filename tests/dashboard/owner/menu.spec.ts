import { test } from "../../../fixtures/base";
import { createMenuManagementPage } from "../../../pages/dashboard/restaurant/MenuManagementPage";
import { readSharedState } from "../../../utils/testData";

/**
 * Owner — Menu (feature behavior, owner as the primary actor).
 *
 * The menu screen is shared by Owner/Employee/Admin, so the POM is role-agnostic
 * (pages/dashboard/restaurant/MenuManagementPage). We test the feature ONCE here
 * with the owner session; who-else-can-reach-it lives in tests/dashboard/access/.
 *
 * SCAFFOLD: test.fixme placeholders. To make real: rename fixme→test, fill
 * Arrange-Act-Assert, add allure labels (see TEST_PLAN.md → "How to add a test").
 */
test.describe("Owner — Menu", () => {
  test.fixme("TC-XXX: owner can add a menu category", async ({ ownerPage }) => {
    const { restaurantId } = readSharedState();
    const menu = createMenuManagementPage(ownerPage);
    await menu.goto(restaurantId);        // Arrange
    await menu.addCategory("Appetizers"); // Act
    // Assert: TODO expect the category to appear in the list
  });
});
