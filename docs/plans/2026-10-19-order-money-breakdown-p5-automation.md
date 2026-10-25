# Order Money Breakdown — Plan 5: Automation (cross-surface E2E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One nightly QA spec proves that a real order reads the same money lines everywhere:

- the backend `breakdown` and the checkout quote;
- wind checkout and confirmation;
- the dashboard order dialog;
- the POS current-orders payload;
- the confirmation email.

In each place, the lines add up to Total and Charged.

**Architecture:**

- **File:** `tests/dashboard/owner/27-order-breakdown.spec.ts`, so it runs nightly only and never on every wind deploy. It runs in serial mode, as the 06b customer-to-owner pattern does.
- **A shared module** `helpers/orderBreakdown.ts` holds:
  - a normaliser (U+2212 → "-", strip thousands commas);
  - `breakdownLines(order)` from the API;
  - per-surface readers built on the existing testids (`breakdown-*`, `order-breakdown-*`, dashboard `moneyRow`);
  - `assertSameLines(a, b)`;
  - `assertSums(lines)`: lines before TOTAL sum to TOTAL; TOTAL plus tenders equals CHARGED.
- **Three tests**, because one order can't carry everything (fact sheet §1–2):
  - **TC-898:** a real Stripe order on wind with an automatic FREE_ITEM promotion, points, a partial gift card and a tip.
  - **TC-899:** a real order with a combo deal: the deal item row and the "You saved" info line.
  - **TC-900:** API-only delivery quotes with a free-delivery promotion: DELIVERY_FEE and FREE_DELIVERY lines, and quote totals that sum.

**Tech Stack:** Playwright + TypeScript (Automation repo), QA environment, Mailpit, Stripe test card.

**Spec:** `restaunax/docs/superpowers/specs/2026-10-18-order-money-breakdown-design.md` §8 (Automation). Fact sheet with helper names, testids, routes and pitfalls: `docs/plans/2026-10-19-order-money-breakdown-p5-facts.md` (next to this plan).

## Global Constraints

- **Branch** `test/order-money-breakdown` from `origin/qa`, worktree `Automation/.claude/worktrees/order-money-breakdown`. PR base `qa`; Neaj merges.
- **QA only.** All data is AUTO-named and cleaned up in `finally` and teardown. Never DELETE the Mailpit inbox. Respect the 10-active-deal cap: use `createDealApiCapSafe` / `withStorefrontCombo` and add a row to TEST_PLAN's deal-footprint table.
- **Seed restaurant rules:**
  - **TC-898's free item:** an AUTOMATIC FREE_ITEM triggered by buying the test's own per-run item, with the cart under $55. Never a spend offer, because only `customer/10-promotions` may run one.
  - **Promotion names:** give each promotion a real name. Code-only promotions read differently on the anonymous order read.
- **Gift card:** a partial balance only. A gift card covering the whole order is a known bug (TC-177 fixme).
- **Points:** a fresh phone, given points through admin bulk upload `POST /api/admin/restaurants/:id/bulk-upload-customers` (`Points Remaining` column). QA OTP is 123456.
- **Not `@smoke`.** Tag the email assertion's test `@email`. Use TC ids TC-898..900, re-checked against TEST_CASES.md before committing.
- **Playwright rules** (repo CLAUDE.md): use playwright-cli to build the new page object for wind's checkout reward section. No `sleep`; wait on conditions. Generous timeouts on Stripe steps (the fact sheet notes flakiness).
- **Comparisons** use the normalised text from each surface's own testids/labels. Never recompute money in the test; use only label and amount equality plus the sum assertions.
- **Run:** `npx playwright test tests/dashboard/owner/27-order-breakdown.spec.ts --project=dashboard`. The email step is verified via `gh workflow run e2e.yml --ref test/order-money-breakdown`, because the local .env has no Mailpit. Allure per-suite subfolders stay as they are.

## Review Focus

1. **A surface not rendering a breakdown** (e.g. old deploy or fallback) → the test fails with a clear message naming the surface, never a false pass from comparing two empty lists. _(Task 1 "empty list guard")_
2. **U+2212 vs "-", and thousands separators** → normalised before comparing. _(Task 1 unit tests)_
3. **Stripe confirmation flake** → a single retry of the payment step, then fail with screenshots. The breakdown assertions never run on a half-placed order. _(Task 2)_
4. **Cleanup after a mid-test failure** → promotions, deals, gift cards and customers are all removed in `finally`. _(Tasks 2–3)_
5. **POS payload** → read from `getCurrentOrders(tabletToken)`, not search (search has totals only). _(Task 2)_

