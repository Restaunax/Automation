# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/41-gift-cards-ui.spec.ts >> Owner gift cards — web section and Payouts (UI) >> TC-2041: reports tie, and the export downloads after a warning
- Location: tests/dashboard/owner/41-gift-cards-ui.spec.ts:360:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 50
Received: 0
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
          - generic "Automation Owner2 Store 90ca9ed7 — Miami — Gift cards" [ref=e13]
        - generic [ref=e15]:
          - generic [ref=e17]:
            - img [ref=e18]
            - generic [ref=e20]:
              - paragraph [ref=e21]: Automation Owner2 Store 90ca9ed7
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
          - button "Gift cards" [ref=e144] [cursor=pointer]:
            - img [ref=e146]
            - paragraph [ref=e148]: Gift cards
          - button "Supply Shop" [ref=e149] [cursor=pointer]:
            - img [ref=e151]
            - paragraph [ref=e153]: Supply Shop
          - button "Social Media" [ref=e155] [cursor=pointer]:
            - img [ref=e157]
            - paragraph [ref=e159]: Social Media
            - img [ref=e161]
          - button "RestauNax Products" [ref=e163] [cursor=pointer]:
            - img [ref=e165]
            - paragraph [ref=e167]: RestauNax Products
        - button "Owner Settings" [ref=e170] [cursor=pointer]:
          - img [ref=e172]
          - paragraph [ref=e175]: Owner Settings
    - main [ref=e176]:
      - generic [ref=e178]:
        - img [ref=e179]
        - paragraph [ref=e181]:
          - generic [ref=e182]: "Managing:"
          - text: Automation Owner2 Store 90ca9ed7
      - generic [ref=e184]:
        - generic [ref=e185]:
          - img [ref=e186]
          - heading "Gift cards" [level=1] [ref=e188]
        - tablist "Gift cards sections" [ref=e192]:
          - tab "Overview" [ref=e193] [cursor=pointer]
          - tab "Reports" [selected] [ref=e194] [cursor=pointer]
          - tab "Settings" [ref=e195] [cursor=pointer]
        - generic [ref=e197]:
          - generic [ref=e198]:
            - generic [ref=e199]:
              - tablist "Report" [ref=e203]:
                - tab "Activity" [selected] [ref=e204] [cursor=pointer]
                - tab "Monthly roll-forward" [ref=e205] [cursor=pointer]
                - tab "Unsold printed cards" [ref=e206] [cursor=pointer]
                - tab "Chain settlement" [ref=e207] [cursor=pointer]
              - heading "Activity" [level=2] [ref=e208]
              - paragraph [ref=e209]: Cards sold, spent, refunded back to cards and cashed out in the dates you pick.
            - generic [ref=e210]:
              - button "Download every card" [ref=e211] [cursor=pointer]:
                - img [ref=e213]
                - text: Download every card
              - generic [ref=e215]: A spreadsheet with every card's full number and balance, for your accountant or to take with you.
          - generic [ref=e216]:
            - generic [ref=e217]:
              - generic [ref=e218]:
                - generic [ref=e219]:
                  - generic [ref=e220]: From
                  - group [ref=e222]:
                    - generic [ref=e223]:
                      - generic [ref=e224]:
                        - spinbutton "Month" [ref=e225]: MM
                        - text: /
                      - generic [ref=e226]:
                        - spinbutton "Day" [ref=e227]: DD
                        - text: /
                      - spinbutton "Year" [ref=e229]: YYYY
                    - button "Choose date" [ref=e231] [cursor=pointer]:
                      - img [ref=e232]
                    - group
                    - textbox [ref=e234]
                - generic [ref=e235]:
                  - generic [ref=e236]: To
                  - group [ref=e238]:
                    - generic [ref=e239]:
                      - generic [ref=e240]:
                        - spinbutton "Month" [ref=e241]: MM
                        - text: /
                      - generic [ref=e242]:
                        - spinbutton "Day" [ref=e243]: DD
                        - text: /
                      - spinbutton "Year" [ref=e245]: YYYY
                    - button "Choose date" [ref=e247] [cursor=pointer]:
                      - img [ref=e248]
                    - group
                    - textbox [ref=e250]
              - paragraph [ref=e251]: Showing Oct 18, 2026 – Nov 17, 2026
            - generic [ref=e252]:
              - generic [ref=e253]:
                - heading "Sold" [level=6] [ref=e254]
                - table [ref=e256]:
                  - rowgroup [ref=e257]:
                    - row "What Cards Amount" [ref=e258]:
                      - columnheader "What" [ref=e259]
                      - columnheader "Cards" [ref=e260]
                      - columnheader "Amount" [ref=e261]
                  - rowgroup [ref=e262]:
                    - row "Website 0 $0.00" [ref=e263]:
                      - cell "Website" [ref=e264]
                      - cell "0" [ref=e265]
                      - cell "$0.00" [ref=e266]
                    - row "Ordering app 0 $0.00" [ref=e267]:
                      - cell "Ordering app" [ref=e268]
                      - cell "0" [ref=e269]
                      - cell "$0.00" [ref=e270]
                    - row "Register, card 0 $0.00" [ref=e271]:
                      - cell "Register, card" [ref=e272]
                      - cell "0" [ref=e273]
                      - cell "$0.00" [ref=e274]
                    - row "Register, cash 0 $0.00" [ref=e275]:
                      - cell "Register, cash" [ref=e276]
                      - cell "0" [ref=e277]
                      - cell "$0.00" [ref=e278]
                    - row "Other 0 $0.00" [ref=e279]:
                      - cell "Other" [ref=e280]
                      - cell "0" [ref=e281]
                      - cell "$0.00" [ref=e282]
                    - row "Total sold 0 $0.00" [ref=e283]:
                      - cell "Total sold" [ref=e284]
                      - cell "0" [ref=e285]
                      - cell "$0.00" [ref=e286]
                    - row "Of which printed cards 0 $0.00" [ref=e287]:
                      - cell "Of which printed cards" [ref=e288]
                      - cell "0" [ref=e289]
                      - cell "$0.00" [ref=e290]
              - table [ref=e292]:
                - rowgroup [ref=e293]:
                  - row "What Cards Amount" [ref=e294]:
                    - columnheader "What" [ref=e295]
                    - columnheader "Cards" [ref=e296]
                    - columnheader "Amount" [ref=e297]
                - rowgroup [ref=e298]:
                  - row "Voided loads 0 $0.00" [ref=e299]:
                    - cell "Voided loads" [ref=e300]
                    - cell "0" [ref=e301]
                    - cell "$0.00" [ref=e302]
                  - row "Spent 0 $0.00" [ref=e303]:
                    - cell "Spent" [ref=e304]
                    - cell "0" [ref=e305]
                    - cell "$0.00" [ref=e306]
                  - row "Here 0 $0.00" [ref=e307]:
                    - cell "Here" [ref=e308]
                    - cell "0" [ref=e309]
                    - cell "$0.00" [ref=e310]
                  - row "Refunded to cards 0 $0.00" [ref=e311]:
                    - cell "Refunded to cards" [ref=e312]
                    - cell "0" [ref=e313]
                    - cell "$0.00" [ref=e314]
                  - row "Cashed out 0 $0.00" [ref=e315]:
                    - cell "Cashed out" [ref=e316]
                    - cell "0" [ref=e317]
                    - cell "$0.00" [ref=e318]
  - button "Open chat" [ref=e319] [cursor=pointer]:
    - img [ref=e320]
