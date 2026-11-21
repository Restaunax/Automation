# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/34-sales-tax-ui.spec.ts >> Sales tax and service fee (UI) >> TC-1079: the sales tax report for today agrees with the order, rate by rate
- Location: tests/dashboard/owner/34-sales-tax-ui.spec.ts:338:7

# Error details

```
TimeoutError: page.waitForResponse: Timeout 15000ms exceeded while waiting for event "response"
```

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('textbox', { name: 'From' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - generic [ref=e9]:
            - img [ref=e10]
            - generic [ref=e12]: LOCATION
          - generic "Automation Owner2 Store 10c516c2 — Miami — Store Settings" [ref=e13]
        - generic [ref=e15]:
          - generic [ref=e17]:
            - img [ref=e18]
            - generic [ref=e20]:
              - paragraph [ref=e21]: Automation Owner2 Store 10c516c2
              - generic [ref=e22]: Miami, FL
          - button "Account settings" [ref=e24] [cursor=pointer]:
            - generic [ref=e25]: A
          - button "Select Language" [ref=e27] [cursor=pointer]:
            - img [ref=e29]
            - text: EN
          - button [ref=e35] [cursor=pointer]:
            - img [ref=e36]
    - navigation "mailbox folders" [ref=e38]:
      - generic [ref=e40]:
        - button "Collapse sidebar" [ref=e42] [cursor=pointer]:
          - img [ref=e43]
        - generic [ref=e46]:
          - button "Today" [ref=e47] [cursor=pointer]:
            - img [ref=e49]
            - paragraph [ref=e51]: Today
          - button "Analytics" [ref=e52] [cursor=pointer]:
            - img [ref=e54]
            - paragraph [ref=e56]: Analytics
          - button "Orders" [ref=e57] [cursor=pointer]:
            - img [ref=e59]
            - paragraph [ref=e61]: Orders
          - button "Menu" [ref=e62] [cursor=pointer]:
            - img [ref=e64]
            - paragraph [ref=e66]: Menu
          - button "Customers" [ref=e67] [cursor=pointer]:
            - img [ref=e69]
            - paragraph [ref=e71]: Customers
          - button "Billing" [ref=e72] [cursor=pointer]:
            - img [ref=e74]
            - paragraph [ref=e76]: Billing
          - button "Image Library" [ref=e77] [cursor=pointer]:
            - img [ref=e79]
            - paragraph [ref=e81]: Image Library
          - button "Store Settings" [ref=e82] [cursor=pointer]:
            - img [ref=e84]
            - paragraph [ref=e86]: Store Settings
          - button "Store Operations" [ref=e88] [cursor=pointer]:
            - img [ref=e90]
            - paragraph [ref=e92]: Store Operations
            - img [ref=e94]
          - button "Job Applications" [ref=e96] [cursor=pointer]:
            - img [ref=e98]
            - paragraph [ref=e100]: Job Applications
          - 'button "Menu TVs Add-on: TV menu boards from your menu" [ref=e101] [cursor=pointer]':
            - img [ref=e103]
            - paragraph [ref=e105]: Menu TVs
            - 'img "Add-on: TV menu boards from your menu" [ref=e107]':
              - img [ref=e108]
          - button "Restaurant Staff" [ref=e110] [cursor=pointer]:
            - img [ref=e112]
            - paragraph [ref=e114]: Restaurant Staff
          - button "Books & taxes" [ref=e115] [cursor=pointer]:
            - img [ref=e117]
            - paragraph [ref=e119]: Books & taxes
          - 'button "RestauNax Voice Add-on: AI answers your phone" [ref=e120] [cursor=pointer]':
            - img [ref=e122]
            - paragraph [ref=e125]: RestauNax Voice
            - 'img "Add-on: AI answers your phone" [ref=e127]':
              - img [ref=e128]
          - button "Google reviews" [ref=e130] [cursor=pointer]:
            - img [ref=e132]
            - paragraph [ref=e134]: Google reviews
          - button "Promotions" [ref=e136] [cursor=pointer]:
            - img [ref=e138]
            - paragraph [ref=e140]: Promotions
            - img [ref=e142]
          - button "Supply Shop" [ref=e144] [cursor=pointer]:
            - img [ref=e146]
            - paragraph [ref=e148]: Supply Shop
          - button "Social Media" [ref=e150] [cursor=pointer]:
            - img [ref=e152]
            - paragraph [ref=e154]: Social Media
            - img [ref=e156]
          - button "RestauNax Products" [ref=e158] [cursor=pointer]:
            - img [ref=e160]
            - paragraph [ref=e162]: RestauNax Products
        - button "Owner Settings" [ref=e165] [cursor=pointer]:
          - img [ref=e167]
          - paragraph [ref=e170]: Owner Settings
    - main [ref=e171]:
      - generic [ref=e173]:
        - img [ref=e174]
        - paragraph [ref=e176]:
          - generic [ref=e177]: "Managing:"
          - text: Automation Owner2 Store 10c516c2
      - generic [ref=e179]:
        - generic [ref=e180]:
          - img [ref=e181]
          - heading "Restaurant Settings" [level=1] [ref=e183]
        - tablist [ref=e187]:
          - tab "Ordering & hours" [ref=e188] [cursor=pointer]:
            - img [ref=e189]
            - text: Ordering & hours
          - tab "Fees & tips" [ref=e191] [cursor=pointer]:
            - img [ref=e192]
            - text: Fees & tips
          - tab "Dine-in" [ref=e194] [cursor=pointer]:
            - img [ref=e195]
            - text: Dine-in
          - tab "Sales tax" [selected] [ref=e197] [cursor=pointer]:
            - img [ref=e198]
            - text: Sales tax
          - tab "Connections" [ref=e201] [cursor=pointer]:
            - img [ref=e202]
            - text: Connections
        - generic [ref=e204]:
          - generic [ref=e206]:
            - generic [ref=e207]:
              - heading "Tax rates" [level=6] [ref=e208]
              - button "Add rate" [ref=e209] [cursor=pointer]
            - paragraph [ref=e210]: Your combined sales tax rate is the default for everything. Add another rate only where your state or city taxes something differently, for example alcohol or liquor by the drink. Changing a rate never changes past orders.
            - table [ref=e211]:
              - rowgroup [ref=e212]:
                - row "Name Rate (%)" [ref=e213]:
                  - columnheader "Name" [ref=e214]
                  - columnheader "Rate (%)" [ref=e215]
                  - columnheader [ref=e216]
              - rowgroup [ref=e217]:
                - row "Sales tax Default 6% Edit rate Split by jurisdiction" [ref=e218]:
                  - cell "Sales tax Default" [ref=e219]:
                    - text: Sales tax
                    - generic [ref=e221]: Default
                  - cell "6%" [ref=e222]
                  - cell "Edit rate Split by jurisdiction" [ref=e223]:
                    - button "Edit rate" [ref=e224] [cursor=pointer]:
                      - img [ref=e225]
                    - button "Split by jurisdiction" [ref=e227] [cursor=pointer]:
                      - img [ref=e228]
                - row "Alcohol 9% Edit rate Split by jurisdiction Remove rate" [ref=e230]:
                  - cell "Alcohol" [ref=e231]
                  - cell "9%" [ref=e232]
                  - cell "Edit rate Split by jurisdiction Remove rate" [ref=e233]:
                    - button "Edit rate" [ref=e234] [cursor=pointer]:
                      - img [ref=e235]
                    - button "Split by jurisdiction" [ref=e237] [cursor=pointer]:
                      - img [ref=e238]
                    - button "Remove rate" [ref=e240] [cursor=pointer]:
                      - img [ref=e241]
          - generic [ref=e244]:
            - heading "Check your rate" [level=2] [ref=e245]
            - paragraph [ref=e246]: We compare your default rate with our reference file and, if Avalara is connected, Avalara's rate for your address. Nothing here changes your rate.
            - generic [ref=e247]:
              - paragraph [ref=e248]: "You charge 6%. Our file has 7% for FL (Not confirmed yet: check it with your state)."
              - alert [ref=e249]:
                - img [ref=e251]
                - generic [ref=e253]: Your default rate is 6%; the FL rate on our file is 7%. Check it with your state before relying on either.
              - button "My rates are right" [ref=e255] [cursor=pointer]
            - generic [ref=e256]:
              - generic [ref=e257]:
                - heading "Scheduled rate changes" [level=3] [ref=e258]
                - button "Schedule a change" [ref=e259] [cursor=pointer]
              - paragraph [ref=e260]: When your state announces a new rate, schedule it here. It starts at midnight of that day; earlier orders keep the old rate.
              - paragraph [ref=e261]: No changes scheduled.
          - generic [ref=e263]:
            - generic [ref=e264]:
              - heading "Tax by category and item" [level=6] [ref=e265]
              - button "Save" [disabled]
            - paragraph [ref=e266]: Everything is taxed at Sales tax unless you choose otherwise. Set a category, or open it to set single items.
            - paragraph [ref=e267]: "\"Price includes tax\" applies only while the newer tax math is on (Tax math card below)."
            - generic [ref=e268]:
              - heading "MAIN MENU" [level=6] [ref=e269]
              - generic [ref=e271]:
                - button "Food 10c516c2" [ref=e272] [cursor=pointer]:
                  - text: Food 10c516c2
                  - img [ref=e274]
                - generic [ref=e277]:
                  - combobox "Tax for Food 10c516c2" [ref=e278] [cursor=pointer]: Default (Sales tax)
                  - textbox: __inherit__
                  - img
                  - group
              - generic [ref=e280]:
                - button "Drinks 10c516c2" [ref=e281] [cursor=pointer]:
                  - text: Drinks 10c516c2
                  - img [ref=e283]
                - generic [ref=e286]:
                  - combobox "Tax for Drinks 10c516c2" [ref=e287] [cursor=pointer]: Alcohol (9%)
                  - textbox: alcohol
                  - img
                  - group
          - generic [ref=e289]:
            - heading "Delivery fee" [level=6] [ref=e290]
            - paragraph [ref=e291]: Whether sales tax is charged on your delivery fee. You can keep the default or choose for yourself.
            - generic [ref=e292]:
              - alert [ref=e293]:
                - img [ref=e295]
                - generic [ref=e297]: "Please answer: should your delivery fees be taxed? Check with your accountant, then confirm the suggested rule or choose below. Until you answer, checkout keeps doing what it does today."
              - generic [ref=e298]:
                - generic [ref=e299]:
                  - generic [ref=e300]:
                    - heading "Your state's rule" [level=6] [ref=e301]
                    - generic [ref=e303]: "Not confirmed yet: check it before relying on it"
                  - paragraph [ref=e304]: Not taxable when listed separately and the customer could have picked up instead.
                  - generic [ref=e305]:
                    - text: "Source: State (FL), checked Oct 31, 2026."
                    - link "Read the source" [ref=e306] [cursor=pointer]:
                      - /url: https://floridarevenue.com/faq/Pages/FAQDetails.aspx?FAQID=1277
                  - generic [ref=e307]: This is a suggestion that no accountant has confirmed yet. Nothing changes at checkout until you confirm it.
                - button "Confirm this rule" [ref=e309] [cursor=pointer]
              - alert [ref=e310]:
                - img [ref=e312]
                - paragraph [ref=e315]: "Nobody has confirmed your state's delivery-fee rule yet, so checkout keeps doing what it does today: your delivery fees are not taxed. Check with your accountant, then confirm the suggested rule or choose \"Always taxed\" below."
              - generic [ref=e316]:
                - generic [ref=e317]: Delivery fee is taxable
                - generic [ref=e318]:
                  - combobox "Use the current default (not taxed)" [ref=e319] [cursor=pointer]
                  - textbox: STATE
                  - img
                  - group
              - generic [ref=e322]: Delivery fees are not taxed
              - generic [ref=e323]:
                - button "Save" [disabled]
          - generic [ref=e325]:
            - heading "Tax math" [level=6] [ref=e326]
            - paragraph [ref=e327]: "Use the newer tax math: each item in a combo is taxed at its own rate, taxable fees (delivery, service fee, auto-gratuity) are spread across your rates, and items you mark \"Price includes tax\" sell at their menu price with the tax inside."
            - paragraph [ref=e328]: Online ordering changes as soon as you turn this on. Registers change only after their latest update; until then they keep the old math and their sales are never refused for it.
            - generic [ref=e330]:
              - switch "Use the newer tax math" [ref=e333] [cursor=pointer]
              - generic [ref=e336]: Use the newer tax math
          - generic [ref=e338]:
            - heading "Register tax check" [level=6] [ref=e339]
            - paragraph [ref=e340]: The server checks the tax each register charges. By default a sale with the wrong tax is still accepted and recorded. You can let the register refuse it instead, once every register is ready.
            - generic [ref=e341]:
              - generic [ref=e343]: Wrong-tax sales are accepted and recorded
              - generic [ref=e344]:
                - switch "Refuse a sale whose tax is wrong" [ref=e347] [cursor=pointer]
                - generic [ref=e350]: Refuse a sale whose tax is wrong
              - alert [ref=e351]:
                - img [ref=e353]
                - generic [ref=e355]:
                  - paragraph [ref=e356]: "It turns on by itself when these are fixed:"
                  - paragraph [ref=e357]: • No register has made a sale in the last 14 days.
              - generic [ref=e358]: A sale on an older register, or one already paid by card, is never refused.
          - generic [ref=e360]:
            - heading "Sales tax report" [level=6] [ref=e361]
            - paragraph [ref=e362]: The sales tax report is in Books & taxes, next to the package for your accountant.
            - button "Open the report in Books & taxes" [ref=e363] [cursor=pointer]
          - generic [ref=e365]:
            - generic [ref=e366]:
              - heading "Exemption certificates" [level=2] [ref=e367]
              - button "Add certificate" [ref=e368] [cursor=pointer]
            - paragraph [ref=e369]: Keep each tax-exempt buyer's certificate here. The register can pick one for an exempt sale, and your sales tax report lists who bought tax-free and why.
            - paragraph [ref=e370]: No certificates yet.
          - generic [ref=e371]:
            - 'img "Add-on: daily sales sent to your books" [ref=e372]':
              - img [ref=e373]
            - paragraph [ref=e375]: Your books update themselves after every closed day.
            - button "See what RestauNax Books & Taxes does" [ref=e376] [cursor=pointer]
        - generic [ref=e378]:
          - img [ref=e379]
          - paragraph [ref=e384]: "RestauNax setup: your day closes at 4 AM, time zone From the address. Set by RestauNax."
          - generic [ref=e385]:
            - button "Show all" [ref=e386] [cursor=pointer]
            - link "Contact support" [ref=e387] [cursor=pointer]:
              - /url: mailto:support@restaunax.com
        - generic [ref=e388]:
          - generic [ref=e389]:
            - generic [ref=e390]:
              - img [ref=e391]
              - generic [ref=e393]:
                - heading "Recent changes" [level=6] [ref=e394]
                - paragraph [ref=e395]: Who changed which setting, and when.
            - generic [ref=e396]:
              - generic [ref=e397]: Area
              - generic [ref=e398]:
                - combobox "Sales tax" [ref=e399] [cursor=pointer]
                - textbox: salesTax
                - img
                - group
          - list [ref=e400]:
            - listitem [ref=e401]:
              - generic [ref=e402]:
                - generic [ref=e405]: Auto SecondOwner (owner) set Tax on menu items to Alcohol for Drinks 10c516c2
                - paragraph [ref=e406]: 6:35 AM · Sales tax
            - listitem [ref=e407]:
              - generic [ref=e408]:
                - generic [ref=e411]: Auto SecondOwner (owner) set Tax on menu items to tax-free for Water
                - paragraph [ref=e412]: 6:35 AM · Sales tax
            - listitem [ref=e413]:
              - generic [ref=e414]:
                - generic [ref=e417]: Auto SecondOwner (owner) added sales tax rate Alcohol (9%)
                - paragraph [ref=e418]: 6:35 AM · Sales tax
            - listitem [ref=e419]:
              - generic [ref=e420]:
                - generic [ref=e423]: Auto SecondOwner (owner) added sales tax rate Sales tax (6%)
                - paragraph [ref=e424]: 6:35 AM · Sales tax
  - button "Open chat" [ref=e425] [cursor=pointer]:
    - img [ref=e426]
```

# Test source

```ts
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
  272 |     const saved = page().waitForResponse(
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
> 356 |     await page().getByRole("textbox", { name: "From" }).fill(yesterday);
      |                                                         ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
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
  373 |     await expect(page().getByText("you owe this")).toHaveCount(0);
  374 |     await expect(
  375 |       page().getByText("Figures to help prepare your return", { exact: false })
  376 |     ).toBeVisible();
  377 |     // Gross receipts carry the $0.90 Kitchen fee as its own line, taxable
  378 |     // (RestauNax audit W4:C1a): before, the fee appeared nowhere.
  379 |     await expect(reportLine("Food and drink")).toContainText("$30.00");
  380 |     await expect(
  381 |       page().getByRole("row", {
  382 |         name: /^Service fees Taxable \$0\.90 · not taxable \$0\.00 \$0\.90$/,
  383 |       })
  384 |     ).toBeVisible();
  385 |     await expect(reportLine("Gross receipts")).toContainText("$30.90");
  386 |     await expect(reportLine("Net sales")).toContainText("$30.90");
  387 |     // net − non-taxable (water $2.00) − exempt = taxable (fee included).
  388 |     await expect(reportLine("Non-taxable sales")).toContainText("$2.00");
  389 |     await expect(reportLine("Taxable sales")).toContainText("$28.90");
  390 |     // By rate: taxable amount, tax, refunded, net, tax due, difference. The
  391 |     // fee is taxed at the default rate: $20.90 at 6%.
  392 |     await expect(
  393 |       page().getByRole("row", {
  394 |         name: /^Sales tax \(6%\) \$20\.90 \$1\.25 \$0\.00 \$1\.25 \$1\.25 \$0\.00$/,
  395 |       })
  396 |     ).toBeVisible();
  397 |     await expect(
  398 |       page().getByRole("row", {
  399 |         name: /^Alcohol \(9%\) \$8\.00 \$0\.72 \$0\.00 \$0\.72 \$0\.72 \$0\.00$/,
  400 |       })
  401 |     ).toBeVisible();
  402 | 
  403 |     // The same figures from the report API the page reads.
  404 |     const r = await taxRaw(
  405 |       ownerToken,
  406 |       restaurantId,
  407 |       "GET",
  408 |       `/report?startDate=${yesterday}&endDate=${today}`
  409 |     );
  410 |     expect(r.status, JSON.stringify(r.data)).toBe(200);
  411 |     const t = (r.data.data as Rec).totals as unknown as {
  412 |       netSales: number;
  413 |       marketplaceSales: number;
  414 |       nonTaxableSales: number;
  415 |       exemptSales: number;
  416 |       taxableSales: number;
  417 |     };
  418 |     expect(t).toMatchObject({
  419 |       foodSales: 30,
  420 |       serviceFees: 0.9,
  421 |       taxableServiceFees: 0.9,
  422 |       grossSales: 30.9,
  423 |       netSales: 30.9,
  424 |       nonTaxableSales: 2,
  425 |       taxableSales: 28.9,
  426 |       taxDue: 1.97,
  427 |       taxCollected: 1.97,
  428 |     });
  429 |     expect(
  430 |       Math.round(
  431 |         (t.netSales - t.marketplaceSales - t.nonTaxableSales - t.exemptSales) *
  432 |           100
  433 |       )
  434 |     ).toBe(Math.round(t.taxableSales * 100));
  435 |   });
  436 | });
  437 | 
```