import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { BACKEND_URL } from "../../utils/apiHelper";
import {
  LIMA_ORDERING_URL,
  readChainSlug,
  readRestaurantSlug,
  readSharedState,
} from "../../utils/testData";

/**
 * Tenant resolution on the shared ordering host.
 *
 * The load-bearing property is not "the right tenant renders" but "a WRONG
 * tenant never does" — an unresolvable slug must produce a neutral screen, not
 * somebody else's restaurant.
 */
test.describe("Lima — slug resolution", () => {
  const restaurantSlug = readRestaurantSlug();
  const chainSlug = readChainSlug();

  test.skip(
    !restaurantSlug,
    "Ordering slug not seeded — backend may predate the slug endpoint"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-L01: the backend resolves a restaurant slug @smoke", async ({
    request,
  }) => {
    const state = readSharedState();
    const resp = await request.get(
      `${BACKEND_URL}/api/public/site?slug=${restaurantSlug}`
    );
    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as {
      success: boolean;
      data: {
        type: string;
        restaurantId: string;
        indexable: boolean;
        presentation?: { name?: string };
      };
    };
    await allure.parameter("payload", JSON.stringify(body.data));

    expect(body.success).toBe(true);
    expect(body.data.type).toBe("restaurant");
    expect(body.data.restaurantId).toBe(state.restaurantId);
    // The shared host must never compete with the restaurant's own website in
    // search results — preserving their SEO is the whole pitch of the feature.
    expect(body.data.indexable).toBe(false);
    // One round trip must carry enough to render a per-tenant <title>.
    expect(body.data.presentation?.name).toBeTruthy();
  });

  test("TC-L02: a chain slug resolves to chain mode", async ({ request }) => {
    test.skip(!chainSlug, "Chain fixture unavailable");

    const resp = await request.get(
      `${BACKEND_URL}/api/public/site?slug=${chainSlug}`
    );
    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as {
      data: { type: string; chainId: string };
    };
    expect(body.data.type).toBe("chain");
    expect(body.data.chainId).toBeTruthy();
  });

  test("TC-L03: unknown, reserved and malformed slugs all 404 @smoke", async ({
    request,
  }) => {
    await allure.description(
      "A slug we cannot resolve must 404 so the storefront shows its neutral " +
        "screen. Reserved words matter because the slug occupies the first " +
        "path segment and would otherwise shadow a real route."
    );

    for (const slug of [
      "definitely-not-a-real-slug",
      "menu", // reserved — would shadow /menu
      "checkout", // reserved
      "Joes Pizza", // malformed
    ]) {
      const resp = await request.get(
        `${BACKEND_URL}/api/public/site?slug=${encodeURIComponent(slug)}`
      );
      expect(resp.status(), `"${slug}" should not resolve`).toBe(404);
    }
  });

  test("TC-L04: an unresolvable slug never renders another tenant @smoke", async ({
    page,
  }) => {
    const state = readSharedState();
    const lima = createLimaStorefrontPage(page);

    await page.goto(`${LIMA_ORDERING_URL}/definitely-not-a-real-slug/menu`, {
      waitUntil: "domcontentloaded",
    });

    const body = (await page.locator("body").innerText()).toLowerCase();
    await allure.parameter("body excerpt", body.slice(0, 200));

    // The specific failure this guards: falling back to whichever tenant was
    // resolved last, or to a build-time default.
    expect(
      body.includes(state.restaurantName.toLowerCase()),
      "the seed restaurant must not render for an unknown slug"
    ).toBe(false);
    expect(await lima.documentTitle()).not.toContain(state.restaurantName);
  });

  test("TC-L05: the ordering host is not indexable", async ({
    page,
    request,
  }) => {
    const lima = createLimaStorefrontPage(page);
    await lima.gotoMenu(restaurantSlug);

    const robotsMeta = await lima.metaRobots();
    await allure.parameter("meta robots", robotsMeta ?? "(absent)");
    expect(robotsMeta ?? "").toContain("noindex");

    const robotsTxt = await request.get(`${LIMA_ORDERING_URL}/robots.txt`);
    expect(robotsTxt.headers()["content-type"]).toContain("text/plain");
    // Falling through to the SPA returns HTML with a 200, which crawlers read
    // as "no rules" — an accidental allow.
    expect(await robotsTxt.text()).toContain("Disallow: /");
  });

  test("TC-L06: healthz answers without rendering the app", async ({
    request,
  }) => {
    // The SPA catch-all used to answer 200 + HTML to everything, so any
    // liveness probe passed even with the app broken.
    const resp = await request.get(`${LIMA_ORDERING_URL}/healthz`);
    expect(resp.status()).toBe(200);
    expect(resp.headers()["content-type"]).toContain("text/plain");
    expect((await resp.text()).trim()).toBe("ok");
  });

  test("TC-L07: a missed asset 404s instead of returning HTML", async ({
    request,
  }) => {
    // Serving index.html for a .js path makes the browser try to execute a
    // page as a script — a confusing failure a long way from its cause.
    const resp = await request.get(
      `${LIMA_ORDERING_URL}/${restaurantSlug}/assets/does-not-exist.js`
    );
    expect(resp.status()).toBe(404);
  });
});
