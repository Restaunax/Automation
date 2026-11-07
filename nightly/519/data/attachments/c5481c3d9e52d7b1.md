# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/20-supply-shop.spec.ts >> Owner — Print Shop (supply shop) >> TC-446: the physical gift card is offered to every restaurant — gift cards on or not — and the admin catalog agrees
- Location: tests/dashboard/owner/20-supply-shop.spec.ts:230:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.MuiCardActionArea-root').filter({ has: getByRole('heading', { name: 'Physical gift card', exact: true }) }).first()
Expected substring: "from $1.10 each"
Received string:    "Physical gift cardA plastic gift card with your branding, ready to sell at the counter. Each card is printed with its own number and barcode; staff scan it and load any amount when a customer buys it — nothing is on the card until then. Works everywhere a digital gift card does.$1.10–$1.38 each~18 days"
Timeout: 10000ms

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for locator('.MuiCardActionArea-root').filter({ has: getByRole('heading', { name: 'Physical gift card', exact: true }) }).first()
    24 × locator resolved to <button tabindex="0" type="button" class="MuiButtonBase-root MuiCardActionArea-root css-iez90s">…</button>
       - unexpected value "Physical gift cardA plastic gift card with your branding, ready to sell at the counter. Each card is printed with its own number and barcode; staff scan it and load any amount when a customer buys it — nothing is on the card until then. Works everywhere a digital gift card does.$1.10–$1.38 each~18 days"

```

```yaml
- button "Physical gift card A plastic gift card with your branding, ready to sell at the counter. Each card is printed with its own number and barcode; staff scan it and load any amount when a customer buys it — nothing is on the card until then. Works everywhere a digital gift card does. $1.10–$1.38 each ~18 days":
  - heading "Physical gift card" [level=6]
  - paragraph: A plastic gift card with your branding, ready to sell at the counter. Each card is printed with its own number and barcode; staff scan it and load any amount when a customer buys it — nothing is on the card until then. Works everywhere a digital gift card does.
  - heading "$1.10–$1.38 each" [level=6]
  - text: ~18 days
