import { test } from "../../fixtures/base";
import { createMenuPage } from "../../pages/customer/MenuPage";

/**
 * Customer — Deals (Template Wind /deals/[dealId] builder).
 *
 * SCAFFOLD placeholder. TODO: add a DealBuilderPage POM under pages/customer/.
 */
test.describe("Customer — Deals", () => {
  test.fixme("TC-XXX: build a deal and add it to the cart", async ({
    customerPage,
  }) => {
    const menu = createMenuPage(customerPage);
    await menu.goto();
    // TODO: open a deal, add the required items, continue to checkout
  });
});
