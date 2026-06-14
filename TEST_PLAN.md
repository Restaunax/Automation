# Restaunax E2E Automation — Test Plan

## Overview

End-to-end automation suite for the Restaunax platform, written in **TypeScript** using **Playwright** with **Allure** reporting.

The suite is structured in phases. Phase 1 covers the complete demo request lifecycle. The infrastructure layer (dual-role auth, API helper, test data seeding/teardown) is already in place to support all future phases.

---

## Project Structure

```
Automation/
├── tests/
│   ├── public/                              # No-auth tests
│   │   └── 01-demo-request.spec.ts
│   ├── auth/                                # Login / register tests (Phase 2)
│   ├── owner/                               # Owner-role tests (Phase 2+)
│   └── admin/                               # Admin-role tests
│       └── 01-demo-management.spec.ts
├── pages/                                   # Page Object Models (factory functions)
│   ├── public/
│   │   └── DemoBookingPage.ts
│   ├── auth/
│   │   └── SignInPage.ts
│   ├── owner/                               # (Phase 2+)
│   └── admin/
│       └── AdminDemoManagementPage.ts
├── fixtures/
│   └── base.ts                              # ownerPage, adminPage, demoBookingPage
├── utils/
│   ├── apiHelper.ts                         # Direct HTTP calls for setup/teardown
│   ├── emailHelper.ts                       # Mailtrap inbox polling
│   ├── testData.ts                          # Data generators + shared state helpers
│   └── stripeCards.ts                       # Stripe test card constants
├── globalSetup.ts                           # Runs once before all tests
├── globalTeardown.ts                        # Runs once after all tests
├── playwright.config.ts
├── package.json
├── tsconfig.json
├── .env.example
└── TEST_PLAN.md
```

---

## Test Environment

All variables are configured in `Automation/.env` (copy from `.env.example`).

| Variable | Description | Example |
|---|---|---|
| `FRONTEND_URL` | Base URL of the app under test | `https://app.qa.restaunax.com` |
| `BACKEND_URL` | Backend API base URL (used by apiHelper for direct HTTP calls) | `https://api.qa.restaunax.com` |
| `OWNER_EMAIL` | Restaurant owner account used to seed test data and run owner-flow tests | _(secret)_ |
| `OWNER_PASSWORD` | Owner account password | _(secret)_ |
| `ADMIN_EMAIL` | Platform admin account for admin-flow tests and teardown cleanup | _(secret)_ |
| `ADMIN_PASSWORD` | Admin account password | _(secret)_ |
| `MAILTRAP_API_TOKEN` | **Email Testing** token from Mailtrap (not a Sending token — those return 403) | _(secret)_ |
| `MAILTRAP_INBOX_ID` | Mailtrap inbox ID where test emails land | _(secret)_ |
| `TEST_EMAIL_DOMAIN` | Domain used to generate unique test emails per run | `restaunax-test.com` |

---

## How globalSetup Works

`globalSetup.ts` runs **once before all tests**:

1. **API login as owner** → creates a uniquely-named seed test restaurant via `POST /api/restaurant/new`
2. **Three tasks run in parallel** (reducing setup time ~3x):
   - Owner browser login → saves `owner-auth.tmp.json` (storageState)
   - Admin browser login → saves `admin-auth.tmp.json` (storageState)
   - Submits a demo request via browser → captures email for TC-02
3. Writes `shared-state.tmp.json` with: `{ email, firstName, lastName, submittedAt, restaurantId, restaurantName }`

## How globalTeardown Works

`globalTeardown.ts` runs **once after all tests**:

1. Reads `restaurantId` from `shared-state.tmp.json`
2. API-logs in as admin → calls `DELETE /api/admin/restaurant/:id` to remove the seed restaurant
3. Deletes all `*.tmp.json` files (`shared-state`, `owner-auth`, `admin-auth`)

Teardown errors are caught and logged — they never fail the test run.

## How Authentication Works in Tests

Specs never contain login steps. Instead:

- `globalSetup` authenticates both roles once and saves browser sessions to disk
- `ownerPage` and `adminPage` fixtures in `fixtures/base.ts` restore those sessions automatically
- Any spec that uses `{ ownerPage }` or `{ adminPage }` starts with a fully authenticated browser

---

## Execution Order

