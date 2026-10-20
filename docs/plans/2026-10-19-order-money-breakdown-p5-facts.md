# Plan 5 fact sheet: cross-surface order-breakdown E2E (Automation)

Research date 2026-10-19. Read-only. Sources: Automation `origin/qa` (c3d7af4; the local `qa` checkout is 2 commits BEHIND, only add-on tests, so branch from `origin/qa`), restaunax `origin/qa` (7095a6160), template-wind `origin/qa` (525f198, breakdown PR #135 merged), template-lima `origin/qa` (22714b5, breakdown PR #117 merged), plus live read-only GETs against QA.
Paths below are relative to `/Users/neaj/Documents/restaunax-project/Automation/` unless they say otherwise. (I extracted origin/qa to the scratchpad `auto/` folder to read it. Nothing in the repo was touched.)

---

## 0. Headline findings (read first)

1. **A FREE_ITEM promotion and a combo cannot both apply to one order.** This is a product rule (restaunax `docs/features/PROMOTIONS.md` → "Which promotion wins" #3): "If the cart holds a combo/BOGO, order-level food promotions do not apply". FREE*ITEM is food-promotion type 6. FREE_DELIVERY \_may* ride with a food promotion or a bundle (#2, #3). Points and gift cards always co-apply (#6). The spec §9 reference example shows both together, but it is a render fixture and cannot happen as a real order. **So the test needs two orders:** A = free item, B = combo.
2. **Delivery through the storefront UI does not work on QA today.** In nightly #420 (~2026-10-17), TC-215 and TC-218 were _skipped_ with "Google Places returned no suggestion" (wind's address field needs a Places suggestion). The seed restaurant itself does allow delivery: `canAcceptDeliveries=true`, `pickupOnly=false`, `baseDeliveryFee=3.99`. The backend takes the delivery fee from the client (`deliveryFact` in placeOrder, "still client-supplied … until a server-pinned OrderQuote replaces it"). So the DELIVERY_FEE / FREE_DELIVERY lines can only be reached by **API** (quote, or an API-placed order), not through the wind UI.
3. **Points have no existing helper and no POM.** The seed restaurant has a reward program (`GET /api/rewards/restaurant/<seed>/preview`): `rewardProgramId f6d37f5e-1907-4382-b195-723e12050a53`, 100 pts = $5, minimum 100, 1 pt/$, no welcome bonus. Giving a fresh customer a balance needs the admin CSV import (§2c). Redeeming in wind means OTP sign-in in the checkout `RewardSection`, which no page object covers yet.
4. **Only one automatic SPEND free-item offer may run on the seed restaurant: `customer/10-promotions`** (TEST_PLAN.md → Parallel Execution). The new test must use a **BUY_ITEM-triggered** FREE_ITEM on its own per-run item (it then only touches carts that contain that item), or a CODE free item. It must also keep the cart **under $55**, so wind's own spend offer can't compete for it.
5. **Real Stripe checkouts are flaky on QA.** In nightly #420, TC-26 and TC-178 failed waiting for "Order Confirmed!"; TC-844 passed in the same run. Gift-card _purchase_ tests are `fixme` because of Stripe Radar hCaptcha. A gift card that covers the **whole** order is a known product bug (TC-177 fixme: the $0 remainder still tries a PaymentIntent). **Always use a partial gift card.**
6. **Every surface already renders the breakdown with stable hooks** (§4). Every surface prints negatives as `−$x.xx` (U+2212). The dashboard uses `Intl` (thousands comma); wind/lima use `toFixed` (no comma). Normalise both before comparing.
7. **The confirmation email only goes out after a real payment.** It is sent from `orderPostPaymentService.ts:887`. The tablet `send-receipt` route needs `paymentStatus=COMPLETED`. An API-seeded order (`createSeededOrder`, no Stripe) gets **no email**. So the email surface is only reachable from a Stripe-paid order.

---

## 1. Suite layout, projects, auth, env, data hygiene

**Playwright projects** (`playwright.config.ts`): `dashboard` (testDir `tests/dashboard`, baseURL FRONTEND_URL), `customer` (`tests/customer`, wind), `customer-lima` (`tests/customer-lima`, LIMA_ORDERING_URL default `https://order.qa.restaunax.com`), `pos` (`tests/pos`, API-only, no browser).

- `fullyParallel: false`: a spec FILE is the isolation unit. CI runs `workers: 2` with `retries: 1`; local runs use `workers: 3`. Test timeout is 90 s, expect timeout 10 s.
- POMs navigate with absolute `TEMPLATE_WIND_URL`, so a wind checkout can run from any project. Precedent: `tests/dashboard/owner/06b-orders-journey.spec.ts` uses `page` for wind and `ownerPage` for the dashboard in ONE test ("customer → owner through-lines … only Orders tests that need a real Stripe checkout"). **Recommended home: `tests/dashboard/owner/27-order-breakdown.spec.ts`** (or `06c-…`). The `dashboard` project runs in the nightly and manual runs only. A file under `tests/customer/` would also run on **every wind QA deploy** (`template-deploy` → `--project=customer`), placing real orders each time.

**Auth**

- Owner/admin/employee browser sessions come from `globalSetup` → `owner-auth.tmp.json` etc. The fixtures in `fixtures/base.ts` are `ownerPage`/`ownerContext`, `adminPage`, `employeePage`, and `pageForRole(role)`.
- API tokens: `apiLogin(email, password)` → `{accessToken, userId, role, …}` (POST `/login`). Raw tokens have **no refresh** and a 15-minute TTL: re-login if a test runs longer than about 10 minutes.
- Tablet: `createTabletDevice(ownerToken, rid, name)` → `{id, name, code}` (names are globally unique, so use `generateRunId()`). Then `tabletLogin(name, code)` → JWT. In `afterAll`, call `deactivateTabletDevice(ownerToken, rid, device.id)`, because there is no delete. Pattern: `tests/pos/01-order-lifecycle.spec.ts:46-62`.
- Customer: guest checkout needs no auth. Members sign in by OTP. **On QA, `ENABLE_SMS` is off, so ANY phone verifies with `123456`** (memory `project_qa_env_otp_and_sms`, verified 2026-09-20 on `/login/mobile/*`). `5555550100` is the reviewer number that works in every environment. TC-L50 is skipped on QA because that number is not enrolled.

**Env** (`.env`, CLAUDE.md → Environment Variables): `FRONTEND_URL=https://app.qa.restaunax.com`, `BACKEND_URL` (default `https://api.qa.restaunax.com`), `TEMPLATE_WIND_URL=https://wind.restaunax.com`, `TEMPLATE_WIND_RESTAURANT_ID` = `SEED_RESTAURANT_ID` = `5f12beef-c34c-4316-a601-d228eaa3b2ef`, `LIMA_ORDERING_URL`, `MAILPIT_BASE_URL=https://mail.qa.restaunax.com` (+ `MAILPIT_UI_USER/PASSWORD`), `TEST_EMAIL_DOMAIN=demomailtrap.co`, plus `OWNER_*` / `ADMIN_*` credentials. The local `.env` has no Mailpit and no employee credentials, so `@email` steps skip locally (memory `automation_parallel_agent_runs`). Verify those via `gh workflow run e2e.yml --ref <branch>`.

**Seed restaurant facts (live GET 2026-10-19)**

- `published`, `stripeChargesEnabled`, `acceptingOrders`, `businessType RESTAURANT`.
- Tax 8.75%. `passProcessingFeeToCustomer=false`. Dual pricing off.
- Gift cards enabled, min $5, `canCombineWithCoupons: true`.
- Reward program as in §0.3.

**Test data, naming, cleanup**

- `utils/testData.ts` exports:
  - `generateRunId()` (8-char uuid)
  - `generateCouponCode()` (AUTO-prefixed)
  - `generateUserEmail(label)`
  - `generateSeedPhone()` (NANP-valid: the backend NULLs `555000…`)
  - `readRestaurantId()`, `readSharedState()`
  - `recordGiftCardForCleanup(id)`
  - `TEMPLATE_WIND_URL`
- `globalTeardown.ts` sweeps:
  - `AUTO*` coupons and deals on the seed restaurant (promotions are swept first)
  - "Automation Menu …" / "Test Starters …" groups
  - chain `AUTO*` promotions
  - recorded users
  - recorded gift cards, which it **freezes** (there is no delete)
  - Teardown errors are logged and never fail the run.
- Orders have **no delete API**: they stay on QA permanently, so assert on your own rows. Reward members created by an import also stay (use a fresh phone each run).
- Group name to use: `Automation Menu Breakdown <runId>`. Coupon names: `AUTO … <runId>`. Coupons have no name column: the name is sent as `description` (`CouponPromotionBody.name`).
- **Contract** (TEST_PLAN.md → Parallel Execution): own your data, restore anything you mutate in a `finally`, never mutate rows another file asserts on.
- **Accepted overlap:** tax tests change the seed tax mid-run. So assert money **against the server's recorded values** (one GET of the order's `breakdown`), never against a hand-computed sum.

**10-active-deal cap.**

- Seed baseline is about 5 real ACTIVE deals, which leaves about 5 slots for all files together.
- Create deals with `createDealApiCapSafe(token, rid, name, dealPrice, items, extra)`, which waits for a free slot (about 150 s).
- Delete the deal in the **test's `finally`**, never in `afterAll`. Pattern: `withStorefrontDeal` in `utils/promotionFixtures.ts:543-581`.
- Raise the test timeout with `DEAL_SLOT_TEST_TIMEOUT_MS` (from apiHelper).
- **Add a row to TEST_PLAN.md's footprint table** ("A new file touching deals on the seed restaurant must add its row here").
- Note: a deleted Deal does not remove the DEAL_SAVINGS info line. That line filters `OrderDeal.removedAt`, not deal deletion (`orderBreakdown/buildTotals.ts:169-177`). The label uses the stored `dealName`.

**Parallel caveats** (memory `automation_parallel_agent_runs`)

- Worktree agents start from ancient local `main`: give them the base SHA (`origin/qa` c3d7af4).
- Concurrent LOCAL runs sabotage each other, because each `globalTeardown` sweeps every automation group. Judge results by a single full run or by CI.
- Chained-state files need `test.describe.configure({ mode: "serial" })`.

**Chain/menu gotchas** (memory `project_chain_menu_gotchas`)

- Wind hides out-of-stock items.
- The item modal is inert on unpublished restaurants.
- Public `/quote` refuses a restaurant with no tax rate (`ensureTaxRate`).
- None of these bite on the seed restaurant.
- Avoid the Automation Chain locations entirely.

**Next free TC id on origin/qa: TC-898** (highest used is TC-897). Re-check before committing, because other open branches may claim numbers. TC ids are globally unique, and TEST_CASES.md needs the new rows.

---

## 2. Helpers that exist (exact signatures)

**a) Promotions** (`utils/promotionsApi.ts`)

