# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/supply-shop.spec.ts >> Admin — Supply shop >> TC-463: 'Card export' downloads the batch as the printer's data file — one row per card, the barcode value IS the code
- Location: tests/dashboard/admin/supply-shop.spec.ts:482:7

# Error details

```
TypeError: Cannot read properties of undefined (reading 'orderNumber')
```

# Test source

```ts
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
  422 |       await expect(admin.compSwitch()).toHaveAttribute("aria-checked", "true");
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
> 489 |     const download = await admin.downloadCardExport(orderE.orderNumber);
      |                                                            ^ TypeError: Cannot read properties of undefined (reading 'orderNumber')
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
  523 |   });
  524 | 
  525 |   test("TC-464: fulfil refuses to move money without a final price, to comp without a reason, and to invoice a tenant with no credit", async () => {
  526 |     const owner = await ownerApi();
  527 |     const orderF = await placeSupplyOrderViaApi(owner, restaurantId, {
  528 |       variantId,
  529 |       quantity: 100,
  530 |       message: `negatives ${runId}`,
  531 |     });
  532 |     toCancel.push(orderF.id);
  533 |     const upload = await uploadSupplyArtworkRaw(
  534 |       adminToken,
  535 |       orderF.id,
  536 |       giftCardPassingPdf()
  537 |     );
  538 |     await sendSupplyProofRaw(
  539 |       adminToken,
  540 |       orderF.id,
  541 |       upload.data.data!.versionId
  542 |     );
  543 | 
  544 |     const noPrice = await fulfilSupplyOrderRaw(adminToken, orderF.id, {
  545 |       route: "PRINT_ORDER",
  546 |       vendor: "Automation Vendor",
  547 |       unitCost: 1.1,
  548 |     });
  549 |     expect(noPrice.status, JSON.stringify(noPrice.data)).toBe(400);
  550 |     expect(noPrice.data.code).toBe("FINAL_PRICE_REQUIRED");
  551 | 
  552 |     const noReason = await fulfilSupplyOrderRaw(adminToken, orderF.id, {
  553 |       route: "PRINT_ORDER",
  554 |       vendor: "Automation Vendor",
  555 |       unitCost: 1.1,
  556 |       comp: true,
  557 |     });
  558 |     expect(noReason.status, JSON.stringify(noReason.data)).toBe(400);
  559 |     expect(noReason.data.code).toBe("COMP_REASON_REQUIRED");
  560 |     expect((await adminOrder(orderF.id)).status).toBe("PROOF_READY");
  561 | 
  562 |     const invoice = await createSupplyOrderOnBehalfRaw(adminToken, {
  563 |       restaurantId,
  564 |       variantId,
  565 |       quantity: 100,
  566 |       brief: { message: `invoice ${runId}` },
  567 |       billing: "CHARGE",
  568 |       paymentTerm: "NEXT_INVOICE",
  569 |     });
  570 |     if (invoice.ok) {
  571 |       // QA gave this tenant credit (a subscribed OWNER2) — that is a valid world too.
  572 |       toCancel.push(invoice.data.data.id);
  573 |       expect(invoice.data.data.paymentTerm).toBe("NEXT_INVOICE");
  574 |     } else {
  575 |       expect(invoice.status, JSON.stringify(invoice.data)).toBe(400);
  576 |     }
  577 |   });
  578 | 
  579 |   test("TC-465: an owner can never comp their own order, and cannot claim the free tier on a $207 run", async () => {
  580 |     const owner = await ownerApi();
  581 |     const design = await createSupplyDesignOwnerRaw(owner, restaurantId, {
  582 |       variantId,
  583 |       name: `terms ${runId}`,
  584 |       brief: { message: `terms ${runId}` },
  585 |     });
  586 |     const draft = await createSupplyOrderOwnerRaw(owner, restaurantId, {
  587 |       variantId,
  588 |       quantity: 100,
  589 |       designId: design.data.data.id,
```