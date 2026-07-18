# Restaunax Automation

End-to-end UI tests for the Restaunax platform, written in TypeScript with
[Playwright](https://playwright.dev/) and [Allure](https://allurereport.org/)
reporting. The suite targets the QA/Staging environment.

## Quick start

```bash
npm install
npx playwright install chromium
```

Create `Automation/.env` with the variables documented in
[`TEST_PLAN.md`](./TEST_PLAN.md#environment-variables) (QA credentials —
not checked into the repo).

```bash
npm test               # all tests, headless — NO email sent (excludes @email)
npm run test:headed    # visible browser
npm run test:ui        # interactive Playwright UI
npm run report:html    # open the Playwright HTML report (no Java)
npm run report         # generate + open the Allure report (needs Java)

# Email-sending tests are tagged @email and excluded from the default run above
# (they'd drain the Mailtrap 500/mo quota). Run them deliberately:
npm run test:email     # ⚠️ the @email group (~19 emails)
npm run test:demo      # ⚠️ just the demo flow
npm run test:all       # ⚠️ full suite incl. email
# Writing one test? Run just it: npx playwright test -g "TC-142"
```

Full instructions — setup, running individual tests, reading reports, and the
email/test-execution strategy — in [`RUNNING_TESTS.md`](./RUNNING_TESTS.md) and
[`TEST_PLAN.md`](./TEST_PLAN.md#test-execution-strategy).

## Documentation

| Doc                                      | What it's for                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| [`RUNNING_TESTS.md`](./RUNNING_TESTS.md) | How-to: setup, run all/individual tests, view reports                                   |
| [`TEST_PLAN.md`](./TEST_PLAN.md)         | Canonical reference: role model, project structure, conventions, how to add a test      |
| [`TEST_CASES.md`](./TEST_CASES.md)       | Plain-English description of every test case, for non-technical readers                 |
| [`TEST_COVERAGE.md`](./TEST_COVERAGE.md) | Coverage map by feature area, known gaps, and technical debt                            |
| [`CLAUDE.md`](./CLAUDE.md)               | Platform reference (roles, routes, backend endpoints) for AI-assisted work in this repo |

## CI

```bash
npm run test:ci   # CI mode (config reporters: list + html + json + Allure)
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```
