# Restaunax E2E Automation — Test Plan

## Overview

End-to-end UI automation for the Restaunax platform, written in **TypeScript**
with **Playwright** and **Allure** reporting. The suite targets the **QA/Staging**
environment; credentials live in `.env`.

This document is the **canonical reference** for the suite: how it's organized,
the role model it mirrors, the conventions every test follows, and how to add a
new test. Read the **Conventions** and **How to add a new test** sections before
writing a spec.

> **State of the suite:** the framework (dual-role auth, API seeding/teardown,
> fixtures, Allure) is in place and the structure is fully scaffolded. Most spec
> and POM files are **placeholders** (`test.fixme`, stub POMs) that establish the
> pattern — only the demo-request flow is implemented end-to-end so far. See
> **Project Structure** for which files are real vs scaffolded.

---

## Two Apps Under Test

We automate **two separate front-end web apps**. They have different URLs, auth
models, and personas, so each gets its own Playwright **project** in
`playwright.config.ts`.

| App | Project | Base URL (env) | Personas | Auth |
|-----|---------|----------------|----------|------|
| **Restaunax Dashboard** (`restaunax-frontend`) | `dashboard` | `FRONTEND_URL` | Admin, Employee, Owner, Public | Email + password; role decided server-side |
| **Template Wind** (customer ordering, `template-wind`) | `customer` | `TEMPLATE_WIND_URL` | Customer (guest + reward member) | None (guest) / OTP (member) |

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

| Role | Who they are | Can do | Cannot do |
|------|--------------|--------|-----------|
| **ADMIN** | The company / full platform operator | Everything (`/admin` + all restaurant routes) | — |
| **EMPLOYEE** | **Company-side setup staff** (onboard clients) | Create restaurants, **publish menus**, edit **tax**, manage register devices | Invite/create POS staff |
| **OWNER** | The restaurant **client** | Manage their own restaurant(s), **invite staff**, kitchen-display devices | Publish menus, edit tax, manage register devices |
| **RESTAURANT_STAFF** | POS device staff | Thin `/staff` PIN portal on web; real authority is the POS layer (below) | Dashboard management |
| **USER / Customer** | Orders on Template Wind | Place orders (guest or OTP reward member) | Dashboard access |

