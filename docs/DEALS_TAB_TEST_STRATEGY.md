# Deals — Test Strategy & Coverage Audit (owner portal + storefront)

_Owner dashboard → Restaurant Management → **Deals** (Manage Deals · Create Deal · AI Generator ·
Deal Analytics), the chain-scoped twins under `/chain/:groupId/…`, the public deal API the storefront
uses, and template-wind's deal builder / cart / checkout. Written 2026-08-17 with the same method as
`MENU_TAB_TEST_STRATEGY.md` (inventory UI → inventory backend → map tests → gap list in three layers)._

Sources read for this audit (all in the `restaunax` repo unless noted):

- Docs: `docs/qa-stories/QA_USER_STORIES_DEALS.md` (Dec-2024 QA stories — **US-005 "deals + coupons
  combined" is stale**, see §1.4), `docs/features/COUPON_RULES_AND_FREE_DELIVERY.md` ("Coupon ⊥ deal"),
  `docs/features/CHAIN_RESTAURANTS.md` (chain deals: XOR scope, redeem at any member, no per-location
  opt-out), `docs/features/FEATURE_ENTITLEMENTS_AND_ADDONS.md` (DEALS is a brand-level feature),
  `docs/features/CHANNEL_PRICING_DESIGN.md` (deals never serialised to Uber).
- Backend: `prisma/schema.prisma` (`Deal`, `DealItem`, `OrderDeal`, `OrderDealItem`,
  `OrderDealItemModifier`, `DealStatus`, `Deal_single_scope` CHECK), `src/routes/deal/dealRoutes.ts`,
  `src/controller/deal/{dealController,aiDealController}.ts`, `src/Service/dealAvailabilityService.ts`,
  `src/Service/pricing/{dealPricing,pricingEngine,pricingContext,legacyOrderIntent}.ts`,
  `src/controller/order/pricingController.ts` (`/quote`), `src/controller/chain/chainController.ts`
  (chain deal routes), `src/Service/orderPostPaymentService.ts` (`processDealStatistics`),
  `src/Service/restaurantAccessService.ts` (the ownership helper the deal routes don't use).
- Frontend: `components/Deals/{DealsDashboard,DealForm,DealAnalytics,AIDealsGenerator}.tsx`,
  `RestaurantManagement/PortalShell.tsx` (tab ids, chain-managed gate), `Chain/ChainManagementShell.tsx`,
  `hooks/useFanOutConfirm.ts`, `Common/Confirm/ConfirmProvider.tsx`, `public/locales/en/{deals,restaurant,common}.json`.
- template-wind: `app/deals/[dealId]/page.tsx`, `components/deals/*`, `components/blocks/DealsGridBlock.tsx`,
  `components/checkout/{CouponSection,OrderSummary}.tsx`, `components/cart/CartSummary.tsx`,
  `context/CartContext.tsx`, `utils/dealValidation.ts` (+ vitest), `app/checkout/page.tsx`.
- This repo: `tests/dashboard/owner/11-deals.spec.ts` (TC-86/87), `tests/customer/06-deals.spec.ts`
  (TC-195..197), `pages/dashboard/owner/OwnerDealsPage.ts`, `pages/customer/CustomerDealPage.ts`,
  `utils/apiHelper.ts` deal helpers (`createDealRaw`, `getRestaurantDeals`, `deleteDealApi`,
  `deleteAutomationDeals`), `globalTeardown.ts` (AUTO deal sweep).

---

> **Status 2026-08-18:** §4 + §6 are **implemented and green on QA** — `api-deals.spec.ts` (TC-325..350, 27 tests incl.
> TC-335b), `11-deals.spec.ts` (TC-86/87 + TC-351..364), `18-chain-deals.spec.ts` (TC-365/366),
> `customer/08-deals-handoff.spec.ts` (TC-367..371) — 53 tests in the combined run, **eleven `test.fail()` pins**
> (TC-334, 335b, 336, 341c, 343, 347..350, 358). Deviations from the plan below, all recorded in the specs:
> **the API file runs on a per-run throwaway tenant** (`createSecondOwner`; archived in `afterAll`) rather than the
> seed restaurant — the seed restaurant already carries five real ACTIVE deals and only ten may be active, so the
> first combined run hit `MAX_ACTIVE_DEALS_REACHED` across workers; the seed OWNER is the cross-tenant intruder for
> TC-347..350 and the throwaway owner is the non-chain-owner for TC-345. The UI file keeps a two-deal ACTIVE
> footprint on the seed restaurant, re-activates with a cap-tolerant retry (`activateWithRetry`), and tears its cap
> top-ups down inside TC-359. TC-335 was split (335 plain, 335b pin). Layer 3 asserts the storefront's OWN
> `/quote` request/response instead of a separate call. Storefront cards render one "1x" chip per qty-1 slot row
> (not "2x"). New finding beyond §1: the confirmation page greets a **returning phone number** by the stored
> customer name, not the name typed at checkout (TC-371 uses a fresh NANP phone) — product question, note only.
> Frontend testids were NOT added — every needed control had a stable id / accessible name (see §2).

> **Fix status 2026-08-19:** all §1 findings are FIXED and LIVE on QA — RestauNax
> [#618](https://github.com/Restaunax/RestauNax/pull/618) (authz IDOR on every `/api/deals` route via
> `assertControlsRestaurant`/`assertControlsDeal`; `MAX_ACTIVE_DEALS` now enforced on create + `PUT`;
> `PUT /:dealId` re-validates the merged row; `bulkCreateDeals` `aiGenerated` `|| true` → `?? false`;
> DealsDashboard pagination resets to page 0 on filter) and
> [#619](https://github.com/Restaunax/RestauNax/pull/619) (Coupon ⊥ deal enforced in the pricing engine —
> product decision **Option A**: coupon priced at 0 + a `coupon_deal_exclusive` ERROR issue for every client).
> The eleven `test.fail()` pins were flipped to plain passing tests (TC-334, 335b, 336, 341, 343, 347..350, 358),
> verified against QA 2026-08-19. Two behaviour changes the flip absorbed: (1) the ownership guard now precedes
> the not-found check, so creating a deal on an unknown/unowned restaurant is **403**, not 404 (TC-326); (2) with
> create now capped, the seed restaurant (5 real active deals) can't host both deal UI files' active deals at
> once — `11-deals` keeps a 2-deal active footprint (`restricted` parked INACTIVE), `08-deals-handoff` seeds via
> `createDealApiCapSafe` (retries the transient cap), and the cap tests build "10 active + 1 inactive candidate"
> without ever creating an 11th active deal.

## 0. TL;DR

- **How deals work.** A deal is a **fixed-price bundle** (`dealPrice`) of 1..n menu-item slots
  (`DealItem`, always persisted at `quantity = 1` — "2 pizzas" = 2 rows; `splitDealItemsToUnitQuantity`
  is the chokepoint). The server computes `originalPrice = Σ itemPrice`, `savingsAmount = max(0, orig − deal)`,
  `savingsPercentage` (1 dp). `status` ∈ ACTIVE/INACTIVE/EXPIRED (EXPIRED is **computed on read**, never
  written), scheduling = `validDays[]` (empty = all days), `validTimeStart/End` (`HH:MM`, both required for
  the window to apply, **server-local time**), `startDate/endDate`. Availability (`isDealValidNow` + "no
  required item 86'd") is applied by the public `GET /api/deals/restaurant/:id/active` and re-enforced by
  the pricing engine at quote/charge time (`deal_inactive`). Customer pays `dealPrice × qty + modifier
upcharge` (REPLACES delta above the default, ADJUSTS at full price, clamped ≥ 0); the discount is baked
  into `dealPrice`, `savings` is display/analytics only. Counters `timesUsed/totalRevenue` increment **on
  payment** (`processDealStatistics`), not on create. Deletion is a **hard delete**. Max **10 ACTIVE**
  deals per restaurant (`MAX_ACTIVE_DEALS`), enforced only on `PATCH /status` and bulk auto-enable.
- **How chains change it.** `Deal.restaurantId XOR restaurantGroupId` (DB CHECK). Chain deals are created
  via `POST /api/chains/:gid/deals` (menu items must be chain-shared), are **on at every member** (no
  per-location opt-out), show up in every member's `/active` but **not** in the member's owner list
  (`GET /api/deals/restaurant/:id`), bypass the 10-cap, and are edited/deleted through the scope-agnostic
  `/api/deals/:dealId`. A chain member's per-restaurant Deals section is disabled ("Managed at chain
  level"). Chain form saves go through the fan-out confirm (suppressed per session after the first).
- **What is tested today.** 5 tests: TC-86/87 (tab reachable, Create Deal button), TC-195..197
  (single-slot builder → checkout enabled; incomplete deal blocks checkout; coupon blocked client-side).
  Nothing on: create/edit/delete/toggle in the UI, the dashboard table, filters, analytics, chain deals,
  the API contract, scheduling, sold-out handling, multi-slot deals, upcharges, the paid journey, stats.
- **Findings that outrank the plan (§1):** IDOR on **every** `/api/deals` route (confirmed live on QA
  for the reads); `MAX_ACTIVE_DEALS` bypassable via create and `PUT`; `PUT /:dealId` has **no** validation
  (price 0/negative accepted); the pricing engine **does** stack a coupon on a deal (docs say it never
  does — only wind blocks it, client-side); dashboard pagination not reset on filter; wind
  `DealsGridBlock` price/shape bug; bulk create forces `aiGenerated: true`.
- **Plan:** ~40 new tests, TC-325 → TC-364, three layers (§2), all seeded via the API, `test.fail()`
  pins for the §1 bugs so the nightly flips them when RestauNax fixes land. Time-restriction fields are
  **disabled in the form on purpose** (commit `011c5188`, 2026-01-09) → scheduling is Layer-1-only.

## 1. 🔴 Findings that outrank the test plan

Each becomes a `test.fail()` pin (unless marked "note only") so the nightly turns red-then-green when the fix lands.

1. **IDOR on every `/api/deals/*` route** — `requirePermission("MODIFY_RESTAURANT"|"VIEW_RESTAURANT")`
   checks a _global_ capability; no handler calls `userControlsRestaurant` (grep: zero hits in
   `controller/deal/`). `getDeal/updateDeal/deleteDeal/updateDealStatus/regenerateDealImage` look up by
   `dealId` only (`dealController.ts:422-424, 508-527, 722-727, 892-923, 776-781`); `createDeal`,
   `getDeals`, `getDealStats`, `getActiveDealsCount`, `bulkCreateDeals`, `generateDeals`,
   `getMenuItemsForDeals` accept any `restaurantId`. **Verified 2026-08-17 on QA:** the seed OWNER
   receives `200` for a foreign restaurant's deal list, stats and full menu. Every `USER`-role token has
   `VIEW_RESTAURANT`. The chain routes (`requireChainOwner`) are the counter-example. Same class as menu
   #601 → the fix is `assertControlsRestaurant` / a `Deal`-owner variant on every handler.
   → pins **TC-347..350** (second owner: read 403, mutate 403, create-on-foreign 403; positive control:
   chain route already 403).
2. **`MAX_ACTIVE_DEALS` bypass** — the 10-cap lives only in `updateDealStatus` (`dealController.ts:926-943`).
   `createDeal` never checks it (status defaults ACTIVE), `updateDeal` writes `status` unchecked (`:558`).
   → pins **TC-334** (11th create → expect 400) and **TC-335** (PUT `{status:"ACTIVE"}` at cap → expect 400).
3. **`PUT /:dealId` has no validation** — none of createDeal's checks are re-applied
   (`dealController.ts:504-714`): `dealPrice: 0`/negative, `validTimeStart: "9am"`, arbitrary `status`
   are accepted; a 0 price then flows into the engine as the authoritative charge.
   → pin **TC-336**.
4. **Coupon ⊥ deal is not enforced server-side** — `COUPON_RULES_AND_FREE_DELIVERY.md` says "the engine
   never prices both", but `pricingEngine.ts:174-220` computes `couponDiscount` from
   `subtotal = itemsSubtotal + dealsSubtotal` with no deal exclusion; only template-wind blocks it
   client-side (`CouponSection.tsx:235`). A POS/app/API caller can stack. Server-authoritative-pricing
   principle says the rule belongs in the engine. (The Dec-2024 QA stories US-005 describe stacking as a
   feature — that doc predates the rule and should be updated.)
   → pin **TC-343** (`/quote` with a deal + a % coupon → expect `couponDiscount = 0` / an issue).
5. **Dashboard pagination not reset on filter** — `page` only resets on rows-per-page change
   (`DealsDashboard.tsx:243-248`); on page 2, typing a search that matches ≤5 rows shows an empty table.
   → pin **TC-358**.
6. **template-wind `DealsGridBlock`** types deals as `discountedPrice`/cents and reads
   `response.data.data`; `/active` returns `dealPrice`/`originalPrice` in dollars under `deals` — the block
   never renders prices (`DealsGridBlock.tsx:16-18, 76, 145, 181`). Registered as `deals_grid` in
   `lazyRegistry.tsx:81`. **Note only** (no automation site page uses the block; file with the RestauNax
   PR / template-wind issue).
7. **`bulkCreateDeals` forces `aiGenerated: true`** (`dealData.aiGenerated || true`, `dealController.ts:1387`).
   → pin **TC-341** (bulk with `aiGenerated:false` → expect false).
8. **`OrderDeal` snapshot is client-supplied** (`buildOrderDealsData`, `orderController.ts:261-299`) while
   the charge is engine-authoritative; `processDealStatistics` and `usageTrend` read the snapshot's
   `dealPrice`, so a tampered body corrupts reported deal revenue (not the charge). **Note only** — needs a
   paid order to observe; raise in the RestauNax issue.
9. **Doc/story drift.** `QA_USER_STORIES_DEALS.md` still describes a per-slot "Required" toggle, category
   slots, a "Duplicate" action, date-range analytics filters and coupon stacking — none exist in the UI.
   `TEST_COVERAGE.md` has no Customer deal rows and says the deal helper "doesn't exist yet". Fixed in
   this batch's docs sweep.

Deliberate (not bugs, recorded so nobody re-files them): time/day/date restriction inputs and
Target Audience / Meal Type are **hard-disabled** in `DealForm` (commit `011c5188`, 2026-01-09) — the
backend still honours them, so scheduling is covered at Layer 1 only; `EXPIRED` is computed on read (a
past `endDate` on an ACTIVE deal shows "Expired" + a disabled switch); a deal image is AI-generated by a
worker (never assert `imageUrl` right after create); `getDeals.isAvailable` ignores day/time (only
status + endDate + stock) while `/active` applies the full window — the two can legitimately disagree.

## 2. The approach — three layers, not one

```
Layer 3  Storefront journey   owner toggles / prices / 86s a slot  ──►  wind "Today's Deals", builder, cart,
         (5 tests)            checkout, Stripe payment, stats            /quote + placed order + timesUsed

Layer 2  Owner UI             API-seeded deals  ──►  Manage Deals table, filters, sort, toggle, delete,
         (most tests)         Create/Edit form, cap banners, Analytics, AI smoke, chain shell + fan-out

Layer 1  API contract         owner JWT / anonymous hits /api/deals/*, /api/chains/:gid/deals*, /quote
         (fast, many)         validation, qty-1 invariant, availability window, pricing, stats, authz pins
```

**Why this split**

- The dashboard is a projection of `Deal` rows: seed exactly the deals a test needs (`createDealRaw`,
  new `updateDealRaw`, `setDealStatusRaw`) and assert the table on _those_ rows (name, "N items",
  `$price` + struck original, `X% off`, restrictions text, badge, "N times").
- Layer 1 pins the rules the UI can't reach: HH:MM regex, split-to-unit rows, availability window vs
  server time, required-slot-86 hides the deal, `/validate` reasons, quote charging `dealPrice × qty +
upcharge` (never the client's `dealPrice`), stats deltas, and every §1 authz/cap/validation pin.
- Layer 3 is the money proof: an owner-created multi-slot deal is offered on `/menu`, built at
  `/deals/:id`, priced by `/quote`, paid through Stripe, recorded on the order (`orderDeals`) and counted
  (`timesUsed`, dashboard "1 times", Analytics top table).

**Routes.** Per restaurant: `/restaurant/restaurantId/:id/restaurantManagement?tab=deals` (dashboard),
`?tab=create-deal` (form; also edit), `?tab=ai-deals`, `?tab=deal-analytics` — all deep-linkable (the
sidebar entries are a hover flyout; navigate by URL). Chain: `/chain/:groupId/restaurantManagement?tab=…`.
Storefront: `/menu` ("Today's Deals" section — renders nothing when empty), `/deals/:dealId` (builder,
auto-adds the deal), `/checkout`.

**Selectors that exist today:** ZERO `data-testid` in any Deals component. Stable hooks: `#deal-search`,
`#status-filter` (MUI select → `role=combobox`), `#deal-name`, `#deal-description`, `#deal-price`,
`#confirm-dialog-title`, item picker by placeholder "Search and add menu items…" (MUI Autocomplete,
self-clearing), snackbar text, and the MUI icon `data-testid`s (`MoreVertIcon`, `ExpandMoreIcon`,
`DeleteIcon`) for the unlabeled icon buttons. Wind: `data-testid="add-to-cart"` (also in deal mode),
`view-cart`. Everything else is text/role. POMs are testid-first with these fallbacks; the RestauNax fix
PR should add `deal-row`, `deal-status-switch`, `deal-row-menu`, `deal-row-expand`, `deal-item-remove`.

## 3. What the surface does vs. what's tested

Legend: ✅ proven · 🟡 touched · ❌ not covered · ⛔ not a feature / disabled on purpose

### 3.1 Manage Deals — `?tab=deals` (`DealsDashboard.tsx`)

| Behaviour                                                                                                                            | Today       |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| Heading "Manage Deals", "Create Deal" / "AI Generate Deals" buttons                                                                  | ✅ TC-86/87 |
| Stat cards Total / Active / Times Used / Total Revenue                                                                               | ❌          |
| Table: name (+AI chip, scope chip), "N items", `$deal` + struck `$orig`, `X% off`, restrictions, badge + switch, "N times", row menu | ❌          |
| Search (name/description), Status filter All/Active/Inactive/Expired, sort Name/Price/Savings/Usage, Refresh                         | ❌          |
| Row expand → "Deal Items" chips `1x Name ($p)`                                                                                       | ❌          |
| Toggle switch → `PATCH /status` + snackbar; expired → disabled + tooltip                                                             | ❌          |
| 8/10 and 10/10 alert banners; cap → warning snackbar (server message)                                                                | ❌          |
| Row menu Edit / Delete; delete confirm (title, 3 consequences, Confirm/Cancel)                                                       | ❌          |
| Empty state "No deals found" + "Create Your First Deal"                                                                              | ❌          |
| Pagination 5/10/25 (page-reset bug §1.5)                                                                                             | ❌          |
| Chain: "Chain"/"Location" chips, "across N chain locations", "View Analytics"; member shell disabled                                 | ❌          |

### 3.2 Create / Edit — `?tab=create-deal` (`DealForm.tsx`)

| Behaviour                                                                                                         | Today                   |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Name/Description, item Autocomplete (grouped, out-of-stock excluded), qty 1..10, remove, duplicate guard snackbar | ❌                      |
| Live Original Price / "Savings: $x (y% off)" / preview "Save y%" / ≥90% warning                                   | ❌                      |
| Validation: name required, price > 0, price < original; submit disabled with < 2 items                            | ❌                      |
| Create → `POST /restaurant/:id` → "Deal created successfully" → back to table                                     | ❌                      |
| Edit prefill, "Update Deal", `PUT /:id`, item ids re-created                                                      | ❌                      |
| Time restrictions / audience / meal type inputs                                                                   | ⛔ disabled by design   |
| Image regenerate (edit mode; AI worker)                                                                           | ⛔ not automated (paid) |
| Chain: fan-out confirm "Heads up — chain-wide change", "Create deal for all N locations"                          | ❌                      |

### 3.3 Deal Analytics — `?tab=deal-analytics` (`DealAnalytics.tsx`)

Metric cards (Total Deals, Active Deals, Total Revenue, Total Savings Given), Usage/Revenue summaries,
"Top Performing Deals" table (Rank/#1 chip), two empty states. Endpoint `GET /restaurant/:id/stats`. ❌

### 3.4 AI Generator — `?tab=ai-deals` (`AIDealsGenerator.tsx`)

3-step stepper; questionnaire from the **public, static** `GET /api/deals/ai/questions`; Generate is a
paid async job (`202 + jobId`) → **presence-only smoke**, never click Generate. ❌

### 3.5 Storefront (template-wind)

| Behaviour                                                                                           | Today                   |
| --------------------------------------------------------------------------------------------------- | ----------------------- |
| Builder auto-add, "0 of N items added", "Add to Deal", "Deal Complete!"                             | ✅ TC-195 (single slot) |
| Incomplete deal blocks checkout ("Complete Deals to Continue")                                      | ✅ TC-196               |
| Coupon blocked client-side with a deal in cart                                                      | ✅ TC-197               |
| "Today's Deals" section on `/menu`: card (Save %, Includes chips, struck price, View Deal)          | ❌                      |
| Multi-slot (qty > 1 → N slots), header "You save $", "Available: All days, All day"                 | ❌                      |
| Cart drawer "Active"/"Add items", `(+$x.xx)` upcharge, Order Summary "Part of deal", "Deal Savings" | ❌                      |
| Inactive/expired/out-of-schedule/86'd-required deal → absent + builder "Deal not found"             | ❌                      |
| Paid deal order → confirmation, `orderDeals` on the order, `timesUsed` +1, dashboard/analytics      | ❌                      |

### 3.6 Backend contract — rules a test can pin

Create: `400 "Missing required fields: name, dealPrice, and items"`, `400 "Deal price must be greater
than 0"`, `400 "Invalid time format for validTimeStart. Use HH:MM format (e.g., 09:00)"` (same for
`validTimeEnd`, `21:00`), `404 "Restaurant not found"`, `201 {success, message:"Deal created
successfully", deal}` with `status:"ACTIVE"`, `imageUrl:null`, items split to qty 1, `sortOrder` = index.
Status: `PATCH {status}` only ACTIVE/INACTIVE (`400 "Invalid status. Must be ACTIVE or INACTIVE"`), cap →
`400 {error:"MAX_ACTIVE_DEALS_REACHED", maxActiveDeals:10, currentActiveDeals}`; `active-count` →
`{activeDealsCount, maxActiveDeals:10, slotsAvailable}`. Update: patch semantics; `items` → delete +
recreate (ids change) and pricing recomputed. Delete: hard, `404` after. Public `/active`: only ACTIVE
within `startDate/endDate`, `validDays`, `HH:MM` window (server-local), no required item 86'd; unknown
restaurant → `200 []`; chain member → own + chain deals. Public `/validate`: `400 "Missing required
fields: dealId and restaurantId"`, `404 "Deal not found"`, `400 "Deal does not belong to this
restaurant"`, `200 {isValid, issues[], message:"Deal is valid"|"Deal validation failed: …"}` with reasons
`"Deal is not active"`, `"Deal is not available on <day>"`, `"Deal is only available between S and E"`,
`"<item> is out of stock"`, `"Please select an item for: <item>"`. Quote (`POST /api/order/:id/quote`,
public, legacy body `orderDeals[{dealId, quantity, items[{menuItemId, selectedModifiers}], upchargeAmount}]`):
`quote.deals[].{dealPrice, quantity, upcharge, lineTotal, savings}`, `dealsSubtotal`, `subtotal`;
foreign deal → `400 "One of the deals in your cart is no longer available."`; INACTIVE →
`"One of the deals in your cart is not currently available."`; client `dealPrice`/`upchargeAmount` ignored
when modifier ids are sent. Stats: `summary{totalCount, activeCount, totalTimesUsed, totalRevenue,
totalSavingsGiven, totalUpchargeRevenue, averageOrderValueWithDeals}`, `topDeals[]`, `usageTrend[]`,
`audienceDistribution[]`. Bulk: `400 "No deals provided"`, `201 {createdCount, enabledCount,
inactiveCount, maxActiveDeals}`. Chain: `POST /api/chains/:gid/deals` (`requireChainOwner` → 403 for a
non-owner), non-chain menu item → `400`.

## 4. Gap list, prioritised (proposed TCs start at TC-325)

### Layer 1 — API contract (`tests/dashboard/owner/api-deals.spec.ts`; owner JWT; each test seeds AUTO-prefixed deals on a per-file "Automation Deals <RUN_ID>" category and deletes them)

| TC  | Pins                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 325 | Create: 201 shape; server-computed `originalPrice/savingsAmount/savingsPercentage`; `status ACTIVE`; qty 2 → two qty-1 rows; `sortOrder`; `imageUrl null`                                          |
| 326 | Create validation: missing fields, price ≤ 0, bad `validTimeStart`/`validTimeEnd`, unknown restaurant → exact 400/404 strings                                                                      |
| 327 | Owner list: `computedStatus EXPIRED` for past `endDate`; `hasOutOfStockItem`/`isAvailable false` when a required item is 86'd; sorted `createdAt desc`                                             |
| 328 | GET `/:dealId` (404 unknown) · PUT patch semantics (name-only keeps items; new `items` → ids change, pricing recomputed)                                                                           |
| 329 | PATCH status round-trip + messages; invalid → 400                                                                                                                                                  |
| 330 | DELETE hard-deletes (GET 404, list shrinks); unknown → 404                                                                                                                                         |
| 331 | Public `/active` shape + filters: INACTIVE, past `endDate`, future `startDate`, `validDays` excluding today, 1-minute window 12 h away, all excluded; unknown restaurant → `200 []`                |
| 332 | `/active`: required item 86'd → deal disappears; restore → back                                                                                                                                    |
| 333 | Public `/validate`: 400/404/400 branches; valid → "Deal is valid"; INACTIVE → `isValid false` + "Deal is not active"; missing required slot → "Please select an item for: X"                       |
| 334 | 🔴 pin: 11th ACTIVE create at cap → expect 400 (the file's own throwaway tenant is the cap arena)                                                                                                  |
| 335 | Cap contract: `active-count` shape; PATCH at cap → `MAX_ACTIVE_DEALS_REACHED` (plain); 🔴 pin PUT `{status:ACTIVE}` at cap → expect 400                                                            |
| 336 | 🔴 pin: PUT `dealPrice: 0` / `validTimeStart: "9am"` → expect 400                                                                                                                                  |
| 337 | Quote: `dealPrice × qty`, `savings`, `dealsSubtotal`; client `dealPrice` tampering ignored                                                                                                         |
| 338 | Quote upcharge: ADJUSTS_PRICE modifier at full price; REPLACES_PRICE delta above default; downgrade clamped 0                                                                                      |
| 339 | Quote rejects: foreign restaurant's deal, INACTIVE deal (exact messages)                                                                                                                           |
| 340 | Stats endpoint shape + deltas (`totalCount`/`activeCount` after seeding 1 ACTIVE + 1 INACTIVE; `activeCount` ignores `validDays`)                                                                  |
| 341 | Bulk: `[]` → 400; two deals → 201 counts; 🔴 pin `aiGenerated:false` honoured                                                                                                                      |
| 342 | Public `GET /ai/questions` static shape (targetAudience, priceRange, mealType, occasion) — the AI generate route is never called                                                                   |
| 343 | 🔴 pin coupon ⊥ deal in the engine: `/quote` with a deal + AUTO % coupon → expect `couponDiscount 0`                                                                                               |
| 344 | Chain: `POST /api/chains/:gid/deals` → in `/active` at BOTH locations, absent from each member's owner list; quote at Loc B charges `dealPrice`; non-chain item → 400; delete via `/api/deals/:id` |
| 345 | Chain authz positive control: second owner on `/api/chains/:gid/deals` → 403                                                                                                                       |
| 346 | Unauthenticated → 401 on `GET/POST /restaurant/:id`, `PUT/DELETE/PATCH /:dealId`, `/stats`, `/ai/menu-items/:id`                                                                                   |
| 347 | 🔴 pin IDOR reads: second owner `GET /restaurant/<seed>`, `/stats`, `/ai/menu-items/<seed>`, `GET /:dealId` → expect 403                                                                           |
| 348 | 🔴 pin IDOR mutate: second owner `PATCH /:dealId/status` on the seed owner's AUTO deal → expect 403                                                                                                |
| 349 | 🔴 pin IDOR mutate: second owner `PUT /:dealId` → expect 403                                                                                                                                       |
| 350 | 🔴 pin IDOR: second owner `POST /restaurant/<seed>` (create on a foreign restaurant) and `DELETE /:dealId` → expect 403                                                                            |

### Layer 2a — Manage Deals table (`tests/dashboard/owner/11-deals.spec.ts` extended; POM `OwnerDealsPage` extended; seeds 6 deals per file: 4 ACTIVE incl. one with `validDays`/time window, 1 INACTIVE, 1 ACTIVE with past `endDate`)

| TC  | Pins                                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 351 | Table rows for the seeded deals: name, "N items", `$deal` + struck `$orig`, `X% off`, "All days"/"All day" vs `Mon, Wed`/`11:00 - 14:00`, badge, "0 times"; stat cards equal the API list counts   |
| 352 | Search by name / description / no match → "No deals found" + "Create Your First Deal"; Refresh re-fetches                                                                                          |
| 353 | Status filter Active / Inactive / Expired (expired row: "Expired" badge, switch disabled, tooltip "Cannot toggle expired deals")                                                                   |
| 354 | Sort by Price and Savings (asc/desc against the seeded numbers)                                                                                                                                    |
| 355 | Row expand → "Deal Items" chips `1x Name ($p)`                                                                                                                                                     |
| 356 | Toggle: Deactivate → `PATCH` 200 + "Deal deactivated successfully" + badge; Activate back                                                                                                          |
| 357 | Row menu → Delete → confirm dialog (title, 3 consequences) → Cancel keeps it; Confirm → `DELETE` 200 + "Deal deleted successfully" + row gone                                                      |
| 358 | 🔴 pin pagination: rows-per-page 5 → page 2 → search a page-1-only name → expect the row (bug: empty table)                                                                                        |
| 359 | Cap banners on the seed restaurant: bring ACTIVE to 8 → "You have 8 of 10"; to 10 → "Maximum active deals reached" + toggling an INACTIVE deal → warning snackbar with the server message; restore |

### Layer 2b — Create / Edit form (`11-deals.spec.ts`; POM `DealFormPage`)

| TC  | Pins                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 360 | Validation + live math: submit disabled < 2 items; duplicate item snackbar; empty name → "Deal name is required"; price 0 → "…greater than 0"; price ≥ original → "…less than original price"; "Original Price:", "Savings: $x (y% off)", preview "Save y%", ≥ 90 % warning |
| 361 | Create via UI: two seeded items, qty 2 on one, price → `POST` 201 → "Deal created successfully" → back on the table with the row; API shows 3 qty-1 rows and computed savings                                                                                               |
| 362 | Edit via row menu: "Edit Deal" prefilled (name/price/items) → rename, change price, remove one item, add another → `PUT` 200 → "Deal updated successfully" → row updated                                                                                                    |

### Layer 2c — Analytics, AI smoke, chain shell (`11-deals.spec.ts` + `17-chain-menu.spec.ts` sibling `18-chain-deals.spec.ts`)

| TC  | Pins                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 363 | Deal Analytics renders the four metric cards + summaries equal to `GET /stats` (`toFixed(2)`); "No deal usage data yet" or the top table row #1                                                                                                                     |
| 364 | AI Generator smoke: heading, 3 stepper labels, questions from `/ai/questions`, "Generate Deals" disabled → enabled after audience + price range, meal type disabled; **Generate never clicked**                                                                     |
| 365 | Chain shell `/chain/:gid/restaurantManagement?tab=deals`: API-seeded chain deal row with "Chain" chip, "across 2 chain locations", "View Analytics"; member Loc A shell: Deals disabled + "Managed at chain level" and `?tab=deals` shows the chain-managed message |
| 366 | Chain create via UI: form → "Create deal for all 2 locations" → fan-out confirm "Heads up — chain-wide change" → Continue → `POST /api/chains/:gid/deals` 201 → row; both storefronts list it (API `/active`)                                                       |

### Layer 3 — Storefront hand-off (`tests/customer/08-deals-handoff.spec.ts`; `page` anonymous + `ownerPage`)

| TC  | Pins                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 367 | "Today's Deals" on `/menu` shows the seeded card (name, `Save X%`, "Includes:" chips, struck original, deal price, "View Deal" → builder); owner toggles it OFF in the table → card gone; ON → back                                                                                                               |
| 368 | Multi-slot deal (item A ×2 + item B): builder header "Save X%", "You save $", "Available: All days, All day", "0 of 3 items added" → fill 3 → "Deal Complete!"; checkout summary "Part of deal" ×3, deal line, "Deal Savings"; `/quote` request carries `orderDeals` and the response `dealsSubtotal = dealPrice` |
| 369 | Modifier upcharge: slot item with an ADJUSTS_PRICE +2.00 modifier → cart line `(+$2.00)`, subtotal `dealPrice + 2`; quote agrees                                                                                                                                                                                  |
| 370 | Required slot item 86'd by the owner → deal absent from `/menu` and `/deals/:id` says "Deal not found"; restore → back                                                                                                                                                                                            |
| 371 | Paid journey: complete the multi-slot deal with the Stripe test card → confirmation; order (owner API) has `orderDeals[0].dealPrice`; `GET /stats.totalTimesUsed` +1; dashboard row "1 times"; Analytics top table lists it                                                                                       |

## 5. Layout, fixtures & decisions

```
tests/dashboard/owner/api-deals.spec.ts        # TC-325..350
tests/dashboard/owner/11-deals.spec.ts         # TC-86/87 + TC-351..364
tests/dashboard/owner/18-chain-deals.spec.ts   # TC-365..366 (chain fixture; serial)
tests/customer/08-deals-handoff.spec.ts        # TC-367..371
pages/dashboard/owner/OwnerDealsPage.ts        # extended: gotoTab(restaurantId, tab), table row API, filters, toggle, row menu, confirm, banners
pages/dashboard/owner/DealFormPage.ts          # name/price/items picker/qty/remove/submit/validation text/preview
pages/dashboard/owner/DealAnalyticsPage.ts     # metric cards, summaries, top table, empty states
pages/customer/CustomerDealPage.ts             # extended: menu section card, builder header, cart drawer/summary readers
utils/apiHelper.ts                             # + getDealApi, updateDealRaw, setDealStatusRaw, getActiveDealsCount, getDealStatsApi,
                                               #   getActiveDealsPublic, validateDealPublic, bulkCreateDealsRaw, createChainDealRaw,
                                               #   getChainDeals, getAiQuestionsPublic, quoteOrderRaw widened to orderDeals/couponId
```

**Fixtures.** No new persistent fixture: the seed restaurant hosts the UI + storefront deals (all AUTO-prefixed;
`globalTeardown.deleteAutomationDeals` remains the sweeper); the existing Automation Chain (`chainGroupId`,
Loc A/B) hosts chain deals; the **API file runs entirely on a per-run throwaway tenant** minted by
`createSecondOwner()` (admin-minted OWNER + restaurant, archived in `afterAll`; `OWNER2_*` env if present) —
that tenant is the isolated arena for the 10-cap tests and the seed OWNER is the cross-tenant intruder.
Chain deals are deleted through `/api/deals/:id`.

**Data hygiene.** Per-file `Automation Deals <RUN_ID>` category + items (hard-deleted via admin
`/permanent`), AUTO deals deleted in `afterAll` and swept by teardown; the storefront paid test uses the
Stripe test card exactly like TC-26 and leaves one real order (as TC-26 does). Never touch deals not
prefixed `AUTO`. Restore any 86'd item in `finally`.

**Reporting.** Allure features: "Deals API Contract", "Owner Deals", "Chain Deals", "Deals → Storefront".
`TEST_CASES.md`, `TEST_COVERAGE.md` (Owner + Customer rows), `TEST_PLAN.md`, `CLAUDE.md` helper table.

## 6. Build order

1. Helpers (`apiHelper.ts`) → 2. Layer 1 `api-deals.spec.ts` (surfaces backend surprises, files the
   RestauNax issue) → 3. Layer 2a/2b `11-deals.spec.ts` + POMs → 4. Layer 2c analytics/AI/chain →
2. Layer 3 `08-deals-handoff.spec.ts` → 6. Docs sweep, `graphify update .`, one PR (`feat/deals-coverage`).
