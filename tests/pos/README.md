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

- **`04-floor-tables.spec.ts` (TC-384..395)** — the table/section/combination
  registry (owner portal + tablet host stand) and the derived floor payload
  (`GET /api/tablet/floor`). Own throwaway tenant (`createSecondOwner`):
  section/table/combination CRUD, the owner OR-gate (`tableServiceEnabled` OR
  the `TABLE_RESERVATIONS` entitlement) vs. every tablet host-stand write
  gating on the entitlement ALONE, layout batch-save, merge (repoints the
  open check, cleans up the source table), unreferenced hard-delete vs.
  referenced soft-deactivate + the ghost-table regression, and POS table
  CRUD / table-state capability splits.

- **`05-reservations-config.spec.ts` (TC-396..405)** — reservation
  CONFIGURATION (owner portal, pure owner-JWT — no tablet/device pairing).
  Own throwaway tenant: `ReservationSettings` / `ServicePeriod` / `TurnTime` /
  `DateOverride` CRUD + validation, the pacing guard (`onlineBookingEnabled`
  needs ≥1 paced period), duplicate-period 409, turn-time overlap refusal,
  date-override upsert-by-date, and the owner phone-booking create path
  (confirmed ADVISORY — never enforces min-notice/advance-window the way the
  public STRICT path does).

- **`06-reservations-lifecycle.spec.ts` (TC-406..417)** — reservation
  LIFECYCLE (tablet host stand). Own throwaway tenant + REGISTER device +
  staff session (a cash settlement needs a register): the full book → arrive
  → seat → link → settle-in-cash arc `@smoke` (TC-406), the seat-conflict
  capability split (STAFF sees 409; MANAGER's `OVERRIDE_RESERVATION_CONFLICT`
  bypasses it entirely and re-assigns the table), double-link 409,
  not-linkable 400, early no-show split, `clientRequestId` replay, advisory
  overbook past the paced cap, host list shape, transfer on a seated check,
  and cancelling a linked order unlinking the reservation WITHOUT reverting
  its status (confirmed: stays SEATED). TC-417 (`RESERVED_SOON` floor state)
  is `test.fixme` — no write path assigns a table without seating it; see
  `docs/PHYSICAL_TEST_LEDGER.md`.

- **`07-waitlist-public.spec.ts` (TC-418..425)** — waitlist (tablet host
  stand) + PUBLIC self-service booking. Own throwaway tenant + REGISTER
  device + staff session, no register session opened (this file never
  settles money): waitlist add/notify, public STRICT-mode availability +
  create + a public-safe manage view, manage-cancel 409 on repeat DELETE and
  on cancel-after-seated (not the owner surface's 400), per-phone cap, and
  the `onlineBookingEnabled` gate flip.

- **`08-register-cash.spec.ts` (TC-426..433)** — register / cash-drawer: the
  open/close lifecycle, the drawer-exclusive lock, cash-leg math, and the
  capability/ownership splits that decide whose PIN moves whose money. Own
  throwaway tenant + a deliberate SECOND device (the file's one exception to
  one `tabletLogin` per file, for the drawer-exclusivity test): open/close,
  cash-tendered change math, idempotency replay, `STAFF_TERMINAL_LOCKED`
  refusing a second PIN staff's sign-in while the register is open elsewhere,
  split tenders, and blind-count close (`overShort` sign convention).

Every file 04–08 runs on its own per-run throwaway tenant
(`createSecondOwner`), mirroring 03's pattern — none of this mutates the
shared seed restaurant. Real-browser coverage of the same two owner-portal
tabs (Tables & Floor, Reservations) lives in
`tests/dashboard/owner/18-tables-floor.spec.ts` (TC-434..439) and
`19-reservations.spec.ts` (TC-440..445) — see `TEST_PLAN.md`'s "Implemented
Today" table for what those cover; they're browser-level, not API-level, so
they live under `dashboard/owner/`, not here.

For what none of this — nor any browser automation — can reach (physical
readers, printers, gestures, real SMS delivery, and the two behaviors this
arc newly surfaced: the RESERVED_SOON floor state and the owner-portal
canvas drag gesture), see `docs/PHYSICAL_TEST_LEDGER.md`, this repo's
release-gate companion to the specs in this folder.

Helpers live in `utils/apiHelper.ts`: `createSeededOrder`,
`getCurrentOrders`, `updateOrderStatus`, `createTabletDevice`, `tabletLogin`,
`deactivateTabletDevice`; open-checks family: `updateRestaurantSettingsApi`,
`setOwnerPosPin`, `tabletStaffSignIn`, `openRegisterSessionPos`,
`createTabletOrderRaw`, `getTabletTablesRaw`, `transferTabTableRaw`,
`modifyTabletOrderRaw`, `settleTabCashRaw`, `settleTabGiftCardRaw`,
`createTabTerminalIntentRaw`, `cancelTabTerminalIntentRaw`,
`cancelTabletOrderRaw`, `getOrderFullRaw`; register/reservations family (task
3): `updateDeviceModeOwnerRaw`, `tabletStaffSignInRaw`,
`getOrderStatisticsDetailRaw`.

## Gotchas worth knowing before adding more coverage here

- **Device-pairing budget: a full run is already at 7 of the 10 `tabletLogin`
  pairings QA allows per 15-minute window** (01:1, 03:1, 04:1, 06:1, 07:1,
  08:2), with three files pairing near t=0 under `workers:3`. Before adding a
  file that calls `tabletLogin`/`createTabletDevice`, check this budget —
  there isn't much headroom left before a run (or a single retry of an
  already-paired file) starts tripping the cap.
