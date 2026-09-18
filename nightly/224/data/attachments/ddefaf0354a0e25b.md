# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/chains.spec.ts >> Admin — Chains >> TC-324: unlink is refused for a location that has gone live, and for a non-member
- Location: tests/dashboard/admin/chains.spec.ts:293:7

# Error details

```
Error: API POST /api/order/new/restaurantId/bdee496e-1837-42e3-9e23-a6773afd7892 → 400: {"success":false,"message":"This restaurant has not been published yet, so orders cannot be placed. Publish the restaurant to start accepting orders.","errorCode":"ORDER_VALIDATION_FAILED","errorId":"66bd153e-4cbd-429c-b1a4-3e45af85e98a"}
```

# Test source

```ts
  2255 |  *      membership (no source-state check), so INITIALIZED→CONFIRMED is accepted.
  2256 |  *      Pass `status: null` to skip this step.
  2257 |  *
  2258 |  * Money is SERVER-AUTHORITATIVE (pricing engine, verified 2026-08-15):
  2259 |  *   • subtotal = the item's real DB price (claimed subtotal only has to clear
  2260 |  *     the floor; a higher claim is ignored — TC-142 evidence 2026-07-11);
  2261 |  *   • tax is RECOMPUTED from the restaurant's tax config (opts.tax ignored);
  2262 |  *   • tip is honoured; deliveryFee is honoured only for DELIVERY and > 0;
  2263 |  *   • total may include a processing fee if the restaurant opted in.
  2264 |  * So the returned SeededOrder carries the recorded values — assert against
  2265 |  * those (e.g. `formatCurrency(order.total)`), never a hand-computed sum.
  2266 |  *
  2267 |  * DELIVERY + deliveryFee > 0 can be rejected (400) when the restaurant's state
  2268 |  * has an unsupported delivery-tax policy; we retry once with deliveryFee: 0 and
  2269 |  * flag `deliveryFeeApplied: false` so tests can guard the fee-row assertion.
  2270 |  *
  2271 |  * Contact fields (firstName/lastName/email/phone/specialInstructions) are
  2272 |  * persisted as an on-order snapshot AND on the Customer row, so search by any
  2273 |  * of them works. Phone must follow the NANP rule documented on SeedOrderOpts.
  2274 |  *
  2275 |  * The order's createdAt is "now", so it lands in the current business day.
  2276 |  * There is no order-delete API — seeded orders are permanent QA residue;
  2277 |  * tests must assert on their OWN rows / on DELTAS, never absolute totals.
  2278 |  */
  2279 | export async function createSeededOrder(
  2280 |   ownerToken: string,
  2281 |   restaurantId: string,
  2282 |   item: SeedOrderItem,
  2283 |   opts: SeedOrderOpts = {}
  2284 | ): Promise<SeededOrder> {
  2285 |   const quantity = opts.quantity ?? 1;
  2286 |   const subtotal = opts.subtotal ?? item.price * quantity;
  2287 |   const tax = opts.tax ?? 0;
  2288 |   const tip = opts.tip ?? 0;
  2289 |   const orderType = opts.orderType ?? "PICKUP";
  2290 |   const status = opts.status === undefined ? "CONFIRMED" : opts.status;
  2291 |   const seed = opts.guest
  2292 |     ? {}
  2293 |     : {
  2294 |         email:
  2295 |           opts.customerEmail ??
  2296 |           `autoseed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@restaunax-test.com`,
  2297 |         phone: opts.customerPhone ?? "5552000000",
  2298 |         firstName: opts.firstName ?? "Auto",
  2299 |         lastName: opts.lastName ?? "Seed",
  2300 |       };
  2301 | 
  2302 |   const buildBody = (deliveryFee: number) => ({
  2303 |     orderType,
  2304 |     subtotal,
  2305 |     tax,
  2306 |     deliveryFee,
  2307 |     tip,
  2308 |     total: opts.total ?? subtotal + tax + tip + deliveryFee,
  2309 |     ...(opts.guest
  2310 |       ? {}
  2311 |       : {
  2312 |           customerEmail: seed.email,
  2313 |           customerPhone: seed.phone,
  2314 |           firstName: seed.firstName,
  2315 |           lastName: seed.lastName,
  2316 |         }),
  2317 |     ...(opts.specialInstructions
  2318 |       ? { specialInstructions: opts.specialInstructions }
  2319 |       : {}),
  2320 |     ...(opts.deliveryAddress ? { deliveryAddress: opts.deliveryAddress } : {}),
  2321 |     orderItems: [
  2322 |       {
  2323 |         menuItemId: item.menuItemId,
  2324 |         menuItemName: item.name,
  2325 |         quantity,
  2326 |         price: item.price,
  2327 |       },
  2328 |     ],
  2329 |   });
  2330 | 
  2331 |   const requestedFee = opts.deliveryFee ?? 0;
  2332 |   let deliveryFeeApplied = requestedFee > 0;
  2333 |   let res = await apiRequestRaw<{ order?: SeededOrder } & SeededOrder>(
  2334 |     "POST",
  2335 |     `/api/order/new/restaurantId/${restaurantId}`,
  2336 |     buildBody(requestedFee)
  2337 |   );
  2338 |   if (
  2339 |     !res.ok &&
  2340 |     res.status === 400 &&
  2341 |     orderType === "DELIVERY" &&
  2342 |     requestedFee > 0
  2343 |   ) {
  2344 |     // Tax-policy fallback (see doc comment) — retry without a delivery fee.
  2345 |     deliveryFeeApplied = false;
  2346 |     res = await apiRequestRaw<{ order?: SeededOrder } & SeededOrder>(
  2347 |       "POST",
  2348 |       `/api/order/new/restaurantId/${restaurantId}`,
  2349 |       buildBody(0)
  2350 |     );
  2351 |   }
  2352 |   if (!res.ok) {
  2353 |     const detail =
  2354 |       typeof res.data === "string" ? res.data : JSON.stringify(res.data);
> 2355 |     throw new Error(
       |           ^ Error: API POST /api/order/new/restaurantId/bdee496e-1837-42e3-9e23-a6773afd7892 → 400: {"success":false,"message":"This restaurant has not been published yet, so orders cannot be placed. Publish the restaurant to start accepting orders.","errorCode":"ORDER_VALIDATION_FAILED","errorId":"66bd153e-4cbd-429c-b1a4-3e45af85e98a"}
  2356 |       `API POST /api/order/new/restaurantId/${restaurantId} → ${res.status}: ${detail || "(no body)"}`
  2357 |     );
  2358 |   }
  2359 |   const data = res.data;
  2360 |   const order = (data.order ?? (data as SeededOrder)) as SeededOrder;
  2361 |   if (status !== null) {
  2362 |     await updateOrderStatus(ownerToken, order.id, status);
  2363 |   }
  2364 |   return {
  2365 |     ...order,
  2366 |     status: status ?? order.status,
  2367 |     seed,
  2368 |     deliveryFeeApplied,
  2369 |   };
  2370 | }
  2371 | 
  2372 | // ── Owner order-management API (Layer-1 contract tests) ─────────────────────
  2373 | //
  2374 | // Raw (non-throwing) wrappers around /api/order/statistics/* so specs can
  2375 | // assert status codes + bodies directly. All need an owner/admin token.
  2376 | 
  2377 | export interface OrderListParams {
  2378 |   page?: number;
  2379 |   limit?: number;
  2380 |   sortBy?: string;
  2381 |   sortDirection?: "asc" | "desc";
  2382 |   startDate?: string;
  2383 |   endDate?: string;
  2384 |   status?: string;
  2385 |   orderType?: string;
  2386 |   search?: string;
  2387 | }
  2388 | 
  2389 | export interface OrderListResponse {
  2390 |   orders: Array<
  2391 |     ApiOrder & {
  2392 |       receiptNumber?: string;
  2393 |       orderNumber?: number | null;
  2394 |       phone?: string | null;
  2395 |       email?: string | null;
  2396 |       firstName?: string | null;
  2397 |       lastName?: string | null;
  2398 |       customer?: {
  2399 |         phone?: string | null;
  2400 |         email?: string | null;
  2401 |         firstName?: string | null;
  2402 |         lastName?: string | null;
  2403 |       } | null;
  2404 |     }
  2405 |   >;
  2406 |   totalCount: number;
  2407 |   page: number;
  2408 |   limit: number;
  2409 |   totalPages: number;
  2410 | }
  2411 | 
  2412 | function toQuery(params: object): string {
  2413 |   const q = new URLSearchParams();
  2414 |   for (const [k, v] of Object.entries(params) as Array<
  2415 |     [string, string | number | undefined]
  2416 |   >) {
  2417 |     if (v !== undefined) q.set(k, String(v));
  2418 |   }
  2419 |   const s = q.toString();
  2420 |   return s ? `?${s}` : "";
  2421 | }
  2422 | 
  2423 | /** GET /api/order/statistics/management/:restaurantId — the Orders-tab grid feed. */
  2424 | export function listOrdersRaw(
  2425 |   accessToken: string,
  2426 |   restaurantId: string,
  2427 |   params: OrderListParams = {}
  2428 | ): Promise<RawResponse<OrderListResponse>> {
  2429 |   return apiRequestRaw<OrderListResponse>(
  2430 |     "GET",
  2431 |     `/api/order/statistics/management/${restaurantId}${toQuery(params)}`,
  2432 |     undefined,
  2433 |     accessToken
  2434 |   );
  2435 | }
  2436 | 
  2437 | export async function listOrders(
  2438 |   accessToken: string,
  2439 |   restaurantId: string,
  2440 |   params: OrderListParams = {}
  2441 | ): Promise<OrderListResponse> {
  2442 |   return apiRequest<OrderListResponse>(
  2443 |     "GET",
  2444 |     `/api/order/statistics/management/${restaurantId}${toQuery(params)}`,
  2445 |     undefined,
  2446 |     accessToken
  2447 |   );
  2448 | }
  2449 | 
  2450 | export interface OrderStats {
  2451 |   totalOrders: number;
  2452 |   totalRevenue: number;
  2453 |   averageOrderValue: number;
  2454 |   ordersByStatus: Array<{ status: string; count: number }>;
  2455 |   ordersByType: Array<{ type: string; count: number; revenue: number }>;
```