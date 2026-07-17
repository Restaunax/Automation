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

Helpers live in `utils/apiHelper.ts`: `createSeededOrder`,
`getCurrentOrders`, `updateOrderStatus`, `createTabletDevice`, `tabletLogin`,
`deactivateTabletDevice`.

## Not yet covered (tracked)

- **Tablet-initiated cancel/refund** — `POST /api/tablet/cancel-order/:id`
  needs a tablet JWT **and** an `X-Staff-Session` header (staff sign-in) plus a
  non-empty `reason`. Tracked:
  https://github.com/Restaunax/Automation/issues/15
- Register sessions (open / cash-drop / handover / close) and manager-approval
  gates (void / refund / comp / discount), capability-gated by `staffRole`.