```

# Test source

```ts
  143 |   };
  144 | 
  145 |   const findOrder = async (predicate: (o: SupplyOrder) => boolean) => {
  146 |     const res = await listSupplyOrdersOwnerRaw(await ownerApi(), restaurantId);
  147 |     expect(res.status, JSON.stringify(res.data)).toBe(200);
  148 |     const found = res.data.data.find(predicate);
  149 |     if (!found) throw new Error(`[supply-shop] order not found in owner list`);
  150 |     return found;
  151 |   };
  152 | 
  153 |   test.beforeAll(async ({ browser }) => {
  154 |     if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  155 |     adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  156 |     const tenant = await createSecondOwner(adminToken, runId);
  157 |     if (!tenant.restaurantId) {
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
  240 |         await shop.goto(restaurantId);
  241 |         const card = shop.productCard(PRODUCT_NAME).first();
  242 |         await expect(card).toBeVisible();
> 243 |         await expect(card).toContainText("from $1.10 each");
      |                            ^ Error: expect(locator).toContainText(expected) failed
  244 |         await expect(card).toContainText(/~\d+ days/);
  245 |         await expect(card.locator("img")).toHaveAttribute("src", /.+/);
  246 |         const catalog = await getSupplyCatalogOwnerRaw(
  247 |           ownerToken,
  248 |           restaurantId
  249 |         );
  250 |         expect(catalog.status, JSON.stringify(catalog.data)).toBe(200);
  251 |         expect(catalog.data.data.map((p) => p.slug)).toContain(
  252 |           SUPPLY_GIFT_CARD_PRODUCT_SLUG
  253 |         );
  254 |       }
  255 |     );
  256 | 
  257 |     await allure.step("The admin catalog lists it too", async () => {
  258 |       const admin = await getAdminSupplyCatalogRaw(adminToken);
  259 |       expect(admin.data.data.map((p) => p.slug)).toContain(
  260 |         SUPPLY_GIFT_CARD_PRODUCT_SLUG
  261 |       );
  262 |     });
  263 | 
  264 |     await allure.step(
  265 |       "Switch gift cards on for the rest of the file (presets the amount picker will use)",
  266 |       async () => {
  267 |         const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
  268 |           isEnabled: true,
  269 |           presetDenominations: [25, 50],
  270 |           allowCustomAmount: true,
  271 |           minCustomAmount: 5,
  272 |           maxCustomAmount: 500,
  273 |           canCombineWithCoupons: true,
  274 |         });
  275 |         expect(cfg.status, JSON.stringify(cfg.data)).toBe(200);
  276 |       }
  277 |     );
  278 |   });
  279 | 
  280 |   test("TC-447: the brief form quotes a RANGE and says so — the invoice option only when credit is extended", async () => {
  281 |     await allure.description(
  282 |       "100 cards: $1.95 + $12 shipping = $207.00, +25% spread = $258.75. The estimate card, the " +
  283 |         "'You won't be charged now' notice and the place button all carry the range (EN DASH). " +
  284 |         "'Add it to my next RestauNax invoice' renders only when the quote says credit is eligible — a " +
  285 |         "throwaway tenant has no subscription, so the test branches on the API's answer."
  286 |     );
  287 | 
  288 |     const quote = await quoteSupplyOwnerRaw(ownerToken, restaurantId, {
  289 |       variantId,
  290 |       quantity: 100,
  291 |     });
  292 |     expect(quote.status, JSON.stringify(quote.data)).toBe(200);
  293 |     expect(quote.data.data.estimate).toMatchObject({
  294 |       totalLow: 207,
  295 |       totalHigh: 258.75,
  296 |     });
  297 | 
  298 |     await shop.openProduct(PRODUCT_NAME);
  299 |     await shop.selectQuantity(/^100 — /);
  300 |     await shop.messageInput().fill(`Automation gift card run ${runId}`);
  301 | 
  302 |     await expect(session.page.getByText(ESTIMATE).first()).toBeVisible();
  303 |     await expect(shop.notChargedNowAlert()).toBeVisible();
  304 |     await expect(shop.paymentRadio("Charge the card on file")).toBeChecked();
  305 |     const invoiceRadio = shop.paymentRadio(
  306 |       "Add it to my next RestauNax invoice"
  307 |     );
  308 |     if (quote.data.data.credit.eligible) {
  309 |       await expect(invoiceRadio).toBeVisible();
  310 |     } else {
  311 |       await expect(invoiceRadio).toHaveCount(0);
  312 |     }
  313 |     await expect(shop.placeButton()).toHaveText(
  314 |       `Place order — est. ${ESTIMATE}`
  315 |     );
  316 |   });
  317 | 
  318 |   test(
  319 |     "TC-448: placing the order charges nothing — it lands in 'We're designing it' with the estimate, and the owner is told so by email",
  320 |     { tag: ["@email"] },
  321 |     async () => {
  322 |       await allure.description(
  323 |         "Every catalog product needs artwork, so commit lands in IN_DESIGN (not PLACED). The row shows the " +
  324 |           "range as an estimate, paymentTerm is IMMEDIATE, and the 'designStarted' email names the order."
  325 |       );
  326 |       test.setTimeout(150_000);
  327 | 
  328 |       await shop.placeOrder();
  329 |       orderA = await findOrder(
  330 |         (o) => o.status === "IN_DESIGN" && o.quantity === 100
  331 |       );
  332 |       await allure.parameter("orderNumber", orderA.orderNumber);
  333 |       expect(orderA.paymentTerm).toBe("IMMEDIATE");
  334 |       expect(orderA.estimatedTotalLow).toBe(207);
  335 |       expect(orderA.estimatedTotalHigh).toBe(258.75);
  336 |       expect(orderA.paidAt).toBeNull();
  337 | 
  338 |       await shop.openOrders();
  339 |       await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
  340 |         "We're designing it"
  341 |       );
  342 |       await expect(shop.orderRow(orderA.orderNumber)).toContainText(
  343 |         `${ESTIMATE} est.`
```