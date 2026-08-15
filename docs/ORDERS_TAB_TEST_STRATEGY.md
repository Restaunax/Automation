# Orders Tab — Test Strategy & Coverage Audit

_Owner dashboard → Restaurant Management → **Orders** tab. Written 2026-08-15 as the
first tab-by-tab audit; the same method (§6) is meant to be repeated for every other tab._

Sources: `restaunax-frontend/src/components/OrderStatistics/{OrderStatistics,Orders,OrderExportButton,OrderDetailsDialog}.tsx`,
`restaunax-backend/src/routes/order/{order,orderStatisticsRoutes}.ts` + `controller/order/*`,
and this repo's `tests/dashboard/owner/06-orders.spec.ts` (TC-29, 70, 89, 90, 131–135, 224, 225).

---

> **Status 2026-08-15 (same day, later):** §4 P1 + P2 (TC-231..262, minus the deferred auth pins TC-226..230) are **implemented and green** on QA — `06-orders.spec.ts` (33 tests), `06b-orders-journey.spec.ts` (TC-225/253/254), `api-orders.spec.ts` (TC-255..261). Two things surfaced while implementing:
>
> 1. **Backend bug — search by phone number 500'd — FIXED same day (RestauNax `48726a9e`, PR #589).** `getFilteredOrders` treated any all-digit term as an `orderNumber` and passed `Number(term)` to Prisma as an `int4`; a 10-digit phone overflowed Postgres integer range (`Value out of range for the type`), so "Search by … phone" — advertised in the placeholder — was broken for essentially every real number. The `orderNumber` branch is now guarded with `/^\d{1,9}$/` in `getFilteredOrders`, `exportOrders` and the chain order feed (`chainController.ts` — a third occurrence the first report missed). **TC-262** ran as `test.fail()` until QA had the fix and is now the permanent regression guard.
> 2. **Suite bug (fixed here) — customer POMs defaulted the storefront to `qa.restaunax.com`** (the marketing site) instead of the shared `TEMPLATE_WIND_URL` (`wind.restaunax.com`). CI never noticed (var set there); locally every Stripe test hit a 404. The four POMs now import the shared constant.
>    The §3 legend below is the _pre-implementation_ audit and is kept as the baseline; the current state is in `TEST_PLAN.md` → coverage table → "Owner orders".

## 0. TL;DR

| Question you asked                                           | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Should I switch back-and-forth between customer and owner?" | **Rarely.** Seed orders through the API and test the owner UI directly. Keep exactly a few "through-line" journeys that place a real order as a customer and verify it in the owner tab — TC-225 already shows the pattern (`page` = anonymous customer on Template Wind, `ownerPage` = logged-in owner, same test, two browser contexts). Everything else stays on one side. See §2.                                                                          |
| "Is there enough coverage of the Orders tab?"                | **No — it's smoke-level.** 11 tests prove the tab renders, the filter panel opens, one status click works, and one paid refund works. Nothing proves that **search finds the right order, filters return the right rows, the totals shown match the order that was placed, exports contain the right data, or that a customer's order actually shows up for the owner**. Coverage of the tab's user behaviours is roughly 25%. Gap list with priorities in §4. |
| "Something surprising?"                                      | **Yes — two security holes on the order API, confirmed live on QA (§1).** They should be fixed in the backend before more UI tests; the suite should then pin them so they can't come back.                                                                                                                                                                                                                                                                    |

---

## 1. 🔴 Findings that outrank the test plan