```
globalSetup
  ├── API: owner login → create test restaurant
  └── Parallel:
      ├── Browser: owner login → owner-auth.tmp.json
      ├── Browser: admin login → admin-auth.tmp.json
      └── Browser: submit demo request → shared-state.tmp.json

  → tests/admin/01-demo-management.spec.ts
      → TC-03: Admin dashboard (uses adminPage fixture)
      → TC-04: Demo request verification (uses adminPage fixture)

  → tests/public/01-demo-request.spec.ts
      → TC-01: Form submission UI
      → TC-02: Email delivery check (currently skipped)

globalTeardown
  ├── API: delete test restaurant
  └── Delete all *.tmp.json files
```

`workers: 1` is enforced in `playwright.config.ts` — tests run sequentially.

---

## Phase 1 — Demo Request Flow

### Suite: Public Form (`tests/public/01-demo-request.spec.ts`)

**Feature:** Demo Request Flow | **Severity:** Critical

#### TC-01: Submit demo request form and display success confirmation

| Field | Detail |
|---|---|
| **ID** | TC-01 |
| **Status** | ✅ Passing |
| **Preconditions** | Frontend running at `FRONTEND_URL` |
| **Test Data** | Auto-generated each run: `email=test+{uuid}@restaunax-test.com`, `firstName=Test`, `lastName=Automation`, `phone=5551234567`, `restaurantName=Automation Restaurant {uuid}` |

**Steps:**

| # | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/demo` | Page loads, `firstName` input is visible |
| 2 | Fill all required fields | Fields accept input |
| 3 | Select `preferredContact` = EMAIL | Radio button selected |
| 4 | Check `agreeToTerms` | Checkbox is checked |
| 5 | Click Submit | Form submits |
| 6 | Wait for `#success-dialog-title` | Success dialog visible within 15s |

**Pass Criteria:** Success dialog is displayed within 15 seconds.

---

#### TC-02: Receive confirmation email after demo request submission

| Field | Detail |
|---|---|
| **ID** | TC-02 |
| **Status** | ⏭ Skipped — `MAILTRAP_API_TOKEN` is a Sending token, not an Email Testing token |
| **Fix** | Mailtrap → Email Testing → your inbox → API Tokens tab → copy that token into `.env` |
| **Preconditions** | `MAILTRAP_API_TOKEN` (Email Testing type) and `MAILTRAP_INBOX_ID` set in `.env` |
| **Test Data** | `email` from `shared-state.tmp.json` (written by `globalSetup`) |

**Steps:**

| # | Action | Expected Result |
|---|---|---|
| 1 | Read submitted email from `shared-state.tmp.json` | Email address loaded |
| 2 | Poll Mailtrap inbox every 2s (up to 30s) filtering by recipient | Email found |
| 3 | Assert `to_email` matches submitted address | Exact match |
| 4 | Assert `subject` matches `/demo\|confirm\|request/i` | Subject present |

**Pass Criteria:** Confirmation email arrives within 30 seconds with correct recipient.

---

### Suite: Admin Demo Management (`tests/admin/01-demo-management.spec.ts`)

**Feature:** Demo Request Flow | **Severity:** Critical

> Both tests skip automatically if `ADMIN_EMAIL` / `ADMIN_PASSWORD` are not set.
> Authentication is handled entirely by `globalSetup` + the `adminPage` fixture — no login steps inside these tests.

#### TC-03: Admin can reach the dashboard after login

| Field | Detail |
|---|---|
| **ID** | TC-03 |
| **Status** | ✅ Passing |
| **Preconditions** | `ADMIN_EMAIL` and `ADMIN_PASSWORD` set; `admin-auth.tmp.json` written by `globalSetup` |

**Steps:**

| # | Action | Expected Result |
|---|---|---|
| 1 | Restore `admin-auth.tmp.json` session via `adminPage` fixture | Browser is authenticated |
| 2 | Navigate to `/admin` | Page loads without redirecting to `/sign-in` |

**Pass Criteria:** URL does not contain `/sign-in` within 15 seconds.

---

#### TC-04: Admin can find the new demo request in Demo Management

| Field | Detail |
|---|---|
| **ID** | TC-04 |
| **Status** | ✅ Passing |
| **Preconditions** | Admin authenticated (TC-03); demo request submitted by `globalSetup` |
| **Test Data** | `email`, `firstName`, `lastName`, `submittedAt` from `shared-state.tmp.json` |

**Steps:**

| # | Action | Expected Result |
|---|---|---|
| 1 | Navigate to `/admin?tab=demo` | Demo Management page loads with search input visible |
| 2 | Type submitted email into search field | Table filters (debounce ~800ms) |
| 3 | Assert row contains `firstName` = "Test" | Text found in row |
| 4 | Assert row contains `lastName` = "Automation" | Text found in row |
| 5 | Assert status column contains "NEW" | Status chip visible |
| 6 | Assert `createdAt` cell is non-empty | Date/time text visible |

