import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import {
  readChainSlug,
  readRestaurantSlug,
  readSharedState,
} from "../../utils/testData";

/**
 * The reason this suite exists.
 *
 * Every previous Lima deployment owned its own origin, so the browser isolated
 * each restaurant's storage for free. The shared ordering host puts every
 * tenant on ONE origin, which means cart, service type and — worst — the reward
 * token are one bug away from crossing between restaurants.
 *
 * ⚠️ THE TRAP: both tenants must live in the SAME BrowserContext. Using
 * browser.newContext() twice gives each its own storage, so these tests would
 * go green while proving nothing about the bug they exist to catch. Always
 * context.newPage().
 */
test.describe("Lima — tenant isolation on a shared origin", () => {
  const restaurantSlug = readRestaurantSlug();
  const chainSlug = readChainSlug();

  test.skip(
    !restaurantSlug || !chainSlug,
    "Ordering slugs not seeded — backend may predate the slug endpoint"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering");
    await allure.label("severity", "blocker");
  });

  test("TC-L10: two tenants in one browser context keep separate carts @smoke", async ({
    context,
  }) => {
    await allure.description(
      "Adds an item at one tenant and confirms a second tenant, in the same " +
        "browser context and therefore the same origin, sees an empty cart."
    );

    const state = readSharedState();
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    const limaA = createLimaStorefrontPage(pageA);
    const limaB = createLimaStorefrontPage(pageB);

    await allure.step(`Tenant A (${restaurantSlug}) adds an item`, async () => {
      await limaA.gotoMenu(restaurantSlug);
      await limaA.assertOnMenu();
      await limaA.openItemModal(state.menuItemName);
      await limaA.clickAddToCart();
      expect(await limaA.cartBadgeCount()).toBeGreaterThan(0);
    });

    await allure.step(
      `Tenant B (${chainSlug}) sees an empty cart`,
      async () => {
        await limaB.gotoRoot(chainSlug);
        expect(await limaB.cartBadgeCount()).toBe(0);
      }
    );

    await allure.step("Tenant A still holds its own cart", async () => {
      await pageA.reload({ waitUntil: "domcontentloaded" });
      expect(await limaA.cartBadgeCount()).toBeGreaterThan(0);
    });

    await pageA.close();
    await pageB.close();
  });

  test("TC-L11: storage is namespaced per tenant and never bare @smoke", async ({
    context,
  }) => {
    await allure.description(
      "Every persisted key must carry the rx:<siteKey> prefix. A bare " +
        "auth_token or restaurantCart is the exact shape of the leak."
    );

    const state = readSharedState();
    const page = await context.newPage();
    const lima = createLimaStorefrontPage(page);

    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    await lima.openItemModal(state.menuItemName);
    await lima.clickAddToCart();

    const keys = await lima.readStorageKeys();
    await allure.parameter("localStorage", keys.local.join(", "));
    await allure.parameter("sessionStorage", keys.session.join(", "));

    const BARE = [
      "auth_token",
      "auth_user",
      "restaurantCart",
      "restaurantServiceType",
      "rewardAuthToken",
      "rewardCustomerData",
    ];
    for (const bare of BARE) {
      expect(keys.local, `localStorage must not hold "${bare}"`).not.toContain(
        bare
      );
      expect(
        keys.session,
        `sessionStorage must not hold "${bare}"`
      ).not.toContain(bare);
    }

    // The cart we just created must exist, and must be namespaced.
    const cartKeys = keys.session.filter((k) => k.includes("cart"));
    expect(
      cartKeys.length,
      "a cart key should exist after adding an item"
    ).toBeGreaterThan(0);
    for (const key of cartKeys) {
      expect(key, "cart key must be tenant-scoped").toMatch(/^rx:[rc]_/);
    }

    await page.close();
  });

  test("TC-L12: a second tenant sends no Authorization header @smoke", async ({
    context,
  }) => {
    await allure.description(
      "The real proof: UI state alone is too weak, because a token can be " +
        "attached to API calls while the UI still looks logged out. " +
        "apiService's request interceptor is the line this guards."
    );

    const pageA = await context.newPage();
    const limaA = createLimaStorefrontPage(pageA);
    await limaA.gotoMenu(restaurantSlug);
    await limaA.assertOnMenu();

    // Plant a token in tenant A's namespace directly. Going through the OTP UI
    // would test the login flow; this test is about whether a token that
    // EXISTS for one tenant can reach another.
    await pageA.evaluate(() => {
      const key = Object.keys(window.localStorage).find((k) =>
        k.startsWith("rx:")
      );
      const prefix = key ? key.split(":").slice(0, 2).join(":") : null;
      if (prefix) {
        window.localStorage.setItem(
          `${prefix}:auth_token`,
          "tenant-a-token-should-never-travel"
        );
      }
    });

    const pageB = await context.newPage();
    const limaB = createLimaStorefrontPage(pageB);
    const authorized = limaB.trackAuthorizedRequests();

    await limaB.gotoRoot(chainSlug);
    // Wait for the tenant's own bootstrap calls to actually finish rather than
    // guessing at a duration — the assertion below is only meaningful once
    // requests have been made.
    await pageB.waitForLoadState("networkidle");

    const leaked = authorized.filter((entry) =>
      entry.includes("tenant-a-token-should-never-travel")
    );
    await allure.parameter("authorized requests", String(authorized.length));
    expect(
      leaked,
      `tenant A's token reached tenant B:\n${leaked.join("\n")}`
    ).toHaveLength(0);

    await pageA.close();
    await pageB.close();
  });

  test("TC-L13: navigating between tenants in ONE tab leaves no residue", async ({
    context,
  }) => {
    await allure.description(
      "sessionStorage survives same-tab navigation, so browsing one tenant " +
        "and then another would otherwise leave the first tenant's cart in " +
        "the same store."
    );

    const state = readSharedState();
    const page = await context.newPage();
    const lima = createLimaStorefrontPage(page);

    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    await lima.openItemModal(state.menuItemName);
    await lima.clickAddToCart();

    const before = await lima.readStorageKeys();
    const tenantAPrefix = before.session
      .find((k) => k.startsWith("rx:"))
      ?.split(":")
      .slice(0, 2)
      .join(":");
    expect(tenantAPrefix, "tenant A should have session keys").toBeTruthy();

    await lima.gotoRoot(chainSlug);

    const after = await lima.readStorageKeys();
    const residue = after.session.filter((k) =>
      k.startsWith(`${tenantAPrefix}:`)
    );
    await allure.parameter("residue", residue.join(", ") || "(none)");
    expect(
      residue,
      "the previous tenant's sessionStorage should be swept on boot"
    ).toHaveLength(0);

    await page.close();
  });
});
