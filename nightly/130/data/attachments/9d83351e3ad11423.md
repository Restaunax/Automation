# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/supply-shop.spec.ts >> Admin — Supply shop >> TC-462: a COMPED order goes to print with nothing charged — and minting the card batch is what fulfilment does
- Location: tests/dashboard/admin/supply-shop.spec.ts:384:7

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: getByRole('dialog').getByRole('switch')
Expected: "true"
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" with timeout 10000ms
  - waiting for getByRole('dialog').getByRole('switch')

```

```yaml
- dialog "Fulfil MP-2026-0002":
  - heading "Fulfil MP-2026-0002" [level=2]
  - alert: The proof went to the restaurant a few seconds ago and they haven't replied yet. You can still place it — the proof is a look, not a gate.
  - alert:
    - paragraph: Two sides of one ledger. The top half is what the restaurant pays us — that becomes supply-shop revenue the moment you confirm. The bottom half is what we pay the vendor to produce it — that becomes an expense record in Finance (Expenses → Print orders, or Business expenses). Finance reports the difference as the margin on this order. Confirming here also records that you placed it with the vendor; placing the actual order on the vendor's site is still done by hand.
  - heading "Final price to the restaurant" [level=6]
  - text: The accurate amount. This is what gets charged — the estimate they saw was a range.
  - alert: Comped — nothing is charged.
  - separator
  - heading "What the vendor costs us" [level=6]
  - text: What we pay the printer or supplier for this run. Confirming creates the Finance record with these numbers — you do not create a print order separately. Edit them later from the record in Finance if the invoice differs. Where does the cost go?
  - combobox "Print order"
  - text: "Creates a Print order under Finance → Expenses → Print orders, linked to this order: vendor, cost each, shipping, tax and your reference. The right choice for anything a printer produces."
  - heading "Where we source this" [level=6]
  - button "Continental BizMag"
  - text: Preferred Blind ships
  - link "Trade program":
    - /url: https://continentalbizmag.com/login.php?action=create_account
  - text: "14 day lead · min 100 · Upload the batch export (Card export on the order) as the data file: barcode_value → Code-128 on the back, code_display → the number printed beneath it. Blind-ship to the restaurant. Confirm the exact barcode placement on the first proof."
  - button "CardPrinting.com"
  - text: Blind shipping unverified 10 day lead · min 250 · Alternate when the trade account is not ready or the run is 250+. Same data file; ask for the test cards they send mid-production and scan one at a register before approving. Vendor
  - combobox "Who is producing this?": Continental BizMag
  - text: Cost each
  - spinbutton "Cost each": "1.1"
  - text: Shipping
  - spinbutton "Shipping"
  - text: Tax
  - spinbutton "Tax"
  - text: Vendor order reference
  - textbox "Vendor order reference"
  - alert:
    - paragraph: Revenue $0.00 − cost $110.00 = $-110.00 margin
  - button "Cancel"
  - button "Place with vendor"
