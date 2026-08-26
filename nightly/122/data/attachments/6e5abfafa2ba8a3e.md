# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/12-analytics.spec.ts >> Owner — Analytics Tab >> TC-35: owner can open the Analytics tab and see the dashboard header
- Location: tests/dashboard/owner/12-analytics.spec.ts:21:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /\d{1,2},\s*\d{4}\s*-\s*/ })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('button', { name: /\d{1,2},\s*\d{4}\s*-\s*/ })

```

```yaml
- banner:
  - text: LOCATION Boithok Khana Kitchen - — Brooklyn — Analytics
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
  - heading "Restaurant Analytics" [level=1]
  - heading "Comprehensive insights into your restaurant's performance" [level=6]
  - button "Last 30 days"
  - button "Refresh data"
  - heading "Net Sales More info" [level=6]:
    - text: Net Sales
    - button "More info"
  - text: $13,045.45
  - paragraph: 96.2% increase
  - text: Compared to previous period
  - heading "Total Orders More info" [level=6]:
    - text: Total Orders
    - button "More info"
  - text: "970"
  - paragraph: 82.3% increase
  - text: Compared to previous period
  - heading "Average Order Value More info" [level=6]:
    - text: Average Order Value
    - button "More info"
  - text: $13.45
  - paragraph: 7.6% increase
  - text: Compared to previous period
  - heading "New Customers More info" [level=6]:
    - text: New Customers
    - button "More info"
  - text: "586"
  - paragraph: 108.5% increase
  - text: Compared to previous period
  - heading "Returning Customers More info" [level=6]:
    - text: Returning Customers
    - button "More info"
  - text: "3"
  - paragraph: 0.0% no change
  - text: Compared to previous period
  - heading "Revenue Trends" [level=6]
  - group:
    - button "Revenue" [pressed]
    - button "Orders"
  - list:
    - listitem: Current Period
    - listitem: Previous Period
  - img: Jul 27 Jul 30 Aug 2 Aug 5 Aug 8 Aug 11 Aug 14 Aug 17 Aug 20 Aug 23 Aug 26 $0.00 $50… $1.0… $1.5…
  - heading "Revenue Breakdown" [level=6]
  - text: Net Sales
  - heading "$13,045.45" [level=5]
  - text: Total Discounts
  - paragraph: $0.00 (0.0%)
  - text: Restaurant Income
  - paragraph: Food Revenue
  - paragraph: $13,050.45
  - paragraph: Coupon Discounts
  - paragraph: $0.00
  - paragraph: = Net Sales
  - paragraph: $13,045.45
  - separator
  - text: Pass-Through & Reductions
  - paragraph: Taxes Collected
  - text: Collected for government
  - paragraph: $1,144.31
  - paragraph: Tips
  - text: Distributed to staff
  - paragraph: $544.00
  - paragraph: Delivery Fees
  - text: Delivery provider fees
  - paragraph: $224.46
  - paragraph: Deal Savings Given
  - text: Already reflected in food revenue
  - paragraph: $71.50
  - paragraph: Gift Card Used
  - text: Gift card balance applied
  - paragraph: $315.00
  - paragraph: Points Redeemed
  - text: Loyalty rewards applied
  - paragraph: $5.00
  - separator
  - paragraph: Total Collected
  - paragraph: $14,643.22
  - heading "Average Orders by Day of Week" [level=6]
  - text: Averaged over 5 week
  - group:
    - button "Orders" [pressed]
    - button "Revenue"
  - list:
    - listitem: Avg Orders
  - img: Sunday Tuesday Thursday Saturday 0 20 40 60
  - heading "Order Channels" [level=6]
  - img: Web In-Store 0 500
  - paragraph: 🌐 Web
  - paragraph: "912"
  - text: $12,191.84
  - paragraph: 📱 Mobile App
  - paragraph: "0"
  - text: $0.00
  - paragraph: 🎙️ Voice AI
  - paragraph: "0"
  - text: $0.00
  - paragraph: 🏪 In-Store
  - paragraph: "58"
  - text: $853.61
  - paragraph: 🛵 Uber Eats
  - paragraph: "0"
  - text: $0.00
  - paragraph: 🚗 DoorDash
  - paragraph: "0"
  - text: $0.00 Delivery 10% Pickup 90%
  - heading "Coupon Performance" [level=6]
  - button "More info"
  - text: Active Coupons
  - heading "23" [level=6]
  - text: Total Redemptions
  - heading "0" [level=6]
  - text: Discounts Given
  - heading "$0.00" [level=6]
  - text: Revenue Generated
  - heading "$0.00" [level=6]
  - tablist:
    - tab "Top Coupons" [selected]
    - tab "Trend"
  - table:
    - rowgroup:
      - row "Code Type Used Discount Status":
        - columnheader "Code"
        - columnheader "Type"
        - columnheader "Used"
        - columnheader "Discount"
        - columnheader "Status"
    - rowgroup:
      - row "VIP-FS4J 20% 0 $0.00 ACTIVE":
        - cell "VIP-FS4J":
          - paragraph: VIP-FS4J
        - cell "20%"
        - cell "0"
        - cell "$0.00"
        - cell "ACTIVE"
      - row "ANN-CRJKTY4B 5$ 0 $0.00 ACTIVE":
        - cell "ANN-CRJKTY4B":
          - paragraph: ANN-CRJKTY4B
        - cell "5$"
        - cell "0"
        - cell "$0.00"
        - cell "ACTIVE"
      - row "OFF10 10% 0 $0.00 ACTIVE":
        - cell "OFF10":
          - paragraph: OFF10
        - cell "10%"
        - cell "0"
        - cell "$0.00"
        - cell "ACTIVE"
      - row "OFF100 100% 0 $0.00 ACTIVE":
        - cell "OFF100":
          - paragraph: OFF100
        - cell "100%"
        - cell "0"
        - cell "$0.00"
        - cell "ACTIVE"
      - row "WINBACK-ZI6K 15% 0 $0.00 ACTIVE":
        - cell "WINBACK-ZI6K":
          - paragraph: WINBACK-ZI6K
        - cell "15%"
        - cell "0"
        - cell "$0.00"
        - cell "ACTIVE"
      - row "AUTO517E9359 10% 0 $0.00 ACTIVE":
        - cell "AUTO517E9359":
          - paragraph: AUTO517E9359
        - cell "10%"
        - cell "0"
        - cell "$0.00"
        - cell "ACTIVE"
      - row "AUTOA1A0A0AD 5$ 0 $0.00 ACTIVE":
        - cell "AUTOA1A0A0AD":
          - paragraph: AUTOA1A0A0AD
        - cell "5$"
        - cell "0"
        - cell "$0.00"
        - cell "ACTIVE"
      - row "AUTOE463CA1E 10% 0 $0.00 ACTIVE":
        - cell "AUTOE463CA1E":
          - paragraph: AUTOE463CA1E
        - cell "10%"
        - cell "0"
        - cell "$0.00"
        - cell "ACTIVE"
      - row "AUTO3E299B7D 10% 0 $0.00 ACTIVE":
        - cell "AUTO3E299B7D":
          - paragraph: AUTO3E299B7D
        - cell "10%"
        - cell "0"
        - cell "$0.00"
        - cell "ACTIVE"
      - row "AUTO5FCC4AF9 10% 0 $0.00 ACTIVE":
        - cell "AUTO5FCC4AF9":
          - paragraph: AUTO5FCC4AF9
        - cell "10%"
        - cell "0"
        - cell "$0.00"
        - cell "ACTIVE"
  - heading "Deal Performance" [level=6]
  - button "More info"
  - text: Active Deals
  - heading "7" [level=6]
  - text: Total Orders
  - heading "0" [level=6]
  - text: Deal Revenue
  - heading "$0.00" [level=6]
  - text: Avg. Savings
  - heading "0%" [level=6]
  - heading "Top Performing Deals" [level=6]
  - table:
    - rowgroup:
      - row "Deal Price Savings Usage Status":
        - columnheader "Deal"
        - columnheader "Price"
        - columnheader "Savings"
        - columnheader "Usage"
        - columnheader "Status"
    - rowgroup:
      - row "AUTO Table Inactive 3cf26b12 $12.00 $16.50 27% off 0 0 INACTIVE":
        - cell "AUTO Table Inactive 3cf26b12":
          - paragraph: AUTO Table Inactive 3cf26b12
        - cell "$12.00 $16.50":
          - paragraph: $12.00
          - text: $16.50
        - cell "27% off"
        - cell "0 0":
          - progressbar
          - text: "0"
        - cell "INACTIVE"
      - row "AUTO Table Restricted 3cf26b12 $12.00 $16.50 27% off 0 0 INACTIVE":
        - cell "AUTO Table Restricted 3cf26b12":
          - paragraph: AUTO Table Restricted 3cf26b12
        - cell "$12.00 $16.50":
          - paragraph: $12.00
          - text: $16.50
        - cell "27% off"
        - cell "0 0":
          - progressbar
          - text: "0"
        - cell "INACTIVE"
      - row "AUTO Table Expired 3cf26b12 $12.00 $16.50 27% off 0 0 ACTIVE":
        - cell "AUTO Table Expired 3cf26b12":
          - paragraph: AUTO Table Expired 3cf26b12
        - cell "$12.00 $16.50":
          - paragraph: $12.00
          - text: $16.50
        - cell "27% off"
        - cell "0 0":
          - progressbar
          - text: "0"
        - cell "ACTIVE"
      - row "Family Feast Special $50.12 $58.96 15% off 0 0 ACTIVE":
        - cell "Family Feast Special":
          - paragraph: Family Feast Special
        - cell "$50.12 $58.96":
          - paragraph: $50.12
          - text: $58.96
        - cell "15% off"
        - cell "0 0":
          - progressbar
          - text: "0"
        - cell "ACTIVE"
      - row "Solo Delight Combo $16.99 $19.98 15% off 0 0 ACTIVE":
        - cell "Solo Delight Combo":
          - paragraph: Solo Delight Combo
        - cell "$16.99 $19.98":
          - paragraph: $16.99
          - text: $19.98
        - cell "15% off"
        - cell "0 0":
          - progressbar
          - text: "0"
        - cell "ACTIVE"
      - row "Bruschetta Duo Deal $16.99 $19.98 15% off 0 0 ACTIVE":
        - cell "Bruschetta Duo Deal":
          - paragraph: Bruschetta Duo Deal
        - cell "$16.99 $19.98":
          - paragraph: $16.99
          - text: $19.98
        - cell "15% off"
        - cell "0 0":
          - progressbar
          - text: "0"
        - cell "ACTIVE"
      - row "AUTO Table Plain 3cf26b12 $12.00 $16.50 27% off 0 0 ACTIVE":
        - cell "AUTO Table Plain 3cf26b12":
          - paragraph: AUTO Table Plain 3cf26b12
        - cell "$12.00 $16.50":
          - paragraph: $12.00
          - text: $16.50
        - cell "27% off"
        - cell "0 0":
          - progressbar
          - text: "0"
        - cell "ACTIVE"
      - row "Date Night Indulgence $35.99 $43.96 18% off 0 0 ACTIVE":
        - cell "Date Night Indulgence":
          - paragraph: Date Night Indulgence
        - cell "$35.99 $43.96":
          - paragraph: $35.99
          - text: $43.96
        - cell "18% off"
        - cell "0 0":
          - progressbar
          - text: "0"
        - cell "ACTIVE"
      - row "Game Day Platter $24.99 $32.97 24% off 0 0 ACTIVE":
        - cell "Game Day Platter":
          - paragraph: Game Day Platter
        - cell "$24.99 $32.97":
          - paragraph: $24.99
          - text: $32.97
        - cell "24% off"
        - cell "0 0":
          - progressbar
          - text: "0"
        - cell "ACTIVE"
      - row "AUTO Table Pricey 3cf26b12 $20.00 $24.00 17% off 0 0 INACTIVE":
        - cell "AUTO Table Pricey 3cf26b12":
          - paragraph: AUTO Table Pricey 3cf26b12
        - cell "$20.00 $24.00":
          - paragraph: $20.00
          - text: $24.00
        - cell "17% off"
        - cell "0 0":
          - progressbar
          - text: "0"
        - cell "INACTIVE"
  - heading "Tip Analysis" [level=6]
  - text: Total Tips
  - heading "$544.00" [level=6]
  - text: 99.6% Avg. Tip %
  - heading "14.1%" [level=6]
  - text: Tipping Rate
  - heading "28%" [level=6]
  - img: No Tip Under 15% 15-20% Over 20% 0 500
  - text: Avg. Tip per Order
  - paragraph: $0.56
  - heading "Refunds & Cancellations" [level=6]
  - text: Total Refunds
  - heading "$643.20" [level=6]
  - text: 0.0% Refund Rate
  - heading "4.1%" [level=6]
  - text: Cancellations
  - heading "87" [level=6]
  - separator
  - paragraph: Refund Count
  - paragraph: "40"
  - heading "Top Reasons" [level=6]
  - text: "40"
  - paragraph: Cancelled by restaurant
  - text: $643.20
  - heading "Top Selling Items" [level=6]
  - group:
    - button "By Quantity" [pressed]
    - button "By Revenue"
  - table:
    - rowgroup:
      - row "Item Quantity Revenue Avg. Price":
        - columnheader "Item"
        - columnheader "Quantity"
        - columnheader "Revenue"
        - columnheader "Avg. Price"
    - rowgroup:
      - row "1 Automation Burger 878 $11,405.22 $12.99":
        - cell "1 Automation Burger":
          - text: "1"
          - paragraph: Automation Burger
        - cell "878"
        - cell "$11,405.22"
        - cell "$12.99"
      - row "2 Build Your Burger 45 $629.55 $13.99":
        - cell "2 Build Your Burger":
          - text: "2"
          - paragraph: Build Your Burger
        - cell "45"
        - cell "$629.55"
        - cell "$13.99"
      - row "3 Chicken Wings 18 $269.82 $14.99":
        - cell "3 Chicken Wings":
          - text: "3"
          - paragraph: Chicken Wings
        - cell "18"
        - cell "$269.82"
        - cell "$14.99"
      - row "4 Fish & Chips 13 $207.87 $15.99":
        - cell "4 Fish & Chips":
          - text: "4"
          - paragraph: Fish & Chips
        - cell "13"
        - cell "$207.87"
        - cell "$15.99"
      - row "5 Build Your Sundae 8 $63.92 $7.99":
        - cell "5 Build Your Sundae":
          - text: "5"
          - paragraph: Build Your Sundae
        - cell "8"
        - cell "$63.92"
        - cell "$7.99"
      - row "6 Loaded Fries 7 $48.93 $6.99":
        - cell "6 Loaded Fries":
          - text: "6"
          - paragraph: Loaded Fries
        - cell "7"
        - cell "$48.93"
        - cell "$6.99"
      - row "7 Philly Cheesesteak 6 $77.94 $12.99":
        - cell "7 Philly Cheesesteak":
          - text: "7"
          - paragraph: Philly Cheesesteak
        - cell "6"
        - cell "$77.94"
        - cell "$12.99"
      - row "8 Triple Decker Club 2 $27.98 $13.99":
        - cell "8 Triple Decker Club":
          - text: "8"
          - paragraph: Triple Decker Club
        - cell "2"
        - cell "$27.98"
        - cell "$13.99"
      - row "9 Eee 1 $1.00 $1.00":
        - cell "9 Eee":
          - text: "9"
          - paragraph: Eee
        - cell "1"
        - cell "$1.00"
        - cell "$1.00"
      - row "10 Loaded Mac & Cheese 1 $10.99 $10.99":
        - cell "10 Loaded Mac & Cheese":
          - text: "10"
          - paragraph: Loaded Mac & Cheese
        - cell "1"
        - cell "$10.99"
        - cell "$10.99"
  - heading "Average Busiest Hours" [level=6]
  - button "More info"
  - text: Averaged over 5 week
  - combobox "All Days"
  - text: 0.7 0.8 0.1 1.2 0.5 0.4 12.0 1.5 0.3 0.9 0.8 2.1 2.1 2.1 0.7 1.5 1.4 1.1 1.1 0.6 12am 3am 6am 9am 12pm 3pm 6pm 9pm 11pm Not Busy Very Busy
  - heading "Customer Insights" [level=6]
  - tablist:
    - tab "Top Customers" [selected]
    - tab "Summary"
  - table:
    - rowgroup:
      - row "Customer Orders Total Spent Avg. Order":
        - columnheader "Customer"
        - columnheader "Orders"
        - columnheader "Total Spent"
        - columnheader "Avg. Order"
    - rowgroup:
      - row "j***@restaunax-test.com 134 $1,748.67 $13.05":
        - cell "j***@restaunax-test.com"
        - cell "134"
        - cell "$1,748.67"
        - cell "$13.05"
      - row "a***@restaunax-test.com 107 $1,389.93 $12.99":
        - cell "a***@restaunax-test.com"
        - cell "107"
        - cell "$1,389.93"
        - cell "$12.99"
      - row "n***@gmail.com 8 $165.89 $20.74":
        - cell "n***@gmail.com"
        - cell "8"
        - cell "$165.89"
        - cell "$20.74"
      - row "n***@gmail.com 7 $158.87 $22.70":
        - cell "n***@gmail.com"
        - cell "7"
        - cell "$158.87"
        - cell "$22.70"
      - row "n***@outlook.com 5 $155.89 $31.18":
        - cell "n***@outlook.com"
        - cell "5"
        - cell "$155.89"
        - cell "$31.18"
      - row "u***@gmail.com 1 $32.97 $32.97":
        - cell "u***@gmail.com"
        - cell "1"
        - cell "$32.97"
        - cell "$32.97"
      - row "d***@restaunax-test.com 1 $21.00 $21.00":
        - cell "d***@restaunax-test.com"
        - cell "1"
        - cell "$21.00"
        - cell "$21.00"
      - row "d***@restaunax-test.com 1 $21.00 $21.00":
        - cell "d***@restaunax-test.com"
        - cell "1"
        - cell "$21.00"
        - cell "$21.00"
      - row "d***@restaunax-test.com 1 $21.00 $21.00":
        - cell "d***@restaunax-test.com"
        - cell "1"
        - cell "$21.00"
        - cell "$21.00"
      - row "d***@restaunax-test.com 1 $21.00 $21.00":
        - cell "d***@restaunax-test.com"
        - cell "1"
        - cell "$21.00"
        - cell "$21.00"
