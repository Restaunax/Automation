# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/39-portal-navigation-ui.spec.ts >> Owner — portal navigation: Back and unsaved changes (UI) >> TC-1944: Back walks back through sidebar tabs, one at a time, to Today
- Location: tests/dashboard/owner/39-portal-navigation-ui.spec.ts:129:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "Orders"
Received: "Customers"

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - banner [ref=e5]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - generic [ref=e9]:
            - img [ref=e10]
            - generic [ref=e12]: LOCATION
          - generic "Automation Owner2 Store 7d3055a1 — Miami — Customers" [ref=e13]
        - generic [ref=e15]:
          - generic [ref=e17]:
            - img [ref=e18]
            - generic [ref=e20]:
              - paragraph [ref=e21]: Automation Owner2 Store 7d3055a1
              - generic [ref=e22]: Miami, FL
          - button "Account settings" [ref=e24] [cursor=pointer]:
            - generic [ref=e25]: A
          - button "Select Language" [ref=e27] [cursor=pointer]:
            - img [ref=e29]
            - text: EN
          - button [ref=e35] [cursor=pointer]:
            - img [ref=e36]
    - navigation "mailbox folders" [ref=e38]:
      - generic [ref=e40]:
        - button "Collapse sidebar" [ref=e42] [cursor=pointer]:
          - img [ref=e43]
        - generic [ref=e46]:
          - button "Today" [ref=e47] [cursor=pointer]:
            - img [ref=e49]
            - paragraph [ref=e51]: Today
          - button "Analytics" [ref=e52] [cursor=pointer]:
            - img [ref=e54]
            - paragraph [ref=e56]: Analytics
          - button "Orders" [ref=e57] [cursor=pointer]:
            - img [ref=e59]
            - paragraph [ref=e61]: Orders
          - button "Menu" [ref=e62] [cursor=pointer]:
            - img [ref=e64]
            - paragraph [ref=e66]: Menu
          - button "Customers" [ref=e67] [cursor=pointer]:
            - img [ref=e69]
            - paragraph [ref=e71]: Customers
          - button "Billing" [ref=e72] [cursor=pointer]:
            - img [ref=e74]
            - paragraph [ref=e76]: Billing
          - button "Image Library" [ref=e77] [cursor=pointer]:
            - img [ref=e79]
            - paragraph [ref=e81]: Image Library
          - button "Store Settings" [ref=e82] [cursor=pointer]:
            - img [ref=e84]
            - paragraph [ref=e86]: Store Settings
          - button "Store Operations" [ref=e88] [cursor=pointer]:
            - img [ref=e90]
            - paragraph [ref=e92]: Store Operations
            - img [ref=e94]
          - button "Job Applications" [ref=e96] [cursor=pointer]:
            - img [ref=e98]
            - paragraph [ref=e100]: Job Applications
          - 'button "Menu TVs Add-on: TV menu boards from your menu" [ref=e101] [cursor=pointer]':
            - img [ref=e103]
            - paragraph [ref=e105]: Menu TVs
            - 'img "Add-on: TV menu boards from your menu" [ref=e107]':
              - img [ref=e108]
          - button "Restaurant Staff" [ref=e110] [cursor=pointer]:
            - img [ref=e112]
            - paragraph [ref=e114]: Restaurant Staff
          - button "Books & taxes" [ref=e115] [cursor=pointer]:
            - img [ref=e117]
            - paragraph [ref=e119]: Books & taxes
          - 'button "RestauNax Voice Add-on: AI answers your phone" [ref=e120] [cursor=pointer]':
            - img [ref=e122]
            - paragraph [ref=e125]: RestauNax Voice
            - 'img "Add-on: AI answers your phone" [ref=e127]':
              - img [ref=e128]
          - button "Google reviews" [ref=e130] [cursor=pointer]:
            - img [ref=e132]
            - paragraph [ref=e134]: Google reviews
          - button "Promotions" [ref=e136] [cursor=pointer]:
            - img [ref=e138]
            - paragraph [ref=e140]: Promotions
            - img [ref=e142]
          - button "Gift cards" [ref=e144] [cursor=pointer]:
            - img [ref=e146]
            - paragraph [ref=e148]: Gift cards
          - button "Supply Shop" [ref=e149] [cursor=pointer]:
            - img [ref=e151]
            - paragraph [ref=e153]: Supply Shop
          - button "Social Media" [ref=e155] [cursor=pointer]:
            - img [ref=e157]
            - paragraph [ref=e159]: Social Media
            - img [ref=e161]
          - button "RestauNax Products" [ref=e163] [cursor=pointer]:
            - img [ref=e165]
            - paragraph [ref=e167]: RestauNax Products
        - button "Owner Settings" [ref=e170] [cursor=pointer]:
          - img [ref=e172]
          - paragraph [ref=e175]: Owner Settings
    - main [ref=e176]:
      - generic [ref=e178]:
        - img [ref=e179]
        - paragraph [ref=e181]:
          - generic [ref=e182]: "Managing:"
          - text: Automation Owner2 Store 7d3055a1
      - generic [ref=e184]:
        - tablist "customer management tabs" [ref=e189]:
          - tab "All Customers" [selected] [ref=e190] [cursor=pointer]:
            - img [ref=e191]
            - text: All Customers
          - tab "Customer Groups" [ref=e193] [cursor=pointer]:
            - img [ref=e194]
            - text: Customer Groups
          - tab "Analytics" [ref=e198] [cursor=pointer]:
            - img [ref=e199]
            - text: Analytics
        - tabpanel "All Customers" [ref=e201]:
          - generic [ref=e203]:
            - generic [ref=e204]:
              - heading "Customers" [level=1] [ref=e205]
              - paragraph [ref=e206]: View and manage your customer base
            - generic [ref=e207]:
              - generic [ref=e210]:
                - paragraph [ref=e211]: Total Customers
                - heading "0" [level=4] [ref=e212]
                - paragraph [ref=e213]: 0 new this month
              - generic [ref=e216]:
                - paragraph [ref=e217]: Active Customers
                - heading "0" [level=4] [ref=e218]
                - paragraph [ref=e219]: Ordered in last 30 days
              - generic [ref=e222]:
                - paragraph [ref=e223]: Inactive Customers
                - heading "0" [level=4] [ref=e224]
                - paragraph [ref=e225]: Haven't ordered recently
              - generic [ref=e228]:
                - paragraph [ref=e229]: Avg Lifetime Value
                - heading "$0.00" [level=4] [ref=e230]
                - paragraph [ref=e231]: Per customer
            - generic [ref=e233]:
              - generic [ref=e236]:
                - img [ref=e238]
                - textbox "Search by name, email, or phone" [ref=e240]
                - group
              - generic [ref=e243]:
                - combobox [ref=e244] [cursor=pointer]: All Customers
                - textbox: all
                - img
                - group:
                  - generic: Last order
              - generic [ref=e246]:
                - button "Refresh" [ref=e247] [cursor=pointer]:
                  - img [ref=e249]
                  - text: Refresh
                - button "Download CSV" [ref=e251] [cursor=pointer]:
                  - img [ref=e252]
            - generic [ref=e255]:
              - toolbar [ref=e256]:
                - button "Columns" [ref=e257] [cursor=pointer]:
                  - img [ref=e258]
                - separator [ref=e260]
                - button "Export" [ref=e261] [cursor=pointer]:
                  - img [ref=e262]
                - separator [ref=e264]
                - generic [ref=e265]:
                  - button "Search" [ref=e266] [cursor=pointer]:
                    - img [ref=e267]
                  - generic "Search" [ref=e269]:
                    - generic [ref=e270]:
                      - img [ref=e272]
                      - searchbox "Search…" [ref=e274]
                      - group
              - grid [ref=e275]:
                - row "Customer Contact Orders Total Spent Sort Avg Order Last Order Status Actions" [ref=e276]:
                  - columnheader "Customer" [ref=e277] [cursor=pointer]:
                    - generic [ref=e279]: Customer
                    - generic [ref=e280]:
                      - img
                  - columnheader "Contact" [ref=e281]:
                    - generic [ref=e283]: Contact
                    - generic [ref=e284]:
                      - img
                  - columnheader "Orders" [ref=e285] [cursor=pointer]:
                    - generic [ref=e287]: Orders
                    - generic [ref=e288]:
                      - img
                  - columnheader "Total Spent Sort" [ref=e289] [cursor=pointer]:
                    - generic [ref=e291]: Total Spent
                    - generic "Sort" [ref=e293]:
                      - button "Sort" [ref=e294]:
                        - img [ref=e295]
                    - generic [ref=e297]:
                      - img
                  - columnheader "Avg Order" [ref=e298] [cursor=pointer]:
                    - generic [ref=e300]: Avg Order
                    - generic [ref=e301]:
                      - img
                  - columnheader "Last Order" [ref=e302] [cursor=pointer]:
                    - generic [ref=e304]: Last Order
                    - generic [ref=e305]:
                      - img
                  - columnheader "Status" [ref=e306]:
                    - generic [ref=e308]: Status
                    - generic [ref=e309]:
                      - img
                  - columnheader "Actions" [ref=e310]:
                    - generic [ref=e312]: Actions
                    - generic [ref=e313]:
                      - img
                - generic [ref=e315]: No rows
                - rowgroup
              - generic [ref=e320]:
                - paragraph [ref=e321]: "Rows per page:"
                - generic [ref=e322]:
                  - 'combobox "Rows per page: 50" [ref=e323] [cursor=pointer]': "50"
                  - textbox: "50"
                  - img
                - paragraph [ref=e324]: 0–0 of 0
                - generic [ref=e325]:
                  - button "Go to previous page" [disabled]:
                    - img
                  - button "Go to next page" [disabled]:
                    - img
  - button "Open chat" [ref=e326] [cursor=pointer]:
    - img [ref=e327]
