# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/37-sales-tax-depth-ui.spec.ts >> Sales tax depth (UI) @tax-depth >> TC-1617: the report covers business days or calendar dates, and says which
- Location: tests/dashboard/owner/37-sales-tax-depth-ui.spec.ts:202:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Dates are calendar days, midnight to midnight.')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('Dates are calendar days, midnight to midnight.')

```

```yaml
- banner:
  - text: LOCATION Automation Owner2 Store 9d91d149 — Miami — Books & taxes
  - paragraph: Automation Owner2 Store 9d91d149
  - text: Miami, FL
  - button "Account settings": A
  - button "Select Language":
    - img
    - text: EN
  - button
- navigation "mailbox folders":
  - button "Collapse sidebar"
  - button "Today":
    - paragraph: Today
  - button "Analytics":
    - paragraph: Analytics
  - button "Orders":
    - paragraph: Orders
  - button "Menu":
    - paragraph: Menu
  - button "Customers":
    - paragraph: Customers
  - button "Billing":
    - paragraph: Billing
  - button "Image Library":
    - paragraph: Image Library
  - button "Store Settings":
    - paragraph: Store Settings
  - button "Store Operations":
    - paragraph: Store Operations
  - button "Job Applications":
    - paragraph: Job Applications
  - 'button "Menu TVs Add-on: TV menu boards from your menu"':
    - paragraph: Menu TVs
    - 'img "Add-on: TV menu boards from your menu"'
  - button "Restaurant Staff":
    - paragraph: Restaurant Staff
  - button "Books & taxes":
    - paragraph: Books & taxes
  - 'button "RestauNax Voice Add-on: AI answers your phone"':
    - paragraph: RestauNax Voice
    - 'img "Add-on: AI answers your phone"'
  - button "Google reviews":
    - paragraph: Google reviews
  - button "Promotions":
    - paragraph: Promotions
  - button "Gift cards":
    - paragraph: Gift cards
  - button "Supply Shop":
    - paragraph: Supply Shop
  - button "Social Media":
    - paragraph: Social Media
  - button "RestauNax Products":
    - paragraph: RestauNax Products
  - button "Owner Settings":
    - paragraph: Owner Settings
