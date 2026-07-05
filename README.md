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
npm test               # all tests, headless
npm run test:headed    # visible browser
npm run test:ui        # interactive Playwright UI
npm run report         # generate + open the Allure report
```

## Documentation

| Doc                                      | What it's for                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| [`TEST_PLAN.md`](./TEST_PLAN.md)         | Canonical reference: role model, project structure, conventions, how to add a test      |
| [`TEST_CASES.md`](./TEST_CASES.md)       | Plain-English description of every test case, for non-technical readers                 |
| [`TEST_COVERAGE.md`](./TEST_COVERAGE.md) | Coverage map by feature area, known gaps, and technical debt                            |
| [`CLAUDE.md`](./CLAUDE.md)               | Platform reference (roles, routes, backend endpoints) for AI-assisted work in this repo |

## CI

```bash
npm run test:ci   # CI mode, Allure reporter
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
```
