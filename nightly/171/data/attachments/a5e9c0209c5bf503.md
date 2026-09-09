# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/02-checkout.spec.ts >> Customer — Checkout gift card >> TC-173: an invalid gift card code is rejected
- Location: tests/customer/02-checkout.spec.ts:595:7

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('heading', { name: 'Gift Card', exact: true }).locator('xpath=ancestor::div[2]').getByPlaceholder('XXXX-XXXX-XXXX-XXXX') to be visible

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic [ref=e6]:
        - button "Back" [ref=e7] [cursor=pointer]:
          - img [ref=e8]
          - generic [ref=e10]: Back
        - generic [ref=e11]:
          - heading "Checkout" [level=1] [ref=e12]
          - paragraph [ref=e13]: Boithok Khana Kitchen -
      - generic [ref=e18]:
        - generic [ref=e20]:
          - generic [ref=e21]:
            - generic [ref=e22]:
              - generic [ref=e24]:
                - img [ref=e25]
                - heading "Customer Information" [level=3] [ref=e28]
              - generic [ref=e29]:
                - generic [ref=e30]:
                  - generic [ref=e31]:
                    - generic [ref=e32]: First Name *
                    - generic [ref=e33]:
                      - img [ref=e34]
                      - textbox "John" [ref=e37]
                  - generic [ref=e38]:
                    - generic [ref=e39]: Last Name *
                    - generic [ref=e40]:
                      - img [ref=e41]
                      - textbox "Doe" [ref=e44]
                - generic [ref=e45]:
                  - generic [ref=e46]:
                    - generic [ref=e47]: Email Address *
                    - generic [ref=e48]:
                      - img [ref=e49]
                      - textbox "john@example.com" [ref=e52]
                  - generic [ref=e53]:
                    - generic [ref=e54]: Phone Number *
                    - generic [ref=e55]:
                      - img [ref=e56]
                      - textbox "(555) 123-4567" [ref=e58]
                - paragraph [ref=e60]: "* Required fields"
            - generic [ref=e61]:
              - generic [ref=e62] [cursor=pointer]:
                - checkbox "Enroll into promotional emails from Boithok Khana Kitchen -" [checked] [ref=e63]
                - generic [ref=e64]: Enroll into promotional emails from Boithok Khana Kitchen -
              - generic [ref=e65] [cursor=pointer]:
                - checkbox "Get promotional texts from Boithok Khana Kitchen -" [checked] [ref=e66]
                - generic [ref=e67]: Get promotional texts from Boithok Khana Kitchen -
              - paragraph [ref=e68]:
                - text: By signing up, you agree to receive email marketing communications from Boithok Khana Kitchen - and our technology partner
                - link "RestauNax" [ref=e69] [cursor=pointer]:
                  - /url: https://www.restaunax.com
                - text: and consent to our
                - link "Terms and policies" [ref=e70] [cursor=pointer]:
                  - /url: /terms
                - text: . You may receive email or SMS notifications from us for order updates and account access and can opt out any time.
          - generic [ref=e71]:
            - generic [ref=e72]:
              - img [ref=e73]
              - heading "Gift Card" [level=4] [ref=e77]
            - generic [ref=e79]:
              - generic [ref=e80]:
                - generic [ref=e81]: Gift Card Code
                - textbox "Enter your gift card number" [ref=e82]
              - button "Apply" [disabled] [ref=e83]
          - generic [ref=e84]:
            - generic [ref=e85]:
              - img [ref=e86]
              - heading "Service Type" [level=3] [ref=e91]
            - generic [ref=e93]:
              - img [ref=e94]
              - generic [ref=e96]:
                - paragraph [ref=e97]: Delivery Coverage
                - paragraph [ref=e98]: Enter your address and we'll check whether we can deliver to you.
            - generic [ref=e99]:
              - button "Pickup 15-20 minutes Free" [ref=e100] [cursor=pointer]:
                - generic [ref=e101]:
                  - img [ref=e102]
                  - generic [ref=e106]:
                    - heading "Pickup" [level=4] [ref=e107]
                    - paragraph [ref=e108]: 15-20 minutes
                    - generic [ref=e109]:
                      - img [ref=e110]
                      - generic [ref=e112]: Free
              - button "Delivery 25-35 min $0.00" [ref=e113] [cursor=pointer]:
                - generic [ref=e114]:
                  - img [ref=e115]
                  - generic [ref=e120]:
                    - heading "Delivery" [level=4] [ref=e121]
                    - generic [ref=e122]:
                      - img [ref=e123]
                      - paragraph [ref=e126]: 25-35 min
                    - generic [ref=e127]:
                      - img [ref=e128]
                      - generic [ref=e130]: $0.00
            - generic [ref=e131]:
              - generic [ref=e132]:
                - img [ref=e133]
                - heading "Pickup Location" [level=4] [ref=e137]
              - paragraph [ref=e138]:
                - strong [ref=e139]: Boithok Khana Kitchen -
              - paragraph [ref=e140]: 1102 Liberty Avenue, Brooklyn, New York 11208
              - paragraph [ref=e141]: Your order will be ready for pickup in 15-20 minutes after confirmation.
          - generic [ref=e142]:
            - generic [ref=e143]:
              - img [ref=e144]
              - generic [ref=e147]:
                - heading "When do you want your order?" [level=3] [ref=e148]
                - paragraph [ref=e149]: Choose to receive your order as soon as possible or schedule for a specific time.
            - generic [ref=e150]:
              - generic [ref=e151] [cursor=pointer]:
                - radio "As soon as possible Selected Your order will be prepared immediately" [checked] [ref=e152]
                - generic [ref=e153]:
                  - generic [ref=e154]:
                    - generic [ref=e155]: As soon as possible
                    - generic [ref=e156]: Selected
                  - paragraph [ref=e157]: Your order will be prepared immediately
              - generic [ref=e158] [cursor=pointer]:
                - radio "Schedule for later Choose a specific date and time" [ref=e159]
                - generic [ref=e160]:
                  - generic [ref=e162]: Schedule for later
                  - paragraph [ref=e163]: Choose a specific date and time
          - generic [ref=e164]:
            - generic [ref=e165]:
              - img [ref=e166]
              - heading "Add a Tip" [level=3] [ref=e168]
              - generic [ref=e169]: (Optional)
            - paragraph [ref=e170]: Support our team with a tip. 100% goes to the staff.
            - generic [ref=e171]:
              - button "15% $1.95" [ref=e172] [cursor=pointer]:
                - generic [ref=e173]: 15%
                - generic [ref=e174]: $1.95
              - button "18% $2.34" [ref=e175] [cursor=pointer]:
                - generic [ref=e176]: 18%
                - generic [ref=e177]: $2.34
              - button "20% $2.60" [ref=e178] [cursor=pointer]:
                - generic [ref=e179]: 20%
                - generic [ref=e180]: $2.60
              - button "25% $3.25" [ref=e181] [cursor=pointer]:
                - generic [ref=e182]: 25%
                - generic [ref=e183]: $3.25
            - generic [ref=e184]:
              - generic [ref=e185]: Custom Amount
              - generic [ref=e186]:
                - img [ref=e187]
                - textbox "0.00" [ref=e189]
            - generic [ref=e190]:
              - generic [ref=e191]: "Total Tip:"
              - generic [ref=e192]: $1.95
          - generic [ref=e193]:
            - generic [ref=e194]:
              - img [ref=e195]
              - heading "Special Instructions" [level=3] [ref=e197]
              - generic [ref=e198]: (Optional)
            - textbox "Any special requests or instructions for your order..." [ref=e199]
            - generic [ref=e200]:
              - paragraph [ref=e201]: Let us know about allergies, preferences, or special requests
              - generic [ref=e202]: 0/500
          - generic [ref=e203]:
            - generic [ref=e204]:
              - generic [ref=e205]:
                - heading "Ready to Order?" [level=3] [ref=e206]
                - paragraph [ref=e207]: Review your order and proceed to payment
              - button "Proceed to Payment" [disabled] [ref=e208]
            - generic [ref=e209]: Please fill in all required fields with valid information
        - generic [ref=e211]:
          - generic [ref=e212]:
            - img [ref=e213]
            - heading "Order Summary" [level=3] [ref=e216]
          - generic [ref=e219]:
            - heading "1x Automation Burger" [level=4] [ref=e221]
            - generic [ref=e222]:
              - generic [ref=e223]: $12.99
              - button "Remove item" [ref=e224] [cursor=pointer]:
                - img [ref=e225]
          - generic [ref=e230]:
            - generic [ref=e231]: Have a coupon code?
            - generic [ref=e232]:
              - generic [ref=e233]:
                - generic:
                  - img
                - textbox "Enter code" [ref=e234]
              - button "Apply" [disabled] [ref=e235]:
                - generic [ref=e236]: Apply
          - generic [ref=e237]:
            - generic [ref=e238]:
              - generic [ref=e239]: Subtotal
              - generic [ref=e240]: $12.99
            - generic [ref=e241]:
              - generic [ref=e242]: Tax
              - generic [ref=e243]: $1.14
            - generic [ref=e244]:
              - generic [ref=e245]: Tip
              - generic [ref=e246]: $1.95
            - generic [ref=e247]:
              - generic [ref=e248]:
                - img [ref=e249]
                - text: Total
              - generic [ref=e252]: $16.08
  - contentinfo [ref=e253]:
    - generic [ref=e254]:
      - generic [ref=e255]:
        - generic [ref=e256]: Powered by
        - link "RestauNax RestauNax" [ref=e257] [cursor=pointer]:
          - /url: https://www.restaunax.com
          - img "RestauNax" [ref=e258]
          - generic [ref=e259]: RestauNax
      - generic [ref=e260]: "|"
      - generic [ref=e261]:
        - link "Terms" [ref=e262] [cursor=pointer]:
          - /url: https://www.restaunax.com/website-terms
        - generic [ref=e263]: "|"
        - link "Privacy" [ref=e264] [cursor=pointer]:
          - /url: https://www.restaunax.com/privacy-policy
  - alert [ref=e265]
