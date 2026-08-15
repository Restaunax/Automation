import { type Page, expect } from "@playwright/test";
import { fillStripePaymentElement } from "../../utils/stripeHelper";
import { STRIPE_CARDS, STRIPE_DEFAULTS } from "../../utils/stripeCards";

// Single source of truth for the storefront host (defaults to the QA Template
// Wind storefront, wind.restaunax.com — NOT qa.restaunax.com, the marketing site).
import { TEMPLATE_WIND_URL } from "../../utils/testData";

export const createCustomerGiftCardPage = (page: Page) => {
  // ?restaurantId= QA override, same as /menu and /checkout — skips the
  // location picker on a multi-location deployment.
  const goto = async (restaurantId: string) => {
    await page.goto(
      `${TEMPLATE_WIND_URL}/gift-cards?restaurantId=${restaurantId}`,
      { waitUntil: "domcontentloaded" }
    );
    await page
      .getByRole("heading", { name: "Choose an Amount" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  // ── Step 1: Amount selection ─────────────────────────────────────────────
  // Preset denomination buttons render as exact "$10", "$25", etc. (no decimals).
  const denominationButton = (amount: number) =>
    page.getByRole("button", { name: `$${amount}`, exact: true });

  // Placeholder is dynamic ("${min} - ${max}") per restaurant config; this is
  // the only input on the page matching a "number - number" placeholder.
  const customAmountInput = () =>
    page.getByPlaceholder(/^\d+(\.\d+)? - \d+(\.\d+)?$/);

  const selectDenomination = (amount: number) =>
    denominationButton(amount).click();
  const fillCustomAmount = (amount: string) => customAmountInput().fill(amount);

  const sendAsGiftButton = () =>
    page.getByRole("button", { name: "Send as Gift", exact: true });
  const forMyselfButton = () =>
    page.getByRole("button", { name: "For Myself", exact: true });
  const selectSendAsGift = () => sendAsGiftButton().click();

  const recipientEmailInput = () =>
    page.getByPlaceholder("recipient@example.com");
  const recipientNameInput = () => page.getByPlaceholder("Their name");
  const personalMessageInput = () =>
    page.getByPlaceholder("Add a personal message...");

  const amountErrorText = () =>
    page.getByText(/Please select or enter an amount\.|Amount must be between/);

  const continueButton = () =>
    page.getByRole("button", { name: "Continue", exact: true });

  // Fills the "Send as Gift" fields the guest path needs — no auth required,
  // unlike "For Myself" which triggers a sign-in modal (see page.tsx:364-369).
  const fillGiftRecipient = async (email: string, name?: string) => {
    await selectSendAsGift();
    await recipientEmailInput().fill(email);
    if (name) await recipientNameInput().fill(name);
  };

  // ── Step 2: Payment ──────────────────────────────────────────────────────
  const paymentHeading = () =>
    page.getByRole("heading", { name: "Complete Payment" });
  const assertPaymentSectionVisible = () =>
    expect(paymentHeading()).toBeVisible({ timeout: 20_000 });

  const fillStripeCard = async (
    cardNumber: string = STRIPE_CARDS.VISA_SUCCESS,
    expiry: string = STRIPE_DEFAULTS.EXPIRY_MM_YY,
    cvc = STRIPE_DEFAULTS.CVC
  ) => {
    await fillStripePaymentElement(page, cardNumber, expiry, cvc);
  };

  // Button text is dynamic ("Pay $10.00"), so match by prefix.
  const payButton = () => page.getByRole("button", { name: /^Pay \$/ });
  const completePurchase = () => payButton().click();

  // ── Step 3: Confirmation ─────────────────────────────────────────────────
  const giftSentHeading = () =>
    page.getByRole("heading", { name: "Gift Card Sent!" });
  const assertPurchaseConfirmed = () =>
    expect(giftSentHeading()).toBeVisible({ timeout: 20_000 });

  // Formatted code is always 4 groups of 4 alphanumeric chars, e.g. "AB12-CD34-EF56-GH78".
  const confirmationCodeText = () =>
    page.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const readConfirmationCode = async (): Promise<string> => {
    const text = await confirmationCodeText().textContent();
    if (!text) throw new Error("Gift card confirmation code not found");
    return text.trim();
  };

  // ── Balance check section ────────────────────────────────────────────────
  // Scoped by walking up from the heading two ancestor <div>s (heading's own
  // wrapper, then BalanceCheckSection's root — matches the component's exact
  // JSX nesting). A div:has(heading) + .last() filter chain proved unreliable
  // here (didn't resolve within timeout despite the elements being visible in
  // the page snapshot), so this uses an explicit, source-verified depth
  // instead. Needed because the page can also render a "Link a gift card
  // code" input with the same "XXXX-XXXX-XXXX-XXXX" placeholder when
  // authenticated, and because the purchase confirmation step's own "Balance:
  // $X.XX" text would otherwise collide with this section's result text.
  const balanceCheckBox = () =>
    page
      .getByRole("heading", { name: "Check Gift Card Balance" })
      .locator("xpath=ancestor::div[2]");
  const balanceCheckInput = () =>
    balanceCheckBox().getByPlaceholder("XXXX-XXXX-XXXX-XXXX");
  const checkBalanceButton = () =>
    balanceCheckBox().getByRole("button", { name: "Check Balance" });

  // Submits via Enter (the input has its own onKeyDown handler for this)
  // rather than clicking the button: the button re-renders/detaches right
  // after fill() in a way that makes Playwright's click-actionability retry
  // loop chase a moving target (confirmed live — a fresh, disabled button
  // instance keeps replacing the enabled one). Pressing Enter in the
  // already-focused, already-filled input sidesteps that race entirely.
  const checkBalance = async (code: string) => {
    await balanceCheckInput().waitFor({ state: "visible", timeout: 15_000 });
    await balanceCheckInput().fill(code);
    await balanceCheckInput().press("Enter");
  };

  const balanceResultAmount = () => balanceCheckBox().getByText(/^\$\d/);
  const balanceNotFoundError = () =>
    balanceCheckBox().getByText("Card not found or invalid code");

  // For a freshly purchased card, Current Balance and Initial Balance are the
  // same figure — both render as "$X.XX", so this must pick just one match.
  const assertBalanceResult = (expectedBalance: number) =>
    expect(
      balanceCheckBox()
        .getByText(`$${expectedBalance.toFixed(2)}`)
        .first()
    ).toBeVisible({ timeout: 15_000 });

  const assertBalanceNotFound = () =>
    expect(balanceNotFoundError()).toBeVisible({ timeout: 15_000 });

  return {
    goto,
    denominationButton,
    customAmountInput,
    selectDenomination,
    fillCustomAmount,
    sendAsGiftButton,
    forMyselfButton,
    selectSendAsGift,
    recipientEmailInput,
    recipientNameInput,
    personalMessageInput,
    amountErrorText,
    continueButton,
    fillGiftRecipient,
    paymentHeading,
    assertPaymentSectionVisible,
    fillStripeCard,
    payButton,
    completePurchase,
    giftSentHeading,
    assertPurchaseConfirmed,
    confirmationCodeText,
    readConfirmationCode,
    balanceCheckInput,
    checkBalanceButton,
    checkBalance,
    balanceResultAmount,
    balanceNotFoundError,
    assertBalanceResult,
    assertBalanceNotFound,
  };
};

export type CustomerGiftCardPage = ReturnType<
  typeof createCustomerGiftCardPage
>;
