# Restaunax E2E Automation — Test Plan

## Overview

End-to-end UI automation for the Restaunax platform, written in **TypeScript**
with **Playwright** and **Allure** reporting. The suite targets the **QA/Staging**
environment; credentials live in `.env`.

This document is the **canonical reference** for the suite: how it's organized,
the role model it mirrors, the conventions every test follows, and how to add a
new test. Read the **Conventions** and **How to add a new test** sections before
writing a spec.

> **State of the suite:** the framework (three-role auth, API seeding/teardown,
> fixtures, Allure) is in place, and ~50 real test cases cover public demo
> requests, admin (demo management, restaurants, full user management), owner
> (restaurant list/management, menu CRUD, orders, coupons, Stripe payment
> settings), employee (tax settings), and customer (menu browsing, checkout,
> full Stripe order placement). What remains is `test.fixme` placeholders —
> sign-in/sign-up, chains, employee restaurant-create/menu-publish, staff
> portal, and the access-control matrix. See **Project Structure** and
> **Implemented Today** for which files are real vs scaffolded.

---

## Two Apps Under Test

We automate **two separate front-end web apps**. They have different URLs, auth
models, and personas, so each gets its own Playwright **project** in
`playwright.config.ts`.

| App                                                    | Project     | Base URL (env)      | Personas                         | Auth                                       |
| ------------------------------------------------------ | ----------- | ------------------- | -------------------------------- | ------------------------------------------ |
| **Restaunax Dashboard** (`restaunax-frontend`)         | `dashboard` | `FRONTEND_URL`      | Admin, Employee, Owner, Public   | Email + password; role decided server-side |
| **Template Wind** (customer ordering, `template-wind`) | `customer`  | `TEMPLATE_WIND_URL` | Customer (guest + reward member) | None (guest) / OTP (member)                |

Because each project sets its own `baseURL`, a relative `page.goto("/menu")`
resolves against the correct host automatically — dashboard specs hit the
dashboard, customer specs hit Template Wind.

Run one app's tests with `--project`:

```bash
npx playwright test --project=dashboard      # dashboard only
npx playwright test --project=customer       # Template Wind only
npx playwright test                          # both
```

> `tests/pos/` (Device In Store / POS) is the **`pos` project** — API-level
> order-lifecycle tests (no browser UI). Run with `--project=pos`. See
> **Role & Permission Model** and `tests/pos/README.md`.

---

## Role & Permission Model (source of truth)

The test taxonomy mirrors the platform's **role + feature** model. This was
verified directly against the backend schema and the UI gates — not inferred.
Re-verify against these files if anything below looks stale:

- Backend: `restaunax-backend/prisma/schema.prisma` (`Role` enum, `Permission`
  enum, `RestaurantStaffMember.staffRole`), `src/constant/allPermissions.ts`
  (role→permission map), `src/middleware/authMiddleware.ts` (route guards).
- Frontend: `restaunax-frontend/src/types/index.ts` (`Role`, `Permission`),
  `src/routers/AllRoutes.tsx` (`requiredRoles` / `requiredPermissions` per route),
  `src/contexts/AuthContext.tsx` (`ProtectedRoute`),
  `src/hooks/useRestaurantFeatures.ts` (feature entitlements).

### The five platform roles (`User.role`)

| Role                 | Who they are                                   | Can do                                                                       | Cannot do                                        |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| **ADMIN**            | The company / full platform operator           | Everything (`/admin` + all restaurant routes)                                | —                                                |
| **EMPLOYEE**         | **Company-side setup staff** (onboard clients) | Create restaurants, **publish menus**, edit **tax**, manage register devices | Invite/create POS staff                          |
| **OWNER**            | The restaurant **client**                      | Manage their own restaurant(s), **invite staff**, kitchen-display devices    | Publish menus, edit tax, manage register devices |
| **RESTAURANT_STAFF** | POS device staff                               | Thin `/staff` PIN portal on web; real authority is the POS layer (below)     | Dashboard management                             |
| **USER / Customer**  | Orders on Template Wind                        | Place orders (guest or OTP reward member)                                    | Dashboard access                                 |

