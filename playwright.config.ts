import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

// Two front-end web apps live under tests/: the Restaunax dashboard
// (tests/dashboard) and the Template Wind customer site (tests/customer).
// Each gets its own project below so page.goto("/menu") resolves against the
// correct host. See TEST_PLAN.md for the structure rationale.
const DASHBOARD_URL =
  process.env.FRONTEND_URL ?? "https://app.qa.restaunax.com";
// Default must be the actual ordering storefront (wind.), NOT qa.restaunax.com
// — that host is the QA marketing site (see utils/targetGuard.ts).
const CUSTOMER_URL =
  process.env.TEMPLATE_WIND_URL ?? "https://wind.restaunax.com";

// Email-sending tests are tagged @email (@demo = demo subset). They are EXCLUDED
// by default — local runs AND the nightly — so routine runs never touch the
// Mailtrap 500/mo quota, however Playwright is invoked (`npm test`, a bare
// `npx playwright test`, or the nightly CI job). Opt in with INCLUDE_EMAIL_TESTS=1
// (see the test:email / test:demo / test:all scripts + e2e-email-weekly.yml),
// which DROPS the exclusion so a `--grep @email` selects them instead of colliding
// with the invert. See TEST_PLAN → "Test execution strategy".
const includeEmail = !!process.env.INCLUDE_EMAIL_TESTS;

export default defineConfig({
  testDir: "./tests",
  grepInvert: includeEmail ? undefined : /@email/,
  // Parallelism model: a spec FILE is the isolation unit. fullyParallel stays
  // false so in-file order is preserved (serial CRUD chains, beforeAll
  // seeding); different files run concurrently across workers. The contract
  // every file must honor to keep this safe (see TEST_PLAN.md → "Parallel
  // execution"):
  //   1. create your own data with unique names (generateRunId/uuid) — never
  //      assume another file has or hasn't run;
  //   2. restore any shared QA setting you mutate, in a finally;
  //   3. never mutate a row another file asserts against (demo-actions seeds
  //      its own demo request for exactly this reason).
  // CI runs fewer workers: shared QA gets nightly load from other sources,
  // and stability there matters more than wall-clock time.
  // Worker count and the 90s test budget were tuned empirically: at 4 workers
  // the combined local Chromium contention + QA load pushed normally-fast
  // steps past a 60s budget (pure slowness, no data races). 3 workers is the
  // sweet spot on a dev machine against QA.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : 3,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },

  reporter: [
    ["list"],
    // Zero-dependency local report (no Java, unlike Allure) — view with
    // `npm run report:html`. open:"never" keeps headless/CI runs from
    // launching a browser.
    ["html", { outputFolder: "playwright-report", open: "never" }],
    // Machine-readable results consumed by scripts/publish-results.ts (Allure is
    // for humans; this JSON is for the CI → Postgres → Grafana pipeline).
    ["json", { outputFile: "results.json" }],
    [
      "allure-playwright",
      {
        outputFolder: "allure-results",
        suiteTitle: false,
        detail: true,
        links: {
          issue: {
            nameTemplate: "Issue #%s",
            urlTemplate: "https://github.com/Restaunax/RestauNax/issues/%s",
          },
        },
      },
    ],
  ],

  use: {
    // Default base URL (used by globalSetup). Per-project overrides below.
    baseURL: DASHBOARD_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  globalSetup: "./globalSetup.ts",
  globalTeardown: "./globalTeardown.ts",

  projects: [
    {
      // Restaunax dashboard — admin / owner / employee / public flows.
      name: "dashboard",
      testDir: "./tests/dashboard",
      use: { ...devices["Desktop Chrome"], baseURL: DASHBOARD_URL },
    },
    {
      // Template Wind — customer ordering flows.
      name: "customer",
      testDir: "./tests/customer",
      use: { ...devices["Desktop Chrome"], baseURL: CUSTOMER_URL },
    },
    {
      // Device In Store / POS — API-level order lifecycle (no browser UI; the
      // POS itself is React Native, tested through the backend). baseURL is the
      // dashboard host only so a stray page.goto resolves somewhere sane.
      name: "pos",
      testDir: "./tests/pos",
      use: { ...devices["Desktop Chrome"], baseURL: DASHBOARD_URL },
    },
  ],
});
