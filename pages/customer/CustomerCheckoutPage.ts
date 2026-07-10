import { type Page, expect } from "@playwright/test";
import { fillStripePaymentElement } from "../../utils/stripeHelper";
import { STRIPE_CARDS, STRIPE_DEFAULTS } from "../../utils/stripeCards";

const TEMPLATE_WIND_URL =
  process.env.TEMPLATE_WIND_URL ?? "https://qa.restaunax.com";

export const createCustomerCheckoutPage = (page: Page) => {
  // Navigate to menu first to establish the domain, then seed cart via sessionStorage.
  //
  // Uses page.addInitScript rather than a post-load page.evaluate: CartContext
  // auto-saves its in-memory state (items/coupon/tip/...) back to
  // sessionStorage on every mount/state change. A post-load evaluate() races
  // that autosave — navigating to /menu first remounts CartContext, which
  // reads whatever coupon/etc. is CURRENTLY in sessionStorage (e.g. left over
  // from a coupon applied earlier in the same test) into React state, and its
  // autosave effect can re-persist that stale value to sessionStorage *after*
  // our evaluate() already overwrote it — so a second seedCart() call within
  // one test intermittently fails to actually clear a previously-applied
  // coupon/gift-card. addInitScript runs before any of the app's own scripts
  // on every subsequent navigation in this page, so CartContext's very first
  // read already sees the fresh payload — there's nothing stale to reload.
  const seedCart = async (
    restaurantId: string,
    menuItemId: string,
    menuItemName: string,
    menuItemPrice: number
  ) => {
    await page.addInitScript(
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
    await page.goto(`${TEMPLATE_WIND_URL}/menu?restaurantId=${restaurantId}`, {
      waitUntil: "domcontentloaded",
    });
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

  // ServiceTypeSelector renders Pickup/Delivery as buttons, not radios (a
  // real deployment change since this was last verified — confirmed live:
  // getByRole("radio", {name:/pickup/i}) no longer matches anything).
  // Accessible name includes the prep-time/fee detail text, e.g. "Pickup
  // 15-20 minutes Free", so this matches by prefix rather than exact.
  const selectPickup = () =>
    page.getByRole("button", { name: /^Pickup/i }).click();

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
  //
  // Scoped to the box via its "Have a coupon code?" label: the checkout page
  // also renders a Gift Card box (RewardSection) with its own "Apply" button
  // right below the customer-info form, so an unscoped getByRole("button",
  // {name:"Apply"}) strict-mode-violates once both boxes are visible (both
  // render unconditionally on the same step). .last() picks the innermost
  // matching div (CouponSection's own root), not an outer page wrapper that
  // would also contain the gift-card box. The label only exists pre-apply,
  // which is exactly when these locators are needed.
  const couponBox = () =>
    page
      .locator("div")
      .filter({ has: page.getByText("Have a coupon code?", { exact: true }) })
      .last();
  const couponCodeInput = () => couponBox().getByPlaceholder("Enter code");
  const applyCouponButton = () =>
    couponBox().getByRole("button", { name: "Apply", exact: true });

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

  // Invalid code → red error box; the input stays (no applied block). A
  // nonexistent code's actual message is "Coupon Not Found" (confirmed live),
  // which the original "not valid|invalid|error" regex didn't cover.
  const assertCouponRejected = async () => {
    await expect(
      page.getByText(/not valid|invalid|error|not found/i).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Saving \$\d/)).toHaveCount(0);
  };

  // ── Gift card (RewardSection's "Gift Card" box; guest-accessible, renders
  // unconditionally right after the customer-info form regardless of the
  // restaurant's gift-card config — see couponBox() comment above for why
  // this needs scoping). The "Gift Card" h4 heading is present in both the
  // pre-apply (code input) and post-apply (applied summary) states, unlike
  // the coupon box's label, so this locator works for both apply and remove.
  //
  // Scoped by walking up from the heading two ancestor <div>s (heading's own
  // wrapper, then the box's root — matches RewardSection's exact JSX
  // nesting), not a div:has(heading) + .last() filter chain: that pattern
  // proved unreliable here too (same issue found on the gift-cards purchase
  // page's balance-check box — see CustomerGiftCardPage.ts).
  const giftCardBox = () =>
    page
      .getByRole("heading", { name: "Gift Card", exact: true })
      .locator("xpath=ancestor::div[2]");
  const giftCardCodeInput = () =>
    giftCardBox().getByPlaceholder("XXXX-XXXX-XXXX-XXXX");
  const applyGiftCardButton = () =>
    giftCardBox().getByRole("button", { name: "Apply", exact: true });
  const removeGiftCardButton = () =>
    giftCardBox().getByRole("button", { name: "Remove", exact: true });

  const applyGiftCard = async (code: string) => {
    await giftCardCodeInput().waitFor({ state: "visible", timeout: 15_000 });
    await giftCardCodeInput().fill(code);
    await applyGiftCardButton().click();
  };

  const removeGiftCard = () => removeGiftCardButton().click();

  // Success swaps the box for a green "Gift card applied: -$X.XX" summary
  // (and, if the card's balance exceeds what was applied, a "Remaining
  // balance: $X.XX" line — see checkout/page.tsx's full-balance-application
  // behavior, appliedGiftCard always equals the card's full current balance).
  const assertGiftCardApplied = () =>
    expect(giftCardBox().getByText(/Gift card applied: -\$\d/)).toBeVisible({
      timeout: 15_000,
    });

  const assertGiftCardRemoved = () =>
    expect(giftCardBox().getByText(/Gift card applied: -\$\d/)).toHaveCount(0);

  // Invalid/inactive/depleted code → red error text inside the box; no
  // applied summary appears.
  const assertGiftCardRejected = async () => {
    await expect(giftCardBox().locator("p.text-red-500")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      giftCardBox().getByText(/Gift card applied: -\$\d/)
    ).toHaveCount(0);
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
    giftCardCodeInput,
    applyGiftCardButton,
    removeGiftCardButton,
    applyGiftCard,
    removeGiftCard,
    assertGiftCardApplied,
    assertGiftCardRemoved,
    assertGiftCardRejected,
    deliveryButton,
    deliveryAddressInput,
    isDeliveryAvailable,
    selectDelivery,
    fillDeliveryAddress,
    firstAddressSuggestion,
    assertDeliveryQuoteResolved,
  };
};
