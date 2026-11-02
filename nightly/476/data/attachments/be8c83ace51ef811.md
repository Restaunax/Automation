# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer-lima/14-promotions.spec.ts >> Lima — Promotions >> TC-L66: the order code entered on the cart shows at checkout as the promotion's title and savings; the Total is the page's latest /quote amountToCharge
- Location: tests/customer-lima/14-promotions.spec.ts:318:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByText('AUTO Lima 15% off $30+ 3cc7ca2e', { exact: true }).locator('..')
Expected substring: "-$4.50"
Received string:    "AUTO Lima 15% off $30+ 3cc7ca2e"
Timeout: 20000ms

Call log:
  - Expect "toContainText" with timeout 20000ms
  - waiting for getByText('AUTO Lima 15% off $30+ 3cc7ca2e', { exact: true }).locator('..')
    44 × locator resolved to <div class="MuiBox-root css-171onha">…</div>
       - unexpected value "AUTO Lima 15% off $30+ 3cc7ca2e"

```

```yaml
- paragraph: AUTO Lima 15% off $30+ 3cc7ca2e
```

# Test source

```ts
  247 |       );
  248 |       const dealPrice = server.deals[0]?.dealPrice;
  249 |       expect(dealPrice, JSON.stringify(server.raw)).toBeDefined();
  250 | 
  251 |       await allure.step("each slot lists both options", async () => {
  252 |         await deals.gotoBuilder(restaurantSlug, bogo.dealId);
  253 |         await expect(deals.builderHeading(bogo.name)).toBeVisible({
  254 |           timeout: 20_000,
  255 |         });
  256 |         await expect(deals.choiceSlots()).toHaveCount(2);
  257 |         // Each card's price label (in its accessible name): the cheaper gyro
  258 |         // is "Included", the other costs the deal-price difference — with the
  259 |         // other step at the cheaper gyro, the 2nd-at-$1.99 rule makes that
  260 |         // exactly the item-price difference.
  261 |         const [cheap, dear] =
  262 |           gyroA.price <= gyroB.price ? [gyroA, gyroB] : [gyroB, gyroA];
  263 |         const priceLabel = (item: typeof gyroA) =>
  264 |           item === cheap
  265 |             ? "Included"
  266 |             : `+$${(dear.price - cheap.price).toFixed(2)}`;
  267 |         for (const slot of [0, 1]) {
  268 |           for (const item of [gyroA, gyroB]) {
  269 |             const card = deals.choiceCard(slot, item.name);
  270 |             await expect(card).toBeVisible();
  271 |             await expect(card).toHaveAttribute("aria-checked", "false");
  272 |             await expect(card).toHaveAccessibleName(
  273 |               `${item.name}, ${priceLabel(item)}`
  274 |             );
  275 |           }
  276 |         }
  277 |         await expect(deals.stepStatus(0)).toHaveText("Required");
  278 |         await deals.assertProgress(0, 2);
  279 |       });
  280 | 
  281 |       await allure.step("pick one option per slot", async () => {
  282 |         await deals.pickChoice(0, gyroA.name);
  283 |         await deals.assertProgress(1, 2);
  284 |         await expect(deals.choiceCard(0, gyroA.name)).toHaveAttribute(
  285 |           "aria-checked",
  286 |           "true"
  287 |         );
  288 |         await expect(deals.stepStatus(0)).toHaveText("✓ Done");
  289 |         await deals.pickChoice(1, gyroB.name);
  290 |         await deals.assertDealComplete();
  291 |         await expect(deals.progressDealPrice()).toHaveText(money(dealPrice!));
  292 |       });
  293 | 
  294 |       await allure.step("checkout quotes the deal at that price", async () => {
  295 |         await deals.addDealToCart();
  296 |         await deals.viewCartButton().click();
  297 |         await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/cart`), {
  298 |           timeout: 15_000,
  299 |         });
  300 |         await expect(page.getByText(bogo.name).first()).toBeVisible({
  301 |           timeout: 15_000,
  302 |         });
  303 |         const [quoteRes] = await Promise.all([
  304 |           page.waitForResponse(quoteWithDeal(bogo.dealId), {
  305 |             timeout: 30_000,
  306 |           }),
  307 |           checkout.goToCheckout(),
  308 |         ]);
  309 |         const quote = await readQuote(quoteRes);
  310 |         expect(
  311 |           quote.body.quote?.deals?.find((d) => d.dealId === bogo.dealId)
  312 |             ?.dealPrice
  313 |         ).toBe(dealPrice);
  314 |       });
  315 |     });
  316 |   });
  317 | 
  318 |   test("TC-L66: the order code entered on the cart shows at checkout as the promotion's title and savings; the Total is the page's latest /quote amountToCharge", async ({
  319 |     page,
  320 |   }) => {
  321 |     const quotes = trackQuotes(page);
  322 |     const { checkout } = await reachCartWith(page, [
  323 |       set.items.platter,
  324 |       set.items.platter,
  325 |     ]);
  326 |     expect(await applyCodeOnCart(page, set.orderCode.code)).toBe(200);
  327 |     // Applied on the cart, priced at checkout (the cart has no quote).
  328 |     await expect(checkout.appliedCodeChip(set.orderCode.code)).toBeVisible({
  329 |       timeout: 15_000,
  330 |     });
  331 |     await expect(page.getByText("Savings shown at checkout")).toBeVisible();
  332 | 
  333 |     const [codeQuoteRes] = await Promise.all([
  334 |       page.waitForResponse(quoteWithCoupon(set.orderCode.id), {
  335 |         timeout: 30_000,
  336 |       }),
  337 |       checkout.goToCheckout(),
  338 |     ]);
  339 |     const codeQuote = (await readQuote(codeQuoteRes)).body.quote!;
  340 |     // Acceptance set: 15% of $40 = $6, capped at $4.50.
  341 |     expect(codeQuote.appliedPromotion).toMatchObject({
  342 |       couponId: set.orderCode.id,
  343 |       title: set.orderCode.name,
  344 |       savings: 4.5,
  345 |     });
  346 | 
> 347 |     await expect(checkout.promotionLine(set.orderCode.name)).toContainText(
      |                                                              ^ Error: expect(locator).toContainText(expected) failed
  348 |       "-$4.50",
  349 |       { timeout: 20_000 }
  350 |     );
  351 |     await expect(checkout.codeRow(set.orderCode.code)).toContainText(
  352 |       "Saving $4.50"
  353 |     );
  354 |     await expectShownMatchesLatestQuote(checkout.readTotal, quotes);
  355 |     const latest = await quotes.latest();
  356 |     expect(latest.request.couponId, "the latest quote is for the code").toBe(
  357 |       set.orderCode.id
  358 |     );
  359 |   });
  360 | 
  361 |   test("TC-L67: a bundle code opens its deal builder on Lima — from the cart's code box and from a ?promo= link", async ({
  362 |     page,
  363 |   }) => {
  364 |     await withStorefrontBogo(dealCtx(), async (bogo) => {
  365 |       const lima = createLimaStorefrontPage(page);
  366 |       const deals = createLimaDealPage(page);
  367 |       const builderUrl = new RegExp(
  368 |         `/${restaurantSlug}/deal/${bogo.dealId}\\?code=${escapeRegExp(bogo.code)}`
  369 |       );
  370 | 
  371 |       await allure.step("cart code box", async () => {
  372 |         await reachCartWith(page, [set.items.platter]);
  373 |         expect(await applyCodeOnCart(page, bogo.code)).toBe(200);
  374 |         await expect(page).toHaveURL(builderUrl, { timeout: 20_000 });
  375 |         await expect(deals.builderHeading(bogo.name)).toBeVisible({
  376 |           timeout: 20_000,
  377 |         });
  378 |       });
  379 | 
  380 |       await allure.step("?promo= link", async () => {
  381 |         await lima.gotoMenu(restaurantSlug, `?promo=${bogo.code}`);
  382 |         await expect(page).toHaveURL(builderUrl, { timeout: 20_000 });
  383 |         await expect(deals.builderHeading(bogo.name)).toBeVisible({
  384 |           timeout: 20_000,
  385 |         });
  386 |       });
  387 |     });
  388 |   });
  389 | 
  390 |   test("TC-L68: Keep shopping after adding a deal lands on the Lima menu with '<deal> added to your cart' — once — and the deal is in the cart", async ({
  391 |     page,
  392 |   }) => {
  393 |     await withStorefrontBogo(dealCtx(), async (bogo) => {
  394 |       const lima = createLimaStorefrontPage(page);
  395 |       const deals = createLimaDealPage(page);
  396 |       const expected = `${bogo.name} added to your cart`;
  397 | 
  398 |       await allure.step("complete the deal → Add → Keep shopping", async () => {
  399 |         await deals.gotoBuilder(restaurantSlug, bogo.dealId);
  400 |         await expect(deals.builderHeading(bogo.name)).toBeVisible({
  401 |           timeout: 20_000,
  402 |         });
  403 |         // Only an added deal offers it.
  404 |         await expect(deals.keepShoppingButton()).toHaveCount(0);
  405 |         await deals.pickChoice(0, set.items.gyroA.name);
  406 |         await deals.pickChoice(1, set.items.gyroB.name);
  407 |         await deals.assertDealComplete();
  408 |         // Complete is not added: Keep shopping appears only after the Add.
  409 |         await expect(deals.keepShoppingButton()).toHaveCount(0);
  410 |         await deals.addDealToCart();
  411 |         await deals.keepShoppingButton().click();
  412 |         await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/menu`), {
  413 |           timeout: 15_000,
  414 |         });
  415 |         // The Snackbar auto-hides after 3 s: assert it inside that window.
  416 |         await expect(lima.dealAddedConfirmation()).toHaveText(expected, {
  417 |           timeout: 2_500,
  418 |         });
  419 |       });
  420 | 
  421 |       await allure.step("a refresh does not show it again", async () => {
  422 |         await page.reload({ waitUntil: "domcontentloaded" });
  423 |         await expect(lima.itemCard(set.items.platter.name)).toBeVisible({
  424 |           timeout: 30_000,
  425 |         });
  426 |         await expect(lima.dealAddedConfirmation()).toHaveCount(0);
  427 |       });
  428 | 
  429 |       await allure.step("the cart holds the deal", async () => {
  430 |         await lima.cartButton().click();
  431 |         await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/cart`), {
  432 |           timeout: 15_000,
  433 |         });
  434 |         await expect(page.getByText(bogo.name).first()).toBeVisible({
  435 |           timeout: 15_000,
  436 |         });
  437 |       });
  438 |     });
  439 |   });
  440 | 
  441 |   test("TC-L69: a deal with upgrade picks shows Items, Upgrades (itemised, incl. the size choice) and Subtotal at Lima checkout — Items + Upgrades = Subtotal = the quote's", async ({
  442 |     page,
  443 |   }) => {
  444 |     await withStorefrontCombo(dealCtx(), async (combo) => {
  445 |       const lima = createLimaStorefrontPage(page);
  446 |       const deals = createLimaDealPage(page);
  447 |       const checkout = createLimaCheckoutPage(page);
```