Confirmed by reading the code and, for #1, by a live status-only request against QA on 2026-08-15.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                                                                                                                                               | Why it matters                                                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **`GET /api/order/now` has no auth middleware and returns every order on the platform** (all restaurants, customer name/email/phone/address, payment transaction, items).                                                                                                                                                                                                                                                                                                               | `routes/order/order.ts:34` — `router.get("/now", getOrders)` with no `requireAuth`. Live: `curl -o /dev/null -w '%{http_code} %{size_download}' https://api.qa.restaunax.com/api/order/now` → **`200`, ~170 MB body**. | Anonymous, unpaginated PII dump. Same shape as the 2026-07 finding (order-status endpoints without auth) that was fixed in RestauNax #482 — this route was missed. Nothing in the frontend calls it; it can simply gain `requireAuth` + `requirePermission("ADMIN")` or be deleted. **Check prod too** (`api.restaunax.com`) — same code path.                                       |
| 2   | **The Orders-tab list, export, stats, receipt and detail endpoints check the _permission_ but not _which restaurant you own_.** `GET /api/order/statistics/management/:restaurantId`, `POST …/export/:restaurantId`, `GET …/restaurantId/:restaurantId`, `GET …/:orderId`, `GET …/:orderId/receipt` all use `requirePermission("VIEW_RESTAURANT")` only; `assertControlsOrderRestaurant` is called only in the three mutating handlers (`orderStatisticsController.ts:605, 963, 1400`). | `orderStatisticsRoutes.ts:22-55`; `getFilteredOrders` at `orderStatisticsController.ts:314-462` builds `where = { restaurantId }` straight from the URL.                                                               | Any owner (or plain `USER`, which also carries `VIEW_RESTAURANT` per `constant/allPermissions.ts:42`) can list/export another restaurant's orders and customer PII by changing the id in the URL. `PUT /api/order/orderId/:id/status`, `PUT /statistics/cancel`, `POST /statistics/refund` and `GET /api/order/restaurant/:id` DO enforce ownership — use them as positive controls. |

Recommended split: file both against the backend repo now; add the "pinning" tests from §4-P0 to this suite so they fail today and pass once fixed (or land them together with the fix).

---

## 2. The approach — three layers, not one

The instinct to "become the customer, then become the owner" is right for proving the _hand-off_, but it's the slowest and flakiest way to test the _owner tab itself_ (Stripe iframe, 20 s waits, real charges). Split the work into three layers and put each check in the cheapest layer that can prove it:

```
Layer 3  E2E journey       customer places real order on wind  ──►  owner sees it, works it, refunds it
         (2–3 tests)       two browser contexts in ONE test (page + ownerPage). Proves the hand-off.

Layer 2  Owner UI          API-seeded orders (createSeededOrder — no Stripe)  ──►  owner UI behaves
         (most tests)      search / filter / sort / paginate / detail / status / cancel / export

Layer 1  API contract      owner JWT hits /api/order/statistics/* directly
         (fast, many)      auth, tenant isolation, validation, status rules, refund guards, export shape
```

**Why this split**

- Layer 2 is where the Orders tab's user behaviour lives, and it does not need a customer at all: `createSeededOrder()` (utils/apiHelper.ts) creates a real-price order in any status in ~1 s. Seed exactly the rows a test needs (unique customer name / email / phone via `generateRunId()`), then assert the UI finds _those_ rows. That is how "search by phone actually works" becomes a deterministic test instead of "search returns something".
- Layer 3 is the only place a Stripe checkout belongs. Two or three of them are enough: (a) guest pickup order → appears in owner grid with the same receipt #, items, totals, customer contact → owner marks it through to PICKED*UP; (b) paid order → owner Cancel & Refund → customer refund email in Mailpit (already TC-225 minus the email); (c) delivery order → Delivery Info tab shows the address. Everything else the customer could vary (coupons, gift cards, tips, modifiers) is already covered on the customer side; the owner tab only needs to prove it \_displays* those lines, which Layer 2 can do by seeding an order with tax/tip/deliveryFee (`SeedOrderOpts`).
- Layer 1 catches the things a UI test can't see or would take minutes to reach: another owner's restaurant id, `status=INITIALIZED` leaking placeholders, `DELIVERED → PENDING` being accepted, refund on an unpaid order, export CSV columns. These are the tests that will save you when someone "just refactors the controller".

**Mechanics that already exist**

