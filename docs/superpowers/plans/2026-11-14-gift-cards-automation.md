# Gift Cards Plan F2 — Automation (Playwright) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Automation suite proves owner gift card management end to end against QA: the new owner, chain and tablet routes (scope, IDOR, manager access, capability refusals, cash-out eligibility, the roll-forward identity), the web Gift cards section and chain shell, Payouts without gift card blocks, and gift card disputes. Every existing spec whose contract changed is updated in place, never duplicated.

**Architecture:** API specs on per-run throwaway tenants (`createSecondOwner` / `ownerWithRestaurants` / a throwaway chain), following `tests/pos/16-gift-cards.spec.ts`. UI specs drive a fresh owner through `loginViaUi`, with a new page object. Everything is gated by one release flag, `ownerGiftCards`, until the RestauNax PR carrying gift card plans A + B + web is on QA. Then the flag flips and a missing feature fails instead of skipping.

**Tech Stack:** Playwright + TypeScript, `allure-js-commons`, `utils/apiHelper.ts` raw wrappers, Stripe test tokens through the publishable key (`stripePublicRaw`), Mailpit (`@email`).

**Spec:** RestauNax repo `docs/superpowers/specs/2026-11-14-owner-gift-cards-design.md`. Its **API contract** is RestauNax `docs/superpowers/plans/2026-11-14-gift-cards-B-backend-features.md` → "API contract" (routes R1–R14 / G / T1–T10, types, error codes, day-close fields). Books changes are in `…-A-money-correctness.md` (Tasks 8, 11, 12). Read all three before starting. Field names and codes below are copied from them.

## Global Constraints

- **Branch / worktree:** `feat/owner-gift-cards` from `origin/qa`, at `/Users/neaj/Documents/restaunax-project/Automation/.claude/worktrees/owner-gift-cards`. One PR into `qa` at the end. No push until Neaj asks.
- **Replace, don't duplicate.** A changed contract is changed in the spec that already asserts it (Task 6 lists them). New behaviour gets new TCs. No test may assert something that is no longer true.
- **TC numbers:** the highest TC anywhere (all branches + worktrees, 2026-11-14) is **TC-1981**. This plan uses **TC-2000 … TC-2046**, leaving headroom. Before writing, re-run `for b in $(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes/origin); do git grep -hoE "TC-(19[89][0-9]|20[0-9]{2})" $b -- tests docs; done | sort -u`. If anything in 2000–2046 is taken, shift this plan's block to the next free hundred and keep the order.
- **Gate:** `RELEASED_ON_QA.ownerGiftCards` (starts `false`). Every new test starts with `requireRelease("ownerGiftCards", present)`. Every modified old test uses `releasePresent("ownerGiftCards", present)`, so its old half keeps running on today's QA.
- **QA constraints:**
  - QA targets `api.qa.restaunax.com` / `app.qa.restaunax.com`.
  - **No Stripe hosted Checkout** (its hCaptcha blocks automation). Every card payment here is a PaymentIntent confirmed through the publishable key (`stripeConfigRaw()` → `pk`; `stripePublicRaw(pk, "POST", "/payment_methods", { type: "card", "card[token]": "tok_visa" })` → `/payment_intents/:id/confirm`), as `utils/comboFoodSurfaces.ts` does.
  - **A card-tender POS sale needs a Stripe Terminal reader**, so it is API-only up to PaymentIntent creation. The capability refusal is checked before the intent exists, which is testable.
  - **The POS and Owner app UIs are not driven here.** The POS is tested at the API (`pos` project). Owner-app UI belongs to its Maestro flows (the Owner and device-in-store plans).
  - **The 30-day cash-out wait can't be fast-forwarded.** Assert the refusal and `eligibleAt`. The eligible path is proven with cash-funded and imported cards.
  - **Early fraud warnings can't be produced on demand** in test mode through the publishable key: no known `tok_…` gives a `radar.early_fraud_warning`. EFW stays unit-tested in RestauNax (Plan A Task 4). See Unresolved.
  - **Disputes** come from `tok_createDispute`. Stripe opens the dispute a few seconds after the charge. QA's own Stripe webhook delivers it, and specs poll ≤ 120 s. When `stripeTestModeReady()` (E2E*STRIPE*\* set), fall back to `fireStripeEvent("charge.dispute.created", chargeId)` if polling times out.
- **Money:** gift card fields are dollars (`Float`). Compare with `toBeCloseTo(x, 2)` or exact cents via `Math.round(x*100)`.
- **Never assert a full card code on a screen or in a JSON body**, except the CSV exports. Every owner/tablet JSON body is checked with `expect(JSON.stringify(body)).not.toContain(fullCode)`.
- **Resolved text:** `statusText`, `reasonText`, history `label`, refusal `error` are checked with `looksLikeKey(...) === false` (`utils/backOfficeApi.ts`).
- **Cleanup:**
  - tenants: `deleteTestRestaurant` in `afterAll` with `.catch(() => {})`;
  - devices: `deactivateTabletDevice`;
  - batches: `freezeGiftCardBatchRaw`;
  - seeded cards: `recordGiftCardForCleanup`;
  - chains: unlink, then delete their restaurants.

  Nothing touches the persistent "Automation Chain" fixture.

- **Static checks before each commit:** `npm run typecheck && npm run lint && npm run format:check && npm run test:unit`. Run the touched spec with `npx playwright test <file> --project=<dashboard|pos>`. Before the flag flips it must **skip with the gate's reason**, not fail.
- **Commits:** `test(automation): …`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A manager's gift card screen loads.** The web Overview and Reports may call only manager-admitted routes (R1, R2, R9, R10). A screen that also loads `config` or `roll-forward` answers 403 to a manager, which the "screens never 403" rule forbids. Test: TC-2036 calls exactly those four as the manager and expects 200. TC-2045 opens the page as the manager in a browser and expects no 403 in the network log.
2. **Selling switched off must not stop spending.** With `isEnabled:false`, the public purchase intent is refused, but a seeded card still validates and pays. Test: TC-2005.
3. **A probed id answers like a missing one.** An owner asking for another restaurant's card id (owner routes), or a tablet looking up another tenant's code, gets exactly the same status + `code` as for a random id. Tests: TC-2001 (owner), TC-2024 (tablet).
4. **A double-tapped cash-out pays once.** Same `idempotencyKey` → 200 `alreadyExisted:true`, same `transactionId`, drawer expected cash lowered once. Test: TC-2030 + TC-2031.
5. **The chain's books tie.** Chain summary totals equal the sum of its locations, every location's roll-forward `difference` is 0 after a cross-location spend, and the holder's OWED row names the sibling. Tests: TC-2017–TC-2019.

