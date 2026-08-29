# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/11-deals.spec.ts >> Owner — Deals >> TC-362: Edit pre-fills the form; renaming, repricing, removing and adding a slot round-trips through PUT and the table
- Location: tests/dashboard/owner/11-deals.spec.ts:657:7

# Error details

```
Error: {"error":"ACCESS_TOKEN_EXPIRED","message":"Your access token has expired. Please log in again."}

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  589 |     await form.priceInput().fill("0");
  590 |     await form.submitButton().click();
  591 |     await expect(form.pricePositiveError()).toBeVisible();
  592 |     await expect(form.nameRequiredError()).toHaveCount(0);
  593 | 
  594 |     await form.priceInput().fill("16.5");
  595 |     await form.submitButton().click();
  596 |     await expect(form.priceBelowOriginalError()).toBeVisible();
  597 | 
  598 |     await form.priceInput().fill("1");
  599 |     await expect(form.savingsText()).toHaveText("Savings: $15.50 (94% off)");
  600 |     await expect(form.previewSaveChip()).toHaveText("Save 94%");
  601 |     await expect(form.highDiscountWarning()).toBeVisible();
  602 | 
  603 |     await form.setItemQty(itemA.name, 2);
  604 |     await form.priceInput().fill("20");
  605 |     await expect(form.originalPriceText()).toContainText("$26.50");
  606 |     await expect(form.savingsText()).toHaveText("Savings: $6.50 (25% off)");
  607 |     await expect(form.previewIncludesChips().first()).toHaveText(
  608 |       `2x ${itemA.name}`
  609 |     );
  610 |     await expect(form.highDiscountWarning()).toHaveCount(0);
  611 |     // Disabled-by-design restriction inputs.
  612 |     await expect(form.dayCheckbox("Mon")).toBeDisabled();
  613 |     // Nothing was created.
  614 |     expect(
  615 |       (await getRestaurantDeals(token, restaurantId)).some(
  616 |         (d) => d.name === `AUTO Form Invalid ${runId}`
  617 |       )
  618 |     ).toBe(false);
  619 |   });
  620 | 
  621 |   test("TC-361: creating a deal through the form persists the split slots and the server-computed savings, then lands on the table", async ({
  622 |     ownerPage,
  623 |   }) => {
  624 |     const dealsPage = createOwnerDealsPage(ownerPage);
  625 |     const form = createDealFormPage(ownerPage);
  626 |     const name = `AUTO Form Created ${runId}`;
  627 |     await dealsPage.gotoTab(restaurantId, "create-deal");
  628 |     await form.assertCreateMode();
  629 |     await form.nameInput().fill(name);
  630 |     await form.descriptionInput().fill("created through the UI");
  631 |     await form.addItem(itemA.name);
  632 |     await form.addItem(itemB.name);
  633 |     await form.setItemQty(itemA.name, 2);
  634 |     await form.priceInput().fill("21");
  635 |     const { status, body } = await form.submitAndWait("create");
  636 |     expect(status, JSON.stringify(body)).toBe(201);
  637 |     const dealId = (body as { deal?: { id?: string } }).deal?.id ?? "";
  638 |     if (dealId) extraDealIds.push(dealId);
  639 |     await expect(form.createdSnackbar()).toBeVisible({ timeout: 5_000 });
  640 |     // 1.5 s later the form navigates back to the table.
  641 |     await dealsPage.assertManageDealsLoaded();
  642 |     await dealsPage.search(name);
  643 |     const row = dealsPage.row(name);
  644 |     await expect(row).toBeVisible({ timeout: 15_000 });
  645 |     await expect(row).toContainText("3 items");
  646 |     await expect(row).toContainText("$21.00");
  647 |     await expect(row).toContainText("$26.50");
  648 |     await expect(row).toContainText("21% off");
  649 |     const api = await getDealApi(token, dealId);
  650 |     expect(api.items).toHaveLength(3);
  651 |     expect(api.items!.every((i) => i.quantity === 1)).toBe(true);
  652 |     expect(api.originalPrice).toBe(26.5);
  653 |     expect(api.savingsAmount).toBe(5.5);
  654 |     expect(api.description).toBe("created through the UI");
  655 |   });
  656 | 
  657 |   test("TC-362: Edit pre-fills the form; renaming, repricing, removing and adding a slot round-trips through PUT and the table", async ({
  658 |     ownerPage,
  659 |   }) => {
  660 |     const original = await createDealApiCapSafe(
  661 |       token,
  662 |       restaurantId,
  663 |       `AUTO Form Editable ${runId}`,
  664 |       12,
  665 |       two()
  666 |     );
  667 |     extraDealIds.push(original.id);
  668 |     const dealsPage = createOwnerDealsPage(ownerPage);
  669 |     const form = createDealFormPage(ownerPage);
  670 |     await dealsPage.gotoManageDeals(restaurantId);
  671 |     await dealsPage.search(original.name);
  672 |     await dealsPage.openRowMenu(original.name);
  673 |     await dealsPage.editMenuItem().click();
  674 |     await form.assertEditMode();
  675 |     await expect(form.nameInput()).toHaveValue(original.name);
  676 |     await expect(form.priceInput()).toHaveValue("12");
  677 |     await expect(form.itemCard(itemA.name)).toBeVisible();
  678 |     await expect(form.itemCard(itemB.name)).toBeVisible();
  679 |     await expect(form.submitButton()).toHaveText("Update Deal");
  680 | 
  681 |     const renamed = `AUTO Form Edited ${runId}`;
  682 |     await form.nameInput().fill(renamed);
  683 |     await form.removeItem(itemB.name);
  684 |     await expect(form.itemCard(itemB.name)).toHaveCount(0);
  685 |     await form.addItem(itemC.name);
  686 |     await form.priceInput().fill("11");
  687 |     await expect(form.originalPriceText()).toContainText("$14.00");
  688 |     const { status, body } = await form.submitAndWait("update");
> 689 |     expect(status, JSON.stringify(body)).toBe(200);
      |                                          ^ Error: {"error":"ACCESS_TOKEN_EXPIRED","message":"Your access token has expired. Please log in again."}
  690 |     await expect(form.updatedSnackbar()).toBeVisible({ timeout: 5_000 });
  691 |     await dealsPage.assertManageDealsLoaded();
  692 |     await dealsPage.search(renamed);
  693 |     const row = dealsPage.row(renamed);
  694 |     await expect(row).toBeVisible({ timeout: 15_000 });
  695 |     await expect(row).toContainText("$11.00");
  696 |     await expect(row).toContainText("$14.00");
  697 |     await expect(row).toContainText("21% off");
  698 |     const api = await getDealApi(token, original.id);
  699 |     expect(api.name).toBe(renamed);
  700 |     expect(api.dealPrice).toBe(11);
  701 |     expect(api.items!.map((i) => i.menuItemId).sort()).toEqual(
  702 |       [itemA.id, itemC.id].sort()
  703 |     );
  704 |   });
  705 | 
  706 |   // ── Analytics + AI smoke ──────────────────────────────────────────────────
  707 | 
  708 |   test("TC-363: Deal Analytics renders the metric cards and summaries from GET /stats and lists top deals (or the no-usage empty state)", async ({
  709 |     ownerPage,
  710 |   }) => {
  711 |     const dealsPage = createOwnerDealsPage(ownerPage);
  712 |     const analytics = createDealAnalyticsPage(ownerPage);
  713 |     const [statsRes] = await Promise.all([
  714 |       ownerPage.waitForResponse(
  715 |         (r) =>
  716 |           new RegExp(`/api/deals/restaurant/${restaurantId}/stats$`).test(
  717 |             r.url()
  718 |           ) && r.request().method() === "GET",
  719 |         { timeout: 30_000 }
  720 |       ),
  721 |       dealsPage.gotoTab(restaurantId, "deal-analytics"),
  722 |     ]);
  723 |     const stats = (await statsRes.json()) as {
  724 |       summary: {
  725 |         totalCount: number;
  726 |         activeCount: number;
  727 |         totalRevenue: number;
  728 |         totalSavingsGiven: number;
  729 |         totalTimesUsed: number;
  730 |       };
  731 |       topDeals: { name: string; timesUsed: number }[];
  732 |     };
  733 |     await analytics.assertLoaded();
  734 |     const s = stats.summary;
  735 |     await expect(analytics.metricValue("Total Deals")).toHaveText(
  736 |       String(s.totalCount)
  737 |     );
  738 |     await expect(analytics.metricValue("Active Deals")).toHaveText(
  739 |       String(s.activeCount)
  740 |     );
  741 |     await expect(analytics.metricValue("Total Revenue")).toHaveText(
  742 |       `$${s.totalRevenue.toFixed(2)}`
  743 |     );
  744 |     await expect(analytics.metricValue("Total Savings Given")).toHaveText(
  745 |       `$${s.totalSavingsGiven.toFixed(2)}`
  746 |     );
  747 |     await expect(analytics.metricValue("Total Orders with Deals")).toHaveText(
  748 |       String(s.totalTimesUsed)
  749 |     );
  750 |     if (stats.topDeals.length > 0) {
  751 |       const top = stats.topDeals[0]!;
  752 |       const row = analytics.topDealRow(top.name);
  753 |       await expect(row).toBeVisible();
  754 |       await expect(row).toContainText("#1");
  755 |       await expect(row).toContainText(String(top.timesUsed));
  756 |     } else {
  757 |       await expect(analytics.noUsageYet()).toBeVisible();
  758 |     }
  759 |     // Our fresh deals never used → not in the top table.
  760 |     await expect(analytics.topDealRow(N.plain)).toHaveCount(0);
  761 |   });
  762 | 
  763 |   test("TC-364: AI Deal Generator smoke — stepper, server questionnaire, Generate gated on the required answers (never clicked)", async ({
  764 |     ownerPage,
  765 |   }) => {
  766 |     await allure.description(
  767 |       "Presence-only: the paid POST /api/deals/ai/generate is never triggered. Asserts the 3-step stepper, " +
  768 |         "the questionnaire radios rendered from the public GET /api/deals/ai/questions, that Meal Type is " +
  769 |         "disabled (defaults to All Day), and that 'Generate Deals' is disabled until audience + price range " +
  770 |         "are picked."
  771 |     );
  772 |     const dealsPage = createOwnerDealsPage(ownerPage);
  773 |     await dealsPage.gotoTab(restaurantId, "ai-deals");
  774 |     await expect(
  775 |       ownerPage.getByRole("heading", { name: "AI Deal Generator", level: 1 })
  776 |     ).toBeVisible({ timeout: 15_000 });
  777 |     for (const step of ["Questionnaire", "Generate Deals", "Review & Create"])
  778 |       await expect(
  779 |         ownerPage.getByText(step, { exact: true }).first()
  780 |       ).toBeVisible();
  781 |     const generate = ownerPage.getByRole("button", { name: "Generate Deals" });
  782 |     await expect(generate).toBeDisabled();
  783 |     await expect(
  784 |       ownerPage.getByRole("radio", { name: /^All Day/ })
  785 |     ).toBeDisabled();
  786 |     await ownerPage.getByRole("radio", { name: /^Family/ }).check();
  787 |     await expect(generate).toBeDisabled();
  788 |     await ownerPage.getByRole("radio", { name: /^Mid-Range/ }).check();
  789 |     await expect(generate).toBeEnabled();
```