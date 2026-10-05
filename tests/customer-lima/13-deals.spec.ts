import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaCheckoutPage } from "../../pages/lima/LimaCheckoutPage";
import { createLimaDealPage } from "../../pages/lima/LimaDealPage";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import {
  generateRunId,
  generateSeedPhone,
  generateUserEmail,
  readRestaurantSlug,
  readSharedState,
} from "../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  createDealApiCapSafe,
  deleteDealApi,
  getDealApi,
  getActiveDealsPublic,
  getRestaurantTimeZonePublic,
  getBusinessHoursRaw,
  type ApiDeal,
  type ApiMenuItem,
} from "../../utils/apiHelper";
import { requireScheduling } from "../../utils/dealScheduleGate";
import {
  laterTodayWindow,
  localDateKey,
  mentionsClock,
  openSpanOn,
} from "../../utils/dealSchedule";

/**
 * Ordering parity — deals on the embedded Lima storefront.
 *
 * First deal coverage for template-lima (wind's lives in tests/customer). Own
 * data on the seed restaurant (the slug's tenant): a per-run "Automation Lima
 * Deals <id>" category with two items and an AUTO deal, cap-safe (the seed
 * restaurant shares the 10-active cap with the dashboard + wind deal files),
 * deleted in afterAll. Serial: the build/checkout tests reuse one deal.
 */
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Lima — deals", () => {
  const restaurantSlug = readRestaurantSlug();
  test.skip(
    !restaurantSlug || !OWNER_EMAIL || !OWNER_PASSWORD,
    "Ordering slug not seeded, or OWNER creds missing"
  );
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  let restaurantId = "";
  let token = "";
  let adminToken = "";
  let groupId = "";
  let wrap: ApiMenuItem; // 9.00
  let soup: ApiMenuItem; // 5.00
  let deal: ApiDeal; // wrap + soup @ 11 (orig 14)
  const dealIds: string[] = [];

  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  test.beforeAll(async () => {
    if (!restaurantSlug || !OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readSharedState().restaurantId;
    token = await freshToken();
    if (ADMIN_EMAIL && ADMIN_PASSWORD)
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    groupId = (
      await createMenuGroupNamed(token, `Automation Lima Deals ${runId}`, {
        restaurantId,
      })
    ).id;
    wrap = await createMenuItemFull(token, groupId, `Lima Wrap ${runId}`, 9, {
      description: "lima deal wrap",
    });
    soup = await createMenuItemFull(token, groupId, `Lima Soup ${runId}`, 5, {
      description: "lima deal soup",
    });
    deal = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Lima Combo ${runId}`,
      11,
      [
        { id: wrap.id, name: wrap.name, price: 9 },
        { id: soup.id, name: soup.name, price: 5 },
      ]
    );
    dealIds.push(deal.id);
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshToken().catch(() => token);
    // Best-effort — globalTeardown's AUTO sweep backstops a leftover deal.
    for (const id of dealIds) await deleteDealApi(t, id).catch(() => {});
    if (adminToken)
      for (const it of [wrap, soup].filter(Boolean))
        // Best-effort — the empty category is deleted next; a leftover item is inert.
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
    // Best-effort — leftover per-run category is harmless and named with the run id.
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering — Deals");
    await allure.label("severity", "critical");
  });

  /** Menu → View Deal → fill both slots → Deal Complete. */
  const buildDeal = async (page: Parameters<typeof createLimaDealPage>[0]) => {
    const lima = createLimaStorefrontPage(page);
    const deals = createLimaDealPage(page);
    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    await expect(deals.dealCard(deal.name)).toBeVisible({ timeout: 30_000 });
    await deals.viewDeal(deal.name);
    await expect(page).toHaveURL(
      new RegExp(`/${restaurantSlug}/deal/${deal.id}`)
    );
    await expect(deals.builderHeading(deal.name)).toBeVisible({
      timeout: 20_000,
    });
    await deals.assertProgress(0, 2);
    await deals.openIncompleteSlot(wrap.name);
    await deals.clickAddToDeal();
    await deals.assertProgress(1, 2);
    await deals.openIncompleteSlot(soup.name);
    await deals.clickAddToDeal();
    await deals.assertDealComplete();
    return { lima, deals };
  };

  test("TC-L60: Today's Deals on the Lima menu shows the owner's deal — name, Includes chips, struck original and deal price", async ({
    page,
  }) => {
    const lima = createLimaStorefrontPage(page);
    const deals = createLimaDealPage(page);
    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    await expect(deals.todaysDealsHeading()).toBeVisible({ timeout: 30_000 });
    const card = deals.dealCard(deal.name);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("Includes:");
    await expect(card).toContainText(`1x ${wrap.name}`);
    await expect(card).toContainText(`1x ${soup.name}`);
    await expect(card).toContainText("$14.00");
    await expect(card).toContainText("$11.00");
  });

  test("TC-L61: the Lima deal builder fills each slot through 'Add to Deal' and 'View Cart' lands on the tenant's cart with the deal", async ({
    page,
  }) => {
    const { deals } = await buildDeal(page);
    await deals.viewCartButton().click();
    await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/cart`), {
      timeout: 15_000,
    });
    await expect(page.getByText(deal.name).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("TC-L62: Lima checkout quotes the deal — the page's /quote carries orderDeals (deal id + both items, with dealItemId once Plan 4 ships) and prices it at the deal price", async ({
    page,
  }) => {
    await allure.description(
      "StripeCheckoutForm POSTs the same body to /api/order/:rid/quote that it later submits. The deal line " +
        "must be orderDeals[0] {dealId, items:[wrap, soup]} and the quote's dealsSubtotal must be 11. " +
        "Deal scheduling (spec §5) adds orderDeals[].items[].dealItemId — asserted only once template-lima ships it."
    );
    const slots = (await getDealApi(await freshToken(), deal.id)).items ?? [];
    const { deals } = await buildDeal(page);
    const checkout = createLimaCheckoutPage(page);
    const quotePromise = page.waitForResponse(
      (r) =>
        /\/api\/order\/[^/]+\/quote$/.test(r.url()) &&
        r.request().method() === "POST" &&
        (
          (r.request().postDataJSON() as { orderDeals?: unknown[] } | null)
            ?.orderDeals ?? []
        ).length > 0,
      { timeout: 30_000 }
    );
    await deals.viewCartButton().click();
    await checkout.goToCheckout();
    await checkout.fillCustomerInfo({
      firstName: "Auto",
      lastName: "LimaDeal",
      email: generateUserEmail("limadeal"),
      phone: generateSeedPhone(),
    });
    const quoteRes = await quotePromise;
    const req = quoteRes.request().postDataJSON() as {
      orderDeals: {
        dealId: string;
        items: { menuItemId: string; dealItemId?: string }[];
      }[];
    };
    expect(req.orderDeals).toHaveLength(1);
    expect(req.orderDeals[0]!.dealId).toBe(deal.id);
    expect(req.orderDeals[0]!.items.map((i) => i.menuItemId).sort()).toEqual(
      [wrap.id, soup.id].sort()
    );
    const body = (await quoteRes.json()) as {
      quote?: { dealsSubtotal?: number };
    };
    expect(quoteRes.status()).toBe(200);
    expect(body.quote?.dealsSubtotal).toBe(11);

    await allure.step(
      "each deal item names its slot (dealItemId, Plan 4)",
      async () => {
        const sent = req.orderDeals[0]!.items.map((i) => i.dealItemId);
        requireScheduling(
          "lima",
          sent.every((id) => typeof id === "string")
        );
        expect(sent.sort()).toEqual(slots.map((s) => s.id).sort());
      }
    );
  });

  test("TC-L63: a deal that starts later today is listed on Lima with its schedule and 'Available from <time>'", async ({
    page,
  }) => {
    const t = await freshToken();
    const tz = await getRestaurantTimeZonePublic(restaurantId);
    requireScheduling("backend", Boolean(tz));
    const hours =
      (await getBusinessHoursRaw(t, restaurantId)).data.businessHours ?? [];
    const span = openSpanOn(hours, localDateKey(tz));
    const w = span
      ? laterTodayWindow(tz, { notBefore: span.open, notAfter: span.close })
      : null;
    test.skip(
      !w,
      "No hour-long window left in the seed restaurant's business hours today"
    );
    const later = await createDealApiCapSafe(
      t,
      restaurantId,
      `AUTO Lima Later ${runId}`,
      11,
      [
        { id: wrap.id, name: wrap.name, price: 9 },
        { id: soup.id, name: soup.name, price: 5 },
      ],
      { validTimeStart: w!.start, validTimeEnd: w!.end }
    );
    dealIds.push(later.id);
    const listed = (await getActiveDealsPublic(restaurantId)).data.deals?.find(
      (d) => d.id === later.id
    );
    expect(listed?.availableNow).toBe(false);
    const lima = createLimaStorefrontPage(page);
    const deals = createLimaDealPage(page);
    await lima.gotoMenu(restaurantSlug);
    await expect(deals.dealCard(later.name)).toBeVisible({ timeout: 30_000 });
    requireScheduling(
      "lima",
      (await deals.cardScheduleSummary(later.name).count()) > 0
    );
    // Lima sends no Accept-Language of its own: assert the times, not the words.
    const label = await deals.cardAvailabilityLabel(later.name).innerText();
    expect(mentionsClock(label, w!.start), label).toBe(true);
    const summary = await deals.cardScheduleSummary(later.name).innerText();
    expect(
      mentionsClock(summary, w!.start) && mentionsClock(summary, w!.end),
      summary
    ).toBe(true);
  });
});