**Pass Criteria:** Row found, displays "Test Automation", status is "NEW", timestamp is visible.

---

## How to Run

```bash
# 1. Install dependencies (first time only)
cd Automation
npm install
npx playwright install chromium

# 2. Configure environment
cp .env.example .env
# Fill in all credentials — see .env.example for descriptions

# 3. Run all tests (headless)
npm test

# 4. Run in headed mode (watch the browser)
npm run test:headed

# 5. Open interactive UI mode
npm run test:ui

# 6. Generate and open Allure report
npm run report

# 7. Clean all generated artifacts
npm run clean
```

---

## Allure Report Labels

| Label | Value |
|---|---|
| Feature | Demo Request Flow |
| Severity | critical |

Each test step is wrapped in `allure.step()`. Key data (submitted email, status, timestamps) is attached as `allure.parameter()`. Screenshots, videos, and Playwright traces are saved automatically on failure to `test-results/`.

---

## Failure Handling

| Scenario | Behavior |
|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` not set | TC-03 and TC-04 skipped at `describe` level — fixture never attempted |
| `OWNER_EMAIL` / `OWNER_PASSWORD` not set | Restaurant seed skipped; `restaurantId` left empty in shared state |
| `MAILTRAP_API_TOKEN` / `MAILTRAP_INBOX_ID` not set | TC-02 throws immediately with a clear error |
| `BACKEND_URL` unreachable | `apiHelper` times out after 30s with a message showing the URL |
| `globalSetup` fails | All tests abort before starting — Playwright reports "global setup failed" |
| `globalTeardown` fails | Logged as a warning — does not affect test results or exit code |
| Email not received within 30s | TC-02 fails with `TimeoutError` |
| Demo row not found after search | TC-04 fails with element not visible |
| Any test failure | Screenshot + video + Playwright trace saved to `test-results/` |

---

## Phase 2 Roadmap

### Infrastructure (prerequisite — already done)
- ✅ Dual-role auth (owner + admin) via storageState
- ✅ API helper for test data seeding and teardown
- ✅ globalTeardown for cleanup
- ✅ Stripe test card constants
- ✅ Directory structure ready for owner/ and admin/ test growth

### Phase 2 — Auth + Restaurant + Menu (next)

| Suite | Key test cases |
|---|---|
| `tests/auth/01-login.spec.ts` | Valid login, invalid credentials, redirect behaviour |
| `tests/auth/02-register.spec.ts` | New account registration flow |
| `tests/owner/01-restaurant-setup.spec.ts` | Create restaurant, edit basic info, business hours |
| `tests/owner/02-menu-categories.spec.ts` | Add / edit / delete category |
| `tests/owner/03-menu-items.spec.ts` | Add item with price, description, image |
| `tests/owner/04-menu-publish.spec.ts` | Publish menu, verify live |

### Phase 3 — Orders + Payments

| Suite | Key test cases |
|---|---|
| `tests/owner/05-orders.spec.ts` | Order list, status update, refund |
| `tests/owner/06-subscription.spec.ts` | Plan selection, Stripe test card checkout |
| `tests/owner/07-coupons.spec.ts` | Create coupon, verify discount applies |
| `tests/owner/08-deals.spec.ts` | Create deal, verify visibility |

### Phase 4 — CRM + Admin Operations

| Suite | Key test cases |
|---|---|
| `tests/owner/09-rewards.spec.ts` | Create loyalty program, redeem points |
| `tests/owner/10-customers.spec.ts` | Customer directory search and filter |
| `tests/admin/02-restaurant-management.spec.ts` | Admin views / suspends restaurant |
| `tests/admin/03-user-management.spec.ts` | Invite user, change role, deactivate |

### Phase 5 — Hardening + CI/CD

- Form validation error scenarios across all forms
- Cross-browser: Firefox and Mobile Chrome
- GitHub Actions workflow running on every PR to `qa`
- Flakiness tracking via Allure history trend

### Explicitly out of scope (all phases)

| Area | Reason |
|---|---|
| Voice ordering (Retell AI) | Requires live phone calls — non-deterministic |
| Social media posting | External OAuth flows, third-party state |
| Analytics charts | Read-only, visual — low regression risk |
| Tablet device pairing | Requires physical hardware |
| Chat (real-time) | WebSocket-based — complex to assert reliably |
| Image AI generation | External APIs, rate-limited |

---

*Last updated: 2026-05-28*
