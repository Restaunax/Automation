# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/20-supply-shop.spec.ts >> Owner — Print Shop (supply shop) >> TC-446: the physical gift card is offered to every restaurant — gift cards on or not — and the admin catalog agrees
- Location: tests/dashboard/owner/20-supply-shop.spec.ts:230:7

# Error details

```
Error: fromUnitPrice is set

expect(received).not.toBeNaN()

Received: NaN
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - banner [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - img [ref=e8] [cursor=pointer]
        - button "Affiliate Partner" [ref=e70] [cursor=pointer]
      - generic [ref=e71]:
        - button "Book a Demo" [ref=e72] [cursor=pointer]
        - button "Account settings" [ref=e74] [cursor=pointer]:
          - generic [ref=e75]: A
        - button "Select Language" [ref=e77] [cursor=pointer]:
          - img [ref=e79]
          - text: EN
        - button [ref=e85] [cursor=pointer]:
          - img [ref=e86]
  - generic [ref=e91]:
    - generic [ref=e92]:
      - heading "Welcome back, Auto" [level=1] [ref=e93]
      - paragraph [ref=e94]: What would you like to do today?
    - generic [ref=e95]:
      - button "My Restaurants View and manage your restaurant stores" [ref=e98] [cursor=pointer]:
        - generic [ref=e100]:
          - img [ref=e102]
          - generic [ref=e104]:
            - heading "My Restaurants" [level=2] [ref=e105]
            - paragraph [ref=e106]: View and manage your restaurant stores
      - button "Affiliate Program Join our affiliate partner program" [ref=e109] [cursor=pointer]:
        - generic [ref=e111]:
          - img [ref=e113]
          - generic [ref=e115]:
            - heading "Affiliate Program" [level=2] [ref=e116]
            - paragraph [ref=e117]: Join our affiliate partner program
    - generic [ref=e119]:
      - generic [ref=e120]:
        - heading "Need help getting started?" [level=6] [ref=e121]
        - paragraph [ref=e122]: Schedule a demo with our team to learn how to maximize your platform
      - button "Book a Demo" [ref=e123] [cursor=pointer]
```

# Test source

