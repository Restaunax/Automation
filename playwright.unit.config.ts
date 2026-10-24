/**
 * Pure helper tests: no browser, no QA, no globalSetup (the main config logs
 * in to QA and seeds a restaurant before any spec, which a unit test must not
 * need). Run with `npm run test:unit`.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/unit",
  fullyParallel: true,
  reporter: [["list"]],
});
