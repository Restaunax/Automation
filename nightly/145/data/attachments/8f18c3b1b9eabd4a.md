# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/11-deals.spec.ts >> Owner — Deals >> TC-352: search filters by name and description; no match → 'No deals found' + 'Create Your First Deal'; Refresh re-fetches
- Location: tests/dashboard/owner/11-deals.spec.ts:284:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 401
```

# Test source

```ts
  207 | 
  208 |   // ── Manage Deals table ────────────────────────────────────────────────────
  209 | 
  210 |   test("TC-351: the table renders the seeded deals cell-for-cell and the stat cards equal the page's own list response", async ({
  211 |     ownerPage,
  212 |   }) => {
  213 |     await allure.description(
  214 |       "For API-seeded deals the row shows: name, 'N items' (qty-1 slots), $deal + struck $original, " +
  215 |         "'X% off' (0 dp), restrictions ('All days'/'All day' or 'Mon, Wed' + '11:00 - 14:00'), the status " +
  216 |         "badge, and '0 times'. Stat cards Total/Active Deals equal the counts in the GET " +
  217 |         "/api/deals/restaurant/:id response the page itself received (concurrency-safe)."
  218 |     );
  219 |     const dealsPage = createOwnerDealsPage(ownerPage);
  220 |     const [listRes] = await Promise.all([
  221 |       ownerPage.waitForResponse(
  222 |         (r) =>
  223 |           new RegExp(`/api/deals/restaurant/${restaurantId}$`).test(r.url()) &&
  224 |           r.request().method() === "GET",
  225 |         { timeout: 30_000 }
  226 |       ),
  227 |       dealsPage.gotoTab(restaurantId, "deals"),
  228 |     ]);
  229 |     const list = ((await listRes.json()) as { deals?: ApiDeal[] }).deals ?? [];
  230 |     await dealsPage.assertManageDealsLoaded();
  231 |     await dealsPage.setRowsPerPage(25);
  232 | 
  233 |     await allure.step("plain deal row", async () => {
  234 |       const row = dealsPage.row(N.plain);
  235 |       await expect(row).toBeVisible({ timeout: 15_000 });
  236 |       await expect(row).toContainText("2 items");
  237 |       await expect(row).toContainText("$12.00");
  238 |       await expect(row).toContainText("$16.50");
  239 |       await expect(row).toContainText("27% off");
  240 |       await expect(row).toContainText("All days");
  241 |       await expect(row).toContainText("All day");
  242 |       await expect(row).toContainText("0 times");
  243 |       await expect(dealsPage.rowStatusText(N.plain)).toHaveText("Active");
  244 |       await expect(dealsPage.rowSwitch(N.plain)).toBeChecked();
  245 |       await expect(dealsPage.rowScopeChip(N.plain)).toHaveText("Location");
  246 |     });
  247 |     await allure.step("restricted deal shows its window", async () => {
  248 |       const row = dealsPage.row(N.restricted);
  249 |       await expect(row).toContainText("Mon, Wed");
  250 |       await expect(row).toContainText("11:00 - 14:00");
  251 |     });
  252 |     await allure.step("pricey deal: 3 slots, 20 of 24 → 17% off", async () => {
  253 |       const row = dealsPage.row(N.pricey);
  254 |       await expect(row).toContainText("3 items");
  255 |       await expect(row).toContainText("$20.00");
  256 |       await expect(row).toContainText("$24.00");
  257 |       await expect(row).toContainText("17% off");
  258 |     });
  259 |     await allure.step("inactive + expired badges", async () => {
  260 |       await expect(dealsPage.rowStatusText(N.inactive)).toHaveText("Inactive");
  261 |       await expect(dealsPage.rowSwitch(N.inactive)).not.toBeChecked();
  262 |       await expect(dealsPage.rowStatusText(N.expired)).toHaveText("Expired");
  263 |       await expect(dealsPage.rowSwitch(N.expired)).toBeDisabled();
  264 |     });
  265 |     await allure.step("stat cards = list response", async () => {
  266 |       const active = list.filter(
  267 |         (d) =>
  268 |           d.status === "ACTIVE" &&
  269 |           (!d.endDate || new Date(d.endDate) > new Date())
  270 |       ).length;
  271 |       await expect(dealsPage.statCardValue("Total Deals")).toHaveText(
  272 |         String(list.length)
  273 |       );
  274 |       await expect(dealsPage.statCardValue("Active Deals")).toHaveText(
  275 |         String(active)
  276 |       );
  277 |       const used = list.reduce((s, d) => s + (d.timesUsed ?? 0), 0);
  278 |       await expect(dealsPage.statCardValue("Times Used")).toHaveText(
  279 |         String(used)
  280 |       );
  281 |     });
  282 |   });
  283 | 
  284 |   test("TC-352: search filters by name and description; no match → 'No deals found' + 'Create Your First Deal'; Refresh re-fetches", async ({
  285 |     ownerPage,
  286 |   }) => {
  287 |     const dealsPage = createOwnerDealsPage(ownerPage);
  288 |     await dealsPage.gotoManageDeals(restaurantId);
  289 |     await dealsPage.search(N.cheap);
  290 |     await expect(dealsPage.row(N.cheap)).toBeVisible();
  291 |     await expect(dealsPage.row(N.plain)).toHaveCount(0);
  292 |     await dealsPage.search(`table-search-${runId}`);
  293 |     await expect(dealsPage.row(N.plain)).toBeVisible();
  294 |     await expect(dealsPage.row(N.cheap)).toHaveCount(0);
  295 |     await dealsPage.search(`zzz-no-such-deal-${runId}`);
  296 |     await expect(dealsPage.emptyState()).toBeVisible();
  297 |     await expect(dealsPage.createFirstDealButton()).toBeVisible();
  298 |     await dealsPage.search("");
  299 |     const [res] = await Promise.all([
  300 |       ownerPage.waitForResponse(
  301 |         (r) =>
  302 |           new RegExp(`/api/deals/restaurant/${restaurantId}$`).test(r.url()) &&
  303 |           r.request().method() === "GET"
  304 |       ),
  305 |       dealsPage.refreshButton().click(),
  306 |     ]);
> 307 |     expect(res.status()).toBe(200);
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  308 |     await dealsPage.search(N.plain);
  309 |     await expect(dealsPage.row(N.plain)).toBeVisible();
  310 |   });
  311 | 
  312 |   test("TC-353: the Status filter narrows to Active / Inactive / Expired; an expired row has a disabled switch with 'Cannot toggle expired deals'", async ({
  313 |     ownerPage,
  314 |   }) => {
  315 |     const dealsPage = createOwnerDealsPage(ownerPage);
  316 |     await dealsPage.gotoManageDeals(restaurantId);
  317 |     await dealsPage.search(`AUTO Table`);
  318 |     await dealsPage.selectStatusFilter("Inactive");
  319 |     await expect(dealsPage.row(N.inactive)).toBeVisible();
  320 |     await expect(dealsPage.row(N.restricted)).toBeVisible();
  321 |     await expect(dealsPage.row(N.plain)).toHaveCount(0);
  322 |     await expect(dealsPage.row(N.expired)).toHaveCount(0);
  323 |     await dealsPage.selectStatusFilter("Expired");
  324 |     await expect(dealsPage.row(N.expired)).toBeVisible();
  325 |     await expect(dealsPage.row(N.plain)).toHaveCount(0);
  326 |     await expect(dealsPage.rowSwitch(N.expired)).toBeDisabled();
  327 |     await expect(dealsPage.rowSwitchTooltip(N.expired)).toHaveAttribute(
  328 |       "aria-label",
  329 |       "Cannot toggle expired deals"
  330 |     );
  331 |     await dealsPage.selectStatusFilter("Active");
  332 |     await expect(dealsPage.row(N.plain)).toBeVisible();
  333 |     await expect(dealsPage.row(N.inactive)).toHaveCount(0);
  334 |     await expect(dealsPage.row(N.expired)).toHaveCount(0);
  335 |     await expect(dealsPage.rowSwitchTooltip(N.plain)).toHaveAttribute(
  336 |       "aria-label",
  337 |       "Deactivate"
  338 |     );
  339 |     await dealsPage.selectStatusFilter("All Statuses");
  340 |     await expect(dealsPage.row(N.inactive)).toBeVisible();
  341 |   });
  342 | 
  343 |   test("TC-354: sorting by Price and Savings orders the seeded rows by the server numbers", async ({
  344 |     ownerPage,
  345 |   }) => {
  346 |     const dealsPage = createOwnerDealsPage(ownerPage);
  347 |     await dealsPage.gotoManageDeals(restaurantId);
  348 |     await dealsPage.search(`AUTO Table`);
  349 |     const order = async () =>
  350 |       (await dealsPage.rowNames()).filter((n) => n.includes(runId));
  351 |     // rowNames() is a one-shot read — poll until the re-render lands.
  352 |     const expectOrder = (before: string, after: string) =>
  353 |       expect
  354 |         .poll(
  355 |           async () => {
  356 |             const names = await order();
  357 |             return names.indexOf(before) < names.indexOf(after);
  358 |           },
  359 |           { timeout: 10_000, message: `${before} before ${after}` }
  360 |         )
  361 |         .toBe(true);
  362 |     await dealsPage.sortBy("Price"); // asc
  363 |     await expectOrder(N.cheap, N.plain);
  364 |     await expectOrder(N.plain, N.pricey);
  365 |     await dealsPage.sortBy("Price"); // desc
  366 |     await expectOrder(N.pricey, N.cheap);
  367 |     // Savings %: cheap 8/10.5 → 23.8%, plain 12/16.5 → 27.3%, pricey 20/24 → 16.7%
  368 |     await dealsPage.sortBy("Savings"); // asc
  369 |     await expectOrder(N.pricey, N.cheap);
  370 |     await expectOrder(N.cheap, N.plain);
  371 |   });
  372 | 
  373 |   test("TC-355: expanding a row lists its slots as '1x <item> ($price)' chips", async ({
  374 |     ownerPage,
  375 |   }) => {
  376 |     const dealsPage = createOwnerDealsPage(ownerPage);
  377 |     await dealsPage.gotoManageDeals(restaurantId);
  378 |     await dealsPage.search(N.pricey);
  379 |     await dealsPage.expandRow(N.pricey);
  380 |     const chips = dealsPage.expandedItemChips();
  381 |     await expect(chips).toHaveCount(3);
  382 |     await expect(
  383 |       chips.filter({ hasText: `1x ${itemA.name} ($10.00)` })
  384 |     ).toHaveCount(2);
  385 |     await expect(
  386 |       chips.filter({ hasText: `1x ${itemC.name} ($4.00)` })
  387 |     ).toHaveCount(1);
  388 |   });
  389 | 
  390 |   test("TC-356: the status switch deactivates and re-activates a deal (PATCH 200 + snackbar + badge)", async ({
  391 |     ownerPage,
  392 |   }) => {
  393 |     const dealsPage = createOwnerDealsPage(ownerPage);
  394 |     await dealsPage.gotoManageDeals(restaurantId);
  395 |     await dealsPage.search(N.cheap);
  396 |     await expect(dealsPage.rowStatusText(N.cheap)).toHaveText("Inactive");
  397 |     const on = await dealsPage.activateWithRetry(N.cheap);
  398 |     expect(on.status, JSON.stringify(on.body)).toBe(200);
  399 |     await expect(dealsPage.snackbar("Deal activated successfully")).toBeVisible(
  400 |       {
  401 |         timeout: 5_000,
  402 |       }
  403 |     );
  404 |     await expect(dealsPage.rowStatusText(N.cheap)).toHaveText("Active");
  405 |     await expect(dealsPage.rowSwitch(N.cheap)).toBeChecked();
  406 |     expect((await getDealApi(token, seeded.cheap!.id)).status).toBe("ACTIVE");
  407 |     const off = await dealsPage.toggleStatus(N.cheap);
```