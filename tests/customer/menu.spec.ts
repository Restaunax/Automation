import { test } from "../../fixtures/base";
import { createMenuPage } from "../../pages/customer/MenuPage";
import { createItemModal } from "../../pages/customer/ItemModal";

/**
 * Customer — Menu (Template Wind).
 *
 * SCAFFOLD: test.fixme placeholders. Uses the guest `customerPage` fixture.
 * See TEST_PLAN.md → "How to add a test".
 */
test.describe("Customer — Menu", () => {
  test.fixme("TC-XXX: add an item with modifiers to the cart", async ({ customerPage }) => {
    const menu = createMenuPage(customerPage);
    const item = createItemModal(customerPage);
    await menu.goto();                    // Arrange
    await menu.openItemByName("Burger");  // Act
    await item.setQuantity(2);
    await item.addToCart();
    // Assert: TODO expect the cart count to update
  });
});
