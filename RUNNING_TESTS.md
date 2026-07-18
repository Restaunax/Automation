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

> **Email-sending tests are excluded by default.** Tests tagged `@email` (demo,
> invite, password-reset, sign-up, gift-card purchases) send real mail into the
> quota-limited Mailtrap sandbox, so `npm test` and the nightly skip them. Run
> them deliberately when you're validating those flows and the quota allows:
>
> ```bash
> npm run test:email    # ⚠️ the @email group (~14 emails)
> npm run test:demo     # ⚠️ just the demo flow
> npm run test:all      # ⚠️ full suite incl. email
> ```
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

- **GitHub Actions** (`e2e-nightly` workflow): the Allure report is uploaded
  as a run artifact (14-day retention); failure traces/screenshots are
  uploaded on failure.
- **Grafana dashboard**: every CI run is also published as per-test rows via
  `scripts/publish-results.ts` (JSON reporter → backend ingest → Postgres →
  Grafana). Failures alert Slack automatically, except runs superseded by a
  mid-run QA deploy.

## 5. Clean up artifacts

```bash
npm run clean    # removes allure-*/, playwright-report/, test-results/, results.json
```
