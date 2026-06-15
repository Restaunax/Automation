import { test } from "../../../fixtures/base";
import { createOrdersPage } from "../../../pages/dashboard/restaurant/OrdersPage";
import { readSharedState } from "../../../utils/testData";

/**
 * Owner — Orders.
 *
 * SCAFFOLD placeholder. Flow: open Orders tab → find an incoming order →
 * advance its status. See TEST_PLAN.md.
 */
test.describe("Owner — Orders", () => {
  test.fixme("TC-XXX: owner can change an order's status", async ({ ownerPage }) => {
    const { restaurantId } = readSharedState();
    const orders = createOrdersPage(ownerPage);
    await orders.goto(restaurantId);
    // Act + Assert: TODO advance an order's status and verify it updates
  });
});
