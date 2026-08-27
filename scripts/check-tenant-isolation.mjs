/**
 * Standalone shared-origin isolation check for the embedded Lima storefront.
 *
 * Deliberately NOT a Playwright spec: the suite's globalSetup targets QA and
 * needs owner/admin credentials, which is a lot of machinery for the one thing
 * that genuinely needs a browser. This runs against a local stack in seconds.
 *
 * THE TRAP THIS AVOIDS: both tenants must share ONE BrowserContext. Two
 * contexts get two storage partitions, so the checks would pass while proving
 * nothing about the bug they exist to catch.
 *
 * Usage:
 *   node scripts/check-tenant-isolation.mjs <slugA> <slugB> [baseUrl]
 */

import { chromium } from "playwright-core";

const [, , SLUG_A, SLUG_B, BASE = "http://localhost:3000"] = process.argv;

if (!SLUG_A || !SLUG_B) {
  console.error(
    "usage: node scripts/check-tenant-isolation.mjs <slugA> <slugB> [baseUrl]"
  );
  process.exit(2);
}

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
};

const storageKeys = (page) =>
  page.evaluate(() => ({
    local: Object.keys(window.localStorage),
    session: Object.keys(window.sessionStorage),
  }));

const siteKeyOf = (page) =>
  page.evaluate(() => window.__ENV__?.VITE_REACT_APP_SITE_KEY ?? "");

/**
 * A chain-addressed tenant lands on the location picker, not a menu — correct
 * behaviour, and a legitimate tenant type to test isolation against (its site
 * key is c_<chainId>, a different namespace from a restaurant's r_<id>). Pick a
 * branch so the run can continue into the menu.
 */
const passLocationPicker = async (page) => {
  const picker = page.getByTestId("location-picker");
  if (!(await picker.isVisible().catch(() => false))) return false;
  const choose = page.getByRole("button", { name: /order here/i }).first();
  await choose.waitFor({ state: "visible", timeout: 20000 });
  await choose.click();
  await page.waitForLoadState("domcontentloaded");
  return true;
};

const addFirstItem = async (page) => {
  if (await passLocationPicker(page)) {
    console.log("    (chain tenant — selected a location to reach the menu)");
  }
  const card = page.getByTestId("menu-item-card").first();
  await card.waitFor({ state: "visible", timeout: 20000 });
  await card.click();
  const add = page.getByTestId("add-to-cart").first();
  await add.waitFor({ state: "visible", timeout: 15000 });
  await add.click();
  await page.waitForTimeout(1200);
};

const cartKeys = (keys, prefix) =>
  keys.session.filter((k) => k.startsWith(`${prefix}:`) && k.includes("cart"));

const browser = await chromium.launch({ channel: "chrome", headless: true });
// ONE context — this is the whole point.
const context = await browser.newContext();

