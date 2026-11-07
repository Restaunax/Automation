# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/journey/06-the-books.spec.ts >> Journey 6 — the books (partner restaurants, read-only) >> TC-1030b: my 2 store — on a day with refunds the books owe the same tax as Avalara
- Location: tests/dashboard/journey/06-the-books.spec.ts:272:7

# Error details

```
Error: 2026-10-27: Avalara vs the books

expect(received).toBe(expected) // Object.is equality

Expected: 1142
Received: 1107
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
            - combobox [ref=e19] [cursor=pointer]
            - textbox
            - img
            - group
          - button "Account settings" [ref=e21] [cursor=pointer]:
            - generic [ref=e22]: R
          - button "Select Language" [ref=e24] [cursor=pointer]:
            - img [ref=e26]
            - text: EN
          - button [ref=e32] [cursor=pointer]:
            - img [ref=e33]
    - navigation "mailbox folders" [ref=e35]:
      - generic [ref=e37]:
        - button "Collapse sidebar" [ref=e39] [cursor=pointer]:
          - img [ref=e40]
        - generic [ref=e43]:
          - button "Today" [ref=e44] [cursor=pointer]:
            - img [ref=e46]
            - paragraph [ref=e48]: Today
          - button "Analytics" [ref=e49] [cursor=pointer]:
            - img [ref=e51]
            - paragraph [ref=e53]: Analytics
          - button "Orders" [ref=e54] [cursor=pointer]:
            - img [ref=e56]
            - paragraph [ref=e58]: Orders
          - button "Menu" [ref=e59] [cursor=pointer]:
            - img [ref=e61]
            - paragraph [ref=e63]: Menu
          - button "Customers" [ref=e64] [cursor=pointer]:
            - img [ref=e66]
            - paragraph [ref=e68]: Customers
          - button "Billing" [ref=e69] [cursor=pointer]:
            - img [ref=e71]
            - paragraph [ref=e73]: Billing
          - button "Image Library" [ref=e74] [cursor=pointer]:
            - img [ref=e76]
            - paragraph [ref=e78]: Image Library
          - button "Store Settings" [ref=e79] [cursor=pointer]:
            - img [ref=e81]
            - paragraph [ref=e83]: Store Settings
          - button "Store Operations" [ref=e85] [cursor=pointer]:
            - img [ref=e87]
            - paragraph [ref=e89]: Store Operations
            - img [ref=e91]
          - button "Job Applications" [ref=e93] [cursor=pointer]:
            - img [ref=e95]
            - paragraph [ref=e97]: Job Applications
          - button "Restaurant Staff" [ref=e98] [cursor=pointer]:
            - img [ref=e100]
            - paragraph [ref=e102]: Restaurant Staff
          - button "Books & taxes" [ref=e103] [cursor=pointer]:
            - img [ref=e105]
            - paragraph [ref=e107]: Books & taxes
          - button "Promotions" [ref=e109] [cursor=pointer]:
            - img [ref=e111]
            - paragraph [ref=e113]: Promotions
            - img [ref=e115]
          - button "Supply Shop" [ref=e117] [cursor=pointer]:
            - img [ref=e119]
            - paragraph [ref=e121]: Supply Shop
        - button "Owner Settings" [ref=e124] [cursor=pointer]:
          - img [ref=e126]
          - paragraph [ref=e129]: Owner Settings
    - main [ref=e130]:
      - generic [ref=e132]:
        - img [ref=e133]
        - paragraph [ref=e135]:
          - generic [ref=e136]: "Managing:"
      - generic [ref=e138]:
        - heading "Books & taxes" [level=5] [ref=e139]
        - paragraph [ref=e140]: Your daily sales go to your books by themselves. We tell you only when something needs you.
        - tablist [ref=e144]:
          - tab "Overview" [selected] [ref=e145] [cursor=pointer]:
            - img [ref=e146]
            - text: Overview
          - tab "Books" [ref=e148] [cursor=pointer]:
            - img [ref=e149]
            - text: Books
          - tab "Card deposits" [ref=e151] [cursor=pointer]:
            - img [ref=e152]
            - text: Card deposits
          - tab "Sales tax" [ref=e154] [cursor=pointer]:
            - img [ref=e155]
            - text: Sales tax
          - tab "Tax calendar" [ref=e158] [cursor=pointer]:
            - img [ref=e159]
            - text: Tax calendar
          - tab "Year end" [ref=e161] [cursor=pointer]:
            - img [ref=e162]
            - text: Year end
          - tab "Your accountant" [ref=e165] [cursor=pointer]:
            - img [ref=e166]
            - text: Your accountant
        - generic [ref=e168]:
          - generic [ref=e169]:
            - generic [ref=e173]:
              - generic [ref=e174]:
                - generic [ref=e175]:
                  - img [ref=e176]
                  - heading "Books" [level=6] [ref=e178]
                - generic [ref=e181]: Working
              - paragraph [ref=e182]: Posted through Thursday, Oct 29 to Sandbox Company US 9add.
              - generic [ref=e183]:
                - generic [ref=e184]: Last worked 8 hours ago
                - generic [ref=e185]: "Next: After the day is closed"
            - generic [ref=e189]:
              - generic [ref=e190]:
                - generic [ref=e191]:
                  - img [ref=e192]
                  - heading "Card deposits" [level=6] [ref=e194]
                - generic [ref=e197]: Working
              - paragraph [ref=e198]: Deposits matched through Thursday, Oct 29.
              - generic [ref=e200]: Last worked a day ago
            - generic [ref=e204]:
              - generic [ref=e205]:
                - generic [ref=e206]:
                  - img [ref=e207]
                  - heading "Sales tax" [level=6] [ref=e210]
                - generic [ref=e213]: Working
              - paragraph [ref=e214]: Days are in Avalara (RestauNax) through Thursday, Oct 29.
              - generic [ref=e216]: Last worked 8 hours ago
              - button "Open Sales tax" [ref=e218] [cursor=pointer]
            - generic [ref=e222]:
              - generic [ref=e223]:
                - generic [ref=e224]:
                  - img [ref=e225]
                  - heading "Payroll" [level=6] [ref=e227]
                - generic [ref=e230]: Working
              - paragraph [ref=e231]: RestauNax Payroll is running.
          - generic [ref=e233]:
            - heading "This week" [level=6] [ref=e234]
            - generic [ref=e235]:
              - generic [ref=e236]:
                - heading "7" [level=5] [ref=e237]
                - text: days closed
              - generic [ref=e238]:
                - heading "7" [level=5] [ref=e239]
                - text: days posted
              - generic [ref=e240]:
                - heading "0" [level=5] [ref=e241]
                - text: days waiting
              - generic [ref=e242]:
                - heading "5" [level=5] [ref=e243]
                - text: deposits matched
          - generic [ref=e245]:
            - generic [ref=e246]:
              - heading "Coming up" [level=6] [ref=e247]
              - button "Set up the tax calendar" [ref=e248] [cursor=pointer]
            - list [ref=e249]:
              - listitem [ref=e250]:
                - generic [ref=e251]:
                  - generic [ref=e252]: Payroll tax return (Form 941) for Q3 2026
                  - paragraph [ref=e253]: Nov 2, 2026
                - generic [ref=e255]: Handled by Gusto
              - listitem [ref=e256]:
                - generic [ref=e257]:
                  - generic [ref=e258]: Year-end package for 2026 is ready
                  - paragraph [ref=e259]: Jan 11, 2027
                - generic [ref=e261]: RestauNax
              - listitem [ref=e262]:
                - generic [ref=e263]:
                  - generic [ref=e264]: Estimated tax payment 4 for 2026
                  - paragraph [ref=e265]: Jan 15, 2027
                - generic [ref=e267]: You
          - generic [ref=e269]:
            - generic [ref=e270]:
              - heading "What happens by itself" [level=6] [ref=e271]
              - button "Change answers" [ref=e273] [cursor=pointer]
            - list [ref=e274]:
              - listitem [ref=e275]:
                - img [ref=e277]
                - generic [ref=e280]: Each day posts to QuickBooks (Sandbox Company US 9add) after it's closed.
              - listitem [ref=e281]:
                - img [ref=e283]
                - generic [ref=e286]: A day that doesn't add up waits for you instead of posting wrong numbers.
              - listitem [ref=e287]:
                - img [ref=e289]
                - generic [ref=e292]: Each card deposit is posted to QuickBooks with its fees, so it matches your bank line in one click.
              - listitem [ref=e293]:
                - img [ref=e295]
                - generic [ref=e298]: Each closed day is sent to Avalara (RestauNax) with the tax you collected. Avalara Returns, bought from Avalara, files and pays it.
              - listitem [ref=e299]:
                - img [ref=e301]
                - generic [ref=e304]: RestauNax Payroll pays your team, and Gusto files your payroll taxes.
              - listitem [ref=e305]:
                - img [ref=e307]
                - generic [ref=e310]: If something needs you, we send one email and one notification, never one per retry.
            - text: RestauNax never files a tax return and never holds tax money. Your filing service, your accountant or you do that.
  - button "Open chat" [ref=e311] [cursor=pointer]:
    - img [ref=e312]
```

