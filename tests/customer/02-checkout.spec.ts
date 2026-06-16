import * as allure from "allure-js-commons";
import { test } from "../../fixtures/base";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { readSharedState } from "../../utils/testData";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Customer — Checkout", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-24: customer with pre-seeded cart can reach checkout and see the form", async ({
    page,
  }) => {
    await allure.description(
      "Cart is injected via sessionStorage; customer navigates to /checkout and sees the customer info form."
    );

    const { restaurantId, menuItemId, menuItemName, menuItemPrice } =
      readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and navigate to checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
      await allure.parameter("restaurantId", restaurantId);
      await allure.parameter("Item", menuItemName);
    });

    await allure.step("Verify checkout form is visible", async () => {
      await checkoutPage.assertFormVisible();
      await allure.parameter("URL", page.url());
    });
  });

  test("TC-25: customer can fill checkout form and proceed to payment step", async ({
    page,
  }) => {
    await allure.description(
      "Customer fills First Name, Last Name, Email, Phone, selects Pickup, and clicks Proceed to Payment. Stripe payment section appears."
    );

    const { restaurantId, menuItemId, menuItemName, menuItemPrice } =
      readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    await allure.step("Seed cart and navigate to checkout", async () => {
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );
    });

    await allure.step("Fill customer info", async () => {
      await checkoutPage.fillCustomerInfo(
        "Jane",
        "Tester",
        "jane@restaunax-test.com",
        "5559876543"
      );
      await allure.parameter("Name", "Jane Tester");
      await allure.parameter("Email", "jane@restaunax-test.com");
    });

    await allure.step("Select Pickup service type", async () => {
      await checkoutPage.selectPickup();
    });

    await allure.step("Click Proceed to Payment", async () => {
      await checkoutPage.clickProceedToPayment();
    });

    await allure.step("Verify Stripe payment section is visible", async () => {
      await checkoutPage.assertPaymentSectionVisible();
    });
  });
});
