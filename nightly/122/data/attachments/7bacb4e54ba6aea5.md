# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/15-daily-report.spec.ts >> Owner — Daily Report Tab >> TC-141: owner can open the Daily Report and see the current day's live report
- Location: tests/dashboard/owner/15-daily-report.spec.ts:69:7

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Daily Report', exact: true })
    - locator resolved to <button tabindex="0" type="button" class="MuiButtonBase-root css-n67lck">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  - retrying click action
    - waiting 100ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - performing click action
    - <div class="MuiBox-root css-1kh2jfe">…</div> from <div id="root">…</div> subtree intercepts pointer events
  - retrying click action
    - waiting 100ms
    - waiting for element to be visible, enabled and stable
    - element is not stable
  - retrying click action
    - waiting 500ms
    - waiting for element to be visible, enabled and stable
  - element was detached from the DOM, retrying

```

# Test source

```ts
  1  | import { type Page, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * OwnerDailyReportPage — the owner "Daily Report" tab (Store Operations →
  5  |  * "Daily Report", PortalShell id "store-daily-close" → ?tab=store-daily-close,
  6  |  * rendering DailyCloseTab). The default view is the CURRENT business day's live
  7  |  * report: an "At a Glance" comparison-KPI block (Net Sales / Orders / Avg Order
  8  |  * Value / Customers) plus a "Sales" section, aggregated from the day's orders.
  9  |  *
  10 |  * Store Operations is a SidebarFlyoutSection — on desktop the sub-items live in
  11 |  * a flyout that opens when its header is clicked; then the "Daily Report" row is
  12 |  * clickable. Selectors use roles/visible text (no test-ids), consistent with the
  13 |  * other owner POMs.
  14 |  */
  15 | export const createOwnerDailyReportPage = (page: Page) => {
  16 |   const drawer = () => page.locator(".MuiDrawer-paper").first();
  17 | 
  18 |   const navigateToDailyReportTab = async () => {
  19 |     // Open the Store Operations flyout (desktop: click the header opens it).
  20 |     await drawer().getByRole("button", { name: "Store Operations" }).click();
  21 |     // Click the "Daily Report" row that appears in the flyout.
  22 |     await page
  23 |       .getByRole("button", { name: "Daily Report", exact: true })
> 24 |       .click();
     |        ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  25 |     await page.waitForURL(/tab=store-daily-close/, { timeout: 10_000 });
  26 |     await comparisonsSection().waitFor({ state: "visible", timeout: 20_000 });
  27 |   };
  28 | 
  29 |   // "At a Glance" — the comparison-KPI block; a unique, stable signal that the
  30 |   // live current-day report finished loading.
  31 |   const comparisonsSection = () =>
  32 |     page.getByText("At a Glance", { exact: true });
  33 | 
  34 |   // The comparison tiles show the current day's headline figures.
  35 |   const netSalesTile = () => page.getByText("Net Sales", { exact: true });
  36 |   const ordersTile = () => page.getByText("Orders", { exact: true }).first();
  37 | 
  38 |   const assertReportLoaded = async () => {
  39 |     await expect(comparisonsSection()).toBeVisible({ timeout: 20_000 });
  40 |     await expect(netSalesTile()).toBeVisible({ timeout: 10_000 });
  41 |     await expect(ordersTile()).toBeVisible({ timeout: 10_000 });
  42 |   };
  43 | 
  44 |   const assertNoLoadError = () =>
  45 |     expect(page.getByText("Failed to load", { exact: false })).toHaveCount(0);
  46 | 
  47 |   return {
  48 |     navigateToDailyReportTab,
  49 |     comparisonsSection,
  50 |     netSalesTile,
  51 |     ordersTile,
  52 |     assertReportLoaded,
  53 |     assertNoLoadError,
  54 |   };
  55 | };
  56 | 
```