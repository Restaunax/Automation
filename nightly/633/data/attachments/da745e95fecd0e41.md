# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-sales-tax-reports.spec.ts >> Sales tax and reports agree with the orders (API) >> TC-1255: refunding only the beer gives back alcohol-rate tax only; the books agree with the report per rate
- Location: tests/dashboard/owner/api-sales-tax-reports.spec.ts:419:7

# Error details

```
Error: {"success":false,"message":"Only completed payments can be refunded","errorCode":"ORDER_REFUND_FAILED","errorId":"667f9eda-de6c-4dda-a7f2-ca864d0e5c76"}

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 400
```

# Test source

```ts
  367 |       adminToken,
  368 |       restaurantId,
  369 |       "ACCOUNTING_SYNC",
  370 |       true
  371 |     );
  372 |     expect(g.ok, JSON.stringify(g.data)).toBe(true);
  373 |     const total = { sales: 0, tax: 0, perRate: new Map<string, number>() };
  374 |     for (const date of [from, to]) {
  375 |       const r = await accountingRaw(
  376 |         ownerToken,
  377 |         restaurantId,
  378 |         "GET",
  379 |         `/days/${date}?rebuild=1`
  380 |       );
  381 |       expect(r.status, JSON.stringify(r.data)).toBe(200);
  382 |       for (const line of list(r.data.data?.entry?.lines)) {
  383 |         if (line.side !== "CREDIT") continue;
  384 |         const key = String(line.key);
  385 |         const cents = Number(line.cents);
  386 |         if (key.startsWith("sales:")) total.sales += cents;
  387 |         if (key.startsWith("tax:")) {
  388 |           total.tax += cents;
  389 |           total.perRate.set(key, (total.perRate.get(key) ?? 0) + cents);
  390 |         }
  391 |       }
  392 |     }
  393 |     expect(total.perRate.get(`tax:${rates.State.id}`)).toBe(120);
  394 |     expect(total.perRate.get(`tax:${rates.Alcohol.id}`)).toBe(72);
  395 |     expect({ sales: total.sales, tax: total.tax }).toEqual({
  396 |       sales: 3000,
  397 |       tax: 192,
  398 |     });
  399 |   });
  400 | 
  401 |   test("TC-1254: the delivery fee asks the owner while the state's rule is only a suggestion", async () => {
  402 |     const r = await taxRaw<{ data?: Rec }>(
  403 |       ownerToken,
  404 |       restaurantId,
  405 |       "GET",
  406 |       "/delivery-fee"
  407 |     );
  408 |     expect(r.status, JSON.stringify(r.data)).toBe(200);
  409 |     const d = r.data.data as Rec;
  410 |     // No CONFIRMED rule on QA: today's behaviour, and the owner is asked.
  411 |     expect(d.rules).toBe("LEGACY");
  412 |     expect(d.needsOwnerAnswer).toBe(true);
  413 |     expect(["DRAFT", "MISSING"]).toContain(
  414 |       String((d.stateRule as Rec | null)?.status)
  415 |     );
  416 |     expect(String(d.explanation)).toMatch(/confirmed/);
  417 |   });
  418 | 
  419 |   test("TC-1255: refunding only the beer gives back alcohol-rate tax only; the books agree with the report per rate", async () => {
  420 |     test.setTimeout(120_000);
  421 |     await ensureBusinessHours(ownerToken, restaurantId);
  422 |     const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
  423 |     expect(onboard.status, JSON.stringify(onboard.data)).toBe(200);
  424 |     const pk = String(
  425 |       (await stripeConfigRaw()).data.data?.publishableKey ?? ""
  426 |     );
  427 |     expect(pk, "QA publishes a Stripe TEST key").toMatch(/^pk_test_/);
  428 |     // Burger $10.00 at State 6% = $0.60; Beer $8.00 at Alcohol 10% (TC-622)
  429 |     // = $0.80; a $2.00 tip.
  430 |     const web = await placePaidOnlineOrder(pk, restaurantId, {
  431 |       orderType: "PICKUP",
  432 |       subtotal: 18,
  433 |       tax: 1.4,
  434 |       tip: 2,
  435 |       deliveryFee: 0,
  436 |       total: 21.4,
  437 |       customerEmail: `auto-refund-${runId}@restaunax-test.com`,
  438 |       customerPhone: "5555550199",
  439 |       firstName: "Rita",
  440 |       lastName: "Refund",
  441 |       orderItems: [
  442 |         {
  443 |           menuItemId: items.Burger.id,
  444 |           menuItemName: items.Burger.name,
  445 |           quantity: 1,
  446 |           price: 10,
  447 |         },
  448 |         {
  449 |           menuItemId: items.Beer.id,
  450 |           menuItemName: items.Beer.name,
  451 |           quantity: 1,
  452 |           price: 8,
  453 |         },
  454 |       ],
  455 |     });
  456 |     const full = await getOrderFullRaw(ownerToken, web.id);
  457 |     const beer = list((full.data as Rec).orderItems).find(
  458 |       (l) => l.menuItemId === items.Beer.id
  459 |     );
  460 |     expect(beer, "the order has the beer line").toBeTruthy();
  461 | 
  462 |     const refund = await refundOrderRaw(ownerToken, web.id, {
  463 |       amount: 8.8,
  464 |       reason: "Wrong beer",
  465 |       items: [{ orderItemId: String(beer!.id), quantity: 1 }],
  466 |     });
> 467 |     expect(refund.status, JSON.stringify(refund.data)).toBe(200);
      |                                                        ^ Error: {"success":false,"message":"Only completed payments can be refunded","errorCode":"ORDER_REFUND_FAILED","errorId":"667f9eda-de6c-4dda-a7f2-ca864d0e5c76"}
  468 | 
  469 |     const r = await taxRaw<{ data?: Rec }>(
  470 |       ownerToken,
  471 |       restaurantId,
  472 |       "GET",
  473 |       `/report?startDate=${from}&endDate=${to}`
  474 |     );
  475 |     expect(r.status, JSON.stringify(r.data)).toBe(200);
  476 |     const report = r.data.data as Rec;
  477 |     const byRate = list(report.byRate);
  478 |     const state = byRate.filter((l) => l.taxRateId === rates.State.id);
  479 |     const alcohol10 = byRate.find(
  480 |       (l) => l.taxRateId === rates.Alcohol.id && l.percent === 10
  481 |     );
  482 |     // Only alcohol-rate tax came back (was: a share of every rate, tip
  483 |     // included).
  484 |     expect(alcohol10).toMatchObject({ tax: 0.8, refundedTax: 0.8, netTax: 0 });
  485 |     expect(state.reduce((s, l) => s + Number(l.refundedTax), 0)).toBe(0);
  486 |     expect((report.totals as Rec).refundedTax).toBe(0.8);
  487 | 
  488 |     // The books post the same tax per rate, net of the refund.
  489 |     const books = new Map<string, number>();
  490 |     for (const date of [from, to]) {
  491 |       const day = await accountingRaw(
  492 |         ownerToken,
  493 |         restaurantId,
  494 |         "GET",
  495 |         `/days/${date}?rebuild=1`
  496 |       );
  497 |       expect(day.status, JSON.stringify(day.data)).toBe(200);
  498 |       for (const line of list(day.data.data?.entry?.lines)) {
  499 |         const key = String(line.key);
  500 |         if (!key.startsWith("tax:")) continue;
  501 |         const cents = (line.side === "CREDIT" ? 1 : -1) * Number(line.cents);
  502 |         books.set(key, (books.get(key) ?? 0) + cents);
  503 |       }
  504 |     }
  505 |     for (const rate of [rates.State, rates.Alcohol]) {
  506 |       const netCents = Math.round(
  507 |         byRate
  508 |           .filter((l) => l.taxRateId === rate.id)
  509 |           .reduce((s, l) => s + Number(l.netTax), 0) * 100
  510 |       );
  511 |       expect(books.get(`tax:${rate.id}`) ?? 0, String(rate.name)).toBe(
  512 |         netCents
  513 |       );
  514 |     }
  515 |   });
  516 | 
  517 |   test("TC-1256: POS tax refusal is per restaurant — off until ready and opted in; the admin kill switch is a platform setting", async () => {
  518 |     const get = await taxRaw<{ data?: Rec }>(
  519 |       ownerToken,
  520 |       restaurantId,
  521 |       "GET",
  522 |       "/pos-refusal"
  523 |     );
  524 |     expect(get.status, JSON.stringify(get.data)).toBe(200);
  525 |     expect(get.data.data).toMatchObject({ refusalOn: false, optedIn: false });
  526 |     expect(get.data.data?.blockers).toContain("NOT_OPTED_IN");
  527 | 
  528 |     const bad = await taxRaw(ownerToken, restaurantId, "PUT", "/pos-refusal", {
  529 |       optIn: "yes",
  530 |     });
  531 |     expect(bad.status).toBe(400);
  532 | 
  533 |     try {
  534 |       const on = await taxRaw<{ data?: Rec }>(
  535 |         ownerToken,
  536 |         restaurantId,
  537 |         "PUT",
  538 |         "/pos-refusal",
  539 |         { optIn: true }
  540 |       );
  541 |       expect(on.status, JSON.stringify(on.data)).toBe(200);
  542 |       // Opted in, but no register has sold here: still accepted and recorded.
  543 |       expect(on.data.data).toMatchObject({ optedIn: true, refusalOn: false });
  544 |       expect(on.data.data?.blockers).not.toContain("NOT_OPTED_IN");
  545 |       expect(on.data.data?.blockers).toContain("NO_ACTIVE_DEVICES");
  546 |     } finally {
  547 |       await taxRaw(ownerToken, restaurantId, "PUT", "/pos-refusal", {
  548 |         optIn: false,
  549 |       });
  550 |     }
  551 | 
  552 |     // The global kill switch: admins only, and validated. Never flipped here
  553 |     // (it pauses refusal for every restaurant on QA).
  554 |     const admin = await apiRequestRaw<{ data?: Rec }>(
  555 |       "GET",
  556 |       "/api/admin/pos-tax-refusal",
  557 |       undefined,
  558 |       adminToken
  559 |     );
  560 |     expect(admin.status, JSON.stringify(admin.data)).toBe(200);
  561 |     expect(typeof admin.data.data?.killSwitch).toBe("boolean");
  562 |     const owner = await apiRequestRaw(
  563 |       "GET",
  564 |       "/api/admin/pos-tax-refusal",
  565 |       undefined,
  566 |       ownerToken
  567 |     );
```