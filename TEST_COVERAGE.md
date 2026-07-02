# Restaunax — Test Coverage Map

> Last updated: 2026-07-02

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

| Feature                          | Test  | Status                                         |
| -------------------------------- | ----- | ---------------------------------------------- |
| Demo form submission             | TC-01 | ✅                                             |
| Confirmation email sent          | TC-02 | ⏭️ Skipped (Mailtrap not configured)           |
| Admin login                      | TC-03 | ✅                                             |
| Find demo request by email       | TC-04 | ✅                                             |
| Demo action menu items visible   | TC-05 | ✅                                             |
| Change demo status inline        | TC-06 | ✅                                             |
| View/Edit details side sheet     | TC-07 | ⚠️ Opens only — fields not verified            |
| Send follow-up email dialog      | TC-08 | ⚠️ Opens only — email not sent                 |
| Assign request dialog            | TC-10 | ⚠️ Opens only — assignment not tested          |
| Schedule demo dialog             | TC-11 | ⚠️ Opens only — date not set                   |
| Delete confirmation + cancel     | TC-09 | ⚠️ Cancel path only — actual delete not tested |
| Proceed to onboarding navigation | TC-12 | ✅                                             |
| Admin restaurant list            | TC-32 | ✅                                             |
| Admin subscription management    | —     | ❌ Not written                                 |
| Admin finance reports            | —     | ❌ Not written                                 |
| Admin system logs                | —     | ❌ Not written                                 |
| Admin leads management           | —     | ❌ Not written                                 |
| Admin chains management          | —     | ❌ Not written                                 |

---

## 🏠 Owner

| Feature                                | Test  | Status                                                                 |
| -------------------------------------- | ----- | ---------------------------------------------------------------------- |
| My Restaurants list page loads         | TC-13 | ✅                                                                     |
| Seed restaurant card visible           | TC-14 | ✅                                                                     |
| Restaurant management portal loads     | TC-15 | ✅                                                                     |
| Store Settings sidebar navigation      | TC-16 | ✅                                                                     |
| Menu editor loads                      | TC-19 | ✅                                                                     |
| Create menu category                   | TC-20 | ✅                                                                     |
| Add menu item to category              | TC-21 | ✅                                                                     |
| Edit menu category name                | TC-42 | ⏭️ Skipped — no edit button on category header in current UI           |
| Edit menu item name and price          | TC-43 | ✅                                                                     |
| Delete menu item                       | TC-44 | ⏭️ Skipped — no delete button on menu item cards in current UI         |
| Delete menu category                   | TC-45 | ✅                                                                     |
| Publish page (access check)            | TC-27 | ⏭️ Skipped — /publish route is EMPLOYEE-only; OWNER gets Access Denied |
| Publish checklist visible              | TC-28 | ⏭️ Skipped — /publish route is EMPLOYEE-only; OWNER gets Access Denied |
| Navigate to Orders tab                 | TC-29 | ✅                                                                     |
| Navigate to Create Coupon form         | TC-30 | ✅                                                                     |
| Create a new coupon                    | TC-31 | ✅                                                                     |
| Stripe setup page loads                | TC-46 | ✅                                                                     |
| Stripe onboarding stepper visible      | TC-47 | ✅                                                                     |
| Stripe header description visible      | TC-48 | ✅                                                                     |
| Connect Stripe button visible          | TC-49 | ✅ (route-mocked — status API returns hasAccount: false)               |
| Requirements checklist visible         | TC-50 | ✅ (route-mocked — status API returns hasAccount: false)               |
| Stripe success callback page loads     | TC-51 | ✅                                                                     |
| Restaurant Dashboard redirect works    | TC-52 | ✅                                                                     |
| Connect button → create API → redirect | TC-53 | ✅ (route-mocked — verifies POST + window.location redirect to Stripe) |
| Hours of operation setup               | —     | ❌ Not written                                                         |
| Unpublish restaurant                   | —     | ❌ Not written                                                         |
| Create deal                            | —     | ❌ Not written                                                         |
| Employee management                    | —     | ❌ Not written                                                         |
| Loyalty rewards setup                  | —     | ❌ Not written                                                         |
| Analytics dashboard                    | —     | ❌ Not written                                                         |
| Billing / subscription                 | —     | ❌ Not written                                                         |
| Uber Eats settings                     | —     | ❌ Not written                                                         |
| Edit restaurant info                   | —     | ❌ Not written                                                         |

---

## 👔 Employee

