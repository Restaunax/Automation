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

  // Standalone Node scripts (scripts/*.mjs). They run under plain node, not
  // Playwright's runner, so they need Node globals declared — without this,
  // process/console read as undefined and every use is a no-undef error.
  //
  // Browser globals too, because page.evaluate() callbacks are browser-context
  // code living inside a Node file. The .ts specs never hit this: typescript-eslint
  // disables no-undef there and lets the compiler handle it, so plain-JS scripts
  // are the only place the rule actually fires.
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
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
