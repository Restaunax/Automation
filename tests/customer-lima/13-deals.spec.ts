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
  DEAL_SLOT_TEST_TIMEOUT_MS,
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
  test.describe.configure({
    mode: "serial",
    timeout: DEAL_SLOT_TEST_TIMEOUT_MS,
  });

  const runId = generateRunId();
  let restaurantId = "";
  let token = "";
  let adminToken = "";
  let groupId = "";
  let wrap: ApiMenuItem; // 9.00
  let soup: ApiMenuItem; // 5.00
  let deal: ApiDeal; // wrap + soup @ 11 (orig 14)
  const dealIds: string[] = [];
  // TC-893's own items (created in the test, cleaned up in afterAll).
  const unitItems: ApiMenuItem[] = [];

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
      for (const it of [wrap, soup, ...unitItems].filter(Boolean))
        // Best-effort — the empty category is deleted next; a leftover item is inert.
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
    // Best-effort — leftover per-run category is harmless and named with the run id.
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering — Deals");
    await allure.label("severity", "critical");
  });

  /** Menu → View Deal → (fixed items included) → one Add. */
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
    // Two fixed items: included from the start; only items that need options
    // ask for them. One Add puts the whole deal in the cart.
    await deals.completeFixedSteps();
    await deals.assertDealComplete();
    await deals.addDealToCart();
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

  test("TC-L61: the Lima deal builder adds the whole deal with one Add and 'View Cart' lands on the tenant's cart with the deal", async ({
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

  test("TC-893: Lima — a combo with 2 of the same item that has options is ONE '2 × <item>' step with a Customize row per unit — customising Burger 2 leaves Burger 1 on its defaults, an Add with Burger 2's required options missing is refused, and the quote carries one line per unit", async ({
    page,
  }) => {
    await allure.description(
      "Spec §13 on template-lima. Combo @ $30 = 2 × Lima Units Burger ($10, optional 'Bacon' +$1.50) + 2 × " +
        "Lima Units Melt ($8, REQUIRED 'Sauce': Ranch $0 / Chipotle +$0.75); the backend stores four " +
        "quantity-1 rows. The builder shows two steps: '2 × <burger>' ✓ Included and '2 × <melt>' Required, " +
        "each with two unit rows (deal-step-unit: '<item> 1', '<item> 2', 'Included', own button 'Customize " +
        "<item> n' / 'Choose options for <item> n'). Customising Burger 2 with Bacon: row 2 shows 'Bacon' + " +
        "'+$1.50', row 1 stays 'Included' with no options. Melt 1 → Ranch, then Add → refused: alert 'Choose " +
        "options for <melt> 2', focus on that unit's button, nothing added. Melt 2 → Chipotle → bar $32.25 → " +
        "one Add. The checkout /quote carries one orderDeals item per DealItem row (each its own dealItemId) " +
        "with upchargeAmount 0 / 1.50 (burgers) and 0 / 0.75 (melts); the server answers upcharge 2.25, " +
        "lineTotal 32.25; the summary shows Items $30.00, Upgrades +$2.25 (Bacon, Chipotle) and Subtotal = " +
        "the quote's."
    );
    const t = await freshToken();
    const lima = createLimaStorefrontPage(page);
    const deals = createLimaDealPage(page);
    const checkout = createLimaCheckoutPage(page);
    const unitsBurger = await createMenuItemFull(
      t,
      groupId,
      `Lima Units Burger ${runId}`,
      10,
      {
        description: "spec 13 unit rows: optional extra",
        modifierGroups: [
          {
            name: `Extras ${runId}`,
            pricingMode: "ADJUSTS_PRICE",
            minSelections: 0,
            maxSelections: null,
            modifiers: [{ name: `Bacon ${runId}`, price: 1.5 }],
          },
        ],
      }
    );
    unitItems.push(unitsBurger);
    const unitsMelt = await createMenuItemFull(
      t,
      groupId,
      `Lima Units Melt ${runId}`,
      8,
      {
        description: "spec 13 unit rows: required option",
        modifierGroups: [
          {
            name: `Sauce ${runId}`,
            pricingMode: "ADJUSTS_PRICE",
            minSelections: 1,
            maxSelections: 1,
            modifiers: [
              { name: `Ranch ${runId}`, price: 0 },
              { name: `Chipotle ${runId}`, price: 0.75 },
            ],
          },
        ],
      }
    );
    unitItems.push(unitsMelt);
    const unitsDeal = await createDealApiCapSafe(
      t,
      restaurantId,
      `AUTO Lima Units ${runId}`,
      30,
      [
        { id: unitsBurger.id, name: unitsBurger.name, price: 10, quantity: 2 },
        { id: unitsMelt.id, name: unitsMelt.name, price: 8, quantity: 2 },
      ]
    );
    dealIds.push(unitsDeal.id);
    try {
      const burgerStep = `2 × ${unitsBurger.name}`;
      const meltStep = `2 × ${unitsMelt.name}`;
      const rows = (await getDealApi(t, unitsDeal.id)).items ?? [];
      // The backend splits each quantity-2 line into two quantity-1 rows.
      expect(rows, JSON.stringify(rows)).toHaveLength(4);

      await allure.step(
        "One '2 × <item>' step per item, a row per unit",
        async () => {
          await deals.gotoBuilder(restaurantSlug, unitsDeal.id);
          await expect(deals.builderHeading(unitsDeal.name)).toBeVisible({
            timeout: 20_000,
          });
          await expect(deals.unitRows(meltStep)).toHaveCount(2, {
            timeout: 20_000,
          });
          await expect(deals.allFixedSteps()).toHaveCount(2);
          await expect(deals.fixedSteps(unitsBurger.name)).toHaveCount(1);
          await expect(deals.fixedSteps(unitsMelt.name)).toHaveCount(1);
          await expect(
            deals.stepByHeading(burgerStep).getByTestId("deal-step-status")
          ).toHaveText("✓ Included");
          await expect(
            deals.stepByHeading(meltStep).getByTestId("deal-step-status")
          ).toHaveText("Required");
          // Rows replace the step-level Customize and options summary.
          for (const h of [burgerStep, meltStep]) {
            await expect(
              deals.stepByHeading(h).getByTestId("deal-step-customize")
            ).toHaveCount(0);
            await expect(
              deals.stepByHeading(h).getByTestId("deal-step-options")
            ).toHaveCount(0);
          }
          await expect(deals.unitRows(burgerStep)).toHaveCount(2);
          for (const n of [1, 2]) {
            await expect(deals.unitLabel(burgerStep, n)).toHaveText(
              `${unitsBurger.name} ${n}`
            );
            await expect(deals.unitPrice(burgerStep, n)).toHaveText("Included");
            await expect(deals.unitOptions(burgerStep, n)).toHaveCount(0);
            await expect(deals.unitCustomizeButton(burgerStep, n)).toHaveText(
              "Customize"
            );
            await expect(
              deals.unitCustomizeButton(burgerStep, n)
            ).toHaveAccessibleName(`Customize ${unitsBurger.name} ${n}`);
            await expect(deals.unitLabel(meltStep, n)).toHaveText(
              `${unitsMelt.name} ${n}`
            );
            await expect(deals.unitCustomizeButton(meltStep, n)).toHaveText(
              "Choose options"
            );
            await expect(
              deals.unitCustomizeButton(meltStep, n)
            ).toHaveAccessibleName(`Choose options for ${unitsMelt.name} ${n}`);
          }
          // Each row is its own unit: four distinct unit keys.
          const keys = await page
            .getByTestId("deal-step-unit")
            .evaluateAll((els) =>
              els.map((e) => e.getAttribute("data-unit-key"))
            );
          expect(new Set(keys).size, JSON.stringify(keys)).toBe(4);
          // Only the melt step asks for something.
          await deals.assertProgress(0, 1);
          await expect(deals.progressDealPrice()).toHaveText("$30.00");
        }
      );

      await allure.step(
        "Customise Burger 2 only → Burger 1 keeps its defaults",
        async () => {
          await deals.customizeUnit(burgerStep, 2, async () => {
            await lima.modifierOption(`Bacon ${runId}`).check();
            await expect(lima.modifierOption(`Bacon ${runId}`)).toBeChecked();
          });
          await expect(deals.unitOptions(burgerStep, 2)).toHaveText(
            `Bacon ${runId}`
          );
          await expect(deals.unitPrice(burgerStep, 2)).toHaveText("+$1.50");
          await expect(deals.unitPrice(burgerStep, 1)).toHaveText("Included");
          await expect(deals.unitOptions(burgerStep, 1)).toHaveCount(0);
          await expect(deals.progressDealPrice()).toHaveText("$31.50");
          // Burger 1 reopens on its defaults: no Bacon carried over.
          await deals.customizeUnit(burgerStep, 1);
          await expect(lima.modifierOption(`Bacon ${runId}`)).not.toBeChecked();
          await deals.clickAddToDeal();
          await expect(deals.unitOptions(burgerStep, 1)).toHaveCount(0);
          await expect(deals.unitOptions(burgerStep, 2)).toHaveText(
            `Bacon ${runId}`
          );
        }
      );

      await allure.step(
        "Melt 1 answered, Melt 2 not → the Add is refused and names Melt 2",
        async () => {
          await deals.customizeUnit(meltStep, 1, async () => {
            await lima.modifierOption(`Ranch ${runId}`).check();
            await expect(lima.modifierOption(`Ranch ${runId}`)).toBeChecked();
          });
          await expect(deals.unitOptions(meltStep, 1)).toHaveText(
            `Ranch ${runId}`
          );
          await expect(deals.unitPrice(meltStep, 1)).toHaveText("Included");
          await expect(deals.unitCustomizeButton(meltStep, 1)).toHaveText(
            "Customize"
          );
          await expect(
            deals.stepByHeading(meltStep).getByTestId("deal-step-status")
          ).toHaveText("Required");
          await deals.assertProgress(0, 1);
          await deals.addDealToCartButton().click();
          await expect(deals.stepAlert(meltStep)).toHaveText(
            `Choose options for ${unitsMelt.name} 2`
          );
          await expect(deals.unitCustomizeButton(meltStep, 2)).toBeFocused();
          await expect(deals.keepShoppingButton()).toHaveCount(0);
          await expect(deals.stepAlert(burgerStep)).toHaveCount(0);
        }
      );

      await allure.step("Melt 2 answered → All set → one Add", async () => {
        await deals.customizeUnit(meltStep, 2, async () => {
          await lima.modifierOption(`Chipotle ${runId}`).check();
          await expect(lima.modifierOption(`Chipotle ${runId}`)).toBeChecked();
        });
        await expect(deals.stepAlert(meltStep)).toHaveCount(0);
        await expect(deals.unitOptions(meltStep, 2)).toHaveText(
          `Chipotle ${runId}`
        );
        await expect(deals.unitPrice(meltStep, 2)).toHaveText("+$0.75");
        await expect(
          deals.stepByHeading(meltStep).getByTestId("deal-step-status")
        ).toHaveText("✓ Included");
        await expect(deals.unitOptions(meltStep, 1)).toHaveText(
          `Ranch ${runId}`
        );
        await deals.assertDealComplete();
        await expect(deals.progressDealPrice()).toHaveText("$32.25");
        await expect(deals.addDealToCartButton()).toHaveText(
          "Add deal to cart · $32.25"
        );
        await deals.addDealToCart();
      });

      await allure.step(
        "Checkout: one line per unit, priced by the server",
        async () => {
          await deals.viewCartButton().click();
          await expect(page).toHaveURL(new RegExp(`/${restaurantSlug}/cart`), {
            timeout: 15_000,
          });
          const [quoteRes] = await Promise.all([
            page.waitForResponse(
              (r) =>
                /\/api\/order\/[^/]+\/quote$/.test(r.url()) &&
                r.request().method() === "POST" &&
                (
                  (
                    r.request().postDataJSON() as {
                      orderDeals?: { dealId: string }[];
                    } | null
                  )?.orderDeals ?? []
                ).some((d) => d.dealId === unitsDeal.id),
              { timeout: 30_000 }
            ),
            checkout.goToCheckout(),
          ]);
          expect(quoteRes.status()).toBe(200);
          const req = quoteRes.request().postDataJSON() as {
            orderDeals: {
              dealId: string;
              items: {
                dealItemId?: string;
                menuItemId: string;
                quantity: number;
                upchargeAmount: number;
              }[];
            }[];
          };
          const sent = req.orderDeals.find((d) => d.dealId === unitsDeal.id)!;
          // One entry per DealItem row, each naming its own row.
          expect(sent.items.map((i) => i.dealItemId).sort()).toEqual(
            rows.map((r) => r.id).sort()
          );
          const upchargesOf = (menuItemId: string) =>
            sent.items
              .filter((i) => i.menuItemId === menuItemId)
              .map((i) => {
                expect(i.quantity).toBe(1);
                return i.upchargeAmount;
              })
              .sort((a, b) => a - b);
          expect(upchargesOf(unitsBurger.id)).toEqual([0, 1.5]);
          expect(upchargesOf(unitsMelt.id)).toEqual([0, 0.75]);
          const quote = (await quoteRes.json()) as {
            quote?: {
              subtotal?: number;
              deals?: {
                dealId?: string;
                dealPrice: number;
                upcharge: number;
                lineTotal: number;
              }[];
            };
          };
          expect(quote.quote?.deals?.[0]).toMatchObject({
            dealPrice: 30,
            upcharge: 2.25,
            lineTotal: 32.25,
          });
          expect(quote.quote?.subtotal).toBe(32.25);

          await expect(checkout.summaryItemsRow()).toContainText("$30.00", {
            timeout: 15_000,
          });
          await expect(checkout.summaryUpgradesRow()).toContainText("+$2.25");
          const details = checkout.summaryUpgradeDetails();
          await expect(details).toContainText(`Bacon ${runId} +$1.50`);
          await expect(details).toContainText(`Chipotle ${runId} +$0.75`);
          await expect(checkout.summarySubtotalRow()).toContainText("$32.25");
        }
      );
    } finally {
      // Free the shared seed restaurant's cap slot right away, not in afterAll.
      await deleteDealApi(t, unitsDeal.id).catch(() => {}); // best effort; AUTO sweep backstops
    }
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
    try {
      const listed = (
        await getActiveDealsPublic(restaurantId)
      ).data.deals?.find((d) => d.id === later.id);
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
    } finally {
      // Free the shared seed restaurant's cap slot right away, not in afterAll.
      await deleteDealApi(t, later.id).catch(() => {}); // best effort; AUTO sweep backstops
    }
  });
});
