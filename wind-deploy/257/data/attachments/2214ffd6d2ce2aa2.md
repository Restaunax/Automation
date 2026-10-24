# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/04-gift-cards.spec.ts >> Customer — Gift Cards >> TC-170: balance check shows not-found for a nonexistent code
- Location: tests/customer/04-gift-cards.spec.ts:121:7

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('heading', { name: 'Check Gift Card Balance' }).locator('xpath=ancestor::div[2]').getByPlaceholder('XXXX-XXXX-XXXX-XXXX') to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - navigation [ref=e4]:
        - generic [ref=e6]:
          - generic [ref=e8] [cursor=pointer]:
            - img "Boithok Khana Kitchen -" [ref=e9]
            - generic [ref=e10]: Boithok Khana Kitchen -
          - generic [ref=e11]:
            - generic [ref=e12]:
              - button "Menu" [ref=e13] [cursor=pointer]:
                - img [ref=e14]
                - generic [ref=e19]: Menu
              - button "Catering" [ref=e20] [cursor=pointer]:
                - img [ref=e21]
                - generic [ref=e23]: Catering
              - button "Gift Cards" [ref=e24] [cursor=pointer]:
                - img [ref=e25]
                - generic [ref=e29]: Gift Cards
              - button "Our Story" [ref=e30] [cursor=pointer]:
                - img [ref=e31]
                - generic [ref=e33]: Our Story
              - button "Loyalty" [ref=e34] [cursor=pointer]:
                - img [ref=e35]
                - generic [ref=e37]: Loyalty
              - button "Events" [ref=e38] [cursor=pointer]:
                - img [ref=e39]
                - generic [ref=e45]: Events
              - button "Gallery" [ref=e46] [cursor=pointer]:
                - img [ref=e47]
                - generic [ref=e51]: Gallery
              - button "More" [ref=e53] [cursor=pointer]:
                - generic [ref=e54]: More
                - img [ref=e55]
            - button "Log in" [ref=e59] [cursor=pointer]:
              - img [ref=e60]
              - generic [ref=e63]: Log in
            - button [ref=e64] [cursor=pointer]:
              - img [ref=e65]
      - generic [ref=e69]:
        - generic [ref=e70]:
          - img [ref=e71]
          - heading "Gift Cards" [level=1] [ref=e75]
          - paragraph [ref=e76]: Give the gift of great food to someone special
        - generic [ref=e78]:
          - generic [ref=e79]:
            - generic [ref=e81]:
              - generic [ref=e82]: "1"
              - generic [ref=e83]: Amount
            - generic [ref=e86]:
              - generic [ref=e87]: "2"
              - generic [ref=e88]: Payment
            - generic [ref=e91]:
              - generic [ref=e92]: "3"
              - generic [ref=e93]: Confirmation
          - generic [ref=e94]:
            - img [ref=e95]
            - heading "Choose an Amount" [level=3] [ref=e97]
            - paragraph [ref=e98]: Select a preset amount or enter your own
          - generic [ref=e99]:
            - button "$10" [ref=e100] [cursor=pointer]
            - button "$25" [ref=e101] [cursor=pointer]
            - button "$50" [ref=e102] [cursor=pointer]
            - button "$100" [ref=e103] [cursor=pointer]
          - generic [ref=e104]:
            - generic [ref=e105]: Custom Amount
            - generic [ref=e106]:
              - img [ref=e107]
              - textbox "5 - 500" [ref=e109]
          - generic [ref=e110]:
            - paragraph [ref=e111]: Who is this gift card for?
            - generic [ref=e112]:
              - button "For Myself" [ref=e113] [cursor=pointer]:
                - img [ref=e114]
                - text: For Myself
              - button "Send as Gift" [ref=e117] [cursor=pointer]:
                - img [ref=e118]
                - text: Send as Gift
          - button "Continue" [ref=e122] [cursor=pointer]
        - generic [ref=e124]:
          - generic [ref=e125]:
            - img [ref=e126]
            - heading "Check Gift Card Balance" [level=3] [ref=e129]
          - generic [ref=e130]:
            - generic [ref=e131]:
              - generic [ref=e132]: Gift Card Code
              - textbox "Enter your gift card number" [ref=e133]
            - button "Check Balance" [disabled] [ref=e134]
  - contentinfo [ref=e135]:
    - generic [ref=e136]:
      - generic [ref=e137]:
        - generic [ref=e138]: Powered by
        - link "RestauNax RestauNax" [ref=e139] [cursor=pointer]:
          - /url: https://www.restaunax.com
          - img "RestauNax" [ref=e140]
          - generic [ref=e141]: RestauNax
      - generic [ref=e142]: "|"
      - generic [ref=e143]:
        - link "Terms" [ref=e144] [cursor=pointer]:
          - /url: https://www.restaunax.com/website-terms
        - generic [ref=e145]: "|"
        - link "Privacy" [ref=e146] [cursor=pointer]:
          - /url: https://www.restaunax.com/privacy-policy
  - alert [ref=e147]