- `createCouponPromotion(token, restaurantId, body: CouponPromotionBody)` → `{id,…}`. Body fields:
  - `type`: `"PERCENTAGE"|"FIXED_AMOUNT"|"FIXED_ITEM"|"FREE_DELIVERY"|"ITEM_SALE"|"FREE_ITEM"`
  - `applyMode` defaults to **CODE**, so a code-less promotion must send `"AUTOMATIC"`
  - FREE_ITEM: `giftMenuItemId`, `triggerKind: "SPEND"|"BUY_ITEM"`, `triggerMenuItemId`, `triggerMenuGroupId`, `minOrderAmount`
  - FREE_DELIVERY requires `minOrderAmount` plus a fee cap `maxDiscount` (guardrail)
  - Dates default to yesterday .. +30 days
- `promotionQuote(restaurantId, intent, customerToken?)` → `PromotionQuote` (`amountToCharge, subtotal, appliedPromotion{couponId,title,savings}, freeItemOffer, deals[], codeIssue, raw`). It uses the engine-intent shape and **ignores deliveryFee**.
- `redeemCode`, `listPromotions`, `setPromotionStatus`, `deletePromotionRaw`, `tabletPricePreview(tabletToken, staffSession, body)`.
- Legacy coupon create: `createCouponRaw(token, rid, {...})` in apiHelper, used by 07-free-delivery and 02-checkout.

