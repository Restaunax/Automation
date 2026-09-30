# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pos/09-dual-pricing.spec.ts >> POS — Dual pricing v2 (per-item cash tier) >> TC-492: editing a cash-priced order re-derives the discount at the restaurant's markup
- Location: tests/pos/09-dual-pricing.spec.ts:581:7

# Error details

```
Error: Dual pricing is not active for this restaurant, so a cash discount cannot be applied. Refresh the device settings and try again.

expect(received).toBe(expected) // Object.is equality

Expected: 201
Received: 400
```

# Test source

```ts
  494 |       cashTierBody({
  495 |         paymentMethod: undefined,
  496 |         payments: [
  497 |           { paymentMethod: "CASH", amount: 17, status: "SUCCEEDED" },
  498 |           { paymentMethod: "CASH", amount: 17.13, status: "SUCCEEDED" },
  499 |         ],
  500 |       })
  501 |     );
  502 |     expect(res.status, msg(res.data)).toBe(400);
  503 |     expect(msg(res.data)).toMatch(/split payments/i);
  504 |   });
  505 | 
  506 |   test("TC-491: an untouched check settled whole in cash is re-priced at the cash tier and collects exactly the cash total; a partly paid check is refused", async () => {
  507 |     const whole = await openCheck(`Cash ${runId}`);
  508 |     const leg = await settleTabCashRaw(tabletToken, staffSession, whole, {
  509 |       amount: CARD_TOTAL, // the device declares the card remaining
  510 |       cashTendered: 40,
  511 |       idempotencyKey: `whole-${runId}`,
  512 |       applyCashDiscount: true,
  513 |     });
  514 |     expect(leg.status, msg(leg.data)).toBe(200);
  515 |     expect(leg.data.cashTier).toEqual({
  516 |       cashDiscount: CASH_DISCOUNT,
  517 |       total: CASH_TOTAL,
  518 |     });
  519 |     expect(leg.data.cashChange).toBe(round2(40 - CASH_TOTAL));
  520 |     expect(leg.data.closed).toBe(true);
  521 |     const read = await getOrderFullRaw(token, whole);
  522 |     expect(read.data).toMatchObject({
  523 |       cashDiscount: CASH_DISCOUNT,
  524 |       tax: CASH_TAX,
  525 |       total: CASH_TOTAL,
  526 |     });
  527 | 
  528 |     const split = await openCheck(`Split ${runId}`);
  529 |     const first = await settleTabCashRaw(tabletToken, staffSession, split, {
  530 |       amount: 10,
  531 |       cashTendered: 10,
  532 |       idempotencyKey: `split-1-${runId}`,
  533 |     });
  534 |     expect(first.status, msg(first.data)).toBe(200);
  535 |     const rest = await settleTabCashRaw(tabletToken, staffSession, split, {
  536 |       amount: round2(CARD_TOTAL - 10),
  537 |       cashTendered: 30,
  538 |       idempotencyKey: `split-2-${runId}`,
  539 |       applyCashDiscount: true,
  540 |     });
  541 |     expect(rest.status, msg(rest.data)).toBe(400);
  542 |     expect(msg(rest.data)).toMatch(/whole check/i);
  543 |   });
  544 | 
  545 |   test("TC-507: a whole check paid with EXACTLY the cash price is accepted; a cent short is refused and leaves the check at card prices", async () => {
  546 |     await allure.description(
  547 |       "Floor report 2026-09-16 (dev T3): the POS showed 'Amount due' at the cash price, the " +
  548 |         "cashier tendered exactly that, and settle-cash refused it — it measured the cash " +
  549 |         "against the CARD amount the device declares, before re-pricing. TC-491 tenders more " +
  550 |         "than the card total, which is why it never caught this."
  551 |     );
  552 |     const short = await openCheck(`Cash short ${runId}`);
  553 |     const refused = await settleTabCashRaw(tabletToken, staffSession, short, {
  554 |       amount: CARD_TOTAL,
  555 |       cashTendered: round2(CASH_TOTAL - 0.01),
  556 |       idempotencyKey: `short-${runId}`,
  557 |       applyCashDiscount: true,
  558 |     });
  559 |     expect(refused.status, msg(refused.data)).toBe(400);
  560 |     expect(msg(refused.data)).toMatch(/less than/i);
  561 |     const untouched = await getOrderFullRaw(token, short);
  562 |     expect(untouched.data).toMatchObject({ total: CARD_TOTAL });
  563 | 
  564 |     const exact = await openCheck(`Cash exact ${runId}`);
  565 |     const leg = await settleTabCashRaw(tabletToken, staffSession, exact, {
  566 |       amount: CARD_TOTAL, // the device declares the card remaining
  567 |       cashTendered: CASH_TOTAL,
  568 |       idempotencyKey: `exact-${runId}`,
  569 |       applyCashDiscount: true,
  570 |     });
  571 |     expect(leg.status, msg(leg.data)).toBe(200);
  572 |     expect(leg.data.cashChange).toBe(0);
  573 |     expect(leg.data.closed).toBe(true);
  574 |     const read = await getOrderFullRaw(token, exact);
  575 |     expect(read.data).toMatchObject({
  576 |       cashDiscount: CASH_DISCOUNT,
  577 |       total: CASH_TOTAL,
  578 |     });
  579 |   });
  580 | 
  581 |   test("TC-492: editing a cash-priced order re-derives the discount at the restaurant's markup", async () => {
  582 |     await allure.description(
  583 |       "A register order paid whole in cash is created at the cash tier (qty 2). " +
  584 |         "PATCH /modify with qty 3 — the device sends only the new line set, never a " +
  585 |         "discount claim — and the server re-derives the pre-tax discount from the " +
  586 |         "authoritative menu at the restaurant's markup: 3 × (0.45 + 0.11) = 1.68, tax " +
  587 |         "on the new cash base 47.85 → 3.35, total 51.20."
  588 |     );
  589 |     const created = await createTabletOrderRaw(
  590 |       tabletToken,
  591 |       staffSession,
  592 |       cashTierBody()
  593 |     );
> 594 |     expect(created.status, msg(created.data)).toBe(201);
      |                                               ^ Error: Dual pricing is not active for this restaurant, so a cash discount cannot be applied. Refresh the device settings and try again.
  595 |     const orderId = created.data.id!;
  596 |     openedOrderIds.push(orderId);
  597 | 
  598 |     const modified = await modifyTabletOrderRaw(
  599 |       tabletToken,
  600 |       staffSession,
  601 |       orderId,
  602 |       {
  603 |         orderItems: [
  604 |           {
  605 |             menuItemId: item.id,
  606 |             menuItemName: item.name,
  607 |             quantity: QTY + 1,
  608 |             price: ITEM_CARD,
  609 |             selectedModifiers: [
  610 |               {
  611 |                 modifierId,
  612 |                 modifierName,
  613 |                 modifierPrice: MOD_CARD,
  614 |                 quantity: 1,
  615 |               },
  616 |             ],
  617 |           },
  618 |         ],
  619 |       }
  620 |     );
  621 |     expect(modified.status, msg(modified.data)).toBe(200);
  622 | 
  623 |     const read = await getOrderFullRaw(token, orderId);
  624 |     expect(read.data).toMatchObject({
  625 |       subtotal: round2((ITEM_CARD + MOD_CARD) * (QTY + 1)), // 49.53 — card
  626 |       cashDiscount: round2(
  627 |         (ITEM_CARD + MOD_CARD - ITEM_CASH - MOD_CASH) * (QTY + 1)
  628 |       ), // 1.68
  629 |       tax: 3.35, // 7% of the cash base 47.85
  630 |       total: 51.2,
  631 |     });
  632 |   });
  633 | 
  634 |   test("TC-497: compliance attestations are admin-stamped booleans; owners cannot assert them; raw timestamps are ignored", async () => {
  635 |     await allure.description(
  636 |       "Admin PUT {dualPricingMenuAttested:true} stamps dualPricingMenuAttestedAt; an owner " +
  637 |         "PUT {dualPricingSignageAttested:true} is stripped (stays null); a raw timestamp key " +
  638 |         "is ignored even from the admin; admin PUT {dualPricingMenuAttested:false} clears it."
  639 |     );
  640 |     const stamped = await updateRestaurantSettingsRaw(
  641 |       adminToken,
  642 |       restaurantId,
  643 |       {
  644 |         dualPricingMenuAttested: true,
  645 |       }
  646 |     );
  647 |     expect(stamped.status, msg(stamped.data)).toBe(200);
  648 |     let read = await getRestaurantSettingsRaw(token, restaurantId);
  649 |     expect(typeof read.data.dualPricingMenuAttestedAt).toBe("string");
  650 |     expect(read.data.dualPricingSignageAttestedAt ?? null).toBeNull();
  651 | 
  652 |     const ownerClaim = await updateRestaurantSettingsRaw(token, restaurantId, {
  653 |       dualPricingSignageAttested: true,
  654 |     });
  655 |     expect(ownerClaim.status, msg(ownerClaim.data)).toBe(200);
  656 |     read = await getRestaurantSettingsRaw(token, restaurantId);
  657 |     expect(read.data.dualPricingSignageAttestedAt ?? null).toBeNull();
  658 | 
  659 |     const rawStamp = await updateRestaurantSettingsRaw(
  660 |       adminToken,
  661 |       restaurantId,
  662 |       {
  663 |         dualPricingSignageAttestedAt: "2026-01-01T00:00:00.000Z",
  664 |       }
  665 |     );
  666 |     expect(rawStamp.status, msg(rawStamp.data)).toBe(200);
  667 |     read = await getRestaurantSettingsRaw(token, restaurantId);
  668 |     expect(read.data.dualPricingSignageAttestedAt ?? null).toBeNull();
  669 | 
  670 |     const cleared = await updateRestaurantSettingsRaw(
  671 |       adminToken,
  672 |       restaurantId,
  673 |       {
  674 |         dualPricingMenuAttested: false,
  675 |       }
  676 |     );
  677 |     expect(cleared.status, msg(cleared.data)).toBe(200);
  678 |     read = await getRestaurantSettingsRaw(token, restaurantId);
  679 |     expect(read.data.dualPricingMenuAttestedAt ?? null).toBeNull();
  680 |   });
  681 | 
  682 |   test("TC-493: the public restaurant details payload never exposes the pricing-program flags", async () => {
  683 |     const res = await getRestaurantDetailsPublicRaw(restaurantId);
  684 |     expect(res.status, msg(res.data)).toBe(200);
  685 |     const text = JSON.stringify(res.data);
  686 |     expect(text).not.toMatch(/dualPricing/);
  687 |     expect(text).not.toMatch(/passProcessingFeeToCustomer/);
  688 |   });
  689 | 
  690 |   // Last on purpose: it flips the owner toggle and the stored prices, and the
  691 |   // final state (converted, enabled) matches what the earlier cases expect.
  692 |   test("TC-498: leaving the programme is price-neutral for a menu confirmed at card prices, and is refused while dual pricing is on", async () => {
  693 |     await allure.description(
  694 |       "REVERT while enabled → 400 (turn it off first). Owner turns dual pricing off → REVERT " +
```