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
│   │   │   ├── marketing-campaigns.spec.ts   # ✅ real — event list filters/status, seed-dedup regression, renew idempotency (API fixture)
│   │   │   ├── marketing-automations.spec.ts # ✅ real — lifecycle programs table, edit dialog (locked template), toggle, templateId API lock, safe run-now
│   │   │   ├── supply-shop.spec.ts           # ✅ real — Supply Shop admin: design queue + advisory preflight (wrong size = WARN with the numbers), Fulfil dialog (final price, out-of-estimate warning, comp), place-on-behalf, COMP → IN_PRODUCTION + gift-card batch + CSV export, finance memo (TC-456..468)
│   │   │   ├── gift-card-batches.spec.ts     # ✅ real — Physical card stock panel: mint / export CSV / freeze; public balance+validate on stock; adjust refused; unfreeze → INACTIVE; config knobs (TC-469..476)
│   │   │   └── chains.spec.ts                # ✅ real — grid loads (TC-181), admin creates a chain via the real UI flow (TC-223), link/unlink contract on the persistent Automation Chain (TC-323/324)
│   │   ├── owner/                            # feature tests, owner as primary actor (shared screens)
│   │   │   ├── 01-restaurant-list.spec.ts    # ✅ real
│   │   │   ├── 02-restaurant-management.spec.ts  # ✅ real (incl. real Store Settings field edit/save, self-reverting)
│   │   │   ├── 04-menu-management.spec.ts    # ✅ real (POM: OwnerMenuPage; TC-20→21→43 run serial; incl. blank-field validation)
│   │   │   ├── 04b-menu-availability.spec.ts # ✅ real — the ?tab=Menu page: 86 switch + ConsequenceDialog, Restore All, featured n/5, Refresh, empty state (TC-288..293)
│   │   │   ├── 04c-menu-item-editor.spec.ts  # ✅ real — builder cards, 4-step wizard (modifiers, image, templates), item detail (image/delete/reorder), presence smokes (TC-294..307)
│   │   │   ├── 17-chain-menu.spec.ts         # ✅ real — chain menu: shared vs location, $ dialog, per-location 86/carry, fan-out, scope dialogs (TC-308..319; TC-317 pin)
│   │   │   ├── api-menu.spec.ts              # ✅ real — menu API contract: normalisation, delete rules, chain overrides, authz pins (TC-263..287)
│   │   │   ├── 05-publish.spec.ts            # ⏭️ skipped — /publish is EMPLOYEE/ADMIN-only, OWNER denied
│   │   │   ├── 06-orders.spec.ts             # ✅ real — 33 tests: search hits, filters return the right rows, sort/paging, detail money/items/customer/delivery, full lifecycles, unpaid cancel, CSV export, header stats (own seed set)
│   │   │   ├── 06b-orders-journey.spec.ts    # ✅ real @stripe — customer places a real order (page) → owner sees/works/refunds it (ownerPage); TC-225/253/254
│   │   │   ├── api-orders.spec.ts            # ✅ real — order-management API contract (no browser): status allowlist, cancel-twice, refund-unpaid, INITIALIZED hidden, backwards-move pin, export
│   │   │   ├── 07-coupons.spec.ts            # ✅ real (incl. Manage Coupons list; coupon-edit is test.fixme — real backend bug)
│   │   │   ├── 08-payment-settings.spec.ts   # ✅ real (route mocks Stripe status/create for pre-connection + failure states)
│   │   │   ├── 09-uber-settings.spec.ts      # ✅ real — Uber Eats delivery settings (owner-reachable, unlike publish/tax/loyalty)
│   │   │   ├── 10-subscription.spec.ts       # ✅ real — Subscription/Billing page (permission-gated, not role-gated)
│   │   │   ├── 11-deals.spec.ts              # ✅ real — Manage Deals table (rows/search/filter/sort/expand/toggle/delete/cap banners), Create/Edit form, Deal Analytics, AI smoke (TC-86/87, TC-351..364; TC-358 pin)
│   │   │   ├── 18-chain-deals.spec.ts        # ✅ real — chain shell deals: Chain chip/rollup/View Analytics, member managed-at-chain-level, fan-out create (TC-365/366)
│   │   │   ├── api-deals.spec.ts             # ✅ real — deals API contract on a per-run throwaway tenant: create math, qty-1 split, windows, /validate, /quote charge+upcharge, stats, bulk, chain, authz (TC-325..350; 8 🔴 pins)
│   │   │   ├── 20-supply-shop.spec.ts        # ✅ real — Print Shop (owner): product offered gift-cards-on-or-off, estimate range + place with NO charge, designStarted email + CTA, proof changes/approve (409 on stale), admin finalise → Awaiting payment + Pay link, cancel, on-behalf order (TC-446..455)
│   │   │   ├── api-supply-shop.spec.ts       # ✅ real — owner supply-shop API contract: tier math + 25% spread, X-Restaurant-Id tenancy, search finds the gift card gift-cards-on-or-off, order list strips internals, proof/cancel refusals (TC-478..483)
│   │   │   ├── 16-marketing-automations.spec.ts  # ✅ real — Automated Marketing tab: master + per-program opt-out, API-verified + self-restoring (needs OWNER creds)
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
│       ├── 03-order-placement.spec.ts        # ✅ real — full Stripe checkout → Order Confirmed, incl. DECLINED-card negative
│       ├── 06-deals.spec.ts                  # ✅ real — deal builder, incomplete deal blocks checkout, coupon ⊥ deal client guard (TC-195..197)
│       ├── 06-menu-handoff.spec.ts           # ✅ real — owner menu action → storefront (TC-320..322)
│       └── 08-deals-handoff.spec.ts          # ✅ real — owner deal → storefront: Today's Deals ↔ toggle, multi-slot builder + checkout + page /quote, upcharge, 86'd slot, PAID Stripe order → orderDeals/timesUsed (TC-367..371)
├── pages/                                    # Page Object Models (factory functions)
│   ├── dashboard/
│   │   ├── auth/{SignInPage,SignUpPage}.ts   # ✅ real
│   │   ├── public/DemoBookingPage.ts         # ✅ real
│   │   ├── admin/{AdminDemoManagementPage,AdminRestaurantsPage,AdminUsersPage}.ts  # ✅ real
│   │   ├── owner/{OwnerRestaurantListPage,OwnerRestaurantManagementPage,OwnerMenuPage,
│   │   │   OwnerOrdersPage,OwnerCouponPage,OwnerPublishPage,OwnerTaxPage,
│   │   │   OwnerPaymentSettingsPage,OwnerUberSettingsPage,OwnerSubscriptionPage,
│   │   │   OwnerDealsPage,DealFormPage,DealAnalyticsPage,OwnerCreateRestaurantPage}.ts  # ✅ real
│   │   └── restaurant/{MenuManagementPage,MenuItemWizardPage,MenuItemDetailPage,LocationPricingDialog}.ts
│   │                                          # ✅ real — role-agnostic menu POMs: the ?tab=Menu page (createMenuAvailabilityPage; legacy alias createMenuManagementPage), the wizard, the item detail page, the per-location $ dialog
│   └── customer/
│       └── {CustomerMenuPage,CustomerCheckoutPage,CustomerOrderConfirmationPage}.ts  # ✅ real
├── fixtures/
│   └── base.ts          # ownerPage, adminPage, employeePage, pageForRole, demoBookingPage, signInPage, signUpPage
├── utils/
│   ├── apiHelper.ts     # direct HTTP for setup/teardown (login, seed/delete restaurant, admin user mgmt) + raw negative-case helpers (createMenuItemRaw, createCouponRaw, createRestaurantRaw, submitDemoRequestRaw, updateUserRoleRaw, toggleUserStatusRaw, register)
│   ├── emailHelper.ts   # Mailpit inbox polling + invite-token extraction
│   ├── auth.ts          # loginViaUi() — fresh-context UI login for arbitrary (non-seeded) users
│   ├── testData.ts      # generators, shared-state, readRestaurantId(), URLs, cleanup tracking
│   ├── stripeCards.ts   # Stripe test card + expiry/CVC constants (STRIPE_DEFAULTS.EXPIRY_MM_YY)
│   ├── pdfFixture.ts    # buildFlatPdf() / giftCardPassingPdf() / letterPdf() — dependency-free PDFs for the supply-shop artwork preflight
│   └── stripeHelper.ts  # fillStripePaymentElement() — fills the Stripe iframe
├── globalSetup.ts       # runs once before all tests
├── globalTeardown.ts    # runs once after all tests
├── playwright.config.ts # two projects: dashboard + customer
└── TEST_PLAN.md         # this file
```

`tests/pos/` is the **`pos` Playwright project** — API-level order-lifecycle
coverage (the POS lives in device-in-store / React Native, so it's tested
through the backend, not a browser). Helpers: `createSeededOrder` (Stripe-free
real-price order, bumped past INITIALIZED), `createTabletDevice` / `tabletLogin`, `updateOrderStatus`,
`getCurrentOrders` in `utils/apiHelper.ts`. `03-open-checks.spec.ts`
(TC-372..383) covers table-service open checks on a per-run throwaway tenant
via the full POS auth chain (tablet JWT + `X-Staff-Session` + register
session) — helpers: `setOwnerPosPin`, `tabletStaffSignIn`,
`openRegisterSessionPos`, `createTabletOrderRaw`, the `settleTab*Raw` /
`*TerminalIntentRaw` / `transferTabTableRaw` family. See `tests/pos/README.md`.
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
settings that in principle affect concurrent customer-order pricing. The
Orders tests that assert totals (TC-240, TC-253) read the expected amounts
back from the seed/checkout RESPONSE at the moment the order was priced —
never from a hand-computed sum — so a concurrent tax change moves the
recorded value and the displayed value together and cannot break them. Keep
that rule for any future totals assertion (or pin a private restaurant).

---

## Helpers

`utils/`:

| Helper            | Provides                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiHelper.ts`    | `apiLogin()`, restaurant/menu seed + cleanup, the admin user-management API (`inviteUserApi`, `adminCreateUser`, `registerWithInvite`, `getMe`, role/permission discovery, `deleteRecordedUsers`), and order seeding/contract helpers: `createSeededOrder()` (Stripe-free, returns the SERVER-recorded `SeededOrder` — money, receipt, contact snapshot; opts for name/phone/address/guest/`status:null`), `listOrders(Raw)`, `getOrderStats(Raw)`, `updateOrderStatusRaw`, `cancelOrderRaw`, `refundOrderRaw`, `exportOrdersRaw` |
| `csvHelper.ts`    | `parseCsv()` / `csvToObjects()` — RFC-4180 parser for asserting on exported CSVs (Orders export)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `pdfFixture.ts`   | `buildFlatPdf()` / `giftCardPassingPdf()` / `letterPdf()` — hand-assembled single-page PDFs (right size + bleed → preflight passes; US Letter → BLOCK) for the supply-shop artwork step, no PDF library needed                                                                                                                                                                                                                                                                                                                    |
| `testData.ts`     | `generateDemoFormData()`, `generateRestaurantData()`, `generateUserEmail()`, `generateSeedPhone()` (NANP-valid 10 digits), `generateSeedSurname()`, `read/writeSharedState()`, `readRestaurantId()`, cleanup-file tracking, `FRONTEND_URL`, `TEMPLATE_WIND_URL` (the ONE storefront constant — POMs import it; never re-default it locally)                                                                                                                                                                                       |
| `emailHelper.ts`  | `waitForEmail()` (Mailpit inbox polling), `extractInviteToken()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `auth.ts`         | `loginViaUi()` — fresh-context UI login for an arbitrary (non-seeded) user, e.g. an invitee who just claimed their account                                                                                                                                                                                                                                                                                                                                                                                                        |
| `stripeCards.ts`  | Stripe test card numbers + `STRIPE_DEFAULTS` (incl. `EXPIRY_MM_YY` — the only expiry value the "MM / YY" masked input accepts without truncating to the wrong year)                                                                                                                                                                                                                                                                                                                                                               |
| `stripeHelper.ts` | `fillStripePaymentElement()` — fills the Stripe iframe fields                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Still open:**

- **Customer OTP login** — no helper yet for `POST /login/send-otp` +
  `/login/verify-otp` (reward-member sessions). Customer tests today are
  guest-only. NOTE (2026-07-19): the backend DOES have a fixed-OTP bypass
  (`src/utils/testPhones.ts` — phone `5555550100`, code `123456`), but that
  number is the App/Play Store **reviewer demo account** and the bypass is
  live in production — don't churn its points/credit from automation. Ask the
  backend to add a second, QA-scoped test phone before building the helper.
- **Finish TC-02 (demo confirmation email)** — no longer blocked on sandbox
  credentials (QA's Mailpit is wired into CI). The test is still `test.skip`
  because it never submits the form: it generates an address and waits for mail.
  Self-seed via `submitDemoRequestRaw` like the sibling demo specs, gate on
  `MAILPIT_BASE_URL`, tag `@demo @email`.
- **POS / tablet API harness** — largely built now: `POST /api/tablet/login` +
  order-status transitions (TC-100), the staff-session / register-session
  chain (`setOwnerPosPin` → `tabletStaffSignIn` → `openRegisterSessionPos`)
  shipped with the open-checks suite (TC-372..383), and register
  **open/close** + the drawer-exclusivity lock now have their own dedicated
  file (`pos/08-register-cash.spec.ts`, TC-426..433) — close it off the
  remaining list. Remaining: capability-gated flows beyond MANAGER self-auth
  (void/comp/discount approvals), peer-to-peer register **handover**, and
  cash drops.

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
| `MAILPIT_BASE_URL`                            | QA's self-hosted Mailpit sandbox — the API the email tests read, and the UI a human opens. Unset ⇒ the `@email` group skips                  | `https://mail.qa.restaunax.com`         |
| `MAILPIT_UI_USER` / `MAILPIT_UI_PASSWORD`     | Mailpit HTTP basic auth. Not part of the skip gate on purpose: a missing password should 401 loudly, not skip silently                       | _(secret)_                              |
| `TEST_EMAIL_DOMAIN`                           | Domain for generated unique test emails                                                                                                      | `demomailtrap.co`                       |