- main:
  - paragraph: "Managing: Automation Owner2 Store 9d91d149"
  - heading "Books & taxes" [level=5]
  - paragraph: Your numbers for any period, and a package for your accountant.
  - tablist:
    - tab "Package for your accountant"
    - tab "Sales summary"
    - tab "Sales tax report" [selected]
    - tab "Payouts"
    - tab "Your accountant"
    - 'tab "QuickBooks & Xero Add-on: daily sales sent to your books"':
      - text: QuickBooks & Xero
      - 'img "Add-on: daily sales sent to your books"'
    - 'tab "Monthly send Add-on: daily sales sent to your books"':
      - text: Monthly send
      - 'img "Add-on: daily sales sent to your books"'
    - 'tab "Year end Add-on: daily sales sent to your books"':
      - text: Year end
      - 'img "Add-on: daily sales sent to your books"'
    - 'tab "Tax calendar Add-on: daily sales sent to your books"':
      - text: Tax calendar
      - 'img "Add-on: daily sales sent to your books"'
  - heading "Sales tax report" [level=6]
  - paragraph: "Figures to help prepare your return: gross receipts, what is taxable and what isn't, tax by rate, and tax-exempt sales. Check them with your accountant before you file. A refund's tax comes off the period the refund was made in. Tax that Uber Eats or DoorDash collected is shown but isn't yours to pay."
  - text: From
  - textbox "From": 2026-10-01
  - text: To
  - textbox "To": 2026-10-31
  - text: Dates
  - group "Dates":
    - button "Business days"
    - button "Calendar dates" [pressed]
  - button "Download CSV"
  - paragraph: "Dates are business days: each runs from 4:00 to 4:00 the next morning."
  - table:
    - rowgroup:
      - row "Gross receipts":
        - cell "Gross receipts"
      - row "Food and drink $0.00":
        - cell "Food and drink"
        - cell "$0.00"
      - row "Gross receipts $0.00":
        - cell "Gross receipts"
        - cell "$0.00"
      - row "Discounts $0.00":
        - cell "Discounts"
        - cell "$0.00"
      - row "Net sales $0.00":
        - cell "Net sales"
        - cell "$0.00"
      - row "Deductions":
        - cell "Deductions"
      - row "Non-taxable sales $0.00":
        - cell "Non-taxable sales"
        - cell "$0.00"
      - row "Tax-exempt sales $0.00":
        - cell "Tax-exempt sales"
        - cell "$0.00"
      - row "Taxable sales $0.00":
        - cell "Taxable sales"
        - cell "$0.00"
      - row "Tax":
        - cell "Tax"
      - row "Tax due (taxable sales × rate) $0.00":
        - cell "Tax due (taxable sales × rate)"
        - cell "$0.00"
      - row "Tax collected $0.00":
        - cell "Tax collected"
        - cell "$0.00"
      - row "Refunds issued $0.00":
        - cell "Refunds issued"
        - cell "$0.00"
      - row "Tax refunded $0.00":
        - cell "Tax refunded"
        - cell "$0.00"
      - row "Net tax collected (after refunds) $0.00":
        - cell "Net tax collected (after refunds)"
        - cell "$0.00"
      - row "Difference (collected minus due) $0.00":
        - cell "Difference (collected minus due)"
        - cell "$0.00"
      - row "Tax remitted by marketplaces (not owed) $0.00":
        - cell "Tax remitted by marketplaces (not owed)"
        - cell "$0.00"
  - heading "By rate" [level=6]
  - table:
    - rowgroup:
      - row "Rate Taxable amount Tax Tax refunded Net tax Tax due Difference":
        - columnheader "Rate"
        - columnheader "Taxable amount"
        - columnheader "Tax"
        - columnheader "Tax refunded"
        - columnheader "Net tax"
        - columnheader "Tax due"
        - columnheader "Difference"
    - rowgroup
