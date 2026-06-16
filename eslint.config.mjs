import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import playwright from "eslint-plugin-playwright";

export default tseslint.config(
  {
    ignores: [
      "node_modules",
      "dist",
      "allure-results",
      "allure-report",
      "playwright-report",
      "test-results",
    ],
  },

  // Base JS + TypeScript (non-type-checked "recommended") for all source.
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // Brand-new ESLint 10 rule — not yet common practice; keep it relaxed.
      "preserve-caught-error": "off",
    },
  },

  // Playwright rules for tests, page objects, and fixtures.
  // A small, common-practice set (not the full opinionated preset) — just the
  // high-value guards. test.fixme scaffolds are intentionally allowed.
  {
    files: ["tests/**/*.ts", "pages/**/*.ts", "fixtures/**/*.ts"],
    plugins: { playwright },
    rules: {
      "playwright/no-focused-test": "error", // never commit test.only
      "playwright/missing-playwright-await": "error", // un-awaited expect = no-op
      "playwright/valid-expect": "error", // basic assertion correctness
      "playwright/no-wait-for-timeout": "warn", // discourage hard-coded sleeps
      "playwright/prefer-web-first-assertions": "warn",
    },
  }
);
