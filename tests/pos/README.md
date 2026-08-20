# `tests/pos/` — Device In Store (POS) — API-level

API-level tests for the POS order lifecycle. The POS itself lives in
**device-in-store** (React Native / Expo), so these drive the **backend** the
device talks to rather than a browser UI (per the project CLAUDE.md).

Registered as the **`pos` Playwright project** in `playwright.config.ts`
(`baseURL` is the dashboard host only so a stray `page.goto` resolves somewhere
sane; the tests use the API helpers, not the page).

Run with: `npx playwright test --project=pos`.

## Separate authorization layer

The POS uses a different auth model from the dashboard:

| Layer                                                                                           | Where           | What it gates        |
| ----------------------------------------------------------------------------------------------- | --------------- | -------------------- |
| Platform role (`User.role` + `Permission`)                                                      | dashboard       | `tests/dashboard/**` |
| **POS role (`RestaurantStaffMember.staffRole` = STAFF/SHIFT_LEAD/MANAGER + `StaffCapability`)** | device-in-store | this folder          |

## Implemented

- **`01-order-lifecycle.spec.ts` (TC-100)** — a customer order (seeded via the
  public order API at its real menu price and bumped to `PENDING` — no Stripe;
  the backend's pricing guard rejects `total:0`) is received in the
  restaurant's live current-orders feed and driven
  `PENDING → CONFIRMED → PREPARING → READY → PICKED_UP`, each transition
  confirmed at the API. Provisions + logs in a tablet device to mirror a real
  POS session; deactivates it in `afterAll` (no device-delete API exists).

- **`03-open-checks.spec.ts` (TC-372..383)** — table-service OPEN CHECKS
  (contract: `restaunax/docs/features/TABLE_SERVICE_OPEN_CHECKS.md`). Runs on
  a per-run throwaway tenant (`createSecondOwner`) because the feature is
  flag-gated (`RestaurantSettings.tableServiceEnabled`) and cash legs need a
  register session. Setup chain — the first full POS auth harness in this
  repo: ADMIN-created device (defaults to REGISTER mode; owners may only
  create SERVER/KITCHEN_DISPLAY) → `tabletLogin` → owner POS PIN
  (`setOwnerPosPin`, creates their MANAGER membership) → staff sign-in
  (`tabletStaffSignIn` → `X-Staff-Session` header) → `openRegisterSessionPos`
  (drawer for cash legs). Covers: flag gate 403, open → DINE_IN / CONFIRMED /
  unpaid + table fields, no-tender-at-open 400s, `/api/tablet/tables` summary
  (daily `orderNumber` + permanent `receiptNumber`), table transfer, mid-meal
  modify (no balance-due machinery on an unpaid tab), 2-leg cash close
  (`@smoke`), even 3-split with idempotencyKey replay + post-close refusal,
  per-leg tips, gift-leg negatives, card-leg intent create/cancel, and the
  settled-leg cancel guard.

Helpers live in `utils/apiHelper.ts`: `createSeededOrder`,
`getCurrentOrders`, `updateOrderStatus`, `createTabletDevice`, `tabletLogin`,
`deactivateTabletDevice`; open-checks family: `updateRestaurantSettingsApi`,
`setOwnerPosPin`, `tabletStaffSignIn`, `openRegisterSessionPos`,
`createTabletOrderRaw`, `getTabletTablesRaw`, `transferTabTableRaw`,
`modifyTabletOrderRaw`, `settleTabCashRaw`, `settleTabGiftCardRaw`,
`createTabTerminalIntentRaw`, `cancelTabTerminalIntentRaw`,
`cancelTabletOrderRaw`, `getOrderFullRaw`.

## Not yet covered (tracked)

- **Gift-card leg happy path** — needs an ACTIVE gift card, and QA has no mint
  path without real money: `POST /api/gift-cards/purchase` verifies a
  SUCCEEDED Stripe PaymentIntent before minting, and the admin gift-card
  routes only freeze/adjust EXISTING cards. Coverable the day an admin/demo
  mint endpoint ships; until then TC-381 pins the contract negatives only.
- **Card-leg capture** — `…/tab/capture-terminal-intent` needs a physical
  reader to take a `card_present` PaymentIntent to `requires_capture`;
  create-intent validations + cancel are covered (TC-382), capture is
  device-lane coverage.
- Register cash-drop / handover / close and manager-approval gates
  (void / refund / comp / discount), capability-gated by `staffRole`.
  (Register OPEN + staff sessions are now covered by the 03 harness;
  tablet-initiated cancel is covered by TC-383 —
  https://github.com/Restaunax/Automation/issues/15 can close.)
