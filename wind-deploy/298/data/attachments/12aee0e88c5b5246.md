# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/08-deals-handoff.spec.ts >> Deals → Storefront hand-off >> TC-367: 'Today's Deals' on /menu offers the owner's deal; toggling it OFF in Manage Deals removes it, ON brings it back
- Location: tests/customer/08-deals-handoff.spec.ts:198:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('row').filter({ has: getByRole('switch') }).first().or(getByText('No deals found', { exact: true }))
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('row').filter({ has: getByRole('switch') }).first().or(getByText('No deals found', { exact: true }))

```

```yaml
- banner:
  - text: LOCATION Boithok Khana Kitchen - — Brooklyn — Manage Deals
  - combobox:
    - paragraph: Boithok Khana Kitchen - — Brooklyn, New York
  - button "Account settings": A
  - button "Select Language":
    - img
    - text: EN
  - button
- navigation "mailbox folders":
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
  - paragraph: "Managing: Boithok Khana Kitchen -"
  - heading "7" [level=4]
  - paragraph: Total Deals
  - heading "7" [level=4]
  - paragraph: Active Deals
  - heading "2" [level=4]
  - paragraph: Times Used
  - heading "$60.98" [level=4]
  - paragraph: Total Revenue
  - heading "Manage Deals" [level=2]
  - button "AI Generate Deals"
  - button "Create Deal"
  - text: Search Deals
  - textbox "Search Deals":
    - /placeholder: Search by name or description...
  - text: Status
  - combobox "All Statuses"
  - button "Refresh"
  - text: Times are in Eastern Time.
  - table:
    - rowgroup:
      - row "Deal Name Items Price Savings When it runs More info Status Usage More info Actions":
        - columnheader
        - columnheader
        - columnheader "Deal Name":
          - button "Deal Name"
        - columnheader "Items"
        - columnheader "Price":
          - button "Price"
        - columnheader "Savings":
          - button "Savings"
        - columnheader "When it runs More info":
          - text: When it runs
          - button "More info"
        - columnheader "Status"
        - columnheader "Usage More info":
          - button "Usage"
          - button "More info"
        - columnheader "Actions"
    - rowgroup:
      - row "AUTO Handoff Pizza d564c064 Automation deal — safe to delete This location only 2 items $15.00 $18.50 19% off Any time the store is open Live now Deactivate 0 times $0.00":
        - cell:
          - button
        - cell
        - cell "AUTO Handoff Pizza d564c064 Automation deal — safe to delete This location only":
          - heading "AUTO Handoff Pizza d564c064" [level=6]
          - text: Automation deal — safe to delete Location
        - cell "2 items":
          - paragraph: 2 items
        - cell "$15.00 $18.50":
          - heading "$15.00" [level=6]
          - text: $18.50
        - cell "19% off"
        - cell "Any time the store is open"
        - cell "Live now Deactivate":
          - text: Live now
          - checkbox "Deactivate" [checked]
        - cell "0 times $0.00":
          - paragraph: 0 times
          - text: $0.00
        - cell:
          - button
      - row:
        - cell
      - row "AUTO Handoff Combo d564c064 two burgers and fries This location only 3 items $21.00 $26.50 21% off Any time the store is open Live now Deactivate 0 times $0.00":
        - cell:
          - button
        - cell
        - cell "AUTO Handoff Combo d564c064 two burgers and fries This location only":
          - heading "AUTO Handoff Combo d564c064" [level=6]
          - text: two burgers and fries Location
        - cell "3 items":
          - paragraph: 3 items
        - cell "$21.00 $26.50":
          - heading "$21.00" [level=6]
          - text: $26.50
        - cell "21% off"
        - cell "Any time the store is open"
        - cell "Live now Deactivate":
          - text: Live now
          - checkbox "Deactivate" [checked]
        - cell "0 times $0.00":
          - paragraph: 0 times
          - text: $0.00
        - cell:
          - button
      - row:
        - cell
      - row "Bruschetta Duo Deal Double the flavor with our bruschetta! AI This location only 2 items $17.58 $20.68 15% off Any time the store is open Live now Deactivate 0 times $0.00":
        - cell:
          - button
        - cell
        - cell "Bruschetta Duo Deal Double the flavor with our bruschetta! AI This location only":
          - heading "Bruschetta Duo Deal" [level=6]
          - text: Double the flavor with our bruschetta! AI Location
        - cell "2 items":
          - paragraph: 2 items
        - cell "$17.58 $20.68":
          - heading "$17.58" [level=6]
          - text: $20.68
        - cell "15% off"
        - cell "Any time the store is open"
        - cell "Live now Deactivate":
          - text: Live now
          - checkbox "Deactivate" [checked]
        - cell "0 times $0.00":
          - paragraph: 0 times
          - text: $0.00
        - cell:
          - button
      - row:
        - cell
      - row "Game Day Platter Snack and share while you watch the game! AI This location only 3 items $25.86 $34.12 24% off Any time the store is open Live now Deactivate 1 times $24.99":
        - cell:
          - button
        - cell
        - cell "Game Day Platter Snack and share while you watch the game! AI This location only":
          - heading "Game Day Platter" [level=6]
          - text: Snack and share while you watch the game! AI Location
        - cell "3 items":
          - paragraph: 3 items
        - cell "$25.86 $34.12":
          - heading "$25.86" [level=6]
          - text: $34.12
        - cell "24% off"
        - cell "Any time the store is open"
        - cell "Live now Deactivate":
          - text: Live now
          - checkbox "Deactivate" [checked]
        - cell "1 times $24.99":
          - paragraph: 1 times
          - text: $24.99
        - cell:
          - button
      - row:
        - cell
      - row "Date Night Indulgence Share a romantic meal for two! AI This location only 4 items $37.25 $45.50 18% off Any time the store is open Live now Deactivate 1 times $35.99":
        - cell:
          - button
        - cell
        - cell "Date Night Indulgence Share a romantic meal for two! AI This location only":
          - heading "Date Night Indulgence" [level=6]
          - text: Share a romantic meal for two! AI Location
        - cell "4 items":
          - paragraph: 4 items
        - cell "$37.25 $45.50":
          - heading "$37.25" [level=6]
          - text: $45.50
        - cell "18% off"
        - cell "Any time the store is open"
        - cell "Live now Deactivate":
          - text: Live now
          - checkbox "Deactivate" [checked]
        - cell "1 times $35.99":
          - paragraph: 1 times
          - text: $35.99
        - cell:
          - button
      - row:
        - cell
      - row "Solo Delight Combo A perfect meal just for you! AI This location only 2 items $17.58 $20.68 15% off Any time the store is open Live now Deactivate 0 times $0.00":
        - cell:
          - button
        - cell
        - cell "Solo Delight Combo A perfect meal just for you! AI This location only":
          - heading "Solo Delight Combo" [level=6]
          - text: A perfect meal just for you! AI Location
        - cell "2 items":
          - paragraph: 2 items
        - cell "$17.58 $20.68":
          - heading "$17.58" [level=6]
          - text: $20.68
        - cell "15% off"
        - cell "Any time the store is open"
        - cell "Live now Deactivate":
          - text: Live now
          - checkbox "Deactivate" [checked]
        - cell "0 times $0.00":
          - paragraph: 0 times
          - text: $0.00
        - cell:
          - button
      - row:
        - cell
      - row "Family Feast Special A hearty meal for the whole family to enjoy! AI This location only 4 items $51.87 $61.02 15% off Any time the store is open Live now Deactivate 0 times $0.00":
        - cell:
          - button
        - cell
        - cell "Family Feast Special A hearty meal for the whole family to enjoy! AI This location only":
          - heading "Family Feast Special" [level=6]
          - text: A hearty meal for the whole family to enjoy! AI Location
        - cell "4 items":
          - paragraph: 4 items
        - cell "$51.87 $61.02":
          - heading "$51.87" [level=6]
          - text: $61.02
        - cell "15% off"
        - cell "Any time the store is open"
        - cell "Live now Deactivate":
          - text: Live now
          - checkbox "Deactivate" [checked]
        - cell "0 times $0.00":
          - paragraph: 0 times
          - text: $0.00
        - cell:
          - button
      - row:
        - cell
  - paragraph: "Rows per page:"
  - 'combobox "Rows per page: 10"': "10"
  - paragraph: 1–7 of 7
  - button "Go to previous page" [disabled]
  - button "Go to next page" [disabled]
