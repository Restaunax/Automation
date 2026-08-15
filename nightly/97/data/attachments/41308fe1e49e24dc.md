# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/02-checkout.spec.ts >> Customer — Checkout >> TC-186: tip presets and custom tip flow into the server-quoted total
- Location: tests/customer/02-checkout.spec.ts:137:7

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   NaN

Call Log:
- Timeout 20000ms exceeded while waiting on the predicate
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
                - textbox "XXXX-XXXX-XXXX-XXXX" [ref=e82]
              - button "Apply" [disabled] [ref=e83]
          - generic [ref=e84]:
            - generic [ref=e85]:
              - img [ref=e86]
              - heading "Service Type" [level=3] [ref=e91]
            - generic [ref=e93]:
              - img [ref=e94]
              - generic [ref=e96]:
                - paragraph [ref=e97]: Delivery Coverage
                - paragraph [ref=e98]: We deliver within a 10-mile radius of our restaurant location.
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
              - button "Calculating total…" [disabled] [ref=e208]
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
            - generic [ref=e242]: Tax
            - generic [ref=e245]:
              - generic [ref=e246]: Tip
              - generic [ref=e247]: $1.95
            - generic [ref=e249]:
              - img [ref=e250]
              - text: Total
  - contentinfo [ref=e255]:
    - generic [ref=e256]:
      - generic [ref=e257]:
        - generic [ref=e258]: Powered by
        - link "RestauNax RestauNax" [ref=e259] [cursor=pointer]:
          - /url: https://www.restaunax.com
          - img "RestauNax" [ref=e260]
          - generic [ref=e261]: RestauNax
      - generic [ref=e262]: "|"
      - generic [ref=e263]:
        - link "Terms" [ref=e264] [cursor=pointer]:
          - /url: https://www.restaunax.com/website-terms
        - generic [ref=e265]: "|"
        - link "Privacy" [ref=e266] [cursor=pointer]:
          - /url: https://www.restaunax.com/privacy-policy
  - alert [ref=e267]
