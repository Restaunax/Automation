# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pos/12-combo-food-surfaces.spec.ts >> Combo food on every surface (@combo-food) >> TC-908: foodItemCount counts combo components — a combo-only order (2 × a 3-part combo) is 6, combo + 2 fries is 5 — on the owner list, owner detail, getOrderById and the customer's mobile history
- Location: tests/pos/12-combo-food-surfaces.spec.ts:444:7

# Error details

```
Error: order c9d7f0e4-73ea-433e-9456-60c9d5285d37 in the owner list

expect(received).toBeTruthy()

Received: undefined
```

# Test source

```ts
  363 |                   {
  364 |                     name: `Sauce ${runId}`,
  365 |                     pricingMode: "INCLUDED",
  366 |                     minSelections: 0,
  367 |                     maxSelections: null,
  368 |                     modifiers: [{ name: smokyName }],
  369 |                   },
  370 |                 ],
  371 |               },
  372 |             ],
  373 |           },
  374 |         ],
  375 |       }
  376 |     );
  377 |     const mods = (await getMenuItemApi(token, burger.id)).modifierGroups ?? [];
  378 |     const d = mods
  379 |       .flatMap((g) => g.modifiers)
  380 |       .find((m) => m.name === doubleName);
  381 |     const s = (d?.childModifierGroups ?? [])
  382 |       .flatMap((g) => g.modifiers)
  383 |       .find((m) => m.name === smokyName);
  384 |     if (!d || !s)
  385 |       throw new Error(
  386 |         `burger modifiers not read back: ${JSON.stringify(mods)}`
  387 |       );
  388 |     double = { id: d.id, name: d.name };
  389 |     smoky = { id: s.id, name: s.name };
  390 |     fries = await createMenuItemFull(token, groupId, `Fries ${runId}`, FRIES, {
  391 |       description: "combo food: side",
  392 |     });
  393 |     soda = await createMenuItemFull(token, groupId, `Soda ${runId}`, SODA, {
  394 |       description: "combo food: drink (Bar)",
  395 |     });
  396 |     const assign = await apiRequestRaw(
  397 |       "PATCH",
  398 |       `/restaurant/${restaurantId}/prep-stations/assign/item/${soda.id}`,
  399 |       { prepStationKey: barKey },
  400 |       token
  401 |     );
  402 |     expect(assign.status, JSON.stringify(assign.data)).toBeLessThan(300);
  403 | 
  404 |     deal = await createDealApi(
  405 |       token,
  406 |       restaurantId,
  407 |       `AUTO Combo Food ${runId}`,
  408 |       COMBO,
  409 |       [
  410 |         { id: burger.id, name: burger.name, price: BURGER },
  411 |         { id: fries.id, name: fries.name, price: FRIES },
  412 |         { id: soda.id, name: soda.name, price: SODA },
  413 |       ]
  414 |     );
  415 | 
  416 |     // The make-line screen: a device whose station is set per read below.
  417 |     kds = await createTabletDevice(
  418 |       adminToken,
  419 |       restaurantId,
  420 |       `Automation Combo Make Line ${runId}`
  421 |     );
  422 |     kdsToken = await tabletLogin(kds.name, kds.code);
  423 | 
  424 |     comboOnlyId = await paidOnlineOrder(COMBO_QTY_A, 0);
  425 |     mixedId = await paidOnlineOrder(1, FRIES_QTY_B);
  426 |   });
  427 | 
  428 |   test.afterAll(async () => {
  429 |     if (!token) return;
  430 |     const t = await freshOwnerToken().catch(() => token);
  431 |     if (kds) await deactivateTabletDevice(t, restaurantId, kds.id);
  432 |     // Admin DELETE archives the throwaway restaurant with its menu, deal,
  433 |     // stations and the two paid test-card orders.
  434 |     if (restaurantId)
  435 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  436 |   });
  437 | 
  438 |   test.beforeEach(async () => {
  439 |     await allure.label("feature", "Orders → Combo food lines");
  440 |     await allure.label("severity", "critical");
  441 |     token = await freshOwnerToken();
  442 |   });
  443 | 
  444 |   test(
  445 |     "TC-908: foodItemCount counts combo components — a combo-only order (2 × a 3-part combo) is 6, combo + 2 fries is 5 — on the owner list, owner detail, getOrderById and the customer's mobile history",
  446 |     { tag: ["@combo-food"] },
  447 |     async () => {
  448 |       const expected: Record<string, number> = {
  449 |         [comboOnlyId]: 3 * COMBO_QTY_A,
  450 |         [mixedId]: 3 + FRIES_QTY_B,
  451 |       };
  452 | 
  453 |       await allure.step("Owner orders list (Orders tab grid)", async () => {
  454 |         const res = await apiRequestRaw<{ orders: StoredOrder[] }>(
  455 |           "GET",
  456 |           `/api/order/statistics/management/${restaurantId}?page=1&limit=50`,
  457 |           undefined,
  458 |           token
  459 |         );
  460 |         expect(res.status, JSON.stringify(res.data)).toBe(200);
  461 |         for (const [id, count] of Object.entries(expected)) {
  462 |           const row = res.data.orders.find((o) => o.id === id);
> 463 |           expect(row, `order ${id} in the owner list`).toBeTruthy();
      |                                                        ^ Error: order c9d7f0e4-73ea-433e-9456-60c9d5285d37 in the owner list
  464 |           expect(row!.foodItemCount, `owner list foodItemCount for ${id}`).toBe(
  465 |             count
  466 |           );
  467 |         }
  468 |       });
  469 | 
  470 |       await allure.step("Owner detail + getOrderById", async () => {
  471 |         for (const [id, count] of Object.entries(expected)) {
  472 |           expect(
  473 |             (await ownerDetail(id)).foodItemCount,
  474 |             `owner detail ${id}`
  475 |           ).toBe(count);
  476 |           const byId = await apiRequestRaw<StoredOrder>(
  477 |             "GET",
  478 |             `/api/order/${id}`,
  479 |             undefined,
  480 |             token
  481 |           );
  482 |           expect(byId.status, JSON.stringify(byId.data)).toBe(200);
  483 |           expect(byId.data.foodItemCount, `GET /api/order/${id}`).toBe(count);
  484 |         }
  485 |         // The combo-only order really has no à-la-carte lines.
  486 |         expect((await ownerDetail(comboOnlyId)).orderItems ?? []).toHaveLength(
  487 |           0
  488 |         );
  489 |       });
  490 | 
  491 |       await allure.step("Customer mobile history (OTP sign-in)", async () => {
  492 |         const send = await apiRequestRaw("POST", "/login/mobile/send-otp", {
  493 |           phone,
  494 |           restaurantId,
  495 |         });
  496 |         expect(send.status, JSON.stringify(send.data)).toBe(200);
  497 |         const verify = await apiRequestRaw<{ token?: string }>(
  498 |           "POST",
  499 |           "/login/mobile/verify-otp",
  500 |           { phone, otp: QA_OTP, restaurantId }
  501 |         );
  502 |         expect(verify.status, JSON.stringify(verify.data)).toBe(200);
  503 |         const history = await apiRequestRaw<{ orders: StoredOrder[] }>(
  504 |           "GET",
  505 |           "/api/mobile/customer/orders",
  506 |           undefined,
  507 |           verify.data.token
  508 |         );
  509 |         expect(history.status, JSON.stringify(history.data)).toBe(200);
  510 |         for (const [id, count] of Object.entries(expected)) {
  511 |           const row = history.data.orders.find((o) => o.id === id);
  512 |           expect(row, `order ${id} in the customer's history`).toBeTruthy();
  513 |           expect(row!.foodItemCount, `history foodItemCount for ${id}`).toBe(
  514 |             count
  515 |           );
  516 |         }
  517 |       });
  518 |     }
  519 |   );
  520 | 
  521 |   test(
  522 |     "TC-909: the breakdown's deal children carry key deal:<orderDealId>:<orderDealItemId>, the burger's note, and modifiers with modifierId — the nested sauce's parentModifierId is its parent's modifierId",
  523 |     { tag: ["@combo-food"] },
  524 |     async () => {
  525 |       for (const id of [comboOnlyId, mixedId]) {
  526 |         const order = await ownerDetail(id);
  527 |         const stored = order.orderDeals?.[0];
  528 |         expect(stored, JSON.stringify(order.orderDeals)).toBeTruthy();
  529 |         const dealRow = (order.breakdown?.items ?? []).find(
  530 |           (i) => (i.children ?? []).length > 0
  531 |         );
  532 |         expect(dealRow, JSON.stringify(order.breakdown)).toBeTruthy();
  533 |         const children = dealRow!.children!;
  534 |         expect(children).toHaveLength(3);
  535 |         const where = `order ${id} children: ${JSON.stringify(children)}`;
  536 |         for (const c of children) {
  537 |           expect(c.key, where).toMatch(/^deal:[^:]+:[^:]+$/);
  538 |           const part = stored!.orderDealItems!.find(
  539 |             (p) => p.menuItemName === c.name
  540 |           );
  541 |           expect(part, where).toBeTruthy();
  542 |           expect(c.key, where).toBe(`deal:${stored!.id}:${part!.id}`);
  543 |           // Per-deal quantity; the deal row multiplies it.
  544 |           expect(c.quantity, where).toBe(1);
  545 |         }
  546 |         const b = children.find((c) => c.name === burger.name)!;
  547 |         expect(b.specialInstructions, where).toBe(note);
  548 |         const parent = b.modifiers.find((m) => m.name === double.name);
  549 |         const nested = b.modifiers.find((m) => m.name === smoky.name);
  550 |         expect(parent?.modifierId, where).toBe(double.id);
  551 |         expect(nested?.modifierId, where).toBe(smoky.id);
  552 |         expect(nested?.parentModifierId, where).toBe(parent!.modifierId);
  553 |         for (const c of children.filter((c) => c.name !== burger.name)) {
  554 |           expect(c.specialInstructions, where).toBeNull();
  555 |           expect(c.modifiers, where).toEqual([]);
  556 |         }
  557 |       }
  558 |     }
  559 |   );
  560 | 
  561 |   test(
  562 |     "TC-910: the KDS make line lists a combo's components at their own station — burger and fries on the grill (combo + à-la-carte fries one line), the soda on the bar — with the burger's picks and note",
  563 |     { tag: ["@combo-food"] },
```