# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/03-processing-fee.spec.ts >> Customer — Processing fee pass-through >> TC-222: enabling the processing fee adds a Processing Fee line and raises the wind checkout total
- Location: tests/customer/03-processing-fee.spec.ts:25:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Processing Fee', { exact: true })
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByText('Processing Fee', { exact: true })

```

```yaml
- main:
  - button "Back"
  - heading "Checkout" [level=1]
  - paragraph: Boithok Khana Kitchen -
  - heading "Customer Information" [level=3]
  - text: First Name *
  - textbox "John"
  - text: Last Name *
  - textbox "Doe"
  - text: Email Address *
  - textbox "john@example.com"
  - text: Phone Number *
  - textbox "(555) 123-4567"
  - paragraph: "* Required fields"
  - checkbox "Enroll into promotional emails from Boithok Khana Kitchen -" [checked]
  - text: Enroll into promotional emails from Boithok Khana Kitchen -
  - checkbox "Get promotional texts from Boithok Khana Kitchen -" [checked]
  - text: Get promotional texts from Boithok Khana Kitchen -
  - paragraph:
    - text: By signing up, you agree to receive email marketing communications from Boithok Khana Kitchen - and our technology partner
    - link "RestauNax":
      - /url: https://www.restaunax.com
    - text: and consent to our
    - link "Terms and policies":
      - /url: /terms
    - text: . You may receive email or SMS notifications from us for order updates and account access and can opt out any time.
  - heading "Gift Card" [level=4]
  - text: Gift Card Code
  - textbox "Enter your gift card number"
  - button "Apply" [disabled]
  - heading "Service Type" [level=3]
  - paragraph: Delivery Coverage
  - paragraph: Enter your address and we'll check whether we can deliver to you.
  - button "Pickup 15-20 minutes Free":
    - heading "Pickup" [level=4]
    - paragraph: 15-20 minutes
    - text: Free
  - button "Delivery 25-35 min $0.00":
    - heading "Delivery" [level=4]
    - paragraph: 25-35 min
    - text: $0.00
  - heading "Pickup Location" [level=4]
  - paragraph:
    - strong: Boithok Khana Kitchen -
  - paragraph: 1102 Liberty Avenue, Brooklyn, New York 11208
  - paragraph: Your order will be ready for pickup in 15-20 minutes after confirmation.
  - heading "When do you want your order?" [level=3]
  - paragraph: Choose to receive your order as soon as possible or schedule for a specific time.
  - radio "As soon as possible Selected Your order will be prepared immediately" [checked]
  - text: As soon as possible Selected
  - paragraph: Your order will be prepared immediately
  - radio "Schedule for later Choose a specific date and time"
  - text: Schedule for later
  - paragraph: Choose a specific date and time
  - heading "Add a Tip" [level=3]
  - text: (Optional)
  - paragraph: Support our team with a tip. 100% goes to the staff.
  - button "15% $1.95"
  - button "18% $2.34"
  - button "20% $2.60"
  - button "25% $3.25"
  - text: Custom Amount
  - textbox "0.00"
  - text: "Total Tip: $1.95"
  - heading "Special Instructions" [level=3]
  - text: (Optional)
  - textbox "Any special requests or instructions for your order..."
  - paragraph: Let us know about allergies, preferences, or special requests
  - text: 0/500
  - heading "Ready to Order?" [level=3]
  - paragraph: Review your order and proceed to payment
  - button "Proceed to Payment" [disabled]
  - text: Please fill in all required fields with valid information
  - heading "Order Summary" [level=3]
  - heading "1x Automation Burger" [level=4]
  - text: $12.99
  - button "Remove item"
  - text: Have a coupon code?
  - textbox "Enter code"
  - button "Apply" [disabled]
  - text: Subtotal $12.99 Tax $1.14 Tip $1.95 Total $16.08
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
  225 |       page
  226 |         .getByText(
  227 |           pattern ??
  228 |             /not valid|invalid|error|not found|couldn't find|only applies to delivery|expired/i
  229 |         )
  230 |         .first()
  231 |     ).toBeVisible({ timeout: 15_000 });
  232 |     await expect(page.getByText(/Saving \$\d/)).toHaveCount(0);
  233 |   };
  234 | 
  235 |   // ── Gift card (RewardSection's "Gift Card" box; guest-accessible, renders
  236 |   // unconditionally right after the customer-info form regardless of the
  237 |   // restaurant's gift-card config — see couponBox() comment above for why
  238 |   // this needs scoping). The "Gift Card" h4 heading is present in both the
  239 |   // pre-apply (code input) and post-apply (applied summary) states, unlike
  240 |   // the coupon box's label, so this locator works for both apply and remove.
  241 |   //
  242 |   // Scoped by walking up from the heading two ancestor <div>s (heading's own
  243 |   // wrapper, then the box's root — matches RewardSection's exact JSX
  244 |   // nesting), not a div:has(heading) + .last() filter chain: that pattern
  245 |   // proved unreliable here too (same issue found on the gift-cards purchase
  246 |   // page's balance-check box — see CustomerGiftCardPage.ts).
  247 |   const giftCardBox = () =>
  248 |     page
  249 |       .getByRole("heading", { name: "Gift Card", exact: true })
  250 |       .locator("xpath=ancestor::div[2]");
  251 |   const giftCardCodeInput = () =>
  252 |     giftCardBox().getByPlaceholder("XXXX-XXXX-XXXX-XXXX");
  253 |   const applyGiftCardButton = () =>
  254 |     giftCardBox().getByRole("button", { name: "Apply", exact: true });
  255 |   const removeGiftCardButton = () =>
  256 |     giftCardBox().getByRole("button", { name: "Remove", exact: true });
  257 | 
  258 |   const applyGiftCard = async (code: string) => {
  259 |     await giftCardCodeInput().waitFor({ state: "visible", timeout: 15_000 });
  260 |     await giftCardCodeInput().fill(code);
  261 |     await applyGiftCardButton().click();
  262 |   };
  263 | 
  264 |   const removeGiftCard = () => removeGiftCardButton().click();
  265 | 
  266 |   // Success swaps the box for a green "Gift card applied: -$X.XX" summary
  267 |   // (and, if the card's balance exceeds what was applied, a "Remaining
  268 |   // balance: $X.XX" line — see checkout/page.tsx's full-balance-application
  269 |   // behavior, appliedGiftCard always equals the card's full current balance).
  270 |   const assertGiftCardApplied = () =>
  271 |     expect(giftCardBox().getByText(/Gift card applied: -\$\d/)).toBeVisible({
  272 |       timeout: 15_000,
  273 |     });
  274 | 
  275 |   const assertGiftCardRemoved = () =>
  276 |     expect(giftCardBox().getByText(/Gift card applied: -\$\d/)).toHaveCount(0);
  277 | 
  278 |   // Invalid/inactive/depleted code → red error text inside the box; no
  279 |   // applied summary appears.
  280 |   const assertGiftCardRejected = async () => {
  281 |     await expect(giftCardBox().locator("p.text-red-500")).toBeVisible({
  282 |       timeout: 15_000,
  283 |     });
  284 |     await expect(
  285 |       giftCardBox().getByText(/Gift card applied: -\$\d/)
  286 |     ).toHaveCount(0);
  287 |   };
  288 | 
  289 |   // ── Tip (TipSection — "Add a Tip" box with 15/18/20/25% preset buttons and a
  290 |   // "Custom Amount" input; default 15%). Scoped from the heading exactly like
  291 |   // giftCardBox: heading → its flex wrapper → the box root.
  292 |   const tipBox = () =>
  293 |     page
  294 |       .getByRole("heading", { name: "Add a Tip" })
  295 |       .locator("xpath=ancestor::div[2]");
  296 |   // Accessible name is "18% $2.34" (percent + computed amount) — prefix match.
  297 |   const tipPresetButton = (percent: number) =>
  298 |     tipBox().getByRole("button", { name: new RegExp(`^${percent}%`) });
  299 |   const customTipInput = () => tipBox().getByPlaceholder("0.00");
  300 |   const totalTipValue = () =>
  301 |     tipBox().getByText("Total Tip:").locator("xpath=following-sibling::span");
  302 | 
  303 |   const selectTipPreset = (percent: number) => tipPresetButton(percent).click();
  304 |   // The input is cents-based: every typed digit shifts left (e.g. "500" →
  305 |   // $5.00), so pass raw digits, not a decimal string.
  306 |   const fillCustomTip = (digits: string) => customTipInput().fill(digits);
  307 |   const assertTipTotal = (amount: string) =>
  308 |     expect(totalTipValue()).toHaveText(`$${amount}`, { timeout: 10_000 });
  309 | 
  310 |   // ── Order summary total — the server-quoted amountToCharge (OrderSummary's
  311 |   // Total row; a pulsing skeleton while the quote is in flight). The amount
  312 |   // span's text-xl font-bold classes are its only stable hook — it's the only
  313 |   // such span on the page.
  314 |   const orderTotalAmount = () => page.locator("span.text-xl.font-bold").first();
  315 | 
  316 |   // ── Processing Fee line (OrderSummary; renders ONLY when the restaurant
  317 |   // passes the payment-processing fee to the customer, sitting after the Tax
  318 |   // row). Server-authoritative — driven by the restaurant's
  319 |   // passProcessingFeeToCustomer setting, so it appears/disappears purely from
  320 |   // that flag. Text-only hook (the row has no id/testid), same style as the
  321 |   // Coupon line assertion above.
  322 |   const processingFeeLabel = () =>
  323 |     page.getByText("Processing Fee", { exact: true });
  324 |   const assertProcessingFeeVisible = () =>
