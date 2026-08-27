import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { BACKEND_URL } from "../../utils/apiHelper";
import {
  LIMA_PINNED_URL,
  readRestaurantSlug,
  readSharedState,
} from "../../utils/testData";

/**
 * Routing under a per-tenant basename.
 *
 * The whole routing change was one prop (BrowserRouter basename), so what
 * needs proving is that nothing ESCAPES it — every navigation, reload and
 * history move has to stay inside /<slug>, or the customer silently lands on
 * the origin root, which belongs to no tenant.
 */
test.describe("Lima — basename routing", () => {
  const restaurantSlug = readRestaurantSlug();

  test.skip(!restaurantSlug, "Ordering slug not seeded");

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-L20: the embed link lands on the tenant's menu @smoke", async ({
    page,
  }) => {
    const lima = createLimaStorefrontPage(page);
    await lima.gotoMenu(restaurantSlug);

    await lima.assertOnMenu();
    expect(page.url()).toContain(`/${restaurantSlug}/menu`);
  });

  test("TC-L21: a reload stays inside the tenant @smoke", async ({ page }) => {
    const lima = createLimaStorefrontPage(page);
    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();

    await page.reload({ waitUntil: "domcontentloaded" });

    // A hard reload is served by the server, not the router — this is where a
    // missing SPA fallback or a lost basename shows up.
    expect(page.url()).toContain(`/${restaurantSlug}/menu`);
    await lima.assertOnMenu();
  });

  test("TC-L22: in-app navigation and history keep the slug", async ({
    page,
  }) => {
    const state = readSharedState();
    const lima = createLimaStorefrontPage(page);

    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    await lima.openItemModal(state.menuItemName);
    await lima.clickAddToCart();

    await page.goBack({ waitUntil: "domcontentloaded" });
    expect(page.url()).toContain(`/${restaurantSlug}`);

    await page.goForward({ waitUntil: "domcontentloaded" });
    expect(page.url()).toContain(`/${restaurantSlug}`);
  });

  test("TC-L23: the tenant root goes straight to the menu", async ({
    page,
  }) => {
    await allure.description(
      "An embedded-ordering customer arrives from the restaurant's own, " +
        "already-branded site. A second landing page is a detour, so '/' " +
        "redirects — and the decision is injected server-side so there is no " +
        "flash of the landing page first."
    );

    // Whether "/" redirects depends on the tenant's own
    // brandingConfig.features.enableLandingPage. Asserting the redirect
    // unconditionally fails against a restaurant that legitimately HAS a
    // landing page, so read the flag the storefront itself acts on.
    const resp = await page.request.get(
      `${BACKEND_URL}/api/public/site?slug=${restaurantSlug}`
    );
    const landingEnabled =
      (
        (await resp.json()) as {
          data?: { presentation?: { landingPageEnabled?: boolean } };
        }
      )?.data?.presentation?.landingPageEnabled === true;
    await allure.parameter("landingPageEnabled", String(landingEnabled));

    const lima = createLimaStorefrontPage(page);
    await lima.gotoRoot(restaurantSlug);

    if (landingEnabled) {
      // Landing page on: stay at the tenant root, do not bounce to /menu.
      await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/?$`), {
        timeout: 15_000,
      });
    } else {
      await expect(page).toHaveURL(/\/menu/, { timeout: 15_000 });
    }
  });

  test("TC-L24: the tenant's own title and branding are served", async ({
    page,
  }) => {
    const state = readSharedState();
    const lima = createLimaStorefrontPage(page);
    await lima.gotoMenu(restaurantSlug);

    const title = await lima.documentTitle();
    await allure.parameter("title", title);

    // index.html ships with the literal title "Order Now"; on a shared host
    // that would be every tenant's tab title.
    expect(title).not.toBe("Order Now");
    expect(title.toLowerCase()).toContain(
      state.restaurantName.toLowerCase().slice(0, 8)
    );
  });
});

test.describe("Lima — legacy pinned deployment", () => {
  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering");
    await allure.label("severity", "critical");
  });

  // Opt-in: point LIMA_PINNED_URL at a deployment that actually pins a tenant
  // (VITE_REACT_APP_RESTAURANT_ID / _CHAIN_ID set) and this runs.
  //
  // It does not run by default any more because there is no longer a pinned
  // Lima deployment to point it at — restaurants.yml was retired and
  // lima.restaunax.com now runs the shared multi-tenant app. Left in place
  // rather than deleted: the precedence rule it guards (pinned env wins over
  // Host and path) is still live in server.ts and is the rollback path if a
  // per-restaurant deployment is ever stood up again. A test asserting a
  // deployment nobody operates is noise; one that skips until you have that
  // deployment is a checklist item.
  test("TC-L25: a pinned single-tenant deployment still renders @smoke", async ({
    page,
  }) => {
    test.skip(
      !process.env.LIMA_PINNED_URL,
      "No pinned deployment configured — set LIMA_PINNED_URL to exercise the rollback path"
    );

    await allure.description(
      "The rollback guarantee. server.ts checks pinned env FIRST, so a " +
        "per-restaurant Lima deployment must behave exactly as before."
    );

    const resp = await page.goto(LIMA_PINNED_URL, {
      waitUntil: "domcontentloaded",
    });
    expect(resp?.status()).toBeLessThan(400);

    // It renders a real storefront, not the neutral not-configured screen.
    const body = (await page.locator("body").innerText()).toLowerCase();
    await allure.parameter("body excerpt", body.slice(0, 200));
    expect(body).not.toContain("not configured");
    expect(body.length).toBeGreaterThan(50);

    // No basename: a pinned tenant owns the whole origin.
    expect(new URL(page.url()).pathname).toMatch(/^\/?$|^\/menu\/?$/);
  });
});
