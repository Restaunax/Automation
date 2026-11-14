# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/journey/06-the-books.spec.ts >> Journey 6 — the books (partner restaurants, read-only) >> TC-1031: my 2 store — each posted card deposit balances, its bank line is the payout, and Card deposits lists it
- Location: tests/dashboard/journey/06-the-books.spec.ts:324:7

# Error details

```
Error: expect(locator).not.toHaveCount(expected) failed

Locator:  getByRole('row', { name: /^Thu, Nov 12, 2026 \$1889.91 \d+ orders? · \$[\d.]+ in fees Posted/ })
Expected: not 0
Received: 0
Timeout:  20000ms

Call log:
  - Expect "not toHaveCount" with timeout 20000ms
  - waiting for getByRole('row', { name: /^Thu, Nov 12, 2026 \$1889.91 \d+ orders? · \$[\d.]+ in fees Posted/ })
    43 × locator resolved to 0 elements
       - unexpected value "0"

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
          - generic "Books & taxes" [ref=e13]
        - generic [ref=e15]:
          - generic [ref=e18]:
            - combobox [ref=e19] [cursor=pointer]:
              - generic [ref=e20]:
                - img [ref=e21]
                - paragraph [ref=e23]: my 2 store — North Port, Florida
            - textbox: 1f5d8402-18ef-419c-9203-1a5a02ad541c
            - img
            - group
          - button "Account settings" [ref=e25] [cursor=pointer]:
            - generic [ref=e26]: R
          - button "Select Language" [ref=e28] [cursor=pointer]:
            - img [ref=e30]
            - text: EN
          - button [ref=e36] [cursor=pointer]:
            - img [ref=e37]
    - navigation "mailbox folders" [ref=e39]:
      - generic [ref=e41]:
        - button "Collapse sidebar" [ref=e43] [cursor=pointer]:
          - img [ref=e44]
        - generic [ref=e47]:
          - button "Today" [ref=e48] [cursor=pointer]:
            - img [ref=e50]
            - paragraph [ref=e52]: Today
          - button "Analytics" [ref=e53] [cursor=pointer]:
            - img [ref=e55]
            - paragraph [ref=e57]: Analytics
          - button "Orders" [ref=e58] [cursor=pointer]:
            - img [ref=e60]
            - paragraph [ref=e62]: Orders
          - button "Menu" [ref=e63] [cursor=pointer]:
            - img [ref=e65]
            - paragraph [ref=e67]: Menu
          - button "Customers" [ref=e68] [cursor=pointer]:
            - img [ref=e70]
            - paragraph [ref=e72]: Customers
          - button "Billing" [ref=e73] [cursor=pointer]:
            - img [ref=e75]
            - paragraph [ref=e77]: Billing
          - button "Image Library" [ref=e78] [cursor=pointer]:
            - img [ref=e80]
            - paragraph [ref=e82]: Image Library
          - button "Store Settings" [ref=e83] [cursor=pointer]:
            - img [ref=e85]
            - paragraph [ref=e87]: Store Settings
          - button "Store Operations" [ref=e89] [cursor=pointer]:
            - img [ref=e91]
            - paragraph [ref=e93]: Store Operations
            - img [ref=e95]
          - button "Job Applications" [ref=e97] [cursor=pointer]:
            - img [ref=e99]
            - paragraph [ref=e101]: Job Applications
          - 'button "Menu TVs Add-on: TV menu boards from your menu" [ref=e102] [cursor=pointer]':
            - img [ref=e104]
            - paragraph [ref=e106]: Menu TVs
            - 'img "Add-on: TV menu boards from your menu" [ref=e108]':
              - img [ref=e109]
          - button "Restaurant Staff" [ref=e111] [cursor=pointer]:
            - img [ref=e113]
            - paragraph [ref=e115]: Restaurant Staff
          - button "Books & taxes" [ref=e116] [cursor=pointer]:
            - img [ref=e118]
            - paragraph [ref=e120]: Books & taxes
          - 'button "RestauNax Voice Add-on: AI answers your phone" [ref=e121] [cursor=pointer]':
            - img [ref=e123]
            - paragraph [ref=e126]: RestauNax Voice
            - 'img "Add-on: AI answers your phone" [ref=e128]':
              - img [ref=e129]
          - button "Google reviews" [ref=e131] [cursor=pointer]:
            - img [ref=e133]
            - paragraph [ref=e135]: Google reviews
          - button "Promotions" [ref=e137] [cursor=pointer]:
            - img [ref=e139]
            - paragraph [ref=e141]: Promotions
            - img [ref=e143]
          - button "Supply Shop" [ref=e145] [cursor=pointer]:
            - img [ref=e147]
            - paragraph [ref=e149]: Supply Shop
          - button "Social Media" [ref=e151] [cursor=pointer]:
            - img [ref=e153]
            - paragraph [ref=e155]: Social Media
            - img [ref=e157]
          - button "RestauNax Products" [ref=e159] [cursor=pointer]:
            - img [ref=e161]
            - paragraph [ref=e163]: RestauNax Products
        - button "Owner Settings" [ref=e166] [cursor=pointer]:
          - img [ref=e168]
          - paragraph [ref=e171]: Owner Settings
    - main [ref=e172]:
      - generic [ref=e174]:
        - img [ref=e175]
        - paragraph [ref=e177]:
          - generic [ref=e178]: "Managing:"
          - text: my 2 store
      - generic [ref=e180]:
        - heading "Books & taxes" [level=5] [ref=e181]
        - paragraph [ref=e182]: Your daily sales go to your books by themselves. We tell you only when something needs you.
        - generic [ref=e183]:
          - generic:
            - img
          - tablist [ref=e186]:
            - tab "Overview" [ref=e187] [cursor=pointer]:
              - img [ref=e188]
              - text: Overview
            - tab "Books" [ref=e190] [cursor=pointer]:
              - img [ref=e191]
              - text: Books
            - tab "Card deposits" [selected] [ref=e193] [cursor=pointer]:
              - img [ref=e194]
              - text: Card deposits
            - tab "Sales tax" [ref=e196] [cursor=pointer]:
              - img [ref=e197]
              - text: Sales tax
            - tab "Sales summary" [ref=e200] [cursor=pointer]:
              - img [ref=e201]
              - text: Sales summary
            - tab "Tax calendar" [ref=e203] [cursor=pointer]:
              - img [ref=e204]
              - text: Tax calendar
            - tab "Year end" [ref=e206] [cursor=pointer]:
              - img [ref=e207]
              - text: Year end
            - tab "Send to my accountant" [ref=e210] [cursor=pointer]:
              - img [ref=e211]
              - text: Send to my accountant
          - img [ref=e214] [cursor=pointer]
        - generic [ref=e218]:
          - generic [ref=e219]:
            - generic [ref=e220]:
              - heading "Card deposits" [level=6] [ref=e221]
              - paragraph [ref=e222]: Each card deposit Stripe sends to your bank is posted to QuickBooks Online with its fees, so it matches the line on your bank feed in one click.
            - generic [ref=e223]:
              - generic [ref=e224]:
                - generic [ref=e225]: From
                - generic [ref=e227]:
                  - textbox "From" [ref=e228]: 2026-10-10
                  - group
              - generic [ref=e229]:
                - generic [ref=e230]: To
                - generic [ref=e232]:
                  - textbox "To" [ref=e233]: 2026-11-14
                  - group
              - button "Check for new deposits" [ref=e234] [cursor=pointer]
          - generic [ref=e237]:
            - generic [ref=e238]:
              - generic [ref=e239]: File format
              - generic [ref=e240]:
                - combobox "File format" [ref=e241] [cursor=pointer]: RestauNax CSV
                - textbox: restaunax
                - img
                - group
            - button "Download file" [ref=e242] [cursor=pointer]:
              - img [ref=e244]
              - text: Download file
          - table [ref=e246]:
            - rowgroup [ref=e247]:
              - row "Bank date Amount What it carried Status" [ref=e248]:
                - columnheader "Bank date" [ref=e249]
                - columnheader "Amount" [ref=e250]
                - columnheader "What it carried" [ref=e251]
                - columnheader "Status" [ref=e252]
                - columnheader [ref=e253]
            - rowgroup [ref=e254]:
              - row "Thu, Nov 12, 2026 $1,889.91 58 orders · $58.16 in fees Posted View" [ref=e255]:
                - cell "Thu, Nov 12, 2026" [ref=e256]
                - cell "$1,889.91" [ref=e257]
                - cell "58 orders · $58.16 in fees" [ref=e258]:
                  - paragraph [ref=e259]: 58 orders · $58.16 in fees
                - cell "Posted" [ref=e260]:
                  - generic [ref=e262]: Posted
                - cell "View" [ref=e263]:
                  - button "View" [ref=e264] [cursor=pointer]
              - row "Thu, Nov 12, 2026 $6,385.72 182 orders · $188.88 in fees Posted View" [ref=e265]:
                - cell "Thu, Nov 12, 2026" [ref=e266]
                - cell "$6,385.72" [ref=e267]
                - cell "182 orders · $188.88 in fees" [ref=e268]:
                  - paragraph [ref=e269]: 182 orders · $188.88 in fees
                - cell "Posted" [ref=e270]:
                  - generic [ref=e272]: Posted
                - cell "View" [ref=e273]:
                  - button "View" [ref=e274] [cursor=pointer]
              - row "Mon, Nov 9, 2026 $2,464.34 66 orders · $71.77 in fees Posted View" [ref=e275]:
                - cell "Mon, Nov 9, 2026" [ref=e276]
                - cell "$2,464.34" [ref=e277]
                - cell "66 orders · $71.77 in fees" [ref=e278]:
                  - paragraph [ref=e279]: 66 orders · $71.77 in fees
                - cell "Posted" [ref=e280]:
                  - generic [ref=e282]: Posted
                - cell "View" [ref=e283]:
                  - button "View" [ref=e284] [cursor=pointer]
              - row "Mon, Nov 9, 2026 $2,955.99 79 orders · $86.04 in fees Posted View" [ref=e285]:
                - cell "Mon, Nov 9, 2026" [ref=e286]
                - cell "$2,955.99" [ref=e287]
                - cell "79 orders · $86.04 in fees" [ref=e288]:
                  - paragraph [ref=e289]: 79 orders · $86.04 in fees
                - cell "Posted" [ref=e290]:
                  - generic [ref=e292]: Posted
                - cell "View" [ref=e293]:
                  - button "View" [ref=e294] [cursor=pointer]
              - row "Tue, Nov 3, 2026 $192.68 4 orders · $5.55 in fees Posted View" [ref=e295]:
                - cell "Tue, Nov 3, 2026" [ref=e296]
                - cell "$192.68" [ref=e297]
                - cell "4 orders · $5.55 in fees" [ref=e298]:
                  - paragraph [ref=e299]: 4 orders · $5.55 in fees
                - cell "Posted" [ref=e300]:
                  - generic [ref=e302]: Posted
                - cell "View" [ref=e303]:
                  - button "View" [ref=e304] [cursor=pointer]
              - row "Mon, Nov 2, 2026 $148.78 4 orders · $4.33 in fees Posted View" [ref=e305]:
                - cell "Mon, Nov 2, 2026" [ref=e306]
                - cell "$148.78" [ref=e307]
                - cell "4 orders · $4.33 in fees" [ref=e308]:
                  - paragraph [ref=e309]: 4 orders · $4.33 in fees
                - cell "Posted" [ref=e310]:
                  - generic [ref=e312]: Posted
                - cell "View" [ref=e313]:
                  - button "View" [ref=e314] [cursor=pointer]
              - row "Mon, Nov 2, 2026 $185.15 5 orders · $5.38 in fees Posted View" [ref=e315]:
                - cell "Mon, Nov 2, 2026" [ref=e316]
                - cell "$185.15" [ref=e317]
                - cell "5 orders · $5.38 in fees" [ref=e318]:
                  - paragraph [ref=e319]: 5 orders · $5.38 in fees
                - cell "Posted" [ref=e320]:
                  - generic [ref=e322]: Posted
                - cell "View" [ref=e323]:
                  - button "View" [ref=e324] [cursor=pointer]
              - row "Thu, Oct 29, 2026 $95.10 3 orders · $3.31 in fees Posted View" [ref=e325]:
                - cell "Thu, Oct 29, 2026" [ref=e326]
                - cell "$95.10" [ref=e327]
                - cell "3 orders · $3.31 in fees" [ref=e328]:
                  - paragraph [ref=e329]: 3 orders · $3.31 in fees
                - cell "Posted" [ref=e330]:
                  - generic [ref=e332]: Posted
                - cell "View" [ref=e333]:
                  - button "View" [ref=e334] [cursor=pointer]
              - row "Wed, Oct 28, 2026 $181.84 3 orders · $6.51 in fees Posted View" [ref=e335]:
                - cell "Wed, Oct 28, 2026" [ref=e336]
                - cell "$181.84" [ref=e337]
                - cell "3 orders · $6.51 in fees" [ref=e338]:
                  - paragraph [ref=e339]: 3 orders · $6.51 in fees
                - cell "Posted" [ref=e340]:
                  - generic [ref=e342]: Posted
                - cell "View" [ref=e343]:
                  - button "View" [ref=e344] [cursor=pointer]
              - row "Tue, Oct 27, 2026 $225.29 4 orders · $6.46 in fees Posted View" [ref=e345]:
                - cell "Tue, Oct 27, 2026" [ref=e346]
                - cell "$225.29" [ref=e347]
                - cell "4 orders · $6.46 in fees" [ref=e348]:
                  - paragraph [ref=e349]: 4 orders · $6.46 in fees
                - cell "Posted" [ref=e350]:
                  - generic [ref=e352]: Posted
                - cell "View" [ref=e353]:
                  - button "View" [ref=e354] [cursor=pointer]
              - row "Mon, Oct 26, 2026 $142.16 2 orders · $4.04 in fees Posted View" [ref=e355]:
                - cell "Mon, Oct 26, 2026" [ref=e356]
                - cell "$142.16" [ref=e357]
                - cell "2 orders · $4.04 in fees" [ref=e358]:
                  - paragraph [ref=e359]: 2 orders · $4.04 in fees
                - cell "Posted" [ref=e360]:
                  - generic [ref=e362]: Posted
                - cell "View" [ref=e363]:
                  - button "View" [ref=e364] [cursor=pointer]
              - row "Mon, Oct 26, 2026 $139.56 4 orders · $4.08 in fees Posted View" [ref=e365]:
                - cell "Mon, Oct 26, 2026" [ref=e366]
                - cell "$139.56" [ref=e367]
                - cell "4 orders · $4.08 in fees" [ref=e368]:
                  - paragraph [ref=e369]: 4 orders · $4.08 in fees
                - cell "Posted" [ref=e370]:
                  - generic [ref=e372]: Posted
                - cell "View" [ref=e373]:
                  - button "View" [ref=e374] [cursor=pointer]
              - row "Thu, Oct 22, 2026 $106.80 3 orders · $3.54 in fees Posted View" [ref=e375]:
                - cell "Thu, Oct 22, 2026" [ref=e376]
                - cell "$106.80" [ref=e377]
                - cell "3 orders · $3.54 in fees" [ref=e378]:
                  - paragraph [ref=e379]: 3 orders · $3.54 in fees
                - cell "Posted" [ref=e380]:
                  - generic [ref=e382]: Posted
                - cell "View" [ref=e383]:
                  - button "View" [ref=e384] [cursor=pointer]
              - row "Wed, Oct 21, 2026 $260.48 6 orders · $8.87 in fees Posted View" [ref=e385]:
                - cell "Wed, Oct 21, 2026" [ref=e386]
                - cell "$260.48" [ref=e387]
                - cell "6 orders · $8.87 in fees" [ref=e388]:
                  - paragraph [ref=e389]: 6 orders · $8.87 in fees
                - cell "Posted" [ref=e390]:
                  - generic [ref=e392]: Posted
                - cell "View" [ref=e393]:
                  - button "View" [ref=e394] [cursor=pointer]
  - button "Open chat" [ref=e395] [cursor=pointer]:
    - img [ref=e396]
```