---

### Task 1: Shared readers + assertions

**Files:**

- Create: `helpers/orderBreakdown.ts`
- Create: `tests/unit/orderBreakdown.helper.spec.ts`, or the repo's existing place for pure helper tests (check `playwright.config` projects for a unit/api project)

**Steps:**

- [ ] **Implement:**
  - `normaliseMoney(text)`;
  - `type Line = { kind?: string; label: string; amount: number }`;
  - `apiBreakdownLines(order)`;
  - `readWindCheckoutLines(page)` / `readWindConfirmationLines(page)` (testids `breakdown-{section}-{kind}` / `order-breakdown-{section}-{KIND}`);
  - `readDashboardLines(page)` (`moneyRow`);
  - `readEmailLines(html)`: parse the breakdown totals rows from the Mailpit HTML;
  - `assertSameLines(expected, actual, surfaceName)`: fails on an empty list;
  - `assertSums(lines)`.
- [ ] **Unit tests** for `normaliseMoney`, `assertSums` (the §9 numbers: 39.48 … 42.67, gift −10, charged 32.67) and the empty-list guard.
- [ ] Run. Commit `test(breakdown): shared readers and sum assertions`.

### Task 2: TC-898 — promotion + points + gift card order, every surface

**Files:**

- Create: `tests/dashboard/owner/27-order-breakdown.spec.ts` (serial)
- Create: a wind checkout reward-section page object in `pages/` (match the repo layout), built with playwright-cli
- Modify: `TEST_CASES.md` (TC-898)

**Steps:**

- [ ] **Setup** (AUTO-named, cleaned up in `finally`):
  - a per-run menu item;
  - an AUTOMATIC FREE_ITEM promotion, real name, triggered by that item;
  - a fresh phone with 200 points via bulk upload;
  - a partial gift card via `seedFundedGiftCard` + `recordGiftCardForCleanup`.
- [ ] **Customer on wind** (TC-844 checkout flow):
  1. Add the trigger item, then the gift item.
  2. Sign in with the phone (OTP 123456) and redeem points.
  3. Apply the gift card, choose a tip, and use a unique email.
  4. Read the checkout lines and assert the sums.
  5. Pay with the Stripe test card.
  6. On confirmation, read the lines and compare them to checkout: same kinds, labels and amounts.
- [ ] **Then compare against the backend.** Fetch `GET /api/order/:id` with owner auth and `assertSameLines` against the confirmation lines.
- [ ] **Owner:** `gotoOrderDetail` and compare the dashboard lines to the backend.
- [ ] **POS:** `getCurrentOrders(tabletToken)`, find the order, and compare its `breakdown.totals` to the backend.
- [ ] **Email (`@email`):** `waitForEmail(uniqueEmail, { subjectPattern: /Your Order Confirmation/, timeoutMs: 60_000 })`, parse the lines, and compare them to the backend.
- [ ] Expect the PROMOTION, POINTS, TAX, TIP, TOTAL, GIFT_CARD and CHARGED lines, and a FREE marker on the gift item row where the surface shows items.
- [ ] Run locally (without the email step), then commit. Note in the report the CI run that covers the email step.

### Task 3: TC-899 combo order + TC-900 delivery quote

**Steps:**

- [ ] **TC-899:** `withStorefrontCombo` (cap-safe; add the deal-footprint table row). Customer orders the combo on wind and pays. Assert:
  - a deal item row with its children on the confirmation and in the backend;
  - an info line "You saved $X with {deal}" that is NOT inside the summed lines;
  - sums hold;
  - backend and dashboard match.
- [ ] **TC-900 (API only):**
  1. Create a FREE_DELIVERY promotion (real name, cleaned up).
  2. `quoteOrderRaw` with orderType DELIVERY and the seed delivery fee.
  3. Assert `quote.breakdown` has DELIVERY_FEE and FREE_DELIVERY (amounts equal and opposite), and that the sums hold.
  4. Quote once more without the promotion and assert there's no FREE_DELIVERY line.
- [ ] Update TEST_CASES.md (TC-899, TC-900).
- [ ] Run. Commit `test(breakdown): combo and delivery-quote coverage`.
- [ ] Push. Open the Automation PR to `qa`. The body covers:
  - what each test proves;
  - why there are three tests, not one;
  - that it runs nightly only;
  - the CI run link for the `@email` step.
  - It ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)".