```

# Test source

```ts
  22  |   // ── Step 1: Amount selection ─────────────────────────────────────────────
  23  |   // Preset denomination buttons render as exact "$10", "$25", etc. (no decimals).
  24  |   const denominationButton = (amount: number) =>
  25  |     page.getByRole("button", { name: `$${amount}`, exact: true });
  26  | 
  27  |   // Placeholder is dynamic ("${min} - ${max}") per restaurant config; this is
  28  |   // the only input on the page matching a "number - number" placeholder.
  29  |   const customAmountInput = () =>
  30  |     page.getByPlaceholder(/^\d+(\.\d+)? - \d+(\.\d+)?$/);
  31  | 
  32  |   const selectDenomination = (amount: number) =>
  33  |     denominationButton(amount).click();
  34  |   const fillCustomAmount = (amount: string) => customAmountInput().fill(amount);
  35  | 
  36  |   const sendAsGiftButton = () =>
  37  |     page.getByRole("button", { name: "Send as Gift", exact: true });
  38  |   const forMyselfButton = () =>
  39  |     page.getByRole("button", { name: "For Myself", exact: true });
  40  |   const selectSendAsGift = () => sendAsGiftButton().click();
  41  | 
  42  |   const recipientEmailInput = () =>
  43  |     page.getByPlaceholder("recipient@example.com");
  44  |   const recipientNameInput = () => page.getByPlaceholder("Their name");
  45  |   const personalMessageInput = () =>
  46  |     page.getByPlaceholder("Add a personal message...");
  47  | 
  48  |   const amountErrorText = () =>
  49  |     page.getByText(/Please select or enter an amount\.|Amount must be between/);
  50  | 
  51  |   const continueButton = () =>
  52  |     page.getByRole("button", { name: "Continue", exact: true });
  53  | 
  54  |   // Fills the "Send as Gift" fields the guest path needs — no auth required,
  55  |   // unlike "For Myself" which triggers a sign-in modal (see page.tsx:364-369).
  56  |   const fillGiftRecipient = async (email: string, name?: string) => {
  57  |     await selectSendAsGift();
  58  |     await recipientEmailInput().fill(email);
  59  |     if (name) await recipientNameInput().fill(name);
  60  |   };
  61  | 
  62  |   // ── Step 2: Payment ──────────────────────────────────────────────────────
  63  |   const paymentHeading = () =>
  64  |     page.getByRole("heading", { name: "Complete Payment" });
  65  |   const assertPaymentSectionVisible = () =>
  66  |     expect(paymentHeading()).toBeVisible({ timeout: 20_000 });
  67  | 
  68  |   const fillStripeCard = async (
  69  |     cardNumber: string = STRIPE_CARDS.VISA_SUCCESS,
  70  |     expiry: string = STRIPE_DEFAULTS.EXPIRY_MM_YY,
  71  |     cvc = STRIPE_DEFAULTS.CVC
  72  |   ) => {
  73  |     await fillStripePaymentElement(page, cardNumber, expiry, cvc);
  74  |   };
  75  | 
  76  |   // Button text is dynamic ("Pay $10.00"), so match by prefix.
  77  |   const payButton = () => page.getByRole("button", { name: /^Pay \$/ });
  78  |   const completePurchase = () => payButton().click();
  79  | 
  80  |   // ── Step 3: Confirmation ─────────────────────────────────────────────────
  81  |   const giftSentHeading = () =>
  82  |     page.getByRole("heading", { name: "Gift Card Sent!" });
  83  |   const assertPurchaseConfirmed = () =>
  84  |     expect(giftSentHeading()).toBeVisible({ timeout: 20_000 });
  85  | 
  86  |   // Formatted code is always 4 groups of 4 alphanumeric chars, e.g. "AB12-CD34-EF56-GH78".
  87  |   const confirmationCodeText = () =>
  88  |     page.getByText(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  89  | 
  90  |   const readConfirmationCode = async (): Promise<string> => {
  91  |     const text = await confirmationCodeText().textContent();
  92  |     if (!text) throw new Error("Gift card confirmation code not found");
  93  |     return text.trim();
  94  |   };
  95  | 
  96  |   // ── Balance check section ────────────────────────────────────────────────
  97  |   // Scoped by walking up from the heading two ancestor <div>s (heading's own
  98  |   // wrapper, then BalanceCheckSection's root — matches the component's exact
  99  |   // JSX nesting). A div:has(heading) + .last() filter chain proved unreliable
  100 |   // here (didn't resolve within timeout despite the elements being visible in
  101 |   // the page snapshot), so this uses an explicit, source-verified depth
  102 |   // instead. Needed because the page can also render a "Link a gift card
  103 |   // code" input with the same "XXXX-XXXX-XXXX-XXXX" placeholder when
  104 |   // authenticated, and because the purchase confirmation step's own "Balance:
  105 |   // $X.XX" text would otherwise collide with this section's result text.
  106 |   const balanceCheckBox = () =>
  107 |     page
  108 |       .getByRole("heading", { name: "Check Gift Card Balance" })
  109 |       .locator("xpath=ancestor::div[2]");
  110 |   const balanceCheckInput = () =>
  111 |     balanceCheckBox().getByPlaceholder("XXXX-XXXX-XXXX-XXXX");
  112 |   const checkBalanceButton = () =>
  113 |     balanceCheckBox().getByRole("button", { name: "Check Balance" });
  114 | 
  115 |   // Submits via Enter (the input has its own onKeyDown handler for this)
  116 |   // rather than clicking the button: the button re-renders/detaches right
  117 |   // after fill() in a way that makes Playwright's click-actionability retry
  118 |   // loop chase a moving target (confirmed live — a fresh, disabled button
  119 |   // instance keeps replacing the enabled one). Pressing Enter in the
  120 |   // already-focused, already-filled input sidesteps that race entirely.
  121 |   const checkBalance = async (code: string) => {
> 122 |     await balanceCheckInput().waitFor({ state: "visible", timeout: 15_000 });
      |                               ^ TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
  123 |     await balanceCheckInput().fill(code);
  124 |     await balanceCheckInput().press("Enter");
  125 |   };
  126 | 
  127 |   const balanceResultAmount = () => balanceCheckBox().getByText(/^\$\d/);
  128 |   const balanceNotFoundError = () =>
  129 |     balanceCheckBox().getByText("Card not found or invalid code");
  130 | 
  131 |   // For a freshly purchased card, Current Balance and Initial Balance are the
  132 |   // same figure — both render as "$X.XX", so this must pick just one match.
  133 |   const assertBalanceResult = (expectedBalance: number) =>
  134 |     expect(
  135 |       balanceCheckBox()
  136 |         .getByText(`$${expectedBalance.toFixed(2)}`)
  137 |         .first()
  138 |     ).toBeVisible({ timeout: 15_000 });
  139 | 
  140 |   const assertBalanceNotFound = () =>
  141 |     expect(balanceNotFoundError()).toBeVisible({ timeout: 15_000 });
  142 | 
  143 |   return {
  144 |     goto,
  145 |     denominationButton,
  146 |     customAmountInput,
  147 |     selectDenomination,
  148 |     fillCustomAmount,
  149 |     sendAsGiftButton,
  150 |     forMyselfButton,
  151 |     selectSendAsGift,
  152 |     recipientEmailInput,
  153 |     recipientNameInput,
  154 |     personalMessageInput,
  155 |     amountErrorText,
  156 |     continueButton,
  157 |     fillGiftRecipient,
  158 |     paymentHeading,
  159 |     assertPaymentSectionVisible,
  160 |     fillStripeCard,
  161 |     payButton,
  162 |     completePurchase,
  163 |     giftSentHeading,
  164 |     assertPurchaseConfirmed,
  165 |     confirmationCodeText,
  166 |     readConfirmationCode,
  167 |     balanceCheckInput,
  168 |     checkBalanceButton,
  169 |     checkBalance,
  170 |     balanceResultAmount,
  171 |     balanceNotFoundError,
  172 |     assertBalanceResult,
  173 |     assertBalanceNotFound,
  174 |   };
  175 | };
  176 | 
  177 | export type CustomerGiftCardPage = ReturnType<
  178 |   typeof createCustomerGiftCardPage
  179 | >;
  180 | 
```