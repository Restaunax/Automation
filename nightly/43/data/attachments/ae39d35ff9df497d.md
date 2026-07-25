# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/04-gift-cards.spec.ts >> Customer — Gift Cards >> TC-170: balance check shows not-found for a nonexistent code
- Location: tests/customer/04-gift-cards.spec.ts:121:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Check Gift Card Balance' }).locator('xpath=ancestor::div[2]').getByText('Card not found or invalid code')
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('heading', { name: 'Check Gift Card Balance' }).locator('xpath=ancestor::div[2]').getByText('Card not found or invalid code')

```

```yaml
- main:
  - navigation:
    - img "Boithok Khana Kitchen -"
    - text: Boithok Khana Kitchen -
    - button "Menu"
    - button "Catering"
    - button "Gift Cards"
    - button "Our Story"
    - button "Loyalty"
    - button "Events"
    - button "Gallery"
    - button "More"
    - button "Log in"
    - button
  - heading "Gift Cards" [level=1]
  - paragraph: Give the gift of great food to someone special
  - text: 1 Amount 2 Payment 3 Confirmation
  - heading "Choose an Amount" [level=3]
  - paragraph: Select a preset amount or enter your own
  - button "$10"
  - button "$25"
  - button "$50"
  - button "$100"
  - text: Custom Amount
  - textbox "5 - 500"
  - paragraph: Who is this gift card for?
  - button "For Myself"
  - button "Send as Gift"
  - button "Continue"
  - heading "Check Gift Card Balance" [level=3]
  - text: Gift Card Code
  - textbox "XXXX-XXXX-XXXX-XXXX"
  - button "Check Balance" [disabled]
- contentinfo:
  - text: Powered by
  - link "RestauNax RestauNax":
    - /url: https://www.restaunax.com
    - img "RestauNax"
    - text: RestauNax
  - text: "|"
  - link "Terms":
    - /url: https://www.restaunax.com/website-terms
  - text: "|"
  - link "Privacy":
    - /url: https://www.restaunax.com/privacy-policy