**b) Deals / combo** (`utils/promotionFixtures.ts`, `utils/apiHelper.ts`)

- `seedStorefrontPromotions(token, rid, runId, partial, {label, withFreeItem})`. It seeds the seed-restaurant menu set: saleItem $10, platter $20, gyroA/B, burger $12 (+ Large/Bacon), gift $4, a 50% ITEM_SALE, an optional SPEND free item, and a 15%-off code. **Do NOT reuse it with `withFreeItem: true`** (§0.4). It is also heavier than this test needs.
- `withStorefrontCombo(ctx, fn)` runs the CODE-only combo platter+burger for $25 for the duration of `fn`, deleting it in `finally`. Savings: 20+12−25 = $7, so DEAL_SAVINGS = $7.00. `StorefrontCombo = {dealId, name, code, platterSlotId, burgerSlotId}`.
- `createPromotionDeal(token, rid, body)`: throwaway tenants only, not cap-safe.
- `slotId(deal, sortOrder)`.
- `cleanupStorefrontPromotions(token, created)` → `string[]` failures. It deletes deals, then coupons, then items, then the category.
- Cap-safe create: `createDealApiCapSafe(token, rid, name, dealPrice, items[{id,name,price}], extra)`.
- Menu: `createMenuGroupNamed(token, name, {restaurantId})`, `createMenuItemFull(token, groupId, name, price, opts)`.

