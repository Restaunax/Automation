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
    // Same ?restaurantId= QA override as /menu — without it a multi-location
    // deployment shows the location picker instead of the checkout form.
    await page.goto(
      `${TEMPLATE_WIND_URL}/checkout?restaurantId=${restaurantId}`,
      { waitUntil: "domcontentloaded" }
    );
    await firstNameInput().waitFor({ state: "visible", timeout: 15_000 });
  };

  // name-attribute-first with placeholder fallback (TEST_PLAN → "Locator
  // strategy"): CustomerInfoForm's inputs carry stable name attributes in
  // source; placeholders ("John", "Doe") are display copy that changes
  // without warning. Both branches are the same node, so .or() stays strict.
  const firstNameInput = () =>
    page
      .locator('input[name="firstName"]')
      .or(page.getByPlaceholder("John"))
      .first();
  const lastNameInput = () =>
    page
      .locator('input[name="lastName"]')
      .or(page.getByPlaceholder("Doe"))
      .first();
  const emailInput = () =>
    page
      .locator('input[name="email"]')
      .or(page.getByPlaceholder("john@example.com"))
      .first();
  const phoneInput = () =>
    page
      .locator('input[name="phone"]')
      .or(page.getByPlaceholder("(555) 123-4567"))
      .first();

  const fillCustomerInfo = async (
    firstName: string,
    lastName: string,
    email: string,
    phone: string
  ) => {
    await firstNameInput().fill(firstName);
    await lastNameInput().fill(lastName);
    await emailInput().fill(email);
    await phoneInput().fill(phone);
  };

  const selectPickup = () =>
    page.getByRole("radio", { name: /pickup/i }).click();

  const proceedToPaymentButton = () =>
    page.getByRole("button", { name: "Proceed to Payment" });

  const assertFormVisible = () =>
    expect(firstNameInput()).toBeVisible({ timeout: 10_000 });

  const clickProceedToPayment = () => proceedToPaymentButton().click();

  const assertPaymentSectionVisible = () =>
    expect(page.getByRole("button", { name: "Complete Order" })).toBeVisible({
      timeout: 15_000,
    });

  const fillStripeCard = async (
    cardNumber: string = STRIPE_CARDS.VISA_SUCCESS,
    expiry: string = STRIPE_DEFAULTS.EXPIRY_MM_YY,
    cvc = STRIPE_DEFAULTS.CVC
  ) => {
    await fillStripePaymentElement(page, cardNumber, expiry, cvc);
  };

  const completeOrder = () =>
    page.getByRole("button", { name: "Complete Order" }).click();

  // On a Stripe decline, PaymentSection renders a "Payment Error" card with
  // the decline message underneath — the checkout form stays visible so the
  // customer can retry with a different card.
  const assertPaymentError = () =>
    expect(page.getByRole("heading", { name: "Payment Error" })).toBeVisible({
      timeout: 20_000,
    });

  // ── Coupon (CouponSection inside OrderSummary; guest-accessible, visible in
  // both checkout steps). The input has no name/id/testid — placeholder only.
  const couponCodeInput = () => page.getByPlaceholder("Enter code");
  const applyCouponButton = () =>
    page.getByRole("button", { name: "Apply", exact: true });

  const applyCoupon = async (code: string) => {
    await couponCodeInput().waitFor({ state: "visible", timeout: 15_000 });
    await couponCodeInput().fill(code);
    await applyCouponButton().click();
  };

  // Success swaps the input for a green applied-coupon block ("Saving $X.XX")
  // and OrderSummary shows a "Coupon (CODE)" discount line. Codes uppercase in
  // the UI, so match case-insensitively on the code.
  const assertCouponApplied = async (code: string) => {
    await expect(page.getByText(/Saving \$\d/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(new RegExp(`Coupon\\s*\\(${code}\\)`, "i"))
    ).toBeVisible({ timeout: 10_000 });
  };

  // Invalid code → red error box; the input stays (no applied block).
  const assertCouponRejected = async () => {
    await expect(
      page.getByText(/not valid|invalid|error/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Saving \$\d/)).toHaveCount(0);
  };

  // ── Delivery (ServiceTypeSelector — buttons, not radios; Delivery hidden on
  // pickup-only/ship-only restaurants).
  const deliveryButton = () => page.getByRole("button", { name: /delivery/i });
  const deliveryAddressInput = () =>
    page.getByPlaceholder(/Enter your (delivery|shipping) address/i);

  const isDeliveryAvailable = async () => (await deliveryButton().count()) > 0;

  const selectDelivery = () => deliveryButton().first().click();

  // The address field is a Google Places autocomplete — type + pick the first
  // suggestion (external API; caller handles the no-suggestion skip).
  const fillDeliveryAddress = async (query: string) => {
    await deliveryAddressInput().waitFor({ state: "visible", timeout: 10_000 });
    await deliveryAddressInput().click();
    await deliveryAddressInput().pressSequentially(query, { delay: 100 });
  };

  const firstAddressSuggestion = () =>
    page.locator('[class*="pac-item"], [role="option"]').first();

  // Either outcome proves the address → /api/delivery/quote round-trip fired:
  // the green "Delivery Available" fee box or the red "Not Available" box.
  const assertDeliveryQuoteResolved = () =>
    expect(
      page
        .getByText(/Delivery Available/i)
        .or(page.getByText(/Delivery Not Available/i))
        .first()
    ).toBeVisible({ timeout: 20_000 });

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
    assertPaymentError,
    couponCodeInput,
    applyCoupon,
    assertCouponApplied,
    assertCouponRejected,
    deliveryButton,
    deliveryAddressInput,
    isDeliveryAvailable,
    selectDelivery,
    fillDeliveryAddress,
    firstAddressSuggestion,
    assertDeliveryQuoteResolved,
  };
};
