# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/14-owner-settings.spec.ts >> Owner — Owner Settings Tab >> TC-140: the Notifications sub-tab shows the coming-soon placeholder
- Location: tests/dashboard/owner/14-owner-settings.spec.ts:62:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Notification settings — launching soon')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('Notification settings — launching soon')

```

```yaml
- banner:
  - text: LOCATION Boithok Khana Kitchen - — Brooklyn — Owner Settings
  - combobox:
    - paragraph: Boithok Khana Kitchen - — Brooklyn, New York
  - button "Account settings": A
  - button "Select Language":
    - img
    - text: EN
  - button
- navigation "mailbox folders":
  - button "Collapse sidebar"
  - button "Today":
    - paragraph: Today
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
  - 'button "Menu TVs Add-on: TV menu boards from your menu"':
    - paragraph: Menu TVs
    - 'img "Add-on: TV menu boards from your menu"'
  - button "Restaurant Staff":
    - paragraph: Restaurant Staff
  - button "Books & taxes":
    - paragraph: Books & taxes
  - button "RestauNax Voice":
    - paragraph: RestauNax Voice
  - button "Google reviews":
    - paragraph: Google reviews
  - button "Promotions":
    - paragraph: Promotions
  - button "Gift cards":
    - paragraph: Gift cards
  - button "Supply Shop":
    - paragraph: Supply Shop
  - button "Social Media":
    - paragraph: Social Media
  - button "RestauNax Products":
    - paragraph: RestauNax Products
  - button "Owner Settings":
    - paragraph: Owner Settings
- main:
  - paragraph: "Managing: Boithok Khana Kitchen -"
  - heading "Owner Settings" [level=1]
  - tablist:
    - tab "Automated Reports"
    - tab "Notifications" [selected]
  - heading "Messages from RestauNax" [level=2]
  - paragraph: Service and legal notices always arrive, because they cover things like outages, billing and policy changes.
  - switch "Product updates" [checked]
  - text: Product updates
  - paragraph: News about new features and improvements.
  - switch "Training & how-tos" [checked]
  - text: Training & how-tos
  - paragraph: Tips and guides for getting more out of RestauNax.
- button "Open chat"
```

# Test source

```ts
  1  | import { type Page, expect } from "@playwright/test";
  2  | 
  3  | /**
  4  |  * OwnerSettingsPage — the owner "Owner Settings" tab of the restaurant portal
  5  |  * (PortalShell menu id "Owner Settings" → ?tab=Owner Settings). Renders the
  6  |  * OwnerSettings view with two sub-tabs:
  7  |  *   - "Automated Reports" — BusinessReportSettingsTab (loads from
  8  |  *     GET api/owner-settings/reports/:restaurantId; toggles AUTO-SAVE via PUT)
  9  |  *   - "Notifications" — a "launching soon" placeholder
  10 |  *
  11 |  * These tests are intentionally READ-ONLY: the report toggles persist to the
  12 |  * shared QA owner account (and can trigger real summary emails), so we assert
  13 |  * the controls render without ever flipping a switch or saving — same principle
  14 |  * as the subscription/billing tests.
  15 |  */
  16 | export const createOwnerSettingsPage = (page: Page) => {
  17 |   const drawer = () => page.locator(".MuiDrawer-paper").first();
  18 | 
  19 |   const navigateToOwnerSettingsTab = async () => {
  20 |     await drawer()
  21 |       .getByRole("button", { name: "Owner Settings", exact: true })
  22 |       .click();
  23 |     await page.waitForURL(/tab=Owner(%20|\+|\s)?Settings/, { timeout: 10_000 });
  24 |     await pageTitle().waitFor({ state: "visible", timeout: 15_000 });
  25 |   };
  26 | 
  27 |   // "Owner Settings" — <Typography variant="h5" component="h1">
  28 |   const pageTitle = () => page.getByRole("heading", { name: "Owner Settings" });
  29 | 
  30 |   // ── Sub-tabs ────────────────────────────────────────────────────────────────
  31 |   const subTab = (label: string) => page.getByRole("tab", { name: label });
  32 | 
  33 |   const goToSubTab = (label: string) => subTab(label).click();
  34 | 
  35 |   // ── Automated Reports sub-tab (default) ──────────────────────────────────────
  36 |   // Renders only after the settings GET resolves. This label is a
  37 |   // Typography with component="div" (not a heading role) and carries an inline
  38 |   // help icon, so match it by text rather than getByRole("heading").
  39 |   const automatedReportsHeading = () =>
  40 |     page.getByText("Automated Business Reports").first();
  41 | 
  42 |   // The "Save Settings" button and the Schedule section live inside the
  43 |   // `settings.enabled &&` block, so they only exist when the master toggle is
  44 |   // ON — account-state-dependent on shared QA, so tests must not require them.
  45 |   const saveButton = () => page.getByRole("button", { name: "Save Settings" });
  46 | 
  47 |   const assertLoaded = async () => {
  48 |     await expect(pageTitle()).toBeVisible({ timeout: 15_000 });
  49 |     await expect(subTab("Automated Reports")).toBeVisible({ timeout: 10_000 });
  50 |     await expect(subTab("Notifications")).toBeVisible({ timeout: 10_000 });
  51 |   };
  52 | 
  53 |   // Read-only: assert the always-present sections (Order Notifications +
  54 |   // Automated Business Reports), which render regardless of the toggle state.
  55 |   const assertReportsSettingsRendered = async () => {
  56 |     await expect(
  57 |       page.getByRole("heading", { name: "Order Notifications" })
  58 |     ).toBeVisible({ timeout: 15_000 });
  59 |     await expect(automatedReportsHeading()).toBeVisible({ timeout: 15_000 });
  60 |   };
  61 | 
  62 |   // ── Notifications sub-tab (placeholder) ──────────────────────────────────────
  63 |   const assertNotificationsComingSoon = () =>
  64 |     expect(
  65 |       page.getByText("Notification settings — launching soon")
> 66 |     ).toBeVisible({ timeout: 10_000 });
     |       ^ Error: expect(locator).toBeVisible() failed
  67 | 
  68 |   return {
  69 |     navigateToOwnerSettingsTab,
  70 |     pageTitle,
  71 |     subTab,
  72 |     goToSubTab,
  73 |     automatedReportsHeading,
  74 |     saveButton,
  75 |     assertLoaded,
  76 |     assertReportsSettingsRendered,
  77 |     assertNotificationsComingSoon,
  78 |   };
  79 | };
  80 | 
```