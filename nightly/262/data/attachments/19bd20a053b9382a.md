# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer-lima/03-routing-basename.spec.ts >> Lima — basename routing >> TC-L24: the tenant's own title and branding are served
- Location: tests/customer-lima/03-routing-basename.spec.ts:109:7

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "boithok "
Received string:    "big apple's fried & fresh | best halal food in largo, fl"
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e6]:
      - img [ref=e9] [cursor=pointer]
      - generic [ref=e12]:
        - link "Home" [ref=e13] [cursor=pointer]:
          - /url: /boithok-khana-kitchen
        - link "Menu" [ref=e14] [cursor=pointer]:
          - /url: /boithok-khana-kitchen/menu
        - link "Gift Cards" [ref=e15] [cursor=pointer]:
          - /url: /boithok-khana-kitchen/gift-cards
        - link "Careers" [ref=e16] [cursor=pointer]:
          - /url: /boithok-khana-kitchen/careers
      - button "Login" [ref=e19] [cursor=pointer]:
        - img [ref=e21]
        - text: Login
      - button "shopping cart with 0 items" [ref=e23] [cursor=pointer]:
        - generic [ref=e24]:
          - img [ref=e25]
          - generic: "0"
  - main [ref=e27]:
    - generic [ref=e28]:
      - generic [ref=e29]:
        - generic [ref=e30]:
          - img [ref=e31]
          - heading "Today's Deals" [level=5] [ref=e33]
        - generic [ref=e34]:
          - generic [ref=e36] [cursor=pointer]:
            - generic [ref=e38]:
              - img [ref=e39]
              - generic [ref=e41]: Save 19%
            - generic [ref=e42]:
              - heading "AUTO Handoff Pizza b6a40cf1" [level=3] [ref=e43]
              - paragraph [ref=e44]: Automation deal — safe to delete
              - generic [ref=e45]:
                - generic [ref=e46]: "Includes:"
                - generic [ref=e47]:
                  - generic [ref=e49]: 1x Handoff Pizza b6a40cf1
                  - generic [ref=e51]: 1x Handoff Fries b6a40cf1
              - generic [ref=e52]:
                - generic [ref=e53]:
                  - generic [ref=e54]: $18.50
                  - heading "$15.00" [level=5] [ref=e55]
                - button "View Deal" [ref=e56]
          - generic [ref=e58] [cursor=pointer]:
            - generic [ref=e60]:
              - img [ref=e61]
              - generic [ref=e63]: Save 21%
            - generic [ref=e64]:
              - heading "AUTO Handoff Combo b6a40cf1" [level=3] [ref=e65]
              - paragraph [ref=e66]: two burgers and fries
              - generic [ref=e67]:
                - generic [ref=e68]: "Includes:"
                - generic [ref=e69]:
                  - generic [ref=e71]: 1x Handoff Burger b6a40cf1
                  - generic [ref=e73]: 1x Handoff Burger b6a40cf1
                  - generic [ref=e75]: 1x Handoff Fries b6a40cf1
              - generic [ref=e76]:
                - generic [ref=e77]:
                  - generic [ref=e78]: $26.50
                  - heading "$21.00" [level=5] [ref=e79]
                - button "View Deal" [ref=e80]
          - generic [ref=e82] [cursor=pointer]:
            - generic [ref=e84]:
              - img [ref=e85]
              - generic [ref=e87]: Save 15%
            - generic [ref=e88]:
              - heading "Bruschetta Duo Deal" [level=3] [ref=e89]
              - paragraph [ref=e90]: Double the flavor with our bruschetta!
              - generic [ref=e91]:
                - generic [ref=e92]: "Includes:"
                - generic [ref=e93]:
                  - generic [ref=e95]: 1x Automation Bruschetta
                  - generic [ref=e97]: 1x Automation Bruschetta
              - generic [ref=e98]:
                - generic [ref=e99]:
                  - generic [ref=e100]: $20.68
                  - heading "$17.58" [level=5] [ref=e101]
                - button "View Deal" [ref=e102]
          - generic [ref=e104] [cursor=pointer]:
            - generic [ref=e106]:
              - img [ref=e107]
              - generic [ref=e109]: Save 24%
            - generic [ref=e110]:
              - heading "Game Day Platter" [level=3] [ref=e111]
              - paragraph [ref=e112]: Snack and share while you watch the game!
              - generic [ref=e113]:
                - generic [ref=e114]: "Includes:"
                - generic [ref=e115]:
                  - generic [ref=e117]: 1x Chicken Wings
                  - generic [ref=e119]: 1x Loaded Mac & Cheese
                  - generic [ref=e121]: 1x Loaded Fries
              - generic [ref=e122]:
                - generic [ref=e123]:
                  - generic [ref=e124]: $34.12
                  - heading "$25.86" [level=5] [ref=e125]
                - button "View Deal" [ref=e126]
          - generic [ref=e128] [cursor=pointer]:
            - generic [ref=e130]:
              - img [ref=e131]
              - generic [ref=e133]: Save 18%
            - generic [ref=e134]:
              - heading "Date Night Indulgence" [level=3] [ref=e135]
              - paragraph [ref=e136]: Share a romantic meal for two!
              - generic [ref=e137]:
                - generic [ref=e138]: "Includes:"
                - generic [ref=e139]:
                  - generic [ref=e141]: 1x Triple Decker Club
                  - generic [ref=e143]: 1x Triple Decker Club
                  - generic [ref=e145]: 1x Build Your Sundae
                  - generic [ref=e147]: +1 more
              - generic [ref=e148]:
                - generic [ref=e149]:
                  - generic [ref=e150]: $45.50
                  - heading "$37.25" [level=5] [ref=e151]
                - button "View Deal" [ref=e152]
          - generic [ref=e154] [cursor=pointer]:
            - generic [ref=e156]:
              - img [ref=e157]
              - generic [ref=e159]: Save 15%
            - generic [ref=e160]:
              - heading "Solo Delight Combo" [level=3] [ref=e161]
              - paragraph [ref=e162]: A perfect meal just for you!
              - generic [ref=e163]:
                - generic [ref=e164]: "Includes:"
                - generic [ref=e165]:
                  - generic [ref=e167]: 1x Philly Cheesesteak
                  - generic [ref=e169]: 1x Loaded Fries
              - generic [ref=e170]:
                - generic [ref=e171]:
                  - generic [ref=e172]: $20.68
                  - heading "$17.58" [level=5] [ref=e173]
                - button "View Deal" [ref=e174]
          - generic [ref=e176] [cursor=pointer]:
            - generic [ref=e178]:
              - img [ref=e179]
              - generic [ref=e181]: Save 15%
            - generic [ref=e182]:
              - heading "Family Feast Special" [level=3] [ref=e183]
              - paragraph [ref=e184]: A hearty meal for the whole family to enjoy!
              - generic [ref=e185]:
                - generic [ref=e186]: "Includes:"
                - generic [ref=e187]:
                  - generic [ref=e189]: 1x Chicken Wings
                  - generic [ref=e191]: 1x Build Your Burger
                  - generic [ref=e193]: 1x Build Your Burger
                  - generic [ref=e195]: +1 more
              - generic [ref=e196]:
                - generic [ref=e197]:
                  - generic [ref=e198]: $61.02
                  - heading "$51.87" [level=5] [ref=e199]
                - button "View Deal" [ref=e200]
      - generic [ref=e202]:
        - generic:
          - img
        - tablist "scrollable force tabs example" [ref=e205]:
          - tab "Appetizers" [selected] [ref=e206] [cursor=pointer]
          - tab "Entrees" [ref=e207] [cursor=pointer]
          - tab "Burgers & Sandwiches" [ref=e208] [cursor=pointer]
          - tab "Sides" [ref=e209] [cursor=pointer]
          - tab "Desserts" [ref=e210] [cursor=pointer]
          - tab "ZZ Move Probe Source" [ref=e211] [cursor=pointer]
          - tab "ZZ Copy Probe NEW" [ref=e212] [cursor=pointer]
          - tab "ZZ Move Probe Target" [ref=e213] [cursor=pointer]
          - tab "ZZ Copy Probe Src" [ref=e214] [cursor=pointer]
          - tab "ZZ Probe Img" [ref=e215] [cursor=pointer]
          - tab "ZZ Probe Img" [ref=e216] [cursor=pointer]
          - tab "Automation Items" [ref=e217] [cursor=pointer]
          - tab "Test Starters 1d9114c0" [ref=e218] [cursor=pointer]
          - tab "Test Starters 17901910" [ref=e219] [cursor=pointer]
          - tab "Automation Deals Storefront b6a40cf1" [ref=e220] [cursor=pointer]
        - img [ref=e223] [cursor=pointer]
      - generic [ref=e225]:
        - heading "Appetizers" [level=1] [ref=e226]
        - separator [ref=e227]
        - generic [ref=e230] [cursor=pointer]:
          - generic [ref=e231]:
            - img "Chicken Wings" [ref=e232]
            - generic [ref=e234]: $15.51
          - generic [ref=e235]:
            - heading "Chicken Wings" [level=3] [ref=e236]
            - paragraph [ref=e237]: Crispy chicken wings tossed in your favorite sauce
      - generic [ref=e238]:
        - heading "Entrees" [level=1] [ref=e239]
        - separator [ref=e240]
        - generic [ref=e241]:
          - generic [ref=e243] [cursor=pointer]:
            - generic [ref=e244]:
              - img "Loaded Mac & Cheese" [ref=e245]
              - generic [ref=e247]: $11.37
            - generic [ref=e248]:
              - heading "Loaded Mac & Cheese" [level=3] [ref=e249]
              - paragraph [ref=e250]: Creamy, cheesy macaroni with your choice of mix-ins
          - generic [ref=e252] [cursor=pointer]:
            - generic [ref=e253]:
              - img "Fish & Chips" [ref=e254]
              - generic [ref=e256]: $16.55
            - generic [ref=e257]:
              - heading "Fish & Chips" [level=3] [ref=e258]
              - paragraph [ref=e259]: Beer-battered cod with crispy fries and tartar sauce
      - generic [ref=e260]:
        - heading "Burgers & Sandwiches" [level=1] [ref=e261]
        - separator [ref=e262]
        - generic [ref=e263]:
          - generic [ref=e265] [cursor=pointer]:
            - generic [ref=e266]:
              - img "Build Your Burger" [ref=e267]
              - generic [ref=e269]: $14.48
            - generic [ref=e270]:
              - heading "Build Your Burger" [level=3] [ref=e271]
              - paragraph [ref=e272]: Start with our 1/3 lb Angus beef patty and customize every detail
          - generic [ref=e274] [cursor=pointer]:
            - generic [ref=e275]:
              - img "Philly Cheesesteak" [ref=e276]
              - generic [ref=e278]: $13.44
            - generic [ref=e279]:
              - heading "Philly Cheesesteak" [level=3] [ref=e280]
              - paragraph [ref=e281]: Thinly sliced steak with melted cheese on a hoagie roll
          - generic [ref=e283] [cursor=pointer]:
            - generic [ref=e284]:
              - img "Triple Decker Club" [ref=e285]
              - generic [ref=e287]: $14.48
            - generic [ref=e288]:
              - heading "Triple Decker Club" [level=3] [ref=e289]
              - paragraph [ref=e290]: Classic club sandwich with turkey, bacon, and all the fixings
      - generic [ref=e291]:
        - heading "Sides" [level=1] [ref=e292]
        - separator [ref=e293]
        - generic [ref=e296] [cursor=pointer]:
          - generic [ref=e297]:
            - img "Loaded Fries" [ref=e298]
            - generic [ref=e300]: $7.23
          - generic [ref=e301]:
            - heading "Loaded Fries" [level=3] [ref=e302]
            - paragraph [ref=e303]: Crispy golden fries with your choice of toppings
      - generic [ref=e304]:
        - heading "Desserts" [level=1] [ref=e305]
        - separator [ref=e306]
        - generic [ref=e309] [cursor=pointer]:
          - generic [ref=e310]:
            - img "Build Your Sundae" [ref=e311]
            - generic [ref=e313]: $8.27
          - generic [ref=e314]:
            - heading "Build Your Sundae" [level=3] [ref=e315]
            - paragraph [ref=e316]: Premium ice cream with your choice of toppings and sauces
      - generic [ref=e317]:
        - heading "ZZ Move Probe Source" [level=1] [ref=e318]
        - separator [ref=e319]
      - generic [ref=e321]:
        - heading "ZZ Copy Probe NEW" [level=1] [ref=e322]
        - separator [ref=e323]
      - generic [ref=e325]:
        - heading "ZZ Move Probe Target" [level=1] [ref=e326]
        - separator [ref=e327]
      - generic [ref=e329]:
        - heading "ZZ Copy Probe Src" [level=1] [ref=e330]
        - separator [ref=e331]
      - generic [ref=e333]:
        - heading "ZZ Probe Img" [level=1] [ref=e334]
        - separator [ref=e335]
        - generic [ref=e338] [cursor=pointer]:
          - generic [ref=e339]:
            - img "ZZ Probe Img Item" [ref=e340]
            - generic [ref=e342]: $3.00
          - generic [ref=e343]:
            - heading "ZZ Probe Img Item" [level=3] [ref=e344]
            - paragraph
      - generic [ref=e345]:
        - heading "ZZ Probe Img" [level=1] [ref=e346]
        - separator [ref=e347]
        - generic [ref=e350] [cursor=pointer]:
          - generic [ref=e351]:
            - img "ZZ Probe Img Item" [ref=e352]
            - generic [ref=e354]: $3.00
          - generic [ref=e355]:
            - heading "ZZ Probe Img Item" [level=3] [ref=e356]
            - paragraph
      - generic [ref=e357]:
        - heading "Automation Items" [level=1] [ref=e358]
        - separator [ref=e359]
        - generic [ref=e362] [cursor=pointer]:
          - generic [ref=e363]:
            - img "Automation Burger" [ref=e364]
            - generic [ref=e366]: $12.99
          - generic [ref=e367]:
            - heading "Automation Burger" [level=3] [ref=e368]
            - paragraph
      - generic [ref=e369]:
        - heading "Test Starters 1d9114c0" [level=1] [ref=e370]
        - separator [ref=e371]
        - generic [ref=e374] [cursor=pointer]:
          - generic [ref=e375]:
            - img "Automation Bruschetta 1d9114c0" [ref=e376]
            - generic [ref=e378]: $9.99
          - generic [ref=e379]:
            - heading "Automation Bruschetta 1d9114c0" [level=3] [ref=e380]
            - paragraph [ref=e381]: Test item created by Playwright automation
      - generic [ref=e382]:
        - heading "Test Starters 17901910" [level=1] [ref=e383]
        - separator [ref=e384]
        - generic [ref=e387] [cursor=pointer]:
          - generic [ref=e388]:
            - img "Automation Bruschetta 17901910" [ref=e389]
            - generic [ref=e391]: $9.99
          - generic [ref=e392]:
            - heading "Automation Bruschetta 17901910" [level=3] [ref=e393]
            - paragraph [ref=e394]: Test item created by Playwright automation
      - generic [ref=e395]:
        - heading "Automation Deals Storefront b6a40cf1" [level=1] [ref=e396]
        - separator [ref=e397]
        - generic [ref=e398]:
          - generic [ref=e400] [cursor=pointer]:
            - generic [ref=e401]:
              - img "Handoff Burger b6a40cf1" [ref=e402]
              - generic [ref=e404]: $10.00
            - generic [ref=e405]:
              - heading "Handoff Burger b6a40cf1" [level=3] [ref=e406]
              - paragraph [ref=e407]: deal hand-off burger
          - generic [ref=e409] [cursor=pointer]:
            - generic [ref=e410]:
              - img [ref=e412]
              - generic [ref=e415]: $6.50
            - generic [ref=e416]:
              - heading "Handoff Fries b6a40cf1" [level=3] [ref=e417]
              - paragraph [ref=e418]: deal hand-off fries
          - generic [ref=e420] [cursor=pointer]:
            - generic [ref=e421]:
              - img [ref=e423]
              - generic [ref=e426]: $12.00
            - generic [ref=e427]:
              - heading "Handoff Pizza b6a40cf1" [level=3] [ref=e428]
              - paragraph [ref=e429]: deal hand-off pizza
  - contentinfo [ref=e430]:
    - paragraph [ref=e431]: Boithok Khana Kitchen -
    - generic [ref=e432]:
      - generic [ref=e433]:
        - paragraph [ref=e434]: Powered by
        - link "RestauNax RestauNax" [ref=e435] [cursor=pointer]:
          - /url: https://www.restaunax.com
          - img "RestauNax" [ref=e436]
          - paragraph [ref=e437]: RestauNax
      - paragraph [ref=e438]: "|"
      - generic [ref=e439]:
        - link "Terms" [ref=e440] [cursor=pointer]:
          - /url: https://www.restaunax.com/website-terms
        - paragraph [ref=e441]: "|"
        - link "Privacy" [ref=e442] [cursor=pointer]:
          - /url: https://www.restaunax.com/privacy-policy
```

# Test source

```ts
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
  65  |     expect(page.url()).toContain(`/${restaurantSlug}`);
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
> 122 |     expect(title.toLowerCase()).toContain(
      |                                 ^ Error: expect(received).toContain(expected) // indexOf
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
  166 |     expect(body).not.toContain("not configured");
  167 |     expect(body.length).toBeGreaterThan(50);
  168 | 
  169 |     // No basename: a pinned tenant owns the whole origin.
  170 |     expect(new URL(page.url()).pathname).toMatch(/^\/?$|^\/menu\/?$/);
  171 |   });
  172 | });
  173 | 
```