- alert
```

# Test source

```ts
  40  | 
  41  |   const recipientEmailInput = () =>
  42  |     page.getByPlaceholder("recipient@example.com");
  43  |   const recipientNameInput = () => page.getByPlaceholder("Their name");
  44  |   const personalMessageInput = () =>
  45  |     page.getByPlaceholder("Add a personal message...");
  46  | 
  47  |   const amountErrorText = () =>
  48  |     page.getByText(/Please select or enter an amount\.|Amount must be between/);
  49  | 
  50  |   const continueButton = () =>
  51  |     page.getByRole("button", { name: "Continue", exact: true });
  52  | 
  53  |   // Fills the "Send as Gift" fields the guest path needs — no auth required,
  54  |   // unlike "For Myself" which triggers a sign-in modal (see page.tsx:364-369).
  55  |   const fillGiftRecipient = async (email: string, name?: string) => {
  56  |     await selectSendAsGift();
  57  |     await recipientEmailInput().fill(email);
  58  |     if (name) await recipientNameInput().fill(name);
  59  |   };
  60  | 
  61  |   // ── Step 2: Payment ──────────────────────────────────────────────────────
  62  |   const paymentHeading = () =>
  63  |     page.getByRole("heading", { name: "Complete Payment" });
  64  |   const assertPaymentSectionVisible = () =>
  65  |     expect(paymentHeading()).toBeVisible({ timeout: 20_000 });
  66  | 
  67  |   const fillStripeCard = async (
  68  |     cardNumber: string = STRIPE_CARDS.VISA_SUCCESS,
  69  |     expiry: string = STRIPE_DEFAULTS.EXPIRY_MM_YY,
  70  |     cvc = STRIPE_DEFAULTS.CVC
  71  |   ) => {
  72  |     await fillStripePaymentElement(page, cardNumber, expiry, cvc);
  73  |   };
  74  | 
  75  |   // Button text is dynamic ("Pay $10.00"), so match by prefix.
  76  |   const payButton = () => page.getByRole("button", { name: /^Pay \$/ });
  77  |   const completePurchase = () => payButton().click();
  78  | 
  79  |   // ── Step 3: Confirmation ─────────────────────────────────────────────────
  80  |   const giftSentHeading = () =>
  81  |     page.getByRole("heading", { name: "Gift Card Sent!" });
  82  |   const assertPurchaseConfirmed = () =>
  83  |     expect(giftSentHeading()).toBeVisible({ timeout: 20_000 });
  84  | 
  85  |   // Formatted code is always 4 groups of 4 alphanumeric chars, e.g. "AB12-CD34-EF56-GH78".
  86  |   const confirmationCodeText = () =>
  87  |     page.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  88  | 
  89  |   const readConfirmationCode = async (): Promise<string> => {
  90  |     const text = await confirmationCodeText().textContent();
  91  |     if (!text) throw new Error("Gift card confirmation code not found");
  92  |     return text.trim();
  93  |   };
  94  | 
  95  |   // ── Balance check section ────────────────────────────────────────────────
  96  |   // Scoped by walking up from the heading two ancestor <div>s (heading's own
  97  |   // wrapper, then BalanceCheckSection's root — matches the component's exact
  98  |   // JSX nesting). A div:has(heading) + .last() filter chain proved unreliable
  99  |   // here (didn't resolve within timeout despite the elements being visible in
  100 |   // the page snapshot), so this uses an explicit, source-verified depth
  101 |   // instead. Needed because the page can also render a "Link a gift card
  102 |   // code" input with the same "XXXX-XXXX-XXXX-XXXX" placeholder when
  103 |   // authenticated, and because the purchase confirmation step's own "Balance:
  104 |   // $X.XX" text would otherwise collide with this section's result text.
  105 |   const balanceCheckBox = () =>
  106 |     page
  107 |       .getByRole("heading", { name: "Check Gift Card Balance" })
  108 |       .locator("xpath=ancestor::div[2]");
  109 |   const balanceCheckInput = () =>
  110 |     balanceCheckBox().getByPlaceholder("XXXX-XXXX-XXXX-XXXX");
  111 |   const checkBalanceButton = () =>
  112 |     balanceCheckBox().getByRole("button", { name: "Check Balance" });
  113 | 
  114 |   // Submits via Enter (the input has its own onKeyDown handler for this)
  115 |   // rather than clicking the button: the button re-renders/detaches right
  116 |   // after fill() in a way that makes Playwright's click-actionability retry
  117 |   // loop chase a moving target (confirmed live — a fresh, disabled button
  118 |   // instance keeps replacing the enabled one). Pressing Enter in the
  119 |   // already-focused, already-filled input sidesteps that race entirely.
  120 |   const checkBalance = async (code: string) => {
  121 |     await balanceCheckInput().waitFor({ state: "visible", timeout: 15_000 });
  122 |     await balanceCheckInput().fill(code);
  123 |     await balanceCheckInput().press("Enter");
  124 |   };
  125 | 
  126 |   const balanceResultAmount = () => balanceCheckBox().getByText(/^\$\d/);
  127 |   const balanceNotFoundError = () =>
  128 |     balanceCheckBox().getByText("Card not found or invalid code");
  129 | 
  130 |   // For a freshly purchased card, Current Balance and Initial Balance are the
  131 |   // same figure — both render as "$X.XX", so this must pick just one match.
  132 |   const assertBalanceResult = (expectedBalance: number) =>
  133 |     expect(
  134 |       balanceCheckBox()
  135 |         .getByText(`$${expectedBalance.toFixed(2)}`)
  136 |         .first()
  137 |     ).toBeVisible({ timeout: 15_000 });
  138 | 
  139 |   const assertBalanceNotFound = () =>
> 140 |     expect(balanceNotFoundError()).toBeVisible({ timeout: 15_000 });
      |                                    ^ Error: expect(locator).toBeVisible() failed
  141 | 
  142 |   return {
  143 |     goto,
  144 |     denominationButton,
  145 |     customAmountInput,
  146 |     selectDenomination,
  147 |     fillCustomAmount,
  148 |     sendAsGiftButton,
  149 |     forMyselfButton,
  150 |     selectSendAsGift,
  151 |     recipientEmailInput,
  152 |     recipientNameInput,
  153 |     personalMessageInput,
  154 |     amountErrorText,
  155 |     continueButton,
  156 |     fillGiftRecipient,
  157 |     paymentHeading,
  158 |     assertPaymentSectionVisible,
  159 |     fillStripeCard,
  160 |     payButton,
  161 |     completePurchase,
  162 |     giftSentHeading,
  163 |     assertPurchaseConfirmed,
  164 |     confirmationCodeText,
  165 |     readConfirmationCode,
  166 |     balanceCheckInput,
  167 |     checkBalanceButton,
  168 |     checkBalance,
  169 |     balanceResultAmount,
  170 |     balanceNotFoundError,
  171 |     assertBalanceResult,
  172 |     assertBalanceNotFound,
  173 |   };
  174 | };
  175 | 
  176 | export type CustomerGiftCardPage = ReturnType<
  177 |   typeof createCustomerGiftCardPage
  178 | >;
  179 | 
```