```

# Test source

```ts
  1   | /**
  2   |  * 39-portal-navigation-ui.spec.ts — browser Back and unsaved changes in the
  3   |  * owner portal, the way an owner uses them (TC-1944..1950).
  4   |  *
  5   |  *   TC-1944  Sidebar tabs: Back walks back through them one at a time and ends
  6   |  *            on Today. Clicking the tab already open adds no extra step.
  7   |  *   TC-1945  Subtabs: Customers, Store Settings and Owner Settings put the
  8   |  *            subtab in the URL, and Back shows the one before it.
  9   |  *   TC-1946  The note printed on the check is plain text. It follows the party
  10  |  *            size, percent and name as the owner edits them.
  11  |  *   TC-1947  Unsaved edits: Back and a sidebar click both ask. Keep editing
  12  |  *            stays put with the edit intact; Leave goes where they asked.
  13  |  *   TC-1948  With nothing unsaved, moving around never asks.
  14  |  *   TC-1949  Post History's Create Post opens the composer inside the portal,
  15  |  *            not a Not Found page (the link pointed at a route that is gone).
  16  |  *   TC-1950  Staff: unsaved payroll settings ask on a subtab click and on Back,
  17  |  *            and Back between Staff subtabs shows the one before.
  18  |  *
  19  |  * Browser. A per-run throwaway owner (createSecondOwner alwaysFresh) signed in
  20  |  * through the UI; the restaurant is deleted afterwards.
  21  |  */
  22  | import type { Page } from "@playwright/test";
  23  | import * as allure from "allure-js-commons";
  24  | import { test, expect } from "../../../fixtures/base";
  25  | import { generateRunId } from "../../../utils/testData";
  26  | import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
  27  | import {
  28  |   apiLogin,
  29  |   createSecondOwner,
  30  |   deleteTestRestaurant,
  31  |   setFeatureOverrideAdminRaw,
  32  |   updateRestaurantSettingsRaw,
  33  | } from "../../../utils/apiHelper";
  34  | import { activeDialog, DESKTOP } from "../../../utils/humanQa";
  35  | 
  36  | const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
  37  | const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
  38  | 
  39  | test.describe.configure({ mode: "serial" });
  40  | 
  41  | test.describe("Owner — portal navigation: Back and unsaved changes (UI)", () => {
  42  |   test.skip(
  43  |     !ADMIN_EMAIL || !ADMIN_PASSWORD,
  44  |     "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  45  |   );
  46  | 
  47  |   const runId = generateRunId();
  48  |   let adminToken = "";
  49  |   let restaurantId = "";
  50  |   let session: UiLoginSession | undefined;
  51  |   const page = (): Page => (session as UiLoginSession).page;
  52  | 
  53  |   const home = () =>
  54  |     `/restaurant/restaurantId/${restaurantId}/restaurantManagement`;
  55  |   const openHome = async (query = "") => {
  56  |     await page().goto(`${home()}${query}`, { waitUntil: "domcontentloaded" });
  57  |     await expect(page().locator(".MuiDrawer-paper:visible")).toBeVisible({
  58  |       timeout: 25_000,
  59  |     });
  60  |   };
  61  |   const sidebar = (name: string) =>
  62  |     page()
  63  |       .locator(".MuiDrawer-paper:visible")
  64  |       .getByText(name, { exact: true })
  65  |       .first();
  66  |   /** Where the page is, as the portal reads it. */
  67  |   const param = (name: string) => new URL(page().url()).searchParams.get(name);
  68  |   const expectParam = (name: string, value: string | null) =>
> 69  |     expect.poll(() => param(name), { timeout: 10_000 }).toBe(value);
      |                                                         ^ Error: expect(received).toBe(expected) // Object.is equality
  70  |   const subtab = (name: string) => page().getByRole("tab", { name });
  71  | 
  72  |   const gratuityToggle = () =>
  73  |     page().getByRole("switch", { name: /Auto-gratuity for large parties/ });
  74  |   const openGratuity = async () => {
  75  |     await openHome("?tab=Store%20Settings&settingsTab=fees");
  76  |     await expect(gratuityToggle()).toBeVisible({ timeout: 25_000 });
  77  |   };
  78  | 
  79  |   test.beforeAll(async ({ browser }) => {
  80  |     test.setTimeout(150_000);
  81  |     if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  82  |     adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  83  |     const tenant = await createSecondOwner(adminToken, runId, {
  84  |       alwaysFresh: true,
  85  |     });
  86  |     if (!tenant.restaurantId || !tenant.password)
  87  |       throw new Error("[portal-nav] could not mint the throwaway tenant");
  88  |     restaurantId = tenant.restaurantId;
  89  |     const base = await updateRestaurantSettingsRaw(
  90  |       tenant.accessToken,
  91  |       restaurantId,
  92  |       { tableServiceEnabled: true }
  93  |     );
  94  |     if (base.status !== 200)
  95  |       throw new Error(`[portal-nav] base: ${JSON.stringify(base.data)}`);
  96  |     const social = await setFeatureOverrideAdminRaw(
  97  |       adminToken,
  98  |       restaurantId,
  99  |       "SOCIAL_MEDIA",
  100 |       true,
  101 |       "portal navigation E2E"
  102 |     );
  103 |     if (social.status >= 300)
  104 |       throw new Error(`[portal-nav] add-on: ${JSON.stringify(social.data)}`);
  105 |     const payroll = await setFeatureOverrideAdminRaw(
  106 |       adminToken,
  107 |       restaurantId,
  108 |       "PAYROLL",
  109 |       true,
  110 |       "portal navigation E2E"
  111 |     );
  112 |     if (payroll.status >= 300)
  113 |       throw new Error(`[portal-nav] add-on: ${JSON.stringify(payroll.data)}`);
  114 |     session = await loginViaUi(browser, tenant.email, tenant.password);
  115 |   });
  116 | 
  117 |   test.afterAll(async () => {
  118 |     if (adminToken && restaurantId)
  119 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  120 |     if (session) await session.context.close().catch(() => {});
  121 |   });
  122 | 
  123 |   test.beforeEach(async () => {
  124 |     await allure.label("feature", "Portal navigation (dashboard)");
  125 |     await allure.label("severity", "critical");
  126 |     await page().setViewportSize(DESKTOP);
  127 |   });
  128 | 
  129 |   test("TC-1944: Back walks back through sidebar tabs, one at a time, to Today", async () => {
  130 |     await openHome();
  131 |     await expect(page().getByText("Today so far")).toBeVisible({
  132 |       timeout: 25_000,
  133 |     });
  134 |     await sidebar("Orders").click();
  135 |     await expectParam("tab", "Orders");
  136 |     await sidebar("Customers").click();
  137 |     await expectParam("tab", "Customers");
  138 |     // The tab already open: nothing new to go back through.
  139 |     await sidebar("Customers").click();
  140 | 
  141 |     await page().goBack();
  142 |     await expectParam("tab", "Orders");
  143 |     await page().goBack();
  144 |     await expectParam("tab", null);
  145 |     expect(new URL(page().url()).pathname).toBe(home());
  146 |     await expect(page().getByText("Today so far")).toBeVisible({
  147 |       timeout: 25_000,
  148 |     });
  149 |   });
  150 | 
  151 |   test("TC-1945: Back shows the previous subtab on Customers, Store Settings and Owner Settings", async () => {
  152 |     await openHome("?tab=Customers");
  153 |     await subtab("Customer Groups").click();
  154 |     await expectParam("customerTab", "segments");
  155 |     await expect(subtab("Customer Groups")).toHaveAttribute(
  156 |       "aria-selected",
  157 |       "true"
  158 |     );
  159 |     await page().goBack();
  160 |     await expectParam("customerTab", null);
  161 |     await expect(subtab("All Customers")).toHaveAttribute(
  162 |       "aria-selected",
  163 |       "true"
  164 |     );
  165 | 
  166 |     await openHome("?tab=Store%20Settings");
  167 |     await subtab("Fees & tips").click();
  168 |     await expectParam("settingsTab", "fees");
  169 |     await page().goBack();
```