> 325 |     expect(processingFeeLabel()).toBeVisible({ timeout: 20_000 });
      |                                  ^ Error: expect(locator).toBeVisible() failed
  326 |   const assertNoProcessingFee = () =>
  327 |     expect(processingFeeLabel()).toHaveCount(0);
  328 | 
  329 |   // NaN while the quote skeleton is showing — poll with expect.poll.
  330 |   const readOrderTotal = async (): Promise<number> => {
  331 |     const text = (
  332 |       await orderTotalAmount()
  333 |         .innerText()
  334 |         .catch(() => "")
  335 |     ).trim();
  336 |     const amount = text.match(/\$([\d.]+)/)?.[1];
  337 |     return amount ? parseFloat(amount) : NaN;
  338 |   };
  339 | 
  340 |   // ── Cart line removal at checkout (OrderSummary rows only have a Remove
  341 |   // button — no quantity steppers).
  342 |   const removeFirstCartItem = () =>
  343 |     page.getByRole("button", { name: "Remove item" }).first().click();
  344 | 
  345 |   // ── Stripe minimum — a quoted total in (0, $0.50) disables the proceed
  346 |   // button (label swaps to "Minimum $0.50 Required") and shows an amber
  347 |   // explainer banner. No order is ever created in this state.
  348 |   const assertBelowStripeMinimum = async () => {
  349 |     await expect(page.getByText(/below the \$0\.50 minimum/i)).toBeVisible({
  350 |       timeout: 15_000,
  351 |     });
  352 |     const blockedButton = page.getByRole("button", {
  353 |       name: "Minimum $0.50 Required",
  354 |     });
  355 |     await expect(blockedButton).toBeVisible({ timeout: 10_000 });
  356 |     await expect(blockedButton).toBeDisabled();
  357 |   };
  358 | 
  359 |   // ── Delivery (ServiceTypeSelector — buttons, not radios; Delivery hidden on
  360 |   // pickup-only/ship-only restaurants).
  361 |   const deliveryButton = () => page.getByRole("button", { name: /delivery/i });
  362 |   const deliveryAddressInput = () =>
  363 |     page.getByPlaceholder(/Enter your (delivery|shipping) address/i);
  364 | 
  365 |   const isDeliveryAvailable = async () => (await deliveryButton().count()) > 0;
  366 | 
  367 |   const selectDelivery = () => deliveryButton().first().click();
  368 | 
  369 |   // The address field is a Google Places autocomplete — type + pick the first
  370 |   // suggestion (external API; caller handles the no-suggestion skip).
  371 |   const fillDeliveryAddress = async (query: string) => {
  372 |     await deliveryAddressInput().waitFor({ state: "visible", timeout: 10_000 });
  373 |     await deliveryAddressInput().click();
  374 |     await deliveryAddressInput().pressSequentially(query, { delay: 100 });
  375 |   };
  376 | 
  377 |   const firstAddressSuggestion = () =>
  378 |     page.locator('[class*="pac-item"], [role="option"]').first();
  379 | 
  380 |   // Either outcome proves the address → /api/delivery/quote round-trip fired:
  381 |   // the green "Delivery Available" fee box or the red "Not Available" box.
  382 |   const assertDeliveryQuoteResolved = () =>
  383 |     expect(
  384 |       page
  385 |         .getByText(/Delivery Available/i)
  386 |         .or(page.getByText(/Delivery Not Available/i))
  387 |         .first()
  388 |     ).toBeVisible({ timeout: 20_000 });
  389 | 
  390 |   return {
  391 |     seedCart,
  392 |     seedCartItems,
  393 |     gotoCheckoutEmpty,
  394 |     assertEmptyCart,
  395 |     selectTipPreset,
  396 |     fillCustomTip,
  397 |     assertTipTotal,
  398 |     readOrderTotal,
  399 |     assertProcessingFeeVisible,
  400 |     assertNoProcessingFee,
  401 |     removeFirstCartItem,
  402 |     assertBelowStripeMinimum,
  403 |     fillCustomerInfo,
  404 |     selectPickup,
  405 |     proceedToPaymentButton,
  406 |     assertFormVisible,
  407 |     clickProceedToPayment,
  408 |     assertPaymentSectionVisible,
  409 |     fillStripeCard,
  410 |     completeOrder,
  411 |     assertPaymentError,
  412 |     couponCodeInput,
  413 |     applyCoupon,
  414 |     assertCouponApplied,
  415 |     assertCouponRejected,
  416 |     giftCardCodeInput,
  417 |     applyGiftCardButton,
  418 |     removeGiftCardButton,
  419 |     applyGiftCard,
  420 |     removeGiftCard,
  421 |     assertGiftCardApplied,
  422 |     assertGiftCardRemoved,
  423 |     assertGiftCardRejected,
  424 |     deliveryButton,
  425 |     deliveryAddressInput,
```