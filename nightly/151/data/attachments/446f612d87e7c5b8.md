# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/20-supply-shop.spec.ts >> Owner — Print Shop (supply shop) >> TC-451: approving a superseded proof is refused (409 PROOF_SUPERSEDED)
- Location: tests/dashboard/owner/20-supply-shop.spec.ts:408:7

# Error details

```
TypeError: Cannot read properties of undefined (reading 'id')
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
  312 |       expect(orderA.paidAt).toBeNull();
  313 | 
  314 |       await shop.openOrders();
  315 |       await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
  316 |         "We're designing it"
  317 |       );
  318 |       await expect(shop.orderRow(orderA.orderNumber)).toContainText(
  319 |         `${ESTIMATE} est.`
  320 |       );
  321 | 
  322 |       test.skip(
  323 |         !MAILPIT,
  324 |         "MAILPIT_BASE_URL not set — email assertions skipped"
  325 |       );
  326 |       const mail = await waitForEmail(ownerEmail, {
  327 |         subjectPattern: /^We're designing your /,
  328 |         timeoutMs: 60_000,
  329 |       });
  330 |       expect(mail.html_body).toContain(`Order ${orderA.orderNumber}`);
  331 |       expect(mail.html_body).toContain("We're on it");
  332 |     }
  333 |   );
  334 | 
  335 |   test(
  336 |     "TC-449: the email's call to action opens the owner's Print Shop, not a dead route",
  337 |     { tag: ["@email"] },
  338 |     async () => {
  339 |       await allure.description(
  340 |         "The CTA used to link /supply-shop/orders/<id>, which was never a route (fixed in RestauNax #678). " +
  341 |           "It must open this restaurant's portal on the Print Shop tab."
  342 |       );
  343 |       test.skip(
  344 |         !MAILPIT,
  345 |         "MAILPIT_BASE_URL not set — email assertions skipped"
  346 |       );
  347 | 
  348 |       const mail = await waitForEmail(ownerEmail, {
  349 |         subjectPattern: /^We're designing your /,
  350 |         timeoutMs: 60_000,
  351 |       });
  352 |       const href =
  353 |         /href="([^"]*restaurantManagement\?tab=supply-shop[^"]*)"/.exec(
  354 |           mail.html_body
  355 |         )?.[1];
  356 |       expect(href, "CTA href pointing at the Print Shop tab").toBeTruthy();
  357 |       expect(href).toContain(`/restaurant/restaurantId/${restaurantId}/`);
  358 | 
  359 |       await session.page.goto(href!.replace(/&amp;/g, "&"), {
  360 |         waitUntil: "domcontentloaded",
  361 |       });
  362 |       await expect(
  363 |         session.page.getByRole("tab", { name: "My orders" })
  364 |       ).toBeVisible({ timeout: 20_000 });
  365 |     }
  366 |   );
  367 | 
  368 |   test(
  369 |     "TC-450: 'Your proof is ready' → 'I'd like changes' sends the note back and reopens the design",
  370 |     { tag: ["@email"] },
  371 |     async () => {
  372 |       await allure.description(
  373 |         "The admin uploads a print-ready PDF and sends it; the owner sees the proof, asks for a change, and " +
  374 |           "the 'revisionsReceived' email quotes their own words. The order returns to IN_DESIGN."
  375 |       );
  376 |       test.setTimeout(150_000);
  377 | 
  378 |       proofV1 = await sendProofFor(adminToken, orderA.id);
  379 |       await shop.goto(restaurantId);
  380 |       await shop.openOrders();
  381 |       await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
  382 |         "Your proof is ready"
  383 |       );
  384 | 
  385 |       const note = `Please make the logo bigger ${runId}`;
  386 |       await shop.reviewProof(orderA.orderNumber);
  387 |       await expect(shop.dialog()).toContainText(
  388 |         `Your proof — ${orderA.orderNumber}`
  389 |       );
  390 |       await shop.requestChanges(note);
  391 |       await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
  392 |         "We're designing it"
  393 |       );
  394 | 
  395 |       test.skip(
  396 |         !MAILPIT,
  397 |         "MAILPIT_BASE_URL not set — email assertions skipped"
  398 |       );
  399 |       const mail = await waitForEmail(ownerEmail, {
  400 |         subjectPattern: /^We're making those changes$/,
  401 |         timeoutMs: 60_000,
  402 |       });
  403 |       expect(mail.html_body).toContain("What you asked for");
  404 |       expect(mail.html_body).toContain(note);
  405 |     }
  406 |   );
  407 | 
  408 |   test("TC-451: approving a superseded proof is refused (409 PROOF_SUPERSEDED)", async () => {
  409 |     await allure.description(
  410 |       "Proof v2 goes out; an approve carrying v1's versionId must not approve v2 by accident."
  411 |     );
> 412 |     await sendProofFor(adminToken, orderA.id);
      |                                           ^ TypeError: Cannot read properties of undefined (reading 'id')
  413 |     const stale = await approveSupplyProofOwnerRaw(
  414 |       await ownerApi(),
  415 |       restaurantId,
  416 |       orderA.id,
  417 |       proofV1
  418 |     );
  419 |     expect(stale.status, JSON.stringify(stale.data)).toBe(409);
  420 |     expect(stale.data.code).toBe("PROOF_SUPERSEDED");
  421 |     // The current proof is still the one the owner will see.
  422 |     const proof = await getSupplyProofOwnerRaw(
  423 |       ownerToken,
  424 |       restaurantId,
  425 |       orderA.id
  426 |     );
  427 |     expect(proof.data.data.versionId).not.toBe(proofV1);
  428 |   });
  429 | 
  430 |   test(
  431 |     "TC-452: 'Looks good' moves the order to 'Placed — price confirmed at print'",
  432 |     { tag: ["@email"] },
  433 |     async () => {
  434 |       test.setTimeout(150_000);
  435 |       await shop.goto(restaurantId);
  436 |       await shop.openOrders();
  437 |       await shop.reviewProof(orderA.orderNumber);
  438 |       await shop.approveProof();
  439 |       await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
  440 |         "Placed — price confirmed at print"
  441 |       );
  442 |       const placed = await findOrder((o) => o.id === orderA.id);
  443 |       expect(placed.status).toBe("PLACED");
  444 |       expect(placed.paidAt).toBeNull();
  445 | 
  446 |       test.skip(
  447 |         !MAILPIT,
  448 |         "MAILPIT_BASE_URL not set — email assertions skipped"
  449 |       );
  450 |       await waitForEmail(ownerEmail, {
  451 |         subjectPattern: /^Glad you like it — /,
  452 |         timeoutMs: 60_000,
  453 |       });
  454 |     }
  455 |   );
  456 | 
  457 |   test(
  458 |     "TC-453: the admin's Finalise on a tenant with no saved card becomes 'Awaiting payment' + a 'Pay $… to print' link — never a silent charge",
  459 |     { tag: ["@email"] },
  460 |     async () => {
  461 |       await allure.description(
  462 |         "IMMEDIATE with no card on file falls back to a hosted Checkout: the price is finalised ($207.00, " +
  463 |           "shown in place of the estimate), the row grows a Pay button pointing at Stripe, and the " +
  464 |           "'paymentNeeded' email carries the same link. Completing Checkout is out of reach on QA (Radar hCaptcha)."
  465 |       );
  466 |       test.setTimeout(150_000);
  467 | 
  468 |       const outcome = await fulfilSupplyOrderRaw(adminToken, orderA.id, {
  469 |         route: "PRINT_ORDER",
  470 |         vendor: "Automation Vendor",
  471 |         unitCost: 1.1,
  472 |         shippingCost: 12,
  473 |         taxCost: 0,
  474 |         vendorOrderRef: `AUTO-${runId}`,
  475 |         finalUnitPrice: 1.95,
  476 |         finalShippingAmount: 12,
  477 |         comp: false,
  478 |       });
  479 |       expect(outcome.status, JSON.stringify(outcome.data)).toBe(200);
  480 |       test.skip(
  481 |         outcome.data.data?.settled === true,
  482 |         "this tenant has a saved card — the hosted-payment path was not exercised"
  483 |       );
  484 |       hostedPaymentUrl = outcome.data.data?.hostedPaymentUrl ?? null;
  485 |       expect(hostedPaymentUrl, "hosted Checkout URL").toBeTruthy();
  486 | 
  487 |       await shop.goto(restaurantId);
  488 |       await shop.openOrders();
  489 |       await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
  490 |         "Awaiting payment"
  491 |       );
  492 |       await expect(shop.orderRow(orderA.orderNumber)).toContainText("$207.00");
  493 |       await expect(shop.orderRow(orderA.orderNumber)).not.toContainText("est.");
  494 |       const pay = shop.payNowLink(orderA.orderNumber);
  495 |       await expect(pay).toHaveText("Pay $207.00 to print");
  496 |       await expect(pay).toHaveAttribute("href", hostedPaymentUrl!);
  497 |       expect(new URL(hostedPaymentUrl!).hostname).toContain("stripe.com");
  498 | 
  499 |       test.skip(
  500 |         !MAILPIT,
  501 |         "MAILPIT_BASE_URL not set — email assertions skipped"
  502 |       );
  503 |       const mail = await waitForEmail(ownerEmail, {
  504 |         subjectPattern: /^One step left to print your /,
  505 |         timeoutMs: 60_000,
  506 |       });
  507 |       expect(mail.html_body.replace(/&amp;/g, "&")).toContain(
  508 |         hostedPaymentUrl!
  509 |       );
  510 |     }
  511 |   );
  512 | 
```