# Test source

```ts
  154 |   });
  155 | 
  156 |   test.afterAll(async () => {
  157 |     if (session) await session.context.close().catch(() => {});
  158 |   });
  159 | 
  160 |   test.beforeEach(async () => {
  161 |     await allure.label("feature", "Journey — the books (partners)");
  162 |     await allure.label("severity", "normal");
  163 |     await page().setViewportSize(DESKTOP);
  164 |   });
  165 | 
  166 |   test(
  167 |     "TC-1028: my 2 store — Overview says each connection is working, in words",
  168 |     PARTNER,
  169 |     async () => {
  170 |       const { id, integration } = await books("my 2 store");
  171 |       test.skip(
  172 |         integration.provider !== "QUICKBOOKS" || integration.connected !== true,
  173 |         `my 2 store is no longer connected to QuickBooks (${String(integration.provider)})`
  174 |       );
  175 |       const company = String(integration.companyName);
  176 |       await openBooks(id);
  177 |       await expect(
  178 |         page().getByText(
  179 |           new RegExp(
  180 |             `^Posted through [A-Z][a-z]+, [A-Z][a-z]{2} \\d{1,2} to ${company}\\.$`
  181 |           )
  182 |         )
  183 |       ).toBeVisible({ timeout: 20_000 });
  184 |       await expect(
  185 |         page().getByText(
  186 |           /^Deposits matched through [A-Z][a-z]+, [A-Z][a-z]{2} \d{1,2}\.$/
  187 |         )
  188 |       ).toBeVisible();
  189 |       const tax = await accountingRaw(adminToken, id, "GET", "/avalara");
  190 |       const last = String((tax.data.data as Rec).lastSentDate ?? "");
  191 |       if (last)
  192 |         await expect(
  193 |           page().getByText(
  194 |             `Days are in Avalara (RestauNax) through ${longDay(last)}.`
  195 |           )
  196 |         ).toBeVisible();
  197 |       await expect(
  198 |         page().getByText("RestauNax Payroll is running.")
  199 |       ).toBeVisible();
  200 |       // Nothing on the page asks for help.
  201 |       await expect(
  202 |         page().getByText(/failed|refused|disconnected/i)
  203 |       ).toHaveCount(0);
  204 |       await expectHumanText(page().getByRole("main"), "Books & taxes");
  205 |     }
  206 |   );
  207 | 
  208 |   test(
  209 |     "TC-1029: my 2 store — each recent day is posted to QuickBooks as one balanced entry",
  210 |     PARTNER,
  211 |     async () => {
  212 |       const { id, integration } = await books("my 2 store");
  213 |       test.skip(integration.connected !== true, "my 2 store is not connected");
  214 |       const days = await recentDays(id);
  215 |       test.skip(days.length === 0, "no closed day two or more days back");
  216 |       for (const d of days)
  217 |         await expectPosted(id, String(d.businessDate ?? d.date), "QUICKBOOKS");
  218 |     }
  219 |   );
  220 | 
  221 |   /** Avalara's sent days (two or more days back) beside their entries. */
  222 |   const taxDays = async () => {
  223 |     const { id } = await books("my 2 store");
  224 |     const r = await accountingRaw(adminToken, id, "GET", "/avalara");
  225 |     expect(r.status).toBe(200);
  226 |     const av = r.data.data as Rec;
  227 |     test.skip(!av.connection, "my 2 store is not connected to Avalara");
  228 |     expect((av.health as Rec).state, JSON.stringify(av.health)).toBe("OK");
  229 |     const out: { date: string; avalara: Rec; entry: Rec; refunds: boolean }[] =
  230 |       [];
  231 |     for (const d of list(av.days)
  232 |       .filter((d) => d.status === "SENT" && String(d.date) <= cutoff)
  233 |       .slice(0, 7)) {
  234 |       const entry = (await dayEntry(id, String(d.date))).entry as Rec;
  235 |       out.push({
  236 |         date: String(d.date),
  237 |         avalara: d,
  238 |         entry,
  239 |         refunds: list(entry.lines).some((l) => l.key === "refunds"),
  240 |       });
  241 |     }
  242 |     return out;
  243 |   };
  244 |   const expectSameTax = (day: { date: string; avalara: Rec; entry: Rec }) => {
  245 |     expect(day.avalara.statusLabel).toBe("In Avalara");
  246 |     expect(day.avalara.error).toBeNull();
  247 |     // Collected minus given back, per the books' sales tax lines.
  248 |     const bookTax = list(day.entry.lines)
  249 |       .filter((l) => String(l.key).startsWith("tax:"))
  250 |       .reduce(
  251 |         (s, l) => s + (l.side === "CREDIT" ? 1 : -1) * Number(l.cents),
  252 |         0
  253 |       );
> 254 |     expect(day.avalara.taxCents, `${day.date}: Avalara vs the books`).toBe(
      |                                                                       ^ Error: 2026-10-27: Avalara vs the books
  255 |       bookTax
  256 |     );
  257 |     expect(day.avalara.orders, `${day.date}: orders`).toBe(
  258 |       day.entry.orderCount
  259 |     );
  260 |   };
  261 | 
  262 |   test(
  263 |     "TC-1030: my 2 store — on days without refunds Avalara has the same tax as the books, for the same orders",
  264 |     PARTNER,
  265 |     async () => {
  266 |       const days = (await taxDays()).filter((d) => !d.refunds);
  267 |       test.skip(days.length === 0, "no day in Avalara without refunds");
  268 |       for (const d of days.slice(0, 3)) expectSameTax(d);
  269 |     }
  270 |   );
  271 | 
  272 |   test(
  273 |     "TC-1030b: my 2 store — on a day with refunds the books owe the same tax as Avalara",
  274 |     PARTNER,
  275 |     async () => {
  276 |       // The books took the refund's tax off nothing: sales tax payable stayed
  277 |       // above what was filed by the refunded tax (RestauNax #1104).
  278 |       test.fail(!FIXED_1104, FIX_1104);
  279 |       const days = (await taxDays()).filter((d) => d.refunds);
  280 |       test.skip(days.length === 0, "no day in Avalara with a refund");
  281 |       for (const d of days.slice(0, 3)) expectSameTax(d);
  282 |     }
  283 |   );
  284 | 
  285 |   test(
  286 |     "TC-1031: my 2 store — each posted card deposit balances, its bank line is the payout, and Card deposits lists it",
  287 |     PARTNER,
  288 |     async () => {
  289 |       const { id, integration } = await books("my 2 store");
  290 |       test.skip(integration.connected !== true, "my 2 store is not connected");
  291 |       const r = await accountingRaw(adminToken, id, "GET", "/deposits");
  292 |       expect(r.status).toBe(200);
  293 |       const posted = list((r.data.data as Rec).deposits).filter(
  294 |         (d) => d.status === "POSTED"
  295 |       );
  296 |       test.skip(posted.length === 0, "no posted card deposit");
  297 |       for (const d of posted.slice(0, 3)) {
  298 |         const one = await accountingRaw(
  299 |           adminToken,
  300 |           id,
  301 |           "GET",
  302 |           `/deposits/${d.id}`
  303 |         );
  304 |         expect(one.status).toBe(200);
  305 |         const entry = (one.data.data as Rec).entry as Rec;
  306 |         expect(entry.debitCents, String(d.docNumber)).toBe(entry.creditCents);
  307 |         const bank = list(entry.lines).find((l) => l.key === "deposit:bank");
  308 |         expect(bank?.cents, String(d.docNumber)).toBe(
  309 |           Math.abs(Number(d.amountCents))
  310 |         );
  311 |       }
  312 |       await openBooks(id, "deposits");
  313 |       // Each row: the bank date, the amount, what it carried, Posted.
  314 |       const first = posted[0] as Rec;
  315 |       const bankDate = new Intl.DateTimeFormat("en-US", {
  316 |         weekday: "short",
  317 |         month: "short",
  318 |         day: "numeric",
  319 |         year: "numeric",
  320 |         timeZone: "UTC",
  321 |       }).format(new Date(`${String(first.arrivalDate)}T12:00:00Z`));
  322 |       const amount = `$${(Number(first.amountCents) / 100).toFixed(2)}`;
  323 |       await expect(
  324 |         page().getByRole("row", {
  325 |           name: new RegExp(
  326 |             `^${bankDate} \\${amount} \\d+ orders? · \\$[\\d.]+ in fees Posted`
  327 |           ),
  328 |         })
  329 |       ).not.toHaveCount(0, { timeout: 20_000 });
  330 |     }
  331 |   );
  332 | 
  333 |   test(
  334 |     "TC-1032: New Restaurant — Overview names the Xero company; recent days are posted to Xero, balanced",
  335 |     PARTNER,
  336 |     async () => {
  337 |       const { id, integration } = await books("New Restaurant");
  338 |       test.skip(
  339 |         integration.provider !== "XERO" || integration.connected !== true,
  340 |         `New Restaurant is no longer connected to Xero (${String(integration.provider)})`
  341 |       );
  342 |       await openBooks(id);
  343 |       await expect(
  344 |         page().getByText(
  345 |           new RegExp(
  346 |             `^Posted through [A-Z][a-z]+, [A-Z][a-z]{2} \\d{1,2} to ${String(
  347 |               integration.companyName
  348 |             ).replace(/[()]/g, "\\$&")}\\.$`
  349 |           )
  350 |         )
  351 |       ).toBeVisible({ timeout: 20_000 });
  352 |       const days = await recentDays(id);
  353 |       test.skip(days.length === 0, "no closed day two or more days back");
  354 |       for (const d of days)
```