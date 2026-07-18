# CI Pipeline Plan — GitHub Actions

> Status: **LIVE.** `static.yml`, `e2e-nightly.yml`, and `e2e-email-weekly.yml`
> run against QA (secrets/vars configured). Reporting **Phase 2 (Allure on GitHub
> Pages) shipped** → https://restaunax.github.io/Automation/. The **deploy-trigger**
> (run the suite after each healthy QA deploy) is wired from the backend repo's
> `post-deploy-smoke.yml` (RestauNax PR #499; needs the `AUTOMATION_DISPATCH_TOKEN`
> secret to activate). (Plan drafted 2026-07-05; owner: Romel.)

---

## Goals

1. **Nightly full run against QA** — catches expiring test data, QA drift,
   and backend regressions (the coupon-edit 500 class of bug) within a day
   instead of whenever someone next runs the suite locally.
2. **PR gate** — static checks always; a small smoke lane for spec changes.
3. **Visible results** — Allure report + failure traces downloadable per run.

## Hard constraint that shapes everything

The suite targets a **single shared QA environment** with shared accounts and
one seed restaurant. Two CI runs at the same time will interfere (both mutate
tax/prep-time settings, drain/create seed menu groups, reset the same demo
request). Therefore **every job that executes Playwright must be globally
serialized**:

```yaml
concurrency:
  group: qa-e2e # ONE group for the whole repo, all workflows
  cancel-in-progress: false # queue, don't kill a run mid-teardown
```

