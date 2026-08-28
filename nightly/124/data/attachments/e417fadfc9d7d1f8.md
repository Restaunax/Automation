# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer-lima/03-routing-basename.spec.ts >> Lima — basename routing >> TC-L22: in-app navigation and history keep the slug
- Location: tests/customer-lima/03-routing-basename.spec.ts:53:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "/boithok-khana-kitchen"
Received string:    "about:blank"
```

# Test source

```ts
  1   | import * as allure from "allure-js-commons";
  2   | 
  3   | import { test, expect } from "../../fixtures/base";
  4   | import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
  5   | import { BACKEND_URL } from "../../utils/apiHelper";
  6   | import {
  7   |   LIMA_PINNED_URL,
  8   |   readRestaurantSlug,
  9   |   readSharedState,
  10  | } from "../../utils/testData";
  11  | 
  12  | /**
  13  |  * Routing under a per-tenant basename.
  14  |  *
  15  |  * The whole routing change was one prop (BrowserRouter basename), so what
  16  |  * needs proving is that nothing ESCAPES it — every navigation, reload and
  17  |  * history move has to stay inside /<slug>, or the customer silently lands on
  18  |  * the origin root, which belongs to no tenant.
  19  |  */
  20  | test.describe("Lima — basename routing", () => {
  21  |   const restaurantSlug = readRestaurantSlug();
  22  | 
  23  |   test.skip(!restaurantSlug, "Ordering slug not seeded");
  24  | 
  25  |   test.beforeEach(async () => {
  26  |     await allure.label("feature", "Embedded Ordering");
  27  |     await allure.label("severity", "critical");
  28  |   });
  29  | 
  30  |   test("TC-L20: the embed link lands on the tenant's menu @smoke", async ({
  31  |     page,
  32  |   }) => {
  33  |     const lima = createLimaStorefrontPage(page);
  34  |     await lima.gotoMenu(restaurantSlug);
  35  | 
  36  |     await lima.assertOnMenu();
  37  |     expect(page.url()).toContain(`/${restaurantSlug}/menu`);
  38  |   });
  39  | 
  40  |   test("TC-L21: a reload stays inside the tenant @smoke", async ({ page }) => {
  41  |     const lima = createLimaStorefrontPage(page);
  42  |     await lima.gotoMenu(restaurantSlug);
  43  |     await lima.assertOnMenu();
  44  | 
  45  |     await page.reload({ waitUntil: "domcontentloaded" });
  46  | 
  47  |     // A hard reload is served by the server, not the router — this is where a
  48  |     // missing SPA fallback or a lost basename shows up.
  49  |     expect(page.url()).toContain(`/${restaurantSlug}/menu`);
  50  |     await lima.assertOnMenu();
  51  |   });
  52  | 
  53  |   test("TC-L22: in-app navigation and history keep the slug", async ({
  54  |     page,
  55  |   }) => {
  56  |     const state = readSharedState();
  57  |     const lima = createLimaStorefrontPage(page);
  58  | 
  59  |     await lima.gotoMenu(restaurantSlug);
  60  |     await lima.assertOnMenu();
  61  |     await lima.openItemModal(state.menuItemName);
  62  |     await lima.clickAddToCart();
  63  | 
  64  |     await page.goBack({ waitUntil: "domcontentloaded" });
> 65  |     expect(page.url()).toContain(`/${restaurantSlug}`);
      |                        ^ Error: expect(received).toContain(expected) // indexOf
  66  | 
  67  |     await page.goForward({ waitUntil: "domcontentloaded" });
  68  |     expect(page.url()).toContain(`/${restaurantSlug}`);
  69  |   });
  70  | 
  71  |   test("TC-L23: the tenant root goes straight to the menu", async ({
  72  |     page,
  73  |   }) => {
  74  |     await allure.description(
  75  |       "An embedded-ordering customer arrives from the restaurant's own, " +
  76  |         "already-branded site. A second landing page is a detour, so '/' " +
  77  |         "redirects — and the decision is injected server-side so there is no " +
  78  |         "flash of the landing page first."
  79  |     );
  80  | 
  81  |     // Whether "/" redirects depends on the tenant's own
  82  |     // brandingConfig.features.enableLandingPage. Asserting the redirect
  83  |     // unconditionally fails against a restaurant that legitimately HAS a
  84  |     // landing page, so read the flag the storefront itself acts on.
  85  |     const resp = await page.request.get(
  86  |       `${BACKEND_URL}/api/public/site?slug=${restaurantSlug}`
  87  |     );
  88  |     const landingEnabled =
  89  |       (
  90  |         (await resp.json()) as {
  91  |           data?: { presentation?: { landingPageEnabled?: boolean } };
  92  |         }
  93  |       )?.data?.presentation?.landingPageEnabled === true;
  94  |     await allure.parameter("landingPageEnabled", String(landingEnabled));
  95  | 
  96  |     const lima = createLimaStorefrontPage(page);
  97  |     await lima.gotoRoot(restaurantSlug);
  98  | 
  99  |     if (landingEnabled) {
  100 |       // Landing page on: stay at the tenant root, do not bounce to /menu.
  101 |       await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/?$`), {
  102 |         timeout: 15_000,
  103 |       });
  104 |     } else {
  105 |       await expect(page).toHaveURL(/\/menu/, { timeout: 15_000 });
  106 |     }
  107 |   });
  108 | 
  109 |   test("TC-L24: the tenant's own title and branding are served", async ({
  110 |     page,
  111 |   }) => {
  112 |     const state = readSharedState();
  113 |     const lima = createLimaStorefrontPage(page);
  114 |     await lima.gotoMenu(restaurantSlug);
  115 | 
  116 |     const title = await lima.documentTitle();
  117 |     await allure.parameter("title", title);
  118 | 
  119 |     // index.html ships with the literal title "Order Now"; on a shared host
  120 |     // that would be every tenant's tab title.
  121 |     expect(title).not.toBe("Order Now");
  122 |     expect(title.toLowerCase()).toContain(
  123 |       state.restaurantName.toLowerCase().slice(0, 8)
  124 |     );
  125 |   });
  126 | });
  127 | 
  128 | test.describe("Lima — legacy pinned deployment", () => {
  129 |   test.beforeEach(async () => {
  130 |     await allure.label("feature", "Embedded Ordering");
  131 |     await allure.label("severity", "critical");
  132 |   });
  133 | 
  134 |   // Opt-in: point LIMA_PINNED_URL at a deployment that actually pins a tenant
  135 |   // (VITE_REACT_APP_RESTAURANT_ID / _CHAIN_ID set) and this runs.
  136 |   //
  137 |   // It does not run by default any more because there is no longer a pinned
  138 |   // Lima deployment to point it at — restaurants.yml was retired and
  139 |   // lima.restaunax.com now runs the shared multi-tenant app. Left in place
  140 |   // rather than deleted: the precedence rule it guards (pinned env wins over
  141 |   // Host and path) is still live in server.ts and is the rollback path if a
  142 |   // per-restaurant deployment is ever stood up again. A test asserting a
  143 |   // deployment nobody operates is noise; one that skips until you have that
  144 |   // deployment is a checklist item.
  145 |   test("TC-L25: a pinned single-tenant deployment still renders @smoke", async ({
  146 |     page,
  147 |   }) => {
  148 |     test.skip(
  149 |       !process.env.LIMA_PINNED_URL,
  150 |       "No pinned deployment configured — set LIMA_PINNED_URL to exercise the rollback path"
  151 |     );
  152 | 
  153 |     await allure.description(
  154 |       "The rollback guarantee. server.ts checks pinned env FIRST, so a " +
  155 |         "per-restaurant Lima deployment must behave exactly as before."
  156 |     );
  157 | 
  158 |     const resp = await page.goto(LIMA_PINNED_URL, {
  159 |       waitUntil: "domcontentloaded",
  160 |     });
  161 |     expect(resp?.status()).toBeLessThan(400);
  162 | 
  163 |     // It renders a real storefront, not the neutral not-configured screen.
  164 |     const body = (await page.locator("body").innerText()).toLowerCase();
  165 |     await allure.parameter("body excerpt", body.slice(0, 200));
```