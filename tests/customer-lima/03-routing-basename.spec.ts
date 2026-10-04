import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { BACKEND_URL } from "../../utils/apiHelper";
import {
  LIMA_PINNED_URL,
  readChainSlug,
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
    const tenant = (route: string) =>
      new RegExp(`/${restaurantSlug}/${route}(\\?|$)`);

    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    // The item modal and Add to Cart are in-page state, not routes — they push
    // no history entry. History is only proven by moves the ROUTER makes, so
    // navigate in-app: the nav cart control, then a top-nav link.
    await lima.openItemModal(state.menuItemName);
    await lima.clickAddToCart();

    // menu → cart (nav cart control) → menu (top-nav "Menu" link, present for
    // every tenant, unlike the flag-gated Gift Cards / Careers entries).
    await lima.cartButton().click();
    await expect(page).toHaveURL(tenant("cart"));

    await lima.navLink("Menu").click();
    await expect(page).toHaveURL(tenant("menu"));

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(tenant("cart"));

    await page.goBack({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(tenant("menu"));

    await page.goForward({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(tenant("cart"));

    // A reload mid-history is served by the server, not the router.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(tenant("cart"));
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
    await allure.description(
      "On a shared host the <title> is injected server-side per request from " +
        "the tenant the PATH resolves to (server.ts renderHtml: " +
        "presentation.metaTitle, else 'Order from <name>'). The expectation is " +
        "read from the backend's own resolution of each slug, so the test " +
        "pins WHICH tenant's head was served — not whatever copy an owner " +
        "happens to have typed into their SEO title. A second tenant is " +
        "fetched from the same server to catch a head cached across tenants."
    );

    const lima = createLimaStorefrontPage(page);

    /** The backend's resolution of a slug, and the title Lima must serve for it. */
    const resolve = async (slug: string) => {
      const resp = await page.request.get(
        `${BACKEND_URL}/api/public/site?slug=${slug}`
      );
      expect(resp.status(), `site lookup for ${slug}`).toBe(200);
      const site = (
        (await resp.json()) as {
          data: {
            restaurantId: string | null;
            chainId?: string | null;
            presentation: { name: string; metaTitle: string | null };
          };
        }
      ).data;
      const expectedTitle =
        site.presentation.metaTitle || `Order from ${site.presentation.name}`;
      return { site, expectedTitle };
    };

    /** The <title> in the server-rendered HTML (crawlers, unfurlers, first paint). */
    const servedTitle = async (slug: string) => {
      const html = await (
        await page.request.get(`${lima.tenantRoot(slug)}/menu`)
      ).text();
      return /<title>([\s\S]*?)<\/title>/
        .exec(html)?.[1]
        ?.replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&");
    };

    // 1. The slug must still resolve to the seed restaurant — globalSetup
    //    minted it FOR that restaurant (ensureOrderingSlug). If it resolved
    //    elsewhere, every title assertion below would pass vacuously.
    const own = await resolve(restaurantSlug);
    expect(own.site.restaurantId).toBe(readSharedState().restaurantId);
    await allure.parameter("expected title", own.expectedTitle);

    // 2. Server-rendered head is exactly this tenant's.
    expect(await servedTitle(restaurantSlug)).toBe(own.expectedTitle);

    // 3. Cross-tenant: a second tenant on the same origin gets ITS head, and
    //    asking for it does not bleed into the first tenant's next response.
    const otherSlug = readChainSlug();
    if (otherSlug) {
      const other = await resolve(otherSlug);
      await allure.parameter("other tenant title", other.expectedTitle);
      expect(await servedTitle(otherSlug)).toBe(other.expectedTitle);
      expect(await servedTitle(restaurantSlug)).toBe(own.expectedTitle);
    }

    // 4. …and the live tab after the app boots.
    await lima.gotoMenu(restaurantSlug);
    const title = await lima.documentTitle();
    await allure.parameter("title", title);

    // index.html ships with the literal title "Order Now"; on a shared host
    // that would be every tenant's tab title.
    expect(title).not.toBe("Order Now");
    expect(title).toBe(own.expectedTitle);
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