> **Align with the web plan (2026-11-14):** the web plan now exists at `restaunax/docs/superpowers/plans/2026-11-14-gift-cards-C-web-dashboard.md` (tab key `gift-cards`, subtabs via `?section=`, card drawer via `?card=`). The page object follows the web implementation's tab key and test ids, not this plan's proposals. Plan B's _Contract amendments_ also apply: refusals carry `code` + `errorCode`; the drawer loads list includes `CASHED_OUT` rows; T10 accepts `managerPin`; `/sell` never refuses a sale approved on its PaymentIntent.

---

## File map

| File                                                                                         | Change                                                                                   |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `utils/releaseGate.ts`                                                                       | flag `ownerGiftCards`, REASON text, `probeOwnerGiftCards`                                |
| `utils/giftCardOwnerApi.ts` (new)                                                            | raw wrappers for R/G/T routes, `buyGiftCardOnline`, `disputeGiftCardOnline`, pure checks |
| `utils/employerApi.ts`                                                                       | `ownerWithRestaurants` also returns `email`, `password` (additive)                       |
| `tests/unit/giftCardOwnerApi.helper.spec.ts` (new)                                           | pure helpers                                                                             |
| `tests/dashboard/owner/api-gift-cards-owner.spec.ts` (new)                                   | TC-2000…2012                                                                             |
| `tests/dashboard/owner/api-gift-card-disputes.spec.ts` (new)                                 | TC-2047…2049                                                                             |
| `tests/dashboard/owner/api-gift-cards-chain.spec.ts` (new)                                   | TC-2015…2023                                                                             |
| `tests/pos/25-gift-card-care.spec.ts` (new)                                                  | TC-2024…2033                                                                             |
| `tests/dashboard/access/manager-role.spec.ts`                                                | TC-1551 list + new TC-2034…2036                                                          |
| `tests/pos/16-gift-cards.spec.ts`                                                            | TC-1059, TC-1061, TC-1065 updated                                                        |
| `tests/dashboard/owner/api-books-taxes.spec.ts`                                              | TC-1612 year-end label                                                                   |
| `tests/dashboard/journey/07-numbers-agree.spec.ts`                                           | TC-1038 drawer shape                                                                     |
| `pages/dashboard/owner/OwnerGiftCardsPage.ts` (new)                                          | POM                                                                                      |
| `tests/dashboard/owner/41-gift-cards-ui.spec.ts` (new)                                       | TC-2037…2045                                                                             |
| `tests/dashboard/owner/api-gift-cards-chain.spec.ts`                                         | + chain shell UI TC-2046                                                                 |
| `docs/COVERAGE_MAP.md`, `TEST_PLAN.md`, `tests/pos/README.md`, `CLAUDE.md` (utilities table) | index the new specs/utils                                                                |

---

### Task 1: Gate, API wrappers and pure helpers

**Files:**

- Modify: `utils/releaseGate.ts` (`RELEASED_ON_QA`, `REASON`, a new probe beside `probeBooksOffboarding`)
- Create: `utils/giftCardOwnerApi.ts`
- Modify: `utils/employerApi.ts` (`ownerWithRestaurants` return type)
- Test: `tests/unit/giftCardOwnerApi.helper.spec.ts`

**Interfaces:**

- Produces:

```ts
// releaseGate.ts
RELEASED_ON_QA.ownerGiftCards: boolean; // false until RestauNax feat/owner-gift-cards is on QA
export async function probeOwnerGiftCards(ownerToken: string, restaurantId: string): Promise<boolean>; // GET /api/gift-cards/restaurants/:rid/reports/summary → 200

// giftCardOwnerApi.ts
type Scope = { restaurantId: string } | { groupId: string };
export function ownerGiftCardRaw<T = LooseJson>(token: string, scope: Scope, method: "GET"|"POST"|"PUT", path: string, body?: unknown, lang?: "en"|"es"): Promise<RawResponse<T>>;
//   prefix /api/gift-cards/restaurants/:rid or /api/gift-cards/groups/:gid; sends restaurantHeader for R; Accept-Language when lang set
export function ownerGiftCardCsvRaw(token: string, scope: Scope, query?: string): Promise<{ status: number; headers: Headers; text: string }>;
export function tabletGiftCardRaw<T = LooseJson>(tablet: string, session: string | undefined, method: "POST"|"PUT", path: string, body?: unknown): Promise<RawResponse<T>>; // = tabletRaw with "/gift-cards" prefix
export async function buyGiftCardOnline(pk: string, restaurantId: string, amount: number, opts?: { cardToken?: "tok_visa" | "tok_createDispute"; recipientEmail?: string }): Promise<{ code: string; giftCardId: string; paymentIntentId: string }>;
//   POST /api/stripe/gift-card-payment-intent {amount, restaurantId} → clientSecret; tok → payment_method → confirm (publishable key);
//   POST /api/gift-cards/purchase {paymentIntentClientSecret, amount, restaurantId, deliveryMethod: recipientEmail ? "EMAIL" : "LINK", recipientEmail}
//   (copy the body the QA sim sends: RestauNax docs/features/back-office/how-it-works/08-qa-run-a-day.md "Gift card online")
export const isMaskedCode: (s: string) => boolean;            // /^\*{4}-\*{4}-\*{4}-[A-Z0-9]{4}$/
export const rollForwardTies: (rf: { startBalance: number; endBalance: number; difference: number; lines: Record<string, number> }) => boolean;
//   cents(start) + Σ cents(lines) === cents(end) && cents(difference) === 0
export const sumMoneyCounts: (xs: { amount: number; count: number }[]) => { amount: number; count: number }; // amount rounded to cents
```

- [ ] **Step 1: Write the failing unit test** `tests/unit/giftCardOwnerApi.helper.spec.ts`:

```ts
test("isMaskedCode accepts only the masked shape", () => {
  expect(isMaskedCode("****-****-****-AB12")).toBe(true);
  expect(isMaskedCode("AXBR-7K4M-QW9P-2LFN")).toBe(false);
  expect(isMaskedCode("AXBR7K4MQW9P2LFN")).toBe(false);
});
test("rollForwardTies uses cents, not floats", () => {
  expect(
    rollForwardTies({
      startBalance: 50,
      endBalance: 34,
      difference: 0,
      lines: {
        sold: 25,
        voidedLoads: -25,
        spent: -20,
        refundedToCards: 5,
        cashedOut: -30,
        importedOpening: 30,
        corrections: -1,
      },
    })
  ).toBe(true);
  expect(
    rollForwardTies({
      startBalance: 0.1,
      endBalance: 0.3,
      difference: 0,
      lines: { sold: 0.2 },
    })
  ).toBe(true);
  expect(
    rollForwardTies({
      startBalance: 0,
      endBalance: 40,
      difference: 6,
      lines: { sold: 34 },
    })
  ).toBe(false);
});
test("sumMoneyCounts", () => {
  expect(
    sumMoneyCounts([
      { amount: 0.1, count: 1 },
      { amount: 0.2, count: 2 },
    ])
  ).toEqual({ amount: 0.3, count: 3 });
});
```

- [ ] **Step 2: Run** `npm run test:unit -- giftCardOwnerApi`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the helpers, wrappers, flag (`ownerGiftCards: false` with a doc comment naming RestauNax `feat/owner-gift-cards`: plans A + B + web), REASON (`"Owner gift cards (RestauNax feat/owner-gift-cards) are not on this environment yet — /api/gift-cards/restaurants/:id/reports/summary answers 404"`) and the probe. Extend `ownerWithRestaurants` to return `email: tenant.email, password: tenant.password` (additive; existing callers unaffected).
- [ ] **Step 4: Run** `npm run test:unit && npm run typecheck && npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** — `test(automation): owner gift card API helpers and release gate`

---

### Task 2: Owner routes on a standalone restaurant — `api-gift-cards-owner.spec.ts` (TC-2000…2011)

**Files:**

- Create: `tests/dashboard/owner/api-gift-cards-owner.spec.ts`

**Interfaces:**

- Consumes: Task 1; `createSecondOwner(adminToken, runId, { alwaysFresh: true })`, `stripeTestOnboardingRaw`, `stripeConfigRaw`, `seedFundedGiftCard`, `freezeGiftCardApi`/`unfreezeGiftCardRaw` (admin), `createGiftCardBatchRaw`, `freezeGiftCardBatchRaw`, `getOwnerGiftCardSummaryRaw` (legacy), `validateGiftCardPublicRaw`, `waitForEmail`, `looksLikeKey`.

Setup (serial, `beforeAll`, 240 s):

- tenant **A**: fresh owner, Stripe TEST onboarded, published, open. The owner sets the config itself through `PUT config` (route R8): `isEnabled: true, allowCashFunding: true, allowPhysicalActivation: true`. If that call 404s, the gate skips.
- Cards on A:
  - `imported`: `seedFundedGiftCard(admin, A, 30)`;
  - `web`: `buyGiftCardOnline(pk, A, 50, { recipientEmail: <run>@TEST_EMAIL_DOMAIN })`;
  - a batch of 2 stock cards.
- tenant **B**: a second fresh owner with one `seedFundedGiftCard(admin, B, 10)`.

- [ ] **Step 1: Write the tests** (each starts `requireRelease("ownerGiftCards", await probeOwnerGiftCards(ownerA, A))`):
  - **TC-2000 list and detail show masked codes and resolved text.**
    - `GET cards` → `total ≥ 2`. Every item: `isMaskedCode(displayCode)`, `heldHere: true`, `heldBy.id === A`, `looksLikeKey(statusText) === false`.
    - `GET cards?search=<last4 of web>` finds exactly the web card.
    - `GET cards/:web` → `history[0].kind === "SOLD"`, `channel === "WEBSITE"`, `tender === "CARD"`, `amount === 50`, `balanceAfter === 50`, `label` resolved, `canResend: true`.
    - The imported card's history has `kind: "IMPORTED"`.
    - Neither body contains the full code.
  - **TC-2001 another owner's cards: 403 on the scope, 404 on the id, same as a missing card.**
    - Owner B on `GET /restaurants/A/cards` and `/reports/summary` → 403 `code: "FORBIDDEN"`.
    - Owner B on `GET /restaurants/B/cards/<A's web id>` → 404 `CARD_NOT_FOUND`, and the body equals the body for a random uuid.
    - No token → 401.
    - Same 404 on B's freeze / resend / recipient for A's id.
  - **TC-2002 owner freezes and unfreezes; no money moves.**
    - Empty reason → 400 `REASON_REQUIRED`. `" funding_disputed "` → 400 `INVALID_REASON`.
    - `"Customer lost it"` → 200, `status: "FROZEN"`, `freeze: { origin: "OWNER", canLift: true, reasonText: "Customer lost it" }`. Again → 409 `ALREADY_FROZEN`.
    - `reports/summary.owed` unchanged (owner-frozen is still owed) and `onHold.amount === 0`.
    - Unfreeze → `ACTIVE`, `freeze: null`. Again → 409 `NOT_FROZEN`.
    - Balance still 50. History has `FROZEN` and `UNFROZEN` rows with `amount: 0`.
  - **TC-2003 a RestauNax freeze can't be lifted by the owner.**
    - Admin `freezeGiftCardApi(imported)` → owner detail `freeze: { origin: "ADMIN", canLift: false }`.
    - Owner unfreeze → 403 `FREEZE_NOT_LIFTABLE`, `error` = "Only RestauNax can lift this hold" (EN).
    - Admin unfreezes in `finally`.
  - **TC-2004 @email resend and change recipient.**
    - `POST cards/:web/resend` → `{ sentTo: <recipient> }`, and Mailpit gets a gift card email to it within 60 s.
    - `PUT recipient { recipientEmail: "nope" }` → 400 `INVALID_EMAIL`.
    - Valid new address → `sentTo` new, `card.recipientEmail` new, history gains `RECIPIENT_CHANGED`, Mailpit gets an email at the new address.
    - Owner freezes, then resend → 409 `CARD_NOT_SENDABLE`, then unfreeze.
  - **TC-2005 settings save, validate, and selling off never stops spending.**
    - `GET config` → `{ level: "RESTAURANT", editable: true }`.
    - `PUT { presetDenominations: [25, 25] }` → 400 `INVALID_CONFIG`, with `error` naming the presets field.
    - `PUT { presetDenominations: [20, 40, 60], minCustomAmount: 10, maxCustomAmount: 300 }` → read back equal.
    - `PUT { isEnabled: false }` → `POST /api/stripe/gift-card-payment-intent` refused (4xx), while `validateGiftCardPublicRaw(imported.code, A)` is still valid.
    - Restore `isEnabled: true` in `finally`.
  - **TC-2006 what's owed, from the cards actually held.**
    - `reports/summary` → `owed: { amount: 80, count: 2 }`, `ofWhichImported: { amount: 30, count: 1 }`, `onHold: { amount: 0, count: 0 }`, `legacyPlatformHeld: { amount: 0, count: 0 }`, `unsoldStockCount: 2`.
    - Legacy `GET …/summary` still answers its old shape (`outstandingBalance`, `cardCount`, `importedBalance`, `importedCardCount`, `isChainWide`). This is the compat pin for old Owner-app builds.
  - **TC-2007 activity for today.**
    - `reports/activity?from=<localToday>&to=<localToday>` → `sold.website: { amount: 50, count: 1 }`, `sold.total: { amount: 50, count: 1 }` (an import is not a sale), `spent.total.amount: 0`, `cashedOut.amount: 0`.
    - `from > to` → 400 `INVALID_RANGE`. A 400-day span → 400 `INVALID_RANGE`.
  - **TC-2008 the monthly roll-forward ties to the live balance.**
    - `reports/roll-forward` → `isCurrentPeriod: true`, `lines.sold: 50`, `lines.importedOpening: 30`, `endBalance === summary.owed.amount + summary.onHold.amount`, `rollForwardTies(rf) === true`.
    - Next month → 400 `INVALID_RANGE`.
  - **TC-2009 unsold stock by batch.** `reports/stock` → the batch row `{ quantity: 2, unsold: 2, activated: 0 }`, `totals.unsold ≥ 2`.
  - **TC-2010 a restaurant outside a chain has no settlement.** `reports/settlement` → `balance: 0`, `entries: []`, `totals: { owed: 0, earned: 0 }`.
  - **TC-2011 answers come back in the caller's language.** With `lang: "es"`, list `statusText` and detail history `label` differ from the EN answer and are not keys. A refusal (`INVALID_REASON`) `error` is Spanish.
