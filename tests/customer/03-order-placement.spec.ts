import * as allure from "allure-js-commons";
import { test } from "../../fixtures/base";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { createCustomerOrderConfirmationPage } from "../../pages/customer/CustomerOrderConfirmationPage";
import { readSharedState } from "../../utils/testData";
import { STRIPE_CARDS, STRIPE_DEFAULTS } from "../../utils/stripeCards";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL       = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD    = process.env.OWNER_PASSWORD ?? "";

test.describe("Customer — Order Placement", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-26: customer can complete a full order with Stripe test card and reach Order Confirmed", async ({ page }) => {
    await allure.description(
      "Full happy path: pre-seeded cart → fill form → Proceed to Payment → fill Stripe VISA test card → Complete Order → Order Confirmed page."
    );

    const { restaurantId, menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);
    const confirmationPage = createCustomerOrderConfirmationPage(page);

    await allure.step("Seed cart and navigate to checkout", async () => {
      await checkoutPage.seedCart(restaurantId, menuItemId, menuItemName, menuItemPrice);
      await allure.parameter("Item", menuItemName);
      await allure.parameter("Price", `$${menuItemPrice}`);
    });

    await allure.step("Fill customer info", async () => {
      await checkoutPage.fillCustomerInfo("Jane", "Tester", "jane@restaunax-test.com", "5559876543");
    });

    await allure.step("Select Pickup service type", async () => {
      await checkoutPage.selectPickup();
    });

    await allure.step("Click Proceed to Payment", async () => {
      await checkoutPage.clickProceedToPayment();
      await checkoutPage.assertPaymentSectionVisible();
    });

    await allure.step("Fill Stripe test card", async () => {
      await checkoutPage.fillStripeCard(
        STRIPE_CARDS.VISA_SUCCESS,
        `${STRIPE_DEFAULTS.EXPIRY_MONTH} / ${STRIPE_DEFAULTS.EXPIRY_YEAR.slice(-2)}`,
        STRIPE_DEFAULTS.CVC
      );
      await allure.parameter("Card", STRIPE_CARDS.VISA_SUCCESS);
    });

    await allure.step("Click Complete Order", async () => {
      await checkoutPage.completeOrder();
    });

    await allure.step("Verify Order Confirmed page", async () => {
      await confirmationPage.assertConfirmed();
      await confirmationPage.assertOrderNumberVisible();
      await confirmationPage.assertCustomerName("Jane");
      await allure.parameter("URL", page.url());
    });
  });
});
