# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/journey/02-service-day.spec.ts >> Journey 2 — a service day, closed by the owner >> TC-999: the deposit is the cash taken; a negative one is refused in the dialog; Close Day records it
- Location: tests/dashboard/journey/02-service-day.spec.ts:595:7

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('dialog').last().getByRole('button', { name: 'Next' })

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
  497 |       .filter({ has: page().getByRole("columnheader", { name: "Staff" }) });
  498 |     await expect(
  499 |       staff.getByRole("row", { name: "Dee Server 3 $71.34" })
  500 |     ).toBeVisible();
  501 |     await expect(
  502 |       staff.getByRole("row", { name: "Unattributed (kiosk / online) 1 $16.84" })
  503 |     ).toBeVisible();
  504 |     await expectHumanText(page().getByRole("main"), "the daily report");
  505 |   });
  506 | 
  507 |   test("TC-996: Close Day names what blocks it, and Next stays off", async () => {
  508 |     const dialog = await openWizard();
  509 |     await expectSeenByUser(
  510 |       dialog.getByText(/^1 drawer is still open\./),
  511 |       "the open drawer"
  512 |     );
  513 |     // Said once (RestauNax #1098): it used to have a second box of its own.
  514 |     await expect(dialog.getByText(/still open/)).toHaveCount(1);
  515 |     await expect(dialog.getByText(/^1 check still owes money\./)).toBeVisible();
  516 |     await expect(dialog.getByText("Table T2 — $10.70")).toBeVisible();
  517 |     await expect(dialog.getByText("Dee S.", { exact: true })).toBeVisible();
  518 |     // A warning, not a blocker: the online order nobody accepted.
  519 |     await expect(
  520 |       dialog.getByText(/^1 order has not been accepted yet\./)
  521 |     ).toBeVisible();
  522 |     await expect(
  523 |       dialog.getByText("1 person is still clocked in.")
  524 |     ).toBeVisible();
  525 |     await expect(
  526 |       dialog.getByRole("checkbox", { name: /^Dee Server — / })
  527 |     ).toBeChecked();
  528 |     await expect(dialog.getByRole("button", { name: "Next" })).toBeDisabled();
  529 |     await expectHumanText(dialog, "the close-day checklist");
  530 |     await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  531 |     await expect(dialog).toBeHidden();
  532 |   });
  533 | 
  534 |   test("TC-997: T2 is paid, the drawer counts out to the cent, and Clock out selected clocks Dee out", async () => {
  535 |     const paid = await settleTabCashRaw(tablet, ownerSession, t2.id, {
  536 |       amount: t2.total,
  537 |       cashTendered: 20,
  538 |       idempotencyKey: `j2-${runId}-t2`,
  539 |     });
  540 |     expect(paid.status, JSON.stringify(paid.data)).toBe(200);
  541 |     expect(paid.data).toMatchObject({ remaining: 0, closed: true });
  542 | 
  543 |     // $100 float + 17.12 + 19.26 + 24.26 (with the $5 tip) + 10.70.
  544 |     const counted = await closeRegisterSessionPosRaw(tablet, ownerSession, {
  545 |       countedCash: 171.34,
  546 |     });
  547 |     expect(counted.status, JSON.stringify(counted.data)).toBe(200);
  548 |     expect(counted.data.data).toMatchObject({
  549 |       expectedCash: 171.34,
  550 |       countedCash: 171.34,
  551 |       overShort: 0,
  552 |     });
  553 | 
  554 |     await openReport();
  555 |     const dialog = await openWizard();
  556 |     await expect(
  557 |       dialog.getByText("Nothing outstanding — the day is ready to close.")
  558 |     ).toBeVisible();
  559 |     await expect(dialog.getByText(/still owes? money/)).toHaveCount(0);
  560 |     await expect(dialog.getByText(/still open/)).toHaveCount(0);
  561 | 
  562 |     await dialog.getByRole("button", { name: "Clock out selected" }).click();
  563 |     await expect(
  564 |       dialog.getByText("1 person is still clocked in.")
  565 |     ).toBeHidden();
  566 |     await expect(dialog.getByRole("button", { name: "Next" })).toBeEnabled();
  567 |     expect((await clockFor(dee.id))?.activeShift).toBeNull();
  568 |   });
  569 | 
  570 |   test("TC-998: the summary shows the report's figures and the drawer's count", async () => {
  571 |     const dialog = activeDialog(page());
  572 |     await dialog.getByRole("button", { name: "Next" }).click();
  573 |     await expect(
  574 |       dialog.getByText("Today's figures to be snapshotted")
  575 |     ).toBeVisible();
  576 |     const expected: [string, string][] = [
  577 |       ["Orders", "4"],
  578 |       ["Gross sales (before discounts)", "$74.00"],
  579 |       ["Net sales", "$74.00"],
  580 |       ["Total collected", "$88.18"],
  581 |       ["Tax", "$5.18"],
  582 |       ["Tips", "$9.00"],
  583 |       ["Comps / voids / refunds", "0 / 0 / 0"],
  584 |       ["Cash", "$71.34"],
  585 |       ["Card", "$16.84"],
  586 |       ["Opening floats", "$100.00"],
  587 |       ["Expected", "$171.34"],
  588 |       ["Counted", "$171.34"],
  589 |       ["Over / short", "$0.00"],
  590 |     ];
  591 |     for (const [label, value] of expected)
  592 |       await expect(summaryRow(label), label).toHaveText(`${label}${value}`);
  593 |   });
  594 | 
  595 |   test("TC-999: the deposit is the cash taken; a negative one is refused in the dialog; Close Day records it", async () => {
  596 |     const dialog = activeDialog(page());
> 597 |     await dialog.getByRole("button", { name: "Next" }).click();
      |                                                        ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  598 |     const deposit = dialog.getByRole("spinbutton", {
  599 |       name: "Deposit (cash to bank)",
  600 |     });
  601 |     await expect(deposit).toHaveValue("71.34");
  602 |     await expect(dialog.getByText("Suggested: $71.34")).toBeVisible();
  603 |     await expect(
  604 |       dialog.getByText(
  605 |         "Closing the day creates a permanent record. It cannot be edited afterwards."
  606 |       )
  607 |     ).toBeVisible();
  608 | 
  609 |     const close = dialog.getByRole("button", { name: "Close Day" });
  610 |     await deposit.fill("-5");
  611 |     await close.click();
  612 |     await expectSeenByUser(
  613 |       dialog.getByText("Enter a valid deposit amount (0 or more)."),
  614 |       "the deposit error"
  615 |     );
  616 |     await expect(dialog).toBeVisible();
  617 | 
  618 |     await deposit.fill("71.34");
  619 |     await dialog
  620 |       .getByRole("textbox", { name: "Note (optional)" })
  621 |       .fill("Journey day 2");
  622 |     await close.click();
  623 |     await expect(dialog).toBeHidden({ timeout: 20_000 });
  624 |     // Who closed it, the deposit and the owner's note.
  625 |     const banner = page().getByText(
  626 |       /^Day closed by .+ · Deposit \$71\.34 · "Journey day 2"$/
  627 |     );
  628 |     await expectSeenByUser(banner, "the day-closed banner");
  629 | 
  630 |     await page().reload({ waitUntil: "domcontentloaded" });
  631 |     await expect(banner).toBeVisible({ timeout: 25_000 });
  632 |     await expect(stat("Net sales")).toContainText("$74.00");
  633 |     await expect(stat("Over / short")).toContainText("$0.00");
  634 |   });
  635 | 
  636 |   test("TC-1000: after the close, ordering is closed for the night and Orders lists the day by Receipt #", async () => {
  637 |     await page().goto(portal("?tab=store-status"), {
  638 |       waitUntil: "domcontentloaded",
  639 |     });
  640 |     await expect(
  641 |       // Tomorrow's opening, named by its day: "reopens Fri 10:00 AM".
  642 |       page().getByRole("heading", {
  643 |         name: /^Closed for the night · reopens [A-Z][a-z]{2} 10:00 AM$/,
  644 |       })
  645 |     ).toBeVisible({ timeout: 25_000 });
  646 |     await expect(
  647 |       page().getByText(
  648 |         "You closed the day. Online ordering reopens by itself at your next opening time."
  649 |       )
  650 |     ).toBeVisible();
  651 | 
  652 |     const late = await apiRequestRaw<Rec>(
  653 |       "POST",
  654 |       `/api/order/new/restaurantId/${restaurantId}`,
  655 |       {
  656 |         orderType: "PICKUP",
  657 |         subtotal: 12,
  658 |         tax: 0.84,
  659 |         tip: 0,
  660 |         deliveryFee: 0,
  661 |         total: 12.84,
  662 |         customerEmail: `auto-late-${runId}@restaunax-test.com`,
  663 |         customerPhone: "5555550124",
  664 |         firstName: "Late",
  665 |         lastName: "Guest",
  666 |         orderItems: [line(menu.burger, 1, 12)],
  667 |       }
  668 |     );
  669 |     expect(late.status).toBe(400);
  670 |     expect(String(late.data.message)).toBe(
  671 |       "This restaurant has closed for the night. Online ordering opens again in the morning."
  672 |     );
  673 | 
  674 |     await page().goto(portal("?tab=Orders"), { waitUntil: "domcontentloaded" });
  675 |     const orders = page()
  676 |       .getByRole("grid")
  677 |       .filter({ has: page().getByRole("columnheader", { name: "Receipt #" }) });
  678 |     await expect(orders).toBeVisible({ timeout: 25_000 });
  679 |     // Receipt # is permanent; the daily Order # rides beside it.
  680 |     for (const [receipt, daily, rest] of [
  681 |       ["#1000", 1, /Pickup In-Store .* \$17\.12/],
  682 |       ["#1001", 2, /SPLIT .*Dine-in In-Store .* \$43\.52/],
  683 |       ["#1002", 3, /Gia Guest .*Pickup Web .* \$16\.84/],
  684 |       ["#1003", 4, /Dine-in In-Store .* \$10\.70/],
  685 |     ] as const) {
  686 |       const row = orders.getByRole("row", {
  687 |         name: new RegExp(`^${receipt} Order #${daily} `),
  688 |       });
  689 |       await expect(row).toBeVisible();
  690 |       await expect(row).toHaveAccessibleName(rest);
  691 |     }
  692 |   });
  693 | });
  694 | 
```