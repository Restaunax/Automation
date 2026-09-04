# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/11-deals.spec.ts >> Owner — Deals >> TC-86: owner can reach the Manage Deals tab
- Location: tests/dashboard/owner/11-deals.spec.ts:186:7

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Manage Deals', exact: true })

```

# Test source

```ts
  1   | import { type Page, type Locator, expect } from "@playwright/test";
  2   | import { createOwnerRestaurantManagementPage } from "./OwnerRestaurantManagementPage";
  3   | 
  4   | /**
  5   |  * Owner → Restaurant Management → Deals.
  6   |  *
  7   |  * Four deep-linkable tabs (PortalShell `?tab=`): `deals` (Manage Deals table,
  8   |  * DealsDashboard.tsx), `create-deal` (DealForm — create AND edit),
  9   |  * `ai-deals` (AIDealsGenerator), `deal-analytics` (DealAnalytics). The sidebar
  10  |  * "Deals" entry is a hover flyout on desktop, so every driver here navigates
  11  |  * by URL; `navigateToManageDeals` keeps the click path for TC-86.
  12  |  *
  13  |  * Selectors (verified on QA 2026-08-18 — the Deals components ship ZERO
  14  |  * data-testids): rows are `role=row` named by their visible cells
  15  |  * ("<name> <desc> This location only 2 items $22.00 $28.98 24% off Mon, Wed
  16  |  * 11:00 - 14:00 Active Deactivate 0 times $0.00"); the first button in a row
  17  |  * expands it, the last opens the Edit/Delete menu; the status Switch is the
  18  |  * row's `role=switch` wrapped in a Tooltip whose title is "Deactivate" /
  19  |  * "Activate" / "Cannot toggle expired deals"; #deal-search, #status-filter
  20  |  * (MUI select → role=combobox), the shared Confirm dialog
  21  |  * (`role=dialog` "Delete this deal?"), snackbars as `role=alert` text.
  22  |  * See docs/DEALS_TAB_TEST_STRATEGY.md §2 "Selectors that exist today".
  23  |  */
  24  | export const createOwnerDealsPage = (page: Page) => {
  25  |   const mgmtPage = createOwnerRestaurantManagementPage(page);
  26  |   const main = () => page.locator("#root");
  27  | 
  28  |   const gotoTab = async (
  29  |     restaurantId: string,
  30  |     tab: "deals" | "create-deal" | "ai-deals" | "deal-analytics"
  31  |   ) => {
  32  |     await page.goto(
  33  |       `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=${tab}`,
  34  |       { waitUntil: "domcontentloaded" }
  35  |     );
  36  |     await mgmtPage.drawer().waitFor({ state: "visible", timeout: 20_000 });
  37  |   };
  38  | 
  39  |   /** Chain shell twin: /chain/:groupId/restaurantManagement?tab=… */
  40  |   const gotoChainTab = async (
  41  |     groupId: string,
  42  |     tab: "deals" | "create-deal" | "ai-deals" | "deal-analytics"
  43  |   ) => {
  44  |     await page.goto(`/chain/${groupId}/restaurantManagement?tab=${tab}`, {
  45  |       waitUntil: "domcontentloaded",
  46  |     });
  47  |     await mgmtPage.drawer().waitFor({ state: "visible", timeout: 20_000 });
  48  |   };
  49  | 
  50  |   /** Deep-link to the table and wait for the first fetch to settle. */
  51  |   const gotoManageDeals = async (restaurantId: string) => {
  52  |     await gotoTab(restaurantId, "deals");
  53  |     await assertManageDealsLoaded();
  54  |     await tableSettled();
  55  |   };
  56  | 
  57  |   const gotoChainManageDeals = async (groupId: string) => {
  58  |     await gotoChainTab(groupId, "deals");
  59  |     await assertManageDealsLoaded();
  60  |     await tableSettled();
  61  |   };
  62  | 
  63  |   // Deals lives behind a flyout section (like Coupons): expand "Deals",
  64  |   // then click the "Manage Deals" sub-item. Kept for TC-86 (the sidebar path).
  65  |   const navigateToManageDeals = async (restaurantId: string) => {
  66  |     await mgmtPage.goto(restaurantId);
  67  |     const dealsEntry = mgmtPage
  68  |       .drawer()
  69  |       .getByRole("button", { name: "Deals", exact: true });
  70  |     // Desktop = hover flyout (Popper), mobile = click accordion; do both.
  71  |     await dealsEntry.hover();
  72  |     await dealsEntry.click();
  73  |     const manageDealsBtn = page.getByRole("button", {
  74  |       name: "Manage Deals",
  75  |       exact: true,
  76  |     });
  77  |     await manageDealsBtn.waitFor({ state: "visible", timeout: 5_000 });
> 78  |     await manageDealsBtn.click();
      |                          ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  79  |     await page.waitForURL(/tab=deals/, { timeout: 10_000 });
  80  |     await page
  81  |       .getByRole("heading", { name: "Manage Deals" })
  82  |       .waitFor({ state: "visible", timeout: 15_000 });
  83  |   };
  84  | 
  85  |   const assertManageDealsLoaded = () =>
  86  |     expect(page.getByRole("heading", { name: "Manage Deals" })).toBeVisible({
  87  |       timeout: 15_000,
  88  |     });
  89  | 
  90  |   /** The table shows rows or the empty state — either means the fetch settled. */
  91  |   const tableSettled = () =>
  92  |     expect(
  93  |       page
  94  |         .getByRole("row")
  95  |         .filter({ has: page.getByRole("switch") })
  96  |         .first()
  97  |         .or(emptyState())
  98  |     ).toBeVisible({ timeout: 20_000 });
  99  | 
  100 |   // "Create Deal" also appears as a sidebar flyout item with the same
  101 |   // accessible name — scope to #root's main content to get the page action.
  102 |   const createDealButton = () =>
  103 |     main().getByRole("button", { name: "Create Deal", exact: true });
  104 |   const aiGenerateButton = () =>
  105 |     main().getByRole("button", { name: "AI Generate Deals", exact: true });
  106 |   const viewAnalyticsButton = () =>
  107 |     main().getByRole("button", { name: "View Analytics", exact: true });
  108 |   const refreshButton = () =>
  109 |     main().getByRole("button", { name: "Refresh", exact: true });
  110 | 
  111 |   // ── Stat cards ("Total Deals" / "Active Deals" / "Times Used" / "Total Revenue")
  112 |   const statCardValue = (label: string) =>
  113 |     page
  114 |       .locator(".MuiCard-root, .MuiPaper-root")
  115 |       .filter({ has: page.getByText(label, { exact: true }) })
  116 |       .first()
  117 |       .getByRole("heading")
  118 |       .first();
  119 | 
  120 |   // ── Filters ────────────────────────────────────────────────────────────────
  121 |   const searchInput = () => page.locator("#deal-search");
  122 |   const search = async (text: string) => {
  123 |     await searchInput().fill(text);
  124 |   };
  125 |   const statusFilter = () => page.locator("#status-filter");
  126 |   const selectStatusFilter = async (
  127 |     label: "All Statuses" | "Active" | "Inactive" | "Expired"
  128 |   ) => {
  129 |     await statusFilter().click();
  130 |     await page.getByRole("option", { name: label, exact: true }).click();
  131 |   };
  132 |   const sortBy = (header: "Deal Name" | "Price" | "Savings" | "Usage") =>
  133 |     page
  134 |       .getByRole("columnheader")
  135 |       .getByRole("button", { name: header })
  136 |       .click();
  137 | 
  138 |   // ── Rows ───────────────────────────────────────────────────────────────────
  139 |   /** A deal row by its (unique, AUTO-prefixed) name; the name is the row's leading text. */
  140 |   const row = (dealName: string): Locator =>
  141 |     page.getByRole("row").filter({
  142 |       has: page.getByRole("heading", { name: dealName, exact: true }),
  143 |     });
  144 |   const dataRows = () =>
  145 |     page.getByRole("row").filter({ has: page.getByRole("switch") });
  146 |   const rowNames = async () =>
  147 |     dataRows().evaluateAll((rows) =>
  148 |       rows.map(
  149 |         (r) => r.querySelector("h6")?.textContent?.trim() ?? r.textContent ?? ""
  150 |       )
  151 |     );
  152 | 
  153 |   const emptyState = () => page.getByText("No deals found", { exact: true });
  154 |   const createFirstDealButton = () =>
  155 |     page.getByRole("button", { name: "Create Your First Deal" });
  156 | 
  157 |   const rowSwitch = (dealName: string) => row(dealName).getByRole("switch");
  158 |   const rowExpandButton = (dealName: string) =>
  159 |     row(dealName).getByRole("button").first();
  160 |   const rowMenuButton = (dealName: string) =>
  161 |     row(dealName).getByRole("button").last();
  162 |   /** Status badge text — the DealStatusBadge chip ("Active" / "Inactive" / "Expired"). */
  163 |   const rowStatusText = (dealName: string) =>
  164 |     row(dealName)
  165 |       .getByRole("cell")
  166 |       .filter({ has: page.getByRole("switch") })
  167 |       .locator(".MuiChip-label")
  168 |       .first();
  169 |   /** Tooltip title of the switch wrapper (Deactivate / Activate / Cannot toggle expired deals). */
  170 |   const rowSwitchTooltip = (dealName: string) =>
  171 |     row(dealName)
  172 |       .getByRole("cell")
  173 |       .filter({ has: page.getByRole("switch") })
  174 |       .locator("[aria-label]")
  175 |       .first();
  176 |   /** Chip in the Deal Name cell — "Location" / "Chain" scope. */
  177 |   const rowScopeChip = (dealName: string) =>
  178 |     row(dealName).locator(".MuiChip-root").first();
```