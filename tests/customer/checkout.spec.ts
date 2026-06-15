import { test } from "../../fixtures/base";
import { createCheckoutPage } from "../../pages/customer/CheckoutPage";

/**
 * Customer — Checkout (guest, Template Wind).
 *
 * SCAFFOLD placeholder. A logged-in reward-member variant is future work (needs
 * an OTP login helper — see TEST_PLAN.md → "Future infrastructure").
 */
test.describe("Customer — Checkout", () => {
  test.fixme("TC-XXX: guest fills info, picks pickup, and adds a tip", async ({
    customerPage,
  }) => {
    const checkout = createCheckoutPage(customerPage);
    await checkout.goto();
    await checkout.fillCustomerInfo({
      firstName: "Test",
      lastName: "Automation",
      email: "test@restaunax-test.com",
      phone: "5551234567",
    });
    await checkout.selectServiceType("PICKUP");
    await checkout.selectTip("18%");
    await checkout.continueToPayment();
    // Assert: TODO expect the payment step to appear
  });
});