> **Key correction:** ADMIN + EMPLOYEE are the **company** side ("manage & set up
> everything for the restaurant"); OWNER is the **client**. EMPLOYEE is *not*
> "an owner's employee" and is *not* "OWNER with fewer permissions" — the
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

| Concern | Answers | Where |
|---------|---------|-------|
| **Feature behaves correctly** | "Does creating a menu item work?" | Written **once** under the primary actor (`tests/dashboard/owner/`), using a **role-agnostic POM** in `pages/dashboard/restaurant/`. |
| **Authorization** | "*Who* may reach/do it?" | A thin matrix in `tests/dashboard/access/` that loops roles via the `pageForRole` fixture — no full feature re-run. |

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
│   ├── dashboard/                       # PROJECT: dashboard (baseURL = FRONTEND_URL)
│   │   ├── public/                      # unauthenticated
│   │   │   ├── 01-demo-request.spec.ts  # ✅ real
│   │   │   ├── sign-in.spec.ts          # scaffold
│   │   │   └── sign-up.spec.ts          # scaffold
│   │   ├── admin/                       # the company manages everything
│   │   │   ├── demo/
│   │   │   │   ├── 01-demo-management.spec.ts  # ✅ real
│   │   │   │   └── 02-demo-actions.spec.ts     # ✅ real
│   │   │   ├── restaurants.spec.ts      # scaffold
│   │   │   ├── users.spec.ts            # scaffold
│   │   │   └── chains.spec.ts           # scaffold
│   │   ├── owner/                       # feature tests, owner as primary actor (shared screens)
│   │   │   ├── menu.spec.ts             # scaffold (POM: restaurant/MenuManagementPage)
│   │   │   ├── orders.spec.ts           # scaffold (POM: restaurant/OrdersPage)
│   │   │   ├── coupons.spec.ts          # scaffold (POM: restaurant/CouponsPage)
│   │   │   ├── deals.spec.ts            # scaffold
│   │   │   ├── rewards.spec.ts          # scaffold
│   │   │   ├── staff-invite.spec.ts     # scaffold (OWNER-only)
│   │   │   └── settings.spec.ts         # scaffold
│   │   ├── employee/                    # company-side setup staff
│   │   │   ├── restaurant-create.spec.ts  # scaffold (EMPLOYEE/ADMIN only)
│   │   │   ├── menu-publish.spec.ts        # scaffold (EMPLOYEE/ADMIN only — OWNER denied)
│   │   │   └── tax-settings.spec.ts        # scaffold (EMPLOYEE/ADMIN only — OWNER denied)
│   │   ├── staff/                       # thin /staff PIN-card stub (web)
│   │   │   └── staff-portal.spec.ts     # scaffold
│   │   └── access/                      # who-can-reach-what matrix (uses pageForRole)
│   │       ├── restaurant-management-access.spec.ts  # scaffold (owner/employee/admin reach shared screens)
│   │       └── role-restrictions.spec.ts             # scaffold (OWNER denied publish/tax)
│   ├── customer/                        # PROJECT: customer (baseURL = TEMPLATE_WIND_URL)
│   │   ├── menu.spec.ts                 # scaffold (POM: MenuPage, ItemModal)
│   │   ├── cart.spec.ts                 # scaffold (POM: CartSummary)
│   │   ├── checkout.spec.ts             # scaffold (POM: CheckoutPage)
│   │   ├── payment.spec.ts              # scaffold (POM: PaymentSection)
│   │   ├── confirmation.spec.ts         # scaffold (POM: OrderConfirmationPage)
│   │   ├── deals.spec.ts                # scaffold
│   │   └── flows/
│   │       └── complete-order.spec.ts   # scaffold (full guest happy path)
│   └── pos/                             # NOT a project — API-level placeholder
│       └── README.md
├── pages/                               # Page Object Models (factory functions)
│   ├── dashboard/
│   │   ├── auth/SignInPage.ts           # ✅ real
│   │   ├── public/DemoBookingPage.ts    # ✅ real
│   │   ├── admin/AdminDemoManagementPage.ts  # ✅ real
│   │   └── restaurant/{MenuManagementPage,OrdersPage,CouponsPage}.ts  # stubs — role-agnostic (shared by owner/employee/admin)
│   └── customer/
│       └── {MenuPage,ItemModal,CartSummary,CheckoutPage,PaymentSection,OrderConfirmationPage}.ts  # stubs
├── fixtures/
│   └── base.ts          # ownerPage, adminPage, customerPage, demoBookingPage, signInPage
├── utils/
│   ├── apiHelper.ts     # direct HTTP for setup/teardown (login, seed/delete restaurant)
│   ├── emailHelper.ts   # Mailtrap inbox polling
│   ├── testData.ts      # generators, shared-state, readRestaurantId(), URLs
│   └── stripeCards.ts   # Stripe test card constants
├── globalSetup.ts       # runs once before all tests
├── globalTeardown.ts    # runs once after all tests
├── playwright.config.ts # two projects: dashboard + customer
└── TEST_PLAN.md         # this file
```

**Design principle:** the tree mirrors **app → role → feature** (how users
experience the product and how access is gated), **not** the React component
folder layout (which would couple tests to implementation details). POMs model
**screens/pages**, never components.

---

## Conventions

| Topic | Convention |
|-------|------------|
| **Folder axis** | `tests/<app>/<role>/<feature>.spec.ts`. App first (different URLs/auth), then role (how access is gated), then feature. |
| **POM location** | `pages/<app>/<role>/<Screen>Page.ts` — mirrors the test axis. |
| **POM style** | A **factory function** `create<Name>Page(page)` returning `{ goto, ...actions }`, plus an exported `type` via `ReturnType`. No classes. See `pages/dashboard/auth/SignInPage.ts`. |
| **Locators** | Prefer role / name / label / placeholder. Template Wind has almost no `data-testid` → use role/text. Dashboard is MUI → role selectors (`[role="dialog"]`, `getByRole`). CSS class is a last resort. |
| **Test titles** | `TC-NN: description`. Add Allure `feature` / `severity` labels and wrap steps in `allure.step()` for readable reports (see the demo specs). |
| **Placeholders** | Scaffolded specs use `test.fixme("TC-XXX: …", async ({ fixture }) => { … })`. They appear in `--list` as skipped and **never run or fail CI**. Each holds an Arrange-Act-Assert skeleton + the POM import so it's copy-paste-ready. |
| **Imports** | Relative paths (matching existing code). The `@pages/*`, `@utils/*`, `@fixtures/*` aliases exist in `tsconfig.json` if you prefer them. |
| **Fixtures** | Never log in inside a spec. Use `ownerPage` / `adminPage` / `customerPage`; auth is restored from storageState by `globalSetup` + `fixtures/base.ts`. |
| **Shared screens** | A screen reachable by multiple roles gets a **role-agnostic POM** in `pages/dashboard/restaurant/`. Test the feature once (primary actor); cover cross-role access in `tests/dashboard/access/`. See "Shared capabilities". |

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

```ts
// tests/dashboard/owner/coupons.spec.ts
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createCouponsPage } from "../../../pages/dashboard/restaurant/CouponsPage";
import { readSharedState } from "../../../utils/testData";

test.describe("Owner — Coupons", () => {
  test.beforeEach(async () => {
    await allure.label("feature", "Owner / Coupons");
    await allure.label("severity", "normal");
  });

  test("TC-NN: owner can create a coupon", async ({ ownerPage }) => {
    const { restaurantId } = readSharedState();          // Arrange
    const coupons = createCouponsPage(ownerPage);
    await coupons.goto(restaurantId);
    await coupons.startCreateCoupon();                   // Act
    // …fill the form…
    await expect(ownerPage.getByText("SAVE10")).toBeVisible();  // Assert
  });
});
```

> Remember the **entitlement gotcha**: the Coupons tab only exists if the target
> restaurant is entitled to `COUPONS` and isn't a shipping/email-only store.

---

## Authentication & Fixtures

Specs never contain login steps. `globalSetup` authenticates roles once and
saves browser sessions to disk; `fixtures/base.ts` restores them.

| Fixture | Session | Use for |
|---------|---------|---------|
| `ownerPage` / `ownerContext` | Owner (storageState from `owner-auth.tmp.json`) | `tests/dashboard/owner/**` |
| `adminPage` / `adminContext` | Admin (storageState from `admin-auth.tmp.json`) | `tests/dashboard/admin/**` |
| `customerPage` / `customerContext` | **Guest** (no auth), baseURL = Template Wind | `tests/customer/**` |
| `pageForRole(role)` | Resolver → authenticated page for `"owner" \| "admin" \| "employee"` | `tests/dashboard/access/**` (who-can-reach-what matrix) |
| `signInPage` | Unauthenticated sign-in POM | auth tests |
| `demoBookingPage` | Unauthenticated `/demo` POM | public demo tests |

> `pageForRole("employee")` currently throws — there's no stored EMPLOYEE
> session yet (future infrastructure). `owner` and `admin` resolve today.

**Customer restaurant target:** Template Wind is deployed per-restaurant.
`utils/testData.ts` → `readRestaurantId()` returns `TEMPLATE_WIND_RESTAURANT_ID`
(env override) or the restaurant seeded by `globalSetup`. Customer POMs append
`?restaurantId=<id>` to skip the location picker.

---

## How globalSetup / globalTeardown Work

`globalSetup.ts` runs **once before all tests**:

1. **API login as owner** → creates a uniquely-named seed test restaurant
   (`POST /api/restaurant/new`).
2. **Three browser tasks run in parallel** (~3x faster):
   - Owner browser login → `owner-auth.tmp.json` (storageState)
   - Admin browser login → `admin-auth.tmp.json` (storageState)
   - Submit a demo request via browser → captures the email for the demo tests
3. Writes `shared-state.tmp.json`:
   `{ email, firstName, lastName, submittedAt, restaurantId, restaurantName }`.

`globalTeardown.ts` runs **once after all tests**: API-logs in as admin, deletes
the seed restaurant (`DELETE /api/admin/restaurant/:id`), and removes all
`*.tmp.json` files. Teardown errors are logged, never fail the run.

---

## Helpers & Future Infrastructure

**Available today** (`utils/`):

| Helper | Provides |
|--------|----------|
| `apiHelper.ts` | `apiLogin()`, `createTestRestaurant()`, `deleteTestRestaurant()` |
| `testData.ts` | `generateDemoFormData()`, `generateRestaurantData()`, `read/writeSharedState()`, `readRestaurantId()`, `FRONTEND_URL`, `TEMPLATE_WIND_URL` |
| `emailHelper.ts` | `waitForEmail()` (Mailtrap inbox polling) |
| `stripeCards.ts` | Stripe test card numbers + `STRIPE_DEFAULTS` |

**Needed before the customer / payment / member suites become real (TODO):**

- [ ] **Customer OTP login helper** — drive `POST /login/send-otp` +
      `/login/verify-otp` (or read OTP via Mailtrap) to produce a reward-member
      session, then add `customerMemberPage` / `customerMemberContext` fixtures.
- [ ] **Stripe payment-element fill helper** — robustly fill the Stripe iframe
      (`PaymentSection` POM is a stub today). Card data is in `stripeCards.ts`.
- [ ] **Wire Mailtrap in CI** — set an **Email Testing** token (not a Sending
      token, which 403s) so the demo email check (currently skipped) can run.
- [ ] **`employeePage` fixture** — an EMPLOYEE-role session for the
      `tests/dashboard/employee/**` specs (publish/tax/create).
- [ ] **POS / tablet API harness** — for `tests/pos/` (`POST /api/tablet/login`,
      order-status transitions, register/capability flows).

---

## Environment Variables

Configured in `Automation/.env` (copy from `.env.example`).

| Variable | Description | Example |
|---|---|---|
| `FRONTEND_URL` | Dashboard base URL (project `dashboard`) | `https://app.qa.restaunax.com` |
| `TEMPLATE_WIND_URL` | Template Wind base URL (project `customer`) | `https://qa.restaunax.com` |
| `TEMPLATE_WIND_RESTAURANT_ID` | Optional override for the customer-site restaurant target | _(restaurant id)_ |
| `BACKEND_URL` | Backend API base URL (used by `apiHelper`) | `https://api.qa.restaunax.com` |
| `OWNER_EMAIL` / `OWNER_PASSWORD` | Owner account (seeds data, owner-flow tests) | _(secret)_ |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Admin account (admin-flow tests, teardown cleanup) | _(secret)_ |
| `MAILTRAP_API_TOKEN` | **Email Testing** token (not a Sending token — those 403) | _(secret)_ |
| `MAILTRAP_INBOX_ID` | Mailtrap inbox where test emails land | _(secret)_ |
| `TEST_EMAIL_DOMAIN` | Domain for generated unique test emails | `restaunax-test.com` |

---

## How to Run

```bash
# 1. Install (first time)
cd Automation
npm install
npx playwright install chromium

# 2. Configure environment
cp .env.example .env       # then fill in credentials

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

## Implemented Today — Demo Request Flow (Phase 1)

| ID | Spec | What it verifies | Status |
|----|------|------------------|--------|
| TC-01 | `tests/dashboard/public/01-demo-request.spec.ts` | Submit `/demo` form → success dialog | ✅ |
| TC-02 | (same file) | Confirmation email arrives in Mailtrap | ⏭ skipped (needs Email Testing token) |
| TC-03 | `tests/dashboard/admin/demo/01-demo-management.spec.ts` | Admin reaches dashboard after login | ✅ |
| TC-04 | (same file) | Admin finds the demo request (name, status NEW, timestamp) | ✅ |
| TC-05–12 | `tests/dashboard/admin/demo/02-demo-actions.spec.ts` | Demo row actions (status, view/edit, follow-up, delete, assign, schedule, onboard) | ✅ |

Everything else in the tree is a **scaffolded placeholder** following the
conventions above.

---

## Roadmap

Each suite lands by filling the existing scaffolded placeholders (and adding the
helpers noted above).

### Phase 2 — Auth + Owner Menu/Orders
| Suite | Key cases |
|---|---|
| `tests/dashboard/public/sign-in.spec.ts` | Valid login, invalid credentials, redirect |
| `tests/dashboard/public/sign-up.spec.ts` | New account registration |
| `tests/dashboard/owner/menu.spec.ts` | Add / edit / delete category + item |
| `tests/dashboard/owner/orders.spec.ts` | Order list, status transitions |

### Phase 3 — Customer Ordering (Template Wind) — highest business value
| Suite | Key cases |
|---|---|
| `tests/customer/menu.spec.ts` | Browse, item modifiers, add to cart |
| `tests/customer/cart.spec.ts` | sessionStorage persistence, qty edits |
| `tests/customer/checkout.spec.ts` | Guest info, service type, tip |
| `tests/customer/payment.spec.ts` | Stripe success + declined cards |
| `tests/customer/flows/complete-order.spec.ts` | Full guest happy path E2E |

### Phase 4 — Marketing + Company-side (Employee/Admin)
| Suite | Key cases |
|---|---|
| `tests/dashboard/owner/coupons.spec.ts` / `deals.spec.ts` | Create + verify (entitlement-gated) |
| `tests/dashboard/employee/menu-publish.spec.ts` / `tax-settings.spec.ts` | Publish/tax (and OWNER-denied checks) |
| `tests/dashboard/admin/{restaurants,users,chains}.spec.ts` | Admin management |

### Phase 5 — Member ordering, POS, Hardening + CI
- Reward-member checkout (OTP helper) + `tests/customer/deals.spec.ts`
- `tests/pos/**` API-level POS lifecycle
- Cross-browser matrix, GitHub Actions on every PR, Allure flakiness trend

### Explicitly out of scope (all phases)
| Area | Reason |
|---|---|
| Voice ordering (Retell AI) | Live phone calls — non-deterministic |
| Social media posting | External OAuth, third-party state |
| Analytics charts | Read-only, visual — low regression risk |
| Native mobile app UI | React Native — covered at API level, not browser UI |
| Chat (real-time) | WebSocket — hard to assert reliably |
| AI image/video generation | External, rate-limited APIs |

---

*Last updated: 2026-06-15*