```

# Test source

```ts
  159 |   const fillStripeCard = async (
  160 |     cardNumber: string = STRIPE_CARDS.VISA_SUCCESS,
  161 |     expiry: string = STRIPE_DEFAULTS.EXPIRY_MM_YY,
  162 |     cvc = STRIPE_DEFAULTS.CVC
  163 |   ) => {
  164 |     await fillStripePaymentElement(page, cardNumber, expiry, cvc);
  165 |   };
  166 | 
  167 |   const completeOrder = () =>
  168 |     page.getByRole("button", { name: "Complete Order" }).click();
  169 | 
  170 |   // On a Stripe decline, PaymentSection renders a "Payment Error" card with
  171 |   // the decline message underneath — the checkout form stays visible so the
  172 |   // customer can retry with a different card.
  173 |   const assertPaymentError = () =>
  174 |     expect(page.getByRole("heading", { name: "Payment Error" })).toBeVisible({
  175 |       timeout: 20_000,
  176 |     });
  177 | 
  178 |   // ── Coupon (CouponSection inside OrderSummary; guest-accessible, visible in
  179 |   // both checkout steps). The input has no name/id/testid — placeholder only.
  180 |   //
  181 |   // Scoped to the box via its "Have a coupon code?" label: the checkout page
  182 |   // also renders a Gift Card box (RewardSection) with its own "Apply" button
  183 |   // right below the customer-info form, so an unscoped getByRole("button",
  184 |   // {name:"Apply"}) strict-mode-violates once both boxes are visible (both
  185 |   // render unconditionally on the same step). .last() picks the innermost
  186 |   // matching div (CouponSection's own root), not an outer page wrapper that
  187 |   // would also contain the gift-card box. The label only exists pre-apply,
  188 |   // which is exactly when these locators are needed.
  189 |   const couponBox = () =>
  190 |     page
  191 |       .locator("div")
  192 |       .filter({ has: page.getByText("Have a coupon code?", { exact: true }) })
  193 |       .last();
  194 |   const couponCodeInput = () => couponBox().getByPlaceholder("Enter code");
  195 |   const applyCouponButton = () =>
  196 |     couponBox().getByRole("button", { name: "Apply", exact: true });
  197 | 
  198 |   const applyCoupon = async (code: string) => {
  199 |     await couponCodeInput().waitFor({ state: "visible", timeout: 15_000 });
  200 |     await couponCodeInput().fill(code);
  201 |     await applyCouponButton().click();
  202 |   };
  203 | 
  204 |   // Success swaps the input for a green applied-coupon block ("Saving $X.XX")
  205 |   // and OrderSummary shows a "Coupon (CODE)" discount line. Codes uppercase in
  206 |   // the UI, so match case-insensitively on the code.
  207 |   const assertCouponApplied = async (code: string) => {
  208 |     await expect(page.getByText(/Saving \$\d/)).toBeVisible({
  209 |       timeout: 15_000,
  210 |     });
  211 |     await expect(
  212 |       page.getByText(new RegExp(`Coupon\\s*\\(${code}\\)`, "i"))
  213 |     ).toBeVisible({ timeout: 10_000 });
  214 |   };
  215 | 
  216 |   // Invalid code → red error box; the input stays (no applied block). The
  217 |   // backend's rejection copy was humanized 2026-07-19 (RestauNax #506 wave):
  218 |   // a nonexistent code now says "We couldn't find that code. Double-check and
  219 |   // try again." and a FREE_DELIVERY code on pickup says "That coupon only
  220 |   // applies to delivery orders." — the old "Coupon Not Found" phrasing is
  221 |   // kept in the regex for resilience. Pass `pattern` to assert a SPECIFIC
  222 |   // rejection reason (e.g. the delivery-only message) instead of any.
  223 |   const assertCouponRejected = async (pattern?: RegExp) => {
  224 |     await expect(
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
> 259 |     await giftCardCodeInput().waitFor({ state: "visible", timeout: 15_000 });
      |                               ^ TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
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
  325 |     expect(processingFeeLabel()).toBeVisible({ timeout: 20_000 });
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
```