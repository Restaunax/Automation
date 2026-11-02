# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/api-customer-insights.spec.ts >> Customer insights numbers (API) >> TC-1099: the customer profile returns the customer's id, and Discounts sent answers for it
- Location: tests/dashboard/owner/api-customer-insights.spec.ts:218:7

# Error details

```
Error: {"success":false,"message":"Customer not found","errorCode":"CUSTOMER_NOT_FOUND","errorId":"3bea2f0d-64a0-45f4-961c-d13478804548"}

expect(received).toBe(expected) // Object.is equality

Expected: 200
Received: 404
```

# Test source

```ts
  127 |       ownerToken
  128 |     );
  129 |     expect(res.status, JSON.stringify(res.data)).toBe(200);
  130 |     return res.data.analytics as Analytics;
  131 |   };
  132 | 
  133 |   test.beforeAll(async () => {
  134 |     test.setTimeout(240_000);
  135 |     if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
  136 |     adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
  137 |     const tenant = await createSecondOwner(adminToken, runId, {
  138 |       alwaysFresh: true,
  139 |     });
  140 |     if (!tenant.restaurantId) throw new Error("[customer-insights] no tenant");
  141 |     restaurantId = tenant.restaurantId;
  142 |     ownerToken = tenant.accessToken;
  143 |     await updateRestaurantSettingsApi(ownerToken, restaurantId, {
  144 |       acceptingOrders: true,
  145 |     });
  146 |     await ensureTaxRate(ownerToken, restaurantId, 7);
  147 |     await setRestaurantPublishedApi(adminToken, restaurantId, true);
  148 |     await ensureBusinessHours(ownerToken, restaurantId);
  149 |     const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
  150 |     if (onboard.status !== 200)
  151 |       throw new Error(
  152 |         `[customer-insights] stripe: ${JSON.stringify(onboard.data)}`
  153 |       );
  154 |     pk = String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
  155 |     await ensureOrderingSlug(
  156 |       adminToken,
  157 |       "restaurant",
  158 |       restaurantId,
  159 |       `auto-ci-${runId}`
  160 |     );
  161 |     const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
  162 |       restaurantId,
  163 |     });
  164 |     burgerId = (await createMenuItemFull(ownerToken, food.id, "Burger", 12)).id;
  165 | 
  166 |     // Identified customers: Ana twice, Ben once.
  167 |     await orderOnline(anaEmail, "Ana", "5555550131");
  168 |     await orderOnline(anaEmail, "Ana", "5555550131");
  169 |     await orderOnline(benEmail, "Ben", "5555550132");
  170 | 
  171 |     // Two anonymous cash walk-ins on a register (no contact details).
  172 |     const device = await createTabletDevice(
  173 |       adminToken,
  174 |       restaurantId,
  175 |       `auto-ci-${runId}`
  176 |     );
  177 |     deviceId = device.id;
  178 |     const tablet = await tabletLogin(device.name, device.code);
  179 |     const ownerMember = await setOwnerPosPin(ownerToken, restaurantId, "5824");
  180 |     const session = await tabletStaffSignIn(tablet, ownerMember, "5824");
  181 |     await openRegisterSessionPos(tablet, session);
  182 |     for (let i = 0; i < 2; i++) {
  183 |       const sale = await createTabletOrderRaw(tablet, session, {
  184 |         restaurantId,
  185 |         orderSource: "IN_STORE",
  186 |         orderType: "PICKUP",
  187 |         paymentMethod: "CASH",
  188 |         subtotal: 12,
  189 |         tax: 0.84,
  190 |         tip: 0,
  191 |         processingFee: 0,
  192 |         total: 12.84,
  193 |         customerPhone: "",
  194 |         orderItems: burger(),
  195 |       });
  196 |       if (sale.status !== 201)
  197 |         throw new Error(
  198 |           `[customer-insights] walk-in: ${JSON.stringify(sale.data)}`
  199 |         );
  200 |     }
  201 |   });
  202 | 
  203 |   test.afterAll(async () => {
  204 |     if (adminToken && restaurantId) {
  205 |       if (deviceId)
  206 |         await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
  207 |           () => {}
  208 |         );
  209 |       await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  210 |     }
  211 |   });
  212 | 
  213 |   test.beforeEach(async () => {
  214 |     await allure.label("feature", "Customers — insights numbers");
  215 |     await allure.label("severity", "critical");
  216 |   });
  217 | 
  218 |   test("TC-1099: the customer profile returns the customer's id, and Discounts sent answers for it", async () => {
  219 |     const profile = await apiRequestRaw<{
  220 |       customer?: { id?: string; email?: string; totalOrders?: number };
  221 |     }>(
  222 |       "GET",
  223 |       `/api/customers/restaurant/${restaurantId}/${encodeURIComponent(anaEmail)}`,
  224 |       undefined,
  225 |       ownerToken
  226 |     );
> 227 |     expect(profile.status, JSON.stringify(profile.data)).toBe(200);
      |                                                          ^ Error: {"success":false,"message":"Customer not found","errorCode":"CUSTOMER_NOT_FOUND","errorId":"3bea2f0d-64a0-45f4-961c-d13478804548"}
  228 |     const customer = profile.data.customer ?? {};
  229 |     expect(customer.email).toBe(anaEmail);
  230 |     expect(customer.totalOrders).toBe(2);
  231 |     expect(typeof customer.id, JSON.stringify(customer)).toBe("string");
  232 |     expect(String(customer.id).length).toBeGreaterThan(0);
  233 | 
  234 |     const sent = await apiRequestRaw<{ success?: boolean; data?: unknown[] }>(
  235 |       "GET",
  236 |       `/api/coupons/personal-codes/customer/${customer.id}?restaurantId=${restaurantId}`,
  237 |       undefined,
  238 |       ownerToken
  239 |     );
  240 |     expect(sent.status, JSON.stringify(sent.data)).toBe(200);
  241 |     expect(Array.isArray(sent.data.data)).toBe(true);
  242 |   });
  243 | 
  244 |   test("TC-1100: analytics counts only identified customers; new + returning = customers, none negative; walk-ins reported beside", async () => {
  245 |     const { summary } = await analytics();
  246 |     // Ana + Ben. The walk-in record is not a third customer.
  247 |     expect(summary.uniqueCustomers, JSON.stringify(summary)).toBe(2);
  248 |     expect(summary.totalOrders).toBe(3);
  249 |     expect(summary.newCustomers).toBe(2);
  250 |     expect(summary.returningCustomers).toBe(0);
  251 |     expect(summary.newCustomers + (summary.returningCustomers ?? NaN)).toBe(
  252 |       summary.uniqueCustomers
  253 |     );
  254 |     expect(summary.walkInOrders).toBe(2);
  255 |   });
  256 | 
  257 |   test("TC-1101: monthly trends add up per month, never negative; Analytics segments partition all-time customers", async () => {
  258 |     const data = await analytics();
  259 |     expect(data.monthlyTrends.length).toBeGreaterThan(0);
  260 |     for (const m of data.monthlyTrends) {
  261 |       expect(m.newCustomers, JSON.stringify(m)).toBeGreaterThanOrEqual(0);
  262 |       expect(m.returningCustomers, JSON.stringify(m)).toBeGreaterThanOrEqual(0);
  263 |       expect(m.newCustomers + m.returningCustomers, JSON.stringify(m)).toBe(
  264 |         m.activeCustomers
  265 |       );
  266 |     }
  267 |     // All orders were placed this month: Ana (3 orders would once have made
  268 |     // "new" 3 and "returning" negative) counts once.
  269 |     const latest = data.monthlyTrends[data.monthlyTrends.length - 1];
  270 |     expect(latest).toMatchObject({
  271 |       newCustomers: 2,
  272 |       returningCustomers: 0,
  273 |       activeCustomers: 2,
  274 |     });
  275 | 
  276 |     expect(data.totalAllTimeCustomers).toBe(2);
  277 |     const segmentSum = Object.values(data.segments).reduce(
  278 |       (s, x) => s + x.count,
  279 |       0
  280 |     );
  281 |     expect(segmentSum, JSON.stringify(data.segments)).toBe(
  282 |       data.totalAllTimeCustomers
  283 |     );
  284 |   });
  285 | 
  286 |   test("TC-1102: Groups report a distinct customer total that no group or the healthy count exceeds", async () => {
  287 |     const res = await apiRequestRaw<{
  288 |       segments?: Record<string, { count: number }>;
  289 |       totalCustomers?: number;
  290 |       healthyCustomers?: number;
  291 |     }>(
  292 |       "GET",
  293 |       `/api/customers/restaurant/${restaurantId}/segments`,
  294 |       undefined,
  295 |       ownerToken
  296 |     );
  297 |     expect(res.status, JSON.stringify(res.data)).toBe(200);
  298 |     const { segments = {}, totalCustomers, healthyCustomers } = res.data;
  299 |     expect(totalCustomers, JSON.stringify(res.data)).toBe(2);
  300 |     const total = totalCustomers as number;
  301 |     for (const [key, group] of Object.entries(segments))
  302 |       expect(group.count, key).toBeLessThanOrEqual(total);
  303 |     const vip = segments.vip?.count ?? 0;
  304 |     const loyal = segments.loyal?.count ?? 0;
  305 |     expect(typeof healthyCustomers).toBe("number");
  306 |     // Distinct customers in VIP or Loyal: at least the bigger group, at most
  307 |     // both added, never more than everyone.
  308 |     expect(healthyCustomers).toBeGreaterThanOrEqual(Math.max(vip, loyal));
  309 |     expect(healthyCustomers).toBeLessThanOrEqual(Math.min(vip + loyal, total));
  310 |   });
  311 | });
  312 | 
```