**c) Points / reward balance: NO helper in Automation.** The backend path:

- Route: `POST /api/admin/restaurants/:id/bulk-upload-customers`, ADMIN/EMPLOYEE token (`routes/admin/adminRestaurantRoutes.ts:151-155`; router-level `requireAuth` + `requireRole(["ADMIN","EMPLOYEE"])`).
- Request: multipart `file` (`.csv`) plus `uploadType=reward_members` (that is the default).
- CSV headers: `Name, Email, Phone, Created, Last Ordered On, Following Email, Following SMS, Points Remaining`. `Name` and `Phone` are required (`controller/admin/bulkCustomerController.ts:21-30, 221`).
- Imported points land **once per member** (a prior import is skipped, :375-394), so use a fresh `generateSeedPhone()` each run.
- Mirror the multipart pattern of `seedFundedGiftCard` (raw `fetch` + `FormData`, apiHelper.ts:2483-2527).
- Program rules: 100 pts → $5.00, minimum 100.
- Redemption: wind checkout `RewardSection` (template-wind `src/components/checkout/RewardSection.tsx`). After OTP sign-in it lists "Use N points" options (`pointsPerRedemption` multiples, value ≤ order total, needs `restaurantPermissions.canRedeemPoints`). Checkout then sends `appliedRedemption {pointsToRedeem, redemptionValue, rewardMemberId}` (page.tsx ~1283).
- **There is no POM.** Build one by exploring with playwright-cli, per memory `feedback_playwright_cli_for_testing`; no blind selectors.
- The breakdown line label includes the points ("Rewards (100 pts)" style, from `pointsToRedeem`).

**d) Gift card**

- `seedFundedGiftCard(adminToken, restaurantId, amount)` → `{id, code, initialBalance, currentBalance, status}`. It uses the admin CSV import with an `AUTOGC…` code. Then call `recordGiftCardForCleanup(card.id)`.
- Pattern: `tests/customer/02-checkout.spec.ts:531-535`. The public purchase endpoint can no longer seed cards (it needs a succeeded PaymentIntent).
- Checkout POM: `applyGiftCard(code)`, `assertGiftCardApplied()`.
- Use a **partial** balance (TC-178 pattern; TC-177 full coverage is a fixme product bug).

**e) Delivery-capable order**

- UI: `isDeliveryAvailable()`, `selectDelivery()`, `fillDeliveryAddress(q)`, `firstAddressSuggestion()`, `assertDeliveryQuoteResolved()`. All of these are blocked on QA (Places returns no suggestion).
- API: `createSeededOrder(ownerToken, rid, item, {orderType:"DELIVERY", deliveryFee, deliveryAddress, …})`. It honours `deliveryFee` for DELIVERY orders above 0. It retries with fee 0 on a tax-policy 400 and reports this as `deliveryFeeApplied:false`.
  - It sends **no coupon, no deals, no gift card and no points**, places the order without Stripe, then bumps it INITIALIZED→CONFIRMED. So: no email, and paymentStatus is not COMPLETED.
