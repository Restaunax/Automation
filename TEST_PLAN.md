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

> `tests/pos/` (Device In Store / POS) is **not** a Playwright project — it's an
> API-level placeholder. See **Role & Permission Model** and `tests/pos/README.md`.

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
│   │   │   ├── 01-demo-request.spec.ts       # ✅ real
│   │   │   ├── sign-in.spec.ts               # scaffold (test.fixme)
│   │   │   └── sign-up.spec.ts               # scaffold (test.fixme)
│   │   ├── admin/                            # the company manages everything
│   │   │   ├── demo/
│   │   │   │   ├── 01-demo-management.spec.ts  # ✅ real
│   │   │   │   └── 02-demo-actions.spec.ts     # ✅ real
│   │   │   ├── restaurants.spec.ts           # ✅ real
│   │   │   ├── users.spec.ts                 # ✅ real — full CRUD + invite/claim/login journey
│   │   │   └── chains.spec.ts                # scaffold (test.fixme)
│   │   ├── owner/                            # feature tests, owner as primary actor (shared screens)
│   │   │   ├── 01-restaurant-list.spec.ts    # ✅ real
│   │   │   ├── 02-restaurant-management.spec.ts  # ✅ real
│   │   │   ├── 04-menu-management.spec.ts    # ✅ real (POM: OwnerMenuPage; TC-20→21→43 run serial)
│   │   │   ├── 05-publish.spec.ts            # ⏭️ skipped — /publish is EMPLOYEE/ADMIN-only, OWNER denied
│   │   │   ├── 06-orders.spec.ts             # ✅ real
│   │   │   ├── 07-coupons.spec.ts            # ✅ real
│   │   │   └── 08-payment-settings.spec.ts   # ✅ real (route mocks Stripe status/create for pre-connection states)
│   │   ├── employee/                         # company-side setup staff
│   │   │   ├── restaurant-create.spec.ts     # scaffold (test.fixme)
│   │   │   ├── menu-publish.spec.ts          # scaffold (test.fixme)
│   │   │   └── tax-settings.spec.ts          # ✅ real — moved from owner/03-tax-settings; needs EMPLOYEE_EMAIL/PASSWORD
│   │   ├── staff/                            # thin /staff PIN-card stub (web)
│   │   │   └── staff-portal.spec.ts          # scaffold (test.fixme)
│   │   └── access/                           # who-can-reach-what matrix (uses pageForRole)
│   │       ├── restaurant-management-access.spec.ts  # scaffold (test.fixme) — owner/employee/admin reach shared screens
│   │       └── role-restrictions.spec.ts             # scaffold (test.fixme) — OWNER denied publish/tax
│   └── customer/                             # PROJECT: customer (baseURL = TEMPLATE_WIND_URL)
│       ├── 01-menu-browsing.spec.ts          # ✅ real (POM: CustomerMenuPage)
│       ├── 02-checkout.spec.ts               # ✅ real (POM: CustomerCheckoutPage)
│       └── 03-order-placement.spec.ts        # ✅ real — full Stripe checkout → Order Confirmed
├── pages/                                    # Page Object Models (factory functions)
│   ├── dashboard/
│   │   ├── auth/SignInPage.ts                # ✅ real
│   │   ├── public/DemoBookingPage.ts         # ✅ real
│   │   ├── admin/{AdminDemoManagementPage,AdminRestaurantsPage,AdminUsersPage}.ts  # ✅ real
│   │   ├── owner/{OwnerRestaurantListPage,OwnerRestaurantManagementPage,OwnerMenuPage,
│   │   │   OwnerOrdersPage,OwnerCouponPage,OwnerPublishPage,OwnerTaxPage,
│   │   │   OwnerPaymentSettingsPage}.ts      # ✅ real
│   │   └── restaurant/MenuManagementPage.ts  # ✅ real — role-agnostic (shared by owner/employee/admin access tests)
│   └── customer/
│       └── {CustomerMenuPage,CustomerCheckoutPage,CustomerOrderConfirmationPage}.ts  # ✅ real
├── fixtures/
│   └── base.ts          # ownerPage, adminPage, employeePage, customerPage, pageForRole, demoBookingPage, signInPage
├── utils/
│   ├── apiHelper.ts     # direct HTTP for setup/teardown (login, seed/delete restaurant, admin user mgmt)
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

`tests/pos/` is a placeholder folder (just a `README.md`) — it is intentionally
excluded from both Playwright projects in `playwright.config.ts`, since the
POS lives in device-in-store (React Native) and is tested at the API level,
not through browser automation. `tests/auth/` is an empty stub folder with no
files yet.

**Design principle:** the tree mirrors **app → role → feature** (how users
experience the product and how access is gated), **not** the React component
folder layout (which would couple tests to implementation details). POMs model
**screens/pages**, never components.

---

## Conventions

