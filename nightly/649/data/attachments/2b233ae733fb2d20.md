# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/41-gift-cards-ui.spec.ts >> Owner gift cards — web section and Payouts (UI) >> TC-2043: Payouts no longer carries gift card blocks
- Location: tests/dashboard/owner/41-gift-cards-ui.spec.ts:445:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('tab', { name: 'Payout History', selected: true })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('tab', { name: 'Payout History', selected: true })

```

```yaml
- banner:
  - img
  - button "Affiliate Partner"
  - button "Book a Demo"
  - button "Account settings": A
  - button "Select Language":
    - img
    - text: EN
  - button
- heading "Subscription Management" [level=4]
- paragraph: View your subscription details, manage payments, and access billing history
- heading "Accept customer payments" [level=6]
- text: Not started
- paragraph: You can set up your Stripe account to receive payments now, while your subscription is being assigned.
- button "Set Up Stripe Account"
- heading "No Subscription Assigned" [level=5]
- paragraph: Your restaurant has not been assigned a subscription plan yet. A subscription plan is required to access all platform features and services.
- alert: What happens next? Contact your administrator or our support team to set up a subscription plan. Once assigned, you'll be able to complete payment setup and activate all features.
- button "Contact Support"
```

```
Error: page.waitForResponse: Target page, context or browser has been closed
```

# Test source

```ts
  347 |         await gc().removeLastPreset();
  348 |         await expect(gc().presetsError()).toHaveCount(0);
  349 |         const still = dataOf((await asOwner("GET", "/config")).data);
  350 |         expect(still.presetDenominations).toEqual([20, 40, 60]);
  351 | 
  352 |         // Selling, cash and printed cards are set up by RestauNax: the owner
  353 |         // reads them as On/Off, with no switch to flip.
  354 |         const ux = releasePresent(
  355 |           "giftCardsOwnerUxDashboard",
  356 |           await probeGiftCardsOwnerUxDashboard()
  357 |         );
  358 |         if (ux) {
  359 |           const cfg = dataOf((await asOwner("GET", "/config")).data);
  360 |           await expect(gc().platformGroup()).toBeVisible();
  361 |           await expect(gc().platformHint()).toHaveText(EN.platformHint);
  362 |           const onOff = (v: unknown) => (v === true ? "On" : "Off");
  363 |           const fields = {
  364 |             selling: cfg.isEnabled,
  365 |             cash: cfg.allowCashFunding,
  366 |             physical: cfg.allowPhysicalActivation,
  367 |           } as const;
  368 |           for (const [key, value] of Object.entries(fields) as [
  369 |             keyof typeof fields,
  370 |             unknown,
  371 |           ][]) {
  372 |             await expect(gc().settingsReadonly(key)).toHaveText(onOff(value));
  373 |             await expect(gc().settingsSwitch(key)).toHaveCount(0);
  374 |           }
  375 |         }
  376 |       } finally {
  377 |         // A mid-test failure can leave a draft: discard it, so the next goto
  378 |         // never meets the unsaved-changes prompt, then restore through the API.
  379 |         await gc()
  380 |           .discardChanges()
  381 |           .catch(() => {});
  382 |         await asOwner("PUT", "/config", {
  383 |           presetDenominations: before.presetDenominations,
  384 |         });
  385 |       }
  386 |       expect(refused).toEqual([]);
  387 |     });
  388 | 
  389 |     test("TC-2041: reports tie, and the export downloads after a warning", async () => {
  390 |       gate();
  391 |       await gc().goto(rid, "reports");
  392 |       // Activity (the default report, no dates = the server's default range).
  393 |       const act = await asOwner("GET", "/reports/activity");
  394 |       expect(act.status, JSON.stringify(act.data)).toBe(200);
  395 |       const sold = Number(((dataOf(act.data).sold as Rec).total as Rec).amount);
  396 |       // Imports are not sales: nothing was sold here.
  397 |       expect(sold).toBe(0);
  398 |       await expect(gc().soldTotalAmount()).toHaveText(usd(sold), {
  399 |         timeout: 30_000,
  400 |       });
  401 | 
  402 |       await gc().openReport("rollForward");
  403 |       await expect(gc().rollForwardTies()).toBeVisible({ timeout: 30_000 });
  404 |       await expect(gc().rollForwardOff()).toHaveCount(0);
  405 |       const rfHint = (await gc().reportHint().innerText()).trim();
  406 |       expect(rfHint).not.toBe("");
  407 |       expect(looksLikeKey(rfHint), rfHint).toBe(false);
  408 | 
  409 |       const download = await gc().exportCsv(async (dialog) => {
  410 |         await expect(dialog).toContainText(EN.exportWarning);
  411 |       });
  412 |       const file = await download.path();
  413 |       const rows = parseCsv(await readFile(file, "utf8"));
  414 |       const body = rows.slice(1).filter((r) => r.some((c) => c.trim()));
  415 |       expect(body.length, JSON.stringify(rows[0])).toBeGreaterThanOrEqual(2);
  416 |       const hasCode = (code: string) =>
  417 |         body.some((r) => r.some((c) => sanitizeCode(c) === sanitizeCode(code)));
  418 |       expect(hasCode(importedBig.code), "the $50 card's full code").toBe(true);
  419 |       expect(hasCode(imported.code), "the imported card's full code").toBe(
  420 |         true
  421 |       );
  422 |       const masked = body.flat().filter((c) => isMaskedCode(c.trim()));
  423 |       expect(masked, "no masked code in the export").toEqual([]);
  424 |       expect(refused).toEqual([]);
  425 |     });
  426 | 
  427 |     test("TC-2042: browser Back returns to the previous gift cards tab", async () => {
  428 |       gate();
  429 |       await gc().goto(rid, "overview");
  430 |       await expect(gc().sectionPanel("overview")).toBeVisible();
  431 |       await gc().openSection("reports");
  432 |       await expect(page()).toHaveURL(/[?&]section=reports(&|$)/);
  433 |       await gc().openSection("settings");
  434 |       await expect(page()).toHaveURL(/[?&]section=settings(&|$)/);
  435 | 
  436 |       await page().goBack();
  437 |       await expect(page()).toHaveURL(/[?&]section=reports(&|$)/);
  438 |       await expect(gc().sectionPanel("reports")).toBeVisible();
  439 |       await page().goBack();
  440 |       await expect(page()).toHaveURL(/[?&]section=overview(&|$)/);
  441 |       await expect(page()).toHaveURL(/[?&]tab=gift-cards(&|$)/);
  442 |       await expect(gc().sectionPanel("overview")).toBeVisible();
  443 |     });
  444 | 
  445 |     test("TC-2043: Payouts no longer carries gift card blocks", async () => {
  446 |       gate();
> 447 |       const loaded = page().waitForResponse(
      |                             ^ Error: page.waitForResponse: Target page, context or browser has been closed
  448 |         (r) =>
  449 |           r.url().includes(`/api/subscriptions/restaurants/${rid}/payouts`) &&
  450 |           r.request().method() === "GET",
  451 |         { timeout: 30_000 }
  452 |       );
  453 |       await page().goto(
  454 |         `/restaurant/restaurantId/${rid}/subscription?section=payoutHistory`,
  455 |         { waitUntil: "domcontentloaded" }
  456 |       );
  457 |       await expect(
  458 |         page().getByRole("heading", { name: "Subscription Management" })
  459 |       ).toBeVisible({ timeout: 30_000 });
  460 |       await expect(
  461 |         page().getByRole("tab", { name: "Payout History", selected: true })
  462 |       ).toBeVisible();
  463 |       await loaded;
  464 |       await expect(
  465 |         page().getByText("Outstanding gift card balances")
  466 |       ).toHaveCount(0);
  467 |       await expect(page().getByText(/Gift card settlement:/)).toHaveCount(0);
  468 |       await expect(
  469 |         page().getByText(/This money is yours.*cards you sold/)
  470 |       ).toHaveCount(0);
  471 |       await expect(page().getByTestId("gift-cards-export")).toHaveCount(0);
  472 |       await expect(
  473 |         page().getByRole("button", { name: "Download every card" })
  474 |       ).toHaveCount(0);
  475 |     });
  476 | 
  477 |     test("TC-2044: the page is plain Spanish for a Spanish owner", async () => {
  478 |       gate();
  479 |       await gc().goto(rid, "overview");
  480 |       await setLocale("es");
  481 |       try {
  482 |         await page().reload({ waitUntil: "domcontentloaded" });
  483 |         await expect(gc().section()).toBeVisible({ timeout: 30_000 });
  484 | 
  485 |         const item = gc().sidebarItem();
  486 |         await expect(item).toBeVisible({ timeout: 30_000 });
  487 |         await expect(item).not.toContainText(EN.sidebar);
  488 |         const itemText = (await item.innerText()).trim();
  489 |         expect(itemText).not.toBe("");
  490 |         expect(looksLikeKey(itemText), itemText).toBe(false);
  491 | 
  492 |         await expect(gc().owedHint()).toBeVisible({ timeout: 30_000 });
  493 |         const hint = (await gc().owedHint().innerText()).trim();
  494 |         expect(hint).not.toBe(EN.owedHint);
  495 |         expect(hint).not.toBe("");
  496 |         expect(looksLikeKey(hint), hint).toBe(false);
  497 | 
  498 |         // The status chip is the server's statusText in the page's language.
  499 |         const list = async (lang: "en" | "es") =>
  500 |           (
  501 |             dataOf((await asOwner("GET", "/cards", undefined, lang)).data)
  502 |               .giftCards as Rec[]
  503 |           ).find((c) => c.id === importedBig.id) as Rec;
  504 |         const es = String((await list("es")).statusText);
  505 |         const en = String((await list("en")).statusText);
  506 |         expect(es).not.toBe(en);
  507 |         await expect(gc().rowStatus(gc().rowById(importedBig.id))).toHaveText(
  508 |           es,
  509 |           {
  510 |             timeout: 30_000,
  511 |           }
  512 |         );
  513 |         expect(looksLikeKey(es), es).toBe(false);
  514 |       } finally {
  515 |         await setLocale("en");
  516 |         await page().reload({ waitUntil: "domcontentloaded" });
  517 |       }
  518 |       expect(refused).toEqual([]);
  519 |     });
  520 | 
  521 |     test("TC-2054: a standalone restaurant has no Chain settlement report", async () => {
  522 |       gate();
  523 |       requireRelease(
  524 |         "giftCardsOwnerUxDashboard",
  525 |         await probeGiftCardsOwnerUxDashboard()
  526 |       );
  527 |       const settlementCalls: string[] = [];
  528 |       const onRequest = (req: { url: () => string }) => {
  529 |         if (req.url().includes("/reports/settlement"))
  530 |           settlementCalls.push(req.url());
  531 |       };
  532 |       page().on("request", onRequest);
  533 |       try {
  534 |         await gc().goto(rid, "reports");
  535 |         await expect(gc().reportTab("activity")).toBeVisible({
  536 |           timeout: 30_000,
  537 |         });
  538 |         await expect(gc().reportTab("rollForward")).toBeVisible();
  539 |         await expect(gc().reportTab("settlement")).toHaveCount(0);
  540 | 
  541 |         // An old link to the chain report falls back to Activity.
  542 |         await page().goto(
  543 |           `/restaurant/restaurantId/${rid}/restaurantManagement?tab=gift-cards&section=reports&report=settlement`,
  544 |           { waitUntil: "domcontentloaded" }
  545 |         );
  546 |         await expect(gc().soldTotalAmount()).toBeVisible({ timeout: 30_000 });
  547 |         await expect(
```