---

## Test execution strategy

Some tests make the backend deliver **real email**. QA routes all outbound mail
to a **self-hosted Mailpit sandbox** (backend `EMAIL_SANDBOX_PROVIDER=mailpit`),
readable by humans at <https://mail.qa.restaunax.com>. It is unmetered, so these
tests run in **every** invocation — including the nightly.

> History: until 2026-07 QA used a Mailtrap sandbox capped at 500 messages/month,
> and the `@email` group was excluded from every run to protect that budget. The
> cap is gone; so is the exclusion. Don't reintroduce quota reasoning.

**Tags** — now selectors, not exclusions:

- `@email` — the test causes a backend email send.
- `@demo` — the demo subset of `@email` (demo request / management / actions).
- `@smoke` — the **deploy smoke lane** (added 2026-08-17): ~12 fast, side-effect-free
  tests spanning every role and the API layer (sign-in, owner restaurant list, menu
  builder + Menu tab, Orders tab, Customers tab, admin restaurants, owner→menu access,
  customer menu page, menu + orders API contract). `e2e.yml` runs ONLY this tag on the
  `qa-deploy` dispatch (each backend deploy) — "did this deploy break QA?" in ~2 min —
  and skips the Allure Pages publish for it; the full suite is the nightly's job.
  `npm run test:smoke` locally. Keep it small and boring: no `@email`, no Stripe,
  nothing that seeds more than a few rows; add a test here only when its screen going
  down would be an incident. Rationale: GitHub Actions minutes — see CLAUDE.md → CI.

