# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/12-analytics.spec.ts >> Owner — Analytics Tab >> TC-128: the date-range picker opens with quick-select presets
- Location: tests/dashboard/owner/12-analytics.spec.ts:83:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /^(Today|Yesterday|Last 7 days|Last 30 days|Last 90 days|This month|Last month|This year|Last year)$|\d{1,2},\s*\d{4}\s*-\s*/ })
Expected: visible
Error: strict mode violation: getByRole('button', { name: /^(Today|Yesterday|Last 7 days|Last 30 days|Last 90 days|This month|Last month|This year|Last year)$|\d{1,2},\s*\d{4}\s*-\s*/ }) resolved to 2 elements:
    1) <button tabindex="0" type="button" data-tour="tab-today" class="MuiButtonBase-root css-ibf5oa">…</button> aka getByRole('button', { name: 'Today' })
    2) <button tabindex="0" type="button" class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-outlinedPrimary MuiButton-sizeMedium MuiButton-outlinedSizeMedium MuiButton-colorPrimary MuiButton-root MuiButton-outlined MuiButton-outlinedPrimary MuiButton-sizeMedium MuiButton-outlinedSizeMedium MuiButton-colorPrimary css-1rrn6pw">…</button> aka getByRole('button', { name: 'Last 30 days' })

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: /^(Today|Yesterday|Last 7 days|Last 30 days|Last 90 days|This month|Last month|This year|Last year)$|\d{1,2},\s*\d{4}\s*-\s*/ })

```

# Test source

```ts
  1   | import { type Page, expect } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * OwnerAnalyticsPage — the owner "Analytics" tab of the restaurant portal
  5   |  * (PortalShell menu id "Analytics" → ?tab=Analytics). Renders the
  6   |  * Restaurant Analytics dashboard: summary cards, a date-range picker, and a
  7   |  * set of charts, all driven by GET /api/analytics/dashboard/:restaurantId.
  8   |  *
  9   |  * Selectors use roles/visible text (no test-ids) to match the QA deployment,
  10  |  * consistent with OwnerOrdersPage. The page title, card titles, and quick-
  11  |  * select labels come from the `analytics` i18n namespace.
  12  |  */
  13  | export const createOwnerAnalyticsPage = (page: Page) => {
  14  |   const drawer = () => page.locator(".MuiDrawer-paper").first();
  15  | 
  16  |   const navigateToAnalyticsTab = async () => {
  17  |     await drawer()
  18  |       .getByRole("button", { name: "Analytics", exact: true })
  19  |       .click();
  20  |     await page.waitForURL(/tab=Analytics/, { timeout: 10_000 });
  21  |     await pageTitle().waitFor({ state: "visible", timeout: 15_000 });
  22  |   };
  23  | 
  24  |   // "Restaurant Analytics" — rendered as <Typography variant="h4" component="h1">
  25  |   const pageTitle = () =>
  26  |     page.getByRole("heading", { name: "Restaurant Analytics" });
  27  | 
  28  |   const refreshButton = () =>
  29  |     page.getByRole("button", { name: "Refresh data" });
  30  | 
  31  |   // The date-range trigger is an outlined button. Since RestauNax 5ca965101
  32  |   // (dateRangePresets.describeDateRange) its label is the quick-select PRESET
  33  |   // NAME whenever the range is one ("Last 30 days" — the default window), and
  34  |   // the literal dates ("Jun 7, 2026 - Jul 7, 2026") only for a custom range.
  35  |   // Match either shape; tests assert the exact preset where it is known.
  36  |   const DATE_RANGE_PRESET_LABELS = [
  37  |     "Today",
  38  |     "Yesterday",
  39  |     "Last 7 days",
  40  |     "Last 30 days",
  41  |     "Last 90 days",
  42  |     "This month",
  43  |     "Last month",
  44  |     "This year",
  45  |     "Last year",
  46  |   ];
  47  |   const dateRangeButton = () =>
  48  |     page.getByRole("button", {
  49  |       name: new RegExp(
  50  |         `^(${DATE_RANGE_PRESET_LABELS.join("|")})$|\\d{1,2},\\s*\\d{4}\\s*-\\s*`
  51  |       ),
  52  |     });
  53  | 
  54  |   // ── Assertions ─────────────────────────────────────────────────────────────
  55  |   const assertLoaded = async () => {
  56  |     await expect(pageTitle()).toBeVisible({ timeout: 15_000 });
  57  |     await expect(refreshButton()).toBeVisible({ timeout: 10_000 });
> 58  |     await expect(dateRangeButton()).toBeVisible({ timeout: 10_000 });
      |                                     ^ Error: expect(locator).toBeVisible() failed
  59  |   };
  60  | 
  61  |   // The dashboard resolves to one of two deterministic states once the API
  62  |   // responds: summary cards (has data) OR the "no data for this range" empty
  63  |   // state. Both prove the tab loaded and the fetch completed without erroring.
  64  |   // Target the card by its heading — the same text also appears as a chart
  65  |   // caption ("Order Summary by Status"), so a plain getByText double-matches.
  66  |   const summaryCard = (title: string) =>
  67  |     page.getByRole("heading", { name: new RegExp(title) });
  68  | 
  69  |   const emptyState = () =>
  70  |     page.getByText("No analytics data for this date range");
  71  | 
  72  |   const assertDashboardResolved = async () => {
  73  |     await expect(
  74  |       summaryCard("Total Orders").or(emptyState()).first()
  75  |     ).toBeVisible({ timeout: 20_000 });
  76  |   };
  77  | 
  78  |   const assertNoError = () =>
  79  |     expect(
  80  |       page.getByText("Failed to load dashboard data. Please try again.")
  81  |     ).toHaveCount(0);
  82  | 
  83  |   // ── Date-range picker ──────────────────────────────────────────────────────
  84  |   const openDateRangePicker = async () => {
  85  |     await dateRangeButton().click();
  86  |     await page
  87  |       .getByText("Quick Select")
  88  |       .waitFor({ state: "visible", timeout: 10_000 });
  89  |   };
  90  | 
  91  |   const quickSelectOption = (label: string) =>
  92  |     page.getByRole("button", { name: label, exact: true });
  93  | 
  94  |   // Pick a preset (e.g. "Last 7 days") and apply it.
  95  |   const applyQuickSelect = async (label: string) => {
  96  |     await quickSelectOption(label).click();
  97  |     await page.getByRole("button", { name: "Apply", exact: true }).click();
  98  |   };
  99  | 
  100 |   return {
  101 |     navigateToAnalyticsTab,
  102 |     pageTitle,
  103 |     refreshButton,
  104 |     dateRangeButton,
  105 |     summaryCard,
  106 |     emptyState,
  107 |     assertLoaded,
  108 |     assertDashboardResolved,
  109 |     assertNoError,
  110 |     openDateRangePicker,
  111 |     quickSelectOption,
  112 |     applyQuickSelect,
  113 |   };
  114 | };
  115 | 
```