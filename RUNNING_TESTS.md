# Running the Tests

Step-by-step instructions for setting up, running, and reading the results of
the Restaunax E2E suite. For conventions and how to _write_ tests, see
[`TEST_PLAN.md`](./TEST_PLAN.md).

---

## 1. One-time setup

Requires **Node 22+**. No Java needed unless you want Allure reports (see §4).

```bash
npm install                          # dependencies + husky git hooks
npx playwright install chromium      # the only browser the suite uses
```

Create `.env` in the repo root with the QA credentials and URLs — the full
variable list is in [`TEST_PLAN.md`](./TEST_PLAN.md#environment-variables) and
[`CLAUDE.md`](./CLAUDE.md#environment-variables). Credentials are never
checked in; ask the team for the QA values.

Sanity check the setup:

```bash
npm run typecheck
```

> **Heads-up:** the suite runs against the **shared QA environment**. Before a
> full run, make sure nobody else (or CI) is mid-run — two runs at once
> interfere with each other's data.

## 2. Run all tests

```bash
npm run test           # everything, headless (3 workers locally) — NO email sent
npm run test:headed    # same, with a visible browser
npm run test:ui        # interactive Playwright UI (pick & watch tests)
```

`globalSetup` logs in the owner/admin/employee sessions once before the run (it
sends **no** email); `globalTeardown` cleans up the data the run created.

> **Mail-sending tests run by default.** Tests tagged `@email` (demo, invite,
> password-reset, sign-up, gift-card purchases) send real mail to QA's
> self-hosted Mailpit sandbox. It's unmetered, so `npm test` and the nightly
> include them — the tags are just selectors:
>
> ```bash
> npm run test:email    # only the @email group
> npm run test:demo     # only the demo flow
> ```
>
> They need `MAILPIT_BASE_URL` (+ `MAILPIT_UI_USER` / `MAILPIT_UI_PASSWORD`) in
> `.env`; without it they skip. To see what a run actually sent, open the same
> inbox in a browser: **https://mail.qa.restaunax.com** (same credentials). It is
> SHARED — read it, never bulk-delete it.
>
> Full rationale + the "which command, when" table: TEST_PLAN → **Test execution
> strategy**.

Run a single project (app) only:

```bash
npx playwright test --project=dashboard   # Restaunax dashboard tests
npx playwright test --project=customer    # Template Wind storefront tests
npx playwright test --project=pos         # POS / order-lifecycle API tests
```

## 3. Run an individual test

By file:

```bash
npx playwright test tests/dashboard/owner/04-menu-management.spec.ts
```

By title or test-case ID (`--grep` matches describe/test titles):

```bash
npx playwright test --grep "TC-26"
npx playwright test --grep "Demo booking"
```

Combine with a visible browser while iterating:

```bash
npx playwright test tests/customer/02-checkout.spec.ts --headed
```

## 4. See the report

Two human-readable reports are generated on **every** run:

### Playwright HTML report (recommended — zero dependencies)

```bash
npm run report:html
```

Opens the latest run's report in your browser (local server, usually
`http://localhost:9323`): pass/fail per test, steps, errors, and — for
failures — the trace, screenshot, and video. Regenerated into
`playwright-report/` each run, so it always shows the most recent run.

### Allure report (needs Java)

```bash
npm run report
```

Generates and opens the Allure report from `allure-results/`. Richer history
and grouping features, but requires a Java runtime.

### CI results

- **Hosted report (easiest):** every CI run publishes an Allure report to GitHub
  Pages — **https://restaunax.github.io/Automation/nightly/** for the full suite
  (the site root redirects here) and
  **https://restaunax.github.io/Automation/wind-deploy/** for customer-project
  runs fired by template-wind deploys. One click shows the latest run's
  pass/fail, per-test steps, screenshots/traces on failures, and a Trend widget
  across runs — no download, no local server, no Java. A _failing_ run still
  publishes, and each run's Summary tab links to its report.
- **GitHub Actions artifacts** (the `e2e` workflow): the raw Allure report is
  also uploaded as a run artifact (14-day retention) as a backup; failure
  traces/screenshots on failure.
- **Slack:** genuine failures alert automatically (except runs superseded by a
  mid-run QA deploy).

> The old Grafana dashboard pipeline (`scripts/publish-results.ts` → backend
> ingest → Postgres → Grafana) was **backed out** (backend migration
> `remove_qa_test_results`). The ingest POST is a no-op today; only the Slack
> alert still fires. Trend history now lives in the hosted report above — don't
> rebuild it.

## 5. Clean up artifacts

```bash
npm run clean    # removes allure-*/, playwright-report/, test-results/, results.json
```