> **Key correction:** ADMIN + EMPLOYEE are the **company** side ("manage & set up
> everything for the restaurant"); OWNER is the **client**. EMPLOYEE is _not_
> "an owner's employee" and is _not_ "OWNER with fewer permissions" — the
> publish/tax/create routes are gated `[ADMIN, EMPLOYEE]` and explicitly deny
> OWNER. This is why `admin/`, `employee/`, and `owner/` are separate folders.

### Three gating layers — a test must satisfy all three

1. **Role** (`User.role`) → which dashboard routes you can open (`ProtectedRoute`
   `requiredRoles`).
2. **Permission** (`Permission` enum; role defaults + per-user grants) →
   fine-grained actions (`requiredPermissions`).
3. **Feature entitlement** (`RestaurantFeature` via subscription + add-ons),
   plus a **store-type overlay** → whether tabs like **Coupons / Deals / Social
   Media** even render. Shipping/email-only stores hide marketing tabs entirely.
   - **Gotcha:** a test expecting an entitlement-gated tab must run against a
     restaurant that is actually entitled (and not shipping/email-only).
     Otherwise the tab simply won't be there.

### The separate POS authorization layer (device-in-store)

The POS uses its own model, independent of `User.role`:

- `RestaurantStaffMember.staffRole` = `STAFF` / `SHIFT_LEAD` / `MANAGER`
- `StaffCapability` (open/close register, cash drop, approve void/refund/comp, …)

This is enforced in **device-in-store** (React Native) and is tested at the
**API level**, not via browser UI — see `tests/pos/README.md`.

### Shared capabilities (one screen, many roles)

Many dashboard screens are **not role-specific**. The restaurant-management
portal at `/restaurant/restaurantId/:id` (Menu, Orders, Coupons, …) is the same
screen for **Owner, Employee, and Admin** — the route is gated
`[ADMIN, OWNER, EMPLOYEE]` and editing needs only `MODIFY_RESTAURANT`, which all
three hold. "Owner creates a menu item" and "admin sets up a menu item for an
owner" are the **same flow, same screen, different login**.

We model this by **separating two concerns** — and never duplicating the feature
test per role:

| Concern                       | Answers                           | Where                                                                                                                                |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Feature behaves correctly** | "Does creating a menu item work?" | Written **once** under the primary actor (`tests/dashboard/owner/`), using a **role-agnostic POM** in `pages/dashboard/restaurant/`. |
| **Authorization**             | "_Who_ may reach/do it?"          | A thin matrix in `tests/dashboard/access/` that loops roles via the `pageForRole` fixture — no full feature re-run.                  |

Rules of thumb:

- **Shared-screen POMs live under `pages/dashboard/restaurant/`** and take a
  `restaurantId` — they belong to no role. (`pages/dashboard/admin/` stays for
  admin-only screens like users/chains/demo.)
- **Pick one actor for the feature test** (owner, the common case). Don't copy
  the flow into `admin/` and `employee/`.
- **Cross-role access goes in `tests/dashboard/access/`**, using
  `pageForRole("owner" | "admin" | "employee")` to grab the right session.
- **Role-distinct journeys keep their own folder** — owner-only staff invite,
  employee/admin-only publish/tax/create, admin-only user/chain management.

---

## Project Structure

```
Automation/
├── tests/
│   ├── dashboard/                            # PROJECT: dashboard (baseURL = FRONTEND_URL)
│   │   ├── public/                           # unauthenticated
│   │   │   ├── 01-demo-request.spec.ts       # ✅ real (incl. negative: unchecked terms, invalid email)
│   │   │   ├── sign-in.spec.ts               # ✅ real (incl. negative: wrong password, unknown email)
│   │   │   └── sign-up.spec.ts               # ✅ real (incl. negative: duplicate email, mismatched/weak password)
│   │   ├── admin/                            # the company manages everything
│   │   │   ├── demo/
│   │   │   │   ├── 01-demo-management.spec.ts  # ✅ real
│   │   │   │   └── 02-demo-actions.spec.ts     # ✅ real
│   │   │   ├── restaurants.spec.ts           # ✅ real
│   │   │   ├── users.spec.ts                 # ✅ real — full CRUD + invite/claim/login journey + negative role/status API cases
│   │   │   └── chains.spec.ts                # scaffold (test.fixme)
│   │   ├── owner/                            # feature tests, owner as primary actor (shared screens)
│   │   │   ├── 01-restaurant-list.spec.ts    # ✅ real
│   │   │   ├── 02-restaurant-management.spec.ts  # ✅ real (incl. real Store Settings field edit/save, self-reverting)
│   │   │   ├── 04-menu-management.spec.ts    # ✅ real (POM: OwnerMenuPage; TC-20→21→43 run serial; incl. blank-field validation)
│   │   │   ├── 05-publish.spec.ts            # ⏭️ skipped — /publish is EMPLOYEE/ADMIN-only, OWNER denied
│   │   │   ├── 06-orders.spec.ts             # ✅ real (incl. empty-state search, Filters panel, order detail view)
│   │   │   ├── 07-coupons.spec.ts            # ✅ real (incl. Manage Coupons list; coupon-edit is test.fixme — real backend bug)
│   │   │   ├── 08-payment-settings.spec.ts   # ✅ real (route mocks Stripe status/create for pre-connection + failure states)
│   │   │   ├── 09-uber-settings.spec.ts      # ✅ real — Uber Eats delivery settings (owner-reachable, unlike publish/tax/loyalty)
│   │   │   ├── 10-subscription.spec.ts       # ✅ real — Subscription/Billing page (permission-gated, not role-gated)
│   │   │   ├── 11-deals.spec.ts              # ✅ real — Manage Deals tab (navigation-only; no deals API helper yet)
│   │   │   └── api-negative.spec.ts          # ✅ real — raw API negative cases across menu/coupon/restaurant/demo/auth
│   │   ├── employee/                         # company-side setup staff
│   │   │   ├── restaurant-create.spec.ts     # ✅ real — needs EMPLOYEE_EMAIL/PASSWORD (POM: OwnerCreateRestaurantPage)
│   │   │   ├── menu-publish.spec.ts          # scaffold (test.fixme)
│   │   │   └── tax-settings.spec.ts          # ✅ real — moved from owner/03-tax-settings; needs EMPLOYEE_EMAIL/PASSWORD
│   │   ├── staff/                            # thin /staff PIN-card stub (web)
│   │   │   └── staff-portal.spec.ts          # scaffold (test.fixme)
│   │   └── access/                           # who-can-reach-what matrix (uses pageForRole)
│   │       ├── restaurant-management-access.spec.ts  # ✅ real — owner/employee/admin reach shared screens
│   │       ├── role-restrictions.spec.ts             # ✅ real — OWNER denied publish/tax/loyalty
│   │       └── unauthenticated-access.spec.ts        # ✅ real — zero-session visitor redirected to /sign-in from protected routes
│   └── customer/                             # PROJECT: customer (baseURL = TEMPLATE_WIND_URL)
│       ├── 01-menu-browsing.spec.ts          # ✅ real (POM: CustomerMenuPage)
│       ├── 02-checkout.spec.ts               # ✅ real (POM: CustomerCheckoutPage)
│       └── 03-order-placement.spec.ts        # ✅ real — full Stripe checkout → Order Confirmed, incl. DECLINED-card negative
├── pages/                                    # Page Object Models (factory functions)
│   ├── dashboard/
│   │   ├── auth/{SignInPage,SignUpPage}.ts   # ✅ real
│   │   ├── public/DemoBookingPage.ts         # ✅ real
│   │   ├── admin/{AdminDemoManagementPage,AdminRestaurantsPage,AdminUsersPage}.ts  # ✅ real
│   │   ├── owner/{OwnerRestaurantListPage,OwnerRestaurantManagementPage,OwnerMenuPage,
│   │   │   OwnerOrdersPage,OwnerCouponPage,OwnerPublishPage,OwnerTaxPage,
│   │   │   OwnerPaymentSettingsPage,OwnerUberSettingsPage,OwnerSubscriptionPage,
│   │   │   OwnerDealsPage,OwnerCreateRestaurantPage}.ts  # ✅ real
│   │   └── restaurant/MenuManagementPage.ts  # ✅ real — role-agnostic (shared by owner/employee/admin access tests)
│   └── customer/
│       └── {CustomerMenuPage,CustomerCheckoutPage,CustomerOrderConfirmationPage}.ts  # ✅ real
├── fixtures/
│   └── base.ts          # ownerPage, adminPage, employeePage, pageForRole, demoBookingPage, signInPage, signUpPage
├── utils/
│   ├── apiHelper.ts     # direct HTTP for setup/teardown (login, seed/delete restaurant, admin user mgmt) + raw negative-case helpers (createMenuItemRaw, createCouponRaw, createRestaurantRaw, submitDemoRequestRaw, updateUserRoleRaw, toggleUserStatusRaw, register)
│   ├── emailHelper.ts   # Mailtrap inbox polling + invite-token extraction
│   ├── auth.ts          # loginViaUi() — fresh-context UI login for arbitrary (non-seeded) users
│   ├── testData.ts      # generators, shared-state, readRestaurantId(), URLs, cleanup tracking
│   ├── stripeCards.ts   # Stripe test card + expiry/CVC constants (STRIPE_DEFAULTS.EXPIRY_MM_YY)
│   └── stripeHelper.ts  # fillStripePaymentElement() — fills the Stripe iframe
├── globalSetup.ts       # runs once before all tests
├── globalTeardown.ts    # runs once after all tests
├── playwright.config.ts # two projects: dashboard + customer
└── TEST_PLAN.md         # this file
```

`tests/pos/` is the **`pos` Playwright project** — API-level order-lifecycle
coverage (the POS lives in device-in-store / React Native, so it's tested
through the backend, not a browser). Helpers: `createZeroTotalOrder` (Stripe-
free `total:0` order), `createTabletDevice` / `tabletLogin`, `updateOrderStatus`,
`getCurrentOrders` in `utils/apiHelper.ts`. See `tests/pos/README.md`.
`tests/auth/` is an empty stub folder with no files yet.

**Design principle:** the tree mirrors **app → role → feature** (how users
experience the product and how access is gated), **not** the React component
folder layout (which would couple tests to implementation details). POMs model
**screens/pages**, never components.

---

## Conventions

| Topic                 | Convention                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Folder axis**       | `tests/<app>/<role>/<feature>.spec.ts`. App first (different URLs/auth), then role (how access is gated), then feature.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **POM location**      | `pages/<app>/<role>/<Screen>Page.ts` — mirrors the test axis.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **POM style**         | A **factory function** `create<Name>Page(page)` returning `{ goto, ...actions }`, plus an exported `type` via `ReturnType`. No classes. See `pages/dashboard/auth/SignInPage.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Locators**          | Priority: `data-testid` > role/name > stable `id`/`name` attribute > label > placeholder > CSS class (last resort). Hot components in both frontends now carry testids (`menu-item-card`, `menu-item-edit`, `unsaved-changes-save`, `user-role-filter`, `add-to-cart`, `view-cart`, …) — **but the QA deployment may lag the frontend source**, so POMs use the testid-first-with-legacy-fallback pattern: `page.getByTestId("x").or(legacyLocator).first()`. Both branches must resolve to the SAME node once deployed (or `.first()` must pick a clickable ancestor) to stay strict-mode safe. When a component you need has no testid, add one to the frontend in the same change — never add another `.nth()`. |
| **Test titles**       | `TC-NN: description`. Add Allure `feature` / `severity` labels and wrap steps in `allure.step()` for readable reports (see the demo specs).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Placeholders**      | Scaffolded specs use `test.fixme("TC-XXX: …", async ({ fixture }) => { … })`. They appear in `--list` as skipped and **never run or fail CI**. Each holds an Arrange-Act-Assert skeleton + the POM import so it's copy-paste-ready.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Imports**           | Relative paths only. (Path aliases were removed from `tsconfig.json` — they were never used, and Playwright doesn't resolve them at runtime without extra setup.)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Fixtures**          | Never log in inside a spec. Use `ownerPage` / `adminPage` / `employeePage`; auth is restored from storageState by `globalSetup` + `fixtures/base.ts`. Customer tests use the plain `page` fixture (the `customer` project's baseURL is Template Wind).                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Shared screens**    | A screen reachable by multiple roles gets a **role-agnostic POM** in `pages/dashboard/restaurant/`. Test the feature once (primary actor); cover cross-role access in `tests/dashboard/access/`. See "Shared capabilities".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Swallowed errors**  | Every `.catch(() => {})` must sit next to a comment saying why the failure is safe to ignore (usually: a best-effort wait where the caller's own assertion is the real check, or best-effort cleanup that must not mask the test result). A bare swallow with no justification is a review defect.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Timeouts**          | Don't restate defaults: `expect()` already waits 10s (config `expect.timeout`), actions 15s, navigation 30s, tests 90s. Pass an explicit `{ timeout }` ONLY when a step legitimately needs longer (Stripe iframes, email delivery, wizard fetches) — that way a nonstandard timeout signals intent instead of drowning in noise.                                                                                                                                                                                                                                                                                                                                                                                   |
| **Permissions/roles** | **Never hardcode** a permission name, an expected permission list, or the role set. Discover them at runtime (`GET /api/roles`, `/api/roles/:role/permissions`, `/api/roles/users/:id/permissions`) and assert on relationships — the catalog evolves. See `tests/dashboard/admin/users.spec.ts` and the `getRoles` / `getRolePermissions` / `getUserPermissions` helpers.                                                                                                                                                                                                                                                                                                                                         |

### The POM factory pattern

```ts
import { type Page } from "@playwright/test";

export const createExamplePage = (page: Page) => {
  const submit = page.getByRole("button", { name: /save/i });

  const goto = async (): Promise<void> => {
    await page.goto("/example", { waitUntil: "domcontentloaded" });
  };

  const save = async (): Promise<void> => {
    await submit.click();
  };

  return { goto, save };
};

export type ExamplePage = ReturnType<typeof createExamplePage>;
```

---

## How to Add a New Test

1. **Pick the folder** — `tests/<app>/<role>/`. New customer flow? `tests/customer/`.
   New owner feature? `tests/dashboard/owner/`. The role determines the fixture
   and the entry URL.
2. **Add or extend a POM** at the mirror path `pages/<app>/<role>/`. Model it on
   an existing one. Keep selectors and navigation in the POM; keep assertions in
   the spec.
3. **Write the spec** using the right fixture and the POM. Start from the
   `test.fixme` placeholder already in the folder — rename `fixme` → `test`, fill
   the Arrange-Act-Assert body, add Allure labels.
4. **Run just your project:** `npx playwright test --project=customer <path>`.

### Worked example — an owner coupon test

Adapted from the real `tests/dashboard/owner/07-coupons.spec.ts`:

```ts
// tests/dashboard/owner/07-coupons.spec.ts
import * as allure from "allure-js-commons";
import { test } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerCouponPage } from "../../../pages/dashboard/owner/OwnerCouponPage";
import { readSharedState, generateCouponCode } from "../../../utils/testData";