- button "Open chat"
```

# Test source

```ts
  1  | import { type Page, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * OwnerAnalyticsPage — the owner "Analytics" tab of the restaurant portal
  5  |  * (PortalShell menu id "Analytics" → ?tab=Analytics). Renders the
  6  |  * Restaurant Analytics dashboard: summary cards, a date-range picker, and a
  7  |  * set of charts, all driven by GET /api/analytics/dashboard/:restaurantId.
  8  |  *
  9  |  * Selectors use roles/visible text (no test-ids) to match the QA deployment,
  10 |  * consistent with OwnerOrdersPage. The page title, card titles, and quick-
  11 |  * select labels come from the `analytics` i18n namespace.
  12 |  */
  13 | export const createOwnerAnalyticsPage = (page: Page) => {
  14 |   const drawer = () => page.locator(".MuiDrawer-paper").first();
  15 | 
  16 |   const navigateToAnalyticsTab = async () => {
  17 |     await drawer()
  18 |       .getByRole("button", { name: "Analytics", exact: true })
  19 |       .click();
  20 |     await page.waitForURL(/tab=Analytics/, { timeout: 10_000 });
  21 |     await pageTitle().waitFor({ state: "visible", timeout: 15_000 });
  22 |   };
  23 | 
  24 |   // "Restaurant Analytics" — rendered as <Typography variant="h4" component="h1">
  25 |   const pageTitle = () =>
  26 |     page.getByRole("heading", { name: "Restaurant Analytics" });
  27 | 
  28 |   const refreshButton = () =>
  29 |     page.getByRole("button", { name: "Refresh data" });
  30 | 
  31 |   // The date-range trigger is an outlined button whose label IS the formatted
  32 |   // range (e.g. "Jun 7, 2026 - Jul 7, 2026"). Match on that shape rather than a
  33 |   // fixed string so it survives whatever the current default window is.
  34 |   const dateRangeButton = () =>
  35 |     page.getByRole("button", { name: /\d{1,2},\s*\d{4}\s*-\s*/ });
  36 | 
  37 |   // ── Assertions ─────────────────────────────────────────────────────────────
  38 |   const assertLoaded = async () => {
  39 |     await expect(pageTitle()).toBeVisible({ timeout: 15_000 });
  40 |     await expect(refreshButton()).toBeVisible({ timeout: 10_000 });
> 41 |     await expect(dateRangeButton()).toBeVisible({ timeout: 10_000 });
     |                                     ^ Error: expect(locator).toBeVisible() failed
  42 |   };
  43 | 
  44 |   // The dashboard resolves to one of two deterministic states once the API
  45 |   // responds: summary cards (has data) OR the "no data for this range" empty
  46 |   // state. Both prove the tab loaded and the fetch completed without erroring.
  47 |   // Target the card by its heading — the same text also appears as a chart
  48 |   // caption ("Order Summary by Status"), so a plain getByText double-matches.
  49 |   const summaryCard = (title: string) =>
  50 |     page.getByRole("heading", { name: new RegExp(title) });
  51 | 
  52 |   const emptyState = () =>
  53 |     page.getByText("No analytics data for this date range");
  54 | 
  55 |   const assertDashboardResolved = async () => {
  56 |     await expect(
  57 |       summaryCard("Total Orders").or(emptyState()).first()
  58 |     ).toBeVisible({ timeout: 20_000 });
  59 |   };
  60 | 
  61 |   const assertNoError = () =>
  62 |     expect(
  63 |       page.getByText("Failed to load dashboard data. Please try again.")
  64 |     ).toHaveCount(0);
  65 | 
  66 |   // ── Date-range picker ──────────────────────────────────────────────────────
  67 |   const openDateRangePicker = async () => {
  68 |     await dateRangeButton().click();
  69 |     await page
  70 |       .getByText("Quick Select")
  71 |       .waitFor({ state: "visible", timeout: 10_000 });
  72 |   };
  73 | 
  74 |   const quickSelectOption = (label: string) =>
  75 |     page.getByRole("button", { name: label, exact: true });
  76 | 
  77 |   // Pick a preset (e.g. "Last 7 days") and apply it.
  78 |   const applyQuickSelect = async (label: string) => {
  79 |     await quickSelectOption(label).click();
  80 |     await page.getByRole("button", { name: "Apply", exact: true }).click();
  81 |   };
  82 | 
  83 |   return {
  84 |     navigateToAnalyticsTab,
  85 |     pageTitle,
  86 |     refreshButton,
  87 |     dateRangeButton,
  88 |     summaryCard,
  89 |     emptyState,
  90 |     assertLoaded,
  91 |     assertDashboardResolved,
  92 |     assertNoError,
  93 |     openDateRangePicker,
  94 |     quickSelectOption,
  95 |     applyQuickSelect,
  96 |   };
  97 | };
  98 | 
```