```

# Test source

```ts
  267 |       );
  268 |       await gc().closeCard();
  269 |       expect(refused).toEqual([]);
  270 |     });
  271 | 
  272 |     test("TC-2039: freeze a lost card, then unfreeze it; a RestauNax hold has no button", async () => {
  273 |       gate();
  274 |       await gc().goto(rid, "overview");
  275 |       await gc().openCard(last4Of(web.code), web.id);
  276 |       await gc().freeze("Customer lost it");
  277 |       try {
  278 |         const frozen = dataOf((await asOwner("GET", `/cards/${web.id}`)).data);
  279 |         expect(frozen.status).toBe("FROZEN");
  280 |         expect((frozen.freeze as Rec).origin).toBe("OWNER");
  281 |         await expect(gc().drawerStatus()).toHaveText(String(frozen.statusText));
  282 |         await expect(gc().freezeBanner()).toContainText("Customer lost it");
  283 |         await expect(gc().unfreezeButton()).toBeVisible();
  284 |         await gc().unfreeze();
  285 |       } finally {
  286 |         // The card must be spendable for the rest of the file.
  287 |         const now = dataOf((await asOwner("GET", `/cards/${web.id}`)).data);
  288 |         if (now.status === "FROZEN")
  289 |           await ownerGiftCardRaw(
  290 |             owner,
  291 |             { restaurantId: rid },
  292 |             "POST",
  293 |             `/cards/${web.id}/unfreeze`
  294 |           );
  295 |       }
  296 |       const active = dataOf((await asOwner("GET", `/cards/${web.id}`)).data);
  297 |       expect(active.status).toBe("ACTIVE");
  298 |       await expect(gc().drawerStatus()).toHaveText(String(active.statusText));
  299 |       await gc().closeCard();
  300 | 
  301 |       await gc().openCard(last4Of(adminFrozen.code), adminFrozen.id);
  302 |       await expect(gc().freezeBanner()).toBeVisible();
  303 |       await expect(gc().unfreezeButton()).toBeHidden();
  304 |       await expect(gc().unfreezeBlocked()).toHaveText(EN.restaunaxHold);
  305 |       await gc().closeCard();
  306 |       expect(refused).toEqual([]);
  307 |     });
  308 | 
  309 |     test("TC-2040: settings save, and refuse a bad amount on the field", async () => {
  310 |       gate();
  311 |       const before = dataOf((await asOwner("GET", "/config")).data);
  312 |       try {
  313 |         await gc().goto(rid, "settings");
  314 |         await expect(gc().settingsPanel()).toBeVisible({ timeout: 30_000 });
  315 | 
  316 |         await gc().removeAllPresets();
  317 |         for (const amount of [20, 40, 60]) await gc().addPreset(amount);
  318 |         await expect(gc().settingsPresets()).toHaveText([
  319 |           "$20.00",
  320 |           "$40.00",
  321 |           "$60.00",
  322 |         ]);
  323 |         await gc().saveSettings();
  324 |         const saved = dataOf((await asOwner("GET", "/config")).data);
  325 |         expect(saved.presetDenominations).toEqual([20, 40, 60]);
  326 | 
  327 |         // A duplicate is refused on the field; Save stays off.
  328 |         await gc().addPreset(20);
  329 |         await expect(gc().presetsError()).toHaveText(
  330 |           "Each amount can appear only once."
  331 |         );
  332 |         await expect(gc().saveButton()).toBeDisabled();
  333 |         await gc().removeLastPreset();
  334 |         await expect(gc().presetsError()).toHaveCount(0);
  335 |         const still = dataOf((await asOwner("GET", "/config")).data);
  336 |         expect(still.presetDenominations).toEqual([20, 40, 60]);
  337 | 
  338 |         // The switch itself flips "Take cash for cards at the register".
  339 |         const cash = gc().settingsSwitch("cash");
  340 |         const was = await cash.isChecked();
  341 |         await cash.click();
  342 |         await expect(cash).toBeChecked({ checked: !was });
  343 |         await gc().saveSettings();
  344 |         const flipped = dataOf((await asOwner("GET", "/config")).data);
  345 |         expect(flipped.allowCashFunding).toBe(!was);
  346 |       } finally {
  347 |         // A mid-test failure can leave a draft: discard it, so the next goto
  348 |         // never meets the unsaved-changes prompt, then restore through the API.
  349 |         await gc()
  350 |           .discardChanges()
  351 |           .catch(() => {});
  352 |         await asOwner("PUT", "/config", {
  353 |           presetDenominations: before.presetDenominations,
  354 |           allowCashFunding: before.allowCashFunding,
  355 |         });
  356 |       }
  357 |       expect(refused).toEqual([]);
  358 |     });
  359 | 
  360 |     test("TC-2041: reports tie, and the export downloads after a warning", async () => {
  361 |       gate();
  362 |       await gc().goto(rid, "reports");
  363 |       // Activity (the default report, no dates = the server's default range).
  364 |       const act = await asOwner("GET", "/reports/activity");
  365 |       expect(act.status, JSON.stringify(act.data)).toBe(200);
  366 |       const sold = Number(((dataOf(act.data).sold as Rec).total as Rec).amount);
> 367 |       expect(sold).toBe(50);
      |                    ^ Error: expect(received).toBe(expected) // Object.is equality
  368 |       await expect(gc().soldTotalAmount()).toHaveText(usd(sold), {
  369 |         timeout: 30_000,
  370 |       });
  371 | 
  372 |       await gc().openReport("rollForward");
  373 |       await expect(gc().rollForwardTies()).toBeVisible({ timeout: 30_000 });
  374 |       await expect(gc().rollForwardOff()).toHaveCount(0);
  375 |       const rfHint = (await gc().reportHint().innerText()).trim();
  376 |       expect(rfHint).not.toBe("");
  377 |       expect(looksLikeKey(rfHint), rfHint).toBe(false);
  378 | 
  379 |       await gc().openReport("settlement");
  380 |       await expect(
  381 |         page().getByTestId("gift-cards-report-settlement")
  382 |       ).toBeVisible({ timeout: 30_000 });
  383 |       const stHint = (await gc().reportHint().innerText()).trim();
  384 |       expect(stHint).not.toBe("");
  385 |       expect(stHint).not.toBe(rfHint);
  386 |       expect(looksLikeKey(stHint), stHint).toBe(false);
  387 | 
  388 |       const download = await gc().exportCsv(async (dialog) => {
  389 |         await expect(dialog).toContainText(EN.exportWarning);
  390 |       });
  391 |       const file = await download.path();
  392 |       const rows = parseCsv(await readFile(file, "utf8"));
  393 |       const body = rows.slice(1).filter((r) => r.some((c) => c.trim()));
  394 |       expect(body.length, JSON.stringify(rows[0])).toBeGreaterThanOrEqual(2);
  395 |       const hasCode = (code: string) =>
  396 |         body.some((r) => r.some((c) => sanitizeCode(c) === sanitizeCode(code)));
  397 |       expect(hasCode(web.code), "the web card's full code").toBe(true);
  398 |       expect(hasCode(imported.code), "the imported card's full code").toBe(
  399 |         true
  400 |       );
  401 |       const masked = body.flat().filter((c) => isMaskedCode(c.trim()));
  402 |       expect(masked, "no masked code in the export").toEqual([]);
  403 |       expect(refused).toEqual([]);
  404 |     });
  405 | 
  406 |     test("TC-2042: browser Back returns to the previous gift cards tab", async () => {
  407 |       gate();
  408 |       await gc().goto(rid, "overview");
  409 |       await expect(gc().sectionPanel("overview")).toBeVisible();
  410 |       await gc().openSection("reports");
  411 |       await expect(page()).toHaveURL(/[?&]section=reports(&|$)/);
  412 |       await gc().openSection("settings");
  413 |       await expect(page()).toHaveURL(/[?&]section=settings(&|$)/);
  414 | 
  415 |       await page().goBack();
  416 |       await expect(page()).toHaveURL(/[?&]section=reports(&|$)/);
  417 |       await expect(gc().sectionPanel("reports")).toBeVisible();
  418 |       await page().goBack();
  419 |       await expect(page()).toHaveURL(/[?&]section=overview(&|$)/);
  420 |       await expect(page()).toHaveURL(/[?&]tab=gift-cards(&|$)/);
  421 |       await expect(gc().sectionPanel("overview")).toBeVisible();
  422 |     });
  423 | 
  424 |     test("TC-2043: Payouts no longer carries gift card blocks", async () => {
  425 |       gate();
  426 |       const loaded = page().waitForResponse(
  427 |         (r) =>
  428 |           r.url().includes(`/api/subscriptions/restaurants/${rid}/payouts`) &&
  429 |           r.request().method() === "GET",
  430 |         { timeout: 30_000 }
  431 |       );
  432 |       await page().goto(
  433 |         `/restaurant/restaurantId/${rid}/subscription?section=payoutHistory`,
  434 |         { waitUntil: "domcontentloaded" }
  435 |       );
  436 |       await expect(
  437 |         page().getByRole("heading", { name: "Subscription Management" })
  438 |       ).toBeVisible({ timeout: 30_000 });
  439 |       await expect(
  440 |         page().getByRole("tab", { name: "Payout History", selected: true })
  441 |       ).toBeVisible();
  442 |       await loaded;
  443 |       await expect(
  444 |         page().getByText("Outstanding gift card balances")
  445 |       ).toHaveCount(0);
  446 |       await expect(page().getByText(/Gift card settlement:/)).toHaveCount(0);
  447 |       await expect(
  448 |         page().getByText(/This money is yours.*cards you sold/)
  449 |       ).toHaveCount(0);
  450 |       await expect(page().getByTestId("gift-cards-export")).toHaveCount(0);
  451 |       await expect(
  452 |         page().getByRole("button", { name: "Download every card" })
  453 |       ).toHaveCount(0);
  454 |     });
  455 | 
  456 |     test("TC-2044: the page is plain Spanish for a Spanish owner", async () => {
  457 |       gate();
  458 |       await gc().goto(rid, "overview");
  459 |       await setLocale("es");
  460 |       try {
  461 |         await page().reload({ waitUntil: "domcontentloaded" });
  462 |         await expect(gc().section()).toBeVisible({ timeout: 30_000 });
  463 | 
  464 |         const item = gc().sidebarItem();
  465 |         await expect(item).toBeVisible({ timeout: 30_000 });
  466 |         await expect(item).not.toContainText(EN.sidebar);
  467 |         const itemText = (await item.innerText()).trim();
```