try {
  const pageA = await context.newPage();
  const pageB = await context.newPage();

  console.log(`\nTenant A: ${BASE}/${SLUG_A}`);
  await pageA.goto(`${BASE}/${SLUG_A}/menu`, { waitUntil: "domcontentloaded" });
  const keyA = await siteKeyOf(pageA);

  console.log(`Tenant B: ${BASE}/${SLUG_B}\n`);
  await pageB.goto(`${BASE}/${SLUG_B}/menu`, { waitUntil: "domcontentloaded" });
  const keyB = await siteKeyOf(pageB);

  console.log("── identity ──");
  check("tenant A resolved a site key", !!keyA, keyA);
  check("tenant B resolved a site key", !!keyB, keyB);
  check("the two tenants have DIFFERENT site keys", !!keyA && keyA !== keyB);

  // Fail fast and say WHY. Without this, an unresolved tenant renders the
  // neutral screen and every later check dies in a 20s locator timeout that
  // looks like a UI problem rather than a resolution one.
  if (!keyA || !keyB) {
    console.error(
      "\n  A tenant did not resolve. Common causes:\n" +
        "    • the slug does not exist, is unpublished, or is inactive\n" +
        "    • the storefront is serving a stale cache entry (5 min TTL) —\n" +
        "      restart it, or wait, if you just renamed a slug\n"
    );
    process.exit(1);
  }

  console.log("\n── carts ──");
  await addFirstItem(pageA);
  const afterA = await storageKeys(pageA);
  const aCart = cartKeys(afterA, `rx:${keyA}`);
  check("tenant A's cart is namespaced", aCart.length > 0, aCart.join(", "));

  const bBefore = await storageKeys(pageB);
  const bSeesACart = bBefore.session.some((k) => k.startsWith(`rx:${keyA}:`));
  check("tenant B does NOT see tenant A's cart keys", !bSeesACart);

  await addFirstItem(pageB);
  const afterB = await storageKeys(pageB);
  const bCart = cartKeys(afterB, `rx:${keyB}`);
  check(
    "tenant B's cart is namespaced separately",
    bCart.length > 0,
    bCart.join(", ")
  );

  // Reading A's cart back proves B's write did not overwrite it.
  const aStill = await storageKeys(pageA);
  check(
    "tenant A's cart survived tenant B's write",
    cartKeys(aStill, `rx:${keyA}`).length > 0
  );

  console.log("\n── no bare keys ──");
  const BARE = [
    "auth_token",
    "auth_user",
    "restaurantCart",
    "restaurantServiceType",
    "rewardAuthToken",
    "rewardCustomerData",
  ];
  const allKeys = [
    ...aStill.local,
    ...aStill.session,
    ...afterB.local,
    ...afterB.session,
  ];
  const foundBare = BARE.filter((b) => allKeys.includes(b));
  check(
    "no un-namespaced storage keys exist",
    foundBare.length === 0,
    foundBare.join(", ") || "none"
  );

  const stray = allKeys.filter(
    (k) => !k.startsWith("rx:") && k !== "template-lima-theme-mode"
  );
  check(
    "everything except the theme preference is rx:-prefixed",
    stray.length === 0,
    stray.join(", ") || "none"
  );

  console.log("\n── auth token must not travel ──");
  const TOKEN = "tenant-a-token-should-never-travel";
  await pageA.evaluate(
    ([k, t]) => window.localStorage.setItem(`rx:${k}:auth_token`, t),
    [keyA, TOKEN]
  );

  const leaked = [];
  pageB.on("request", (req) => {
    const auth = req.headers()["authorization"];
    if (auth && auth.includes(TOKEN))
      leaked.push(`${req.method()} ${req.url()}`);
  });
  await pageB.reload({ waitUntil: "domcontentloaded" });
  await pageB.waitForTimeout(3000);

  check(
    "tenant B sent NO request carrying tenant A's token",
    leaked.length === 0,
    leaked.slice(0, 3).join(" | ") || "none"
  );

  // NOT asserted: that tenant B cannot SEE tenant A's key. It can — localStorage
  // is per-ORIGIN, so any script on this page can enumerate every tenant's keys.
  // That is inherent to the shared-domain choice, not a defect: isolation here is
  // by namespacing convention in our code, not by browser enforcement. (The
  // security consequence is real and worth knowing: XSS on one tenant's page
  // could read every tenant's token, which separate origins would have prevented.)
  //
  // What IS assertable, and what actually matters, is that tenant B's own code
  // never adopts a foreign token into its own namespace.
  const bAfterPlant = await storageKeys(pageB);
  check(
    "tenant B did not adopt tenant A's token into its own namespace",
    !bAfterPlant.local.includes(`rx:${keyB}:auth_token`)
  );

  console.log("\n── same-tab navigation between tenants ──");
  const solo = await context.newPage();
  await solo.goto(`${BASE}/${SLUG_A}/menu`, { waitUntil: "domcontentloaded" });
  await addFirstItem(solo);
  await solo.goto(`${BASE}/${SLUG_B}/menu`, { waitUntil: "domcontentloaded" });
  const residue = (await storageKeys(solo)).session.filter((k) =>
    k.startsWith(`rx:${keyA}:`)
  );
  check(
    "the previous tenant's sessionStorage is swept on boot",
    residue.length === 0,
    residue.join(", ") || "none"
  );

  const failed = results.filter((r) => !r.pass);
  console.log(
    `\n${failed.length === 0 ? "ALL PASS" : "FAILURES"}: ${results.length - failed.length}/${results.length}\n`
  );
  process.exit(failed.length === 0 ? 0 : 1);
} finally {
  await context.close();
  await browser.close();
}