- For a free-delivery and combo API order, use `placeOrderRaw(rid, body)` (raw POST `/api/order/new/restaurantId/:id`) followed by `updateOrderStatus(ownerToken, id, "CONFIRMED")`. This is **unproven** for FREE_DELIVERY + orderDeals + deliveryFee; probe it live first.
- Quote-only alternative: `quoteOrderRaw(rid, {orderItems, orderDeals, couponId, orderType:"DELIVERY", …})`. Its typed body lacks `deliveryFee`; wind sends `deliveryFee` in this legacy shape, so extend the type. The response carries `quote.breakdown` (restaunax `controller/order/pricingController.ts:333-343`).

**f) Placing a paid order (wind)** — `pages/customer/CustomerCheckoutPage.ts`

1. `seedCartItems(rid, [{menuItemId,name,price,quantity}])` or `seedCartWithDeal(rid, {id,name,dealPrice,originalPrice,slots[{dealItemId,menuItemId,name,price}]}, extras)`.
2. `applyCoupon(code)` / `assertCouponApplied(code,title)`, `freeItemOfferButton()`, `promotionLine(title)`, `selectTipPreset(%)`.
3. `fillCustomerInfo(first,last,email,phone)` → `selectPickup()` → `clickProceedToPayment()` → `assertPaymentSectionVisible()`.
4. `fillStripeCard(STRIPE_CARDS.VISA_SUCCESS)` → `completeOrder()`.
5. `createCustomerOrderConfirmationPage(page).assertConfirmed()`.
6. Get the order id from the URL `/order-confirmation/<uuid>` (see `tests/customer/10-promotions.spec.ts:580-625`, TC-844).

`utils/quoteTracker.ts` provides `trackQuotes(page)`, `.latest()`, `expectShownMatchesLatestQuote(readTotal, quotes)`. The `PageQuote` type lacks `breakdown`; extend it with `body.quote.breakdown`.

Lima: `pages/lima/LimaCheckoutPage.ts` has coupon, gift card, `placeOrder`, `assertOrderConfirmed`, and **no points**.

---

## 3. Mailpit

`utils/emailHelper.ts`: `waitForEmail(toEmail, {subjectPattern?, timeoutMs=30_000, pollIntervalMs=2_000, notBefore?})` → `{id, subject, to_email, from_email, created_at, html_body, text_body}`.

- The shared inbox is **never DELETEd**.
- Matching is on the exact recipient address, client-side.
- A per-worker `Created` baseline plus 60 s of skew tolerance keeps old mail out.
- Use a unique recipient per test: `generateUserEmail("breakdown")`.
- Skip the email step when `MAILPIT_BASE_URL` is unset (06b pattern, :321-330).
- Tag the test title with `@email` (a selector, not an exclusion). Do not tag it `@smoke`.

**Customer confirmation subject** (restaunax `src/locales/en/email.json:3`): `"Your Order Confirmation - {{restaurantName}} (Receipt #{{orderNumber}})"`. Match on `/Your Order Confirmation/` and the receipt number, with `timeoutMs: 60_000`.

Email body: rendered from the breakdown (`Service/email/breakdownEmailContext.ts`). Labels are passed through unchanged. Money uses `formatCurrency` with negatives as `−$x.xx`. Parse `html_body` (or `text_body` if present) for label/amount pairs.

---

## 4. Surfaces: where each breakdown is read

