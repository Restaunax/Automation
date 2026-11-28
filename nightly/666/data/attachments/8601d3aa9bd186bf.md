# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer-lima/14-promotions.spec.ts >> Lima — Promotions >> TC-L70: paying on Lima with the order code records the code's promotion, the quoted savings and the Total shown before paying
- Location: tests/customer-lima/14-promotions.spec.ts:505:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 44.61
Received: 45.94
```

# Test source

```ts
  451 |       await deals.gotoBuilder(restaurantSlug, combo.dealId, combo.code);
  452 |       await expect(deals.builderHeading(combo.name)).toBeVisible({
  453 |         timeout: 20_000,
  454 |       });
  455 |       await deals.openIncompleteSlot(platter.name);
  456 |       await deals.clickAddToDeal();
  457 |       await deals.openIncompleteSlot(burger.name);
  458 |       await lima.modifierOption(`Large ${runId}`).check();
  459 |       await lima.modifierOption(`Bacon ${runId}`).check();
  460 |       await deals.clickAddToDeal();
  461 |       await deals.assertDealComplete();
  462 |       await deals.addDealToCart();
  463 |       await deals.viewCartButton().click();
  464 |       await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/cart`), {
  465 |         timeout: 15_000,
  466 |       });
  467 | 
  468 |       const [quoteRes] = await Promise.all([
  469 |         page.waitForResponse(quoteWithDeal(combo.dealId), {
  470 |           timeout: 30_000,
  471 |         }),
  472 |         checkout.goToCheckout(),
  473 |       ]);
  474 |       const quote = (await readQuote(quoteRes)).body.quote!;
  475 |       const upcharge = quote.deals?.find(
  476 |         (d) => d.dealId === combo.dealId
  477 |       )?.upcharge;
  478 |       // Large replaces Regular ($15 − $12) + Bacon $1.50.
  479 |       expect(upcharge).toBe(P.burgerLarge - P.burger + P.bacon);
  480 | 
  481 |       await expect(checkout.summaryItemsRow()).toBeVisible({ timeout: 15_000 });
  482 |       const items = await checkout.readMoney(checkout.summaryItemsRow());
  483 |       const upgrades = await checkout.readMoney(checkout.summaryUpgradesRow());
  484 |       const subtotal = await checkout.readMoney(checkout.summarySubtotalRow());
  485 |       await allure.parameter(
  486 |         "items / upgrades / subtotal",
  487 |         `${items} / ${upgrades} / ${subtotal}`
  488 |       );
  489 |       expect(Math.round((items + upgrades) * 100)).toBe(
  490 |         Math.round(subtotal * 100)
  491 |       );
  492 |       expect(upgrades).toBe(upcharge);
  493 |       expect(subtotal).toBe(quote.subtotal);
  494 |       await expect(checkout.summaryUpgradesRow()).toContainText(
  495 |         `+${money(upcharge!)}`
  496 |       );
  497 |       const details = checkout.summaryUpgradeDetails();
  498 |       await expect(details).toContainText(
  499 |         `Large ${runId} +${money(P.burgerLarge - P.burger)}`
  500 |       );
  501 |       await expect(details).toContainText(`Bacon ${runId} +${money(P.bacon)}`);
  502 |     });
  503 |   });
  504 | 
  505 |   test("TC-L70: paying on Lima with the order code records the code's promotion, the quoted savings and the Total shown before paying", async ({
  506 |     page,
  507 |   }) => {
  508 |     const quotes = trackQuotes(page);
  509 |     const { checkout } = await reachCartWith(page, [
  510 |       set.items.platter,
  511 |       set.items.platter,
  512 |     ]);
  513 |     expect(await applyCodeOnCart(page, set.orderCode.code)).toBe(200);
  514 |     await checkout.goToCheckout();
  515 |     await checkout.assertPickupSelected();
  516 |     await checkout.fillCustomerInfo({
  517 |       firstName: "Promo",
  518 |       lastName: "Lima",
  519 |       email: generateUserEmail("limapromo"),
  520 |       phone: generateSeedPhone(),
  521 |     });
  522 |     await expect(checkout.promotionLine(set.orderCode.name)).toContainText(
  523 |       /[−-]\$4\.50/,
  524 |       { timeout: 20_000 }
  525 |     );
  526 |     await checkout.proceedToPayment();
  527 | 
  528 |     const payTotal = await expectShownMatchesLatestQuote(
  529 |       checkout.readTotal,
  530 |       quotes
  531 |     );
  532 |     const latest = await quotes.latest();
  533 |     const quoted = latest.body.quote!;
  534 |     expect(latest.request.couponId).toBe(set.orderCode.id);
  535 |     expect(quoted.amountToCharge).toBe(payTotal);
  536 |     await allure.parameter("pay total", money(payTotal));
  537 | 
  538 |     await fillStripePaymentElement(page, STRIPE_CARDS.VISA_SUCCESS);
  539 |     await checkout.placeOrder();
  540 |     await checkout.assertOrderConfirmed();
  541 |     const orderId =
  542 |       page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
  543 |     expect(orderId, `order id from ${page.url()}`).toBeTruthy();
  544 |     expect(page.url()).toContain(`/${restaurantSlug}/order-confirmation/`);
  545 |     await allure.parameter("orderId", orderId);
  546 | 
  547 |     const order = await getOrderByIdRaw(token, orderId);
  548 |     expect(order.status, JSON.stringify(order.data)).toBe(200);
  549 |     expect(order.data.couponId).toBe(set.orderCode.id);
  550 |     expect(order.data.discountAmount).toBe(quoted.appliedPromotion!.savings);
> 551 |     expect(order.data.total).toBe(payTotal);
      |                              ^ Error: expect(received).toBe(expected) // Object.is equality
  552 |   });
  553 | 
  554 |   test("TC-890: an incomplete deal never reaches the Lima cart — Add with a step unpicked points at the first missing step and adds nothing, leaving mid-build leaves no partial deal, and the complete deal is added once", async ({
  555 |     page,
  556 |   }) => {
  557 |     await allure.description(
  558 |       "Guided deal choices (spec §5): the deal page adds ONE complete deal with one Add. Opening the deal adds nothing; " +
  559 |         "an Add with nothing picked, and again with only some steps picked, shows 'Pick one to continue.' (role=alert) in the " +
  560 |         "first unfinished step (status 'Required', the step root focused) and the cart stays empty; walking away mid-build " +
  561 |         "leaves no partial deal in the cart; after picking every step one Add puts exactly one complete deal in the cart."
  562 |     );
  563 |     await withStorefrontBogo(dealCtx(), async (bogo) => {
  564 |       const lima = createLimaStorefrontPage(page);
  565 |       const deals = createLimaDealPage(page);
  566 |       const { gyroA, gyroB } = set.items;
  567 | 
  568 |       const assertCartEmpty = async () => {
  569 |         await page.goto(`${LIMA_ORDERING_URL}/${restaurantSlug}/cart`, {
  570 |           waitUntil: "domcontentloaded",
  571 |         });
  572 |         await expect(
  573 |           page.getByRole("heading", { name: "Your Cart is Empty" })
  574 |         ).toBeVisible({ timeout: 15_000 });
  575 |         await expect(lima.cartButton()).toHaveAccessibleName(/with 0 items/i);
  576 |         await expect(page.getByText(bogo.name)).toHaveCount(0);
  577 |         await expect(page.getByText("Add items to activate")).toHaveCount(0);
  578 |       };
  579 | 
  580 |       await allure.step(
  581 |         "Add with nothing picked: nothing is added",
  582 |         async () => {
  583 |           await deals.gotoBuilder(restaurantSlug, bogo.dealId);
  584 |           await expect(deals.builderHeading(bogo.name)).toBeVisible({
  585 |             timeout: 20_000,
  586 |           });
  587 |           await expect(deals.stepStatus(0)).toHaveText("Required");
  588 |           await deals.assertStepsDone(0, 2);
  589 |           await deals.addDealToCartButton().click();
  590 |           await expect(deals.stepError(0)).toHaveText("Pick one to continue.");
  591 |           await expect(deals.stepStatus(0)).toHaveText("Required");
  592 |           // Lima focuses the step's root.
  593 |           await expect(deals.choiceSlots().first()).toBeFocused();
  594 |           await expect(deals.keepShoppingButton()).toHaveCount(0);
  595 |         }
  596 |       );
  597 | 
  598 |       await allure.step("the cart is empty", assertCartEmpty);
  599 | 
  600 |       await allure.step(
  601 |         "Add with one step left: still nothing, the message moves to it",
  602 |         async () => {
  603 |           await deals.gotoBuilder(restaurantSlug, bogo.dealId);
  604 |           await expect(deals.builderHeading(bogo.name)).toBeVisible({
  605 |             timeout: 20_000,
  606 |           });
  607 |           await deals.pickChoice(0, gyroA.name);
  608 |           await deals.assertStepsDone(1, 2);
  609 |           await deals.addDealToCartButton().click();
  610 |           await expect(deals.stepError(1)).toHaveText("Pick one to continue.");
  611 |           await expect(deals.stepStatus(1)).toHaveText("Required");
  612 |           await expect(deals.stepStatus(0)).toHaveText("✓ Done");
  613 |           await expect(deals.choiceSlots().nth(1)).toBeFocused();
  614 |           await expect(deals.keepShoppingButton()).toHaveCount(0);
  615 |         }
  616 |       );
  617 | 
  618 |       await allure.step(
  619 |         "leaving the page mid-build leaves no partial deal in the cart",
  620 |         async () => {
  621 |           await lima.gotoMenu(restaurantSlug);
  622 |           await assertCartEmpty();
  623 |         }
  624 |       );
  625 | 
  626 |       await allure.step("complete it: one Add, one complete deal", async () => {
  627 |         await deals.gotoBuilder(restaurantSlug, bogo.dealId);
  628 |         await expect(deals.builderHeading(bogo.name)).toBeVisible({
  629 |           timeout: 20_000,
  630 |         });
  631 |         await deals.pickChoice(0, gyroA.name);
  632 |         await deals.pickChoice(1, gyroB.name);
  633 |         await deals.assertDealComplete();
  634 |         await deals.addDealToCart();
  635 |         await deals.viewCartButton().click();
  636 |         await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/cart`), {
  637 |           timeout: 15_000,
  638 |         });
  639 |         await expect(page.getByText(bogo.name).first()).toBeVisible({
  640 |           timeout: 15_000,
  641 |         });
  642 |         await expect(page.getByText("Add items to activate")).toHaveCount(0);
  643 |       });
  644 |     });
  645 |   });
  646 | });
  647 | 
```