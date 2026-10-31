# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/25-promotion-scenarios.spec.ts >> Owner — promotion scenarios (dashboard → lima + wind) >> TC-868: @scenario S6 Free baklava on orders of $25+ — only with a code: the code applies, the free-item offer shows, Add makes the line free
- Location: tests/dashboard/owner/25-promotion-scenarios.spec.ts:1058:7

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByText('AUTO Scn Free baklava 10861d7f', { exact: true }).locator('..')
Expected substring: "-$5.00"
Received string:    "AUTO Scn Free baklava 10861d7f"
Timeout: 20000ms

Call log:
  - Expect "toContainText" with timeout 20000ms
  - waiting for getByText('AUTO Scn Free baklava 10861d7f', { exact: true }).locator('..')
    44 × locator resolved to <div class="MuiBox-root css-171onha">…</div>
       - unexpected value "AUTO Scn Free baklava 10861d7f"

```

```yaml
- paragraph: AUTO Scn Free baklava 10861d7f
```

# Test source

```ts
  1094 |           triggerKind: "SPEND",
  1095 |           minOrderAmount: 25,
  1096 |           status: "ACTIVE",
  1097 |         });
  1098 |         return c;
  1099 |       });
  1100 | 
  1101 |       await allure.step("edit: minimum → $30", async () => {
  1102 |         const edit = await openEdit(ownerPage, name);
  1103 |         await expect(edit.amountField("Order total of at least")).toHaveValue(
  1104 |           /^25(\.00)?$/
  1105 |         );
  1106 |         await edit.setAmount("Order total of at least", "30");
  1107 |         await saveEdit(ownerPage);
  1108 |         expect(await couponRow(coupon.id)).toMatchObject({
  1109 |           type: "FREE_ITEM",
  1110 |           code,
  1111 |           giftMenuItemId: baklava.id,
  1112 |           triggerKind: "SPEND",
  1113 |           minOrderAmount: 30,
  1114 |         });
  1115 |       });
  1116 | 
  1117 |       /** The quote after Add carries the gift line, priced free. */
  1118 |       const quoteWithGift = (r: Parameters<typeof isQuoteResponse>[0]) =>
  1119 |         isQuoteResponse(r) &&
  1120 |         (
  1121 |           (r.request().postDataJSON() as PageQuote["request"]).orderItems ?? []
  1122 |         ).some((i) => i.menuItemId === baklava.id);
  1123 |       const expectGiftQuote = (quote: PageQuote) => {
  1124 |         expect(quote.request.couponId).toBe(coupon.id);
  1125 |         expect(quote.body.quote?.appliedPromotion).toMatchObject({
  1126 |           couponId: coupon.id,
  1127 |           title: name,
  1128 |           savings: baklava.price,
  1129 |         });
  1130 |         expect(quote.body.quote?.freeItemOffer ?? null).toBeNull();
  1131 |       };
  1132 |       const offerText = `You've earned a free ${baklava.name} — Add it`;
  1133 | 
  1134 |       await allure.step(
  1135 |         "lima: three gyros → code on the cart → checkout → Add the free baklava",
  1136 |         async () => {
  1137 |           const lima = createLimaStorefrontPage(page);
  1138 |           const checkout = createLimaCheckoutPage(page);
  1139 |           await lima.gotoMenu(slug);
  1140 |           await lima.assertOnMenu();
  1141 |           for (let i = 0; i < 3; i++) {
  1142 |             await expect(lima.itemCard(chickenGyro.name)).toBeVisible({
  1143 |               timeout: 30_000,
  1144 |             });
  1145 |             await lima.itemCard(chickenGyro.name).click();
  1146 |             await expect(lima.addToCartButton()).toBeEnabled({
  1147 |               timeout: 20_000,
  1148 |             });
  1149 |             await lima.clickAddToCart();
  1150 |             await expect(lima.addToCartButton()).toBeHidden({
  1151 |               timeout: 15_000,
  1152 |             });
  1153 |           }
  1154 |           await lima.cartButton().click();
  1155 |           await expect(page).toHaveURL(new RegExp(`/${slug}/cart`), {
  1156 |             timeout: 15_000,
  1157 |           });
  1158 |           const [redeem] = await Promise.all([
  1159 |             page.waitForResponse(
  1160 |               (r) =>
  1161 |                 r.url().includes("/api/promotions/redeem-code") &&
  1162 |                 r.request().method() === "POST",
  1163 |               { timeout: 20_000 }
  1164 |             ),
  1165 |             checkout.applyCoupon(code),
  1166 |           ]);
  1167 |           expect(redeem.status(), await redeem.text()).toBe(200);
  1168 |           await expect(checkout.appliedCodeChip(code)).toBeVisible({
  1169 |             timeout: 15_000,
  1170 |           });
  1171 |           const [codeRes] = await Promise.all([
  1172 |             page.waitForResponse(
  1173 |               (r) =>
  1174 |                 isQuoteResponse(r) &&
  1175 |                 (r.request().postDataJSON() as PageQuote["request"])
  1176 |                   .couponId === coupon.id,
  1177 |               { timeout: 30_000 }
  1178 |             ),
  1179 |             checkout.goToCheckout(),
  1180 |           ]);
  1181 |           const codeQuote = await readQuote(codeRes);
  1182 |           expect(codeQuote.body.quote?.freeItemOffer).toMatchObject({
  1183 |             menuItemId: baklava.id,
  1184 |           });
  1185 |           await expect(checkout.freeItemOfferButton()).toHaveText(offerText, {
  1186 |             timeout: 20_000,
  1187 |           });
  1188 |           const [giftRes] = await Promise.all([
  1189 |             page.waitForResponse(quoteWithGift, { timeout: 30_000 }),
  1190 |             checkout.freeItemOfferButton().click(),
  1191 |           ]);
  1192 |           expectGiftQuote(await readQuote(giftRes));
  1193 |           await expect(checkout.freeItemOfferButton()).toHaveCount(0);
> 1194 |           await expect(checkout.promotionLine(name)).toContainText(
       |                                                      ^ Error: expect(locator).toContainText(expected) failed
  1195 |             `-${money(baklava.price)}`,
  1196 |             { timeout: 20_000 }
  1197 |           );
  1198 |           await expectShownMatchesLatestQuote(checkout.readTotal, quotes);
  1199 |         }
  1200 |       );
  1201 | 
  1202 |       await allure.step(
  1203 |         "wind: three gyros → checkout → code → Add the free baklava",
  1204 |         async () => {
  1205 |           const menu = createCustomerMenuPage(page);
  1206 |           const checkout = createCustomerCheckoutPage(page);
  1207 |           await menu.goto(restaurantId);
  1208 |           await menu.assertPageLoaded();
  1209 |           await expect(menu.itemCard(chickenGyro.name)).toBeVisible({
  1210 |             timeout: 30_000,
  1211 |           });
  1212 |           for (let i = 0; i < 3; i++) {
  1213 |             await menu.openItemModal(chickenGyro.name);
  1214 |             await menu.assertItemModalOpen();
  1215 |             await menu.clickAddToCart();
  1216 |             await expect(menu.addToCartButton()).toBeHidden({
  1217 |               timeout: 15_000,
  1218 |             });
  1219 |           }
  1220 |           await menu.openCart();
  1221 |           await menu.proceedToCheckout();
  1222 |           const [codeRes] = await Promise.all([
  1223 |             page.waitForResponse(
  1224 |               (r) =>
  1225 |                 isQuoteResponse(r) &&
  1226 |                 (r.request().postDataJSON() as PageQuote["request"])
  1227 |                   .couponId === coupon.id,
  1228 |               { timeout: 30_000 }
  1229 |             ),
  1230 |             checkout.applyCoupon(code),
  1231 |           ]);
  1232 |           expect(
  1233 |             (await readQuote(codeRes)).body.quote?.freeItemOffer
  1234 |           ).toMatchObject({ menuItemId: baklava.id });
  1235 |           await expect(checkout.freeItemOfferButton()).toHaveText(offerText, {
  1236 |             timeout: 20_000,
  1237 |           });
  1238 |           const [giftRes] = await Promise.all([
  1239 |             page.waitForResponse(quoteWithGift, { timeout: 30_000 }),
  1240 |             checkout.freeItemOfferButton().click(),
  1241 |           ]);
  1242 |           expectGiftQuote(await readQuote(giftRes));
  1243 |           await expect(
  1244 |             page.getByRole("heading", { name: `1x ${baklava.name}` })
  1245 |           ).toBeVisible({ timeout: 15_000 });
  1246 |           await expect(checkout.freeItemOfferButton()).toHaveCount(0);
  1247 |           await expect(checkout.promotionLine(name)).toContainText(
  1248 |             `-${money(baklava.price)}`
  1249 |           );
  1250 |           await expectShownMatchesLatestQuote(checkout.readOrderTotal, quotes);
  1251 |         }
  1252 |       );
  1253 |     } finally {
  1254 |       await cleanup(name);
  1255 |     }
  1256 |   });
  1257 | 
  1258 |   test("TC-869: @scenario S7 Sub + a drink, one drink out of stock — the storefront won't let the customer pick it; the others work", async ({
  1259 |     ownerPage,
  1260 |     page,
  1261 |   }) => {
  1262 |     test.setTimeout(SCENARIO_TEST_TIMEOUT_MS);
  1263 |     await allure.description(
  1264 |       "Build: Combo price → Sub + Cola with '+ Add an option' adding Lemonade and Iced Tea, $9.99, Save and turn on. Read back: the two lines with exactly the three drinks. Then Lemonade goes out of stock on the menu (PATCH availability, as the owner's menu toggle does). Edit: price → $10.49 (the deal still saves; the stored line keeps all three). The public v2 deal list then offers only Cola and Iced Tea, and lima + wind show only those two (both pickable, no Lemonade card). Sub + Iced Tea → deal $10.49, no upgrades, You're saving = $11.50 − $10.49."
  1265 |     );
  1266 |     const name = promoName("Sub combo");
  1267 |     const group = "What's in the combo?";
  1268 |     const drinks = [cola, lemonade, icedTea];
  1269 |     const create = createOwnerCreatePromotionPage(ownerPage);
  1270 |     const quotes = trackQuotes(page);
  1271 |     try {
  1272 |       await allure.step("build it in the dashboard", async () => {
  1273 |         await create.goto(restaurantId);
  1274 |         await create.pickCard("Combo price");
  1275 |         await create.pickItems(group, [sub.name]);
  1276 |         await create.pickItems(
  1277 |           group,
  1278 |           drinks.map((d) => d.name),
  1279 |           { choice: true }
  1280 |         );
  1281 |         await create.setAmount("Combo price", "9.99");
  1282 |         await create.setName(name);
  1283 |         await create.turnOnDealWhenSlotFree(() =>
  1284 |           waitForFreeDealSlot(token, restaurantId)
  1285 |         );
  1286 |         await create.expectSaved();
  1287 |       });
  1288 | 
  1289 |       const dealId = await allure.step("read back", async () => {
  1290 |         const deal = await savedDeal(name);
  1291 |         expect(deal.status).toBe("ACTIVE");
  1292 |         expect(deal.dealPrice).toBe(9.99);
  1293 |         expect(linesOf(deal), JSON.stringify(deal.items)).toEqual([
  1294 |           fixed(sub),
```