| Surface           | How to get it                                                                                                                                                                                                                                                 | Hook                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend order     | `getOrderByIdRaw(ownerToken, id)` → `GET /api/order/:id`; add `breakdown` to its type                                                                                                                                                                         | `data.breakdown` (`MoneyBreakdown`: items/totals/info/refunds?)                                                                                                                                                                                                 |
| Backend anonymous | `fetch(${BACKEND_URL}/api/order/${id}?receipt=${receipt})` (06b:262) gives the full body; a bare id gives a stripped body with a breakdown that **masks code-only titles** (orderController ~773-806). Give promotions real names so labels match everywhere. | `.breakdown`                                                                                                                                                                                                                                                    |
| Checkout quote    | page's `POST /api/order/:rid/quote` (trackQuotes) or `quoteOrderRaw`                                                                                                                                                                                          | `quote.breakdown` (item keys are quote line keys: compare by kind/label/amount, not key)                                                                                                                                                                        |
| Wind checkout     | `OrderSummary.tsx`                                                                                                                                                                                                                                            | `data-testid="breakdown-{section}-{kind}"`, `checkout-total`                                                                                                                                                                                                    |
| Wind confirmation | `/order-confirmation/<id>` (reads `?receipt=` or sessionStorage `order-receipt:<id>`)                                                                                                                                                                         | `order-breakdown-{totals\|refunds\|info}-{KIND}`, `order-breakdown-item-{key}`; label span + amount span (`components/orders/BreakdownParts.tsx:86-131`)                                                                                                        |
| Lima confirmation | `/<slug>/order-confirmation/:orderId`; receipt only from tenant sessionStorage (no URL param)                                                                                                                                                                 | same testids (`components/Orders/BreakdownParts.tsx`)                                                                                                                                                                                                           |
| Dashboard dialog  | `createOwnerOrdersPage(ownerPage).gotoOrderDetail(rid, orderId)` (deep link `?tab=Orders&detailOrderId=`)                                                                                                                                                     | `moneyRow(label)` = label `<p>` + following-sibling `<p>` amount. Server labels now have **no colon**. Items: `itemRow(name)`. Info lines are captions. Source: restaunax `restaunax-frontend/src/components/OrderStatistics/OrderBreakdownSections.tsx:54-114` |
| POS list          | `getCurrentOrders(tabletToken, rid)` → `GET /api/order/restaurants/:rid/orders/current` (tablet JWT, or owner with MODIFY_RESTAURANT)                                                                                                                         | each order `.breakdown` (orderController 1247-1262)                                                                                                                                                                                                             |
| POS search        | `tabletRaw(tabletToken, "GET", "/orders/search?q=<receipt>")` (no dedicated helper)                                                                                                                                                                           | `.breakdown`, **totals only** (no item lines on result lists, `tabletOrderSearchController.ts:105-125`)                                                                                                                                                         |

Line kinds and order (spec §4): SUBTOTAL → PROMOTION → POINTS → CASH_DISCOUNT → DELIVERY_FEE → FREE_DELIVERY → SERVICE_FEE → AUTO_GRATUITY → TAX → TIP → PROCESSING_FEE → **TOTAL** (emphasis) → GIFT_CARD → STORE_CREDIT → **CHARGED**. Info: DEAL_SAVINGS. Zero lines are omitted.

**Invariants to assert:**

- (a) the items' amounts sum to SUBTOTAL; the FREE gift line keeps its regular amount, with marker `FREE`
- (b) the totals lines up to TOTAL sum to TOTAL
- (c) TOTAL − tenders = CHARGED
- For a web order, `Order.total` is **net**, so CHARGED = `order.total`

Use the backend breakdown as the single oracle and deep-compare each surface's (kind, label, amount) list to it. POS JSON can be `toEqual`. Normalise U+2212 and commas when reading the UI.

No breakdown assertions exist anywhere in the suite yet. The `breakdown` hits in `api-pay-at-table.spec.ts` are a different `ShareBreakdown`.

---

## 5. What fits in one test vs. split (recommendation)

**Order A — one real Stripe wind order, pickup** (covers PROMOTION, FREE marker, POINTS, TAX, TIP, TOTAL, GIFT_CARD, CHARGED on all six surfaces):

- Per-run group with 2 items:
  - a paid item about $20
  - a gift item about $4
- FREE_ITEM coupon: `AUTOMATIC`, `triggerKind:"BUY_ITEM"`, `triggerMenuItemId`=paid item, `giftMenuItemId`=gift, named `AUTO … <runId>`.
- Cart under $55. Click the free-item offer button (TC-840 pattern).
- OTP sign-in with a fresh phone pre-imported with 100–200 pts, then apply "100 points = $5".
- Gift card $5 (partial). Optional 15% tip preset.
- Pay with VISA_SUCCESS.
- Assert in this order:
  1. the checkout quote breakdown (pre-pay)
  2. GET order breakdown (owner + receipt)
  3. the wind confirmation
  4. the dashboard dialog
  5. POS current + search
  6. the Mailpit email (`@email`)
- Every surface should show the same lines, and the invariants (a)–(c) should hold.

**Order B — combo DEAL item + DEAL_SAVINGS** (cannot share an order with the free item):