**How selection works.** There is no `grepInvert` and no opt-in env flag. Every
invocation — `npm test`, a bare `npx playwright test`, the nightly — runs the
whole suite. `test:email` / `test:demo` are plain `--grep` shortcuts.

**Shared-inbox contract.** The Mailpit inbox is shared across runs, across
parallel workers, and with humans reading the UI. Two rules keep that safe, both
enforced in `utils/emailHelper.ts`:

1. Generate a **unique recipient per test** (`generateUserEmail` /
   `generateDemoFormData`) — matching is on the exact recipient address.
2. **Never delete.** No test may call `DELETE /api/v1/messages`; staleness is
   handled by a client-side `Created` timestamp guard, not by emptying the inbox.

| I want to…                    | Command                                                                | Sends email?   |
| ----------------------------- | ---------------------------------------------------------------------- | -------------- |
| Run the normal suite          | `npm test`                                                             | Yes            |
| Run just the test I'm writing | `npx playwright test -g "TC-142"` (or a file path) / `npm run test:ui` | If it's tagged |
| Validate the email flows      | `npm run test:email`                                                   | Yes            |
| Validate just the demo flow   | `npm run test:demo`                                                    | Yes            |

**Which tests are `@email`:** demo TC-01 / TC-04 / all of 02-demo-actions
(`@demo @email`); admin **invite** TC-101, **password reset** TC-117, and the
**invite → claim → login** journey TC-123; self-serve **sign-up** TC-93/94.
Negative/validation cases that never send (TC-74/75, TC-95/96, duplicate-invite
TC-104) are untagged and keep running. Order-confirmation from a completed
checkout (TC-26, TC-178, ~1 email each) also stays in the default run. The
gift-card **purchase** tests (TC-165/166/169) are **not** `@email` — they're
`test.fixme` (blocked by Stripe Radar's invisible hCaptcha; see TEST_COVERAGE →
Known Technical Debt); the non-purchase gift-card cases (TC-167/168/170) keep
running.