| Topic                 | Convention                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Folder axis**       | `tests/<app>/<role>/<feature>.spec.ts`. App first (different URLs/auth), then role (how access is gated), then feature.                                                                                                                                                                                                                                                    |
| **POM location**      | `pages/<app>/<role>/<Screen>Page.ts` — mirrors the test axis.                                                                                                                                                                                                                                                                                                              |
| **POM style**         | A **factory function** `create<Name>Page(page)` returning `{ goto, ...actions }`, plus an exported `type` via `ReturnType`. No classes. See `pages/dashboard/auth/SignInPage.ts`.                                                                                                                                                                                          |
| **Locators**          | Prefer role / name / label / placeholder. Template Wind has almost no `data-testid` → use role/text. Dashboard is MUI → role selectors (`[role="dialog"]`, `getByRole`). CSS class is a last resort.                                                                                                                                                                       |
| **Test titles**       | `TC-NN: description`. Add Allure `feature` / `severity` labels and wrap steps in `allure.step()` for readable reports (see the demo specs).                                                                                                                                                                                                                                |
| **Placeholders**      | Scaffolded specs use `test.fixme("TC-XXX: …", async ({ fixture }) => { … })`. They appear in `--list` as skipped and **never run or fail CI**. Each holds an Arrange-Act-Assert skeleton + the POM import so it's copy-paste-ready.                                                                                                                                        |
| **Imports**           | Relative paths (matching existing code). The `@pages/*`, `@utils/*`, `@fixtures/*` aliases exist in `tsconfig.json` if you prefer them.                                                                                                                                                                                                                                    |
| **Fixtures**          | Never log in inside a spec. Use `ownerPage` / `adminPage` / `customerPage`; auth is restored from storageState by `globalSetup` + `fixtures/base.ts`.                                                                                                                                                                                                                      |
| **Shared screens**    | A screen reachable by multiple roles gets a **role-agnostic POM** in `pages/dashboard/restaurant/`. Test the feature once (primary actor); cover cross-role access in `tests/dashboard/access/`. See "Shared capabilities".                                                                                                                                                |
| **Permissions/roles** | **Never hardcode** a permission name, an expected permission list, or the role set. Discover them at runtime (`GET /api/roles`, `/api/roles/:role/permissions`, `/api/roles/users/:id/permissions`) and assert on relationships — the catalog evolves. See `tests/dashboard/admin/users.spec.ts` and the `getRoles` / `getRolePermissions` / `getUserPermissions` helpers. |

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
import { readSharedState, generateRunId } from "../../../utils/testData";

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
    const couponCode = `AUTO${generateRunId()}`;

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
| `customerPage` / `customerContext` | **Guest** (no auth), baseURL = Template Wind                         | `tests/customer/**`                                     |
| `pageForRole(role)`                | Resolver → authenticated page for `"owner" \| "admin" \| "employee"` | `tests/dashboard/access/**` (who-can-reach-what matrix) |
| `signInPage`                       | Unauthenticated sign-in POM                                          | auth tests                                              |
| `demoBookingPage`                  | Unauthenticated `/demo` POM                                          | public demo tests                                       |

`globalSetup` saves owner/admin/employee sessions in parallel and warns (not
fails) when a role's `*_EMAIL`/`*_PASSWORD` pair is unset in `.env` — specs
for that role then skip via `test.skip(!EMAIL || !PASSWORD, ...)` rather than
throwing. `pageForRole("employee")` resolves once `EMPLOYEE_EMAIL` /
`EMPLOYEE_PASSWORD` are set.

**Customer restaurant target:** Template Wind is deployed per-restaurant.
`utils/testData.ts` → `readRestaurantId()` returns `TEMPLATE_WIND_RESTAURANT_ID`
(env override) or the restaurant seeded by `globalSetup`. Customer POMs append
`?restaurantId=<id>` to skip the location picker.

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

`globalTeardown.ts` runs **once after all tests**: deletes the seed menu item

