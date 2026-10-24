# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/18-tables-floor.spec.ts >> Owner — Tables & Floor >> TC-435: create a section and two tables through the UI forms; the list groups them under the section
- Location: tests/dashboard/owner/18-tables-floor.spec.ts:193:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  getByText('Main 93acc831', { exact: true }).first()
Expected: visible
Received: hidden
Timeout:  10000ms

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('Main 93acc831', { exact: true }).first()
    23 × locator resolved to <button role="tab" tabindex="0" type="button" aria-selected="true" class="MuiButtonBase-root MuiTab-root MuiTab-textColorPrimary Mui-selected css-exb9yt">Main 93acc831</button>
       - unexpected value "hidden"

```

```yaml
- banner:
  - text: LOCATION Automation Owner2 Store 93acc831 — Miami — Tables & Floor
  - paragraph: Automation Owner2 Store 93acc831
  - text: Miami, FL
  - button "Account settings": A
  - button "Select Language":
    - img
    - text: EN
  - button
- navigation "mailbox folders":
  - button "Collapse sidebar"
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
  - button "Restaurant Staff":
    - paragraph: Restaurant Staff
  - button "Coupons":
    - paragraph: Coupons
  - button "Deals":
    - paragraph: Deals
  - button "Print Shop":
    - paragraph: Print Shop
  - button "Owner Settings":
    - paragraph: Owner Settings
- main:
  - paragraph: "Managing: Automation Owner2 Store 93acc831"
  - heading "Tables & Floor" [level=1]
  - group "Tables view":
    - button "Floor plan"
    - button "Sections & tables" [pressed]
  - heading "Sections" [level=6]
  - paragraph: Group tables by room, patio or floor. Tables must be moved out of a section before it can be deleted.
  - button "Add Section"
  - table:
    - rowgroup:
      - row "Name Color Order Tables Status":
        - columnheader "Name"
        - columnheader "Color"
        - columnheader "Order"
        - columnheader "Tables"
        - columnheader "Status"
        - columnheader
    - rowgroup:
      - row "Main 93acc831 0 2 Active Edit Move all tables out of this section before deleting it.":
        - cell "Main 93acc831"
        - cell
        - cell "0"
        - cell "2"
        - cell "Active"
        - cell "Edit Move all tables out of this section before deleting it.":
          - button "Edit"
          - button "Delete" [disabled]
  - heading "Tables" [level=6]
  - button "Add Table"
  - heading "Main 93acc831" [level=6]
  - table:
    - rowgroup:
      - row "Name Capacity Min. party Bookable Status Open checks":
        - columnheader "Name"
        - columnheader "Capacity"
        - columnheader "Min. party"
        - columnheader "Bookable"
        - columnheader "Status"
        - columnheader "Open checks"
        - columnheader
    - rowgroup:
      - row "T1 93acc831 — — Yes Active 0 Actions":
        - cell "T1 93acc831"
        - cell "—"
        - cell "—"
        - cell "Yes"
        - cell "Active"
        - cell "0"
        - cell "Actions":
          - button "Actions"
      - row "T2 93acc831 — — Yes Active 0 Actions":
        - cell "T2 93acc831"
        - cell "—"
        - cell "—"
        - cell "Yes"
        - cell "Active"
        - cell "0"
        - cell "Actions":
          - button "Actions"
  - heading "Combinations" [level=6]
  - paragraph: Combine adjacent tables into one bookable unit for large parties. Available with Reservations.
  - button "Add Combination"
  - paragraph: No combinations yet.
  - alert:
    - text: Table created.
    - button "Close"
