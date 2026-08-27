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

  const couponInput = (): Locator =>
    page.getByPlaceholder(/enter code/i).first();

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

  const field = (label: RegExp): Locator => page.getByLabel(label).first();

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
        page.getByRole("button", {
          name: type === "PICKUP" ? /pickup/i : /delivery/i,
        })
      )
      .first();

  const giftCardInput = (): Locator =>
    page.getByPlaceholder(/XXXX-XXXX-XXXX-XXXX/i).first();

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

  /** Total as rendered, for asserting a discount actually moved it. */
  const readTotal = async (): Promise<number | null> => {
    const row = page.getByText(/^total/i).first();
    if ((await row.count()) === 0) return null;
    const text = await row
      .locator("xpath=..")
      .innerText()
      .catch(() => "");
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
    applyCouponButton,
    applyCoupon,
    goToCheckout,
    fillCustomerInfo,
    serviceTypeButton,
    giftCardInput,
    placeOrderButton,
    readTotal,
    errorAlert,
    assertOnCheckout,
    assertOrderConfirmed,
  };
};

export type LimaCheckoutPage = ReturnType<typeof createLimaCheckoutPage>;
