# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/06-menu-handoff.spec.ts >> Menu → Storefront hand-off >> TC-320: an item the owner marks sold out disappears from the storefront menu and comes back when restored
- Location: tests/customer/06-menu-handoff.spec.ts:123:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /^Manage (Menu|shared menu)|^Open the builder for .* only|^Manage the shared chain menu/ })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: /^Manage (Menu|shared menu)|^Open the builder for .* only|^Manage the shared chain menu/ })

```

```yaml
- banner:
  - text: LOCATION Boithok Khana Kitchen - — Brooklyn — Menu
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
  - heading "Menu Availability Management" [level=1]
  - button "Add or edit items"
  - button "Refresh"
  - heading "MAIN MENU" [level=6]
  - button "Reorder categories"
  - heading "Appetizers 1 Available" [level=3]:
    - button "Appetizers 1 Available":
      - heading "Appetizers" [level=6]
      - text: 1 Available
  - heading "Entrees 2 Available" [level=3]:
    - button "Entrees 2 Available":
      - heading "Entrees" [level=6]
      - text: 2 Available
  - heading "Burgers & Sandwiches 3 Available" [level=3]:
    - button "Burgers & Sandwiches 3 Available":
      - heading "Burgers & Sandwiches" [level=6]
      - text: 3 Available
  - heading "Sides 1 Available" [level=3]:
    - button "Sides 1 Available":
      - heading "Sides" [level=6]
      - text: 1 Available
  - heading "Desserts 1 Available" [level=3]:
    - button "Desserts 1 Available":
      - heading "Desserts" [level=6]
      - text: 1 Available
  - heading "ZZ Move Probe Source 0 Available" [level=3]:
    - button "ZZ Move Probe Source 0 Available":
      - heading "ZZ Move Probe Source" [level=6]
      - text: 0 Available
  - heading "ZZ Copy Probe NEW 0 Available" [level=3]:
    - button "ZZ Copy Probe NEW 0 Available":
      - heading "ZZ Copy Probe NEW" [level=6]
      - text: 0 Available
  - heading "ZZ Move Probe Target 0 Available" [level=3]:
    - button "ZZ Move Probe Target 0 Available":
      - heading "ZZ Move Probe Target" [level=6]
      - text: 0 Available
  - heading "ZZ Copy Probe Src 0 Available" [level=3]:
    - button "ZZ Copy Probe Src 0 Available":
      - heading "ZZ Copy Probe Src" [level=6]
      - text: 0 Available
  - heading "Automation Items 1 Available" [level=3]:
    - button "Automation Items 1 Available":
      - heading "Automation Items" [level=6]
      - text: 1 Available
  - heading "Test Starters 2c9e017a 1 Available" [level=3]:
    - button "Test Starters 2c9e017a 1 Available":
      - heading "Test Starters 2c9e017a" [level=6]
      - text: 1 Available
  - heading "Test Starters 2f8d3195 1 Available" [level=3]:
    - button "Test Starters 2f8d3195 1 Available":
      - heading "Test Starters 2f8d3195" [level=6]
      - text: 1 Available
  - heading "Automation Menu 0c2b8c23 1 Available" [level=3]:
    - button "Automation Menu 0c2b8c23 1 Available":
      - heading "Automation Menu 0c2b8c23" [level=6]
      - text: 1 Available
