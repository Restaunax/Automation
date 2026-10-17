# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/18-chain-deals.spec.ts >> Owner — Chain deals >> TC-366: creating a chain deal in the chain shell goes through the fan-out confirm and lands at every location
- Location: tests/dashboard/owner/18-chain-deals.spec.ts:225:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/Menu items shown reflect the chain's first location/)
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText(/Menu items shown reflect the chain's first location/)

```

```yaml
- banner:
  - text: CHAIN Chain — Create New Deal
  - combobox:
    - paragraph: All chain locations
  - button "Account settings": A
  - button "Select Language":
    - img
    - text: EN
  - button
- navigation "chain navigation":
  - button "Analytics":
    - paragraph: Analytics
  - button "Locations":
    - paragraph: Locations
  - button "Orders":
    - paragraph: Orders
  - button "Menu":
    - paragraph: Menu
  - button "Customers":
    - paragraph: Customers
  - button "Coupons":
    - paragraph: Coupons
  - button "Deals":
    - paragraph: Deals
  - button "Image Gallery":
    - paragraph: Image Gallery
  - button "Team":
    - paragraph: Team
  - button "Billing":
    - paragraph: Billing
  - button "Owner Settings":
    - paragraph: Owner Settings
- main:
  - status:
    - paragraph: CHAIN VIEW — changes affect all 2 chain locations
  - button
  - heading "Create New Deal" [level=1]
  - group "What kind of deal?":
    - text: What kind of deal?
    - paragraph: Pick one to start. You can change it later.
    - radiogroup "What kind of deal?":
      - radio "Combo A set price for a few items. Burger + fries + drink for $12":
        - heading "Combo" [level=6]
        - paragraph: A set price for a few items.
        - text: Burger + fries + drink for $12
      - radio "Buy one get one free They buy an item and get another one free. Buy a burger, get a burger free":
        - heading "Buy one get one free" [level=6]
        - paragraph: They buy an item and get another one free.
        - text: Buy a burger, get a burger free
      - radio "Buy one get one % off They buy an item and get another one at a discount. Buy a pizza, get a second one half off":
        - heading "Buy one get one % off" [level=6]
        - paragraph: They buy an item and get another one at a discount.
        - text: Buy a pizza, get a second one half off
      - radio "Percent off A percentage off a few items. 20% off the family meal":
        - heading "Percent off" [level=6]
        - paragraph: A percentage off a few items.
        - text: 20% off the family meal
  - button "Cancel"
- button "Open chat"
```

# Test source

```ts
  148 |     await allure.label("feature", "Chain Deals");
  149 |     await allure.label("severity", "critical");
  150 |     if (token) token = await freshToken();
  151 |   });
  152 | 
  153 |   test("TC-365: the chain shell lists chain deals with the Chain chip, rollup caption and View Analytics; a member's own Deals section is managed at chain level", async ({
  154 |     ownerPage,
  155 |   }) => {
  156 |     skipWithoutChain();
  157 |     await allure.description(
  158 |       "/chain/:gid/restaurantManagement?tab=deals renders the seeded chain deal row (name, 2 items, $12.00 / " +
  159 |         "$15.00, 20% off, 'Chain' scope chip), the caption 'across 2 chain locations' and the chain-only " +
  160 |         "'View Analytics' button, which opens Deal Analytics fed by /api/chains/:gid/deal-stats. Location A's " +
  161 |         "shell shows the Deals sidebar entry disabled and ?tab=deals renders 'Managed at chain level'; its owner " +
  162 |         "list (GET /api/deals/restaurant/A) does not contain the chain deal, while public /active at A and B does."
  163 |     );
  164 |     const dealsPage = createOwnerDealsPage(ownerPage);
  165 |     const analytics = createDealAnalyticsPage(ownerPage);
  166 |     await dealsPage.gotoChainManageDeals(chainGroupId);
  167 |     await expect(dealsPage.chainRollupCaption()).toHaveText(
  168 |       "across 2 chain locations"
  169 |     );
  170 |     await expect(dealsPage.viewAnalyticsButton()).toBeVisible();
  171 |     const row = dealsPage.row(seededChainDeal.name);
  172 |     await expect(row).toBeVisible({ timeout: 15_000 });
  173 |     await expect(row).toContainText("2 items");
  174 |     await expect(row).toContainText("$12.00");
  175 |     await expect(row).toContainText("$15.00");
  176 |     await expect(row).toContainText("20% off");
  177 |     await expect(dealsPage.rowScopeChip(seededChainDeal.name)).toHaveText(
  178 |       "Chain"
  179 |     );
  180 | 
  181 |     await allure.step("View Analytics → chain deal stats", async () => {
  182 |       const [statsRes] = await Promise.all([
  183 |         ownerPage.waitForResponse(
  184 |           (r) =>
  185 |             new RegExp(`/api/chains/${chainGroupId}/deal-stats`).test(
  186 |               r.url()
  187 |             ) && r.request().method() === "GET",
  188 |           { timeout: 20_000 }
  189 |         ),
  190 |         dealsPage.viewAnalyticsButton().click(),
  191 |       ]);
  192 |       expect(statsRes.status()).toBe(200);
  193 |       const stats = (await statsRes.json()) as {
  194 |         summary: { totalCount: number; activeCount: number };
  195 |       };
  196 |       await analytics.assertLoaded();
  197 |       await expect(analytics.metricValue("Total Deals")).toHaveText(
  198 |         String(stats.summary.totalCount)
  199 |       );
  200 |       expect(stats.summary.totalCount).toBeGreaterThanOrEqual(1);
  201 |     });
  202 | 
  203 |     await allure.step("member location: managed at chain level", async () => {
  204 |       await dealsPage.gotoTab(locA, "deals");
  205 |       await expect(dealsPage.disabledSidebarDeals()).toBeVisible({
  206 |         timeout: 15_000,
  207 |       });
  208 |       await expect(dealsPage.chainManagedHeading()).toBeVisible();
  209 |       await expect(dealsPage.row(seededChainDeal.name)).toHaveCount(0);
  210 |     });
  211 | 
  212 |     await allure.step("scope: owner list vs public /active", async () => {
  213 |       const ownerListA = await getRestaurantDeals(token, locA);
  214 |       expect(ownerListA.some((d) => d.id === seededChainDeal.id)).toBe(false);
  215 |       for (const loc of [locA, locB]) {
  216 |         const pub = await getActiveDealsPublic(loc);
  217 |         expect(
  218 |           (pub.data.deals ?? []).some((d) => d.id === seededChainDeal.id),
  219 |           `offered at ${loc}`
  220 |         ).toBe(true);
  221 |       }
  222 |     });
  223 |   });
  224 | 
  225 |   test("TC-366: creating a chain deal in the chain shell goes through the fan-out confirm and lands at every location", async ({
  226 |     ownerPage,
  227 |   }) => {
  228 |     skipWithoutChain();
  229 |     await allure.description(
  230 |       "Chain shell → Create Deal: the picker lists shared master items (anchor-location caption), the submit " +
  231 |         "reads 'Create deal for all 2 locations', clicking it opens 'Heads up — chain-wide change' → Continue → " +
  232 |         "POST /api/chains/:gid/deals 201 → 'Deal created successfully' → back on the chain table with a 'Chain' " +
  233 |         "row; public /active at BOTH locations lists it. (The fan-out confirm is suppressed for the rest of the " +
  234 |         "browser session after the first Continue — this test clears that flag first.)"
  235 |     );
  236 |     const dealsPage = createOwnerDealsPage(ownerPage);
  237 |     const form = createDealFormPage(ownerPage);
  238 |     const name = `AUTO Chain UI ${runId}`;
  239 |     await dealsPage.gotoChainTab(chainGroupId, "create-deal");
  240 |     await ownerPage.evaluate(() => {
  241 |       for (const k of Object.keys(sessionStorage))
  242 |         if (k.startsWith("restaunax:fanOutConfirm"))
  243 |           sessionStorage.removeItem(k);
  244 |     });
  245 |     await form.assertCreateMode();
  246 |     await expect(
  247 |       ownerPage.getByText(/Menu items shown reflect the chain's first location/)
> 248 |     ).toBeVisible();
      |       ^ Error: expect(locator).toBeVisible() failed
  249 |     await form.nameInput().fill(name);
  250 |     // Guided deal types: a COMBO on the new form, the picker on the old one.
  251 |     await form.addComboItems([s1.name, s2.name]);
  252 |     await form.priceInput().fill("13");
  253 |     await expect(form.submitButton()).toHaveText(
  254 |       "Create deal for all 2 locations"
  255 |     );
  256 |     await form.submitButton().click();
  257 |     await expect(form.fanOutDialog()).toBeVisible({ timeout: 10_000 });
  258 |     await expect(form.fanOutDialog()).toContainText("create a deal");
  259 |     const [res] = await Promise.all([
  260 |       ownerPage.waitForResponse(
  261 |         (r) =>
  262 |           new RegExp(`/api/chains/${chainGroupId}/deals$`).test(r.url()) &&
  263 |           r.request().method() === "POST",
  264 |         { timeout: 20_000 }
  265 |       ),
  266 |       form.fanOutContinue().click(),
  267 |     ]);
  268 |     expect(res.status()).toBe(201);
  269 |     const created = ((await res.json()) as { deal?: ApiDeal }).deal;
  270 |     if (created?.id) createdDealIds.push(created.id);
  271 |     expect(created?.restaurantGroupId).toBe(chainGroupId);
  272 |     await expect(form.createdSnackbar()).toBeVisible({ timeout: 5_000 });
  273 |     await dealsPage.assertManageDealsLoaded();
  274 |     await dealsPage.search(name);
  275 |     const row = dealsPage.row(name);
  276 |     await expect(row).toBeVisible({ timeout: 15_000 });
  277 |     await expect(row).toContainText("$13.00");
  278 |     await expect(row).toContainText("$15.00");
  279 |     await expect(dealsPage.rowScopeChip(name)).toHaveText("Chain");
  280 |     for (const loc of [locA, locB]) {
  281 |       const pub = await getActiveDealsPublic(loc);
  282 |       expect(
  283 |         (pub.data.deals ?? []).some((d) => d.id === created?.id),
  284 |         `offered at ${loc}`
  285 |       ).toBe(true);
  286 |     }
  287 |   });
  288 | 
  289 |   // ── Deal scheduling in the chain shell (restaunax Plans 1 + 2) ─────────────
  290 |   //
  291 |   // Location B gets one closed weekday — the restaurant-local day THREE days
  292 |   // out, so no order today/tomorrow at B is affected — restored to its exact
  293 |   // original rows in a finally inside each test that needs it. Location A (24h) never warns.
  294 |   test.describe("schedule", () => {
  295 |     let tzA = "";
  296 |     let closedDay: DayName = "SUNDAY";
  297 |     test.beforeAll(async () => {
  298 |       if (!chainGroupId) return;
  299 |       tzA = await getRestaurantTimeZonePublic(locA);
  300 |       if (!tzA) return;
  301 |       closedDay = dayNameOfKey(
  302 |         localDateKey((await getRestaurantTimeZonePublic(locB)) || tzA, 3)
  303 |       );
  304 |     });
  305 | 
  306 |     /**
  307 |      * Run `body` with location B closed on `closedDay`; B's exact original
  308 |      * rows are restored in finally, so only the tests that need the change
  309 |      * hold it, and only for their own duration.
  310 |      */
  311 |     const withClosedDayAtB = async (body: () => Promise<void>) => {
  312 |       const t = await freshToken();
  313 |       const originalB =
  314 |         (await getBusinessHoursRaw(t, locB)).data.businessHours ?? [];
  315 |       const base: BusinessHoursRow[] = originalB.length
  316 |         ? originalB
  317 |         : DAY_NAMES.map((day) => ({
  318 |             day,
  319 |             openingTime: null,
  320 |             closingTime: null,
  321 |             isClosed: false,
  322 |             is24Hours: true,
  323 |           }));
  324 |       await setBusinessHoursApi(
  325 |         t,
  326 |         locB,
  327 |         base.map((r) =>
  328 |           r.day === closedDay
  329 |             ? {
  330 |                 day: r.day,
  331 |                 openingTime: null,
  332 |                 closingTime: null,
  333 |                 isClosed: true,
  334 |                 is24Hours: false,
  335 |               }
  336 |             : r
  337 |         )
  338 |       );
  339 |       try {
  340 |         await body();
  341 |       } finally {
  342 |         await setBusinessHoursApi(await freshToken(), locB, originalB);
  343 |       }
  344 |     };
  345 | 
  346 |     test.beforeEach(() => {
  347 |       skipWithoutChain();
  348 |       requireScheduling("backend", Boolean(tzA));
```