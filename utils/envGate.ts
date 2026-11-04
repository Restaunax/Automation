/**
 * envGate.ts — required environment for gating specs (RestauNax W5:T7).
 *
 * A gating spec that skips when its credentials are missing turns a CI run
 * green while proving nothing about the paywall — exactly how Menu TVs,
 * Voice AI and Social Media shipped ungated. So:
 *   - in CI (`process.env.CI` set) a missing variable FAILS every test in the
 *     describe block, naming what is missing;
 *   - on a developer machine it skips with the same message, so a partial
 *     local run stays possible.
 *
 * Call it at the top of a `test.describe` body, in place of
 * `test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "...")`.
 */
import { test } from "../fixtures/base";

/** The names in `names` that are unset or empty. */
export const missingEnv = (names: readonly string[]): string[] =>
  names.filter((n) => !process.env[n]);

/** Fail in CI, skip locally, when any of `names` is missing. */
export function requireEnv(names: readonly string[], why: string): void {
  const missing = missingEnv(names);
  if (missing.length === 0) return;
  const message = `${missing.join(", ")} not set (${why})`;
  if (process.env.CI) {
    test.beforeAll(() => {
      throw new Error(
        `[envGate] ${message} — a gating spec must not skip in CI; set the variables in the CI environment`
      );
    });
    return;
  }
  test.skip(true, `${message} — skipped locally; CI fails instead`);
}

/** The same rule from inside a test body (or a beforeAll). */
export function requireEnvHere(names: readonly string[], why: string): void {
  const missing = missingEnv(names);
  if (missing.length === 0) return;
  const message = `${missing.join(", ")} not set (${why})`;
  if (process.env.CI) {
    throw new Error(`[envGate] ${message} — a gating spec must not skip in CI`);
  }
  test.skip(true, `${message} — skipped locally; CI fails instead`);
}
