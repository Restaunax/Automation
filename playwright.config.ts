import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

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
    baseURL: process.env.FRONTEND_URL ?? "https://app.qa.restaunax.com",
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
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
