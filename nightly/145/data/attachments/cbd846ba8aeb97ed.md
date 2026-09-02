# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/dual-pricing.spec.ts >> Dashboard — Dual pricing v2 >> TC-496: admin Update Restaurant Info carries the dual-pricing enrollment switch, card markup field and menu actions
- Location: tests/dashboard/owner/dual-pricing.spec.ts:193:7

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('tbody tr').filter({ hasText: 'Boithok Khana Kitchen - ' }).first() to be visible

```

# Test source

```ts
  1   | import { type Page, expect } from "@playwright/test";
  2   | 
  3   | export const createAdminRestaurantsPage = (page: Page) => {
  4   |   const searchInput = () =>
  5   |     page.locator('input[placeholder*="Search"]').first();
  6   | 
  7   |   const goto = async () => {
  8   |     await page.goto("/admin?tab=restaurant&section=restaurant", {
  9   |       waitUntil: "domcontentloaded",
  10  |     });
  11  |     await page
  12  |       .getByRole("heading", { name: /restaurant management/i })
  13  |       .waitFor({ state: "visible", timeout: 15_000 });
  14  |   };
  15  | 
  16  |   const assertPageLoaded = () =>
  17  |     expect(
  18  |       page.getByRole("heading", { name: /restaurant management/i })
  19  |     ).toBeVisible({ timeout: 15_000 });
  20  | 
  21  |   const assertTableColumnVisible = (columnName: string) =>
  22  |     expect(page.getByRole("columnheader", { name: columnName })).toBeVisible({
  23  |       timeout: 10_000,
  24  |     });
  25  | 
  26  |   const findRowByName = (name: string) =>
  27  |     page.locator("tbody tr").filter({ hasText: name });
  28  | 
  29  |   const assertRestaurantRowVisible = async (name: string) => {
  30  |     await expect(findRowByName(name)).toBeVisible({ timeout: 10_000 });
  31  |   };
  32  | 
  33  |   // ── Row kebab → Edit → "Update Restaurant Info" → RestaurantUpdateDialog ──
  34  |   // The kebab IconButton carries no aria-label; MUI stamps the icon with
  35  |   // data-testid="MoreVertIcon", which is the stable hook.
  36  |   const openRowActionMenu = async (name: string) => {
  37  |     await searchInput().fill(name);
  38  |     const row = findRowByName(name).first();
> 39  |     await row.waitFor({ state: "visible", timeout: 15_000 });
      |               ^ TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
  40  |     // The kebab is the row's last button (the actions cell sits at the far
  41  |     // right of a horizontally scrolling table); testid-first with a
  42  |     // positional fallback.
  43  |     const kebab = row
  44  |       .locator('button:has([data-testid="MoreVertIcon"])')
  45  |       .or(row.getByRole("button").last())
  46  |       .first();
  47  |     await kebab.scrollIntoViewIfNeeded();
  48  |     await kebab.click();
  49  |     await page
  50  |       .getByRole("menuitem", { name: "Edit", exact: true })
  51  |       .waitFor({ state: "visible", timeout: 10_000 });
  52  |   };
  53  | 
  54  |   const openUpdateRestaurantInfo = async (name: string) => {
  55  |     await openRowActionMenu(name);
  56  |     await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  57  |     // On QA "Edit" opens the Update Restaurant dialog directly; an older
  58  |     // build routes through EditRestaurantDialog ("Restaurant Actions" →
  59  |     // "Update Restaurant Info"). Accept either.
  60  |     const basicInfoTab = page.getByRole("tab", { name: "Basic Information" });
  61  |     const actionsStep = page.getByRole("button", {
  62  |       name: /Update Restaurant Info/,
  63  |     });
  64  |     await basicInfoTab
  65  |       .or(actionsStep)
  66  |       .first()
  67  |       .waitFor({ state: "visible", timeout: 20_000 });
  68  |     if (await actionsStep.isVisible()) {
  69  |       await actionsStep.click();
  70  |     }
  71  |     await basicInfoTab.waitFor({ state: "visible", timeout: 20_000 });
  72  |   };
  73  | 
  74  |   // ── Dual-pricing block on the Basic Information tab (admin-only fields) ──
  75  |   const dualPricingEligibleSwitch = () =>
  76  |     page
  77  |       .locator("label")
  78  |       .filter({ hasText: "Dual pricing eligible (cash discount)" })
  79  |       .locator('input[type="checkbox"]');
  80  | 
  81  |   const cardMarkupInput = () => page.locator("#dual-pricing-card-markup");
  82  | 
  83  |   const convertMenuButton = () =>
  84  |     page.getByRole("button", { name: /Confirm menu prices/ });
  85  | 
  86  |   const priceListButton = () =>
  87  |     page.getByRole("button", { name: "Price list / signage" });
  88  | 
  89  |   const assertDualPricingAdminControlsVisible = async () => {
  90  |     await expect(dualPricingEligibleSwitch()).toBeVisible({ timeout: 15_000 });
  91  |     await expect(cardMarkupInput()).toBeVisible({ timeout: 15_000 });
  92  |     await expect(convertMenuButton()).toBeVisible();
  93  |     await expect(priceListButton()).toBeVisible();
  94  |     await expect(page.getByText(/legal in every US state/i)).toBeVisible();
  95  |   };
  96  | 
  97  |   return {
  98  |     goto,
  99  |     searchInput,
  100 |     assertPageLoaded,
  101 |     assertTableColumnVisible,
  102 |     findRowByName,
  103 |     assertRestaurantRowVisible,
  104 |     openRowActionMenu,
  105 |     openUpdateRestaurantInfo,
  106 |     dualPricingEligibleSwitch,
  107 |     cardMarkupInput,
  108 |     convertMenuButton,
  109 |     priceListButton,
  110 |     assertDualPricingAdminControlsVisible,
  111 |   };
  112 | };
  113 | 
```