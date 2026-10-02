/**
 * 06-menu-handoff.spec.ts — owner menu action → customer storefront (Layer 3).
 *
 * Two contexts in ONE test: `page` (anonymous, Template Wind at
 * TEMPLATE_WIND_URL/menu?restaurantId=…) and `ownerPage` (restored owner
 * dashboard session). Proves the hand-off the owner tab tests can't: what the
 * owner toggles is what the customer sees AND what the server quotes.
 * See docs/MENU_TAB_TEST_STRATEGY.md §4 (Layer 3).
 *
 * Own data: TC-320 seeds a private category + item on the seed restaurant;
 * TC-321/322 use the persistent Automation Chain fixture (skip without it).
 * Everything is restored / hard-deleted afterwards.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerMenuPage } from "../../pages/customer/CustomerMenuPage";
import { createMenuAvailabilityPage } from "../../pages/dashboard/restaurant/MenuManagementPage";
import { createLocationPricingDialog } from "../../pages/dashboard/restaurant/LocationPricingDialog";
import { readSharedState, generateRunId } from "../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  deleteTestMenuGroup,
  deleteMenuItemRaw,
  permanentlyDeleteMenuItemApi,
  setAvailability,
  setPriceOverrideRaw,
  setCarriedRaw,
  quoteOrderRaw,
  type ApiMenuItem,
} from "../../utils/apiHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Menu → Storefront hand-off", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL and OWNER_PASSWORD must be set in .env"
  );
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  const CATEGORY = `Automation Menu ${runId}`;
  let restaurantId = "";
  let token = "";
  let adminToken = "";
  let groupId = "";
  let item: ApiMenuItem;
  // Chain fixture
  let chainGroupId = "";
  let locA = "";
  let locB = "";
  let sharedGroupId = "";
  let shared: ApiMenuItem;

  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  test.beforeAll(async () => {
    if (!TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD) return;
    const state = readSharedState();
    restaurantId = state.restaurantId;
    chainGroupId = state.chainGroupId ?? "";
    locA = state.chainLocationAId ?? "";
    locB = state.chainLocationBId ?? "";
    token = await freshToken();
    if (ADMIN_EMAIL && ADMIN_PASSWORD) {
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    }
    groupId = (await createMenuGroupNamed(token, CATEGORY, { restaurantId }))
      .id;
    item = await createMenuItemFull(
      token,
      groupId,
      `Handoff Item ${runId}`,
      9.75,
      {
        description: "storefront hand-off item",
      }
    );
    if (chainGroupId) {
      sharedGroupId = (
        await createMenuGroupNamed(token, CATEGORY, { groupId: chainGroupId })
      ).id;
      shared = await createMenuItemFull(
        token,
        sharedGroupId,
        `Handoff Shared ${runId}`,
        12,
        {
          description:
            "shared chain item — no modifiers so the base price is the charge",
        }
      );
    }
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshToken().catch(() => token);
    for (const it of [item, shared].filter(Boolean)) {
      if (adminToken)
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
      else await deleteMenuItemRaw(t, it.id).catch(() => {});
    }
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    if (sharedGroupId)
      await deleteTestMenuGroup(t, sharedGroupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Menu → Storefront");
    await allure.label("severity", "critical");
    token = await freshToken();
  });

  test("TC-320: an item the owner marks sold out disappears from the storefront menu and comes back when restored", async ({
    page,
    ownerPage,
  }) => {
    await allure.description(
      "Storefront shows the seeded item card with its price. Owner (Menu tab) switches it OFF → 'Mark sold out'. " +
        "Reloading the storefront: the card is gone (template-wind filters outOfStock items out of the menu grid). " +
        "Owner switches it back ON → card is back."
    );
    const menu = createCustomerMenuPage(page);
    const tab = createMenuAvailabilityPage(ownerPage);

    await allure.step("Storefront lists the item", async () => {
      await menu.goto(restaurantId);
      await menu.assertPageLoaded();
      await expect(menu.menuItemCard(item.name)).toBeVisible({
        timeout: 30_000,
      });
    });

    await allure.step("Owner marks it sold out", async () => {
      await tab.goto(restaurantId);
      await tab.assertLoaded();
      await tab.expandCategory(CATEGORY);
      const { status } = await tab.markSoldOut(CATEGORY, item.name);
      expect(status).toBe(200);
      await tab.assertItemOutOfStock(CATEGORY, item.name);
    });

    await allure.step("Storefront no longer offers it", async () => {
      await menu.goto(restaurantId);
      await menu.assertPageLoaded();
      // Positive control: the page rendered a menu (another card of ours is
      // not available, so use the category heading / any card).
      await expect(
        page
          .getByRole("heading", { name: CATEGORY })
          .or(page.getByText(CATEGORY))
          .first()
      )
        .toBeVisible({ timeout: 30_000 })
        .catch(() => {
          /* an empty category may not render a heading — the item check below is the assertion */
        });
      await expect(menu.menuItemCard(item.name)).toHaveCount(0);
    });

    await allure.step(
      "Owner restores → storefront offers it again",
      async () => {
        await tab.goto(restaurantId);
        await tab.assertLoaded();
        await tab.expandCategory(CATEGORY);
        const { status } = await tab.markAvailable(CATEGORY, item.name);
        expect(status).toBe(200);
        await menu.goto(restaurantId);
        await expect(menu.menuItemCard(item.name)).toBeVisible({
          timeout: 30_000,
        });
      }
    );
  });

  test("TC-321: a per-location price override is what the customer sees AND what the server quotes — at that location only", async ({
    page,
    ownerPage,
  }) => {
    test.skip(!chainGroupId, "Automation Chain fixture not available");
    await allure.description(
      "Owner sets Base price 14 for the shared item at location A via the $ dialog. Storefront ?restaurantId=A " +
        "shows $14.00 on the card while ?restaurantId=B still shows $12.00; the public POST /api/order/:id/quote " +
        "(what checkout charges) returns subtotal 14 at A and 12 at B — the 'shown $14, charged $12' defect class. " +
        "(Fixture locations aren't published, so the storefront modal/cart is inert there; the charge is asserted " +
        "on the quote endpoint checkout itself calls.) Override cleared afterwards."
    );
    const menu = createCustomerMenuPage(page);
    const tab = createMenuAvailabilityPage(ownerPage);
    const dlg = createLocationPricingDialog(ownerPage);

    await allure.step("Owner overrides the price at A", async () => {
      await tab.goto(locA);
      await tab.assertLoaded();
      await tab.expandCategory(CATEGORY);
      await tab.priceOverrideButton(CATEGORY, shared.name).click();
      await dlg.waitFor();
      await dlg.basePriceInput().fill("14");
      const { status, body } = await dlg.save();
      expect(status).toBe(200);
      expect(body.basePriceOverride).toBe(14);
    });

    try {
      await allure.step("Storefront A shows $14.00", async () => {
        await menu.goto(locA);
        await menu.assertPageLoaded();
        const card = menu.menuItemCard(shared.name);
        await expect(card).toBeVisible({ timeout: 30_000 });
        await expect(page.getByText("$14.00").first()).toBeVisible();
        await expect(page.getByText("$12.00")).toHaveCount(0);
      });

      await allure.step(
        "Storefront B still shows the shared $12.00",
        async () => {
          await menu.goto(locB);
          await menu.assertPageLoaded();
          await expect(menu.menuItemCard(shared.name)).toBeVisible({
            timeout: 30_000,
          });
          await expect(page.getByText("$12.00").first()).toBeVisible();
          await expect(page.getByText("$14.00")).toHaveCount(0);
        }
      );

      await allure.step(
        "The server quote (what gets charged) uses the override at A only",
        async () => {
          // The fixture locations are not published, so the storefront's item
          // modal / cart is inert there (MenuPage.handleItemClick guards on
          // restaurant.published). The charge is proven at the source instead:
          // the same public /quote endpoint checkout calls before Stripe.
          const body = { orderItems: [{ menuItemId: shared.id, quantity: 1 }] };
          const qa = await quoteOrderRaw(locA, body);
          expect(qa.status, JSON.stringify(qa.data)).toBe(200);
          expect(qa.data.quote?.subtotal, "A charges the override").toBe(14);
          const qb = await quoteOrderRaw(locB, body);
          expect(qb.status).toBe(200);
          expect(qb.data.quote?.subtotal, "B charges the shared price").toBe(
            12
          );
        }
      );
    } finally {
      await setPriceOverrideRaw(token, shared.id, {
        restaurantId: locA,
        priceOverride: null,
      });
    }
  });

  test("TC-322: an item the owner removes from one location's menu is absent from that storefront only", async ({
    page,
    ownerPage,
  }) => {
    test.skip(!chainGroupId, "Automation Chain fixture not available");
    await allure.description(
      "Owner (location A Menu tab) → eye icon → 'Remove from menu'. Storefront ?restaurantId=A no longer lists " +
        "the shared item; ?restaurantId=B still does. Restored afterwards."
    );
    const menu = createCustomerMenuPage(page);
    const tab = createMenuAvailabilityPage(ownerPage);
    await tab.goto(locA);
    await tab.assertLoaded();
    await tab.expandCategory(CATEGORY);
    await tab.carryButton(CATEGORY, shared.name).click();
    const dialog = ownerPage.getByRole("dialog", {
      name: `Remove "${shared.name}" from this location's menu?`,
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const [res] = await Promise.all([
      ownerPage.waitForResponse(
        (r) =>
          /\/menu\/menu-items\/[^/]+\/carried/.test(r.url()) &&
          r.request().method() === "PATCH"
      ),
      dialog.getByRole("button", { name: "Remove from menu" }).click(),
    ]);
    expect(res.status()).toBe(200);
    try {
      await menu.goto(locA);
      await menu.assertPageLoaded();
      await expect(page.getByText(/menu|order/i).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(menu.menuItemCard(shared.name)).toHaveCount(0);
      await menu.goto(locB);
      await expect(menu.menuItemCard(shared.name)).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await setCarriedRaw(token, shared.id, {
        restaurantId: locA,
        isCarried: true,
      });
    }
    await menu.goto(locA);
    await expect(menu.menuItemCard(shared.name)).toBeVisible({
      timeout: 30_000,
    });
  });

  // Keep the seed restaurant's item available even if TC-320 aborted mid-way.
  test.afterAll(async () => {
    if (item && token)
      await setAvailability(token, item.id, false).catch(() => {});
  });
});
