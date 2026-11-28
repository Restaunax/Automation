# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/34-sales-tax-ui.spec.ts >> Sales tax and service fee (UI) >> TC-1077: a 3% 'Kitchen fee' — the form shows what $20 pays, saves once, and survives a reload
- Location: tests/dashboard/owner/34-sales-tax-ui.spec.ts:256:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('dialog').last()
Expected substring: "Start charging a service fee?"
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" with timeout 10000ms
  - waiting for getByRole('dialog').last()

```

```yaml
- banner:
  - text: LOCATION Automation Owner2 Store 70263051 — Miami — Store Settings
  - paragraph: Automation Owner2 Store 70263051
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
  - paragraph: "Managing: Automation Owner2 Store 70263051"
  - heading "Restaurant Settings" [level=1]
  - tablist:
    - tab "Ordering & hours"
    - tab "Fees & tips" [selected]
    - tab "Dine-in"
    - tab "Sales tax"
    - tab "Connections"
  - heading "Tips & gratuity" [level=6]
  - paragraph: How tips are suggested to your guests, and the gratuity added automatically for large parties.
  - paragraph: Suggested tip percentages
  - button "More info"
  - text: Percentages to suggest
  - combobox "15%, 18%, 20%"
  - paragraph: Pick up to six. These print on guest checks and show on the customer screen.
  - switch "Allow a custom tip amount" [checked]
  - text: Allow a custom tip amount Calculate tip on
  - combobox "Subtotal (before tax)"
  - group "Where guests are asked for a tip":
    - text: Where guests are asked for a tip
    - switch "On the customer screen at the counter"
    - text: On the customer screen at the counter
    - switch "On the self-order kiosk" [checked]
    - text: On the self-order kiosk
    - paragraph: The printed guest check and card slip always show your suggested tips.
  - heading "Fees at checkout" [level=6]
  - paragraph: Two optional charges on top of the food. Use a service fee when every order should carry one. Use auto-gratuity when large dine-in parties should pay a set tip.
  - heading "On a $50.00 order" [level=6]
  - paragraph: Guests pay the food, tax and any tip they choose. No extra fees are on.
  - text: Tips guests add themselves always go to your staff.
  - heading "Sales tax on these fees" [level=6]
  - heading "Your state's rule" [level=6]
  - text: "Not confirmed yet: check it before relying on it"
  - paragraph: Not taxable when it is a gratuity paid in full to staff. Taxable when the house keeps it.
  - text: "Source: State (FL), checked Oct 31, 2026."
  - link "Read the source":
    - /url: https://www.flrules.org/gateway/ruleNo.asp?id=12A-1.0011
  - text: This is a suggestion that no accountant has confirmed yet. Nothing changes at checkout until you confirm it.
  - paragraph: "Service fee: taxed today · your state's rule says taxed (the restaurant keeps it)"
  - paragraph: "Auto-gratuity for large parties: taxed today · your state's rule says taxed (the restaurant keeps it)"
  - alert: Please confirm your state's rule. Until you do, each fee is taxed exactly as you set it below.
  - button "Confirm this rule"
  - heading "Service fee" [level=6]
  - paragraph: A percentage on every qualifying order, cash or card. You choose which orders and who keeps it.
  - switch "Add a service fee More info" [checked]
  - paragraph: Add a service fee
  - button "More info"
  - paragraph: Applied automatically to the order types and channels below. Table checks get it when they open and it follows the food as items are added or the check is split.
  - text: Percent of the order
  - spinbutton "Percent of the order": "3"
  - paragraph: "%"
  - paragraph: A $20.00 order pays $0.60.
  - text: Only on orders of at least (optional)
  - paragraph: $
  - spinbutton "Only on orders of at least (optional)"
  - paragraph: Leave empty to charge it on every order. Measured after discounts, before tax.
  - text: Name on receipts and checkout
  - textbox "Name on receipts and checkout": Kitchen fee
  - paragraph: Guests see “Kitchen fee”. Don't call it a tip or a gratuity.
  - group "Order types":
    - text: Order types
    - checkbox "Dine-in" [checked]
    - text: Dine-in
    - checkbox "Pickup" [checked]
    - text: Pickup
    - checkbox "Delivery" [checked]
    - text: Delivery
  - group "Where orders are placed":
    - text: Where orders are placed
    - checkbox "Register and table checks" [checked]
    - text: Register and table checks
    - checkbox "Kiosk" [checked]
    - text: Kiosk
    - checkbox "Website and app" [checked]
    - text: Website and app
    - checkbox "Phone ordering" [checked]
    - text: Phone ordering
  - text: Note shown at checkout and printed on receipts
  - textbox "Note shown at checkout and printed on receipts":
    - /placeholder: A 3% service fee is added to every order. It is not a tip.
  - paragraph: Optional, up to 200 characters.
  - text: Who keeps it
  - paragraph: The restaurant keeps it.
  - paragraph: To pay it to your staff instead, you need RestauNax Team or RestauNax Payroll.
  - 'img "Add-on: schedule your team and split tips"'
  - paragraph: Schedule your team and split tips in one place.
  - button "See what RestauNax Team does"
  - switch "Charge sales tax on it More info" [checked]
  - paragraph: Charge sales tax on it
  - button "More info"
  - alert: Cash and card guests always pay the same fee. This is separate from passing the card processing fee to customers.
  - alert: "Tell guests before they order: many states (California, for example) require a mandatory fee to be shown on your menu or posted in the restaurant, not only on the receipt."
  - button "Save service fee"
  - button "Discard changes"
  - separator
  - heading "Auto-gratuity for large parties" [level=6]
  - paragraph: A set tip added to dine-in checks for large parties. Needs table service.
  - paragraph: Turn on Table service in the Dine-in tab to add an automatic gratuity for large parties.
  - paragraph: "RestauNax setup: your day closes at 4 AM, time zone From the address. Set by RestauNax."
  - button "Show all"
  - link "Contact support":
    - /url: mailto:support@restaunax.com
  - heading "Recent changes" [level=6]
  - paragraph: Who changed which setting, and when.
  - text: Area
  - combobox "Fees & tips"
  - paragraph: No changes recorded yet.