# Test source

```ts
  268 |     expect((av.health as Rec).state, JSON.stringify(av.health)).toBe("OK");
  269 |     const out: { date: string; avalara: Rec; entry: Rec; refunds: boolean }[] =
  270 |       [];
  271 |     for (const d of list(av.days)
  272 |       .filter((d) => d.status === "SENT" && String(d.date) <= cutoff)
  273 |       .slice(0, 7)) {
  274 |       const entry = (await dayEntry(id, String(d.date))).entry as Rec;
  275 |       out.push({
  276 |         date: String(d.date),
  277 |         avalara: d,
  278 |         entry,
  279 |         refunds: list(entry.lines).some((l) => l.key === "refunds"),
  280 |       });
  281 |     }
  282 |     return out;
  283 |   };
  284 |   const expectSameTax = (day: { date: string; avalara: Rec; entry: Rec }) => {
  285 |     expect(day.avalara.statusLabel).toBe("In Avalara");
  286 |     expect(day.avalara.error).toBeNull();
  287 |     // Collected minus given back, per the books' sales tax lines.
  288 |     const bookTax = list(day.entry.lines)
  289 |       .filter((l) => String(l.key).startsWith("tax:"))
  290 |       .reduce(
  291 |         (s, l) => s + (l.side === "CREDIT" ? 1 : -1) * Number(l.cents),
  292 |         0
  293 |       );
  294 |     expect(day.avalara.taxCents, `${day.date}: Avalara vs the books`).toBe(
  295 |       bookTax
  296 |     );
  297 |     expect(day.avalara.orders, `${day.date}: orders`).toBe(
  298 |       day.entry.orderCount
  299 |     );
  300 |   };
  301 | 
  302 |   test(
  303 |     "TC-1030: my 2 store — on days without refunds Avalara has the same tax as the books, for the same orders",
  304 |     PARTNER,
  305 |     async () => {
  306 |       const days = (await taxDays()).filter((d) => !d.refunds);
  307 |       test.skip(days.length === 0, "no day in Avalara without refunds");
  308 |       for (const d of days.slice(0, 3)) expectSameTax(d);
  309 |     }
  310 |   );
  311 | 
  312 |   test(
  313 |     "TC-1030b: my 2 store — on a day with refunds the books owe the same tax as Avalara",
  314 |     PARTNER,
  315 |     async () => {
  316 |       // The books took the refund's tax off nothing: sales tax payable stayed
  317 |       // above what was filed by the refunded tax (RestauNax #1104).
  318 |       const days = (await taxDays()).filter((d) => d.refunds);
  319 |       test.skip(days.length === 0, "no day in Avalara with a refund");
  320 |       for (const d of days.slice(0, 3)) expectSameTax(d);
  321 |     }
  322 |   );
  323 | 
  324 |   test(
  325 |     "TC-1031: my 2 store — each posted card deposit balances, its bank line is the payout, and Card deposits lists it",
  326 |     PARTNER,
  327 |     async () => {
  328 |       const { id, integration } = await books("my 2 store");
  329 |       test.skip(integration.connected !== true, "my 2 store is not connected");
  330 |       const r = await accountingRaw(adminToken, id, "GET", "/deposits");
  331 |       expect(r.status).toBe(200);
  332 |       const posted = list((r.data.data as Rec).deposits).filter(
  333 |         (d) => d.status === "POSTED"
  334 |       );
  335 |       test.skip(posted.length === 0, "no posted card deposit");
  336 |       for (const d of posted.slice(0, 3)) {
  337 |         const one = await accountingRaw(
  338 |           adminToken,
  339 |           id,
  340 |           "GET",
  341 |           `/deposits/${d.id}`
  342 |         );
  343 |         expect(one.status).toBe(200);
  344 |         const entry = (one.data.data as Rec).entry as Rec;
  345 |         expect(entry.debitCents, String(d.docNumber)).toBe(entry.creditCents);
  346 |         const bank = list(entry.lines).find((l) => l.key === "deposit:bank");
  347 |         expect(bank?.cents, String(d.docNumber)).toBe(
  348 |           Math.abs(Number(d.amountCents))
  349 |         );
  350 |       }
  351 |       await openBooks(id, "deposits");
  352 |       // Each row: the bank date, the amount, what it carried, Posted.
  353 |       const first = posted[0] as Rec;
  354 |       const bankDate = new Intl.DateTimeFormat("en-US", {
  355 |         weekday: "short",
  356 |         month: "short",
  357 |         day: "numeric",
  358 |         year: "numeric",
  359 |         timeZone: "UTC",
  360 |       }).format(new Date(`${String(first.arrivalDate)}T12:00:00Z`));
  361 |       const amount = `$${(Number(first.amountCents) / 100).toFixed(2)}`;
  362 |       await expect(
  363 |         page().getByRole("row", {
  364 |           name: new RegExp(
  365 |             `^${bankDate} \\${amount} \\d+ orders? · \\$[\\d.]+ in fees Posted`
  366 |           ),
  367 |         })
> 368 |       ).not.toHaveCount(0, { timeout: 20_000 });
      |             ^ Error: expect(locator).not.toHaveCount(expected) failed
  369 |     }
  370 |   );
  371 | 
  372 |   test(
  373 |     "TC-1032: New Restaurant — Overview names the Xero company; recent days are posted to Xero, balanced",
  374 |     PARTNER,
  375 |     async () => {
  376 |       const { id, integration } = await books("New Restaurant");
  377 |       test.skip(
  378 |         integration.provider !== "XERO" || integration.connected !== true,
  379 |         `New Restaurant is no longer connected to Xero (${String(integration.provider)})`
  380 |       );
  381 |       await openBooks(id);
  382 |       await expect(
  383 |         page().getByText(
  384 |           new RegExp(
  385 |             `^Posted through [A-Z][a-z]+, [A-Z][a-z]{2} \\d{1,2} to ${String(
  386 |               integration.companyName
  387 |             ).replace(/[()]/g, "\\$&")}\\.$`
  388 |           )
  389 |         )
  390 |       ).toBeVisible({ timeout: 20_000 });
  391 |       const days = await recentDays(id);
  392 |       test.skip(days.length === 0, "no closed day two or more days back");
  393 |       for (const d of days)
  394 |         await expectPosted(id, String(d.businessDate ?? d.date), "XERO");
  395 |     }
  396 |   );
  397 | 
  398 |   test(
  399 |     "TC-1033: Sally's Pizza — with nothing connected the page invites setup, shows no error, and no day failed",
  400 |     PARTNER,
  401 |     async () => {
  402 |       const { id, integration } = await books("Sally's Pizza");
  403 |       test.skip(
  404 |         integration.connected === true,
  405 |         "Sally's Pizza is connected now: it's no longer the control"
  406 |       );
  407 |       const days = await recentDays(id, 7);
  408 |       for (const d of days)
  409 |         expect(d.status, String(d.businessDate ?? d.date)).not.toBe("FAILED");
  410 | 
  411 |       await openBooks(id);
  412 |       await expect(
  413 |         page().getByRole("heading", { name: "Set it up once" })
  414 |       ).toBeVisible({
  415 |         timeout: 20_000,
  416 |       });
  417 |       await expect(
  418 |         page().getByText("Tell us where you keep your books.")
  419 |       ).toBeVisible();
  420 |       await expect(
  421 |         page().getByText(/failed|refused|disconnected/i)
  422 |       ).toHaveCount(0);
  423 |       await expectHumanText(page().getByRole("main"), "Books & taxes");
  424 | 
  425 |       await page().getByRole("tab", { name: "Books" }).click();
  426 |       await expect(
  427 |         page().getByRole("button", { name: "Connect QuickBooks Online" })
  428 |       ).toBeVisible();
  429 |       await expect(
  430 |         page().getByRole("button", { name: "Connect Xero" })
  431 |       ).toBeVisible();
  432 |     }
  433 |   );
  434 | });
  435 | 
```