- button "Open chat"
```

# Test source

```ts
  115 |     // revoke failure here would only mask the results above.
  116 |     await deleteFeatureOverrideAdminRaw(
  117 |       adminToken,
  118 |       restaurantId,
  119 |       "TABLE_RESERVATIONS"
  120 |     ).catch(() => {});
  121 |     // Best-effort — the whole throwaway restaurant is archived regardless,
  122 |     // so a transient delete failure here would only mask the results above.
  123 |     if (restaurantId && !process.env.OWNER2_EMAIL)
  124 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  125 |     // Closed last, after the API cleanup above, and guarded — a throw
  126 |     // closing the browser context must never skip that cleanup.
  127 |     if (session) await session.context.close().catch(() => {});
  128 |   });
  129 | 
  130 |   test.beforeEach(async () => {
  131 |     await allure.label("feature", "Owner Tables & Floor");
  132 |     await allure.label("severity", "critical");
  133 |   });
  134 | 
  135 |   test("TC-434: nav + gating — Tables & Floor and Reservations both reachable via the Store Operations flyout; an unentitled tenant sees neither", async ({
  136 |     browser,
  137 |   }) => {
  138 |     await allure.description(
  139 |       "The entitled throwaway owner reaches both tabs via the sidebar's Store " +
  140 |         "Operations flyout (hover + click, same pattern as the Deals/Coupons " +
  141 |         "flyouts). A SECOND, unentitled throwaway tenant never sees either nav " +
  142 |         "item at all — STORE_OPERATIONS itself (the flyout section) is " +
  143 |         "starter-floor and still renders, just without the two gated rows."
  144 |     );
  145 |     await floorPage.navigateViaSidebar(restaurantId);
  146 |     await expect(session.page).toHaveURL(/tab=tables/);
  147 |     await floorPage.assertLoaded();
  148 | 
  149 |     await floorPage.openStoreOpsFlyout();
  150 |     await floorPage.reservationsNavItem().click();
  151 |     await session.page.waitForURL(/tab=reservations/, { timeout: 10_000 });
  152 |     await expect(
  153 |       session.page.getByRole("heading", { name: "Reservations", level: 1 })
  154 |     ).toBeVisible({ timeout: 15_000 });
  155 | 
  156 |     if (process.env.OWNER2_EMAIL) {
  157 |       console.warn(
  158 |         "[TC-434] OWNER2_EMAIL supplied — skipping the negative unentitled-tenant " +
  159 |           "check (an env-supplied tenant may already be entitled and a fresh " +
  160 |           "isolated one can't be minted)."
  161 |       );
  162 |       return;
  163 |     }
  164 | 
  165 |     const negRunId = generateRunId();
  166 |     const negTenant = await createSecondOwner(adminToken, negRunId);
  167 |     if (!negTenant.restaurantId)
  168 |       throw new Error("[TC-434] could not mint the negative-case tenant");
  169 |     const negPassword = "Automation!Owner2-" + negRunId;
  170 |     const negSession = await loginViaUi(browser, negTenant.email, negPassword);
  171 |     try {
  172 |       await createOwnerRestaurantManagementPage(negSession.page).goto(
  173 |         negTenant.restaurantId
  174 |       );
  175 |       const negFloorPage = createOwnerTablesFloorPage(negSession.page);
  176 |       await negFloorPage.storeOpsHeader().hover();
  177 |       await negFloorPage.storeOpsHeader().click();
  178 |       await expect(negFloorPage.tablesFloorNavItem()).toHaveCount(0);
  179 |       await expect(negFloorPage.reservationsNavItem()).toHaveCount(0);
  180 |     } finally {
  181 |       await negSession.context.close();
  182 |       // Best-effort — this negative-case tenant is throwaway and referenced
  183 |       // nowhere else; a transient delete failure here would only mask the
  184 |       // assertions above.
  185 |       await deleteTestRestaurant(adminToken, negTenant.restaurantId).catch(
  186 |         () => {}
  187 |       );
  188 |     }
  189 |   });
  190 | 
  191 |   // ── Sections + tables list ──────────────────────────────────────────────
  192 | 
  193 |   test("TC-435: create a section and two tables through the UI forms; the list groups them under the section", async () => {
  194 |     await floorPage.gotoTab(restaurantId);
  195 |     await floorPage.assertLoaded();
  196 |     await floorPage.showView("manage");
  197 | 
  198 |     const sectionRes = await floorPage.createSection(sectionName);
  199 |     expect(sectionRes.status()).toBe(201);
  200 |     await expect(floorPage.sectionRow(sectionName)).toBeVisible({
  201 |       timeout: 10_000,
  202 |     });
  203 | 
  204 |     const t1Res = await floorPage.createTable(table1, { sectionName });
  205 |     expect(t1Res.status()).toBe(201);
  206 |     const t2Res = await floorPage.createTable(table2, { sectionName });
  207 |     expect(t2Res.status()).toBe(201);
  208 | 
  209 |     await expect(floorPage.tableRow(table1)).toBeVisible({ timeout: 10_000 });
  210 |     await expect(floorPage.tableRow(table2)).toBeVisible();
  211 |     // TablesListPanel groups by section — its own subtitle heading for the
  212 |     // group repeats the section's name above that section's table.
  213 |     await expect(
  214 |       session.page.getByText(sectionName, { exact: true }).first()
> 215 |     ).toBeVisible();
      |       ^ Error: expect(locator).toBeVisible() failed
  216 | 
  217 |     const list = unwrap(await listTablesOwnerRaw(ownerToken, restaurantId)) as {
  218 |       tables: Record<string, unknown>[];
  219 |     };
  220 |     const row1 = list.tables.find((t) => t.name === table1);
  221 |     const row2 = list.tables.find((t) => t.name === table2);
  222 |     expect(row1?.sectionId).toBeTruthy();
  223 |     expect(row1?.sectionId).toBe(row2?.sectionId);
  224 |   });
  225 | 
  226 |   // ── Floor editor (Konva canvas) ──────────────────────────────────────────
  227 | 
  228 |   test("TC-436: floor editor — place T1 from the All tables browser, Save layout, reload → still placed", async () => {
  229 |     await allure.description(
  230 |       "Floor editor rework (2026-10-07): the Unplaced tray is gone — an " +
  231 |         "unplaced table is placed by clicking it in the 'All tables' browser, " +
  232 |         "which drops it at the nearest free spot to the visible centre and " +
  233 |         "selects it. 'Save layout' sends PATCH .../tables/layout; after a " +
  234 |         "reload the browser lists T1 as 'On floor' and the API carries real " +
  235 |         "geometry at the default rectangle size."
  236 |     );
  237 |     await floorPage.gotoTab(restaurantId);
  238 |     await floorPage.assertLoaded();
  239 |     await floorPage.showView("floor");
  240 |     await floorPage.sectionTab(sectionName).click();
  241 |     await expect(await floorPage.openTablesBrowserRow(table1)).toContainText(
  242 |       "Not placed"
  243 |     );
  244 | 
  245 |     await floorPage.pickTableInBrowser(table1);
  246 | 
  247 |     await expect(floorPage.saveLayoutButton()).toBeVisible({ timeout: 5_000 });
  248 |     const [saveRes] = await Promise.all([
  249 |       session.page.waitForResponse(
  250 |         (r) =>
  251 |           /\/tables\/layout$/.test(r.url()) && r.request().method() === "PATCH",
  252 |         { timeout: 15_000 }
  253 |       ),
  254 |       floorPage.saveLayoutButton().click(),
  255 |     ]);
  256 |     expect(saveRes.status()).toBe(200);
  257 |     await expect(floorPage.saveLayoutButton()).toBeHidden({ timeout: 5_000 });
  258 | 
  259 |     await session.page.reload({ waitUntil: "domcontentloaded" });
  260 |     await floorPage.assertLoaded();
  261 |     await floorPage.sectionTab(sectionName).click();
  262 |     await expect(await floorPage.openTablesBrowserRow(table1)).toContainText(
  263 |       "On floor"
  264 |     );
  265 | 
  266 |     const RECT = { width: 160, height: 100 }; // floorGeometry DEFAULT_RECT_SIZE
  267 |     const list = unwrap(await listTablesOwnerRaw(ownerToken, restaurantId)) as {
  268 |       tables: Record<string, unknown>[];
  269 |     };
  270 |     const row = list.tables.find((t) => t.name === table1) as
  271 |       | {
  272 |           geometry?: {
  273 |             posX: number | null;
  274 |             posY: number | null;
  275 |             width: number | null;
  276 |             height: number | null;
  277 |             rotation: number;
  278 |           };
  279 |           shape?: string;
  280 |         }
  281 |       | undefined;
  282 |     expect(row?.shape).toBe("RECTANGLE");
  283 |     expect(row?.geometry).toMatchObject({
  284 |       width: RECT.width,
  285 |       height: RECT.height,
  286 |       rotation: 0,
  287 |     });
  288 |     // Free-spot placement: exact coordinates depend on the viewport — assert
  289 |     // the table landed on the 2000x1200 canvas, fully inside it.
  290 |     const { posX, posY } = row!.geometry!;
  291 |     expect(typeof posX).toBe("number");
  292 |     expect(typeof posY).toBe("number");
  293 |     expect(posX!).toBeGreaterThanOrEqual(0);
  294 |     expect(posY!).toBeGreaterThanOrEqual(0);
  295 |     expect(posX! + RECT.width).toBeLessThanOrEqual(2000);
  296 |     expect(posY! + RECT.height).toBeLessThanOrEqual(1200);
  297 |   });
  298 | 
  299 |   test("TC-437: inspector — select the placed table on a fresh load, change capacity + bookable, Save details; API confirms", async () => {
  300 |     await floorPage.gotoTab(restaurantId);
  301 |     await floorPage.assertLoaded();
  302 |     await floorPage.showView("floor");
  303 |     await floorPage.sectionTab(sectionName).click();
  304 |     await expect(floorPage.floorCanvas()).toBeVisible({ timeout: 10_000 });
  305 | 
  306 |     // A placed row in the browser selects the table and opens the inspector.
  307 |     await floorPage.pickTableInBrowser(table1);
  308 | 
  309 |     await floorPage.floorTableCapacityInput().fill("6");
  310 |     await floorPage.floorTableBookableSwitch().uncheck();
  311 | 
  312 |     const [res] = await Promise.all([
  313 |       session.page.waitForResponse(
  314 |         (r) =>
  315 |           /\/tables\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH",
```