- **Nullable `RestaurantTable.capacity` breaks availability feasibility.**
  `availabilityService.ts`'s feasibility step does
  `staticTables.length === 0 && combos.length === 0 → return {slots: [],
closed: false}` before it even generates candidate slots from the period —
  and a `null` `capacity` never satisfies the `gte` filter that step runs.
  A table created without an explicit `capacity` is invisible to
  availability regardless of how correctly the period/settings are
  configured. File 07's setup creates its table with `capacity: 4`
  specifically to satisfy this; don't drop that if you touch its setup.
- **KNOWN BEHAVIOR, not a bug: cancelling a linked order leaves the
  reservation SEATED.** `unlinkReservationForCancelledOrder` sets
  `Reservation.orderId = null` and does nothing else — the reservation is
  the party's real state, the order is just an attempt at collecting money
  for it, per `tabletOrderController.ts`'s own design comment. TC-415
  documents this; don't "fix" it into a bug report without checking that
  comment first.

## Not yet covered (tracked)

- **Gift-card leg happy path** — needs an ACTIVE gift card, and QA has no mint
  path without real money: `POST /api/gift-cards/purchase` verifies a
  SUCCEEDED Stripe PaymentIntent before minting, and the admin gift-card
  routes only freeze/adjust EXISTING cards. Coverable the day an admin/demo
  mint endpoint ships; until then TC-381 pins the contract negatives only.
- **Card-leg capture** — `…/tab/capture-terminal-intent` needs a physical
  reader to take a `card_present` PaymentIntent to `requires_capture`;
  create-intent validations + cancel are covered (TC-382), capture is
  device-lane coverage — see `docs/PHYSICAL_TEST_LEDGER.md`.
- Register cash-drop, peer-to-peer handover, and manager-approval gates
  (void / refund / comp / discount), capability-gated by `staffRole`. (Register
  OPEN **and CLOSE**, staff sessions, and the drawer-exclusivity lock are now
  covered by the 03 + 08 harnesses; tablet-initiated cancel is covered by
  TC-383 — https://github.com/Restaunax/Automation/issues/15 can close.)

## 09-dual-pricing.spec.ts

Dual pricing v2 (per-item cash tier) at the API level, on its OWN throwaway
tenant — the one-time menu conversion stamps the restaurant, so it can never
run on the shared seed. Gated on `DUAL_PRICING_V2=1` (pins → restaunax
`feat/dual-pricing-v2`) so the nightly stays honest until the backend is on QA.
Figures come from Bella Cucina's printed menu (13.40 ↔ 12.95, 3.11 ↔ 3.00 at
a 3.5% card markup); see `restaunax/docs/features/DUAL_PRICING.md`.