- group (draining any leftover items first to avoid "Cannot Delete Category
  With Items"), deletes any users the admin user-management suite created
  (tracked via `recordUserForCleanup()` in `utils/testData.ts`), and removes all
  `*.tmp.json` files. Teardown errors are logged, never fail the run.

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

| Variable                               | Description                                                                                                                                  | Example                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `FRONTEND_URL`                         | Dashboard base URL (project `dashboard`)                                                                                                     | `https://app.qa.restaunax.com`          |
| `TEMPLATE_WIND_URL`                    | Template Wind base URL (project `customer`) — no code default; `qa.restaunax.com` serves the marketing site, not a per-restaurant deployment | `https://<restaurant>.qa.restaunax.com` |
| `TEMPLATE_WIND_RESTAURANT_ID`          | Optional override for the customer-site restaurant target                                                                                    | _(restaurant id)_                       |
| `BACKEND_URL`                          | Backend API base URL (used by `apiHelper`)                                                                                                   | `https://api.qa.restaunax.com`          |
| `OWNER_EMAIL` / `OWNER_PASSWORD`       | Owner account — must already own ≥1 QA restaurant                                                                                            | _(secret)_                              |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`       | Admin account (admin-flow tests, teardown cleanup)                                                                                           | _(secret)_                              |
| `EMPLOYEE_EMAIL` / `EMPLOYEE_PASSWORD` | Employee account — gates `tests/dashboard/employee/**`                                                                                       | _(secret)_                              |
| `MAILTRAP_API_TOKEN`                   | **Email Testing** token (not a Sending token — those 403)                                                                                    | _(secret)_                              |
| `MAILTRAP_INBOX_ID`                    | Mailtrap inbox where test emails land                                                                                                        | _(secret)_                              |
| `MAILTRAP_ACCOUNT_ID`                  | Optional — skips the account-lookup API call if set                                                                                          | _(secret)_                              |
| `TEST_EMAIL_DOMAIN`                    | Domain for generated unique test emails                                                                                                      | `restaunax-test.com`                    |

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

~50 real (non-scaffold) test cases across public, admin, owner, employee, and
customer flows. TC numbers aren't contiguous — some IDs were reserved for
cases that turned out to be inapplicable (route access denied, no UI to test).
For the current pass/skip status of every TC, see `TEST_CASES.md` and
`TEST_COVERAGE.md`; this is a by-area summary:

| Area                                              | Specs                                                                   | What's covered                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Public demo request                               | `dashboard/public/01-demo-request.spec.ts`                              | Submit `/demo` → success dialog (email confirmation skipped, needs Mailtrap)                                                          |
| Admin demo management                             | `dashboard/admin/demo/{01-demo-management,02-demo-actions}.spec.ts`     | Find request, status changes, all action-menu dialogs, proceed-to-onboarding                                                          |
| Admin restaurants                                 | `dashboard/admin/restaurants.spec.ts`                                   | List loads, seed restaurant row visible                                                                                               |
| Admin user management                             | `dashboard/admin/users.spec.ts`                                         | Full CRUD: invite dialog, list/search/filter, detail side sheet, role/status/permissions, invite→claim→login journey (Mailtrap-gated) |
| Owner restaurant list + management portal         | `dashboard/owner/{01-restaurant-list,02-restaurant-management}.spec.ts` | List page, portal shell, sidebar navigation                                                                                           |
| Owner menu management                             | `dashboard/owner/04-menu-management.spec.ts`                            | Create category, add item, edit item (TC-20→21→43 run serial); category/item delete not exposed in current UI                         |
| Owner orders                                      | `dashboard/owner/06-orders.spec.ts`                                     | Orders tab loads, search bar + filters visible                                                                                        |
| Owner coupons                                     | `dashboard/owner/07-coupons.spec.ts`                                    | Create Coupon form, fill + submit                                                                                                     |
| Owner payment settings (Stripe)                   | `dashboard/owner/08-payment-settings.spec.ts`                           | Setup page, stepper, pre-connection state (route-mocked), success/return page                                                         |
| Employee tax settings                             | `dashboard/employee/tax-settings.spec.ts`                               | Tax rate form loads, set + save (needs `EMPLOYEE_EMAIL`/`PASSWORD`)                                                                   |
| Customer menu browsing, checkout, order placement | `customer/{01-menu-browsing,02-checkout,03-order-placement}.spec.ts`    | Reach menu, open item modal, seed cart, fill checkout form, full Stripe payment → Order Confirmed                                     |

Still `test.fixme` / `test.skip` scaffolds: `dashboard/public/{sign-in,sign-up}.spec.ts`,
`dashboard/admin/chains.spec.ts`, `dashboard/employee/{restaurant-create,menu-publish}.spec.ts`,
`dashboard/staff/staff-portal.spec.ts`, `dashboard/access/**`,
`dashboard/owner/05-publish.spec.ts` (permanently skipped — OWNER is denied
that route), and a few individual cases with no corresponding UI
(`TC-42` edit-category-name, `TC-44` delete-item).

---

## Roadmap

Each remaining suite lands by filling its existing `test.fixme` placeholder
(or writing one where none exists yet) following the conventions above.

### Next up — Auth + Access Control

| Suite                                                         | Key cases                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `tests/dashboard/public/sign-in.spec.ts`                      | Valid login, invalid credentials, redirect                    |
| `tests/dashboard/public/sign-up.spec.ts`                      | New account registration                                      |
| `tests/dashboard/access/role-restrictions.spec.ts`            | OWNER denied publish/tax (all three role sessions now exist)  |
| `tests/dashboard/access/restaurant-management-access.spec.ts` | owner/admin/employee all reach shared menu-management screens |

### Then — Employee & Admin gaps

| Suite                                                | Key cases                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `tests/dashboard/employee/restaurant-create.spec.ts` | Employee creates a restaurant on behalf of a client        |
| `tests/dashboard/employee/menu-publish.spec.ts`      | Employee publishes a menu; OWNER-denied lives in `access/` |
| `tests/dashboard/admin/chains.spec.ts`               | Chain management (needs an `AdminChainsPage` POM)          |
| `tests/dashboard/staff/staff-portal.spec.ts`         | RESTAURANT_STAFF PIN card                                  |

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

_Last updated: 2026-07-02_
