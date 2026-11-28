# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer/06-menu-handoff.spec.ts >> Menu → Storefront hand-off >> TC-321: a per-location price override is what the customer sees AND what the server quotes — at that location only
- Location: tests/customer/06-menu-handoff.spec.ts:186:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByText('$12.00')
Expected: 0
Received: 2
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" with timeout 10000ms
  - waiting for getByText('$12.00')
    24 × locator resolved to 2 elements
       - unexpected value "2"

```

# Test source

```ts
  121 |   });
  122 | 
  123 |   test("TC-320: an item the owner marks sold out disappears from the storefront menu and comes back when restored", async ({
  124 |     page,
  125 |     ownerPage,
  126 |   }) => {
  127 |     await allure.description(
  128 |       "Storefront shows the seeded item card with its price. Owner (Menu tab) switches it OFF → 'Mark sold out'. " +
  129 |         "Reloading the storefront: the card is gone (template-wind filters outOfStock items out of the menu grid). " +
  130 |         "Owner switches it back ON → card is back."
  131 |     );
  132 |     const menu = createCustomerMenuPage(page);
  133 |     const tab = createMenuAvailabilityPage(ownerPage);
  134 | 
  135 |     await allure.step("Storefront lists the item", async () => {
  136 |       await menu.goto(restaurantId);
  137 |       await menu.assertPageLoaded();
  138 |       await expect(menu.menuItemCard(item.name)).toBeVisible({
  139 |         timeout: 30_000,
  140 |       });
  141 |     });
  142 | 
  143 |     await allure.step("Owner marks it sold out", async () => {
  144 |       await tab.goto(restaurantId);
  145 |       await tab.assertLoaded();
  146 |       await tab.expandCategory(CATEGORY);
  147 |       const { status } = await tab.markSoldOut(CATEGORY, item.name);
  148 |       expect(status).toBe(200);
  149 |       await tab.assertItemOutOfStock(CATEGORY, item.name);
  150 |     });
  151 | 
  152 |     await allure.step("Storefront no longer offers it", async () => {
  153 |       await menu.goto(restaurantId);
  154 |       await menu.assertPageLoaded();
  155 |       // Positive control: the page rendered a menu (another card of ours is
  156 |       // not available, so use the category heading / any card).
  157 |       await expect(
  158 |         page
  159 |           .getByRole("heading", { name: CATEGORY })
  160 |           .or(page.getByText(CATEGORY))
  161 |           .first()
  162 |       )
  163 |         .toBeVisible({ timeout: 30_000 })
  164 |         .catch(() => {
  165 |           /* an empty category may not render a heading — the item check below is the assertion */
  166 |         });
  167 |       await expect(menu.menuItemCard(item.name)).toHaveCount(0);
  168 |     });
  169 | 
  170 |     await allure.step(
  171 |       "Owner restores → storefront offers it again",
  172 |       async () => {
  173 |         await tab.goto(restaurantId);
  174 |         await tab.assertLoaded();
  175 |         await tab.expandCategory(CATEGORY);
  176 |         const { status } = await tab.markAvailable(CATEGORY, item.name);
  177 |         expect(status).toBe(200);
  178 |         await menu.goto(restaurantId);
  179 |         await expect(menu.menuItemCard(item.name)).toBeVisible({
  180 |           timeout: 30_000,
  181 |         });
  182 |       }
  183 |     );
  184 |   });
  185 | 
  186 |   test("TC-321: a per-location price override is what the customer sees AND what the server quotes — at that location only", async ({
  187 |     page,
  188 |     ownerPage,
  189 |   }) => {
  190 |     test.skip(!chainGroupId, "Automation Chain fixture not available");
  191 |     await allure.description(
  192 |       "Owner sets Base price 14 for the shared item at location A via the $ dialog. Storefront ?restaurantId=A " +
  193 |         "shows $14.00 on the card while ?restaurantId=B still shows $12.00; the public POST /api/order/:id/quote " +
  194 |         "(what checkout charges) returns subtotal 14 at A and 12 at B — the 'shown $14, charged $12' defect class. " +
  195 |         "(Fixture locations aren't published, so the storefront modal/cart is inert there; the charge is asserted " +
  196 |         "on the quote endpoint checkout itself calls.) Override cleared afterwards."
  197 |     );
  198 |     const menu = createCustomerMenuPage(page);
  199 |     const tab = createMenuAvailabilityPage(ownerPage);
  200 |     const dlg = createLocationPricingDialog(ownerPage);
  201 | 
  202 |     await allure.step("Owner overrides the price at A", async () => {
  203 |       await tab.goto(locA);
  204 |       await tab.assertLoaded();
  205 |       await tab.expandCategory(CATEGORY);
  206 |       await tab.priceOverrideButton(CATEGORY, shared.name).click();
  207 |       await dlg.waitFor();
  208 |       await dlg.basePriceInput().fill("14");
  209 |       const { status, body } = await dlg.save();
  210 |       expect(status).toBe(200);
  211 |       expect(body.basePriceOverride).toBe(14);
  212 |     });
  213 | 
  214 |     try {
  215 |       await allure.step("Storefront A shows $14.00", async () => {
  216 |         await menu.goto(locA);
  217 |         await menu.assertPageLoaded();
  218 |         const card = menu.menuItemCard(shared.name);
  219 |         await expect(card).toBeVisible({ timeout: 30_000 });
  220 |         await expect(page.getByText("$14.00").first()).toBeVisible();
> 221 |         await expect(page.getByText("$12.00")).toHaveCount(0);
      |                                                ^ Error: expect(locator).toHaveCount(expected) failed
  222 |       });
  223 | 
  224 |       await allure.step(
  225 |         "Storefront B still shows the shared $12.00",
  226 |         async () => {
  227 |           await menu.goto(locB);
  228 |           await menu.assertPageLoaded();
  229 |           await expect(menu.menuItemCard(shared.name)).toBeVisible({
  230 |             timeout: 30_000,
  231 |           });
  232 |           await expect(page.getByText("$12.00").first()).toBeVisible();
  233 |           await expect(page.getByText("$14.00")).toHaveCount(0);
  234 |         }
  235 |       );
  236 | 
  237 |       await allure.step(
  238 |         "The server quote (what gets charged) uses the override at A only",
  239 |         async () => {
  240 |           // The fixture locations are not published, so the storefront's item
  241 |           // modal / cart is inert there (MenuPage.handleItemClick guards on
  242 |           // restaurant.published). The charge is proven at the source instead:
  243 |           // the same public /quote endpoint checkout calls before Stripe.
  244 |           const body = { orderItems: [{ menuItemId: shared.id, quantity: 1 }] };
  245 |           const qa = await quoteOrderRaw(locA, body);
  246 |           expect(qa.status, JSON.stringify(qa.data)).toBe(200);
  247 |           expect(qa.data.quote?.subtotal, "A charges the override").toBe(14);
  248 |           const qb = await quoteOrderRaw(locB, body);
  249 |           expect(qb.status).toBe(200);
  250 |           expect(qb.data.quote?.subtotal, "B charges the shared price").toBe(
  251 |             12
  252 |           );
  253 |         }
  254 |       );
  255 |     } finally {
  256 |       await setPriceOverrideRaw(token, shared.id, {
  257 |         restaurantId: locA,
  258 |         priceOverride: null,
  259 |       });
  260 |     }
  261 |   });
  262 | 
  263 |   test("TC-322: an item the owner removes from one location's menu is absent from that storefront only", async ({
  264 |     page,
  265 |     ownerPage,
  266 |   }) => {
  267 |     test.skip(!chainGroupId, "Automation Chain fixture not available");
  268 |     await allure.description(
  269 |       "Owner (location A Menu tab) → eye icon → 'Remove from menu'. Storefront ?restaurantId=A no longer lists " +
  270 |         "the shared item; ?restaurantId=B still does. Restored afterwards."
  271 |     );
  272 |     const menu = createCustomerMenuPage(page);
  273 |     const tab = createMenuAvailabilityPage(ownerPage);
  274 |     await tab.goto(locA);
  275 |     await tab.assertLoaded();
  276 |     await tab.expandCategory(CATEGORY);
  277 |     await tab.carryButton(CATEGORY, shared.name).click();
  278 |     const dialog = ownerPage.getByRole("dialog", {
  279 |       name: `Remove "${shared.name}" from this location's menu?`,
  280 |     });
  281 |     await expect(dialog).toBeVisible({ timeout: 10_000 });
  282 |     const [res] = await Promise.all([
  283 |       ownerPage.waitForResponse(
  284 |         (r) =>
  285 |           /\/menu\/menu-items\/[^/]+\/carried/.test(r.url()) &&
  286 |           r.request().method() === "PATCH"
  287 |       ),
  288 |       dialog.getByRole("button", { name: "Remove from menu" }).click(),
  289 |     ]);
  290 |     expect(res.status()).toBe(200);
  291 |     try {
  292 |       await menu.goto(locA);
  293 |       await menu.assertPageLoaded();
  294 |       await expect(page.getByText(/menu|order/i).first()).toBeVisible({
  295 |         timeout: 30_000,
  296 |       });
  297 |       await expect(menu.menuItemCard(shared.name)).toHaveCount(0);
  298 |       await menu.goto(locB);
  299 |       await expect(menu.menuItemCard(shared.name)).toBeVisible({
  300 |         timeout: 30_000,
  301 |       });
  302 |     } finally {
  303 |       await setCarriedRaw(token, shared.id, {
  304 |         restaurantId: locA,
  305 |         isCarried: true,
  306 |       });
  307 |     }
  308 |     await menu.goto(locA);
  309 |     await expect(menu.menuItemCard(shared.name)).toBeVisible({
  310 |       timeout: 30_000,
  311 |     });
  312 |   });
  313 | 
  314 |   // Keep the seed restaurant's item available even if TC-320 aborted mid-way.
  315 |   test.afterAll(async () => {
  316 |     if (item && token)
  317 |       await setAvailability(token, item.id, false).catch(() => {});
  318 |   });
  319 | });
  320 | 
```