- [ ] **Step 2: Run** `npx playwright test tests/dashboard/owner/api-gift-cards-owner.spec.ts --project=dashboard`. Expected today: every test SKIPPED with the gate reason.
- [ ] **Step 3: Run against a stack with the feature** (QA after deploy, or a local backend with `BACKEND_URL` pointed at it), flag still false. Expected: PASS. Fix the spec, never the assertion values, unless the RestauNax contract says otherwise.
- [ ] **Step 4: Static checks** (Global Constraints).
- [ ] **Step 5: Commit** — `test(automation): owner gift card routes — scope, freeze, resend, settings, reports (TC-2000..2011)`

---

### Task 3: Gift card disputes — `api-gift-card-disputes.spec.ts` (TC-2047…2049)

**Files:**

- Create: `tests/dashboard/owner/api-gift-card-disputes.spec.ts`

Setup: fresh tenant, Stripe TEST onboarded, gift cards on. `card = buyGiftCardOnline(pk, rid, 60, { cardToken: "tok_createDispute" })`. Poll `GET /api/disputes/restaurant/:rid` every 5 s for ≤ 120 s until a row has `giftCard.id === card.giftCardId`. On timeout: if `stripeTestModeReady()`, fire `charge.dispute.created` for the intent's charge and poll 30 s more. Otherwise fail with "QA did not deliver charge.dispute.created for <pi> within 120 s".

- [ ] **Step 1: Write the tests:**
  - **TC-2047 (planned as TC-2012) a stolen-card gift card purchase lands on the restaurant that holds the card.**
    - The dispute row has `giftCard: { id, maskedCode }` with `isMaskedCode(maskedCode)`.
    - `GET /api/disputes/:id` (owner) answers 200 with the same `giftCard`.
    - The card detail shows `status: "FROZEN"`, `freeze.origin: "SYSTEM"`, `freeze.reason: "FUNDING_DISPUTED"`, `freeze.canLift: false`, `reasonText` resolved and not the code.
  - **TC-2048 (planned as TC-2013) the disputed money is on hold, not owed, and only RestauNax lifts it.**
    - `reports/summary` → `onHold: { amount: 60, count: 1 }`, `owed.amount: 0`.
    - Owner unfreeze → 403 `FREEZE_NOT_LIFTABLE`.
    - Roll-forward `rollForwardTies` still true (a freeze moves no money).
  - **TC-2049 (planned as TC-2014) the owner's Disputes screen shows the gift card.** UI via `loginViaUi(browser, tenant.email, password)`: `/restaurant/restaurantId/:rid/subscription?section=disputes` lists a row containing the masked code's last 4 and the amount `$60.00`. Opening it shows the gift card, not an order number. Use role/text locators. If the web plan ships test ids, switch to them in the POM (`OwnerGiftCardsPage.disputeRow`).
- [ ] **Step 2–5:** as Task 2 (skip today → pass on a feature stack → static checks → commit `test(automation): gift card disputes are attributed to the holder (TC-2047..2049)`).

---

### Task 4: Chain scope — `api-gift-cards-chain.spec.ts` (TC-2015…2023, UI TC-2046 added in Task 7)

**Files:**

- Create: `tests/dashboard/owner/api-gift-cards-chain.spec.ts`

Setup (serial, 300 s):

