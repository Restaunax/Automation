import { test } from "../../fixtures/base";
import { createOrderConfirmationPage } from "../../pages/customer/OrderConfirmationPage";

/**
 * Customer — Order confirmation (Template Wind).
 *
 * SCAFFOLD placeholder.
 */
test.describe("Customer — Confirmation", () => {
  test.fixme("TC-XXX: confirmation shows the order number and totals", async ({
    customerPage,
  }) => {
    const confirmation = createOrderConfirmationPage(customerPage);
    await confirmation.getOrderNumber();
    // Assert: TODO expect the order number, items, and totals to render
  });
});