test.describe("Owner — Coupons", () => {
  test.beforeEach(async () => {
    await allure.label("feature", "Owner Coupons");
    await allure.label("severity", "normal");
  });

  test("TC-31: owner can fill and submit a new coupon", async ({
    ownerPage,
  }) => {
    const { restaurantId } = readSharedState(); // Arrange
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const couponPage = createOwnerCouponPage(ownerPage);
    const couponCode = generateCouponCode();

    await mgmtPage.goto(restaurantId);
    await couponPage.navigateToCreateCoupon(); // Act
    await couponPage.fillCouponForm(couponCode, "10");
    await couponPage.submit();

    await couponPage.assertSuccessToast(); // Assert
  });
});
```

Note the assertion helpers (`assertSuccessToast`, `assertFormVisible`, …) live
on the POM and return a `Promise<void>` from an `expect(...)` expression —
specs `await` them rather than reaching into `page.getByText(...)` directly.
This keeps every selector in one place per screen.

---

## Authentication & Fixtures

Specs never contain login steps. `globalSetup` authenticates roles once and
saves browser sessions to disk; `fixtures/base.ts` restores them.

| Fixture                            | Session                                                              | Use for                                                 |
| ---------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| `ownerPage` / `ownerContext`       | Owner (storageState from `owner-auth.tmp.json`)                      | `tests/dashboard/owner/**`                              |
| `adminPage` / `adminContext`       | Admin (storageState from `admin-auth.tmp.json`)                      | `tests/dashboard/admin/**`                              |
| `employeePage` / `employeeContext` | Employee (storageState from `employee-auth.tmp.json`)                | `tests/dashboard/employee/**`                           |
| `pageForRole(role)`                | Resolver → authenticated page for `"owner" \| "admin" \| "employee"` | `tests/dashboard/access/**` (who-can-reach-what matrix) |
| `signInPage`                       | Unauthenticated sign-in POM                                          | auth tests                                              |
| `signUpPage`                       | Unauthenticated sign-up POM                                          | onboarding / sign-up tests                              |
| `demoBookingPage`                  | Unauthenticated `/demo` POM                                          | public demo tests                                       |

`globalSetup` saves owner/admin/employee sessions in parallel and warns (not
fails) when a role's `*_EMAIL`/`*_PASSWORD` pair is unset in `.env` — specs
for that role then skip via `test.skip(!EMAIL || !PASSWORD, ...)` rather than
throwing. `pageForRole("employee")` resolves once `EMPLOYEE_EMAIL` /
`EMPLOYEE_PASSWORD` are set.

**Customer restaurant target:** Template Wind is deployed per-restaurant.
Customer specs use the plain `page` fixture (the `customer` project's baseURL
is Template Wind) and resolve the restaurant via `utils/testData.ts` →
`readRestaurantId()`, which returns `TEMPLATE_WIND_RESTAURANT_ID` (env
override) or the restaurant seeded by `globalSetup`. Customer POMs append
`?restaurantId=<id>` to skip the location picker.

**Test-case IDs are globally unique across the whole suite** — never reuse a
TC number that exists in any other spec (the admin user-management suite uses
the TC-101+ block for this reason). Duplicate IDs break TEST_CASES.md
traceability and make Allure results ambiguous.

**Session lifetime** (measured from the backend source, 2026-07-05):

| Token              | TTL        | Carrier                                                   |
| ------------------ | ---------- | --------------------------------------------------------- |
| Access token (JWT) | 15 minutes | `Authorization: Bearer` / localStorage `user.accessToken` |
| Refresh token      | 30 days    | localStorage `user.refreshToken` + httpOnly cookie        |

Browser sessions restored from storageState survive arbitrarily long runs
because the saved localStorage carries the 30-day refresh token and the
dashboard auto-refreshes on page load (`POST /api/auth/refresh`). globalSetup
**fails fast** if a saved auth file is missing the refresh token
(`verifyAuthStateLifetime`) — that's the condition under which tests starting
more than 15 minutes into a run would begin failing with mysterious
redirects to `/sign-in`.

Raw `apiLogin()` tokens have **no refresh path**: caching one in a
`beforeAll` is fine for a normal spec file, but never reuse one across more
than ~10 minutes of test execution — re-login instead.

---

## How globalSetup / globalTeardown Work

`globalSetup.ts` runs **once before all tests**:

1. **API login as owner** (if `OWNER_EMAIL`/`OWNER_PASSWORD` are set) → looks
   up the owner's existing QA restaurant (`GET /restaurant/owned`; throws if
   the owner has none — an admin/employee must create one first), then seeds a
   test menu category + item via `createTestMenuGroup()` / `createTestMenuItem()`.
2. **Four tasks run in parallel** (~4x faster): owner browser login →
   `owner-auth.tmp.json`, admin browser login → `admin-auth.tmp.json`,
   employee browser login → `employee-auth.tmp.json` (each skipped with a
   console warning if its `*_EMAIL`/`*_PASSWORD` pair is unset), and submitting
   a demo request via browser to capture the email for the demo tests.
3. Writes `shared-state.tmp.json`:
   `{ email, firstName, lastName, submittedAt, restaurantId, restaurantName, menuGroupId, menuItemId, menuItemName, menuItemPrice }`.

`globalTeardown.ts` runs **once after all tests**:

- deletes the seed menu item + group (draining any leftover items first to
  avoid "Cannot Delete Category With Items")
- sweeps automation-created menu categories (`Test Starters *` / `TC45 Delete *`)
  and `AUTO*` coupons — this run's **and** leftovers from interrupted runs
- deletes any users the admin user-management suite created (tracked via
  `recordUserForCleanup()` in `utils/testData.ts`)
- deletes this run's demo request (admin token; globalSetup submits one per run)
- removes all `*.tmp.json` files

Teardown errors are logged, never fail the run.

---

## Parallel Execution

The suite runs **multiple spec files concurrently** (`workers: 3` locally,
`2` in CI; override with `--workers=N`). `fullyParallel` stays **false**, so a
spec file is the isolation unit: tests inside a file always run in order, in
one worker — serial CRUD chains and `beforeAll` seeding keep working. The
counts were tuned empirically: 4 local workers pushed combined Chromium + QA
load past action budgets (pure slowness, no data races); 3 is the sweet spot,
paired with a 90s per-test budget.

**The contract every spec file must honor** (this is what makes parallelism
safe against one shared QA environment):

1. **Own your data.** Create what you need with unique names
   (`generateRunId()` / `generateUserEmail()` / `generateCouponCode()`), and
   never assume another file has or hasn't run. Cross-file dependencies are
   forbidden.
2. **Restore what you mutate.** Any change to a shared QA setting (tax rate,
   prep time, restaurant config) must snapshot the original and restore it in
   a `finally`.
3. **Never mutate a row another file asserts against.** `02-demo-actions`
   seeds its own private demo request precisely because `01-demo-management`
   asserts the shared one's status is NEW.
4. **Shared temp files must be append-safe.** `users-cleanup.tmp.json` is
   append-only JSONL (concurrent workers can't lose entries to a JSON
   read-modify-write race). Only `globalTeardown` drains it — never drain it
   from a spec's `afterAll`, which could delete a user a concurrently-running
   file still needs.

**Known accepted overlap:** the tax-rate and prep-time tests briefly change
settings that in principle affect concurrent customer-order pricing. No
current test asserts totals, so this is safe today — if a totals-asserting
test is ever added, it must either pin its own restaurant or move into the
same file as the settings mutations.

---

## Helpers

`utils/`:

| Helper            | Provides                                                                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiHelper.ts`    | `apiLogin()`, restaurant/menu seed + cleanup, and the admin user-management API (`inviteUserApi`, `adminCreateUser`, `registerWithInvite`, `getMe`, role/permission discovery, `deleteRecordedUsers`) |
| `testData.ts`     | `generateDemoFormData()`, `generateRestaurantData()`, `generateUserEmail()`, `read/writeSharedState()`, `readRestaurantId()`, cleanup-file tracking, `FRONTEND_URL`, `TEMPLATE_WIND_URL`              |
| `emailHelper.ts`  | `waitForEmail()` (Mailtrap inbox polling), `extractInviteToken()`                                                                                                                                     |
| `auth.ts`         | `loginViaUi()` — fresh-context UI login for an arbitrary (non-seeded) user, e.g. an invitee who just claimed their account                                                                            |
| `stripeCards.ts`  | Stripe test card numbers + `STRIPE_DEFAULTS` (incl. `EXPIRY_MM_YY` — the only expiry value the "MM / YY" masked input accepts without truncating to the wrong year)                                   |
| `stripeHelper.ts` | `fillStripePaymentElement()` — fills the Stripe iframe fields                                                                                                                                         |

**Still open:**

- **Customer OTP login** — no helper yet for `POST /login/send-otp` +
  `/login/verify-otp` (reward-member sessions). Customer tests today are
  guest-only.
- **Wire Mailtrap in CI** — set an **Email Testing** token (not a Sending
  token, which 403s) so the demo-confirmation-email check (currently skipped)
  and the admin invite→claim→login journey test (also Mailtrap-gated) can run.
- **POS / tablet API harness** — for `tests/pos/` (`POST /api/tablet/login`,
  order-status transitions, register/capability flows).

---

## Environment Variables

Configured in `Automation/.env`.

| Variable                                      | Description                                                                                                                                  | Example                                 |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `FRONTEND_URL`                                | Dashboard base URL (project `dashboard`)                                                                                                     | `https://app.qa.restaunax.com`          |
| `TEMPLATE_WIND_URL`                           | Template Wind base URL (project `customer`) — no code default; `qa.restaunax.com` serves the marketing site, not a per-restaurant deployment | `https://<restaurant>.qa.restaunax.com` |
| `TEMPLATE_WIND_RESTAURANT_ID`                 | Optional override for the customer-site restaurant target                                                                                    | _(restaurant id)_                       |
| `SEED_RESTAURANT_ID` / `SEED_RESTAURANT_NAME` | Optional pin for the seed restaurant globalSetup targets (default: first owned restaurant — order-dependent if the owner has several)        | _(restaurant id / exact name)_          |
| `BACKEND_URL`                                 | Backend API base URL (used by `apiHelper`)                                                                                                   | `https://api.qa.restaunax.com`          |
| `OWNER_EMAIL` / `OWNER_PASSWORD`              | Owner account — must already own ≥1 QA restaurant                                                                                            | _(secret)_                              |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`              | Admin account (admin-flow tests, teardown cleanup)                                                                                           | _(secret)_                              |
| `EMPLOYEE_EMAIL` / `EMPLOYEE_PASSWORD`        | Employee account — gates `tests/dashboard/employee/**`                                                                                       | _(secret)_                              |
| `MAILTRAP_API_TOKEN`                          | **Email Testing** token (not a Sending token — those 403)                                                                                    | _(secret)_                              |
| `MAILTRAP_INBOX_ID`                           | Mailtrap inbox where test emails land                                                                                                        | _(secret)_                              |
| `MAILTRAP_ACCOUNT_ID`                         | Optional — skips the account-lookup API call if set                                                                                          | _(secret)_                              |
| `TEST_EMAIL_DOMAIN`                           | Domain for generated unique test emails                                                                                                      | `restaunax-test.com`                    |
| `SEND_DEMO_EMAILS`                            | `true` to run the demo-email surface (see "Email-sending tests" below). Unset/false = held, to protect the Mailtrap inbox quota              | `true`                                  |

---

## Email-sending tests

Some tests cause the backend to deliver **real email** into the quota-limited
Mailtrap sandbox. The **demo** surface is the heaviest (a demo submission emails
the requester, and follow-up actions email again), so it's **held off by
default** and gated behind `SEND_DEMO_EMAILS=true` (`DEMO_EMAILS_ENABLED` in
`utils/testData.ts`). When unset:

- `globalSetup` skips the per-run demo submission,
- `tests/dashboard/public/01-demo-request.spec.ts` TC-01 skips (TC-74/75 stay —
  they submit invalid forms that never send),
- `01-demo-management` TC-04 and all of `02-demo-actions` skip.

Set `SEND_DEMO_EMAILS=true` in `.env` to exercise them (e.g. when the inbox
quota has reset or you specifically need demo-email coverage).

> Other tests also send email but at far lower volume and aren't gated:
> admin **invite** (`users.spec`), **password reset** (TC-117), and self-serve
> **sign-up**. If the inbox quota is under pressure, `--grep-invert` those or
> hold them the same way.

---

## How to Run

```bash
# 1. Install (first time)
cd Automation
npm install
npx playwright install chromium

# 2. Configure environment
# Create Automation/.env with the variables listed above (no .env.example
# is checked in — .env holds live QA credentials, see the table above).

# 3. Run
npm test                           # all tests, headless
npx playwright test --project=customer   # one app only
npm run test:headed                # visible browser
npm run test:ui                    # interactive UI mode
npm run report                     # generate + open Allure report
npm run clean                      # delete artifacts
```

`workers: 1` is enforced in `playwright.config.ts` — tests run sequentially.

---

## Implemented Today

~99 real (non-scaffold) test cases across public, admin, owner, employee,
customer, access-control, API-level, and onboarding flows. TC numbers aren't
contiguous — some IDs were reserved for cases that turned out to be
inapplicable (route access denied, no UI to test), and new negative/gap-fill
cases picked up wherever the highest number left off, not by area. For the
current pass/skip status of every TC, see `TEST_CASES.md` and
`TEST_COVERAGE.md`; this is a by-area summary:

| Area                                              | Specs                                                                                              | What's covered                                                                                                                                                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public demo request                               | `dashboard/public/01-demo-request.spec.ts`                                                         | Submit `/demo` → success dialog (email confirmation skipped, needs Mailtrap); negative: unchecked terms, invalid email                                                                                      |
| Public sign-in / sign-up                          | `dashboard/public/{sign-in,sign-up}.spec.ts`                                                       | Valid/invalid login; registration + duplicate email, password mismatch, weak password                                                                                                                       |
| Admin demo management                             | `dashboard/admin/demo/{01-demo-management,02-demo-actions}.spec.ts`                                | Find request, status changes, proceed-to-onboarding; every action dialog exercises its real feature (notes save, follow-up email + Mailtrap delivery, assign, schedule, real delete via a throwaway record) |
| Admin restaurants                                 | `dashboard/admin/restaurants.spec.ts`                                                              | List loads, seed restaurant row visible                                                                                                                                                                     |
| Admin user management                             | `dashboard/admin/users.spec.ts`                                                                    | Full CRUD: invite dialog, list/search/filter, detail side sheet, role/status/permissions, invite→claim→login journey (Mailtrap-gated); negative: invalid role, nonexistent-user status toggle               |
| Owner restaurant list + management portal         | `dashboard/owner/{01-restaurant-list,02-restaurant-management}.spec.ts`                            | List page, portal shell, sidebar navigation, real Store Settings field edit/save (self-reverting)                                                                                                           |
| Owner menu management                             | `dashboard/owner/04-menu-management.spec.ts`                                                       | Create category, add item, edit item (TC-20→21→43 run serial); blank-field validation; category/item delete not exposed in current UI                                                                       |
| Owner orders                                      | `dashboard/owner/06-orders.spec.ts`                                                                | Orders tab loads, search bar + filters visible; empty-state search, Filters panel, order detail view                                                                                                        |
| Owner coupons                                     | `dashboard/owner/07-coupons.spec.ts`                                                               | Create Coupon form, fill + submit, Manage Coupons list; invalid discount % rejected; edit is `test.fixme` (real backend 500 bug)                                                                            |
| Owner payment settings (Stripe)                   | `dashboard/owner/08-payment-settings.spec.ts`                                                      | Setup page, stepper, pre-connection state (route-mocked), success/return page, failed create-account (route-mocked)                                                                                         |
| Owner Uber Eats / Subscription / Deals            | `dashboard/owner/{09-uber-settings,10-subscription,11-deals}.spec.ts`                              | Three previously-untested owner-reachable screens - page loads + a key section on each                                                                                                                      |
| Owner API-level negatives                         | `dashboard/owner/api-negative.spec.ts`                                                             | Raw backend calls: menu item no-name, coupon no-code/negative-value, garbage token, no-permission restaurant create, demo no-email                                                                          |
| Employee tax settings                             | `dashboard/employee/tax-settings.spec.ts`                                                          | Tax rate form loads, set + save (needs `EMPLOYEE_EMAIL`/`PASSWORD`)                                                                                                                                         |
| Employee restaurant creation                      | `dashboard/employee/restaurant-create.spec.ts`                                                     | Fills `CreateStore.tsx` Step 0, confirms `POST /restaurant/new` fires and the restaurant exists (needs `EMPLOYEE_EMAIL`/`PASSWORD`)                                                                         |
| Access control                                    | `dashboard/access/{role-restrictions,restaurant-management-access,unauthenticated-access}.spec.ts` | OWNER denied publish/tax/loyalty; owner/admin/employee reach shared screens; zero-session visitor redirected to sign-in                                                                                     |
| Customer menu browsing, checkout, order placement | `customer/{01-menu-browsing,02-checkout,03-order-placement}.spec.ts`                               | Reach menu, open item modal, seed cart, fill checkout form, full Stripe payment → Order Confirmed; DECLINED-card negative                                                                                   |

Still `test.fixme` / `test.skip` scaffolds: `dashboard/admin/chains.spec.ts`,
`dashboard/employee/menu-publish.spec.ts`, `dashboard/staff/staff-portal.spec.ts`,
`dashboard/owner/05-publish.spec.ts` (permanently skipped — OWNER is denied
that route), `dashboard/owner/07-coupons.spec.ts`'s coupon-edit case (real
backend bug, not a missing-test gap), and a few individual cases with no
corresponding UI (`TC-42` edit-category-name, `TC-44` delete-item).

**Not attempted:** the admin-side AI lead-onboarding wizard
(`LeadOnboarding.tsx`, reached via a "Lead Onboarding" tab under
`/restaurant/manage`) — the live QA deployment's `/restaurant/manage` page
doesn't match the checked-out frontend source at all (no such tab exists on
QA; QA instead shows a "STAFF CONSOLE" layout absent from the local frontend
repo). Needs someone to confirm which frontend branch/commit QA is actually
built from before this path is testable.

---

## Roadmap

Each remaining suite lands by filling its existing `test.fixme` placeholder
(or writing one where none exists yet) following the conventions above.

### Next up — remaining scaffolds

| Suite                                           | Key cases                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------- |
| `tests/dashboard/employee/menu-publish.spec.ts` | Employee publishes a menu; OWNER-denied already covered in `access/` |
| `tests/dashboard/admin/chains.spec.ts`          | Chain management (needs an `AdminChainsPage` POM)                    |
| `tests/dashboard/staff/staff-portal.spec.ts`    | RESTAURANT_STAFF PIN card                                            |

### Then — deeper coverage on existing screens

| Suite                                      | Key cases                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `tests/dashboard/owner/06-orders.spec.ts`  | Order status change, refund flow (needs an order-creation API helper)                          |
| `tests/dashboard/owner/07-coupons.spec.ts` | Re-enable the coupon-edit `test.fixme` once the backend `value`-as-string bug is fixed         |
| `tests/dashboard/owner/11-deals.spec.ts`   | Full create-deal flow (needs a deals API helper for setup/cleanup)                             |
| Admin/Employee lead onboarding             | Confirm QA's deployed frontend branch first; only then build coverage for `LeadOnboarding.tsx` |

### Later — Member ordering, POS, hardening

### Later — Member ordering, POS, hardening

- Reward-member checkout (needs the OTP login helper noted above)
- `tests/pos/**` API-level POS lifecycle (`POST /api/tablet/login`, status transitions)
- Cross-browser matrix, GitHub Actions on every PR, Allure flakiness trend

### Explicitly out of scope (all phases)

| Area                       | Reason                                              |
| -------------------------- | --------------------------------------------------- |
| Voice ordering (Retell AI) | Live phone calls — non-deterministic                |
| Social media posting       | External OAuth, third-party state                   |
| Analytics charts           | Read-only, visual — low regression risk             |
| Native mobile app UI       | React Native — covered at API level, not browser UI |
| Chat (real-time)           | WebSocket — hard to assert reliably                 |
| AI image/video generation  | External, rate-limited APIs                         |

---

_Last updated: 2026-07-03_
