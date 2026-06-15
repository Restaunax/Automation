import { test } from "../../fixtures/base";
import { createCartSummary } from "../../pages/customer/CartSummary";

/**
 * Customer — Cart (Template Wind).
 *
 * The cart lives in sessionStorage keyed by restaurantId. SCAFFOLD placeholder.
 */
test.describe("Customer — Cart", () => {
  test.fixme("TC-XXX: cart persists items across a reload", async ({
    customerPage,
  }) => {
    const cart = createCartSummary(customerPage);
    // TODO: add items, reload, assert the cart still holds them
    await cart.getLineItemCount();
  });
});