```

# Test source

```ts
  322 |         shippingCost: 12,
  323 |         ref: `AUTO-${runId}`,
  324 |       });
  325 |       const outcome = await admin.submitFulfil();
  326 |       test.skip(
  327 |         outcome.data.settled,
  328 |         "this tenant has a saved card — the hosted-payment path was not exercised"
  329 |       );
  330 | 
  331 |       await expect(admin.paymentLinkNotice()).toBeVisible();
  332 |       await expect(
  333 |         admin.rowChip(orderC.orderNumber, "Awaiting owner payment")
  334 |       ).toBeVisible();
  335 |       const parked = await adminOrder(orderC.id);
  336 |       expect(parked.status).toBe("AWAITING_PAYMENT");
  337 |       expect(parked.awaitingOwnerPayment).toBe(true);
  338 |       expect(parked.hostedPaymentUrl).toBeTruthy();
  339 |       expect(parked.paidAt).toBeNull();
  340 |       expect(parked.priceFinalizedAt).toBeTruthy();
  341 |       expect(parked.total).toBe(207);
  342 | 
  343 |       test.skip(
  344 |         !MAILPIT,
  345 |         "MAILPIT_BASE_URL not set — email assertions skipped"
  346 |       );
  347 |       await waitForEmail(ownerEmail, {
  348 |         subjectPattern: /^One step left to print your /,
  349 |         timeoutMs: 60_000,
  350 |       });
  351 |     }
  352 |   );
  353 | 
  354 |   test("TC-461: 'Place order for a restaurant' (charge) creates the owner's order with an admin-named design and no leaked notes", async () => {
  355 |     await admin.goto();
  356 |     await admin.openPlaceDialog();
  357 |     await admin.pickRestaurant(restaurantName);
  358 |     await admin.pickProduct(PRODUCT_NAME);
  359 |     await admin.pickQuantity(100);
  360 |     await expect(admin.placeEstimate()).toContainText(ESTIMATE);
  361 |     await expect(admin.placeVendorCost()).toContainText("$122.00");
  362 |     await admin.placeMessage().fill(`Placed by admin ${runId}`);
  363 |     await admin.placeAdminNotes().fill(`SECRET-${runId}`);
  364 |     await admin.billingRadio("Charge them when it goes to print").check();
  365 |     await admin.termRadio("Card on file").check();
  366 |     const placed = await admin.submitPlace();
  367 |     toCancel.push(placed.data.id);
  368 | 
  369 |     const created = await adminOrder(placed.data.id);
  370 |     expect(created.status).toBe("IN_DESIGN");
  371 |     expect(created.paymentTerm).toBe("IMMEDIATE");
  372 |     expect(created.design?.name).toMatch(
  373 |       /^physical-gift-card — \d{4}-\d{2}-\d{2} \(admin\)$/
  374 |     );
  375 |     expect(created.adminNotes).toBe(`SECRET-${runId}`);
  376 | 
  377 |     const mine = await listSupplyOrdersOwnerRaw(await ownerApi(), restaurantId);
  378 |     const row = mine.data.data.find((o) => o.id === placed.data.id);
  379 |     expect(row, "owner sees the order").toBeTruthy();
  380 |     expect(row).not.toHaveProperty("adminNotes");
  381 |     expect(row).not.toHaveProperty("placedByAdminId");
  382 |   });
  383 | 
  384 |   test(
  385 |     "TC-462: a COMPED order goes to print with nothing charged — and minting the card batch is what fulfilment does",
  386 |     { tag: ["@email"] },
  387 |     async () => {
  388 |       await allure.description(
  389 |         "On-behalf COMP → proof → Fulfil (no price section, 'Comped — nothing is charged.', button reads " +
  390 |           "'Place with vendor') → IN_PRODUCTION with total 0 and paidAt set, a GiftCardBatch on the order, " +
  391 |           "the 'on us' email, and Finance's comped cost up by the vendor cost."
  392 |       );
  393 |       test.setTimeout(180_000);
  394 | 
  395 |       const placed = await createSupplyOrderOnBehalfRaw(adminToken, {
  396 |         restaurantId,
  397 |         variantId,
  398 |         quantity: 100,
  399 |         brief: { message: `comp path ${runId}` },
  400 |         billing: "COMP",
  401 |         compReason: `Automation comp ${runId}`,
  402 |       });
  403 |       expect(placed.status, JSON.stringify(placed.data)).toBe(201);
  404 |       orderE = placed.data.data;
  405 |       const upload = await uploadSupplyArtworkRaw(
  406 |         adminToken,
  407 |         orderE.id,
  408 |         giftCardPassingPdf()
  409 |       );
  410 |       expect(upload.ok, JSON.stringify(upload.data)).toBeTruthy();
  411 |       const sent = await sendSupplyProofRaw(
  412 |         adminToken,
  413 |         orderE.id,
  414 |         upload.data.data!.versionId
  415 |       );
  416 |       expect(sent.status, JSON.stringify(sent.data)).toBe(200);
  417 | 
  418 |       await admin.goto();
  419 |       await admin.openTab("Fulfilment");
  420 |       await expect(admin.rowChip(orderE.orderNumber, "Comped")).toBeVisible();
  421 |       await admin.openFulfil(orderE.orderNumber);
> 422 |       await expect(admin.compSwitch()).toHaveAttribute("aria-checked", "true");
      |                                        ^ Error: expect(locator).toHaveAttribute(expected) failed
  423 |       await expect(admin.willChargeAlert()).toHaveText(
  424 |         "Comped — nothing is charged."
  425 |       );
  426 |       await expect(admin.finalUnit()).toHaveCount(0);
  427 |       await expect(admin.confirmButton()).toHaveText("Place with vendor");
  428 |       await admin.fillVendorSection({
  429 |         vendor: "Continental BizMag",
  430 |         unitCost: 1.1,
  431 |         shippingCost: 12,
  432 |         ref: `RUN-${runId}`,
  433 |       });
  434 |       const outcome = await admin.submitFulfil();
  435 |       expect(outcome.data.settled).toBe(true);
  436 |       expect(
  437 |         outcome.data.giftCardBatchId,
  438 |         "batch minted by the post-fulfilment hook"
  439 |       ).toBeTruthy();
  440 | 
  441 |       const done = await adminOrder(orderE.id);
  442 |       expect(done.status).toBe("IN_PRODUCTION");
  443 |       expect(done.total).toBe(0);
  444 |       expect(done.paidAt).toBeTruthy();
  445 |       expect(done.paymentTerm).toBe("COMP");
  446 |       expect(done.giftCardBatchId).toBe(outcome.data.giftCardBatchId);
  447 |       // Fulfilling a card run switches gift cards ON for the scope — the owner
  448 |       // can't flip that switch themselves, and cards nobody can load are plastic.
  449 |       const cfg = await getGiftCardConfigAdminRaw(adminToken, restaurantId);
  450 |       expect(cfg.data.data.isEnabled).toBe(true);
  451 | 
  452 |       await admin.openTab("History");
  453 |       await expect(admin.row(orderE.orderNumber)).toBeVisible();
  454 |       await admin.openRowMenu(orderE.orderNumber);
  455 |       await expect(admin.menuItem("Card export")).toBeVisible();
  456 |       await admin.closeRowMenu();
  457 | 
  458 |       await expect
  459 |         .poll(
  460 |           async () => {
  461 |             const finance = await getAdminFinanceRaw(adminToken);
  462 |             return finance.ok
  463 |               ? finance.data.data.summary.supplyShop.compedCost
  464 |               : -1;
  465 |           },
  466 |           { timeout: 30_000, intervals: [3_000] }
  467 |         )
  468 |         .toBeGreaterThan(baseline.compedCost);
  469 | 
  470 |       test.skip(
  471 |         !MAILPIT,
  472 |         "MAILPIT_BASE_URL not set — email assertions skipped"
  473 |       );
  474 |       const mail = await waitForEmail(ownerEmail, {
  475 |         subjectPattern: / is on its way to print$/,
  476 |         timeoutMs: 60_000,
  477 |       });
  478 |       expect(mail.html_body).toContain("on us");
  479 |     }
  480 |   );
  481 | 
  482 |   test("TC-463: 'Card export' downloads the batch as the printer's data file — one row per card, the barcode value IS the code", async () => {
  483 |     await allure.description(
  484 |       "Filename is the order number; header and quoting are the contract the printers read; every code is " +
  485 |         "16 characters from the no-look-alike alphabet; exporting stamps the batch EXPORTED and counts the export."
  486 |     );
  487 |     await admin.goto();
  488 |     await admin.openTab("History");
  489 |     const download = await admin.downloadCardExport(orderE.orderNumber);
  490 |     expect(download.suggestedFilename()).toBe(
  491 |       `${orderE.orderNumber}-gift-cards.csv`
  492 |     );
  493 |     const text = fs.readFileSync(await download.path(), "utf8");
  494 | 
  495 |     expect(text.endsWith("\n")).toBe(true);
  496 |     expect(text).not.toContain("\r\n");
  497 |     const { header, rows } = csvToObjects(text);
  498 |     expect(header).toEqual(CSV_HEADER);
  499 |     expect(rows).toHaveLength(100);
  500 |     for (const row of rows) {
  501 |       const code = row.code ?? "";
  502 |       expect(code).toMatch(CODE_RE);
  503 |       expect(row.barcode_value).toBe(code);
  504 |       expect(row.code_display).toBe(code.replace(/(.{4})(?=.)/g, "$1-"));
  505 |       expect(row.card_last4).toBe(code.slice(-4));
  506 |       expect(row.batch_label).toBe(`Print run ${orderE.orderNumber}`);
  507 |       expect(row.scope_type).toBe("restaurant");
  508 |       expect(row.scope_name).toBe(restaurantName);
  509 |     }
  510 |     expect(new Set(rows.map((r) => r.code)).size).toBe(100);
  511 |     expect(rows.map((r) => Number(r.sequence))).toEqual(
  512 |       rows.map((_, i) => i + 1)
  513 |     );
  514 | 
  515 |     const batches = await listGiftCardBatchesRaw(adminToken, restaurantId);
  516 |     const batch = batches.data.data.find(
  517 |       (b) => b.supplyOrder?.orderNumber === orderE.orderNumber
  518 |     );
  519 |     expect(batch, "batch linked to the order").toBeTruthy();
  520 |     expect(batch!.status).toBe("EXPORTED");
  521 |     expect(batch!.exportCount).toBeGreaterThanOrEqual(1);
  522 |     expect(batch!.counts).toMatchObject({ inactive: 100, active: 0 });
```