- button "Open chat"
```

# Test source

```ts
  1   | import { type Page, type Locator, expect } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * Dashboard — Menu tab = "Menu Availability Management"
  5   |  * (`/restaurant/restaurantId/:id/restaurantManagement?tab=Menu`,
  6   |  * frontend `RestaurantManagement/MenuManagementPage.tsx`).
  7   |  *
  8   |  * ROLE-AGNOSTIC: the same screen is reached by OWNER, EMPLOYEE and ADMIN, so
  9   |  * this POM lives under pages/dashboard/restaurant/ — pass in whichever
  10  |  * session's page. Feature behaviour is tested once under the primary actor
  11  |  * (tests/dashboard/owner/04b-menu-availability.spec.ts); who-can-reach-it is
  12  |  * covered in tests/dashboard/access/.
  13  |  *
  14  |  * What the tab is (and isn't): a toggle surface — per-item availability
  15  |  * (86), featured, "Restore All to Available" per category, and for chain
  16  |  * members the per-location price / carry controls. Category + item CRUD live
  17  |  * in the BUILDER at /restaurant/restaurantId/:id (OwnerMenuPage) which the
  18  |  * "Manage Menu" button opens. See docs/MENU_TAB_TEST_STRATEGY.md §3.1.
  19  |  *
  20  |  * Selectors (verified on QA 2026-08-16): the icon buttons expose their MUI
  21  |  * Tooltip title as the accessible name ("Edit this menu item", "Add to
  22  |  * featured items" / "Remove from featured items"); the availability control
  23  |  * is `role=switch` inside the item's `listitem`; each category is an MUI
  24  |  * Accordion whose summary is `role=button` named "<Category> N Available
  25  |  * [N Out of Stock] [Restore All to Available]". Confirm dialogs come from
  26  |  * ConfirmProvider: `role=dialog` named by its title. `data-tour` hooks
  27  |  * (`menu-availability-toggle`, `menu-featured-toggle`) exist in the frontend
  28  |  * source but were NOT on the QA deploy — the accessible names are the
  29  |  * contract until then.
  30  |  *
  31  |  * NOTE: until RestauNax #602 the caption under the switch labelled the
  32  |  * OPPOSITE state; since #602 it matches the chip next to the item name, so the
  33  |  * state text appears twice per row — the assertions use .first() (the chip).
  34  |  */
  35  | export const createMenuAvailabilityPage = (page: Page) => {
  36  |   const goto = async (restaurantId: string): Promise<void> => {
  37  |     await page.goto(
  38  |       `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Menu`,
  39  |       { waitUntil: "domcontentloaded" }
  40  |     );
  41  |   };
  42  | 
  43  |   /** Chain shell twin: /chain/:groupId/restaurantManagement?tab=Menu (forceChainMode). */
  44  |   const gotoChain = async (groupId: string): Promise<void> => {
  45  |     await page.goto(`/chain/${groupId}/restaurantManagement?tab=Menu`, {
  46  |       waitUntil: "domcontentloaded",
  47  |     });
  48  |   };
  49  | 
  50  |   const heading = () =>
  51  |     page.getByRole("heading", { name: "Menu Availability Management" });
  52  |   // Standalone: name "Manage Menu". Chain member / chain shell: the tooltip
  53  |   // becomes the accessible name ("Open the builder for <A> only — …" /
  54  |   // "Manage the shared chain menu — …") while the visible text stays
  55  |   // "Manage Menu" / "Manage shared menu (all locations)".
  56  |   const manageMenuButton = () =>
  57  |     page.getByRole("button", {
  58  |       name: /^Manage (Menu|shared menu)|^Open the builder for .* only|^Manage the shared chain menu/,
  59  |     });
  60  |   const refreshButton = () =>
  61  |     page.getByRole("button", { name: /^Refresh(ing…|ing\.\.\.)?$/ });
  62  |   const sidebarMenuTab = () =>
  63  |     page
  64  |       .locator('[data-tour="tab-Menu"]')
  65  |       .or(page.getByRole("button", { name: "Menu", exact: true }))
  66  |       .first();
  67  | 
  68  |   const assertLoaded = async () => {
  69  |     await expect(heading()).toBeVisible({ timeout: 20_000 });
> 70  |     await expect(manageMenuButton()).toBeVisible();
      |                                      ^ Error: expect(locator).toBeVisible() failed
  71  |   };
  72  | 
  73  |   /** Wait for the tab's menu fetch (GET /menu/restaurants/:id/menus). */
  74  |   const waitForMenuLoad = (restaurantId?: string) =>
  75  |     page.waitForResponse(
  76  |       (r) =>
  77  |         r.request().method() === "GET" &&
  78  |         /\/menu\/restaurants\/[^/]+\/menus/.test(r.url()) &&
  79  |         (!restaurantId || r.url().includes(restaurantId)) &&
  80  |         r.status() === 200,
  81  |       { timeout: 20_000 }
  82  |     );
  83  | 
  84  |   // ── Categories (accordions) ─────────────────────────────────────────────
  85  | 
  86  |   /** The accordion SUMMARY button for a category — its name carries the chips. */
  87  |   const categorySummary = (categoryName: string): Locator =>
  88  |     page.getByRole("button", {
  89  |       name: new RegExp(`^${escapeRe(categoryName)} \\d+ Available`),
  90  |     });
  91  | 
  92  |   /** The whole accordion (summary + region) for a category. */
  93  |   const categoryAccordion = (categoryName: string): Locator =>
  94  |     page
  95  |       .locator(".MuiAccordion-root")
  96  |       .filter({ has: categorySummary(categoryName) });
  97  | 
  98  |   const expandCategory = async (categoryName: string) => {
  99  |     const summary = categorySummary(categoryName);
  100 |     await summary.waitFor({ state: "visible", timeout: 20_000 });
  101 |     if ((await summary.getAttribute("aria-expanded")) !== "true") {
  102 |       await summary.click();
  103 |     }
  104 |     await expect(summary).toHaveAttribute("aria-expanded", "true");
  105 |   };
  106 | 
  107 |   /** "N Available" chip text of a category summary → N. */
  108 |   const availableCount = async (categoryName: string): Promise<number> => {
  109 |     const text = (await categorySummary(categoryName).textContent()) ?? "";
  110 |     return Number(/(\d+) Available/.exec(text)?.[1] ?? NaN);
  111 |   };
  112 |   /** "N Out of Stock" chip → N (0 when the chip is absent). */
  113 |   const outOfStockCount = async (categoryName: string): Promise<number> => {
  114 |     const text = (await categorySummary(categoryName).textContent()) ?? "";
  115 |     return Number(/(\d+) Out of Stock/.exec(text)?.[1] ?? 0);
  116 |   };
  117 |   const assertCounts = async (
  118 |     categoryName: string,
  119 |     available: number,
  120 |     outOfStock: number
  121 |   ) => {
  122 |     await expect(categorySummary(categoryName)).toContainText(
  123 |       `${available} Available`
  124 |     );
  125 |     if (outOfStock > 0) {
  126 |       await expect(categorySummary(categoryName)).toContainText(
  127 |         `${outOfStock} Out of Stock`
  128 |       );
  129 |     } else {
  130 |       await expect(categorySummary(categoryName)).not.toContainText(
  131 |         "Out of Stock"
  132 |       );
  133 |     }
  134 |   };
  135 | 
  136 |   // testid-first with legacy fallback (RestauNax #602 adds the testids; both
  137 |   // branches resolve to the SAME button once deployed).
  138 |   const restoreAllButton = (categoryName: string) =>
  139 |     categorySummary(categoryName)
  140 |       .getByTestId("menu-restore-all")
  141 |       .or(
  142 |         categorySummary(categoryName).getByRole("button", {
  143 |           name: "Restore All to Available",
  144 |         })
  145 |       )
  146 |       .first();
  147 | 
  148 |   /** Click "Restore All to Available" → ConsequenceDialog → "Restore all". */
  149 |   const restoreAll = async (categoryName: string) => {
  150 |     await restoreAllButton(categoryName).click();
  151 |     const dialog = page.getByRole("dialog", {
  152 |       name: "Restore all out-of-stock items in this group?",
  153 |     });
  154 |     await expect(dialog).toBeVisible({ timeout: 10_000 });
  155 |     return {
  156 |       dialog,
  157 |       confirm: async () => {
  158 |         await Promise.all([
  159 |           page.waitForResponse(
  160 |             (r) =>
  161 |               /\/menu\/menu-groups\/[^/]+\/reset-availability/.test(r.url()) &&
  162 |               r.request().method() === "POST",
  163 |             { timeout: 20_000 }
  164 |           ),
  165 |           dialog.getByRole("button", { name: "Restore all" }).click(),
  166 |         ]);
  167 |         await expect(dialog).toBeHidden({ timeout: 10_000 });
  168 |       },
  169 |       cancel: () => dialog.getByRole("button", { name: "Cancel" }).click(),
  170 |     };
```