- Two roles in one test: `test("…", async ({ page, ownerPage }) => …)` — `page` is a fresh anonymous context (point it at `TEMPLATE_WIND_URL` with `seedCart`), `ownerPage` is the restored owner session. Add `adminPage`/`employeePage` the same way. No new fixture needed. For a **second owner** (tenant-isolation tests) you need a second set of credentials — add `OWNER2_EMAIL/PASSWORD` to `.env` + a small `apiLogin` in the test (API layer only; no UI session needed).
- Deterministic rows: `createSeededOrder(token, restaurantId, item, { status, orderType, tax, tip, deliveryFee, customerEmail })`. Extend it with `firstName/lastName/phone` (the public create-order body accepts them) so search tests can target a unique phone/name.
- Deep-link to any order: `ordersPage.gotoOrderDetail(restaurantId, orderId)` (`?tab=Orders&detailOrderId=`). Use it instead of "click first row" whenever the test is about the detail sheet, not the grid.
- Assert on the network, not on the DOM, when the DOM is virtualised: `page.waitForResponse(/statistics\/management/)` and check the query string (`status=PENDING`, `search=…`) plus the JSON `totalCount` — the DataGrid virtualises columns, so far-right cells may not exist in the DOM.

---

## 3. What the tab does vs. what's tested

Legend: ✅ covered · 🟡 touched but not proven · ❌ untested

### Header (OrderStatistics.tsx)

| Capability                                                           | Backend                                              | Status                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| Date-range button + presets (Today … Last Year), default last 7 days | —                                                    | ❌                                                            |
| "Update Stats"                                                       | `GET /statistics/restaurantId/:id?startDate&endDate` | ❌                                                            |
| 4 stat cards (Total Orders, Net Sales + avg, Delivery %, Pickup %)   | same                                                 | ❌ (Daily Report TC-142 asserts KPIs, Orders header does not) |
| Order Summary by Status (PENDING/CONFIRMED/PREPARING/READY counts)   | same                                                 | ❌                                                            |
| Top Selling Items                                                    | same                                                 | ❌                                                            |
| Empty state "No orders in this date range" + "Change date range" CTA | —                                                    | ❌                                                            |

### Toolbar (Orders.tsx)

| Capability                                                                                                                                           | Status                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Search by receipt #, order #, name, phone, email (300 ms debounce, server-side, **ignores date range**, shows "Searching all orders" banner + Clear) | 🟡 TC-70 proves _no_ match; nothing proves a _hit_ on any of the 5 fields, the banner, or Clear |
| Filters → Order Status (10 values)                                                                                                                   | 🟡 TC-132 proves the request fires; not that the rows returned are all that status              |
| Filters → Order Type (DELIVERY/PICKUP/SHIPPING)                                                                                                      | ❌                                                                                              |
| Filters count chip, Apply, Reset                                                                                                                     | 🟡 TC-133 Reset value only                                                                      |
| Sort (Newest/Oldest/Highest/Lowest amount)                                                                                                           | ❌                                                                                              |
| Refresh button                                                                                                                                       | ❌                                                                                              |
| Export → menu (Current view / 30 d / 90 d / All), CSV download, disabled at 0 rows, 429/403 handling                                                 | 🟡 TC-135 = button visible; no download, no CSV content                                         |
| Realtime: only `shippingStatusUpdate` is subscribed; **new orders do NOT appear without Refresh**                                                    | ❌ (worth pinning as a known behaviour, or filing as a product gap)                             |

### Grid

