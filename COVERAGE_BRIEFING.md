# Restaunax E2E — Coverage Briefing

> A ~10-minute orientation for anyone joining the QA/automation work: what the
> suite checks, the mental model behind how it's organized, and where the real
> gaps and known bugs are. For the visual version, open
> [`coverage-briefing.html`](coverage-briefing.html) in a browser.
>
> **Deeper references:** [`TEST_PLAN.md`](TEST_PLAN.md) is canonical (role model,
> conventions, how to add a test); [`TEST_COVERAGE.md`](TEST_COVERAGE.md) is the
> full per-test map this briefing distills.

|                              |                                |
| ---------------------------- | ------------------------------ |
| **~110** test cases          | **10** coverage areas          |
| **2 + 1** web apps + POS API | **91 / 18** passed / skipped\* |

\* Last _recorded_ full run (early July). POS order-lifecycle, coupon
redemption, delivery-quote, and the email-quota holds were added since and live
in Automation **PR #16**.

---

## Start here — the mental model

The suite is organized **app → role → feature**. There are two front-end web
apps plus a POS layer tested at the API level. Get these three surfaces and the
role model straight and the folder tree explains itself.

| Project     | App                                            | What it is                                                                             | Personas                          |
| ----------- | ---------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------- |
| `dashboard` | **Restaunax Dashboard** (`restaunax-frontend`) | Authenticated admin/owner operations — menus, orders, coupons, Stripe, users, demos    | ADMIN · EMPLOYEE · OWNER · Public |
| `customer`  | **Template Wind**                              | Customer ordering storefront — menu → checkout → Stripe → confirmation                 | Customer (guest / member)         |
| `pos`       | **Device-In-Store**                            | Kitchen/POS tablet — a React Native app, so driven at the **API level**, not a browser | Restaurant staff (tablet JWT)     |

### The one correction newcomers always need

**ADMIN and EMPLOYEE are the company side; OWNER is the client.** EMPLOYEE is
_not_ "an owner's employee" and _not_ "owner with fewer permissions." Publish and
tax routes are gated `[ADMIN, EMPLOYEE]` and explicitly **deny OWNER** — which is
exactly why `admin/`, `employee/`, and `owner/` are separate test folders. A test
must satisfy all three gates: **role → permission → feature entitlement**.

---

## Coverage by area

Legend: ✅ solid · ⚠️ partial / credential-gated / shallow · ❌ not written yet

| Area                    | Status                | What's covered                                                                                                                                              | Notable gaps                                                |
| ----------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **Admin**               | ✅ (33 tests)         | Deepest area. Full user management (invite → claim → login, roles, permissions, status), demo request pipeline, restaurant list                             | subscriptions, finance, system logs, leads/chains           |
| **Owner**               | ✅ (36 tests)         | Restaurant management, menu CRUD, orders, coupons, Stripe onboarding (route-mocked), Uber Eats, subscription, deals                                         | business hours, full deal create, analytics                 |
| **Customer**            | ✅ (8 tests)          | Full order with a live Stripe card, real add-to-cart flow, declined-card path, **coupon redemption**, delivery address→quote round-trip                     | OTP member login, loyalty redemption, gift cards, modifiers |
| **Staff / POS**         | ✅ (1 flow)           | Order lifecycle (TC-100): tablet login → order received on live feed → `PENDING → CONFIRMED → PREPARING → READY → PICKED_UP`, each step verified at the API | tablet cancel (needs staff session), staff PIN portal       |
| **Access control**      | ✅ (8 tests)          | Role restrictions (OWNER denied publish/tax/loyalty) + unauthenticated redirects. The clearest proof of the role model                                      | —                                                           |
| **Public auth & demo**  | ✅ (10 tests)         | Sign-in (valid/invalid/unknown), sign-up happy + negative, demo form + client-side validation                                                               | —                                                           |
| **API negative cases**  | ✅ (6 tests)          | Server-side validation the UI can't reach: missing fields → 4xx, bad tokens → 401, permission enforcement → 403                                             | —                                                           |
| **Employee**            | ⚠️ (6 tests)          | Tax settings, create-restaurant-for-client, publish page + checklist (TC-143/144). Skip without `EMPLOYEE_*` creds — not a failure                          | —                                                           |
| **Onboarding**          | ⚠️ (5 tests)          | Four _separate_ paths, not one flow: self-serve sign-up, employee-creates-restaurant, post-create setup                                                     | lead-onboarding wizard (QA build diverged from source)      |
| **End-to-end journeys** | ❌ (mostly unwritten) | Pieces exist, through-lines don't                                                                                                                           | order→kitchen, order→owner dashboard, demo→live restaurant  |