`cancel-in-progress: false` matters: killing a run mid-flight skips
globalTeardown and leaves QA residue (the sweeps will catch it next run, but
don't make that the norm).

---

## Workflow 1 — `static.yml` (every PR + push to QA/main)

No secrets, no QA access, finishes in ~1 minute. Blocks merge on failure.

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm run format:check`

## Workflow 2 — `e2e-nightly.yml` (cron + manual)

- **Triggers:**
  - `schedule: cron "0 6 * * *"` (06:00 UTC — before the workday, after any
    overnight QA deploys)
  - `workflow_dispatch` with inputs: `grep` (test filter, default empty) and
    `project` (`dashboard` / `customer` / both) so anyone can fire a targeted
    run from the Actions tab
  - `repository_dispatch: [qa-deploy]` — fired by the backend repo's
    `post-deploy-smoke.yml` after each healthy QA deploy (RestauNax PR #499; needs
    the `AUTOMATION_DISPATCH_TOKEN` secret). Runs the full suite so a regression is
    caught right after deploy, not only at the nightly. Keep the nightly too — it
    covers quiet days / env drift that a deploy-trigger never sees.
- **Guard:** `if: github.repository == 'Restaunax/Automation'` (don't run on forks)
- **Runner:** `ubuntu-latest`, `timeout-minutes: 45`
- **Steps:**
  1. checkout, `actions/setup-node@v4` (node 22, `cache: npm`), `npm ci`
  2. Cache browsers: `actions/cache` on `~/.cache/ms-playwright`, keyed on the
     `@playwright/test` version from the lockfile; then
     `npx playwright install --with-deps chromium`
  3. Run: `npx playwright test --reporter=list,allure-playwright` with env
     from secrets/vars (below). The config runs `workers: 2` in CI (file-level
     parallelism; see TEST_PLAN → "Parallel execution" for the isolation
     contract). If the nightly proves stable for a couple of weeks, try 3.
  4. **Always** (even on failure): upload artifacts —
     `allure-results/`, `test-results/` (traces + screenshots are
     retain-on-failure already). `actions/upload-artifact@v4`,
     `retention-days: 14`.
  5. Generate the Allure HTML in-job (`npm run report` minus the `open`) and
     upload it too, so a failure is inspectable without local tooling.

## Workflow 3 — `e2e-smoke.yml` (PR lane, phase 2)

Runs only when `tests/**`, `pages/**`, `utils/**`, `fixtures/**`, or the
Playwright config change (`paths:` filter). Same concurrency group as nightly
(queued behind it, never alongside).

- Introduce `@smoke` tags (Playwright `--grep @smoke`) on ~10 fast,
  high-signal tests. Candidates:
  - TC-59 (sign-in), TC-01 (demo form), TC-71/72 (unauthenticated access)
  - TC-13/TC-15 (owner list + portal shell), TC-30 (coupon form loads)
  - api-negative.spec.ts (whole file — API-only, seconds)
  - TC-22 (customer menu loads) once `TEMPLATE_WIND_URL` secret exists
- Budget: under 5 minutes. If it creeps past that, cut tests, don't raise the
  timeout.

---

## Secrets & variables (GitHub → repo Settings)

**Environment `qa` secrets** (attach the e2e jobs to this environment):

| Secret                                     | Notes                                            |
| ------------------------------------------ | ------------------------------------------------ |
| `OWNER_EMAIL` / `OWNER_PASSWORD`           | must own the seed restaurant                     |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`           | required for teardown sweeps + hard item deletes |
| `EMPLOYEE_EMAIL` / `EMPLOYEE_PASSWORD`     | unlocks the currently-skipped employee suite     |
| `MAILTRAP_API_TOKEN` / `MAILTRAP_INBOX_ID` | unlocks TC-02, TC-123 (invite journey)           |

**Repo variables (non-secret):** `FRONTEND_URL`, `BACKEND_URL`,
`TEMPLATE_WIND_URL`, `TEMPLATE_WIND_RESTAURANT_ID`, `SEED_RESTAURANT_ID`.

Pass all of these as job-level `env:` — no `.env` file needed (dotenv only
overlays; `process.env` wins everywhere in this codebase).

> Note: CI will exercise tests that are **skipped locally today** (employee
> suite, Mailtrap-gated, customer project). Expect the first nightly run to
> surface issues in those paths — that's the point. Budget a stabilization
> week.

---

## Reporting & alerting

- **Phase 1 (DONE):** Allure HTML as a run artifact. Failures link straight to
  the Actions run.
- **Phase 2 (DONE):** Allure published with history to GitHub Pages →
  **https://restaunax.github.io/Automation/** — built with
  `simple-elf/allure-report-action` and `peaceiris/actions-gh-pages`
  (`keep_reports: 30`). A required cleanup step runs
  `sudo rm -rf allure-history/.git` before the deploy, because simple-elf copies a
  root-owned `.git` into the report dir that otherwise breaks peaceiris. All Pages
  steps use `if: always()` so failing runs still publish.
- **Phase 3 (DONE):** Slack webhook on genuine failure (secret
  `SLACK_WEBHOOK_URL`). No alert on success or on superseded runs.

> An earlier Grafana pipeline (`publish-results.ts` → backend ingest → Postgres →
> Grafana) was **backed out** (backend migration `remove_qa_test_results`); the
> ingest POST is a no-op today and only the Slack alert still fires. Trend history
> lives in the Pages report above — don't rebuild Grafana.

## Flake policy

- `retries: 1` in CI is already configured. Allure marks retried-then-passed
  tests as flaky — review those weekly rather than letting them normalize.
- Never raise retries above 1 to make the board green; fix or quarantine
  (`test.fixme` with an issue link, per repo convention).

## Explicitly out of scope (tracked separately)

- ~~**Parallel workers**~~ — DONE (2026-07-05): file-level parallelism shipped
  (`workers: 2` in CI / `3` locally) after removing the cross-file conflicts;
  see TEST_PLAN → "Parallel execution". Test-level parallelism (fullyParallel
  within files) would need per-worker seed-data isolation — revisit only if
  file-level stops being enough.
- **Ephemeral/per-run environments** — would eliminate the concurrency
  bottleneck entirely; a platform-team conversation, not a test-repo change.
- **PR runs from forks** — secrets aren't available to fork PRs by design;
  external contributors get static checks only.

## Implementation order

1. `static.yml` (zero risk, immediate value)
2. Configure the `qa` environment + secrets/vars in GitHub
3. `e2e-nightly.yml` with artifact upload; watch it for a week
4. `@smoke` tags + `e2e-smoke.yml` PR lane
5. Allure Pages history, then Slack alerts
