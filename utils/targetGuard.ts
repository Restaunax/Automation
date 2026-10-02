/**
 * targetGuard.ts
 *
 * Safety guard against a catastrophic env misconfiguration.
 *
 * This suite mutates data and its globalTeardown HARD-DELETES via an admin
 * token — menu items, automation categories, AUTO* coupons, recorded users. All
 * targets are plain env reads (FRONTEND_URL / BACKEND_URL / TEMPLATE_WIND_URL)
 * that default to QA. If any were ever pointed at production — a one-line
 * mistake in a CI secret or a stray shell export — the teardown would delete
 * real production data.
 *
 * assertSafeTargets() refuses to run unless EVERY resolved target host is an
 * allowlisted QA or localhost host. It is called at the very top of both
 * globalSetup and globalTeardown, before any login, mutation, or sweep.
 */

// Exact hosts that are safe to run (and destroy data) against. The QA customer
// storefronts live at bare subdomains (wind./lima.restaunax.com), NOT under
// .qa.restaunax.com, so they must be listed explicitly. (qa.restaunax.com is the
// QA marketing site — harmless to allow, but it is NOT the ordering storefront.)
const ALLOWED_EXACT = new Set([
  "localhost",
  "127.0.0.1",
  "qa.restaunax.com",
  "wind.restaunax.com", // Template Wind QA storefront (TEMPLATE_WIND_URL)
  "lima.restaunax.com", // Template Lima QA storefront
]);

// Any subdomain of the QA zone: app.qa, api.qa, wind.qa, lima.qa, …
const ALLOWED_SUFFIX = ".qa.restaunax.com";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    // A non-URL value (bare host, empty string) is suspicious — return it as-is
    // so it fails the allowlist rather than silently passing.
    return url;
  }
}

function isAllowedHost(host: string): boolean {
  return ALLOWED_EXACT.has(host) || host.endsWith(ALLOWED_SUFFIX);
}

/**
 * Throw if any target resolves to a non-allowlisted host. `targets` is a map of
 * label → url (e.g. { FRONTEND_URL, BACKEND_URL, TEMPLATE_WIND_URL }).
 */
export function assertSafeTargets(targets: Record<string, string>): void {
  const violations: string[] = [];
  for (const [name, url] of Object.entries(targets)) {
    const host = hostOf(url);
    if (!isAllowedHost(host)) {
      violations.push(`${name}=${url} (host: ${host})`);
    }
  }

  if (violations.length > 0) {
    throw new Error(
      "REFUSING TO RUN: this suite hard-deletes data via an admin token, and " +
        "one or more targets are NOT allowlisted QA/localhost hosts. This " +
        "guard exists so a misconfigured env can never point teardown at " +
        "production.\n  Offending targets:\n    " +
        violations.join("\n    ") +
        "\n  Allowed: localhost, 127.0.0.1, qa.restaunax.com, *.qa.restaunax.com" +
        "\n  If you genuinely added a new QA host, add it to utils/targetGuard.ts."
    );
  }
}
