import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

// Local-stack run: your own backend (:9000) + dashboard (:5173). No
// globalSetup/globalTeardown — every spec mints its own tenants, and a
// developer's local database must never be swept (RUNNING_TESTS.md →
// "Against a local stack"). Set KEEP_TEST_DATA=true.
const DASHBOARD_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: DASHBOARD_URL,
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "dashboard",
      testDir: "./tests/dashboard",
      use: { ...devices["Desktop Chrome"], baseURL: DASHBOARD_URL },
    },
    {
      name: "pos",
      testDir: "./tests/pos",
      use: { ...devices["Desktop Chrome"], baseURL: DASHBOARD_URL },
    },
  ],
});
