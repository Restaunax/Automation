import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Template Lima — cart and checkout.
 *
 * Locators are written against Lima's own MUI markup and visible copy, not
 * ported from pages/customer/*. Wind is Next + Tailwind with different
 * components, roles and labels; a shared locator set across two UI frameworks
 * is how a suite becomes brittle. The JOURNEY is what the two have in common,
 * and that is worth extracting only once both suites exist.
 */
export const createLimaCheckoutPage = (page: Page) => {
  // ── Cart ──────────────────────────────────────────────────────────────────

  const proceedToCheckoutButton = (): Locator =>
    page
      .getByTestId("proceed-to-checkout")
      .or(page.getByRole("button", { name: /proceed to checkout/i }))
      .first();

  const emptyCartMessage = (): Locator =>
    page.getByText(/cart is empty|no items/i).first();

  // The coupon box lives on the CART page (ShoppingCart.tsx), not on
  // checkout — checkout only carries the gift-card and rewards inputs.
  const couponInput = (): Locator =>
    page.getByPlaceholder(/enter code/i).first();

  /** The cart's "Estimated Total:" figure, for proving a coupon moved nothing. */
  const readCartTotal = async (): Promise<number | null> => {
    const label = page.getByRole("heading", { name: /^estimated total/i });
    if ((await label.count()) === 0) return null;
    const text = await label
      .first()
      .locator("xpath=..")
      .innerText()
      .catch(() => "");
    const match = /\$\s?([\d,]+\.\d{2})/.exec(text);
    return match?.[1] ? parseFloat(match[1].replace(/,/g, "")) : null;
  };

  const applyCouponButton = (): Locator =>
    page.getByRole("button", { name: /^apply$/i }).first();

  const applyCoupon = async (code: string): Promise<void> => {
    await couponInput().fill(code);
    await applyCouponButton().click();
  };

  const goToCheckout = async (): Promise<void> => {
    await proceedToCheckoutButton().click();
    await expect(page).toHaveURL(/\/checkout/, { timeout: 20_000 });
  };

  // ── Checkout ──────────────────────────────────────────────────────────────

  /**
   * Scoped to the "Customer Information" section: checkout ALSO renders an
   * "Already A Member? — Phone Number" rewards sign-in box above it, so an
   * unscoped getByLabel(/phone/) fills the sign-in instead of the order's
   * phone, the form never validates, and the payment step never unlocks.
   */
  const customerInfoSection = (): Locator =>
    page
      .getByRole("heading", { name: "Customer Information" })
      .locator("xpath=..");

  const field = (label: RegExp): Locator =>
    customerInfoSection().getByRole("textbox", { name: label }).first();

  const fillCustomerInfo = async (info: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  }): Promise<void> => {
    await field(/first name/i).fill(info.firstName);
    await field(/last name/i).fill(info.lastName);
    await field(/email/i).fill(info.email);
    await field(/phone/i).fill(info.phone);
  };

  const serviceTypeButton = (type: "PICKUP" | "DELIVERY"): Locator =>
    page
      .getByTestId("service-type-button")
      .filter({ hasText: type === "PICKUP" ? /pickup/i : /delivery/i })
      .or(
        page.getByRole("heading", {
          name: type === "PICKUP" ? "Pickup" : "Delivery",
          exact: true,
        })
      )
      .first();

  /**
   * The order is a pickup: checkout renders the "Pickup Information" block
   * (store name + address) only when serviceTypeInfo.orderType is PICKUP. The
   * service slice defaults to PICKUP in a fresh context; the tiles above are
   * not buttons and route through a schedule dialog, so assert the state
   * rather than re-clicking it.
   */
  const assertPickupSelected = () =>
    expect(
      page.getByRole("heading", { name: "Pickup Information" })
    ).toBeVisible({ timeout: 20_000 });

  /**
   * Checkout is two-step: once the form is valid, "Proceed to Payment"
   * initialises the order + PaymentIntent, and only then is the Stripe
   * Payment Element mounted (StripeCheckoutForm → PaymentSection).
   */
  const proceedToPaymentButton = (): Locator =>
    page.getByRole("button", { name: /^proceed to payment$/i });

  const proceedToPayment = async (): Promise<void> => {
    await proceedToPaymentButton().click();
    await expect(
      page.getByRole("heading", { name: "Payment Method" })
    ).toBeVisible({ timeout: 30_000 });
  };

  // Checkout's GiftCardSection: FormLabel "Gift Card Code" (or "Or enter a
  // code" once a member has linked cards), placeholder "Enter your gift card
  // number". Errors render as a caption + aria-invalid on the input — there
  // is no role=alert for a rejected gift card.
  const giftCardInput = (): Locator =>
    page
      .getByRole("textbox", { name: /^(gift card code|or enter a code)$/i })
      .or(page.getByPlaceholder(/enter your gift card number/i))
      .first();

  const giftCardAppliedBanner = (): Locator =>
    page.getByText(/^gift card applied/i);

  /**
   * The submit button. Lima labels it "Order Now" — the same words the embed
   * button uses, which is deliberate on their side and a locator hazard on
   * ours, so scope it to the payment form rather than the whole page.
   */
  const placeOrderButton = (): Locator =>
    page
      .getByTestId("place-order")
      .or(page.getByRole("button", { name: /^order now$/i }))
      .last();

  /**
   * Submit the payment form. Focus leaves the Stripe iframe FIRST: blurring a
   * completed card makes the Payment Element expand its Link "save my info"
   * panel, which pushes Order Now down the page. Clicking straight from the
   * last card field lands the mouse-up where the button USED to be and the
   * submit is silently lost (observed on QA: no /payment_methods call until a
   * second click). Focusing the button settles the layout before the click.
   */
  const placeOrder = async (): Promise<void> => {
    const button = placeOrderButton();
    await expect(button).toBeEnabled({ timeout: 20_000 });
    await button.focus();
    await button.click();
  };

  /** Total as rendered, for asserting a discount actually moved it. */
  const readTotal = async (): Promise<number | null> => {
    // OrderSummary's "Total" heading + amount. Wait for the server quote to
    // land (the row shows no amount while it is pending) — reading early
    // returns null and turns a "total unchanged" check vacuous.
    const row = page
      .getByRole("heading", { name: "Total", exact: true })
      .locator("xpath=..");
    await expect(row).toContainText(/\$\s?[\d,]+\.\d{2}/, { timeout: 20_000 });
    const text = await row.innerText();
    const match = /\$\s?([\d,]+\.\d{2})/.exec(text);
    return match?.[1] ? parseFloat(match[1].replace(/,/g, "")) : null;
  };

  const errorAlert = (): Locator =>
    page.getByRole("alert").filter({ hasText: /.+/ }).first();

  const assertOnCheckout = () =>
    expect(page).toHaveURL(/\/checkout/, { timeout: 20_000 });

  const assertOrderConfirmed = () =>
    expect(page).toHaveURL(/\/order-confirmation\//, { timeout: 60_000 });

  return {
    proceedToCheckoutButton,
    emptyCartMessage,
    couponInput,
    readCartTotal,
    applyCouponButton,
    applyCoupon,
    goToCheckout,
    fillCustomerInfo,
    serviceTypeButton,
    assertPickupSelected,
    proceedToPaymentButton,
    proceedToPayment,
    giftCardInput,
    giftCardAppliedBanner,
    placeOrderButton,
    placeOrder,
    readTotal,
    errorAlert,
    assertOnCheckout,
    assertOrderConfirmed,
  };
};

export type LimaCheckoutPage = ReturnType<typeof createLimaCheckoutPage>;