| Feature                 | Test  | Status                                                  |
| ----------------------- | ----- | ------------------------------------------------------- |
| Tax settings page loads | TC-17 | ✅ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` in `.env` |
| Save tax rate           | TC-18 | ✅ Needs `EMPLOYEE_EMAIL`/`EMPLOYEE_PASSWORD` in `.env` |
| Create restaurant       | —     | ❌ Not written (`test.fixme` scaffold exists)           |
| Publish menu            | —     | ❌ Not written (`test.fixme` scaffold exists)           |

> These were originally written under `tests/dashboard/owner/03-tax-settings.spec.ts`
> as permanent skips — `/tax` is an EMPLOYEE/ADMIN-only route and OWNER gets
> Access Denied. Moved to `tests/dashboard/employee/tax-settings.spec.ts` once
> the `employeePage` fixture (an authenticated EMPLOYEE session) existed.

---

## 🛒 Customer

| Feature                                 | Test  | Status                                                               |
| --------------------------------------- | ----- | -------------------------------------------------------------------- |
| Menu page loads                         | TC-22 | ✅ Needs `TEMPLATE_WIND_URL` set to a real per-restaurant deployment |
| Open item modal + Add to Cart visible   | TC-23 | ✅ Needs `TEMPLATE_WIND_URL` set to a real per-restaurant deployment |
| Checkout form visible with cart         | TC-24 | ✅ Needs `TEMPLATE_WIND_URL` set to a real per-restaurant deployment |
| Fill checkout form + proceed to payment | TC-25 | ✅ Needs `TEMPLATE_WIND_URL` set to a real per-restaurant deployment |
| Complete full order with Stripe card    | TC-26 | ✅ Needs `TEMPLATE_WIND_URL` set to a real per-restaurant deployment |
| Delivery order (address + delivery fee) | —     | ❌ Not written                                                       |
| Apply coupon at checkout                | —     | ❌ Not written                                                       |
| OTP member login (phone number)         | —     | ❌ Not written                                                       |
| Loyalty points redemption               | —     | ❌ Not written                                                       |
| Gift card purchase                      | —     | ❌ Not written                                                       |
| Declined payment handling               | —     | ❌ Not written                                                       |
| Order with modifiers selected           | —     | ❌ Not written                                                       |

---

## 📱 Staff / POS (Device In Store)

| Feature                             | Test | Status         |
| ----------------------------------- | ---- | -------------- |
| Tablet login with name + code       | —    | ❌ Not written |
| View incoming orders                | —    | ❌ Not written |
| Accept / confirm an order           | —    | ❌ Not written |
| Mark order as preparing             | —    | ❌ Not written |
| Mark order as ready                 | —    | ❌ Not written |
| Mark order as picked up / delivered | —    | ❌ Not written |
| Cancel an order                     | —    | ❌ Not written |

---

## 🔗 End-to-End Journeys

| Journey                                               | Status                          |
| ----------------------------------------------------- | ------------------------------- |
| Demo submitted → Admin finds and processes it         | ⚠️ Partial (TC-01, TC-04–TC-12) |
| Owner publishes menu → Customer can see and order     | ❌ Not written                  |
| Customer places order → Staff sees it → Staff accepts | ❌ Not written                  |
| Customer places order → Owner views it in dashboard   | ❌ Not written                  |
| Admin onboards demo → Restaurant is live              | ❌ Not written                  |

---

## 📊 Coverage Summary

| Area        | Written | Passing | Skipped | Not Written |
| ----------- | ------- | ------- | ------- | ----------- |
| Admin       | 13      | 12      | 1       | 5           |
| Owner       | 20      | 17      | 3       | 8           |
| Employee    | 2       | 2       | 0       | 0           |
| Customer    | 5       | 5       | 0       | 7           |
| Staff / POS | 0       | 0       | 0       | 7           |
| End-to-End  | 0       | 0       | 0       | 5           |
| **Total**   | **40**  | **36**  | **4**   | **32**      |

> **Overall coverage: ~56% of known features have tests written**
>
> TC-17/TC-18 moved from the Owner row to a new Employee row (they run under
> `tests/dashboard/employee/tax-settings.spec.ts` now); the Owner row's
> written/passing counts have been adjusted accordingly.

---

## 🎯 Recommended Next Batch — Priority Order

| Priority | Area                                          | Reason                                   |
| -------- | --------------------------------------------- | ---------------------------------------- |
| 🔴 1     | Staff / POS — order lifecycle                 | Zero coverage on core business flow      |
| 🔴 2     | Owner — hours of operation                    | Required before orders can be accepted   |
| 🟡 3     | Customer — delivery order                     | Second most common order type            |
| 🟡 4     | Customer — apply coupon                       | Common checkout variation                |
| 🟡 5     | Admin dialogs — actually test features inside | Current tests only check dialogs open    |
| 🟢 6     | Owner — employee management                   | Frequently used operational feature      |
| 🟢 7     | Full E2E — customer orders → staff accepts    | Validates entire platform works together |
| 🟢 8     | Admin — subscription management               | Billing coverage for admin oversight     |

> Formerly-listed items now done: "Owner — publish restaurant" (was thought to
> block customer tests; TC-22–TC-26 pass without it — publish gates a
> different concern) and "Customer — menu → checkout → order E2E" (TC-26
> covers the full guest happy path with a real Stripe test card).

---

## ⚠️ Known Technical Debt

| Issue                                             | Affected Tests      | Risk                                                                                                                                                                                 |
| ------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-06 leaves status as "Contacted" on QA          | TC-06               | 🟡 Medium — dirty test data                                                                                                                                                          |
| TC-18 leaves tax rate at 8.5% on QA               | TC-18               | 🟡 Medium — dirty test data                                                                                                                                                          |
| MUI class selectors fragile to upgrades           | TC-14, TC-15, TC-20 | 🟢 Low                                                                                                                                                                               |
| TC-03 only checks URL not dashboard content       | TC-03               | 🟢 Low                                                                                                                                                                               |
| TC-07–TC-11 only open dialogs, no feature testing | TC-07–TC-11         | 🟢 Low                                                                                                                                                                               |
| Add-item wizard auto-submits on entering Review   | TC-21, TC-43        | 🟢 Low — POM waits for the success toast instead of clicking the (permanently disabled) Save Item button; if a future build changes this, the fallback click path needs re-verifying |

> Three previously-listed "risk" items are resolved now that the customer
> suite actually runs and passes: the Pickup radio is a real `<input>` (click
> works), the Stripe iframe selector is correct (verified via a live payment
> in TC-26), and the seed restaurant doesn't need to be published for
> TC-22–26 to pass. A real bug _was_ found and fixed in the same area: the
> Stripe expiry default (`"12 / 2030"`) got silently truncated to `12/20` —
> an expired card — by the "MM / YY" masked input; see `utils/stripeCards.ts`
> → `STRIPE_DEFAULTS.EXPIRY_MM_YY`.
