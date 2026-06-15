# `tests/pos/` — Device In Store (POS) — API-level

This folder is a **placeholder**. It is intentionally **not** part of either
Playwright project (`dashboard`, `customer`) in `playwright.config.ts`, so
nothing here runs as a browser test today.

## Why it's separate

The POS lives in **device-in-store** (React Native / Expo), not a web app, so
it is tested at the **API level** rather than through browser UI automation
(per the project CLAUDE.md).

It also uses a **separate authorization layer** from the dashboard:

| Layer                                                                                           | Where           | What it gates        |
| ----------------------------------------------------------------------------------------------- | --------------- | -------------------- |
| Platform role (`User.role` + `Permission`)                                                      | dashboard       | `tests/dashboard/**` |
| **POS role (`RestaurantStaffMember.staffRole` = STAFF/SHIFT_LEAD/MANAGER + `StaffCapability`)** | device-in-store | this folder          |

## What would live here (future)

API-level coverage for the POS lifecycle:

- Tablet login (`POST /api/tablet/login` — tablet name + code → JWT)
- Order lifecycle: `PENDING → CONFIRMED → PREPARING → READY → PICKED_UP/DELIVERED`
  (`PUT /api/order/orderId/{id}/status`, `POST /api/tablet/cancel-order/{id}`)
- Register sessions (open / cash-drop / handover / close) and manager-approval
  gates (void / refund / comp / discount) — capability-gated by `staffRole`.

When these are built, add a third Playwright project (or a separate API test
runner) pointing at `tests/pos/`. See `TEST_PLAN.md` → "Future infrastructure".
