import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

/**
 * Local-stack runs: your own backend + dashboard, never QA or production.
 *
 *   npx playwright test -c playwright.local.config.ts <spec files>
 *
 * - Secrets and URLs come from the git-ignored `.env.local` (then `.env` for
 *   anything it leaves out). Never commit either.
 * - No globalSetup / globalTeardown: those log the shared QA actors in and
 *   hard-delete their sweeps. Run only self-contained specs here (ones that
 *   mint their own tenant), as RUNNING_TESTS.md → "Local run" lists.
 * - KEEP_TEST_DATA defaults to true: a developer's database never loses rows.
 * - Refuses to start unless BACKEND_URL and FRONTEND_URL are localhost.
 */
dotenv.config({ path: path.resolve(__dirname, ".env.local") });
dotenv.config({ path: path.resolve(__dirname, ".env") });

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:9000";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
process.env.BACKEND_URL = BACKEND_URL;
process.env.FRONTEND_URL = FRONTEND_URL;
process.env.KEEP_TEST_DATA ??= "true";

for (const [name, url] of [
  ["BACKEND_URL", BACKEND_URL],
  ["FRONTEND_URL", FRONTEND_URL],
] as const) {
  const host = new URL(url).hostname;
  if (host !== "localhost" && host !== "127.0.0.1")
    throw new Error(
      `playwright.local.config.ts runs against a local stack only: ${name} is ${url}`
    );
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  // Each file mints its own tenant; two at a time keeps a laptop backend calm.
  workers: 2,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: FRONTEND_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "dashboard",
      testDir: "./tests/dashboard",
      use: { ...devices["Desktop Chrome"], baseURL: FRONTEND_URL },
    },
    {
      name: "pos",
      testDir: "./tests/pos",
      use: { ...devices["Desktop Chrome"], baseURL: FRONTEND_URL },
    },
  ],
});