```

# Test source

```ts
  62  |       );
  63  |       await allure.parameter("restaurantId", restaurantId);
  64  |       await allure.parameter("Item", menuItemName);
  65  |     });
  66  | 
  67  |     await allure.step("Verify checkout form is visible", async () => {
  68  |       await checkoutPage.assertFormVisible();
  69  |       await allure.parameter("URL", page.url());
  70  |     });
  71  |   });
  72  | 
  73  |   test("TC-25: customer can fill checkout form and proceed to payment step", async ({
  74  |     page,
  75  |   }) => {
  76  |     await allure.description(
  77  |       "Customer fills First Name, Last Name, Email, Phone, selects Pickup, and clicks Proceed to Payment. Stripe payment section appears."
  78  |     );
  79  | 
  80  |     const restaurantId = readRestaurantId();
  81  |     const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
  82  |     const checkoutPage = createCustomerCheckoutPage(page);
  83  | 
  84  |     await allure.step("Seed cart and navigate to checkout", async () => {
  85  |       await checkoutPage.seedCart(
  86  |         restaurantId,
  87  |         menuItemId,
  88  |         menuItemName,
  89  |         menuItemPrice
  90  |       );
  91  |     });
  92  | 
  93  |     await allure.step("Fill customer info", async () => {
  94  |       await checkoutPage.fillCustomerInfo(
  95  |         "Jane",
  96  |         "Tester",
  97  |         "jane@restaunax-test.com",
  98  |         "5559876543"
  99  |       );
  100 |       await allure.parameter("Name", "Jane Tester");
  101 |       await allure.parameter("Email", "jane@restaunax-test.com");
  102 |     });
  103 | 
  104 |     await allure.step("Select Pickup service type", async () => {
  105 |       await checkoutPage.selectPickup();
  106 |     });
  107 | 
  108 |     await allure.step("Click Proceed to Payment", async () => {
  109 |       await checkoutPage.clickProceedToPayment();
  110 |     });
  111 | 
  112 |     await allure.step("Verify Stripe payment section is visible", async () => {
  113 |       await checkoutPage.assertPaymentSectionVisible();
  114 |     });
  115 |   });
  116 | 
  117 |   test("TC-185: /checkout with an empty cart shows the empty-cart message", async ({
  118 |     page,
  119 |   }) => {
  120 |     await allure.description(
  121 |       "A customer landing on /checkout without anything in the cart gets the 'Your Cart is Empty' " +
  122 |         "screen instead of the checkout form."
  123 |     );
  124 | 
  125 |     const restaurantId = readRestaurantId();
  126 |     const checkoutPage = createCustomerCheckoutPage(page);
  127 | 
  128 |     await allure.step("Open checkout with no cart seeded", async () => {
  129 |       await checkoutPage.gotoCheckoutEmpty(restaurantId);
  130 |     });
  131 | 
  132 |     await allure.step("Verify the empty-cart message renders", async () => {
  133 |       await checkoutPage.assertEmptyCart();
  134 |     });
  135 |   });
  136 | 
  137 |   test("TC-186: tip presets and custom tip flow into the server-quoted total", async ({
  138 |     page,
  139 |   }) => {
  140 |     await allure.description(
  141 |       "Tip is client-selected but the charged total is the server quote (amountToCharge): raising " +
  142 |         "the tip preset raises the quoted Total, zeroing it via the custom input lowers it. Proves " +
  143 |         "the tip → /quote round-trip, with no assumptions about tax math."
  144 |     );
  145 | 
  146 |     const restaurantId = readRestaurantId();
  147 |     const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
  148 |     const checkoutPage = createCustomerCheckoutPage(page);
  149 | 
  150 |     await checkoutPage.seedCart(
  151 |       restaurantId,
  152 |       menuItemId,
  153 |       menuItemName,
  154 |       menuItemPrice
  155 |     );
  156 | 
  157 |     // Default tip is 15% — wait for the first quote to land and record it.
  158 |     let baseTotal = 0;
  159 |     await allure.step("Read the default-tip (15%) quoted total", async () => {
  160 |       await expect
  161 |         .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
> 162 |         .toBeGreaterThan(0);
      |          ^ Error: expect(received).toBeGreaterThan(expected)
  163 |       baseTotal = await checkoutPage.readOrderTotal();
  164 |       await allure.parameter("Total @15%", `$${baseTotal.toFixed(2)}`);
  165 |     });
  166 | 
  167 |     await allure.step("Select the 25% preset — total rises", async () => {
  168 |       await checkoutPage.selectTipPreset(25);
  169 |       await checkoutPage.assertTipTotal((menuItemPrice * 0.25).toFixed(2));
  170 |       await expect
  171 |         .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
  172 |         .toBeGreaterThan(baseTotal);
  173 |     });
  174 | 
  175 |     await allure.step(
  176 |       "Zero the tip via the custom input — total drops",
  177 |       async () => {
  178 |         await checkoutPage.fillCustomTip("0");
  179 |         await checkoutPage.assertTipTotal("0.00");
  180 |         await expect
  181 |           .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
  182 |           .toBeLessThan(baseTotal);
  183 |       }
  184 |     );
  185 |   });
  186 | });
  187 | 
  188 | // ── Coupon auto-revalidation on cart change — CouponSection re-POSTs
  189 | // /api/coupons/validate (500ms debounce) whenever the cart changes and
  190 | // removes the coupon if the server now rejects it. Driven here with a
  191 | // minOrderAmount coupon: two cart lines clear the minimum, removing one
  192 | // drops below it.
  193 | test.describe("Customer — Checkout coupon revalidation", () => {
  194 |   test.skip(
  195 |     !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
  196 |     "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  197 |   );
  198 | 
  199 |   test.beforeEach(async () => {
  200 |     await allure.label("feature", "Customer Ordering");
  201 |     await allure.label("severity", "critical");
  202 |   });
  203 | 
  204 |   test("TC-187: a coupon is auto-removed when the cart drops below its minimum order amount", async ({
  205 |     page,
  206 |   }) => {
  207 |     await allure.description(
  208 |       "A minOrderAmount coupon applies while two cart lines clear the minimum; removing one line " +
  209 |         "triggers CouponSection's debounced revalidation, the backend 400s ('Order must be at " +
  210 |         "least $X'), and the coupon is auto-removed with an explanatory error."
  211 |     );
  212 | 
  213 |     const restaurantId = readRestaurantId();
  214 |     const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
  215 |     const checkoutPage = createCustomerCheckoutPage(page);
  216 | 
  217 |     // Minimum sits between one line (below) and two lines (above).
  218 |     const minOrder = Math.round(menuItemPrice * 1.5 * 100) / 100;
  219 |     const couponCode = generateCouponCode();
  220 | 
  221 |     await allure.step(
  222 |       `Seed an AUTO coupon with minOrderAmount $${minOrder}`,
  223 |       async () => {
  224 |         const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
  225 |         const res = await createCouponRaw(accessToken, restaurantId, {
  226 |           code: couponCode,
  227 |           type: "PERCENTAGE",
  228 |           value: 10,
  229 |           minOrderAmount: minOrder,
  230 |           startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  231 |           endDate: new Date(
  232 |             Date.now() + 30 * 24 * 60 * 60 * 1000
  233 |           ).toISOString(),
  234 |           status: "ACTIVE",
  235 |         });
  236 |         expect(res.ok, `coupon seed failed: ${JSON.stringify(res.data)}`).toBe(
  237 |           true
  238 |         );
  239 |         await allure.parameter("Coupon", couponCode);
  240 |         await allure.parameter("minOrderAmount", `$${minOrder}`);
  241 |       }
  242 |     );
  243 | 
  244 |     await allure.step("Seed a two-line cart (above the minimum)", async () => {
  245 |       await checkoutPage.seedCartItems(restaurantId, [
  246 |         { menuItemId, name: menuItemName, price: menuItemPrice },
  247 |         { menuItemId, name: menuItemName, price: menuItemPrice },
  248 |       ]);
  249 |     });
  250 | 
  251 |     await allure.step("Apply the coupon — accepted", async () => {
  252 |       await checkoutPage.applyCoupon(couponCode);
  253 |       await checkoutPage.assertCouponApplied(couponCode);
  254 |     });
  255 | 
  256 |     await allure.step(
  257 |       "Remove one line — revalidation strips the coupon",
  258 |       async () => {
  259 |         await checkoutPage.removeFirstCartItem();
  260 |         // Assert the auto-removal itself (applied "Saving $" block gone, box
  261 |         // back to code-entry state) — NOT the explanatory error copy: the
  262 |         // backend's "Order must be at least $X" message renders only
```