```ts
  158 |       throw new Error(
  159 |         "[supply-shop] could not mint the throwaway tenant restaurant"
  160 |       );
  161 |     }
  162 |     restaurantId = tenant.restaurantId;
  163 |     ownerToken = tenant.accessToken;
  164 |     ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
  165 |     ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;
  166 | 
  167 |     // Grants BEFORE first navigation — the tab gates client-side at mount.
  168 |     const grant = await setFeatureOverrideAdminRaw(
  169 |       adminToken,
  170 |       restaurantId,
  171 |       "SUPPLY_SHOP",
  172 |       true
  173 |     );
  174 |     if (!grant.ok)
  175 |       throw new Error(
  176 |         `[supply-shop] could not grant SUPPLY_SHOP: ${msg(grant.data)}`
  177 |       );
  178 |     // Gift cards OFF to start: TC-446 proves the product is offered anyway.
  179 |     const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
  180 |       isEnabled: false,
  181 |     });
  182 |     if (!cfg.ok)
  183 |       throw new Error(
  184 |         `[supply-shop] could not write gift card config: ${msg(cfg.data)}`
  185 |       );
  186 | 
  187 |     variantId = await resolveGiftCardVariantId(adminToken);
  188 | 
  189 |     session = await loginViaUi(browser, ownerEmail, ownerPassword);
  190 |     shop = createOwnerSupplyShopPage(session.page);
  191 |   });
  192 | 
  193 |   test.afterAll(async () => {
  194 |     if (!adminToken) return;
  195 |     // Leave nothing fulfillable behind: cancel is allowed from every state a
  196 |     // test can leave an order in here (IN_DESIGN, PLACED, AWAITING_PAYMENT).
  197 |     const token = await apiLogin(ownerEmail, ownerPassword)
  198 |       .then((l) => l.accessToken)
  199 |       .catch(() => ownerToken); // the stale token may still work; cleanup is best-effort
  200 |     for (const id of [orderA?.id, ...placedOnBehalf].filter(
  201 |       Boolean
  202 |     ) as string[]) {
  203 |       await cancelSupplyOrderOwnerRaw(token, restaurantId, id).catch(() => {
  204 |         /* already terminal or gone — nothing to cancel */
  205 |       });
  206 |     }
  207 |     await deleteFeatureOverrideAdminRaw(
  208 |       adminToken,
  209 |       restaurantId,
  210 |       "SUPPLY_SHOP"
  211 |     ).catch(() => {
  212 |       /* override may already be gone */
  213 |     });
  214 |     if (restaurantId && !process.env.OWNER2_EMAIL) {
  215 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
  216 |         /* archive is best-effort; globalTeardown sweeps the user */
  217 |       });
  218 |     }
  219 |     if (session)
  220 |       await session.context.close().catch(() => {
  221 |         /* context may already be closed */
  222 |       });
  223 |   });
  224 | 
  225 |   test.beforeEach(async () => {
  226 |     await allure.label("feature", "Supply shop");
  227 |     await allure.label("severity", "critical");
  228 |   });
  229 | 
  230 |   test("TC-446: the physical gift card is offered to every restaurant — gift cards on or not — and the admin catalog agrees", async () => {
  231 |     await allure.description(
  232 |       "Ordering a run of cards IS how an owner says they want to sell gift cards; the switch that makes them " +
  233 |         "loadable is flipped on our side when the run is fulfilled. So the product must be in the shop even " +
  234 |         "while this tenant's gift cards are OFF, with its picture, price and lead time."
  235 |     );
  236 | 
  237 |     await allure.step(
  238 |       "Gift cards OFF → the card is still in the shop and the owner API",
  239 |       async () => {
  240 |         const catalog = await getSupplyCatalogOwnerRaw(
  241 |           ownerToken,
  242 |           restaurantId
  243 |         );
  244 |         expect(catalog.status, JSON.stringify(catalog.data)).toBe(200);
  245 |         const product = catalog.data.data.find(
  246 |           (p) => p.slug === SUPPLY_GIFT_CARD_PRODUCT_SLUG
  247 |         );
  248 |         expect(
  249 |           product,
  250 |           `${SUPPLY_GIFT_CARD_PRODUCT_SLUG} in the owner catalog`
  251 |         ).toBeTruthy();
  252 | 
  253 |         // The card shows a per-piece RANGE until the order is placed
  254 |         // (SUPPLY_SHOP.md §7): low = the list "from" price, high = low widened
  255 |         // by the product's estimateSpreadPct, to the cent — the dashboard's
  256 |         // priceRange.ts rule. A 0% spread renders a single "from $X each".
  257 |         const from = product!.fromUnitPrice ?? NaN;
> 258 |         expect(from, "fromUnitPrice is set").not.toBeNaN();
      |                                                  ^ Error: fromUnitPrice is set
  259 |         const spread = product!.estimateSpreadPct ?? 0;
  260 |         const high = Math.round(from * (1 + spread / 100) * 100) / 100;
  261 |         const priceLabel =
  262 |           spread > 0
  263 |             ? `$${from.toFixed(2)}–$${high.toFixed(2)} each` // EN DASH
  264 |             : `from $${from.toFixed(2)} each`;
  265 | 
  266 |         await shop.goto(restaurantId);
  267 |         const card = shop.productCard(PRODUCT_NAME).first();
  268 |         await expect(card).toBeVisible();
  269 |         await expect(card).toContainText(priceLabel);
  270 |         await expect(card).toContainText(/~\d+ days/);
  271 |         await expect(card.locator("img")).toHaveAttribute("src", /.+/);
  272 |       }
  273 |     );
  274 | 
  275 |     await allure.step("The admin catalog lists it too", async () => {
  276 |       const admin = await getAdminSupplyCatalogRaw(adminToken);
  277 |       expect(admin.data.data.map((p) => p.slug)).toContain(
  278 |         SUPPLY_GIFT_CARD_PRODUCT_SLUG
  279 |       );
  280 |     });
  281 | 
  282 |     await allure.step(
  283 |       "Switch gift cards on for the rest of the file (presets the amount picker will use)",
  284 |       async () => {
  285 |         const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
  286 |           isEnabled: true,
  287 |           presetDenominations: [25, 50],
  288 |           allowCustomAmount: true,
  289 |           minCustomAmount: 5,
  290 |           maxCustomAmount: 500,
  291 |           canCombineWithCoupons: true,
  292 |         });
  293 |         expect(cfg.status, JSON.stringify(cfg.data)).toBe(200);
  294 |       }
  295 |     );
  296 |   });
  297 | 
  298 |   test("TC-447: the brief form quotes a RANGE and says so — the invoice option only when credit is extended", async () => {
  299 |     await allure.description(
  300 |       "100 cards: $1.95 + $12 shipping = $207.00, +25% spread = $258.75. The estimate card, the " +
  301 |         "'You won't be charged now' notice and the place button all carry the range (EN DASH). " +
  302 |         "'Add it to my next RestauNax invoice' renders only when the quote says credit is eligible — a " +
  303 |         "throwaway tenant has no subscription, so the test branches on the API's answer."
  304 |     );
  305 | 
  306 |     const quote = await quoteSupplyOwnerRaw(ownerToken, restaurantId, {
  307 |       variantId,
  308 |       quantity: 100,
  309 |     });
  310 |     expect(quote.status, JSON.stringify(quote.data)).toBe(200);
  311 |     expect(quote.data.data.estimate).toMatchObject({
  312 |       totalLow: 207,
  313 |       totalHigh: 258.75,
  314 |     });
  315 | 
  316 |     await shop.openProduct(PRODUCT_NAME);
  317 |     await shop.selectQuantity(/^100 — /);
  318 |     await shop.messageInput().fill(`Automation gift card run ${runId}`);
  319 | 
  320 |     await expect(session.page.getByText(ESTIMATE).first()).toBeVisible();
  321 |     await expect(shop.notChargedNowAlert()).toBeVisible();
  322 |     await expect(shop.paymentRadio("Charge the card on file")).toBeChecked();
  323 |     const invoiceRadio = shop.paymentRadio(
  324 |       "Add it to my next RestauNax invoice"
  325 |     );
  326 |     if (quote.data.data.credit.eligible) {
  327 |       await expect(invoiceRadio).toBeVisible();
  328 |     } else {
  329 |       await expect(invoiceRadio).toHaveCount(0);
  330 |     }
  331 |     await expect(shop.placeButton()).toHaveText(
  332 |       `Place order — est. ${ESTIMATE}`
  333 |     );
  334 |   });
  335 | 
  336 |   test(
  337 |     "TC-448: placing the order charges nothing — it lands in 'We're designing it' with the estimate, and the owner is told so by email",
  338 |     { tag: ["@email"] },
  339 |     async () => {
  340 |       await allure.description(
  341 |         "Every catalog product needs artwork, so commit lands in IN_DESIGN (not PLACED). The row shows the " +
  342 |           "range as an estimate, paymentTerm is IMMEDIATE, and the 'designStarted' email names the order."
  343 |       );
  344 |       test.setTimeout(150_000);
  345 | 
  346 |       await shop.placeOrder();
  347 |       orderA = await findOrder(
  348 |         (o) => o.status === "IN_DESIGN" && o.quantity === 100
  349 |       );
  350 |       await allure.parameter("orderNumber", orderA.orderNumber);
  351 |       expect(orderA.paymentTerm).toBe("IMMEDIATE");
  352 |       expect(orderA.estimatedTotalLow).toBe(207);
  353 |       expect(orderA.estimatedTotalHigh).toBe(258.75);
  354 |       expect(orderA.paidAt).toBeNull();
  355 | 
  356 |       await shop.openOrders();
  357 |       await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
  358 |         "We're designing it"
```