- button "Open chat"
```

```
Error: page.waitForResponse: Target page, context or browser has been closed
```

# Test source

```ts
  172 |     await dialog.getByRole("spinbutton", { name: "Rate (%)" }).fill(percent);
  173 |     await dialog.getByRole("button", { name: "Save" }).click();
  174 |     await expect(dialog).toBeHidden();
  175 |   };
  176 | 
  177 |   test("TC-1074: the first rate, then Alcohol 9% straight after — Alcohol is not made the default", async () => {
  178 |     await openSalesTax();
  179 |     await addRate(null, "6");
  180 |     // Straight away, as an owner setting up two rates does.
  181 |     await addRate("Alcohol", "9");
  182 |     await expectSeenByUser(
  183 |       page().getByText("Alcohol (9%) saved."),
  184 |       '"Alcohol (9%) saved."'
  185 |     );
  186 |     await expect(rateRow("Alcohol")).toContainText("9%");
  187 |     await expect(page().getByTestId("recent-changes")).toContainText(
  188 |       /added sales tax rate Alcohol \(9%\)/,
  189 |       { timeout: 15_000 }
  190 |     );
  191 |     await expect(rateRow("Sales tax")).toContainText("6%");
  192 |     await expect(rateRow("Sales tax")).toContainText("Default");
  193 |     await expect(rateRow("Alcohol")).not.toContainText("Default");
  194 |     // The default can't be removed; the extra rate can.
  195 |     await expect(
  196 |       rateRow("Sales tax").getByRole("button", { name: "Remove rate" })
  197 |     ).toHaveCount(0);
  198 |     await expect(
  199 |       rateRow("Alcohol").getByRole("button", { name: "Remove rate" })
  200 |     ).toBeVisible();
  201 |   });
  202 | 
  203 |   test("TC-1075: drinks taxed at Alcohol, water tax-free — by category and by item, kept after a reload", async () => {
  204 |     await openSalesTax();
  205 |     await expect(menuSave()).toBeDisabled();
  206 |     await pick(
  207 |       page().getByRole("combobox", { name: `Tax for ${drinks}` }),
  208 |       "Alcohol (9%)"
  209 |     );
  210 |     await page().getByRole("button", { name: drinks, exact: true }).click();
  211 |     await pick(
  212 |       page().getByRole("combobox", { name: "Tax for Water" }),
  213 |       "Tax-free"
  214 |     );
  215 |     await expect(menuSave()).toBeEnabled();
  216 |     await menuSave().click();
  217 |     await expectSeenByUser(
  218 |       page().getByText(/saved/i).first(),
  219 |       "the menu tax saved message"
  220 |     );
  221 | 
  222 |     await openSalesTax();
  223 |     await expect(
  224 |       page().getByRole("combobox", { name: `Tax for ${drinks}` })
  225 |     ).toHaveText("Alcohol (9%)");
  226 |     await expect(
  227 |       page().getByRole("combobox", { name: `Tax for ${food}` })
  228 |     ).toHaveText("Default (Sales tax)");
  229 |     await page().getByRole("button", { name: drinks, exact: true }).click();
  230 |     await expect(
  231 |       page().getByRole("combobox", { name: "Tax for Water" })
  232 |     ).toHaveText("Tax-free");
  233 |     await expect(
  234 |       page().getByRole("combobox", { name: "Tax for Beer" })
  235 |     ).toHaveText("Same as its category");
  236 |     await expect(page().getByText("Taxed at Alcohol").first()).toBeVisible();
  237 |     await expect(page().getByText("Not taxed").first()).toBeVisible();
  238 |   });
  239 | 
  240 |   test("TC-1076: changing a rate's percent asks first; Cancel keeps 9%", async () => {
  241 |     await openSalesTax();
  242 |     await rateRow("Alcohol").getByRole("button", { name: "Edit rate" }).click();
  243 |     const dialog = activeDialog(page());
  244 |     await expect(dialog).toHaveAccessibleName("Edit tax rate");
  245 |     await dialog.getByRole("spinbutton", { name: "Rate (%)" }).fill("10");
  246 |     await dialog.getByRole("button", { name: "Save" }).click();
  247 |     const confirm = activeDialog(page());
  248 |     await expect(confirm).toContainText("Alcohol");
  249 |     await expectHumanText(confirm, "the change-rate confirmation");
  250 |     await expect(confirm).toContainText("Change Alcohol?");
  251 |     await confirm.getByRole("button", { name: "Cancel" }).click();
  252 |     await openSalesTax();
  253 |     await expect(rateRow("Alcohol")).toContainText("9%");
  254 |   });
  255 | 
  256 |   test("TC-1077: a 3% 'Kitchen fee' — the form shows what $20 pays, saves once, and survives a reload", async () => {
  257 |     await page().goto(portal("?tab=Store+Settings&settingsTab=fees"), {
  258 |       waitUntil: "domcontentloaded",
  259 |     });
  260 |     const on = page().getByRole("switch", { name: /Add a service fee/ });
  261 |     await expect(on).toBeVisible({ timeout: 25_000 });
  262 |     await on.click();
  263 |     await page()
  264 |       .getByRole("spinbutton", { name: "Percent of the order" })
  265 |       .fill("3");
  266 |     await expect(page().getByText("A $20.00 order pays $0.60.")).toBeVisible();
  267 |     await page()
  268 |       .getByRole("textbox", { name: "Name on receipts and checkout" })
  269 |       .fill("Kitchen fee");
  270 |     await expect(page().getByText("Guests see “Kitchen fee”.")).toBeVisible();
  271 | 
> 272 |     const saved = page().waitForResponse(
      |                          ^ Error: page.waitForResponse: Target page, context or browser has been closed
  273 |       (r) =>
  274 |         r.request().method() === "PUT" &&
  275 |         r.url().includes(`/api/restaurantId/${restaurantId}/settings`)
  276 |     );
  277 |     await page().getByRole("button", { name: "Save service fee" }).click();
  278 |     const confirm = activeDialog(page());
  279 |     await expect(confirm).toContainText("Start charging a service fee?");
  280 |     await expect(confirm).toContainText(
  281 |       "Every qualifying order will include a 3% service fee from now on."
  282 |     );
  283 |     await confirm
  284 |       .getByRole("button", { name: "Turn on the service fee" })
  285 |       .click();
  286 |     expect((await saved).status()).toBe(200);
  287 |     await expectSeenByUser(
  288 |       page().getByText("Service fee saved").first(),
  289 |       "'Service fee saved'"
  290 |     );
  291 | 
  292 |     await page().reload({ waitUntil: "domcontentloaded" });
  293 |     await expect(
  294 |       page().getByRole("switch", { name: /Add a service fee/ })
  295 |     ).toBeChecked({ timeout: 25_000 });
  296 |     await expect(
  297 |       page().getByRole("spinbutton", { name: "Percent of the order" })
  298 |     ).toHaveValue("3");
  299 |     await expect(
  300 |       page().getByRole("textbox", { name: "Name on receipts and checkout" })
  301 |     ).toHaveValue("Kitchen fee");
  302 |   });
  303 | 
  304 |   test("TC-1078: an online order is priced by those settings — $30.00 food, $0.90 fee, $1.92 tax", async () => {
  305 |     const line = (key: keyof typeof items, quantity: number) => ({
  306 |       menuItemId: items[key].id,
  307 |       menuItemName: items[key].name,
  308 |       quantity,
  309 |       price: items[key].price,
  310 |     });
  311 |     const order = await placePaidOnlineOrder(pk, restaurantId, {
  312 |       orderType: "PICKUP",
  313 |       subtotal: 30,
  314 |       tax: 1.92,
  315 |       tip: 0,
  316 |       deliveryFee: 0,
  317 |       serviceFee: 0.9,
  318 |       total: 32.82,
  319 |       customerEmail: `auto-guest-${runId}@restaunax-test.com`,
  320 |       customerPhone: "5555550123",
  321 |       firstName: "Gia",
  322 |       lastName: "Guest",
  323 |       orderItems: [line("burger", 2), line("beer", 1), line("water", 1)],
  324 |     });
  325 |     const full = await getOrderFullRaw(ownerToken, order.id);
  326 |     expect(full.ok, JSON.stringify(full.data)).toBe(true);
  327 |     const o = full.data as Rec;
  328 |     // Burgers $20 × 6% = $1.20; the beer $8 × 9% = $0.72; water tax-free;
  329 |     // the fee (taxable by default since Stage 3) $0.90 × 6% = $0.05.
  330 |     expect(o).toMatchObject({
  331 |       subtotal: 30,
  332 |       serviceFee: 0.9,
  333 |       tax: 1.97,
  334 |       total: 32.87,
  335 |     });
  336 |   });
  337 | 
  338 |   test("TC-1079: the sales tax report for today agrees with the order, rate by rate", async () => {
  339 |     await openSalesTax();
  340 |     const today = new Intl.DateTimeFormat("en-CA", {
  341 |       timeZone: "America/New_York",
  342 |     }).format(new Date());
  343 |     const yesterday = new Intl.DateTimeFormat("en-CA", {
  344 |       timeZone: "America/New_York",
  345 |     }).format(new Date(Date.now() - 86_400_000));
  346 |     // One date at a time, each after its report has answered: the page
  347 |     // shows whichever report answers LAST, so two fills in a row could leave
  348 |     // the From-only report (an empty day) on screen.
  349 |     const reportFor = (start: string, end: string) =>
  350 |       page().waitForResponse(
  351 |         (r) =>
  352 |           r.url().includes(`/report?startDate=${start}&endDate=${end}`) &&
  353 |           r.request().method() === "GET"
  354 |       );
  355 |     const fromLoaded = reportFor(yesterday, "");
  356 |     await page().getByRole("textbox", { name: "From" }).fill(yesterday);
  357 |     await fromLoaded;
  358 |     const toLoaded = reportFor(yesterday, today);
  359 |     await page().getByRole("textbox", { name: "To" }).fill(today);
  360 |     await toLoaded;
  361 |     // Tax due (taxable × rate) comes first; "collected" is no longer
  362 |     // labelled "you owe this" (RestauNax audit W4:H6).
  363 |     await expect(
  364 |       reportLine("Tax due \\(taxable sales × rate\\)")
  365 |     ).toContainText("$1.97", { timeout: 20_000 });
  366 |     await expect(reportLine("Tax collected")).toContainText("$1.97");
  367 |     await expect(
  368 |       reportLine("Net tax collected \\(after refunds\\)")
  369 |     ).toContainText("$1.97");
  370 |     await expect(
  371 |       reportLine("Difference \\(collected minus due\\)")
  372 |     ).toContainText("$0.00");
```