# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/06-orders.spec.ts >> Owner — Orders Tab >> TC-248: Export → Current View downloads a CSV of exactly the filtered orders
- Location: tests/dashboard/owner/06-orders.spec.ts:1190:7

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 0

  Array [
    "CANCELLED",
    "CONFIRMED",
-   "PENDING",
  ]
```

# Test source

```ts
  1142 |       expect(body.success).toBe(true);
  1143 |       expect(body.action).toBe("CANCELLED");
  1144 |       await expect(ordersPage.cancelSuccessAlert()).toBeVisible({
  1145 |         timeout: 10_000,
  1146 |       });
  1147 |       // The sheet closes itself ~2 s after success.
  1148 |       await expect(ordersPage.detailSheet()).toBeHidden({ timeout: 15_000 });
  1149 |     });
  1150 | 
  1151 |     await allure.step("Re-open: terminal state", async () => {
  1152 |       await ordersPage.gotoOrderDetail(restaurantId, order.id);
  1153 |       await expect(ordersPage.statusChip()).toHaveText("Cancelled");
  1154 |       await expect(ordersPage.cancelOrderButton()).toHaveCount(0);
  1155 |       await expect(ordersPage.markAsNextButton()).toHaveCount(0);
  1156 |       await expect(ordersPage.orderProgressHeading()).toHaveCount(0);
  1157 |     });
  1158 |   });
  1159 | 
  1160 |   test("TC-247: 'Keep Order' closes the cancel dialog without cancelling", async ({
  1161 |     ownerPage,
  1162 |   }) => {
  1163 |     await allure.description(
  1164 |       "Backing out of the cancel dialog must be free of side effects: no cancel request is sent, the " +
  1165 |         "nested dialog closes and the sheet still offers Cancel Order."
  1166 |     );
  1167 |     const { restaurantId } = readSharedState();
  1168 |     const ordersPage = createOwnerOrdersPage(ownerPage);
  1169 |     let cancelRequests = 0;
  1170 |     ownerPage.on("request", (r) => {
  1171 |       if (/\/api\/order\/statistics\/cancel\//.test(r.url())) cancelRequests++;
  1172 |     });
  1173 |     // orderB is CONFIRMED and never mutated — safe to open the dialog on.
  1174 |     await ordersPage.gotoOrderDetail(restaurantId, orderB.id);
  1175 |     await ordersPage.openCancelDialog();
  1176 |     await expect(ordersPage.cancelRefundDialog()).toBeVisible();
  1177 |     await ordersPage.keepOrderButton().click();
  1178 |     await expect(ordersPage.cancelRefundDialog()).toBeHidden({
  1179 |       timeout: 10_000,
  1180 |     });
  1181 |     await expect(ordersPage.cancelOrderButton()).toBeVisible();
  1182 |     await expect(ordersPage.statusChip()).toHaveText("Confirmed");
  1183 |     expect(cancelRequests).toBe(0);
  1184 |   });
  1185 | 
  1186 |   // ══════════════════════════════════════════════════════════════════════════
  1187 |   // Export
  1188 |   // ══════════════════════════════════════════════════════════════════════════
  1189 | 
  1190 |   test("TC-248: Export → Current View downloads a CSV of exactly the filtered orders", async ({
  1191 |     ownerPage,
  1192 |   }) => {
  1193 |     await allure.description(
  1194 |       "With the grid narrowed to the seed surname, Export Orders → Current View POSTs " +
  1195 |         "/api/order/statistics/export/:id with exportType=current + the search term and the browser " +
  1196 |         "receives orders_<date>[…].csv. The file has the 32 documented columns and exactly the three " +
  1197 |         "named seed rows (by receipt number). Adding the Pending status filter narrows the CSV to order A."
  1198 |     );
  1199 |     const ordersPage = await gotoOrders(ownerPage);
  1200 |     await ordersPage.waitForManagementResponse(
  1201 |       () => ordersPage.searchOrders(surname),
  1202 |       (q) => q.get("search") === surname
  1203 |     );
  1204 | 
  1205 |     const downloadCsv = async () => {
  1206 |       const [download, request] = await Promise.all([
  1207 |         ownerPage.waitForEvent("download", { timeout: 60_000 }),
  1208 |         ownerPage.waitForRequest(
  1209 |           (r) =>
  1210 |             /\/api\/order\/statistics\/export\//.test(r.url()) &&
  1211 |             r.method() === "POST"
  1212 |         ),
  1213 |         ordersPage.exportCurrentView(),
  1214 |       ]);
  1215 |       const body = request.postDataJSON() as Record<string, unknown>;
  1216 |       const text = fs.readFileSync(await download.path(), "utf8");
  1217 |       return {
  1218 |         filename: download.suggestedFilename(),
  1219 |         body,
  1220 |         rows: parseCsv(text),
  1221 |       };
  1222 |     };
  1223 | 
  1224 |     await allure.step("Export the surname-filtered view", async () => {
  1225 |       const { filename, body, rows } = await downloadCsv();
  1226 |       await allure.parameter("filename", filename);
  1227 |       expect(filename).toMatch(/^orders_\d{4}-\d{2}-\d{2}(_[a-z0-9_]+)*\.csv$/);
  1228 |       expect(body.exportType).toBe("current");
  1229 |       expect(body.search).toBe(surname);
  1230 |       expect(rows[0]).toEqual(EXPORT_CSV_HEADER);
  1231 |       const receipts = rows
  1232 |         .slice(1)
  1233 |         .map((r) => r[0])
  1234 |         .sort();
  1235 |       expect(receipts).toEqual(
  1236 |         surnameOrders()
  1237 |           .map((o) => o.receiptNumber)
  1238 |           .sort()
  1239 |       );
  1240 |       const statusCol = EXPORT_CSV_HEADER.indexOf("Status");
  1241 |       const statuses = new Set(rows.slice(1).map((r) => r[statusCol]));
> 1242 |       expect([...statuses].sort()).toEqual(
       |                                    ^ Error: expect(received).toEqual(expected) // deep equality
  1243 |         ["PENDING", "CONFIRMED", "CANCELLED"].sort()
  1244 |       );
  1245 |     });
  1246 | 
  1247 |     await allure.step("Add status=Pending → CSV narrows to A", async () => {
  1248 |       await ordersPage.openFilters();
  1249 |       await ordersPage.selectStatusFilter("Pending");
  1250 |       await ordersPage.waitForManagementResponse(
  1251 |         () => ordersPage.applyFilters(),
  1252 |         (q) => q.get("status") === "PENDING"
  1253 |       );
  1254 |       const { body, rows } = await downloadCsv();
  1255 |       expect(body.status).toBe("PENDING");
  1256 |       expect(rows.slice(1).map((r) => r[0])).toEqual([orderA.receiptNumber]);
  1257 |     });
  1258 |   });
  1259 | 
  1260 |   test("TC-249: Export is disabled when the current view has no orders", async ({
  1261 |     ownerPage,
  1262 |   }) => {
  1263 |     await allure.description(
  1264 |       "An export of nothing is a 400 on the backend, so the toolbar disables the Export button while " +
  1265 |         "totalCount is 0 and re-enables it once rows are back."
  1266 |     );
  1267 |     const ordersPage = await gotoOrders(ownerPage);
  1268 |     const none = `nonexistent-order-${runId}`;
  1269 |     await ordersPage.waitForManagementResponse(
  1270 |       () => ordersPage.searchOrders(none),
  1271 |       (q) => q.get("search") === none
  1272 |     );
  1273 |     await expect(ordersPage.exportOrdersButton()).toBeDisabled();
  1274 |     await ordersPage.waitForManagementResponse(
  1275 |       () => ordersPage.searchOrders(surname),
  1276 |       (q) => q.get("search") === surname
  1277 |     );
  1278 |     await expect(ordersPage.exportOrdersButton()).toBeEnabled();
  1279 |   });
  1280 | 
  1281 |   // ══════════════════════════════════════════════════════════════════════════
  1282 |   // Header stats + date range
  1283 |   // ══════════════════════════════════════════════════════════════════════════
  1284 | 
  1285 |   test("TC-250: the header stat cards reflect the stats API and move when orders are seeded", async ({
  1286 |     ownerPage,
  1287 |   }) => {
  1288 |     await allure.description(
  1289 |       "Two proofs. (1) API delta, timezone-proof: with a yesterday→tomorrow window, seeding two pickup " +
  1290 |         "orders raises Total Orders and Pickup count by ≥2 and Net Sales by ≥ 2 × item price (≥ because " +
  1291 |         "concurrent spec files also seed). (2) UI: the four cards render exactly the values the stats " +
  1292 |         "endpoint returned, 'Update Stats' re-fires it, and picking the 'Today' preset re-fires it with " +
  1293 |         "browser-local start=end=today."
  1294 |     );
  1295 |     const { restaurantId } = readSharedState();
  1296 |     const token = await ownerToken();
  1297 |     const item = seedItem();
  1298 |     const day = (offset: number) => {
  1299 |       const d = new Date();
  1300 |       d.setUTCDate(d.getUTCDate() + offset);
  1301 |       return d.toISOString().slice(0, 10);
  1302 |     };
  1303 |     const range = { startDate: day(-1), endDate: day(1) };
  1304 |     const pickupCount = (s: Awaited<ReturnType<typeof getOrderStats>>) =>
  1305 |       s.ordersByType.find((t) => t.type === "PICKUP")?.count ?? 0;
  1306 | 
  1307 |     await allure.step("API delta after seeding two pickup orders", async () => {
  1308 |       const before = await getOrderStats(token, restaurantId, range);
  1309 |       for (let i = 0; i < 2; i++) {
  1310 |         await createSeededOrder(token, restaurantId, item, {
  1311 |           status: "CONFIRMED",
  1312 |           lastName: mutationSurname,
  1313 |           customerPhone: generateSeedPhone(),
  1314 |         });
  1315 |       }
  1316 |       const after = await getOrderStats(token, restaurantId, range);
  1317 |       expect(after.totalOrders - before.totalOrders).toBeGreaterThanOrEqual(2);
  1318 |       expect(pickupCount(after) - pickupCount(before)).toBeGreaterThanOrEqual(
  1319 |         2
  1320 |       );
  1321 |       expect(after.totalRevenue - before.totalRevenue).toBeGreaterThanOrEqual(
  1322 |         2 * item.price - 0.01
  1323 |       );
  1324 |     });
  1325 | 
  1326 |     const ordersPage = createOwnerOrdersPage(ownerPage);
  1327 |     await allure.step("Cards equal the stats response", async () => {
  1328 |       const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
  1329 |       const { json } = await ordersPage.waitForStatsResponse(async () => {
  1330 |         await mgmtPage.goto(restaurantId);
  1331 |         await ordersPage.navigateToOrdersTab();
  1332 |       });
  1333 |       const total = Number(json.totalOrders);
  1334 |       const pct = (n: number) =>
  1335 |         total > 0 ? Math.round((n / total) * 100) : 0;
  1336 |       const byType =
  1337 |         (json.ordersByType as Array<Record<string, unknown>>) ?? [];
  1338 |       const count = (t: string) =>
  1339 |         Number(byType.find((x) => x.type === t)?.count ?? 0);
  1340 |       if (total === 0) {
  1341 |         await expect(ordersPage.emptyRangeTitle()).toBeVisible();
  1342 |         return;
```