- Preferred: a second wind Stripe pickup order using the CODE-only combo via `withStorefrontCombo`-style helpers (cap-safe, deleted in `finally`, `DEAL_SLOT_TEST_TIMEOUT_MS`), with `seedCartWithDeal` + code.
- It can reuse the same reward member (leftover points) or a fresh gift card, to also prove POINTS/GIFT_CARD beside a deal.
- Asserts the item `children` plus DEAL_SAVINGS "You saved $7.00 with …" on every surface. The dashboard and wind render info lines as captions/banners.

**FREE_DELIVERY / DELIVERY_FEE:** do not drive them through the UI on QA (Places is blocked).

- Cheapest real coverage: an API-only step. Use `quoteOrderRaw` with `orderType:"DELIVERY"`, `deliveryFee` and a FREE_DELIVERY coupon. The coupon needs AUTOMATIC, or `couponId` for a CODE coupon (min $1, cap ≥ fee). Assert that `quote.breakdown.totals` has `DELIVERY_FEE +x` then `FREE_DELIVERY −x`.
- Optionally use `placeOrderRaw` DELIVERY + `updateOrderStatus` to add a placed delivery order. This is backend/dashboard/POS/wind-confirmation only, with no email; probe it live first.
- Otherwise leave it to the backend table tests (spec §8 already lists them) and say so in the spec header.

**Smallest set still covering the brief's must-haves:**

| Kind          | Covered by     |
| ------------- | -------------- |
| PROMOTION     | A              |
| POINTS        | A              |
| GIFT_CARD     | A              |
| CHARGED       | A              |
| DEAL item     | B              |
| FREE_DELIVERY | API quote step |

Two Stripe orders total. Use one file, `mode: "serial"`, with both orders in one `test` (or two tests sharing `beforeAll` seeds), and `test.setTimeout` of about 4–5 minutes (Stripe plus deal slot).

**Open risks to probe with playwright-cli before writing:**

- the wind RewardSection OTP sign-in selectors and whether a just-imported member shows `canRedeemPoints`
- whether a BUY_ITEM AUTOMATIC FREE_ITEM offers its button on wind like SPEND does
- the breakdown label text for POINTS and the free item
- Stripe flakiness, Link/hCaptcha (TC-26/TC-178 red on #420)
- lima confirmation can't be deep-linked without tenant sessionStorage, so skip lima or seed `order-receipt:<id>` in the tenant namespace; wind is enough for "customer page"
- dashboard/wind/lima deploy state on QA (PRs merged to qa; confirm deployed before trusting reds)

---

## 6. Running

- Commands:
  - `npm test`
  - `npx playwright test tests/dashboard/owner/<file> --project=dashboard`
  - `-g "TC-898"`
  - `npm run test:email` (`--grep @email`)
  - `npm run test:smoke` (`@smoke` lane: never put this test there — no Stripe, no email allowed)
  - `npm run typecheck`, `npm run lint`, `npm run format:check`
  - Reports: `npm run report:html` / `npm run report` (Allure, needs Java)
- CI (`.github/workflows/e2e.yml`, the only Playwright workflow; `concurrency: qa-e2e`, never cancelled):
  - nightly 06:00 UTC runs the full suite and publishes to `nightly/`
  - `qa-deploy` dispatch runs the **@smoke** lane only (no Pages publish)
  - `template-deploy` from a **template-wind** qa push (`notify-e2e.yml`) runs **`--project=customer` only** and publishes to `wind-deploy/`. Lima has no dispatch.
  - manual `workflow_dispatch` takes `grep` / `project` (all|dashboard|customer|customer-lima|pos)
- **Allure subfolder rule:** each suite must keep its own `subfolder` (`nightly/`, `wind-deploy/`), because simple-elf's keep_reports cleanup deletes non-numeric siblings. Don't remove the `sudo rm -rf allure-history/.git` step, `force_orphan: true`, or the trace-zip strip.
- Hosted report: https://restaunax.github.io/Automation/nightly/ (latest #420).
- Allure labels convention: `allure.label("feature", …)`, `allure.label("severity","critical")`, `allure.step`, `allure.parameter("orderId", …)`.
- Docs to update with the test: TEST_CASES.md (new TC rows), TEST_PLAN.md deal-footprint table (Order B's combo), and TEST_COVERAGE.md.
- Memory says PRs target `qa` (`--base qa`, branch from `origin/qa`). Neaj merges. Automation has CI (`static.yml` on PRs).
