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
const CUSTOMER_URL =
  process.env.TEMPLATE_WIND_URL ?? "https://qa.restaunax.com";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },

  reporter: [
    ["list"],
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
  ],
});
