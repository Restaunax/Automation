import { test } from "../../fixtures/base";
import { createPaymentSection } from "../../pages/customer/PaymentSection";
import { STRIPE_CARDS, STRIPE_DEFAULTS } from "../../utils/stripeCards";

/**
 * Customer — Payment (Stripe, Template Wind).
 *
 * SCAFFOLD placeholder. Card data comes from utils/stripeCards.ts.
 */
test.describe("Customer — Payment", () => {
  test.fixme("TC-XXX: pay with a successful Visa test card", async ({ customerPage }) => {
    const payment = createPaymentSection(customerPage);
    const expiry = `${STRIPE_DEFAULTS.EXPIRY_MONTH}/${STRIPE_DEFAULTS.EXPIRY_YEAR.slice(-2)}`;
    await payment.fillCard(STRIPE_CARDS.VISA_SUCCESS, expiry, STRIPE_DEFAULTS.CVC);
    await payment.pay();
    // Assert: TODO expect redirect to /order-confirmation/[orderId]
  });

  test.fixme("TC-XXX: a declined card surfaces an error", async ({ customerPage }) => {
    const payment = createPaymentSection(customerPage);
    const expiry = `${STRIPE_DEFAULTS.EXPIRY_MONTH}/${STRIPE_DEFAULTS.EXPIRY_YEAR.slice(-2)}`;
    await payment.fillCard(STRIPE_CARDS.DECLINED, expiry, STRIPE_DEFAULTS.CVC);
    await payment.pay();
    // Assert: TODO expect a decline error message
  });
});