- button "Open chat"
```

# Test source

```ts
  18  |  *
  19  |  * Four deep-linkable tabs (PortalShell `?tab=`): `deals` (Manage Deals table,
  20  |  * DealsDashboard.tsx), `create-deal` (DealForm — create AND edit),
  21  |  * `ai-deals` (AIDealsGenerator), `deal-analytics` (DealAnalytics). The sidebar
  22  |  * "Deals" entry is a hover flyout on desktop, so every driver here navigates
  23  |  * by URL; `navigateToManageDeals` keeps the click path for TC-86.
  24  |  *
  25  |  * Selectors (verified on QA 2026-08-18 — the Deals components ship ZERO
  26  |  * data-testids): rows are `role=row` named by their visible cells
  27  |  * ("<name> <desc> This location only 2 items $22.00 $28.98 24% off Mon, Wed
  28  |  * 11:00 - 14:00 Active Deactivate 0 times $0.00"); the first button in a row
  29  |  * expands it, the last opens the Edit/Delete menu; the status Switch is the
  30  |  * row's `role=switch` wrapped in a Tooltip whose title is "Deactivate" /
  31  |  * "Activate" / "This deal has ended. Change its last day to turn it back on."; #deal-search, #status-filter
  32  |  * (MUI select → role=combobox), the shared Confirm dialog
  33  |  * (`role=dialog` "Delete this deal?"), snackbars as `role=alert` text.
  34  |  * See docs/DEALS_TAB_TEST_STRATEGY.md §2 "Selectors that exist today".
  35  |  */
  36  | export const createOwnerDealsPage = (page: Page) => {
  37  |   const mgmtPage = createOwnerRestaurantManagementPage(page);
  38  |   const main = () => page.locator("#root");
  39  | 
  40  |   const gotoTab = async (
  41  |     restaurantId: string,
  42  |     tab: "deals" | "create-deal" | "ai-deals" | "deal-analytics"
  43  |   ) => {
  44  |     await page.goto(
  45  |       `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=${tab}`,
  46  |       { waitUntil: "domcontentloaded" }
  47  |     );
  48  |     await mgmtPage.drawer().waitFor({ state: "visible", timeout: 20_000 });
  49  |   };
  50  | 
  51  |   /** Chain shell twin: /chain/:groupId/restaurantManagement?tab=… */
  52  |   const gotoChainTab = async (
  53  |     groupId: string,
  54  |     tab: "deals" | "create-deal" | "ai-deals" | "deal-analytics"
  55  |   ) => {
  56  |     await page.goto(`/chain/${groupId}/restaurantManagement?tab=${tab}`, {
  57  |       waitUntil: "domcontentloaded",
  58  |     });
  59  |     await mgmtPage.drawer().waitFor({ state: "visible", timeout: 20_000 });
  60  |   };
  61  | 
  62  |   /** Deep-link to the table and wait for the first fetch to settle. */
  63  |   const gotoManageDeals = async (restaurantId: string) => {
  64  |     await gotoTab(restaurantId, "deals");
  65  |     await assertManageDealsLoaded();
  66  |     await tableSettled();
  67  |   };
  68  | 
  69  |   const gotoChainManageDeals = async (groupId: string) => {
  70  |     await gotoChainTab(groupId, "deals");
  71  |     await assertManageDealsLoaded();
  72  |     await tableSettled();
  73  |   };
  74  | 
  75  |   // Deals lives behind a flyout section (like Coupons): expand "Deals",
  76  |   // then click the "Manage Deals" sub-item. Kept for TC-86 (the sidebar path).
  77  |   const navigateToManageDeals = async (restaurantId: string) => {
  78  |     await mgmtPage.goto(restaurantId);
  79  |     const dealsEntry = mgmtPage
  80  |       .drawer()
  81  |       .getByRole("button", { name: "Deals", exact: true });
  82  |     const manageDealsBtn = page.getByRole("button", {
  83  |       name: "Manage Deals",
  84  |       exact: true,
  85  |     });
  86  |     // Desktop = hover flyout (Popper + Grow), mobile = click accordion; do
  87  |     // both. The flyout is transient (SidebarFlyoutSection closes it 80ms after
  88  |     // the pointer leaves, or on click-away): on the 2026-10-01 nightly (CI, 2
  89  |     // loaded workers) it closed while Grow was still animating, so the "Manage
  90  |     // Deals" item was "not stable" then "detached from the DOM" and the click
  91  |     // had nothing left to retry against for 15s, on both attempts. Not
  92  |     // reproducible locally at any viewport height. Re-open and re-click as one
  93  |     // unit until the navigation happens.
  94  |     await expect(async () => {
  95  |       await dealsEntry.hover();
  96  |       await dealsEntry.click();
  97  |       await manageDealsBtn.click({ timeout: 3_000 });
  98  |       await page.waitForURL(/tab=deals/, { timeout: 3_000 });
  99  |     }).toPass({ timeout: 20_000 });
  100 |     await page
  101 |       .getByRole("heading", { name: "Manage Deals" })
  102 |       .waitFor({ state: "visible", timeout: 15_000 });
  103 |   };
  104 | 
  105 |   const assertManageDealsLoaded = () =>
  106 |     expect(page.getByRole("heading", { name: "Manage Deals" })).toBeVisible({
  107 |       timeout: 15_000,
  108 |     });
  109 | 
  110 |   /** The table shows rows or the empty state — either means the fetch settled. */
  111 |   const tableSettled = () =>
  112 |     expect(
  113 |       page
  114 |         .getByRole("row")
  115 |         .filter({ has: page.getByRole("switch") })
  116 |         .first()
  117 |         .or(emptyState())
> 118 |     ).toBeVisible({ timeout: 20_000 });
      |       ^ Error: expect(locator).toBeVisible() failed
  119 | 
  120 |   // "Create Deal" also appears as a sidebar flyout item with the same
  121 |   // accessible name — scope to #root's main content to get the page action.
  122 |   const createDealButton = () =>
  123 |     main().getByRole("button", { name: "Create Deal", exact: true });
  124 |   const aiGenerateButton = () =>
  125 |     main().getByRole("button", { name: "AI Generate Deals", exact: true });
  126 |   const viewAnalyticsButton = () =>
  127 |     main().getByRole("button", { name: "View Analytics", exact: true });
  128 |   const refreshButton = () =>
  129 |     main().getByRole("button", { name: "Refresh", exact: true });
  130 | 
  131 |   // ── Stat cards ("Total Deals" / "Active Deals" / "Times Used" / "Total Revenue")
  132 |   const statCardValue = (label: string) =>
  133 |     page
  134 |       .locator(".MuiCard-root, .MuiPaper-root")
  135 |       .filter({ has: page.getByText(label, { exact: true }) })
  136 |       .first()
  137 |       .getByRole("heading")
  138 |       .first();
  139 | 
  140 |   // ── Filters ────────────────────────────────────────────────────────────────
  141 |   const searchInput = () => page.locator("#deal-search");
  142 |   const search = async (text: string) => {
  143 |     await searchInput().fill(text);
  144 |   };
  145 |   const statusFilter = () => page.locator("#status-filter");
  146 |   const selectStatusFilter = async (
  147 |     label: "All Statuses" | "Live now" | "Coming up" | "Off" | "Ended"
  148 |   ) => {
  149 |     await statusFilter().click();
  150 |     await page.getByRole("option", { name: label, exact: true }).click();
  151 |   };
  152 |   const sortBy = (header: "Deal Name" | "Price" | "Savings" | "Usage") =>
  153 |     page
  154 |       .getByRole("columnheader")
  155 |       .getByRole("button", { name: header })
  156 |       .click();
  157 | 
  158 |   // ── Rows ───────────────────────────────────────────────────────────────────
  159 |   /** A deal row by its (unique, AUTO-prefixed) name; the name is the row's leading text. */
  160 |   const row = (dealName: string): Locator =>
  161 |     page.getByRole("row").filter({
  162 |       has: page.getByRole("heading", { name: dealName, exact: true }),
  163 |     });
  164 |   const dataRows = () =>
  165 |     page.getByRole("row").filter({ has: page.getByRole("switch") });
  166 |   const rowNames = async () =>
  167 |     dataRows().evaluateAll((rows) =>
  168 |       rows.map(
  169 |         (r) => r.querySelector("h6")?.textContent?.trim() ?? r.textContent ?? ""
  170 |       )
  171 |     );
  172 | 
  173 |   const emptyState = () => page.getByText("No deals found", { exact: true });
  174 |   const createFirstDealButton = () =>
  175 |     page.getByRole("button", { name: "Create Your First Deal" });
  176 | 
  177 |   const rowSwitch = (dealName: string) => row(dealName).getByRole("switch");
  178 |   const rowExpandButton = (dealName: string) =>
  179 |     row(dealName).getByRole("button").first();
  180 |   const rowMenuButton = (dealName: string) =>
  181 |     row(dealName).getByRole("button").last();
  182 |   const rowStatusText = (dealName: string) =>
  183 |     row(dealName)
  184 |       .getByTestId("deal-live-status")
  185 |       .or(
  186 |         row(dealName)
  187 |           .getByRole("cell")
  188 |           .filter({ has: page.getByRole("switch") })
  189 |           .locator(".MuiChip-label")
  190 |       )
  191 |       .first();
  192 |   /** Tooltip title of the switch wrapper (Deactivate / Activate / Cannot toggle expired deals). */
  193 |   const rowSwitchTooltip = (dealName: string) =>
  194 |     row(dealName)
  195 |       .getByRole("cell")
  196 |       .filter({ has: page.getByRole("switch") })
  197 |       .locator("[aria-label]")
  198 |       .first();
  199 |   /** Chip in the Deal Name cell — "Location" / "Chain" scope. */
  200 |   const rowScopeChip = (dealName: string) =>
  201 |     row(dealName).locator(".MuiChip-root").first();
  202 | 
  203 |   const openRowMenu = async (dealName: string) => {
  204 |     await rowMenuButton(dealName).click();
  205 |     await page.getByRole("menu").waitFor({ state: "visible", timeout: 5_000 });
  206 |   };
  207 |   const editMenuItem = () => page.getByRole("menuitem", { name: "Edit" });
  208 |   const deleteMenuItem = () => page.getByRole("menuitem", { name: "Delete" });
  209 | 
  210 |   const expandRow = async (dealName: string) => {
  211 |     await rowExpandButton(dealName).click();
  212 |     await page
  213 |       .getByRole("heading", { name: "Deal Items" })
  214 |       .first()
  215 |       .waitFor({ state: "visible", timeout: 5_000 });
  216 |   };
  217 |   /** Chips in the expanded "Deal Items" panel, e.g. "1x Chicken Wings ($14.99)". */
  218 |   const expandedItemChips = () =>
```