---

## Real bugs the suite has caught

This isn't box-ticking — driving the real API surfaced genuine backend defects,
two of them security-grade:

| Severity       | Finding                                                                                                                                                                                            | Status                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 🔴 Security    | **Order status & live-orders endpoints had no auth** — any anonymous caller could drive an order's lifecycle or read a restaurant's live feed (customer name/email/phone/address). Confirmed live. | Fix written (`requireTabletOrPermission`) — RestauNax **#482**, awaiting build + deploy |
| 🔴 Security    | **Order create trusts client-supplied money fields** — a `total: 0` order is marked paid with no Stripe charge; a guest can order a real item for $0.                                              | ✅ Fixed 2026-07-09 — server-side pricing guard live on QA, verified by the suite       |
| 🟡 Backend bug | **Editing any coupon 500s** — form sends `value` as a string, Prisma expects a Float. Parked as `test.fixme` (TC-92).                                                                              | Tracked — RestauNax **#481**                                                            |

---

## Gotchas for your first run

|                                |                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Skipped ≠ broken**           | Many tests skip on purpose when their credentials/environment aren't set (`EMPLOYEE_*`, `TEMPLATE_WIND_URL`, Mailtrap). A skip is a gate, not a failure.                                                                                                                                                                     |
| **Emails excluded by default** | Demo, invite, password-reset and sign-up tests are tagged `@email` and **excluded from the default run** — they send real mail into a quota-limited Mailtrap inbox. Run them deliberately with `npm run test:email` / `test:demo`. (Gift-card purchase tests are `test.fixme` — blocked by Stripe Radar; see TEST_COVERAGE.) |
| **Runs against QA**            | Tests hit the shared **QA/staging** environment, not a local stack. That's why data is seeded and swept, and why runs must not stomp on each other.                                                                                                                                                                          |
| **One flaky-looking fail**     | A lone "failure" in older reports is TC-58 — it only fails where `EMPLOYEE_*` creds are absent. Real everywhere they exist.                                                                                                                                                                                                  |

---

## Conventions you'll follow

|                            |                                                                                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unique TC IDs**          | Every test carries a stable `TC-NN` id used across the specs, the coverage map, and Allure. Never reuse a number.                                                |
| **POM factory pattern**    | UI lives in Page Object Models under `pages/` — `createXxxPage(page)` factories with centralized selectors. Specs read as intent; locators live in one place.    |
| **File-level parallelism** | A spec _file_ is the isolation unit (`workers: 2` CI / 3 local). Each file owns its data, restores anything shared, never touches a row another file asserts on. |
| **Seed & sweep**           | `globalSetup` seeds via API; `globalTeardown` deletes it and sweeps leftovers (`AUTO*` coupons, test users, this run's demo).                                    |
| **Stable hooks**           | Prefer `data-testid` over MUI classes / placeholders / `nth()`. Testid PRs are in flight on both front-ends.                                                     |

---

## Run it

From `Automation/`, with `.env` configured. Add `--project=dashboard|customer|pos`
to scope by app.

```bash
npm run test                          # whole suite, headless
npm run test:headed                   # watch it in a real browser
npm run test:ui                       # interactive Playwright UI runner
npx playwright test --project=pos     # just the POS API lifecycle
npm run report                        # open the Allure HTML report
```
