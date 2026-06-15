import { test } from "../../../fixtures/base";
import { createMenuPage } from "../../../pages/customer/MenuPage";
import { createItemModal } from "../../../pages/customer/ItemModal";
import { createCartSummary } from "../../../pages/customer/CartSummary";
import { createCheckoutPage } from "../../../pages/customer/CheckoutPage";
import { createPaymentSection } from "../../../pages/customer/PaymentSection";
import { createOrderConfirmationPage } from "../../../pages/customer/OrderConfirmationPage";
import { STRIPE_CARDS, STRIPE_DEFAULTS } from "../../../utils/stripeCards";

/**
 * Customer — Complete order (guest, end-to-end).
 *
 * SCAFFOLD: the canonical revenue flow that ties every customer POM together:
 *   menu → item + modifiers → cart → checkout (guest) → Stripe → confirmation.
 * This is the highest-value flow to implement first. See TEST_PLAN.md.
 */
test.describe("Customer — Complete order (guest)", () => {
  test.fixme("TC-XXX: guest places a pickup order end-to-end", async ({
    customerPage,
  }) => {
    const menu = createMenuPage(customerPage);
    const item = createItemModal(customerPage);
    const cart = createCartSummary(customerPage);
    const checkout = createCheckoutPage(customerPage);
    const payment = createPaymentSection(customerPage);
    const confirmation = createOrderConfirmationPage(customerPage);

    // 1. Browse + add an item
    await menu.goto();
    await menu.openItemByName("Burger");
    await item.addToCart();

    // 2. Cart → checkout
    await menu.openCart();
    await cart.goToCheckout();

    // 3. Guest info + pickup + tip
    await checkout.fillCustomerInfo({
      firstName: "Test",
      lastName: "Automation",
      email: "test@restaunax-test.com",
      phone: "5551234567",
    });
    await checkout.selectServiceType("PICKUP");
    await checkout.selectTip("18%");
    await checkout.continueToPayment();

    // 4. Pay with a Stripe test card
    const expiry = `${STRIPE_DEFAULTS.EXPIRY_MONTH}/${STRIPE_DEFAULTS.EXPIRY_YEAR.slice(-2)}`;
    await payment.fillCard(
      STRIPE_CARDS.VISA_SUCCESS,
      expiry,
      STRIPE_DEFAULTS.CVC
    );
    await payment.pay();

    // 5. Confirmation
    await confirmation.getOrderNumber();
    // Assert: TODO expect a non-empty order number on the confirmation page
  });
});