- button "Open chat"
```

# Test source

```ts
  108 |     });
  109 |     if (rate.status !== 201)
  110 |       throw new Error(
  111 |         `[sales-tax-depth-ui] rate: ${JSON.stringify(rate.data)}`
  112 |       );
  113 |     session = await loginViaUi(browser, tenant.email, tenant.password);
  114 |   });
  115 | 
  116 |   test.afterAll(async () => {
  117 |     if (adminToken && restaurantId)
  118 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  119 |     if (session) await session.context.close().catch(() => {});
  120 |   });
  121 | 
  122 |   test.beforeEach(async () => {
  123 |     await allure.label("feature", "Sales tax depth");
  124 |     await allure.label("severity", "normal");
  125 |     requireRelease(
  126 |       "taxDepthStage7",
  127 |       await probeTaxDepthStage7(ownerToken, restaurantId)
  128 |     );
  129 |     await page().setViewportSize(DESKTOP);
  130 |   });
  131 | 
  132 |   test("TC-1613: Check your rate — the default rate next to the reference, and 'My rates are right' records the check", async () => {
  133 |     await openSalesTax();
  134 |     const card = section("Check your rate");
  135 |     await expect(card).toBeVisible();
  136 |     await expect(card).toContainText("8%");
  137 |     await card.getByRole("button", { name: "My rates are right" }).click();
  138 |     await expectSeenByUser(
  139 |       page().getByText("Thanks. Your rates are marked as checked."),
  140 |       '"Thanks. Your rates are marked as checked."'
  141 |     );
  142 |     const check = await taxRaw(ownerToken, restaurantId, "GET", "/rate-check");
  143 |     expect(
  144 |       ((check.data.data as Rec).defaultRate as Rec).confirmedAt
  145 |     ).toBeTruthy();
  146 |   });
  147 | 
  148 |   test("TC-1614: schedule a new rate for a date — listed under Scheduled rate changes, the rate itself unchanged; cancel removes it", async () => {
  149 |     await openSalesTax();
  150 |     const changes = section("Scheduled rate changes");
  151 |     await changes.getByRole("button", { name: "Schedule a change" }).click();
  152 |     const dialog = activeDialog(page());
  153 |     await dialog.getByRole("spinbutton", { name: "New rate (%)" }).fill("8.5");
  154 |     await dialog.getByLabel("Starts on").fill(localDay(45));
  155 |     await dialog.getByRole("button", { name: "Schedule" }).click();
  156 |     await expect(dialog).toBeHidden();
  157 |     await expect(changes).toContainText("8.5%");
  158 |     // Still 8% today: the rates table's row (the scheduled change is a
  159 |     // "Sales tax 8% → 8.5% …" row of its own) still says Default 8%.
  160 |     await expect(
  161 |       page().getByRole("row", { name: /^Sales tax\b.*Default/ })
  162 |     ).toContainText("8%");
  163 |     await changes.getByRole("button", { name: "Cancel change" }).click();
  164 |     await expect(changes).not.toContainText("8.5%");
  165 |   });
  166 | 
  167 |   test("TC-1615: a rate's business class — 'Packaged beer' filed as 017 shows its class in the rates list", async () => {
  168 |     await openSalesTax();
  169 |     await page().getByRole("button", { name: "Add rate" }).click();
  170 |     const dialog = activeDialog(page());
  171 |     await dialog.getByRole("textbox", { name: "Name" }).fill("Packaged beer");
  172 |     await dialog.getByRole("spinbutton", { name: "Rate (%)" }).fill("8");
  173 |     await dialog.getByRole("textbox", { name: "Business class" }).fill("017");
  174 |     await dialog.getByRole("button", { name: "Save" }).click();
  175 |     await expect(dialog).toBeHidden();
  176 |     await expect(
  177 |       page().getByRole("row", { name: /^Packaged beer\b/ })
  178 |     ).toContainText("017");
  179 |   });
  180 | 
  181 |   test("TC-1616: exemption certificates — add a buyer's certificate; an expired one is flagged", async () => {
  182 |     await openSalesTax();
  183 |     const certs = section("Exemption certificates");
  184 |     await certs.getByRole("button", { name: "Add certificate" }).click();
  185 |     const dialog = activeDialog(page());
  186 |     await dialog.getByRole("textbox", { name: "Buyer" }).fill(buyer);
  187 |     // The Reason select's FormLabel points at the select's div, which a
  188 |     // label can't name: the combobox is named by its value. Open it by id.
  189 |     await dialog.locator("#tax-cert-reason").click();
  190 |     await page().getByRole("option", { name: "Government" }).click();
  191 |     await dialog
  192 |       .getByRole("textbox", { name: "Certificate number" })
  193 |       .fill(`GOV-${runId.slice(-6)}`);
  194 |     await dialog.getByLabel("Expiry date").fill(localDay(-5));
  195 |     await dialog.getByRole("button", { name: "Save" }).click();
  196 |     await expect(dialog).toBeHidden();
  197 |     const row = certs.getByRole("row", { name: new RegExp(buyer) });
  198 |     await expect(row).toContainText("Government");
  199 |     await expect(row).toContainText(/expired/i);
  200 |   });
  201 | 
  202 |   test("TC-1617: the report covers business days or calendar dates, and says which", async () => {
  203 |     await openSalesTaxReport();
  204 |     const dates = page().getByRole("group", { name: "Dates" });
  205 |     await dates.getByRole("button", { name: "Calendar dates" }).click();
  206 |     await expect(
  207 |       page().getByText("Dates are calendar days, midnight to midnight.")
> 208 |     ).toBeVisible();
      |       ^ Error: expect(locator).toBeVisible() failed
  209 |     await dates.getByRole("button", { name: "Business days" }).click();
  210 |     await expect(page().getByText(/Dates are business days/)).toBeVisible();
  211 |   });
  212 | });
  213 | 
```