- `ownerWithRestaurants(admin, runId, { count: 2, features: [] })` → locations **A**, **B**, one owner. `adminCreateChain(admin, A, "Auto GC chain <run>")` → `gid`, then `adminLinkRestaurantToChainRaw(admin, gid, B)`.
- Chain config via the owner's `PUT /api/gift-cards/groups/:gid/config { isEnabled: true, allowCashFunding: true, allowPhysicalActivation: true }`.
- On each location: tax 7%, a $12 Burger (its own menu group), a REGISTER device (`createTabletDevice` by admin), owner PIN (`setOwnerPosPin`), staff session, an open drawer with $100.
- At A: `POST /gift-cards/sell { amount: 50, tender: "CASH", deliveryMethod: print-only (copy TC-1059's body), idempotencyKey }` → `card` (full code from the sale response).
- At B: a $12.84 open check paid `settle-gift-card` with `card.code` for 12.84 (TC-1064's pattern). Card balance 37.16.
- A stranger tenant **S** (fresh owner, one restaurant).
- `afterAll`: deactivate both devices, unlink B, delete A, B and S.

- [ ] **Step 1: Write the tests:**
  - **TC-2015 settings for chain cards are edited at chain level only.**
    - `GET /restaurants/B/config` → `{ level: "CHAIN", editable: false }`.
    - `PUT /restaurants/B/config` → 403 `CONFIG_IS_CHAIN_LEVEL`.
    - `GET /groups/gid/config` → `{ level: "CHAIN", editable: true }`.
  - **TC-2016 any location finds the whole chain's cards and says who holds the money.**
    - `GET /restaurants/B/cards` contains the card with `heldHere: false`, `heldBy: { id: A }`, `soldAt.id === A`. With `?heldHere=true` it doesn't.
    - `GET /restaurants/A/cards?heldHere=true` contains it with `heldHere: true`.
    - `GET /groups/gid/cards` items all `heldHere: false`.
  - **TC-2017 a card sold at A and spent at B is A's money and B's sale.**
    - A's `reports/activity` (today) → `sold.posCash: { amount: 50, count: 1 }`, `spent.atOtherLocations` = `[{ id: B, name: <B name>, amount: 12.84, count: 1 }]`, `spent.here.amount: 0`.
    - A's `reports/summary.owed.amount` = 37.16.
    - B's `summary.owed.amount` = 0. The chain's `legacyPlatformHeld.amount` = 0.
    - Card history: the spend row has `location.id === B`.
  - **TC-2018 chain settlement names the sibling on each side.**
    - A's `reports/settlement` has an entry `{ kind: "OWED", amount: 12.84, otherLocation.id: B, card.displayCode masked }` and `totals.owed: 12.84`.
    - B's has `{ kind: "EARNED", amount: -12.84, otherLocation.id: A }` and `totals.earned: 12.84`.
    - `balance` equals the sum of that location's entries when no `PAYOUT_APPLIED` row exists. If one does (a payout ran mid-test), assert only the OWED/EARNED rows.
  - **TC-2019 the chain view adds up its locations.**
    - `groups/gid/reports/summary`: `totals.owed` = Σ `byLocation[].owed` (`sumMoneyCounts`).
    - `reports/activity`: `totals.sold.total` = Σ locations.
    - `reports/roll-forward`: every `byLocation[]` and `totals` satisfy `rollForwardTies`.
    - `reports/settlement.byLocation`: A `{ totals.owed: 12.84 }`, B `{ totals.earned: 12.84 }`.
  - **TC-2020 nobody outside the chain reaches it.**
    - Owner S on every G route (`cards`, `config`, `reports/summary`, `export.csv`) → 403 `FORBIDDEN`.
    - S on `GET /restaurants/S/cards/<card id>` → 404 `CARD_NOT_FOUND`.
  - **TC-2021 the chain CSV is the one place the full code appears.** `ownerGiftCardCsvRaw(owner, { groupId })` → 200, `content-disposition` attachment, `parseCsv` finds a row whose code equals `card.code` (sanitized) and balance 37.16.
  - **TC-2022 a chain card frozen at one location shows frozen at the register of another.**
    - The owner freezes via `/restaurants/B/cards/:id/freeze { reason: "Reported stolen" }` → origin `OWNER`.
    - The A tablet `POST /gift-cards/lookup { code }` → `freeze: { reasonText: "Reported stolen", canLift: true }` (additive field). `POST /gift-cards/details` → `status: "FROZEN"`, `cashOut.refusal.code: "FROZEN"`.
    - Unfreeze via A.
  - **TC-2023 a sibling can't cash out a card whose money A holds.**
    - B tablet `details` → `cashOut: { eligible: false, refusal.code: "CASH_OUT_WRONG_HOLDER" }`, `heldBy.id === A`.
    - B `POST /gift-cards/cash-out { giftCardId, idempotencyKey, expectedAmount: 37.16 }` → 409 `CASH_OUT_WRONG_HOLDER`, and B's drawer expected cash unchanged.
- [ ] **Step 2–5:** as Task 2. Commit `test(automation): chain gift cards — find anywhere, holder money, settlement, chain reports (TC-2015..2023)`.

---

### Task 5: POS find a card, capabilities and cash-out — `tests/pos/25-gift-card-care.spec.ts` (TC-2024…2033)

**Files:**

- Create: `tests/pos/25-gift-card-care.spec.ts`

Setup (serial, 240 s, TC-1059's harness):

- fresh tenant, Stripe TEST onboarded, gift cards on with cash + physical; a REGISTER device.
- People:
  - owner (PIN 8462; MANAGER membership, holds every capability);
  - **Dee**: STAFF, defaults;
  - **Rae**: STAFF with `capabilityRevokes: ["SELL_GIFT_CARDS"]`;
  - **Sam**: SHIFT_LEAD with `capabilityGrants: ["MANAGE_GIFT_CARDS"]`.

  Mint the three through `createPinStaffTabletRaw` and sign each in.

- Open drawer with $100.
- Cards:
  - `cashCard`: Dee sells $25 cash, print-only;
  - `webCard`: `buyGiftCardOnline(pk, rid, 40)`, card-funded today;
  - `importedCard`: `seedFundedGiftCard(admin, rid, 15)`.
- Stranger tenant T with one seeded card (`strangerCode`).

- [ ] **Step 1: Write the tests:**
  - **TC-2024 any signed-in staff member finds a card, and an unknown or foreign code answers the same 404.**
    - Dee `POST /gift-cards/details { code: cashCard.code }` → 200, `isMaskedCode(displayCode)`, `heldHere: true`, `history[0].kind: "SOLD"` with `performedBy` "Dee S.", `statusText` resolved, and the body does not contain the code.
    - The web card: `recipient.emailMasked` matches `/^.\*\*\*@/`.
    - `strangerCode` and a random 16-char code both → 404 `NOT_FOUND` with identical bodies.
  - **TC-2025 lookup still answers what old registers read, plus `freeze`.** `POST /gift-cards/lookup { code: cashCard.code }` keeps `usableHere`, `activatable`, `reloadable`, `cashCapRemaining`, presets, and adds `freeze: null`.
  - **TC-2026 a cashier who may not sell is stopped before any money moves.**
    - Rae `/sell { amount: 20, tender: "CASH", … }` → 403 `{ code: "GIFT_CARD_PERMISSION_REQUIRED", capability: "SELL_GIFT_CARDS" }`, `error` = "You don't have permission to sell or reload gift cards. Ask a manager.". The drawer's `GET /gift-cards/loads?sessionId=` list and expected cash are unchanged.
    - Rae `/activate` on a stock card → same 403.
    - Rae `POST /terminal/create-gift-card-payment-intent { amount: 20, restaurantId }` with her session → 403, no `clientSecret`.
    - Same call **without** `X-Staff-Session` → 200 with a `clientSecret` (kiosk / old build unchanged). Cancel that intent through the backend if a cancel route exists, otherwise leave it (an uncaptured intent expires).
    - Rae `/sell` + `{ managerPin: "8462", approverStaffMemberId: owner.id }` → 201.
    - Dee `/sell` $20 cash → 201 (default STAFF behaviour unchanged on deploy).
  - **TC-2027 freezing needs `MANAGE_GIFT_CARDS`; a shift lead with the grant may.**
    - Dee freeze → 403 `capability: "MANAGE_GIFT_CARDS"`.
    - Sam freeze `{ reason: "Customer called" }` → 200, `freeze.origin: "STAFF"`, `canLift: true`.
    - Dee + manager PIN unfreeze → 200 `ACTIVE`.
  - **TC-2028 resend needs selling rights; changing the recipient needs managing rights.**
    - Dee resend on webCard → `{ sentTo }` masked (`/\*\*\*@/`).
    - Dee `PUT /gift-cards/:id/recipient` → 403 `MANAGE_GIFT_CARDS`.
    - Sam → 200 with the new masked address.
  - **TC-2029 which balances can be cashed out now.**
    - `details` for cashCard → `cashOut: { eligible: true, amount: 25 }`.
    - importedCard → `eligible: true, amount: 15`.
    - webCard → `eligible: false, refusal.code: "CASH_OUT_TOO_SOON"`, `refusal.eligibleAt` on the restaurant-local day 30 days after the purchase (compare `YYYY-MM-DD` with `addDays(localToday, 30)`). `refusal.text` mentions 30 days and is not a key.
  - **TC-2030 cash-out pays the whole balance once.**
    - Dee `POST /gift-cards/cash-out` → 403.
    - Owner without `idempotencyKey` → 400 `IDEMPOTENCY_KEY_REQUIRED`.
    - `expectedAmount: 20` → 409 `BALANCE_CHANGED` with `currentBalance: 25`.
    - Correct body → 201 `{ amount: 25, balance: 0, status: "DEPLETED", alreadyExisted: false, receipt: { displayCode masked, amount: 25, title resolved } }`.
    - Same key again → 200 `alreadyExisted: true`, same `transactionId`.
    - A new key → 409 `NOT_ACTIVE`.
    - The owner route `GET /api/gift-cards/restaurants/:rid/cards/:id` shows `CASHED_OUT` −25 in history.
    - webCard cash-out → 409 `CASH_OUT_TOO_SOON` with `eligibleAt`.
  - **TC-2031 the drawer expects the cash that left.** The drawer status (`GET` register session, `openRegisterSessionPos`'s sibling reader) has `giftCardCashOuts: 25` and expected cash = 100 + 25 + 20 + 20 − 25 = **140** (cash sales: Dee 25, Rae-with-PIN 20, Dee 20; cash-out 25). Close the drawer counted at 140 → over/short 0.
  - **TC-2032 the day close lists gift cards sold and cashed out, apart from sales.**
    - `GET /restaurant/:rid/daily-close` (owner) → `giftCardsSold: { cash: { amount: 65, count: 3 }, card: { amount: 0, count: 0 }, total: { amount: 65, count: 3 }, voided: { amount: 0, count: 0 }, cashedOut: { amount: 25, count: 1 } }`, `cash.giftCardCashOutTotal: 25`, `cash.giftCardCashOutCount: 1`.
    - No gift card amount in the sales totals or `byMethod`. The web card is not a POS card sale, so `card` stays 0.
  - **TC-2033 cash-out needs an open drawer.** After the close, owner cash-out of importedCard → 409 `REGISTER_NOT_OPEN`.
- [ ] **Step 2–5:** as Task 2 with `--project=pos`. Commit `test(automation): POS find a card, gift card capabilities and cash-out (TC-2024..2033)`.

---

### Task 6: Update the existing specs whose contract changed

**Files:**

- Modify: `tests/dashboard/access/manager-role.spec.ts` (TC-1551; new TC-2034…2036; header comment)
- Modify: `tests/pos/16-gift-cards.spec.ts` (TC-1059, TC-1061, TC-1065; header comment)
- Modify: `tests/dashboard/owner/api-books-taxes.spec.ts` (TC-1612)
- Modify: `tests/dashboard/journey/07-numbers-agree.spec.ts` (TC-1038)

- [ ] **Step 1: Edit the assertions.**
  - **manager-role TC-1551.** The `toEqual([...])` list gains `"giftCards"` after `"reports"`: `const hasGc = releasePresent("ownerGiftCards", caps.includes("giftCards"))`, then compare with the list with or without it. Keep the existing `announcements` filter.
  - **manager-role, new TCs.** In `beforeAll`, seed one card `seedFundedGiftCard(admin, rid, 20)` (only when the probe is true). Then:
    - **TC-2034 a manager finds, freezes and resends gift cards.** 200 on R1 `cards`, R2 detail, R9 `reports/summary`, R10 `reports/activity`. Freeze → `freeze.origin: "STAFF"`. Resend on a card with no email → 400 `NO_EMAIL` (that is a contract answer, not an access refusal). The owner unfreezes in `finally`.
    - **TC-2035 a manager can't reach the owner's gift card controls.** 403 `MANAGER_NOT_ALLOWED`, in the request language, on: unfreeze, `PUT recipient`, `GET config`, `PUT config`, `reports/roll-forward`, `reports/stock`, `reports/settlement`, `export.csv`, legacy `…/summary`, `GET /groups/<any>/cards`.
    - **TC-2036 the manager's Gift cards screen loads.** The exact four GETs the web Overview + Reports issue for a manager each answer 200. Take the list from the shipped web code. If it includes any other route, fail with that route's name (Review Focus 1).
  - **16-gift-cards TC-1059 / TC-1065.** "The owner owes" reads the new `reports/summary.owed` when `releasePresent(...)`, else the legacy `/summary.outstandingBalance`. The values are unchanged ($25 / 1 card; $39.32 / 2 cards).
  - **16-gift-cards TC-1061.** When present, the lookup also has `freeze: null`.
  - **16-gift-cards TC-1065, add after the close.** When present, the day close's `giftCardsSold` = `{ cash: { amount: 65, count: 2 }, card: { amount: 0, count: 0 }, total: { amount: 65, count: 2 }, voided: { amount: 30, count: 1 }, cashedOut: { amount: 0, count: 0 } }`. That is $25 (TC-1059) + $40 (TC-1061) kept and $30 (TC-1062) voided. The voided sale is shown in `voided` and left out of `cash`. If the shipped code counts the voided load inside `cash`, stop and check Plan B Task 15's definition ("not voided") with the RestauNax owner before changing the number.
  - **api-books-taxes TC-1612.** The year-end gift card CSV row label is `"Cards whose money you hold,0,0.00"` when present (Plan A Task 11 renamed `giftCards.restaurant`), else the old `"This restaurant's gift cards,0,0.00"`. Assert the `Older cards held by RestauNax` row is **absent** (a fresh tenant has none).
  - **07-numbers-agree TC-1038.** `journal.drawer` `toEqual` gains `giftCardCashOutCents: 0` when present (Plan A Task 12). Probe with the owner token on the journey restaurant.
  - Update each file's header comment to name the new TCs.
- [ ] **Step 2: Run** the four files on today's QA. Expected: the old halves PASS and the new TCs SKIP.
- [ ] **Step 3: Run** on a feature stack. Expected: PASS.
- [ ] **Step 4: Static checks.**
- [ ] **Step 5: Commit** — `test(automation): manager, POS gift card, year-end and journal specs follow owner gift cards`

---

### Task 7: Web Gift cards section, chain shell and Payouts — POM + `41-gift-cards-ui.spec.ts` (TC-2037…2045, TC-2046)

**Files:**

- Create: `pages/dashboard/owner/OwnerGiftCardsPage.ts`
- Create: `tests/dashboard/owner/41-gift-cards-ui.spec.ts`
- Modify: `tests/dashboard/owner/api-gift-cards-chain.spec.ts` (add TC-2046)

**Interfaces:**

- Consumes: the web plan's routes and test ids. **Not written yet.** This plan proposes the ids below. The web plan's implementer should adopt them, or this POM is updated to theirs (POM only, never the specs).
- Produces (`createOwnerGiftCardsPage(page)`):

```ts
goto(restaurantId: string, tab?: "overview" | "reports" | "settings"): Promise<void>;   // /restaurant/restaurantId/:id/restaurantManagement?tab=<giftCards key>&<sub>=<tab>
gotoChain(groupId: string, tab?: …): Promise<void>;                                     // /chain/:gid/restaurantManagement?tab=<giftCards key>
sidebarItem(): Locator;          // getByRole("button"|"link", { name: "Gift cards" }) in the portal nav
owedFigure(): Locator;           // data-testid="gift-cards-owed"
search(text: string): Promise<void>;   // data-testid="gift-cards-search" input
row(last4: string): Locator;     // data-testid="gift-card-row" filtered by hasText last4
openCard(last4: string): Promise<void>;
historyLabels(): Promise<string[]>;    // data-testid="gift-card-history-row" → innerText of label cell
freeze(reason: string): Promise<void>; // button "Freeze" → dialog reason field (FormLabel) → "Freeze card"
unfreezeButton(): Locator;
hint(name: "freeze"|"owed"|"rollForward"|"settlement"): Locator; // data-testid="gift-cards-hint-<name>"
settingsPresets(): Locator; saveSettings(): Promise<void>;
rollForwardDifference(): Locator; // data-testid="gift-cards-rollforward-difference"
exportCsv(): Promise<Download>;   // "Export" → confirm dialog → download
byLocationRows(): Locator;        // chain: data-testid="gift-cards-location-row"
```

Setup for the UI file: a fresh owner tenant (`createSecondOwner(..., { alwaysFresh: true })`, password from the helper), Stripe TEST onboarded, gift cards on, cards `web` ($50, bought online) and `imported` ($30), and one card frozen by admin (`adminFrozen`, $10 seeded). Then `loginViaUi`.

- [ ] **Step 1: Write the tests:**
  - **TC-2037 Gift cards sits next to Promotions and opens on what's owed.**
    - The sidebar item "Gift cards" is visible, and its index is Promotions' index ± 1.
    - Clicking it puts the gift cards tab key in the URL.
    - `owedFigure()` shows `$80.00` (equal to the API `reports/summary.owed.amount`, formatted).
    - `hint("owed")` is visible, non-empty, not a key.
  - **TC-2038 find a card by its last 4 and read its history.**
    - `search(last4(web))` → one row, masked.
    - `openCard` → `historyLabels()` equals the API detail's `history.map(h => h.label)` (same order).
    - `page.content()` does not contain the full code.
  - **TC-2039 freeze a lost card, then unfreeze it; a RestauNax hold has no button.**
    - Freeze web with "Customer lost it" → status shows "Frozen" and the reason. The API agrees (`origin: OWNER`).
    - Unfreeze → "Active".
    - Open `adminFrozen` → `unfreezeButton()` hidden, and the text "Only RestauNax can lift this hold" visible.
  - **TC-2040 settings save and refuse a bad amount on the field.**
    - Change presets to 20 / 40 / 60 → save → API `config.presetDenominations` = `[20, 40, 60]`.
    - Enter a duplicate → field error, no save.
    - Toggle "Accept cash" by clicking the **switch itself** (CLAUDE.md "Toggling a switch") → API `allowCashFunding` flips. Restore in `finally`.
  - **TC-2041 reports tie and export after a warning.**
    - Reports tab: the activity shows "Sold" $50.00.
    - `rollForwardDifference()` reads `$0.00` (or the shipped "ties" wording).
    - `hint("rollForward")` and `hint("settlement")` are visible.
    - `exportCsv()` → the confirm dialog text mentions treating the file like cash. The download parses (`parseCsv`) with a row per card with money left (2 + the frozen one, as the export rules decide; assert ≥ 2 and that every code in it is a full code).
  - **TC-2042 browser Back returns to the previous gift cards tab.** Overview → Reports → Settings, then `page.goBack()` twice lands on Overview with the URL param restored (push convention, CLAUDE.md "Tabs and browser Back").
  - **TC-2043 Payouts no longer carries gift card blocks.** `/restaurant/restaurantId/:rid/subscription?section=payoutHistory` → no text "Outstanding gift card balances", no "Gift card settlement:" alert, no gift card download button. The page's main heading is still visible. This test **replaces** nothing (no spec asserted those blocks), and the component is gone.
  - **TC-2044 the page is plain Spanish for a Spanish owner.** `PATCH /users/me/locale { locale: "es" }` → reload → the sidebar item, owed hint and status chip are Spanish (not equal to EN, not keys). Restore `en` in `afterAll`.
  - **TC-2045 a manager opens Gift cards without a 403.** Only if Mailpit is available: reuse the manager-role harness, or skip with the reason "needs a manager account (Mailpit invite)". Record `page.on("response")` statuses for `/api/gift-cards/`. Open the page → no 403, and the Settings tab is not offered.
  - **TC-2046 (in the chain file, UI) the chain shell shows the chain's cards by location; a member's settings point to the chain.** `loginViaUi` with the chain owner's `email`/`password` (Task 1 extension).
    - `gotoChain(gid)` → `byLocationRows()` has A and B. A's owed is `$37.16`, and the total owed equals the API chain summary.
    - `goto(B, "settings")` → fields read-only, with a "chain level" note.
- [ ] **Step 2: Run** `npx playwright test tests/dashboard/owner/41-gift-cards-ui.spec.ts tests/dashboard/owner/api-gift-cards-chain.spec.ts --project=dashboard`. Expected today: SKIPPED.
- [ ] **Step 3: Heal against a feature stack with `playwright-cli`** (memory: the Heal loop; no blind edits, no sleeps). Adjust **POM locators** only. Expected: PASS.
- [ ] **Step 4: Static checks.**
- [ ] **Step 5: Commit** — `test(automation): web gift cards section, chain shell and payouts without gift card blocks (TC-2037..2046)`

---

### Task 8: Index the new coverage and flip the gate when QA has it

**Files:**

- Modify: `docs/COVERAGE_MAP.md` (G12 row + "G12 built" note; a new row G-GC "Owner gift card management")
- Modify: `TEST_PLAN.md` (project tree lines for the new specs, same style as `gift-card-batches.spec.ts`)
- Modify: `tests/pos/README.md` (an _Implemented_ entry for `25-gift-card-care.spec.ts`)
- Modify: `CLAUDE.md` (Test Utilities table: `utils/giftCardOwnerApi.ts` row; the `releaseGate.ts` row mentions `ownerGiftCards`)
- Modify (later, separate commit): `utils/releaseGate.ts` `ownerGiftCards: true`

- [ ] **Step 1: The failing check**

```bash
for f in docs/COVERAGE_MAP.md TEST_PLAN.md tests/pos/README.md CLAUDE.md; do
  grep -q -E "gift-cards-owner|gift-card-care|giftCardOwnerApi|TC-20(0|1|2|3|4)[0-9]" $f || echo "MISSING in $f"; done
```

- [ ] **Step 2: Edit** each file. G12 is the register sale. Add "owner/chain/POS management + cash-out + disputes: TC-2000..2046 (gated `ownerGiftCards`)". The README entry follows the `03-open-checks` style (setup chain, what's proven, cleanup).
- [ ] **Step 3: Run the check.** Expected: no MISSING lines. Then `npm run format:check`.
- [ ] **Step 4: Commit** — `docs(automation): index owner gift card coverage`
- [ ] **Step 5: After the RestauNax PR is on QA** (Neaj merges, the backend deploy smoke goes green): run all files from Tasks 2–7 against QA. When green, set `ownerGiftCards: true` and commit `test(automation): owner gift cards are on QA — gate on`. From then on a missing feature fails instead of skipping.

---

## Final verification

- [ ] `npm run typecheck && npm run lint && npm run format:check && npm run test:unit`: PASS.
- [ ] `npx playwright test --grep "TC-20[0-4][0-9]|TC-1551|TC-1059|TC-1061|TC-1065|TC-1612|TC-1038"` on today's QA: old halves pass, new tests skip with the gate reason, nothing fails.
- [ ] The same on a feature stack: all pass. Run it once with no other e2e run on QA at the same time (memory: Automation run collisions).
- [ ] `grep -rn "Outstanding gift card balances\|giftCardSettlement" tests pages` → only TC-2043's negative assertion.
- [ ] No new spec reads the "Automation Chain" fixture, and every new tenant/device/chain is cleaned in `afterAll`.

## Unresolved (for Neaj / the RestauNax plans)

1. ~~**The web plan is not written.**~~ **Resolved (2026-11-14):** the web plan exists and the POM follows the built UI, not these proposals. The POM and UI specs still need a heal pass against a live UI (see Pending verification).
2. **Early fraud warning on a gift card charge** has no reliable test-mode trigger through the publishable key. It stays covered by RestauNax unit tests only, unless a Stripe test token for EFW is confirmed.
3. **Dispute delivery depends on QA's Stripe webhook endpoint** receiving `charge.dispute.created` for test-mode destination charges. If QA doesn't, TC-2047–2049 need E2E*STRIPE*\* in CI (scripts/with-stripe-test-env.sh) for the `fireStripeEvent` fallback.
4. **`giftCardsSold.cash` with a voided load** (TC-1065): Plan B says "not voided", so a voided load sits only in `voided`. Confirm before relying on 65 vs 95.
5. **Terminal intent created by TC-2026's no-session call** is left uncaptured on the shared Stripe test account unless the backend offers a cancel route.

## TC numbering (as built)

TC-2000..2046 are the owner, chain, POS, manager and web UI cases. The disputes spec is TC-2047..2049 (the plan's TC-2012..2014: TC-2012 went to the home-food refusal case), and the POS replay-before-checks test is TC-2050. TC-2049 was retitled in Task 7. All of TC-2000..2050 are gated by `RELEASED_ON_QA.ownerGiftCards`.

## Pending verification

None of the new specs has run against a live backend or UI: the backend is not on QA and `ownerGiftCards` stays `false`. The UI specs (`41-gift-cards-ui`, TC-2049's Disputes screen step, TC-2046) have never run against the built web UI, so `OwnerGiftCardsPage` needs a heal pass (playwright-cli) once a stack has it. Then run every file from Tasks 2-7 on a feature stack, flip `ownerGiftCards: true`, and run the Final verification against QA.
