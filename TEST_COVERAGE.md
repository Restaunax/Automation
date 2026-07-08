# Restaunax — Test Coverage Map

> Last updated: 2026-07-03

---

## Legend

| Symbol | Meaning                                                                     |
| ------ | --------------------------------------------------------------------------- |
| ✅     | Covered and passing                                                         |
| ⏭️     | Covered but skipped (credentials, role restriction, or not yet implemented) |
| ❌     | Not covered — needs to be written                                           |
| ⚠️     | Partially covered — dialog opens but feature not fully tested               |

---

## 🔐 Admin

| Feature                                     | Test                   | Status                                                                                            |
| ------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| Demo form submission                        | TC-01                  | ✅                                                                                                |
| Confirmation email sent                     | TC-02                  | ⏭️ Skipped (Mailtrap not configured)                                                              |
| Admin login                                 | TC-03                  | ✅                                                                                                |
| Find demo request by email                  | TC-04                  | ✅                                                                                                |
| Demo action menu items visible              | TC-05                  | ✅                                                                                                |
| Change demo status inline                   | TC-06                  | ✅                                                                                                |
| View/Edit details — notes field edit & save | TC-07                  | ✅ PUTs `/api/demo-requests/:id`; drawer auto-closes on success, verified by reopening            |
| Send follow-up email                        | TC-08                  | ✅ Flips status NEW→CONTACTED; verified via Mailtrap `waitForEmail()` when configured             |
| Assign request to a team member             | TC-10                  | ✅ Verified via the PUT response body (`assignedToId`) — UI doesn't surface the assignee anywhere |
| Schedule a demo                             | TC-11                  | ✅ Types into the masked MM/DD/YYYY hh:mm aa field; flips status to Scheduled                     |
| Delete confirmation + cancel                | TC-09                  | ✅ Cancel path                                                                                    |
| Permanently delete a demo request           | TC-98                  | ✅ Uses a seeded throwaway demo request (not the shared one TC-04–TC-12 depend on)                |
| Proceed to onboarding navigation            | TC-12                  | ✅                                                                                                |
| Admin restaurant list                       | TC-32                  | ✅                                                                                                |
| Invite a new user                           | TC-101 (users.spec.ts) | ✅                                                                                                |
| Invalid email → error, no request           | TC-102 (users.spec.ts) | ✅                                                                                                |
| Invite submit disabled w/o role             | TC-103 (users.spec.ts) | ✅                                                                                                |
| Inviting existing email rejected            | TC-104 (users.spec.ts) | ✅                                                                                                |
| Owner role reveals restaurant autocomplete  | TC-105                 | ✅                                                                                                |
| Cancel resets invite form                   | TC-106 (users.spec.ts) | ✅                                                                                                |
| Search finds user by email                  | TC-107                 | ✅                                                                                                |
| Role filter narrows list                    | TC-109                 | ✅                                                                                                |
| Status filter narrows list                  | TC-110 (users.spec.ts) | ✅                                                                                                |
| Detail side sheet opens/closes              | TC-111, TC-114         | ✅                                                                                                |
| USER/OWNER detail tabs correct              | TC-112, TC-113         | ✅                                                                                                |
| Change user role                            | TC-115 (users.spec.ts) | ✅                                                                                                |
| Deactivate/reactivate user                  | TC-116 (users.spec.ts) | ✅                                                                                                |
| Send password reset email                   | TC-117 (users.spec.ts) | ✅                                                                                                |
| Add/remove user-specific permission         | TC-118                 | ✅                                                                                                |
| Bogus invite token grants no access         | TC-124                 | ✅                                                                                                |
| Full invite → claim → login journey         | TC-123                 | ✅ Needs Mailtrap (`MAILTRAP_API_TOKEN`/`MAILTRAP_INBOX_ID`)                                      |
| Role change to unknown value rejected       | TC-76                  | ✅ (400, role unchanged server-side)                                                              |
| Status toggle on nonexistent user rejected  | TC-77                  | ✅ (404)                                                                                          |
| Admin subscription management               | —                      | ❌ Not written                                                                                    |
| Admin finance reports                       | —                      | ❌ Not written                                                                                    |
| Admin system logs                           | —                      | ❌ Not written                                                                                    |
| Admin leads management                      | —                      | ❌ Not written — see "Lead onboarding" note below                                                 |
| Admin chains management                     | —                      | ❌ `test.fixme` scaffold — tracked [#12](https://github.com/Restaunax/Automation/issues/12)       |

> **Lead onboarding / demo-to-restaurant AI conversion wizard** (`LeadOnboarding.tsx`, `/restaurant/manage` → "Lead Onboarding" tab): investigated but **not implemented**. The live QA deployment's `/restaurant/manage` page doesn't match the checked-out frontend source at all — no "Lead Onboarding" tab exists, and QA shows a "STAFF CONSOLE" layout that isn't present anywhere in the local frontend source tree. QA appears to be running a build that's diverged from what's on disk. Needs someone to confirm which frontend branch/commit QA is actually deployed from before this path can be tested.

---

## 🏠 Owner

| Feature                                                   | Test                              | Status                                                                                                                          |
| --------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| My Restaurants list page loads                            | TC-13                             | ✅                                                                                                                              |
| Seed restaurant card visible                              | TC-14                             | ✅                                                                                                                              |
| Restaurant management portal loads                        | TC-15                             | ✅                                                                                                                              |
| Store Settings sidebar navigation                         | TC-16                             | ✅                                                                                                                              |
| Store Settings — edit & save a field                      | TC-88                             | ✅ (self-reverting; doesn't leave shared QA data mutated)                                                                       |
| Menu editor loads                                         | TC-19                             | ✅                                                                                                                              |
| Create menu category                                      | TC-20                             | ✅                                                                                                                              |
| Add menu item to category                                 | TC-21                             | ✅                                                                                                                              |
| Add-item wizard blocks blank name/price                   | TC-62                             | ✅                                                                                                                              |
| Edit menu category name                                   | TC-42                             | ⏭️ Skipped — no edit button on category header in current UI                                                                    |
| Edit menu item name and price                             | TC-43                             | ✅                                                                                                                              |
| Delete menu item                                          | TC-44                             | ⏭️ Skipped — no delete button on menu item cards in current UI                                                                  |
| Delete menu category                                      | TC-45                             | ✅                                                                                                                              |
| Publish page (access check)                               | TC-27                             | ⏭️ Skipped — /publish route is EMPLOYEE-only; OWNER gets Access Denied                                                          |
| Publish checklist visible                                 | TC-28                             | ⏭️ Skipped — /publish route is EMPLOYEE-only; OWNER gets Access Denied                                                          |
| Navigate to Orders tab                                    | TC-29                             | ✅                                                                                                                              |
| Orders — nonexistent search shows empty state             | TC-70                             | ✅ (MUI DataGrid "No rows" overlay)                                                                                             |
| Orders — Filters button opens panel                       | TC-89                             | ✅                                                                                                                              |
| Orders — order detail view                                | TC-90                             | ✅ Read-only; skips if the seed restaurant has zero orders                                                                      |
| Navigate to Create Coupon form                            | TC-30                             | ✅                                                                                                                              |
| Create a new coupon                                       | TC-31                             | ✅                                                                                                                              |
| Invalid discount % rejected                               | TC-63                             | ✅                                                                                                                              |
| Manage Coupons list shows created coupon                  | TC-91                             | ✅                                                                                                                              |
| Edit an existing coupon                                   | TC-92                             | ⏭️ `test.fixme` — editing ANY coupon 500s server-side (frontend sends `value` as a string, Prisma expects Float)                |
| Stripe setup page loads                                   | TC-46                             | ✅                                                                                                                              |
| Stripe onboarding stepper visible                         | TC-47                             | ✅                                                                                                                              |
| Stripe header description visible                         | TC-48                             | ✅                                                                                                                              |
| Connect Stripe button visible                             | TC-49                             | ✅ (route-mocked — status API returns hasAccount: false)                                                                        |
| Requirements checklist visible                            | TC-50                             | ✅ (route-mocked — status API returns hasAccount: false)                                                                        |
| Stripe success callback page loads                        | TC-51                             | ✅                                                                                                                              |
| Restaurant Dashboard redirect works                       | TC-52                             | ✅                                                                                                                              |
| Connect button → create API → redirect                    | TC-53                             | ✅ (route-mocked — verifies POST + window.location redirect to Stripe)                                                          |
| Failed Stripe create-account shows error                  | TC-78                             | ✅ (route-mocked 500 — inline alert, no redirect)                                                                               |
| Uber Eats delivery settings page loads                    | TC-82                             | ✅ (owner-reachable — guard is `[ADMIN, EMPLOYEE, OWNER]`)                                                                      |
| Uber Eats delivery config section visible                 | TC-83                             | ✅                                                                                                                              |
| Subscription/Billing page loads                           | TC-84                             | ✅ (permission-gated `MODIFY_RESTAURANT`, not role-gated)                                                                       |
| Subscription page shows plan details                      | TC-85                             | ✅ Read-only                                                                                                                    |
| Manage Deals tab loads                                    | TC-86                             | ✅                                                                                                                              |
| Manage Deals — Create Deal action visible                 | TC-87                             | ✅ Navigation-only — no create-deal API helper exists yet                                                                       |
| Loyalty page (access check)                               | TC-81 (role-restrictions.spec.ts) | ✅ OWNER denied — `/restaurant/loyalty` is EMPLOYEE/ADMIN-only (CLAUDE.md previously listed this incorrectly as an Owner route) |
| Hours of operation setup                                  | —                                 | ❌ Not written (reachable as Step 1 of `CreateStore.tsx` — see Onboarding below)                                                |
| Unpublish restaurant                                      | —                                 | ❌ Not written                                                                                                                  |
| Create deal (full form)                                   | —                                 | ❌ Not written — needs a deals API helper for setup/cleanup                                                                     |
| Employee management (owner-side)                          | —                                 | ❌ Not written — no distinct owner-facing UI confirmed yet, needs product clarification                                         |
| Analytics dashboard                                       | —                                 | ❌ Not written — deliberately out of scope (read-only, low regression risk)                                                     |
| Edit restaurant info (name/address/etc, beyond prep time) | —                                 | ❌ Not written                                                                                                                  |

---

## 🚪 Onboarding (new restaurant owners)

Onboarding is **four distinct, unconnected paths** in the app — not one flow.

| Path                                                                                       | Test(s) | Status                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Self-serve sign-up (`/sign-up` → `POST /register`)                                         | TC-93   | ✅ Happy path. Confirmed a fresh account is role `USER` (only `VIEW_RESTAURANT`) — **not** `OWNER` — until it creates a restaurant.                                                                                                    |
| Sign-up — duplicate email rejected                                                         | TC-94   | ✅                                                                                                                                                                                                                                     |
| Sign-up — mismatched confirm-password blocks submit                                        | TC-95   | ✅ Client-side (yup) validation                                                                                                                                                                                                        |
| Sign-up — weak password rejected client-side                                               | TC-96   | ✅                                                                                                                                                                                                                                     |
| Employee-creates-restaurant-for-client (`/restaurant/new`, `CREATE_RESTAURANT` permission) | TC-97   | ✅ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD`. Confirmed Step 0 alone `POST`s `/restaurant/new` and the restaurant exists immediately — Steps 1/2 (hours, menu) just continue editing it. Cleans up via admin-token restaurant delete. |
| Demo/lead-to-restaurant AI conversion wizard                                               | —       | ❌ Not implemented — QA deployment doesn't match local frontend source (see Admin section note)                                                                                                                                        |
| Post-creation first-run setup (menu + Stripe + publish)                                    | —       | ⚠️ Not one flow — three disconnected screens. Menu (✅ covered), Stripe (✅ covered), Publish (⏭️ owner is denied; no EMPLOYEE/ADMIN publish test exists either)                                                                       |

---

## 🔒 Access Control

| Feature                                                                           | Test                | Status                                                                                             |
| --------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------- |
| OWNER denied `/publish` route                                                     | TC-54               | ✅                                                                                                 |
| OWNER denied `/tax` route                                                         | TC-55               | ✅                                                                                                 |
| OWNER denied `/restaurant/loyalty` route                                          | TC-81               | ✅                                                                                                 |
| owner/admin/employee can reach menu management                                    | TC-56, TC-57, TC-58 | ✅ (TC-58 needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` — fails locally without them, not a real bug) |
| Unauthenticated visitor → `/restaurant/stores` redirects to sign-in               | TC-71               | ✅                                                                                                 |
| Unauthenticated visitor → `/admin` redirects to sign-in                           | TC-72               | ✅                                                                                                 |
| Unauthenticated visitor → specific restaurant management URL redirects to sign-in | TC-73               | ✅                                                                                                 |

---

## 🔑 Public — Sign in / Sign up / Demo request

| Feature                                      | Test                            | Status                               |
| -------------------------------------------- | ------------------------------- | ------------------------------------ |
| Valid credentials reach dashboard            | TC-59                           | ✅                                   |
| Invalid credentials show error, stay on page | TC-60                           | ✅                                   |
| Unknown email shows error                    | TC-61                           | ✅                                   |
| Demo form submission + success dialog        | TC-01 (01-demo-request.spec.ts) | ✅                                   |
| Demo confirmation email received             | TC-02 (01-demo-request.spec.ts) | ⏭️ Skipped (Mailtrap not configured) |
| Demo form — unchecked terms blocks submit    | TC-74                           | ✅                                   |
| Demo form — invalid email blocks submit      | TC-75                           | ✅                                   |
| Sign-up happy path (see Onboarding above)    | TC-93–96                        | ✅                                   |

---

## 🌐 API-Level Negative Cases (`tests/dashboard/owner/api-negative.spec.ts`)

| Case                                                                 | Test  | Status |
| -------------------------------------------------------------------- | ----- | ------ |
| Menu item with no name → 4xx                                         | TC-65 | ✅     |
| Coupon with no code → 400                                            | TC-66 | ✅     |
| Coupon with negative discount value → 400                            | TC-68 | ✅     |
| Owner without `CREATE_RESTAURANT` can't self-create restaurant → 403 | TC-79 | ✅     |
| Demo request with no email → 400                                     | TC-80 | ✅     |
| Garbage Bearer token → 401                                           | TC-69 | ✅     |

---

## 👔 Employee

| Feature                               | Test   | Status                                                                         |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| Tax settings page loads               | TC-17  | ✅ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` in `.env`                        |
| Save tax rate                         | TC-18  | ✅ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` in `.env`                        |
| Create restaurant on behalf of client | TC-97  | ✅ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` in `.env` (see Onboarding above) |
| Publish page reachable + button       | TC-143 | ✅ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` in `.env`                        |
| Publish checklist visible             | TC-144 | ✅ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` in `.env`                        |

---

## 🛒 Customer

| Feature                                 | Test   | Status                                                                                                                                                    |
| --------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu page loads                         | TC-22  | ✅ Needs `TEMPLATE_WIND_URL` set to a real per-restaurant deployment                                                                                      |
| Open item modal + Add to Cart visible   | TC-23  | ✅ Needs `TEMPLATE_WIND_URL` set to a real per-restaurant deployment                                                                                      |
| Checkout form visible with cart         | TC-24  | ✅ Needs `TEMPLATE_WIND_URL` set to a real per-restaurant deployment                                                                                      |
| Fill checkout form + proceed to payment | TC-25  | ✅ Needs `TEMPLATE_WIND_URL` set to a real per-restaurant deployment                                                                                      |
| Complete full order with Stripe card    | TC-26  | ✅ Needs `TEMPLATE_WIND_URL` set to a real per-restaurant deployment                                                                                      |
| Real add-to-cart → cart → checkout flow | TC-99  | ✅ The only test driving the real cart UI; all others seed sessionStorage                                                                                 |
| Declined card shows payment error       | TC-64  | ✅ Needs `TEMPLATE_WIND_URL` — Stripe DECLINED test card, no order placed                                                                                 |
| Apply coupon at checkout                | TC-125 | ✅ Seeds an `AUTO*` % coupon via API; asserts discount line + rejects a bogus code                                                                        |
| Delivery address → quote round-trip     | TC-126 | ✅ Quote-wiring only (fee shown OR not-available); skips on pickup-only / no Places suggestion. Full delivery order still ❌ (needs QA delivery provider) |
| OTP member login (phone number)         | —      | ❌ Not written                                                                                                                                            |
| Loyalty points redemption               | —      | ❌ Not written                                                                                                                                            |
| Gift card purchase                      | —      | ❌ Not written                                                                                                                                            |
| Order with modifiers selected           | —      | ❌ Not written                                                                                                                                            |

---

## 📱 Staff / POS (Device In Store)

| Feature                             | Test   | Status                                                                                        |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| Tablet login with name + code       | TC-100 | ✅ Provisioned via owner API; `POST /api/tablet/login` → JWT                                  |
| View incoming orders                | TC-100 | ✅ Seeded order appears in `GET .../orders/current`                                           |
| Accept / confirm an order           | TC-100 | ✅ `PENDING → CONFIRMED`                                                                      |
| Mark order as preparing             | TC-100 | ✅ `CONFIRMED → PREPARING`                                                                    |
| Mark order as ready                 | TC-100 | ✅ `PREPARING → READY`                                                                        |
| Mark order as picked up / delivered | TC-100 | ✅ `READY → PICKED_UP`                                                                        |
| Cancel an order (tablet)            | —      | ❌ Needs `X-Staff-Session` — tracked [#15](https://github.com/Restaunax/Automation/issues/15) |
| Staff web portal (POS PIN)          | —      | ❌ `test.fixme` scaffold — tracked [#13](https://github.com/Restaunax/Automation/issues/13)   |

---

## 🔗 End-to-End Journeys

| Journey                                                 | Status                                                                                                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo submitted → Admin finds and processes it           | ⚠️ Partial (TC-01, TC-04–TC-12)                                                                                                                                               |
| Owner publishes menu → Customer can see and order       | ❌ Not written                                                                                                                                                                |
| Customer places order → Staff sees it → Staff accepts   | ❌ Not written                                                                                                                                                                |
| Customer places order → Owner views it in dashboard     | ⚠️ Partial — TC-90 views an existing order's detail, but no test drives a customer order end-to-end into the owner's Orders tab                                               |
| Admin onboards demo → Restaurant is live                | ❌ Not written (blocked on Lead Onboarding — see Admin section)                                                                                                               |
| Visitor signs up → creates a restaurant → becomes OWNER | ❌ Not written — TC-93 (sign-up) and TC-97 (restaurant creation) are separate tests; no single test chains a fresh sign-up into that same account creating its own restaurant |

---

## 📊 Coverage Summary

Full suite as of 2026-07-03: **91 passed / 18 skipped / 1 failed** (`TC-58`, fails only because `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` aren't set in this local `.env` — passes wherever those creds exist).

| Area                      | Written | Passing | Skipped/Fixme                      | Not Written         |
| ------------------------- | ------- | ------- | ---------------------------------- | ------------------- |
| Admin                     | 33      | 32      | 2 (TC-02, chains fixme)            | 4                   |
| Owner                     | 36      | 34      | 2 (TC-42, TC-44) + 1 fixme (TC-92) | 6                   |
| Onboarding                | 5       | 4       | 1 (needs EMPLOYEE creds)           | 1 (lead onboarding) |
| Access Control            | 8       | 7       | 1 (TC-58 needs EMPLOYEE creds)     | 0                   |
| Public (sign-in/up, demo) | 10      | 10      | 1 (TC-02, Mailtrap)                | 0                   |
| API-Level Negative        | 6       | 6       | 0                                  | 0                   |
| Employee                  | 6       | 2       | 4 (need EMPLOYEE creds)            | 0                   |
| Customer                  | 6       | 6       | 0                                  | 6                   |
| Staff / POS               | 0       | 0       | 1 (fixme)                          | 7                   |
| End-to-End                | 0       | 0       | 0                                  | 6                   |

> Some tests are counted under both their feature area and Onboarding/Access Control (e.g. TC-97 appears under Employee and Onboarding) — totals above reflect the full-suite run count, not a naive per-row sum.

---

## 🎯 Recommended Next Batch — Priority Order

| Priority | Area                                                       | Reason                                                                               |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 🔴 1     | Staff / POS — order lifecycle                              | Zero coverage on core business flow                                                  |
| 🔴 2     | Confirm QA's actual deployed frontend branch               | Blocks Lead Onboarding coverage entirely — can't test a UI that doesn't match source |
| 🟡 3     | Customer — delivery order                                  | Second most common order type                                                        |
| 🟡 4     | Customer — apply coupon                                    | Common checkout variation                                                            |
| 🟢 5     | Owner — employee management                                | Needs product clarification on which UI this maps to first                           |
| 🟢 6     | Full E2E — customer orders → owner sees it → staff accepts | Validates entire platform works together                                             |
| 🟢 7     | Fix the coupon-edit backend bug (TC-92)                    | Blocks re-enabling a `test.fixme`                                                    |

---

## ⚠️ Known Technical Debt

| Issue                                                          | Affected Tests                | Risk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MUI class selectors fragile to upgrades                        | TC-14, TC-15, TC-20           | 🟢 Low                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| TC-03 only checks URL not dashboard content                    | TC-03                         | 🟢 Low                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Add-item wizard auto-submits on entering Review                | TC-21, TC-43                  | 🟢 Low — POM waits for the success toast instead of clicking the (permanently disabled) Save Item button, then asserts the item card actually renders on the menu page; if a future build changes the auto-submit, the fallback click path needs re-verifying                                                                                                                                                                                                                                                                                                                                    |
| **Coupon edit 500s server-side**                               | TC-92 (fixme)                 | 🔴 High — real backend bug: `POST /api/coupons/:id` (edit) sends `value` as a string but Prisma's `coupon.update()` expects a Float. Blocks any coupon-edit coverage until fixed. Tracked: [RestauNax#481](https://github.com/Restaunax/RestauNax/issues/481).                                                                                                                                                                                                                                                                                                                                   |
| **Soft-deleted items permanently block category deletion**     | globalTeardown                | 🟡 Medium — backend: `DELETE /menu/menuItemId/:id` only soft-deletes (`isActive=false`), but `DELETE /menu/group/:id` counts soft-deleted items too, so any category that ever held an item 400s with "Cannot Delete Category With Items" forever (and the menus GET hides inactive items, so a drain can't find them). Teardown works around it with the admin-only hard delete (`/menu/menuItemId/:id/permanent`); historical orphaned "Automation Items" groups from older runs remain undeletable via API until the backend filters the blocker count to active items.                       |
| **Coupon create backend doesn't validate % bounds**            | TC-63 (create only)           | 🟡 Medium — the "1–100%" rule is enforced client-side only; a raw API call with `value: 500` is accepted. `TC-66`/`TC-68` test fields the backend _does_ validate (missing code, negative value) instead.                                                                                                                                                                                                                                                                                                                                                                                        |
| **Demo-requests backend validates email presence, not format** | TC-75, TC-80                  | 🟡 Medium — a malformed-but-present email is accepted (201) by `POST /api/demo-requests`; only a missing email field is rejected (400).                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| QA frontend deployment diverged from local source              | Lead Onboarding (not written) | 🔴 High for that feature — `/restaurant/manage` on QA shows a different layout ("STAFF CONSOLE") than what `DemoAndRestaurant.tsx` describes in the checked-out frontend source. Needs investigation before any test targets that screen.                                                                                                                                                                                                                                                                                                                                                        |
| **Order status + current-orders had NO auth**                  | TC-100, TC-101 (fixme)        | 🔴 High — backend: `PUT /api/order/orderId/:id/status` and `GET /api/order/.../orders/current` accepted any caller (anonymous order tampering + customer-PII leak on the live feed). **Fix written** (`requireTabletOrPermission` guard, tablet-or-MODIFY_RESTAURANT) in the RestauNax working tree — build/staging-test with Infisical, then deploy; flip TC-101 to a real 401 assertion after it lands on QA. Confirmed live 2026-07-06 (TC-100 drove status changes with no token).                                                                                                           |
| **placeOrder trusts client-supplied money fields**             | (order-create path)           | 🔴 High — backend: `POST /api/order/new/restaurantId/:id` trusts `subtotal/tax/total/discountAmount/…` from the client and marks any `total:0` order paid (COMPLETED) with no Stripe. A guest can place a real-item order for $0 (or $0.01). **Not a patch** — the real fix is server-side recomputation of the order total from menu prices + validated coupon/reward/gift-card amounts, only trusting a paid/zero shortcut the server itself derives. Backend-team-owned, needs full payment-matrix testing. Confirmed live 2026-07-06 (a $12.99 item with `total:0` created as PENDING/paid). |

> Three previously-listed "risk" items are resolved now that the customer
> suite actually runs and passes: the Pickup radio is a real `<input>` (click
> works), the Stripe iframe selector is correct (verified via a live payment
> in TC-26), and the seed restaurant doesn't need to be published for
> TC-22–26 to pass. A real bug _was_ found and fixed in the same area: the
> Stripe expiry default (`"12 / 2030"`) got silently truncated to `12/20` —
> an expired card — by the "MM / YY" masked input; see `utils/stripeCards.ts`
> → `STRIPE_DEFAULTS.EXPIRY_MM_YY`.