| Capability                                                                                                                                              | Status                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Columns (Receipt/Order #, Date, Customer, Type, Source, Status, Items, Total; hidden: Payment, Subtotal, Tax, Fee, Tip, Scheduled, Email, Instructions) | 🟡 TC-131 counts ≥5 headers           |
| Badges SPLIT / CUSTOM / FREE, scheduled icon                                                                                                            | ❌                                    |
| Server pagination 10/25/50/100, page reset on size change                                                                                               | ❌                                    |
| Row click / eye icon → detail + `?detailOrderId` push; back button closes                                                                               | 🟡 TC-90 opens; URL/back not asserted |
| Mobile card list (<sm)                                                                                                                                  | ❌ (low priority)                     |
| Empty state ("No rows"), error alert                                                                                                                    | ✅ TC-70 (empty) / ❌ (error)         |

### Detail sheet (OrderDetailsDialog.tsx)

| Capability                                                                                                                                              | Status                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Header: Order # chip, status chip; tabs Order Details / Customer Info / Delivery Info (delivery) / Shipping (shipping)                                  | 🟡 header only                                                                                                                           |
| Progress stepper per type (PICKUP 5 steps, DELIVERY 6, SHIPPING 4); hidden for CANCELLED/REFUNDED                                                       | ❌                                                                                                                                       |
| Order Information (type, date, scheduled, payment status, special instructions)                                                                         | 🟡 label visible                                                                                                                         |
| Order Total block (subtotal, deal savings/upcharge, reward, promo, coupon, tax, delivery fee, tip, gift card, Customer paid, Net to you, payout status) | 🟡 "Order Total" label visible; **no amount ever asserted**                                                                              |
| Items table (+ modifiers sub-rows, CUSTOM/OVERRIDE/FREE chips, notes) and Deals table                                                                   | 🟡 "Order Details" label visible; no item name/qty/price asserted                                                                        |
| Payment breakdown (multi-tender), "Rung up on" device                                                                                                   | ❌                                                                                                                                       |
| Customer Info tab (name/phone/email, snapshot-preferred, "Guest"/"N/A" fallbacks)                                                                       | ❌                                                                                                                                       |
| Delivery Info tab (address, notes, courier panel, Track/map links)                                                                                      | ❌                                                                                                                                       |
| Shipping tab (label status, Print/Regenerate/Generate, EvidenceGallery)                                                                                 | ❌ (out of scope for now — needs Shippo)                                                                                                 |
| **Mark as {next}** forward-only button; disappears at terminal state                                                                                    | ✅ TC-224 one click; ❌ full chain, ❌ delivery chain, ❌ disappears at PICKED_UP/CANCELLED                                              |
| **Cancel Order** → dialog: paid → "Cancel & Refund" + refund copy; unpaid → "Cancel Order"; reason text; Keep Order                                     | ✅ TC-225 paid path; ❌ **unpaid path** (the common one for cash/seeded orders); ❌ Keep Order; ❌ button hidden once CANCELLED/REFUNDED |
| Print (window.print)                                                                                                                                    | ❌ (low value)                                                                                                                           |
| Send Coupon (only when customer has id + email)                                                                                                         | ❌                                                                                                                                       |
| Marketplace (Uber/DoorDash) sync, +5/+10/+15 min, accept countdown, cancel veto                                                                         | ❌ (out of scope — needs marketplace sandbox)                                                                                            |
| Deep-link `?detailOrderId=` (incl. id not in current page → fetch)                                                                                      | ✅ used by TC-224/225; ❌ unknown-id handling                                                                                            |

### Backend contract (`/api/order/statistics/*`, `/api/order/orderId/:id/status`)

| Rule                                                                                    | Status                                                                         |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 401 without token on every statistics route                                             | ❌                                                                             |
| Tenant isolation on read routes                                                         | ❌ **(currently broken — §1 #2)**                                              |
| Tenant isolation on status/cancel/refund (works today)                                  | ❌ (pin it)                                                                    |
| `status` must be one of 9 values → 400 `ORDER_INVALID_STATUS`                           | ❌                                                                             |
| INITIALIZED excluded from list/export by default                                        | ❌ (and `?status=INITIALIZED` explicitly re-includes them — decide & pin)      |
| Cancel already CANCELLED/REFUNDED → 400                                                 | ❌                                                                             |
| Refund unpaid → 400; amount ≤0 or > total → 400; second refund → 400                    | ❌                                                                             |
| Backwards transitions (DELIVERED→PENDING) — **currently accepted**, `completedAt` wiped | ❌ (pin current behaviour or file it — the UI is forward-only, the API is not) |
| Export: 0 rows → 400 `noOrdersFound`; CSV columns (32) incl. Customer Email/Phone       | ❌                                                                             |
| Socket `orderStatusUpdate` on status PUT; `orderUpdate` on cancel/refund                | ❌ (optional; POS project is the natural home)                                 |
| Existing negative tests                                                                 | api-negative.spec.ts has none for orders                                       |

---

## 4. Gap list, prioritised (proposed TCs start at TC-226)

**P0 — security pins (Layer 1, `tests/dashboard/owner/api-orders.spec.ts` or `tests/dashboard/access/`)**
| TC | Test |
|---|---|
| 226 | `GET /api/order/now` without a token → 401 (fails today) |
| 227 | Owner A lists `/statistics/management/{restaurantB}` → 403 (fails today; needs `OWNER2_*` creds or an admin-created throwaway owner) |
| 228 | Owner A exports `/statistics/export/{restaurantB}` → 403 (fails today) |
| 229 | Owner A `PUT /statistics/cancel/{orderOfB}` and `PUT /api/order/orderId/{orderOfB}/status` → 403 (passes today — positive control) |
| 230 | Every `/statistics/*` route without Bearer → 401 |

**P1 — the owner's daily behaviour (Layer 2, `06-orders.spec.ts`)**
| TC | Test |
|---|---|
| 231 | Search by **receipt #** of a seeded order returns exactly that row (assert `totalCount===1` on the management response + row text) |
| 232 | Search by unique **customer phone** / **last name** / **email** finds the seeded order (one test, three steps) |
| 233 | Search shows the "Searching all orders" banner; **Clear Search** restores the date-range list |
| 234 | Status filter = PENDING → every returned row's `status==="PENDING"` and the seeded CONFIRMED order is absent (assert on JSON, not DOM) |
| 235 | Order Type = DELIVERY → seeded PICKUP order absent, seeded DELIVERY order present |
| 236 | Filter count chip shows "2" with status+type set; Reset clears chip |
| 237 | Sort "Highest amount" → first row total ≥ second row total (`sortBy=total&sortDirection=desc` on the request + JSON order) |
| 238 | Page size 25 → request `limit=25`; page 2 → `page=2`; changing size resets to page 1 |
| 239 | Refresh button re-fires the management request |
| 240 | Detail sheet **amounts match the seed**: subtotal, tax, tip, delivery fee, Customer paid == item.price + tax + tip + fee (seed with non-zero tax/tip/deliveryFee) |
| 241 | Detail sheet **items** show the seeded item name × qty × price |
| 242 | Customer Info tab shows the seeded name / phone / email; a guest seed shows "Guest" / "N/A" |
| 243 | Delivery Info tab shows the seeded delivery address (seed `orderType: "DELIVERY"` + address) |
| 244 | Full **PICKUP lifecycle via UI**: PENDING → Confirmed → Preparing → Ready → Picked Up, each PUT `status` asserted; then the Mark-as button is **gone** and stepper shows all steps complete |
| 245 | Full **DELIVERY lifecycle via UI** incl. Out for Delivery → Delivered |
| 246 | Cancel an **unpaid** order: dialog shows "Cancel Order" (not "& Refund"), no refund copy; confirm → PUT `/statistics/cancel` → `action:"CANCELLED"`; status chip CANCELLED; Cancel + Mark-as buttons gone |
| 247 | "Keep Order" closes the dialog with no request |
| 248 | Export "Current view" downloads `orders_YYYY-MM-DD….csv`; parse it: header has 32 columns, contains the seeded receipt #, and (with status filter set) only that status |
| 249 | Export is disabled when the current filter yields 0 rows |
| 250 | Header stat cards: after seeding N pickup orders today, Total Orders and Pickup Orders each increase by N and Net Sales by N × price (delta, `Today` preset) |
| 251 | Header empty state: pick a date preset with no orders (custom range far in the past) → "No orders in this date range" + CTA opens the picker |
| 252 | Deep-link with an unknown `detailOrderId` → no crash, sheet doesn't open / error alert |

**P1 — the through-line (Layer 3, new `tests/dashboard/owner/06b-orders-journey.spec.ts`, tag `@stripe`)**
| TC | Test |
|---|---|
| 253 | Guest places a pickup order on Template Wind (`page`) → owner (`ownerPage`) searches the receipt # from the confirmation page → same items, same total, same customer name/phone in the detail sheet → owner marks it Confirmed → … → Picked Up. **This is the one test that answers "did the order come through?"** |
| 254 | (extend TC-225) after Cancel & Refund, Mailpit receives the refund email for the customer address (`@email`) and the customer-side `GET /api/order/{id}?receipt=` shows status REFUNDED |

**P2 — API contract (Layer 1)**
| TC | Test |
|---|---|
| 255 | Invalid `status` → 400 `ORDER_INVALID_STATUS` (both status endpoints) |
| 256 | Cancel twice → second is 400 `alreadyCancelled` |
| 257 | Refund on unpaid order → 400; `amount: 0` / `> total` → 400 |
| 258 | Default list excludes INITIALIZED (seed one, don't bump it, assert absent); pin the `?status=INITIALIZED` behaviour once product decides |
| 259 | Backwards transition DELIVERED→PENDING: pin current 200 + `completedAt:null` **or** expect 409 once the backend adds a state machine (write it as `test.fixme` referencing the ticket) |
| 260 | Export with 0 matching rows → 400 `noOrdersFound` |

**P3 — deliberately out of scope for now** (need external sandboxes or aren't reachable on QA): marketplace panel/veto/ready-time, shipping label + evidence wizard, multi-tender payment breakdown (POS-created), chain-scope Orders (`/api/chains/:groupId/orders`), mobile card layout, socket assertions (POS project), Send Coupon.

---

## 5. Suggested layout

```
tests/dashboard/owner/
  06-orders.spec.ts            # Layer 2 — keep; grow to ~30 tests (one file = serial, shared beforeAll seeds)
  06b-orders-journey.spec.ts   # Layer 3 — customer→owner through-lines (@stripe); own file so a Stripe hiccup
                               #           doesn't take the whole Orders file down
  api-orders.spec.ts           # Layer 1 — contract + tenant isolation (no browser; mirrors api-negative.spec.ts)
pages/dashboard/owner/OwnerOrdersPage.ts   # add: orderTypeFilter, sortSelect, pageSizeSelect, refreshButton,
                                           #      searchBanner/clearSearchButton, detail tab getters (customerInfoTab,
                                           #      deliveryInfoTab), amount getters (row label → value), export menu items,
                                           #      keepOrderButton, cancelOrderConfirmButton (unpaid label)
utils/apiHelper.ts                          # extend createSeededOrder with firstName/lastName/phone/deliveryAddress/
                                            #      specialInstructions; add listOrders(token, restaurantId, params) and
                                            #      cancelOrderApi/refundOrderApi/exportOrdersRaw for Layer 1
```

Seed once per file in `beforeAll` (a small "fixture set": 1 PENDING pickup, 1 CONFIRMED delivery w/ tax+tip+fee, 1 CANCELLED, all with a run-unique customer surname) and let the search/filter/sort tests target that set. Seeded orders are permanent QA residue — assert on **your** rows and on **deltas**, never on absolute counts (see TEST_PLAN → Parallel Execution).

---

## 6. The repeatable method (for the next tabs)

1. **Inventory the UI** — open the tab's component tree and list every control, section, conditional and API call (what this doc's §3 does). Don't test from memory of the UI; test from the source.
2. **Inventory the backend** — for each API call, read the controller: auth middleware, ownership check, validation, side effects, status codes. This is where security and business-rule tests come from.
3. **Map existing tests** onto that inventory (✅/🟡/❌). "Touched" ≠ "proven": a test that only asserts a label is visible is 🟡.
4. **Write the gap list in three layers**: API contract (fast, many) → owner UI with API-seeded data (most) → 2–3 cross-role journeys (Stripe/Mailpit) that prove the hand-off.
5. **Own your data**: seed unique rows per file, assert on those rows / on deltas, restore anything you mutate.
6. **Assert outcomes at the source of truth**: for anything the grid virtualises or formats, assert on the request/response (`waitForResponse`) as well as the DOM.
7. Update `TEST_CASES.md`, `TEST_PLAN.md` coverage table and Allure labels (`feature`, `severity`) with each new TC.