**CI.** `e2e.yml` runs the `@email` group along with everything else, on every
trigger. It is the ONLY workflow that runs Playwright — `e2e-email-weekly.yml`
was deleted on 2026-07-19 (it existed solely to keep `@email` out of the main
suite under the old Mailtrap cap). To run just the email tests, use `--grep
@email` locally via `npm run test:email`; there is no separate CI job for it.

**When the suite runs.** Four triggers: (1) **nightly** 06:00 UTC — the daily
net for QA drift / expiring data (full suite); (2) **automatically after each
healthy QA backend deploy** — the backend's `post-deploy-smoke.yml` fires
`repository_dispatch: qa-deploy`, which `e2e.yml` listens for (full suite; needs
the `AUTOMATION_DISPATCH_TOKEN` secret on the backend repo; RestauNax PR #499);
(3) **automatically after each template-wind QA deploy** — wind's
`notify-e2e.yml` fires `repository_dispatch: template-deploy` and `e2e.yml` runs
**only the customer project** (one storefront changed; report publishes to the
`wind-deploy/` Pages subfolder; same token secret on the wind repo); (4)
**manual** `workflow_dispatch`. Keep the nightly even with the deploy-triggers
live — they fire only on deploys, so quiet days and env drift still need the
schedule. Every run publishes the hosted Allure report →
**https://restaunax.github.io/Automation/**.

**Local dev.** When writing or iterating on a test, run just that one
(`npx playwright test <file>` / `-g TC-XX` / `npm run test:ui`) — don't run the
whole suite to check one test. `globalSetup` sends no mail, so any default run is
safe by construction.

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

For everything this suite structurally cannot reach — hardware, OS-level
gestures, carrier SMS delivery — see `docs/PHYSICAL_TEST_LEDGER.md`, this
repo's release-gate companion to the automated coverage below.

| Area                                              | Specs                                                                                                                                                 | What's covered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public demo request                               | `dashboard/public/01-demo-request.spec.ts`                                                                                                            | Submit `/demo` → success dialog (email confirmation skipped — see Roadmap); negative: unchecked terms, invalid email                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Public sign-in / sign-up                          | `dashboard/public/{sign-in,sign-up}.spec.ts`                                                                                                          | Valid/invalid login; registration + duplicate email, password mismatch, weak password                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Admin demo management                             | `dashboard/admin/demo/{01-demo-management,02-demo-actions}.spec.ts`                                                                                   | Find request, status changes, proceed-to-onboarding; every action dialog exercises its real feature (notes save, follow-up email + Mailpit delivery, assign, schedule, real delete via a throwaway record)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Admin restaurants                                 | `dashboard/admin/restaurants.spec.ts`                                                                                                                 | List loads, seed restaurant row visible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Admin user management                             | `dashboard/admin/users.spec.ts`                                                                                                                       | Full CRUD: invite dialog, list/search/filter, detail side sheet, role/status/permissions, invite→claim→login journey (Mailpit-gated); negative: invalid role, nonexistent-user status toggle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Owner restaurant list + management portal         | `dashboard/owner/{01-restaurant-list,02-restaurant-management}.spec.ts`                                                                               | List page, portal shell, sidebar navigation, real Store Settings field edit/save (self-reverting)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Owner menu management                             | `dashboard/owner/{04-menu-management,04b-menu-availability,04c-menu-item-editor,17-chain-menu,api-menu}.spec.ts` + `customer/06-menu-handoff.spec.ts` | **Builder (04):** create category, add item, edit item, blank-field validation, delete rules. **Menu tab (04b):** 86 switch with ConsequenceDialog + PATCH payload + chips, Restore All, featured n/5 + cap, Refresh, empty state. **Wizard / detail (04c):** presets + duplicate, step-0 rules, 3 modifier pricing modes saved + shown, image upload, template gallery, clone item, card→detail→edit, detail image round-trip, soft delete + 409 blocked delete, keyboard reorder, presence smokes. **Chain (17):** location banner/chips, chain shell shared view, $ dialog per-location price + reset, per-location 86 / carry, fan-out rename, "Who is this item for?", category scope + fan-out confirm, chain-wide featured, quick-adjust, Manage shared menu → location builder; TC-317 pin (Reset all to shared). **API (api-menu):** public read, modifier normalisation, changes diff, reorder, availability, reset, featured cap, soft/permanent delete, 409 blockers, category delete, override rules incl. all chain cases, TC-282 pin (chain reset) + TC-283..286 IDOR pins + TC-287 positive control. **Storefront (customer/06):** 86 hides on Wind, per-location price shown AND quoted (public /quote), uncarry hides at one location. Strategy: `docs/MENU_TAB_TEST_STRATEGY.md`.                                                                                                                                                                                                  |
| Owner deals                                       | `dashboard/owner/{11-deals,18-chain-deals,api-deals}.spec.ts` + `customer/{06-deals,08-deals-handoff}.spec.ts`                                        | **Table (11):** rows cell-for-cell, search/filter/sort/expand, switch (cap-tolerant), delete confirm, cap banners + refused toggle, TC-358 pagination pin. **Form (11):** validation + live math, create (split slots), edit. **Analytics / AI (11):** cards = `/stats`, generator smoke (never generates). **Chain (18):** Chain chip / rollup / View Analytics, member disabled, fan-out create. **API (api-deals, throwaway tenant):** create math + qty-1 invariant, validation, list projections, patch, status, hard delete, public `/active` windows + `/validate`, cap contract (TC-334/335b pins), PUT validation pin, `/quote` charge + upcharge + rejections, coupon ⊥ deal pin, stats, bulk (aiGenerated pin), AI questions, chain scope, 401s, IDOR pins TC-347..350 + chain positive control. **Storefront (customer/06, 08):** builder / incomplete / coupon guard; Today's Deals ↔ owner toggle, multi-slot builder + summary + page `/quote`, upcharge, 86'd slot, paid order → `orderDeals` + `timesUsed` + dashboard/analytics. Strategy: `docs/DEALS_TAB_TEST_STRATEGY.md`.                                                                                                                                                                                                                                                                                                                                                                                                       |
| Owner orders                                      | `dashboard/owner/{06-orders,06b-orders-journey,api-orders,api-orders-authz}.spec.ts`                                                                  | **Layer 2 (06):** search by receipt/name/email returns the right rows (phone = TC-262 expected-fail, real backend int4-overflow bug), search-mode banner + Clear, status/type filters return exactly the seeded rows, filter badge, sort by amount, server paging, refresh, detail sheet money rows == backend-recorded values, items/instructions, Customer Info (+Guest/N/A), Delivery Info, full pickup + delivery lifecycles via "Mark as", unpaid cancel + Keep Order, CSV export content (32 cols, exact rows), export disabled at 0, header stat cards (API delta + cards==JSON + Today preset), empty date range, bad deep link. **Layer 3 (06b, @stripe):** real customer order → same receipt/items/total/contact in the owner sheet → worked to Picked Up (TC-253); Cancel & Refund → real refund + customer-side REFUNDED + refund email (TC-225/254). **Layer 1 (api-orders):** invalid status 400, cancel-twice 400, refund-unpaid 400, INITIALIZED hidden unless explicit, backwards moves pinned (259b fixme), export 0-rows 400 + CSV shape, sort/paging. **Auth/tenant pins (api-orders-authz, TC-226..230):** /api/order/now deleted (404), cross-tenant statistics reads/export 403, unknown order 404-first, mutating paths 403, no-token 401 — pins for RestauNax #621; second tenant minted per run (`createSecondOwner`, no OWNER2 secret needed); receipt route pinned as an everyone-500 backend bug (TC-227b, fixme twin 227c). See `docs/ORDERS_TAB_TEST_STRATEGY.md` §1. |
| Owner coupons                                     | `dashboard/owner/07-coupons.spec.ts`                                                                                                                  | Create Coupon form, fill + submit, Manage Coupons list; invalid discount % rejected; Free Delivery type (value field hidden, persists as FREE_DELIVERY); edit is `test.fixme` (real backend 500 bug)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Admin marketing campaigns (event scheduler)       | `dashboard/admin/marketing-campaigns.spec.ts`                                                                                                         | Events default to Upcoming, Past hides live events; recurring-holiday dedup regression; renew-twice idempotency via API fixture (own org coupon + event, self-cleaning); org coupon form offers Free Delivery (value hidden, fee-cap relabel, cancelled without creating)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Admin marketing automations (lifecycle programs)  | `dashboard/admin/marketing-automations.spec.ts`                                                                                                       | Win-Back/Welcome/VIP rows + caps UI; edit dialog per-type fields, view-only template, cooldown round-trip; enable toggle (state-restoring); templateId PATCH ignored; run-now on disabled → 400; `@email` TC-210 runs an ENABLED Win-Back for real (QA mail is sandboxed to the shared Mailpit inbox) with the daily cap pinned to 1 and full state restore — send row → SENT → Mailpit delivery; stats endpoint returns the full funnel; SMS channel switch reveals the message editor (draft-only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Owner automated marketing (lifecycle opt-out)     | `dashboard/owner/16-marketing-automations.spec.ts`                                                                                                    | `?tab=marketing-automations` deep link renders every program; master switch ↔ `lifecycleMarketingOptOut`; per-program pause leaves siblings untouched — all API-verified and state-restoring                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Owner payment settings (Stripe)                   | `dashboard/owner/08-payment-settings.spec.ts`                                                                                                         | Setup page, stepper, pre-connection state (route-mocked), success/return page, failed create-account (route-mocked)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Owner Uber Eats / Subscription / Deals            | `dashboard/owner/{09-uber-settings,10-subscription,11-deals}.spec.ts`                                                                                 | Three previously-untested owner-reachable screens - page loads + a key section on each                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Owner API-level negatives                         | `dashboard/owner/api-negative.spec.ts`                                                                                                                | Raw backend calls: menu item no-name, coupon no-code/negative-value, garbage token, no-permission restaurant create, demo no-email                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Employee tax settings                             | `dashboard/employee/tax-settings.spec.ts`                                                                                                             | Tax rate form loads, set + save (needs `EMPLOYEE_EMAIL`/`PASSWORD`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Employee restaurant creation                      | `dashboard/employee/restaurant-create.spec.ts`                                                                                                        | Fills `CreateStore.tsx` Step 0, confirms `POST /restaurant/new` fires and the restaurant exists (needs `EMPLOYEE_EMAIL`/`PASSWORD`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Access control                                    | `dashboard/access/{role-restrictions,restaurant-management-access,unauthenticated-access}.spec.ts`                                                    | OWNER denied publish/tax/loyalty; owner/admin/employee reach shared screens; zero-session visitor redirected to sign-in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Customer free-delivery coupon                     | `customer/07-free-delivery.spec.ts`                                                                                                                   | FREE_DELIVERY code rejected on pickup; on delivery the fee flips to "Free" after apply (needs template-wind #60 deployed; delivery-provider skips mirror TC-126)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Customer menu browsing, checkout, order placement | `customer/{01-menu-browsing,02-checkout,03-order-placement}.spec.ts`                                                                                  | Reach menu, open item modal, seed cart, fill checkout form, full Stripe payment → Order Confirmed; DECLINED-card negative                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| POS table-service open checks                     | `pos/03-open-checks.spec.ts`                                                                                                                          | **API (TC-372..383, throwaway tenant + REGISTER device + staff session + drawer):** flag gate (`tableServiceEnabled` off → 403), open → DINE_IN/CONFIRMED/unpaid + table fields stamped, tender-at-open 400s (payments[]/gift/cashDiscount/processingFee/DELIVERY), `/api/tablet/tables` summary (remaining = total, DAILY orderNumber + receiptNumber, serverName), table transfer, mid-meal modify (total ↑, remaining follows, balanceDue stays 0), 2-leg cash close `@smoke` (paymentStatus COMPLETED), even 3-split with idempotencyKey replay (same leg, no double-collect) + post-close 400, per-leg tip math (Order.tip/total bump, remaining consumes share only), gift-leg negatives (unknown code / smuggled tip 400 — happy path TODO: QA has no gift-card mint path without a real succeeded PaymentIntent), card-leg create-intent validations + PENDING-leg semantics + idempotent cancel (capture = device-lane, needs a physical reader), cancel guard (settled leg → 400, fresh check cancels + leaves the grid). Feature contract: `restaunax/docs/features/TABLE_SERVICE_OPEN_CHECKS.md`.                                                                                                                                                                                                                                                                                                                                                                                         |
| POS floor & tables registry                       | `pos/04-floor-tables.spec.ts`                                                                                                                         | **API (TC-384..395, own throwaway tenant):** section/table/combination CRUD, owner OR-gate (`tableServiceEnabled` OR `TABLE_RESERVATIONS`) vs. every tablet host-stand write gating on the entitlement ALONE, `GET /api/tablet/floor` derived payload + ghost-table regression, layout batch-save, merge (repoints the open check, cleans up the source table), unreferenced hard-delete vs. referenced soft-deactivate, POS table CRUD + table-state capability splits (STAFF/MANAGER/HOST_MANAGE_RESERVATIONS/MANAGE_TABLES), floor-state derivation (OCCUPIED/AVAILABLE).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| POS reservation configuration                     | `pos/05-reservations-config.spec.ts`                                                                                                                  | **API (TC-396..405, own throwaway tenant, pure owner-JWT — no tablet/device):** `ReservationSettings`/`ServicePeriod`/`TurnTime`/`DateOverride` CRUD + validation (partial PUT, out-of-range refused not clamped, `reminderLeadMinutes` bounds), pacing guard (`onlineBookingEnabled` needs ≥1 paced period), duplicate-period 409, turn-time overlap/inverted-range refusals, date-override upsert-by-date, owner phone-booking create — confirmed ADVISORY (`mode: "staff"`), never enforcing min-notice/advance-window like the public STRICT path does.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| POS reservation lifecycle                         | `pos/06-reservations-lifecycle.spec.ts`                                                                                                               | **API (TC-406..417, own throwaway tenant + REGISTER device + staff session):** the full book → arrive → seat → link → settle-in-cash arc `@smoke` (TC-406), seat-conflict capability split (STAFF sees 409; MANAGER's `OVERRIDE_RESERVATION_CONFLICT` bypasses it entirely and re-assigns the table, confirmed live), double-link 409, not-linkable 400, early no-show capability split, `clientRequestId` replay, advisory overbook past the paced cap, host list shape, transfer on a seated check, cancelling the order unlinks the reservation but does NOT revert its status (confirmed: stays SEATED, per `tabletOrderController.ts`'s own design comment), transition-refusal (complete on never-seated BOOKED). TC-417 (`RESERVED_SOON` floor state) is `test.fixme` — no write path assigns a table without seating it; see `docs/PHYSICAL_TEST_LEDGER.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| POS waitlist + public self-service booking        | `pos/07-waitlist-public.spec.ts`                                                                                                                      | **API (TC-418..425, own throwaway tenant + REGISTER device + staff session, no register session opened):** waitlist add (defaults kind WAITLIST, requires phone) + notify (BOOKED → NOTIFIED with expiry), public availability (window-clipped slots, empty+closed on an overridden date), public create returns a manage link with a public-safe manage view, manage-cancel 409 on repeat DELETE (not the owner surface's 400) and on cancel-after-seated (PUBLIC scoped to BOOKED/CONFIRMED only), per-phone cap, `onlineBookingEnabled` gate flip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| POS register / cash drawer                        | `pos/08-register-cash.spec.ts`                                                                                                                        | **API (TC-426..433, own throwaway tenant + a deliberate SECOND device):** open/close lifecycle (settle-cash refused with no open register; `DEVICE_NOT_REGISTER` on a non-REGISTER device; a second open on the same device refused), cash-tendered change math, idempotency replay (same key twice → one payment row), drawer-exclusivity lock (`STAFF_TERMINAL_LOCKED` on a second PIN staff's sign-in while the register is open elsewhere — fires before any drawer-ownership check is reached), split tenders, blind-count close (`overShort = countedCash − expectedCash`, confirmed negative = short).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Owner portal — Tables & Floor (browser)           | `dashboard/owner/18-tables-floor.spec.ts`                                                                                                             | **Browser (TC-434..439, throwaway tenant, real UI clicks — API wrappers do setup/assertions):** Store Operations flyout nav gating (OR-gate; an unentitled tenant sees neither Tables & Floor nor Reservations), section + table create through the real forms, Unplaced-tray → canvas placement (native HTML5 drag can't be driven by Playwright/CDP — falls back to the equally first-class click-to-place path, see `docs/PHYSICAL_TEST_LEDGER.md`) persisting across reload, edit-panel capacity/bookable save, "Merge into…", deactivate, delete — all confirmed against the owner API.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Owner portal — Reservations (browser)             | `dashboard/owner/19-reservations.spec.ts`                                                                                                             | **Browser (TC-440..445, throwaway tenant, real UI clicks):** settings save through one button, pacing-guard UX (zero capped periods renders the server's refusal inline, booking stays OFF), a capped service period unblocking the toggle, turn-time band overlap refused with the server's 409 shown verbatim — surfaced a real accessibility bug (an error Snackbar behind an open SideSheet is `aria-hidden`, see `docs/PHYSICAL_TEST_LEDGER.md`), date-override close/delete, phone-booking dialog → confirmation code + day-view status chip + cancel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Owner portal — Print Shop (browser)               | `dashboard/owner/20-supply-shop.spec.ts`                                                                                                              | **Browser (TC-446..455, throwaway tenant, real UI clicks):** the physical gift card is offered to every restaurant, gift cards on or off (fulfilling a run switches them on); brief form quotes a RANGE and says "You won't be charged now"; placing charges nothing → "We're designing it" + `designStarted` email whose CTA opens the Print Shop tab; proof → "I'd like changes" (email quotes the note) → stale approve 409 → "Looks good" → PLACED; admin finalise on a card-less tenant → "Awaiting payment" + "Pay $207.00 to print" (Stripe hosted link, never completed on QA) + `paymentNeeded` email; cancel from AWAITING_PAYMENT; on-behalf order never leaks admin notes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Owner supply-shop API contract                    | `dashboard/owner/api-supply-shop.spec.ts`                                                                                                             | Quote math per tier (100/250/500) with the 25% spread on subtotal AND shipping, below-minimum 400; `X-Restaurant-Id` tenancy (foreign restaurant refused); search finds the gift card whether gift cards are on or off; owner list strips vendor cost / admin notes / pendingFulfilment; proof actions refused without a proof; cancel twice refused (TC-478..483).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Admin supply shop (browser)                       | `dashboard/admin/supply-shop.spec.ts`                                                                                                                 | **Browser (TC-456..468, adminPage + own tenant):** design queue row; US-Letter artwork measured and WARNED (never blocked — size is the printer's call); Upload artwork dialog → "Send to restaurant" → PROOF_READY + "With owner"; Fulfil dialog prefill / range line / warn-only out-of-estimate / margin line; "Finalise & charge" with no saved card → payment-link notice + "Awaiting owner payment"; place-on-behalf dialog; COMP end-to-end → IN_PRODUCTION, total 0, **gift-card batch minted**, "on us" email, Finance compedCost up; "Card export" download = the printer's data file (header, 16-char no-look-alike codes, barcode_value = code, LF, EXPORTED); fulfil negatives (FINAL_PRICE_REQUIRED, COMP_REASON_REQUIRED, invoice without credit); idempotent minting; liability unchanged by stock; employee 403.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Admin physical gift card batches (browser)        | `dashboard/admin/gift-card-batches.spec.ts`                                                                                                           | **Browser (TC-469..476):** mint 5 → 5 in stock; export CSV (quoted free text, batch EXPORTED, exportCount 1); public balance → 200 INACTIVE / validate → not activated / unknown → 404; admin adjust on stock → 409 NOT_ACTIVATABLE; freeze → 5 frozen, again → 0; unfreeze → INACTIVE not ACTIVE; quantity 0 / 5001 refused; config round-trips allowPhysicalActivation / allowCashFunding / maxCashFloatPerLocation (negative cap 400).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Dual pricing v2 — POS / API contract              | `pos/09-dual-pricing.spec.ts`                                                                                                                         | Own throwaway tenant (the menu conversion is a one-way stamp). Admin-only enrollment + card markup (≤5%), enable refused until a markup exists, mutual exclusion with the fee pass-through; one-time menu conversion (12.95→13.40, 3.00→3.11 at 3.5%) with `cashPrice` pairs on the menu and 409 on re-run; tablet settings `dualPricing` contract with four notices; register cash order priced at the cash tier (pre-tax discount, tax on the cash base); mismatched / card / split claims refused; untouched check settled whole in cash via `applyCashDiscount` (collects exactly the cash total), partly paid check refused; public /details leaks no program flags. Gated on `DUAL_PRICING_V2=1` until the backend is on QA (TC-484..493; TC-492 fixme).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Dual pricing v2 — online stays card-only          | `customer/09-dual-pricing.spec.ts`                                                                                                                    | TC-495: with the shared restaurant dual-priced (restored in finally), the wind checkout shows the single card price — no cash wording, no fee line. Gated on `DUAL_PRICING_V2=1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Dual pricing v2 — dashboard UI                    | `dashboard/owner/dual-pricing.spec.ts`                                                                                                                | TC-494 fixme until the dashboard build is on QA (markup field, Convert menu dialog, Order Settings gating).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Customer checkout — physical card stock           | `customer/02-checkout.spec.ts`                                                                                                                        | TC-477: an unloaded (INACTIVE) card from a minted batch is refused at checkout — the redemption side of physical cards, next to TC-171's funded card.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Still `test.fixme` / `test.skip` scaffolds: `dashboard/employee/menu-publish.spec.ts`,
`dashboard/staff/staff-portal.spec.ts` (blocked — no `RESTAURANT_STAFF` credentials),
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
| `tests/dashboard/staff/staff-portal.spec.ts`    | RESTAURANT_STAFF PIN card — blocked until real credentials exist     |

### Then — deeper coverage on existing screens

| Suite                                      | Key cases                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Menu — follow-ups                          | Pins flipped 2026-08-17 (RestauNax #602); RestauNax frontend testids for the chain chips / $ / carry icons (POMs already fall back to accessible names); admin link wizard UI (keep/adopt) on top of the TC-323/324 API contract                                                                                                    |
| `tests/dashboard/owner/07-coupons.spec.ts` | Re-enable the coupon-edit `test.fixme` once the backend `value`-as-string bug is fixed                                                                                                                                                                                                                                              |
| Deals — follow-ups                         | Pins FLIPPED 2026-08-19 (RestauNax #618 authz/cap/validation/aiGenerated/pagination + #619 coupon ⊥ deal, option A — verified live on QA). Remaining: frontend testids for the Deals components (POMs use accessible names/ids today); wind `DealsGridBlock` shape fix + `OrderDeal` client-snapshot hardening (note-only findings) |
| Admin/Employee lead onboarding             | Confirm QA's deployed frontend branch first; only then build coverage for `LeadOnboarding.tsx`                                                                                                                                                                                                                                      |

### Later — Member ordering, POS, hardening

- Reward-member checkout (needs the OTP login helper noted above — and a
  QA-scoped test phone backend-side; see the Helpers "Still open" note)
- Customer availability gates: `acceptingOrders=false` block,
  `published=false` browsing-only banner, out-of-stock item hidden — need an
  own throwaway restaurant (never toggle these on the shared seed restaurant)
- FREE_DELIVERY coupon auto-removal when switching away from Delivery —
  blocked until template-wind's `feat/free-delivery-display` branch merges
- Scheduling rules (closed restaurant forces "Schedule for later",
  `minimumOrderPreparationTime` slot filtering) — timezone-flake-prone and
  mutates restaurant hours; do on the throwaway restaurant above
- `tests/pos/**` API-level POS lifecycle (`POST /api/tablet/login`, status transitions)
- Cross-browser matrix, GitHub Actions on every PR, Allure flakiness trend

### Explicitly out of scope (all phases)

| Area                                                                              | Reason                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voice ordering (Retell AI)                                                        | Live phone calls — non-deterministic                                                                                                                                                                                                                                        |
| Social media posting                                                              | External OAuth, third-party state                                                                                                                                                                                                                                           |
| Analytics _chart internals_                                                       | Individual chart values/rendering are read-only, visual — low regression risk. **Note:** the Analytics tab shell — navigation, dashboard load, date-range picker, and the fetch path — IS now covered (TC-35, TC-127–129); only the per-chart contents remain out of scope. |
| Native mobile app UI                                                              | React Native — covered at API level, not browser UI                                                                                                                                                                                                                         |
| Chat (real-time)                                                                  | WebSocket — hard to assert reliably                                                                                                                                                                                                                                         |
| AI image/video generation                                                         | External, rate-limited APIs                                                                                                                                                                                                                                                 |
| Standalone partial-refund endpoint (`POST /api/order/statistics/refund/:orderId`) | Real and functional backend endpoint, but no UI path reaches it (the dashboard's only reachable refund flow is full-refund-via-Cancel-Order, covered by TC-225) — would be an API-only test, not a dashboard E2E case                                                       |

---

_Last updated: 2026-07-07_
