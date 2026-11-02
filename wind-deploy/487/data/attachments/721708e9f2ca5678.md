# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/12-3ds-bank-check.spec.ts >> Customer — 3D Secure bank check (wind) @3ds >> TC-917: 3DS failed through a full-page redirect — back on checkout with the error, nothing charged
- Location: tests/customer/12-3ds-bank-check.spec.ts:376:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/unable to authenticate|failed authentication|payment was not completed/i).first()
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByText(/unable to authenticate|failed authentication|payment was not completed/i).first()

```

```yaml
- main:
  - button "Back"
  - heading "Checkout" [level=1]
  - paragraph: Boithok Khana Kitchen -
  - paragraph: Your bank didn't approve this payment, so nothing was charged. Please try again or use another card.
  - button "Dismiss"
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
  - textbox "Gift Card Code":
    - /placeholder: Enter your gift card number
  - button "Apply" [disabled]
  - heading "Service Type" [level=3]
  - paragraph: Delivery Coverage
  - paragraph: Enter your address and we'll check whether we can deliver to you.
  - button "Pickup 15-20 minutes Free":
    - heading "Pickup" [level=4]
    - paragraph: 15-20 minutes
    - text: Free
  - button "Delivery $0.00":
    - heading "Delivery" [level=4]
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
  164 |           });
  165 |           expect(new URL(page.url()).pathname).toBe("/checkout");
  166 |         }
  167 |       );
  168 |     }
  169 |     // Where Stripe would send the customer back — both modes send the same.
  170 |     expect(watch.returnUrl(), "return_url sent to Stripe").toBe(returnUrl);
  171 | 
  172 |     return { email, restaurantId, pi, watch, confirmCalls, navigations };
  173 |   };
  174 | 
  175 |   /** The paid outcome both modes must end in. */
  176 |   const assertPaidAndConfirmed = async (page: Page, a: Attempt) => {
  177 |     const confirmation = createCustomerOrderConfirmationPage(page);
  178 |     const checkout = createCustomerCheckoutPage(page);
  179 |     const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
  180 | 
  181 |     await allure.step("Order Confirmed for THIS order", async () => {
  182 |       await expect(page).toHaveURL(
  183 |         new RegExp(`/order-confirmation/${a.pi.orderId}$`),
  184 |         { timeout: 60_000 }
  185 |       );
  186 |       await confirmation.assertConfirmed();
  187 |       await confirmation.assertCustomerName("Auto");
  188 |       expect(a.confirmCalls(), "POST /api/stripe/confirm-payment calls").toBe(
  189 |         1
  190 |       );
  191 |     });
  192 | 
  193 |     await allure.step(
  194 |       "Backend: paid, not INITIALIZED, exactly one order",
  195 |       async () => {
  196 |         await expect
  197 |           .poll(
  198 |             async () =>
  199 |               (await ownerOrder(accessToken, a.pi.orderId)).paymentStatus,
  200 |             {
  201 |               timeout: 30_000,
  202 |             }
  203 |           )
  204 |           .toBe("COMPLETED");
  205 |         const order = await ownerOrder(accessToken, a.pi.orderId);
  206 |         await allure.attachment(
  207 |           "order",
  208 |           JSON.stringify(order, null, 2),
  209 |           "application/json"
  210 |         );
  211 |         expect(order.status).not.toBe("INITIALIZED");
  212 |         expect(await paymentIntentStatus(a.pi.clientSecret)).toBe("succeeded");
  213 |         const orders = await ownerOrdersFor(
  214 |           accessToken,
  215 |           a.restaurantId,
  216 |           a.email
  217 |         );
  218 |         expect(
  219 |           orders.map((o) => o.id),
  220 |           "orders for this customer"
  221 |         ).toEqual([a.pi.orderId]);
  222 | 
  223 |         // The confirmation's money lines are the order's own breakdown.
  224 |         await expect(
  225 |           page.locator('[data-testid^="order-breakdown-totals-"]').first()
  226 |         ).toBeVisible({ timeout: 20_000 });
  227 |         assertSameLines(
  228 |           apiBreakdownLines(order as Parameters<typeof apiBreakdownLines>[0]),
  229 |           await readWindConfirmationLines(page),
  230 |           "wind confirmation after 3DS"
  231 |         );
  232 |       }
  233 |     );
  234 | 
  235 |     await allure.step("The cart is empty afterwards", async () => {
  236 |       const items = await page.evaluate(() => {
  237 |         const raw = sessionStorage.getItem("cart");
  238 |         return raw
  239 |           ? ((JSON.parse(raw) as { items?: unknown[] }).items ?? []).length
  240 |           : 0;
  241 |       });
  242 |       expect(items, "cart items in sessionStorage").toBe(0);
  243 |       await checkout.gotoCheckoutEmpty(a.restaurantId);
  244 |       await checkout.assertEmptyCart();
  245 |     });
  246 |   };
  247 | 
  248 |   /** The unpaid outcome both modes must end in. */
  249 |   const assertNotPaid = async (page: Page, a: Attempt) => {
  250 |     const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
  251 |     const checkout = createCustomerCheckoutPage(page);
  252 |     const { menuItemName } = readSharedState();
  253 | 
  254 |     await allure.step(
  255 |       "Checkout says the payment didn't go through",
  256 |       async () => {
  257 |         await expect(page).toHaveURL(/\/checkout(\?|$)/, { timeout: 60_000 });
  258 |         await expect(
  259 |           page
  260 |             .getByText(
  261 |               /unable to authenticate|failed authentication|payment was not completed/i
  262 |             )
  263 |             .first()
> 264 |         ).toBeVisible({ timeout: 20_000 });
      |           ^ Error: expect(locator).toBeVisible() failed
  265 |         expect(page.url()).not.toContain("order-confirmation");
  266 |         expect(a.confirmCalls(), "no confirm-payment for a failed check").toBe(
  267 |           0
  268 |         );
  269 |         // The order is still in the cart to try again.
  270 |         // (Order Summary line "1x <item>"; a bare getByText also matches a
  271 |         // hidden copy of the name.)
  272 |         await expect(
  273 |           page.getByRole("heading", {
  274 |             name: new RegExp(`^\\d+x ${menuItemName}$`),
  275 |           })
  276 |         ).toBeVisible({ timeout: 10_000 });
  277 |         // …and can pay again: in the page the card step stays (Complete
  278 |         // Order); after the redirect checkout starts over (Proceed to Payment).
  279 |         await expect(
  280 |           page
  281 |             .getByRole("button", { name: "Complete Order" })
  282 |             .or(checkout.proceedToPaymentButton())
  283 |         ).toBeVisible({ timeout: 10_000 });
  284 |       }
  285 |     );
  286 | 
  287 |     await allure.step(
  288 |       "Backend: not paid, nothing charged, no order for the owner",
  289 |       async () => {
  290 |         const order = await ownerOrder(accessToken, a.pi.orderId);
  291 |         await allure.attachment(
  292 |           "order",
  293 |           JSON.stringify(order, null, 2),
  294 |           "application/json"
  295 |         );
  296 |         expect(order.status).toBe("INITIALIZED");
  297 |         expect(order.paymentStatus).not.toBe("COMPLETED");
  298 |         expect(await paymentIntentStatus(a.pi.clientSecret)).toBe(
  299 |           "requires_payment_method"
  300 |         );
  301 |         expect(
  302 |           await ownerOrdersFor(accessToken, a.restaurantId, a.email)
  303 |         ).toEqual([]);
  304 |       }
  305 |     );
  306 |   };
  307 | 
  308 |   test("TC-914: 3DS completed in the page — order confirmed, paid once, cart empty", async ({
  309 |     page,
  310 |   }) => {
  311 |     await allure.description(
  312 |       "Card 4000 0027 6000 3184 → Stripe's bank check opens in the checkout page → COMPLETE. " +
  313 |         "Lands on /order-confirmation/<the order> with Order Confirmed! and the backend's money lines; " +
  314 |         "one confirm-payment call; owner GET /api/order/:id is COMPLETED (not INITIALIZED); the " +
  315 |         "PaymentIntent succeeded; exactly one order for this customer; the cart is empty."
  316 |     );
  317 |     const attempt = await payWith3dsCard(page, "in-page");
  318 |     await answerStripe3ds(page, "COMPLETE");
  319 |     await assertPaidAndConfirmed(page, attempt);
  320 |   });
  321 | 
  322 |   test("TC-915: 3DS failed in the page — payment error, nothing charged", async ({
  323 |     page,
  324 |   }) => {
  325 |     await allure.description(
  326 |       "Same card, FAIL on the in-page bank check. Checkout stays, shows the payment error and " +
  327 |         "keeps the cart; no confirm-payment; the order stays INITIALIZED, the PaymentIntent is " +
  328 |         "requires_payment_method (nothing charged) and the owner sees no order."
  329 |     );
  330 |     const attempt = await payWith3dsCard(page, "in-page");
  331 |     await answerStripe3ds(page, "FAIL");
  332 |     await assertNotPaid(page, attempt);
  333 |   });
  334 | 
  335 |   test("TC-916: 3DS completed through a full-page redirect — /checkout/return finishes the order", async ({
  336 |     page,
  337 |   }) => {
  338 |     await allure.description(
  339 |       "The bank check as a real redirect: Stripe's hosted 3DS page → COMPLETE → Stripe sends the " +
  340 |         "browser to wind's /checkout/return with payment_intent and payment_intent_client_secret " +
  341 |         "(Stripe's hosted page adds source_type=card, not redirect_status). The return page strips them from the address bar, calls " +
  342 |         "POST /api/stripe/confirm-payment once, clears the cart and lands on " +
  343 |         "/order-confirmation/<the order>. Same backend checks as TC-914."
  344 |     );
  345 |     const attempt = await payWith3dsCard(page, "redirect");
  346 |     await answerStripe3ds(page, "COMPLETE");
  347 | 
  348 |     await allure.step(
  349 |       "Stripe returned to /checkout/return with its parameters",
  350 |       async () => {
  351 |         await expect(page).toHaveURL(/\/order-confirmation\//, {
  352 |           timeout: 60_000,
  353 |         });
  354 |         const landed = attempt.navigations.find((u) =>
  355 |           u.startsWith(`${returnUrl}?`)
  356 |         );
  357 |         expect(landed, attempt.navigations.join("\n")).toBeTruthy();
  358 |         const q = new URL(landed!).searchParams;
  359 |         expect(q.get("payment_intent")).toBe(attempt.pi.paymentIntentId);
  360 |         expect(q.get("payment_intent_client_secret")).toBe(
  361 |           attempt.pi.clientSecret
  362 |         );
  363 |         // No redirect_status assertion: Stripe's hosted 3DS page returns
  364 |         // payment_intent + payment_intent_client_secret (+ source_type=card)
```