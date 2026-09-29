# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/supply-shop.spec.ts >> Admin — Supply shop >> TC-464: fulfil refuses to move money without a final price, to comp without a reason, and to invoice a tenant with no credit
- Location: tests/dashboard/admin/supply-shop.spec.ts:525:7

# Error details

```
Error: {"success":false,"code":"TERM_UNAVAILABLE","error":"Billing to your next invoice is not available right now."}

expect(received).toBe(expected) // Object.is equality

Expected: 400
Received: 409
```

# Test source

```ts
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
> 575 |       expect(invoice.status, JSON.stringify(invoice.data)).toBe(400);
      |                                                            ^ Error: {"success":false,"code":"TERM_UNAVAILABLE","error":"Billing to your next invoice is not available right now."}
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
  590 |     });
  591 |     expect(draft.status, JSON.stringify(draft.data)).toBe(201);
  592 |     toCancel.push(draft.data.data.id);
  593 | 
  594 |     const comp = await commitSupplyOrderOwnerRaw(
  595 |       owner,
  596 |       restaurantId,
  597 |       draft.data.data.id,
  598 |       "COMP"
  599 |     );
  600 |     expect(comp.status, JSON.stringify(comp.data)).toBe(400);
  601 |     const free = await commitSupplyOrderOwnerRaw(
  602 |       owner,
  603 |       restaurantId,
  604 |       draft.data.data.id,
  605 |       "FREE_TIER"
  606 |     );
  607 |     expect(free.status, JSON.stringify(free.data)).toBe(400);
  608 |     const still = await listSupplyOrdersOwnerRaw(owner, restaurantId);
  609 |     expect(
  610 |       still.data.data.find((o) => o.id === draft.data.data.id)?.status
  611 |     ).toBe("DRAFT");
  612 |   });
  613 | 
  614 |   test("TC-466: fulfilling an order twice mints nothing twice — one batch per order", async () => {
  615 |     const again = await fulfilSupplyOrderRaw(adminToken, orderE.id, {
  616 |       route: "PRINT_ORDER",
  617 |       vendor: "Continental BizMag",
  618 |       unitCost: 1.1,
  619 |     });
  620 |     expect(again.ok, JSON.stringify(again.data)).toBe(false);
  621 | 
  622 |     const batches = await listGiftCardBatchesRaw(adminToken, restaurantId);
  623 |     const forE = batches.data.data.filter(
  624 |       (b) => b.supplyOrder?.orderNumber === orderE.orderNumber
  625 |     );
  626 |     expect(forE).toHaveLength(1);
  627 |   });
  628 | 
  629 |   test("TC-467: unsold stock is not a liability — Finance's gift-card liability is unchanged by a minted batch", async () => {
  630 |     const finance = await getAdminFinanceRaw(adminToken);
  631 |     expect(finance.status, JSON.stringify(finance.data)).toBe(200);
  632 |     expect(finance.data.data.summary.giftCards.liability).toBe(
  633 |       baseline.liability
  634 |     );
  635 |   });
  636 | 
  637 |   test("TC-468: the supply-shop admin API is gated by ROLE — an employee gets 403 whatever the sidebar shows", async () => {
  638 |     test.skip(
  639 |       !EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD,
  640 |       "EMPLOYEE_EMAIL / EMPLOYEE_PASSWORD not set"
  641 |     );
  642 |     const employee = (await apiLogin(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD))
  643 |       .accessToken;
  644 |     const res = await listAdminSupplyOrdersRaw(employee, {
  645 |       queue: "fulfilment",
  646 |     });
  647 |     expect(res.status, JSON.stringify(res.data)).toBe(403);
  648 |   });
  649 | });
  650 | 
```