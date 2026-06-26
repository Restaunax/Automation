import { type Page, expect } from "@playwright/test";
import { fillStripePaymentElement } from "../../utils/stripeHelper";
import { STRIPE_CARDS, STRIPE_DEFAULTS } from "../../utils/stripeCards";

const TEMPLATE_WIND_URL =
  process.env.TEMPLATE_WIND_URL ?? "https://qa.restaunax.com";

export const createCustomerCheckoutPage = (page: Page) => {
  // Navigate to menu first to establish the domain, then seed cart via sessionStorage
  const seedCart = async (
    restaurantId: string,
    menuItemId: string,
    menuItemName: string,
    menuItemPrice: number
  ) => {
    await page.goto(`${TEMPLATE_WIND_URL}/menu?restaurantId=${restaurantId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.evaluate(
      ({ rid, iid, iname, iprice }) => {
        sessionStorage.setItem(
          "cart",
          JSON.stringify({
            items: [
              {
                cartId: "auto-test-1",
                menuItemId: iid,
                name: iname,
                price: iprice,
                quantity: 1,
                selectedModifiers: [],
                modifiersPrice: 0,
              },
            ],
            deals: [],
            subtotal: iprice,
            tax: 0,
            total: iprice,
            deliveryFee: 0,
            tip: 0,
            coupon: null,
            restaurantId: rid,
          })
        );
      },
      {
        rid: restaurantId,
        iid: menuItemId,
        iname: menuItemName,
        iprice: menuItemPrice,
      }
    );
    await page.goto(`${TEMPLATE_WIND_URL}/checkout`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByPlaceholder("John")
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const fillCustomerInfo = async (
    firstName: string,
    lastName: string,
    email: string,
    phone: string
  ) => {
    await page.getByPlaceholder("John").fill(firstName);
    await page.getByPlaceholder("Doe").fill(lastName);
    await page.getByPlaceholder("john@example.com").fill(email);
    await page.getByPlaceholder("(555) 123-4567").fill(phone);
  };

  const selectPickup = () =>
    page.getByRole("radio", { name: /pickup/i }).click();

  const proceedToPaymentButton = () =>
    page.getByRole("button", { name: "Proceed to Payment" });

  const assertFormVisible = () =>
    expect(page.getByPlaceholder("John")).toBeVisible({ timeout: 10_000 });

  const clickProceedToPayment = () => proceedToPaymentButton().click();

  const assertPaymentSectionVisible = () =>
    expect(page.getByRole("button", { name: "Complete Order" })).toBeVisible({
      timeout: 15_000,
    });

  const fillStripeCard = async (
    cardNumber = STRIPE_CARDS.VISA_SUCCESS,
    expiry = `${STRIPE_DEFAULTS.EXPIRY_MONTH} / ${STRIPE_DEFAULTS.EXPIRY_YEAR}`,
    cvc = STRIPE_DEFAULTS.CVC
  ) => {
    await fillStripePaymentElement(page, cardNumber, expiry, cvc);
  };

  const completeOrder = () =>
    page.getByRole("button", { name: "Complete Order" }).click();

  return {
    seedCart,
    fillCustomerInfo,
    selectPickup,
    proceedToPaymentButton,
    assertFormVisible,
    clickProceedToPayment,
    assertPaymentSectionVisible,
    fillStripeCard,
    completeOrder,
  };
};
