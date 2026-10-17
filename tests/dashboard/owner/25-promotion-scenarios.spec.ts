/**
 * 25-promotion-scenarios.spec.ts — real-world promotions, end to end, the way
 * owners build them and customers use them (approved brief 2026-10-16, after
 * an owner's combo "Wings + Fries + one of these gyros" lost its choices on QA
 * and no test had taken an owner-built complex promotion from the dashboard
 * UI to a storefront cart).
 *
 * Every scenario, in one test:
 *   1. build it in the dashboard UI (Create promotion → card → editors →
 *      rules → Save and turn on), without helpers that confirm steps an owner
 *      might skip (S1 builds its choices through "+ Add an option" and never presses Done);
 *   2. read it back from the server — lines, option ids, category ids,
 *      prices, rules — exactly;
 *   3. edit one meaningful thing in the dashboard, save, read back again;
 *   4. on template-lima AND template-wind (seed restaurant, or the chain's
 *      member location for S8): open the deal from the menu's deals list,
 *      make every choice (paid sizes / extras, choose-from lines,
 *      any-from-category lines), Keep shopping, open the cart → checkout,
 *      and check the page against the server quote: deal price, upgrades
 *      (Items + Upgrades = Subtotal), "You're saving", Total = the latest
 *      /quote amountToCharge. No card payment;
 *   5. delete the promotion in `finally`, giving the deal slot back at once.
 *
 * Own data: one per-run "Automation Menu Scenarios <id>" category (plus a
 * per-run pizza category for S4) with AUTO-named items on the seed
 * restaurant, deleted in afterAll; globalTeardown's AUTO / "Automation Menu"
 * sweeps backstop an interrupted run. Scenarios run in order, one at a time
 * (fullyParallel is false; NOT serial mode, so a failing scenario does not
 * skip the rest), and the file holds at most ONE ACTIVE deal at a time, only
 * while a scenario runs (TEST_PLAN.md → "Seed-restaurant deal budget"). S8
 * publishes the chain's location A for its lima step through
 * utils/publishBackstop (restored in finally, else by globalTeardown / the
 * next globalSetup). Tagged @scenario (nightly lane, not @smoke).
 *
 * "You're saving" is asserted strictly from the customer's picks on both
 * storefronts (the cheapest-choice bug was fixed by template-wind #125).
 */

import * as allure from "allure-js-commons";
import type { Page } from "@playwright/test";
import { test, expect } from "../../../fixtures/base";
import { createOwnerPromotionsPage } from "../../../pages/dashboard/owner/OwnerPromotionsPage";
import { createOwnerCreatePromotionPage } from "../../../pages/dashboard/owner/OwnerCreatePromotionPage";
import { createLimaDealPage } from "../../../pages/lima/LimaDealPage";
import { createLimaCheckoutPage } from "../../../pages/lima/LimaCheckoutPage";
import { createLimaStorefrontPage } from "../../../pages/lima/LimaStorefrontPage";
import { createCustomerDealPage } from "../../../pages/customer/CustomerDealPage";
import { createCustomerMenuPage } from "../../../pages/customer/CustomerMenuPage";
import { createCustomerCheckoutPage } from "../../../pages/customer/CustomerCheckoutPage";
import { createCustomerItemModal } from "../../../pages/customer/CustomerItemModal";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  deleteMenuGroupRaw,
  deleteMenuItemRaw,
  apiRequestRaw,
  getActiveDealsPublic,
  getDealApi,
  getRestaurantTimeZonePublic,
  permanentlyDeleteMenuItemRaw,
  setAvailability,
  waitForFreeDealSlot,
  DEAL_SLOT_TEST_TIMEOUT_MS,
  type ApiDeal,
  type CreateMenuItemOpts,
} from "../../../utils/apiHelper";
import {
  deletePromotionRaw,
  listChainPromotions,
  listPromotions,
  type PromotionListRow,
} from "../../../utils/promotionsApi";
import {
  expectShownMatchesLatestQuote,
  isQuoteResponse,
  readQuote,
  trackQuotes,
  type PageQuote,
  type QuoteTracker,
} from "../../../utils/quoteTracker";
import { publishTemporarily } from "../../../utils/publishBackstop";
import {
  generateCouponCode,
  generateRunId,
  readRestaurantSlug,
  readSharedState,
} from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/**
 * A scenario waits for a deal slot (up to CAP_WAIT_MS), then drives three
 * apps (dashboard build + edit, lima, wind): the slot budget plus room for
 * the two storefront journeys.
 */
const SCENARIO_TEST_TIMEOUT_MS = DEAL_SLOT_TEST_TIMEOUT_MS + 240_000;

const money = (n: number) => `$${n.toFixed(2)}`;
const cents = (n: number) => Math.round(n * 100);

interface Item {
  id: string;
  name: string;
  price: number;
}

/** A deal line as the tests compare it (sortOrder order). */
interface Line {
  role: string | null;
  quantity: number;
  menuItemId: string | null;
  menuGroupId: string | null;
  options: string[];
}

const fixed = (item: Item, role = "INCLUDED"): Line => ({
  role,
  quantity: 1,
  menuItemId: item.id,
  menuGroupId: null,
  options: [],
});
const choose = (items: Item[], role = "INCLUDED"): Line => ({
  role,
  quantity: 1,
  menuItemId: null,
  menuGroupId: null,
  options: items.map((i) => i.id).sort(),
});

const anyFrom = (categoryId: string, role = "INCLUDED"): Line => ({
  role,
  quantity: 1,
  menuItemId: null,
  menuGroupId: categoryId,
  options: [],
});

/** The deal's lines, normalised for an exact comparison. */
const linesOf = (deal: ApiDeal): Line[] =>
  [...(deal.items ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((l) => ({
      role: l.role ?? null,
      quantity: l.quantity,
      menuItemId: l.menuItemId ?? null,
      menuGroupId: l.menuItemId ? null : (l.menuGroupId ?? null),
      options: (l.options ?? []).map((o) => o.menuItemId).sort(),
    }));

/** What the customer's checkout must show for the deal (from known inputs). */
interface ExpectedDealCheckout {
  dealId: string;
  /** The server's deal price for these picks. */
  dealPrice: number;
  /** Paid sizes / extras on the deal's items. */
  upcharge: number;
  /** Regular BASE price of the picked items (the "You're saving" base). */
  regular: number;
  /** Itemised upgrade text the summary must list, e.g. "10 pc +$3.00". */
  upgradeDetails?: string[];
}

test.describe("Owner — promotion scenarios (dashboard → lima + wind)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );
  // In order, one at a time (fullyParallel is false), but NOT serial mode: a
  // scenario that finds a bug must not skip the scenarios after it.
  test.describe.configure({ mode: "default" });

  const runId = generateRunId();
  const slug = readRestaurantSlug();
  let token = "";
  let restaurantId = "";
  let groupId = "";
  const createdItems: Item[] = [];
  const createdGroups: string[] = [];

  const promoName = (label: string) => `AUTO Scn ${label} ${runId}`;

  const makeGroup = async (label: string): Promise<string> => {
    const id = (
      await createMenuGroupNamed(token, `Automation Menu ${label} ${runId}`, {
        restaurantId,
      })
    ).id;
    createdGroups.push(id);
    return id;
  };
  const makeItem = async (
    inGroup: string,
    label: string,
    price: number,
    opts: CreateMenuItemOpts = {}
  ): Promise<Item> => {
    const name = `AUTO Scn ${label} ${runId}`;
    const created = await createMenuItemFull(token, inGroup, name, price, {
      description: "Automation promotion scenario item",
      ...opts,
    });
    const item = { id: created.id, name, price };
    createdItems.push(item);
    return item;
  };

  // The scenario menu (prices are the inputs every expectation derives from).
  let wings: Item; // $10; Size (REPLACES_PRICE): 8 pc $10 default, 10 pc $13
  let fries: Item; // $4
  let chickenGyro: Item; // $11
  let lambGyro: Item; // $12
  let beefGyro: Item; // $13
  let riceBowl: Item; // $11.99
  let patty: Item; // $4.99
  let knots: Item; // $3.99
  let pizzaGroupId = "";
  let pizzaGroupName = "";
  let margherita: Item; // $14; Toppings (ADJUSTS_PRICE): cheese +1.50, mushrooms +1
  let pepperoni: Item; // $16; same toppings
  let baklava: Item; // $5 — S6's free item
  let sub: Item; // $9
  let cola: Item; // $2
  let lemonade: Item; // $3 — S7 marks it out of stock
  let icedTea: Item; // $2.50
  const CHEESE = `Extra cheese ${runId}`;
  const MUSHROOMS = `Mushrooms ${runId}`;
  const WINGS_8 = `8 pc ${runId}`;
  const WINGS_10 = `10 pc ${runId}`;

  /** The server's promotion row for `name`, or undefined. */
  const serverRow = async (
    name: string
  ): Promise<PromotionListRow | undefined> =>
    (await listPromotions(token, restaurantId)).find((r) => r.name === name);

  /**
   * Deletes every promotion titled `name` (coupon or deal). Never throws, so
   * one failed cleanup in a `finally` can't skip the next; a refused delete is
   * logged and left for globalTeardown's AUTO sweep.
   */
  const cleanup = async (name: string) => {
    try {
      const t = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
      const rows = (await listPromotions(t, restaurantId)).filter(
        (r) => r.name === name
      );
      for (const r of rows) {
        const res = await deletePromotionRaw(t, r);
        if (!res.ok) {
          console.warn(
            `[25-promotion-scenarios] cleanup: deleting ${r.source} ${r.id} (${name}) → ${res.status} ${JSON.stringify(res.data)}`
          );
        }
      }
    } catch (err) {
      console.warn(
        `[25-promotion-scenarios] cleanup of "${name}" failed:`,
        err
      );
    }
  };

  /** Same as cleanup, for a promotion owned by a chain group. */
  const cleanupChain = async (chainGroupId: string, name: string) => {
    try {
      const t = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
      const rows = (await listChainPromotions(t, chainGroupId)).filter(
        (r) => r.name === name
      );
      for (const r of rows) {
        const res = await deletePromotionRaw(t, r);
        if (!res.ok) {
          console.warn(
            `[25-promotion-scenarios] chain cleanup: deleting ${r.source} ${r.id} (${name}) → ${res.status} ${JSON.stringify(res.data)}`
          );
        }
      }
    } catch (err) {
      console.warn(
        `[25-promotion-scenarios] chain cleanup of "${name}" failed:`,
        err
      );
    }
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    ({ restaurantId } = readSharedState());
    ({ accessToken: token } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD));
    groupId = await makeGroup("Scenarios");
    wings = await makeItem(groupId, "Wings", 10, {
      modifierGroups: [
        {
          name: "Size",
          pricingMode: "REPLACES_PRICE",
          minSelections: 1,
          maxSelections: 1,
          modifiers: [
            { name: WINGS_8, price: 10, isDefault: true },
            { name: WINGS_10, price: 13 },
          ],
        },
      ],
    });
    fries = await makeItem(groupId, "Fries", 4);
    chickenGyro = await makeItem(groupId, "Chicken Gyro", 11);
    lambGyro = await makeItem(groupId, "Lamb Gyro", 12);
    beefGyro = await makeItem(groupId, "Beef Gyro", 13);
    riceBowl = await makeItem(groupId, "Rice Bowl", 11.99);
    patty = await makeItem(groupId, "Beef Patty", 4.99);
    knots = await makeItem(groupId, "Garlic Knots", 3.99);
    pizzaGroupName = `Automation Menu Scenario Pizzas ${runId}`;
    pizzaGroupId = await makeGroup("Scenario Pizzas");
    const toppings: CreateMenuItemOpts = {
      modifierGroups: [
        {
          name: "Toppings",
          pricingMode: "ADJUSTS_PRICE",
          minSelections: 0,
          maxSelections: null,
          modifiers: [
            { name: CHEESE, price: 1.5 },
            { name: MUSHROOMS, price: 1 },
          ],
        },
      ],
    };
    margherita = await makeItem(pizzaGroupId, "Margherita", 14, toppings);
    pepperoni = await makeItem(pizzaGroupId, "Pepperoni", 16, toppings);
    baklava = await makeItem(groupId, "Baklava", 5);
    sub = await makeItem(groupId, "Sub", 9);
    cola = await makeItem(groupId, "Cola", 2);
    lemonade = await makeItem(groupId, "Lemonade", 3);
    icedTea = await makeItem(groupId, "Iced Tea", 2.5);
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    const failures: string[] = [];
    for (const item of createdItems) {
      const res = await deleteMenuItemRaw(t, item.id);
      if (!res.ok && res.status !== 404)
        failures.push(`item ${item.name} → ${res.status}`);
    }
    for (const id of createdGroups) {
      const res = await deleteMenuGroupRaw(t, id);
      if (!res.ok && res.status !== 404)
        failures.push(`category ${id} → ${res.status}`);
    }
    expect(failures, "scenario menu cleanup").toEqual([]);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
    // Scenarios run for minutes each: start every one with a fresh token.
    if (token)
      token = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  });

  // ── Dashboard steps ──────────────────────────────────────────────────────

  /** The saved deal for `name` (fails when the server has no such row). */
  const savedDeal = async (name: string): Promise<ApiDeal> => {
    const row = await serverRow(name);
    expect(row, `listPromotions has ${name}`).toBeTruthy();
    expect(row!.source).toBe("DEAL");
    return getDealApi(token, row!.id);
  };

  /** The coupon row as the owner API stores it (fields read loosely). */
  const couponRow = async (
    couponId: string
  ): Promise<Record<string, unknown> & { id: string }> => {
    const res = await apiRequestRaw<{
      coupons?: (Record<string, unknown> & { id: string })[];
    }>("GET", `/api/coupons/restaurant/${restaurantId}`, undefined, token);
    expect(res.ok, JSON.stringify(res.data)).toBe(true);
    const row = (res.data.coupons ?? []).find((c) => c.id === couponId);
    expect(row, `coupon ${couponId} is listed`).toBeTruthy();
    return row!;
  };

  /** Promotions list → the row's Edit → the edit page. */
  const openEdit = async (ownerPage: Page, name: string) => {
    const list = createOwnerPromotionsPage(ownerPage);
    const edit = createOwnerCreatePromotionPage(ownerPage);
    await list.goto(restaurantId);
    await list.openRowAction(name, "Edit");
    await edit.expectEditing();
    return edit;
  };

  /** Save changes went through: back on the list, no "Nothing to save". */
  const saveEdit = async (ownerPage: Page) => {
    const edit = createOwnerCreatePromotionPage(ownerPage);
    await edit.save();
    await expect(
      ownerPage.getByText("Nothing to save", { exact: false })
    ).toHaveCount(0);
    await edit.expectSaved();
  };

  // ── Storefront steps ─────────────────────────────────────────────────────

  /** A /quote whose request carries this deal. */
  const quoteWithDeal =
    (dealId: string) => (r: Parameters<typeof isQuoteResponse>[0]) =>
      isQuoteResponse(r) &&
      (
        (r.request().postDataJSON() as PageQuote["request"]).orderDeals ?? []
      ).some((d) => d.dealId === dealId);

  /**
   * Lima: menu → "Today's Deals" → View Deal → the builder. `location`: `at`
   * is a chain's slug, and the customer first picks this location.
   */
  const limaOpenDeal = async (
    page: Page,
    dealName: string,
    at = slug,
    location?: string
  ) => {
    const lima = createLimaStorefrontPage(page);
    const deals = createLimaDealPage(page);
    await lima.gotoMenu(at);
    if (location) await lima.pickLocation(location);
    await lima.assertOnMenu();
    await expect(deals.dealCard(dealName)).toBeVisible({ timeout: 30_000 });
    await deals.viewDeal(dealName);
    await expect(deals.builderHeading(dealName)).toBeVisible({
      timeout: 20_000,
    });
    return deals;
  };

  /** Wind: menu → "Today's Deals" → View Deal → the builder. */
  const windOpenDeal = async (
    page: Page,
    dealName: string,
    at = restaurantId
  ) => {
    const menu = createCustomerMenuPage(page);
    const deals = createCustomerDealPage(page);
    await menu.goto(at);
    await menu.assertPageLoaded();
    await expect(deals.dealCard(dealName)).toBeVisible({ timeout: 30_000 });
    await deals.viewDeal(dealName);
    await expect(deals.builderHeading(dealName)).toBeVisible({
      timeout: 20_000,
    });
    return deals;
  };

  /**
   * The checkout's money against the server: the deal line's price and
   * upcharge in the page's /quote, the Items / Upgrades / Subtotal build-up
   * (or a plain Subtotal when nothing was upgraded), "You're saving", and the
   * Total = the latest quote's amountToCharge.
   */
  const expectCheckoutMoney = async (
    app: "lima" | "wind",
    page: Page,
    quotes: QuoteTracker,
    quote: PageQuote,
    want: ExpectedDealCheckout
  ) => {
    const line = quote.body.quote?.deals?.find((d) => d.dealId === want.dealId);
    expect(line, JSON.stringify(quote.body)).toBeTruthy();
    await allure.parameter(
      `${app} quote deal line`,
      `price ${line?.dealPrice} upcharge ${line?.upcharge}`
    );
    expect(line!.dealPrice, "the server's deal price").toBe(want.dealPrice);
    expect(cents(line!.upcharge), "the deal's upcharge").toBe(
      cents(want.upcharge)
    );
    expect(
      (quote.body.issues ?? []).filter((i) => i.severity === "ERROR"),
      JSON.stringify(quote.body.issues)
    ).toEqual([]);

    const lima = createLimaCheckoutPage(page);
    const wind = createCustomerCheckoutPage(page);
    const windDeals = createCustomerDealPage(page);
    const subtotalRow =
      app === "lima" ? lima.subtotalRow() : wind.subtotalRow();
    const readMoney = async (row: ReturnType<Page["locator"]>) =>
      app === "lima" ? lima.readMoney(row) : wind.readMoney(row);

    await expect(subtotalRow).toBeVisible({ timeout: 20_000 });
    if (want.upcharge > 0) {
      const itemsRow =
        app === "lima" ? lima.summaryItemsRow() : wind.summaryItemsRow();
      const upgradesRow =
        app === "lima" ? lima.summaryUpgradesRow() : wind.summaryUpgradesRow();
      await expect(itemsRow).toBeVisible({ timeout: 15_000 });
      const items = await readMoney(itemsRow);
      const upgrades = await readMoney(upgradesRow);
      const subtotal = await readMoney(subtotalRow);
      await allure.parameter(
        `${app} items / upgrades / subtotal`,
        `${items} / ${upgrades} / ${subtotal}`
      );
      expect(cents(items + upgrades), "Items + Upgrades = Subtotal").toBe(
        cents(subtotal)
      );
      expect(cents(upgrades)).toBe(cents(want.upcharge));
      expect(cents(subtotal)).toBe(cents(quote.body.quote!.subtotal));
      await expect(upgradesRow).toContainText(`+${money(want.upcharge)}`);
      const details =
        app === "lima"
          ? lima.summaryUpgradeDetails()
          : wind.summaryUpgradeDetails();
      for (const d of want.upgradeDetails ?? [])
        await expect(details).toContainText(d);
    } else {
      const upgradesRow =
        app === "lima" ? lima.summaryUpgradesRow() : wind.summaryUpgradesRow();
      await expect(upgradesRow).toHaveCount(0);
      expect(cents(await readMoney(subtotalRow))).toBe(
        cents(quote.body.quote!.subtotal)
      );
    }

    const savingRow =
      app === "lima" ? lima.youAreSavingRow() : windDeals.youAreSavingRow();
    // From the customer's actual picks — never the deal's stored "from"
    // regular (each pick line at its cheapest choice); template-wind #125.
    const saving = Math.max(0, cents(want.regular) - cents(want.dealPrice));
    // A row the page should show is waited for, never read as absent early.
    let shownSaving = 0;
    if (saving > 0) {
      await expect(savingRow).toBeVisible({ timeout: 15_000 });
      shownSaving = cents(await readMoney(savingRow));
    } else {
      await expect(savingRow).toHaveCount(0);
    }
    await allure.parameter(`${app} you're saving`, money(shownSaving / 100));
    expect(shownSaving, `${app} "You're saving"`).toBe(saving);

    const total = await expectShownMatchesLatestQuote(
      app === "lima" ? lima.readTotal : wind.readOrderTotal,
      quotes
    );
    await allure.parameter(`${app} total`, money(total));
    const latest = await quotes.latest();
    expect(
      (latest.request.orderDeals ?? []).map((d) => d.dealId),
      "the latest quote is for this cart"
    ).toContain(want.dealId);
  };

  /**
   * Lima, deal complete: Keep shopping → menu ("<deal> added to your cart")
   * → cart → checkout, and the checkout's money against the server.
   */
  const limaKeepShoppingToCheckout = async (
    page: Page,
    quotes: QuoteTracker,
    dealName: string,
    want: ExpectedDealCheckout,
    at = slug
  ) => {
    const lima = createLimaStorefrontPage(page);
    const deals = createLimaDealPage(page);
    const checkout = createLimaCheckoutPage(page);
    await deals.assertDealComplete();
    await deals.addDealToCart();
    await deals.keepShoppingButton().click();
    await expect(page).toHaveURL(new RegExp(`/${at}/menu`), {
      timeout: 15_000,
    });
    await lima.cartButton().click();
    await expect(page).toHaveURL(new RegExp(`/${at}/cart`), {
      timeout: 15_000,
    });
    await expect(page.getByText(dealName).first()).toBeVisible({
      timeout: 15_000,
    });
    const [res] = await Promise.all([
      page.waitForResponse(quoteWithDeal(want.dealId), { timeout: 30_000 }),
      checkout.goToCheckout(),
    ]);
    await expectCheckoutMoney("lima", page, quotes, await readQuote(res), want);
  };

  /**
   * Wind, deal complete: Keep shopping → menu ("<deal> added to your cart")
   * → the cart button (→ /checkout), and the checkout's money against the
   * server.
   */
  const windKeepShoppingToCheckout = async (
    page: Page,
    quotes: QuoteTracker,
    dealName: string,
    want: ExpectedDealCheckout
  ) => {
    const menu = createCustomerMenuPage(page);
    const deals = createCustomerDealPage(page);
    await deals.assertDealComplete();
    await deals.addDealToCart();
    await deals.keepShoppingButton().click();
    await expect(page).toHaveURL(/\/menu/, { timeout: 15_000 });
    await expect(menu.dealAddedConfirmation()).toHaveText(
      `${dealName} added to your cart`,
      { timeout: 10_000 }
    );
    const [res] = await Promise.all([
      page.waitForResponse(quoteWithDeal(want.dealId), { timeout: 30_000 }),
      menu.openCart(),
    ]);
    await menu.proceedToCheckout();
    await expect(deals.dealSummaryRow(dealName)).toBeVisible({
      timeout: 15_000,
    });
    await expectCheckoutMoney("wind", page, quotes, await readQuote(res), want);
  };

  // ── Scenarios ────────────────────────────────────────────────────────────

  test("TC-863: @scenario S1 Wings + Fries + one of three gyros — choices added to the line (Done never pressed); customer picks 10 pc + Lamb: the size is an upgrade, the combo price stays fixed", async ({
    ownerPage,
    page,
  }) => {
    test.setTimeout(SCENARIO_TEST_TIMEOUT_MS);
    await allure.description(
      "The owner-reported combo. Build: Combo price → Wings, Fries, then Chicken Gyro with '+ Add an option' adding Lamb and Beef Gyro as options (each applies at once; Done is never pressed), $21.99, Save and turn on. Read back: three lines, the third with exactly the three gyro options. Edit: price → $22.49. Lima: Wings 10 pc (+$3 over the 8 pc default) and Lamb (pricier than the cheapest gyro) → deal $22.49, upgrades $3.00. Wind: the customer leaves the default 8 pc and picks Lamb → deal $22.49, upcharge $0, no upgrades line. Both: You're saving = $26 regular − $22.49. Expected to FAIL at the build on a dashboard without RestauNax #974 (the choices are dropped, so the form prices Wings + Fries alone at $14 and refuses $21.99); not fixme'd — it goes green with that fix."
    );
    const name = promoName("Wings combo");
    const group = "What's in the combo?";
    const gyros = [chickenGyro, lambGyro, beefGyro];
    const create = createOwnerCreatePromotionPage(ownerPage);
    const quotes = trackQuotes(page);
    try {
      await allure.step(
        "build it in the dashboard (choices only, no Done)",
        async () => {
          await create.goto(restaurantId);
          await create.pickCard("Combo price");
          await create.pickItems(group, [wings.name, fries.name]);
          // The first gyro is a line; "+ Add an option" adds the others as
          // options. Done is never pressed.
          await create.pickItems(
            group,
            gyros.map((g) => g.name),
            { choice: true }
          );
          await create.setAmount("Combo price", "21.99");
          await create.setName(name);
          await create.turnOnDealWhenSlotFree(() =>
            waitForFreeDealSlot(token, restaurantId)
          );
          // Without RestauNax #974 the choices are dropped: the form then prices
          // Wings + Fries alone ($14) and refuses $21.99 as not below regular.
          await expect(
            create.fixErrorsAlert(),
            "the form counted the chosen gyros (no marked answers)"
          ).toBeHidden();
          await create.expectSaved();
        }
      );

      const dealId = await allure.step(
        "read back: Wings, Fries, one of the three gyros, $21.99",
        async () => {
          const deal = await savedDeal(name);
          expect(deal.status).toBe("ACTIVE");
          expect(deal.dealType).toBe("COMBO");
          expect(deal.dealPrice).toBe(21.99);
          expect(linesOf(deal), JSON.stringify(deal.items)).toEqual([
            fixed(wings),
            fixed(fries),
            choose(gyros),
          ]);
          return deal.id;
        }
      );

      await allure.step("edit: price → $22.49", async () => {
        const edit = await openEdit(ownerPage, name);
        await expect(edit.amountField("Combo price")).toHaveValue("21.99");
        await edit.setAmount("Combo price", "22.49");
        await saveEdit(ownerPage);
        const deal = await getDealApi(token, dealId);
        expect(deal.dealPrice).toBe(22.49);
        expect(linesOf(deal)).toEqual([
          fixed(wings),
          fixed(fries),
          choose(gyros),
        ]);
      });

      const want: ExpectedDealCheckout = {
        dealId,
        dealPrice: 22.49,
        upcharge: 3,
        regular: wings.price + fries.price + lambGyro.price,
        upgradeDetails: [`${WINGS_10} +$3.00`],
      };

      await allure.step(
        "lima: 10 pc wings, fries, Lamb → checkout",
        async () => {
          const deals = await limaOpenDeal(page, name);
          const lima = createLimaStorefrontPage(page);
          await expect(deals.choiceSlots()).toHaveCount(1);
          await expect(
            deals.choiceSlots().first().getByRole("radiogroup")
          ).toHaveAccessibleName(
            `Pick 1: ${gyros
              .map((g) => g.name)
              .slice(0, 2)
              .join(", ")} or ${gyros[2]!.name}`
          );
          for (const g of gyros)
            await expect(deals.choiceCard(0, g.name)).toBeVisible();
          await deals.pickChoice(0, lambGyro.name);
          await deals.openIncompleteSlot(wings.name);
          await lima.modifierOption(WINGS_10).check();
          await deals.clickAddToDeal();
          await deals.openIncompleteSlot(fries.name);
          await deals.clickAddToDeal();
          await limaKeepShoppingToCheckout(page, quotes, name, want);
        }
      );

      await allure.step(
        "wind: default 8 pc wings (size untouched), fries, Lamb → checkout",
        async () => {
          const deals = await windOpenDeal(page, name);
          const modal = createCustomerItemModal(page);
          await expect(deals.choiceSlots()).toHaveCount(1);
          await expect(
            deals.choiceSlots().first().getByRole("radiogroup")
          ).toHaveAccessibleName(
            `Pick 1: ${gyros
              .map((g) => g.name)
              .slice(0, 2)
              .join(", ")} or ${gyros[2]!.name}`
          );
          for (const g of gyros)
            await expect(deals.choiceCard(0, g.name)).toBeVisible();
          await deals.pickChoice(0, lambGyro.name);
          await deals.openIncompleteSlot(wings.name);
          // The un-helped default: the customer never touches the size.
          await modal.assertOptionChecked(WINGS_8);
          await deals.clickAddToDeal();
          await deals.openIncompleteSlot(fries.name);
          await deals.clickAddToDeal();
          await windKeepShoppingToCheckout(page, quotes, name, {
            ...want,
            upcharge: 0,
            upgradeDetails: [],
          });
        }
      );
    } finally {
      await cleanup(name);
    }
  });

  test("TC-865: @scenario S3 Rice bowl + gyro + patty for $21.99 (fixed items); Change swaps the patty for garlic knots", async ({
    ownerPage,
    page,
  }) => {
    test.setTimeout(SCENARIO_TEST_TIMEOUT_MS);
    await allure.description(
      "Build: Combo price → Rice Bowl, Chicken Gyro, Beef Patty (one item each), $21.99, Save and turn on. Read back: the three fixed lines and the price. Edit: 'Change Beef Patty' → Garlic Knots (same position). Lima + wind: build the three items → deal $21.99, no upgrades (plain Subtotal), You're saving = $26.98 regular − $21.99."
    );
    const name = promoName("Bowl combo");
    const group = "What's in the combo?";
    const create = createOwnerCreatePromotionPage(ownerPage);
    const quotes = trackQuotes(page);
    try {
      await allure.step("build it in the dashboard", async () => {
        await create.goto(restaurantId);
        await create.pickCard("Combo price");
        await create.pickItems(group, [
          riceBowl.name,
          chickenGyro.name,
          patty.name,
        ]);
        await create.setAmount("Combo price", "21.99");
        await create.setName(name);
        await create.turnOnDealWhenSlotFree(() =>
          waitForFreeDealSlot(token, restaurantId)
        );
        await create.expectSaved();
      });

      const dealId = await allure.step("read back", async () => {
        const deal = await savedDeal(name);
        expect(deal.status).toBe("ACTIVE");
        expect(deal.dealType).toBe("COMBO");
        expect(deal.dealPrice).toBe(21.99);
        expect(linesOf(deal), JSON.stringify(deal.items)).toEqual([
          fixed(riceBowl),
          fixed(chickenGyro),
          fixed(patty),
        ]);
        return deal.id;
      });

      await allure.step("edit: Change the patty → garlic knots", async () => {
        const edit = await openEdit(ownerPage, name);
        await edit.changeLine(group, patty.name);
        await edit.pickReplacement(group, knots.name);
        await expect
          .poll(() => edit.lineNames(group))
          .toEqual([riceBowl.name, chickenGyro.name, knots.name]);
        await saveEdit(ownerPage);
        const deal = await getDealApi(token, dealId);
        expect(deal.dealPrice).toBe(21.99);
        expect(linesOf(deal), JSON.stringify(deal.items)).toEqual([
          fixed(riceBowl),
          fixed(chickenGyro),
          fixed(knots),
        ]);
      });

      const want: ExpectedDealCheckout = {
        dealId,
        dealPrice: 21.99,
        upcharge: 0,
        regular: riceBowl.price + chickenGyro.price + knots.price,
      };
      const items = [riceBowl, chickenGyro, knots];

      await allure.step("lima: the three items → checkout", async () => {
        const deals = await limaOpenDeal(page, name);
        // Three fixed items without options: nothing to choose, each is
        // "✓ Included" and the page reads "All set" from the start.
        for (const it of items)
          await expect(
            deals.fixedSteps(it.name).getByTestId("deal-step-status")
          ).toHaveText("✓ Included", { timeout: 15_000 });
        await deals.assertDealComplete();
        await limaKeepShoppingToCheckout(page, quotes, name, want);
      });

      await allure.step("wind: the three items → checkout", async () => {
        const deals = await windOpenDeal(page, name);
        // Three fixed items without options: nothing to choose, each is
        // "✓ Included" and the page reads "All set" from the start.
        for (const it of items)
          await expect(
            deals.fixedSteps(it.name).getByTestId("deal-step-status")
          ).toHaveText("✓ Included", { timeout: 15_000 });
        await deals.assertDealComplete();
        await windKeepShoppingToCheckout(page, quotes, name, want);
      });
    } finally {
      await cleanup(name);
    }
  });

  test("TC-864: @scenario S2 Second gyro for $1.99 (BOGO_FIXED_PRICE) — choose-from on both They buy and They get; the cheaper pick gets the set price", async ({
    ownerPage,
    page,
  }) => {
    test.setTimeout(SCENARIO_TEST_TIMEOUT_MS);
    await allure.description(
      "Build: Buy one, get one → They buy: Chicken Gyro with '+ Add an option' adding Lamb and Beef Gyro, They get: the same three the same way, For a set price, They pay $1.99, Save and turn on. Read back: BOGO_FIXED_PRICE, getPrice 1.99, a BUY and a GET line with exactly the three options each. Edit: They pay → $2.49. Lima + wind: buy Beef ($13), get Chicken ($11) → the cheaper one costs $2.49: deal $15.49 (builder bar and quote), no upgrades, You're saving = $24 − $15.49."
    );
    const name = promoName("2nd gyro");
    const gyros = [chickenGyro, lambGyro, beefGyro];
    const create = createOwnerCreatePromotionPage(ownerPage);
    const quotes = trackQuotes(page);
    try {
      await allure.step("build it in the dashboard", async () => {
        await create.goto(restaurantId);
        await create.pickCard("Buy one, get one");
        const names = gyros.map((g) => g.name);
        await create.pickItems("They buy", names, { choice: true });
        await create.pickItems("They get", names, { choice: true });
        await create.chooseOption("For a set price");
        await create.setAmount("They pay", "1.99");
        await create.setName(name);
        await create.turnOnDealWhenSlotFree(() =>
          waitForFreeDealSlot(token, restaurantId)
        );
        await create.expectSaved();
      });

      const dealId = await allure.step("read back", async () => {
        const deal = await savedDeal(name);
        expect(deal.status).toBe("ACTIVE");
        expect(deal.dealType).toBe("BOGO_FIXED_PRICE");
        expect(deal.getPrice).toBe(1.99);
        expect(linesOf(deal), JSON.stringify(deal.items)).toEqual([
          choose(gyros, "BUY"),
          choose(gyros, "GET"),
        ]);
        return deal.id;
      });

      await allure.step("edit: They pay → $2.49", async () => {
        const edit = await openEdit(ownerPage, name);
        await expect(edit.amountField("They pay")).toHaveValue("1.99");
        await edit.setAmount("They pay", "2.49");
        await saveEdit(ownerPage);
        const deal = await getDealApi(token, dealId);
        expect(deal.getPrice).toBe(2.49);
        expect(linesOf(deal)).toEqual([
          choose(gyros, "BUY"),
          choose(gyros, "GET"),
        ]);
      });

      // Equal-or-lesser: Beef $13 at full price, Chicken $11 at $2.49.
      const want: ExpectedDealCheckout = {
        dealId,
        dealPrice: 15.49,
        upcharge: 0,
        regular: beefGyro.price + chickenGyro.price,
      };

      await allure.step("lima: buy Beef, get Chicken → checkout", async () => {
        const deals = await limaOpenDeal(page, name);
        await expect(deals.choiceSlots()).toHaveCount(2);
        for (const slot of [0, 1])
          for (const g of gyros)
            await expect(deals.choiceCard(slot, g.name)).toBeVisible();
        await deals.pickChoice(0, beefGyro.name);
        await deals.pickChoice(1, chickenGyro.name);
        await deals.assertDealComplete();
        await expect(deals.progressDealPrice()).toHaveText(money(15.49));
        await limaKeepShoppingToCheckout(page, quotes, name, want);
      });

      await allure.step("wind: buy Beef, get Chicken → checkout", async () => {
        const deals = await windOpenDeal(page, name);
        await expect(deals.choiceSlots()).toHaveCount(2);
        for (const slot of [0, 1])
          for (const g of gyros)
            await expect(deals.choiceCard(slot, g.name)).toBeVisible();
        await deals.pickChoice(0, beefGyro.name);
        await deals.pickChoice(1, chickenGyro.name);
        await deals.assertDealComplete();
        await expect(deals.progressDealPrice()).toHaveText(money(15.49));
        await windKeepShoppingToCheckout(page, quotes, name, want);
      });
    } finally {
      await cleanup(name);
    }
  });

  test("TC-866: @scenario S4 Any 2 medium pizzas for $19.99 — two 'Any item from <category>' lines; paid toppings show as upgrades", async ({
    ownerPage,
    page,
  }) => {
    test.setTimeout(SCENARIO_TEST_TIMEOUT_MS);
    await allure.description(
      "Build: Combo price → search the per-run pizza category and pick 'Any item from' it, twice (each line reads 'Customer picks 1 from <category> · 2 items'), $19.99, Save and turn on. Read back: two category lines on that category. Edit: price → $20.99. Lima + wind: Margherita + Extra cheese (+$1.50) and Pepperoni (the pricier pizza) + Mushrooms (+$1) → deal $20.99, upgrades $2.50 itemised, Items + Upgrades = Subtotal, You're saving = $30 − $20.99."
    );
    const name = promoName("Two pizzas");
    const group = "What's in the combo?";
    const create = createOwnerCreatePromotionPage(ownerPage);
    const quotes = trackQuotes(page);
    try {
      await allure.step("build it in the dashboard", async () => {
        await create.goto(restaurantId);
        await create.pickCard("Combo price");
        await create.pickCategory(group, pizzaGroupName);
        await create.pickCategory(group, pizzaGroupName);
        // Each category line reads as a pick for the customer, with its size
        // (the per-run pizza category holds Margherita and Pepperoni).
        const titles = create.categoryLineTitles(group, pizzaGroupName);
        await expect(titles).toHaveCount(2);
        await expect(titles).toHaveText([
          `Customer picks 1 from ${pizzaGroupName} · 2 items`,
          `Customer picks 1 from ${pizzaGroupName} · 2 items`,
        ]);
        await create.setAmount("Combo price", "19.99");
        await create.setName(name);
        await create.turnOnDealWhenSlotFree(() =>
          waitForFreeDealSlot(token, restaurantId)
        );
        await create.expectSaved();
      });

      const dealId = await allure.step("read back", async () => {
        const deal = await savedDeal(name);
        expect(deal.status).toBe("ACTIVE");
        expect(deal.dealType).toBe("COMBO");
        expect(deal.dealPrice).toBe(19.99);
        expect(linesOf(deal), JSON.stringify(deal.items)).toEqual([
          anyFrom(pizzaGroupId),
          anyFrom(pizzaGroupId),
        ]);
        return deal.id;
      });

      await allure.step("edit: price → $20.99", async () => {
        const edit = await openEdit(ownerPage, name);
        await expect(edit.amountField("Combo price")).toHaveValue("19.99");
        await edit.setAmount("Combo price", "20.99");
        await saveEdit(ownerPage);
        const deal = await getDealApi(token, dealId);
        expect(deal.dealPrice).toBe(20.99);
        expect(linesOf(deal)).toEqual([
          anyFrom(pizzaGroupId),
          anyFrom(pizzaGroupId),
        ]);
      });

      const want: ExpectedDealCheckout = {
        dealId,
        dealPrice: 20.99,
        upcharge: 2.5,
        regular: margherita.price + pepperoni.price,
        upgradeDetails: [`${CHEESE} +$1.50`, `${MUSHROOMS} +$1.00`],
      };

      await allure.step(
        "lima: Margherita + cheese, Pepperoni + mushrooms → checkout",
        async () => {
          const deals = await limaOpenDeal(page, name);
          const lima = createLimaStorefrontPage(page);
          await expect(deals.choiceSlots()).toHaveCount(2);
          await deals.pickChoice(0, margherita.name, () =>
            lima.modifierOption(CHEESE).check()
          );
          await deals.pickChoice(1, pepperoni.name, () =>
            lima.modifierOption(MUSHROOMS).check()
          );
          await limaKeepShoppingToCheckout(page, quotes, name, want);
        }
      );

      await allure.step(
        "wind: Margherita + cheese, Pepperoni + mushrooms → checkout",
        async () => {
          const deals = await windOpenDeal(page, name);
          const modal = createCustomerItemModal(page);
          await expect(deals.choiceSlots()).toHaveCount(2);
          await deals.pickChoice(0, margherita.name, () =>
            modal.selectOption(CHEESE)
          );
          await deals.pickChoice(1, pepperoni.name, () =>
            modal.selectOption(MUSHROOMS)
          );
          await windKeepShoppingToCheckout(page, quotes, name, want);
        }
      );
    } finally {
      await cleanup(name);
    }
  });

  test("TC-868: @scenario S6 Free baklava on orders of $25+ — only with a code: the code applies, the free-item offer shows, Add makes the line free", async ({
    ownerPage,
    page,
  }) => {
    test.setTimeout(SCENARIO_TEST_TIMEOUT_MS);
    await allure.description(
      "Code-only on purpose: an automatic spend offer would offer its gift to every other file's cart (TEST_PLAN.md → seed-restaurant budget). Build: Free item → Which item is free? Baklava ($5), When they spend, Order total of at least $25, Only with a code, AUTO code, Save and turn on. Read back (coupon row): FREE_ITEM, gift = Baklava, SPEND trigger, $25 minimum, CODE with that code. Edit: minimum → $30. Lima + wind: three Chicken Gyros ($33, over $30 and under the wind file's $55 automatic offer) → enter the code → the quote's freeItemOffer shows 'You've earned a free Baklava — Add it' → Add → the quote prices the gift and discounts it in full (savings $5), the promotion line reads -$5.00 and Total = the latest quote."
    );
    const name = promoName("Free baklava");
    const code = generateCouponCode();
    const create = createOwnerCreatePromotionPage(ownerPage);
    const quotes = trackQuotes(page);
    try {
      await allure.step("build it in the dashboard", async () => {
        await create.goto(restaurantId);
        await create.pickCard("Free item");
        await create.pickItems("Which item is free?", [baklava.name]);
        await create.chooseOption("When they spend");
        await create.setAmount("Order total of at least", "25");
        await create.setHowCustomersGetIt("Only with a code");
        await create.setName(name);
        await create.setCode(code);
        await create.turnOn();
        await create.expectSaved();
      });

      const coupon = await allure.step("read back", async () => {
        const row = await serverRow(name);
        expect(row, `listPromotions has ${name}`).toBeTruthy();
        expect(row!.source).toBe("COUPON");
        const c = await couponRow(row!.id);
        expect(c, JSON.stringify(c)).toMatchObject({
          type: "FREE_ITEM",
          code,
          applyMode: "CODE",
          giftMenuItemId: baklava.id,
          triggerKind: "SPEND",
          minOrderAmount: 25,
          status: "ACTIVE",
        });
        return c;
      });

      await allure.step("edit: minimum → $30", async () => {
        const edit = await openEdit(ownerPage, name);
        await expect(edit.amountField("Order total of at least")).toHaveValue(
          /^25(\.00)?$/
        );
        await edit.setAmount("Order total of at least", "30");
        await saveEdit(ownerPage);
        expect(await couponRow(coupon.id)).toMatchObject({
          type: "FREE_ITEM",
          code,
          giftMenuItemId: baklava.id,
          triggerKind: "SPEND",
          minOrderAmount: 30,
        });
      });

      /** The quote after Add carries the gift line, priced free. */
      const quoteWithGift = (r: Parameters<typeof isQuoteResponse>[0]) =>
        isQuoteResponse(r) &&
        (
          (r.request().postDataJSON() as PageQuote["request"]).orderItems ?? []
        ).some((i) => i.menuItemId === baklava.id);
      const expectGiftQuote = (quote: PageQuote) => {
        expect(quote.request.couponId).toBe(coupon.id);
        expect(quote.body.quote?.appliedPromotion).toMatchObject({
          couponId: coupon.id,
          title: name,
          savings: baklava.price,
        });
        expect(quote.body.quote?.freeItemOffer ?? null).toBeNull();
      };
      const offerText = `You've earned a free ${baklava.name} — Add it`;

      await allure.step(
        "lima: three gyros → code on the cart → checkout → Add the free baklava",
        async () => {
          const lima = createLimaStorefrontPage(page);
          const checkout = createLimaCheckoutPage(page);
          await lima.gotoMenu(slug);
          await lima.assertOnMenu();
          for (let i = 0; i < 3; i++) {
            await expect(lima.itemCard(chickenGyro.name)).toBeVisible({
              timeout: 30_000,
            });
            await lima.itemCard(chickenGyro.name).click();
            await expect(lima.addToCartButton()).toBeEnabled({
              timeout: 20_000,
            });
            await lima.clickAddToCart();
            await expect(lima.addToCartButton()).toBeHidden({
              timeout: 15_000,
            });
          }
          await lima.cartButton().click();
          await expect(page).toHaveURL(new RegExp(`/${slug}/cart`), {
            timeout: 15_000,
          });
          const [redeem] = await Promise.all([
            page.waitForResponse(
              (r) =>
                r.url().includes("/api/promotions/redeem-code") &&
                r.request().method() === "POST",
              { timeout: 20_000 }
            ),
            checkout.applyCoupon(code),
          ]);
          expect(redeem.status(), await redeem.text()).toBe(200);
          await expect(checkout.appliedCodeChip(code)).toBeVisible({
            timeout: 15_000,
          });
          const [codeRes] = await Promise.all([
            page.waitForResponse(
              (r) =>
                isQuoteResponse(r) &&
                (r.request().postDataJSON() as PageQuote["request"])
                  .couponId === coupon.id,
              { timeout: 30_000 }
            ),
            checkout.goToCheckout(),
          ]);
          const codeQuote = await readQuote(codeRes);
          expect(codeQuote.body.quote?.freeItemOffer).toMatchObject({
            menuItemId: baklava.id,
          });
          await expect(checkout.freeItemOfferButton()).toHaveText(offerText, {
            timeout: 20_000,
          });
          const [giftRes] = await Promise.all([
            page.waitForResponse(quoteWithGift, { timeout: 30_000 }),
            checkout.freeItemOfferButton().click(),
          ]);
          expectGiftQuote(await readQuote(giftRes));
          await expect(checkout.freeItemOfferButton()).toHaveCount(0);
          await expect(checkout.promotionLine(name)).toContainText(
            `-${money(baklava.price)}`,
            { timeout: 20_000 }
          );
          await expectShownMatchesLatestQuote(checkout.readTotal, quotes);
        }
      );

      await allure.step(
        "wind: three gyros → checkout → code → Add the free baklava",
        async () => {
          const menu = createCustomerMenuPage(page);
          const checkout = createCustomerCheckoutPage(page);
          await menu.goto(restaurantId);
          await menu.assertPageLoaded();
          await expect(menu.itemCard(chickenGyro.name)).toBeVisible({
            timeout: 30_000,
          });
          for (let i = 0; i < 3; i++) {
            await menu.openItemModal(chickenGyro.name);
            await menu.assertItemModalOpen();
            await menu.clickAddToCart();
            await expect(menu.addToCartButton()).toBeHidden({
              timeout: 15_000,
            });
          }
          await menu.openCart();
          await menu.proceedToCheckout();
          const [codeRes] = await Promise.all([
            page.waitForResponse(
              (r) =>
                isQuoteResponse(r) &&
                (r.request().postDataJSON() as PageQuote["request"])
                  .couponId === coupon.id,
              { timeout: 30_000 }
            ),
            checkout.applyCoupon(code),
          ]);
          expect(
            (await readQuote(codeRes)).body.quote?.freeItemOffer
          ).toMatchObject({ menuItemId: baklava.id });
          await expect(checkout.freeItemOfferButton()).toHaveText(offerText, {
            timeout: 20_000,
          });
          const [giftRes] = await Promise.all([
            page.waitForResponse(quoteWithGift, { timeout: 30_000 }),
            checkout.freeItemOfferButton().click(),
          ]);
          expectGiftQuote(await readQuote(giftRes));
          await expect(
            page.getByRole("heading", { name: `1x ${baklava.name}` })
          ).toBeVisible({ timeout: 15_000 });
          await expect(checkout.freeItemOfferButton()).toHaveCount(0);
          await expect(checkout.promotionLine(name)).toContainText(
            `-${money(baklava.price)}`
          );
          await expectShownMatchesLatestQuote(checkout.readOrderTotal, quotes);
        }
      );
    } finally {
      await cleanup(name);
    }
  });

  test("TC-869: @scenario S7 Sub + a drink, one drink out of stock — the storefront won't let the customer pick it; the others work", async ({
    ownerPage,
    page,
  }) => {
    test.setTimeout(SCENARIO_TEST_TIMEOUT_MS);
    await allure.description(
      "Build: Combo price → Sub + Cola with '+ Add an option' adding Lemonade and Iced Tea, $9.99, Save and turn on. Read back: the two lines with exactly the three drinks. Then Lemonade goes out of stock on the menu (PATCH availability, as the owner's menu toggle does). Edit: price → $10.49 (the deal still saves; the stored line keeps all three). The public v2 deal list then offers only Cola and Iced Tea, and lima + wind show only those two (both pickable, no Lemonade card). Sub + Iced Tea → deal $10.49, no upgrades, You're saving = $11.50 − $10.49."
    );
    const name = promoName("Sub combo");
    const group = "What's in the combo?";
    const drinks = [cola, lemonade, icedTea];
    const create = createOwnerCreatePromotionPage(ownerPage);
    const quotes = trackQuotes(page);
    try {
      await allure.step("build it in the dashboard", async () => {
        await create.goto(restaurantId);
        await create.pickCard("Combo price");
        await create.pickItems(group, [sub.name]);
        await create.pickItems(
          group,
          drinks.map((d) => d.name),
          { choice: true }
        );
        await create.setAmount("Combo price", "9.99");
        await create.setName(name);
        await create.turnOnDealWhenSlotFree(() =>
          waitForFreeDealSlot(token, restaurantId)
        );
        await create.expectSaved();
      });

      const dealId = await allure.step("read back", async () => {
        const deal = await savedDeal(name);
        expect(deal.status).toBe("ACTIVE");
        expect(deal.dealPrice).toBe(9.99);
        expect(linesOf(deal), JSON.stringify(deal.items)).toEqual([
          fixed(sub),
          choose(drinks),
        ]);
        return deal.id;
      });

      await allure.step("Lemonade goes out of stock", () =>
        setAvailability(token, lemonade.id, true)
      );

      await allure.step("edit: price → $10.49", async () => {
        const edit = await openEdit(ownerPage, name);
        await edit.setAmount("Combo price", "10.49");
        await saveEdit(ownerPage);
        const deal = await getDealApi(token, dealId);
        expect(deal.dealPrice).toBe(10.49);
        expect(deal.status).toBe("ACTIVE");
        expect(linesOf(deal)).toEqual([fixed(sub), choose(drinks)]);
      });

      await allure.step(
        "the public deal list stops offering Lemonade",
        async () => {
          const res = await getActiveDealsPublic(restaurantId, { v2: true });
          expect(res.ok, JSON.stringify(res.data)).toBe(true);
          const deal = res.data.deals?.find((d) => d.id === dealId);
          expect(deal, `v2 /active lists ${name}`).toBeTruthy();
          expect(linesOf(deal!), JSON.stringify(deal!.items)).toEqual([
            fixed(sub),
            choose([cola, icedTea]),
          ]);
        }
      );

      const want: ExpectedDealCheckout = {
        dealId,
        dealPrice: 10.49,
        upcharge: 0,
        regular: sub.price + icedTea.price,
      };

      await allure.step(
        "lima: Lemonade can't be picked; Sub + Iced Tea → checkout",
        async () => {
          const deals = await limaOpenDeal(page, name);
          await expect(deals.choiceSlots()).toHaveCount(1);
          for (const d of [cola, icedTea])
            await expect(deals.choiceCard(0, d.name)).toHaveAttribute(
              "aria-disabled",
              "false",
              { timeout: 15_000 }
            );
          await expect(deals.choiceCard(0, lemonade.name)).toHaveCount(0);
          await deals.pickChoice(0, icedTea.name);
          await deals.completeFixedSteps();
          await limaKeepShoppingToCheckout(page, quotes, name, want);
        }
      );

      await allure.step(
        "wind: Lemonade can't be picked; Sub + Iced Tea → checkout",
        async () => {
          const deals = await windOpenDeal(page, name);
          await expect(deals.choiceSlots()).toHaveCount(1);
          for (const d of [cola, icedTea]) {
            await expect(deals.choiceCard(0, d.name)).toBeVisible();
            // Wind's option radios carry an explicit aria-disabled.
            await expect(deals.choiceCard(0, d.name)).toHaveAttribute(
              "aria-disabled",
              "false",
              { timeout: 15_000 }
            );
          }
          await expect(deals.choiceCard(0, lemonade.name)).toHaveCount(0);
          await deals.pickChoice(0, icedTea.name);
          await deals.completeFixedSteps();
          await windKeepShoppingToCheckout(page, quotes, name, want);
        }
      );
    } finally {
      await cleanup(name);
    }
  });

  test("TC-867: @scenario S5 Day-of-week combo — valid only on another day it is not offered (lima, wind, public list); moved to today it is orderable", async ({
    ownerPage,
    page,
  }) => {
    test.setTimeout(SCENARIO_TEST_TIMEOUT_MS);
    await allure.description(
      "Hour-independent (the nightly runs around 02:00 New York and on weekends): days, not times. Build: Combo price → Rice Bowl + Fries, $13.99, When? → only TOMORROW's weekday (restaurant zone, all day), Save and turn on. Read back: that one day, no time window. Not today → the public v2 list does not offer it (server contract: absent, not 'listed unavailable'); lima and wind receive that list (the page's own /active response, the positive control) and show no card for it, and opening its builder directly says 'Deal not found'. Edit: the day becomes TODAY only → the v2 list offers it with availableNow true, both storefronts list it, build it and price it at $13.99 (You're saving $15.99 − $13.99). Skipped within 2 minutes of midnight in the restaurant zone, where 'today' would change mid-test."
    );
    const name = promoName("Today combo");
    const group = "What's in the combo?";
    const create = createOwnerCreatePromotionPage(ownerPage);
    const quotes = trackQuotes(page);

    const tz = await getRestaurantTimeZonePublic(restaurantId);
    expect(tz, "the backend reports the restaurant's zone").toBeTruthy();
    const zoned = (at: Date) =>
      Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          weekday: "long",
          hour: "numeric",
          minute: "numeric",
          hourCycle: "h23",
        })
          .formatToParts(at)
          .map((p) => [p.type, p.value])
      );
    const now = zoned(new Date());
    // The only time-of-day guard: "today" must not change while the test runs.
    test.skip(
      Number(now.hour) === 23 && Number(now.minute) >= 58,
      "within 2 minutes of midnight in the restaurant zone"
    );
    const today = String(now.weekday).toUpperCase();
    const DAYS = [
      "SUNDAY",
      "MONDAY",
      "TUESDAY",
      "WEDNESDAY",
      "THURSDAY",
      "FRIDAY",
      "SATURDAY",
    ];
    const otherDay = DAYS[(DAYS.indexOf(today) + 1) % 7]!;
    await allure.parameter(
      "restaurant day",
      `${today} ${now.hour}:${now.minute} ${tz}; first ${otherDay}, then ${today}`
    );

    /** The page's own public deal list for the restaurant. */
    const activeDeals = (r: Parameters<typeof isQuoteResponse>[0]) =>
      r.request().method() === "GET" &&
      new URL(r.url()).pathname ===
        `/api/deals/restaurant/${restaurantId}/active` &&
      r.status() === 200;
    const listedIn = async (
      res: Awaited<ReturnType<Page["waitForResponse"]>>
    ) =>
      (((await res.json()) as { deals?: { id: string }[] }).deals ?? []).map(
        (d) => d.id
      );

    try {
      await allure.step(
        `build it in the dashboard (${otherDay} only)`,
        async () => {
          await create.goto(restaurantId);
          await create.pickCard("Combo price");
          await create.pickItems(group, [riceBowl.name, fries.name]);
          await create.setAmount("Combo price", "13.99");
          await create.openRule("When?");
          await create.dayChip(otherDay).click();
          for (const d of DAYS)
            await expect(create.dayChip(d)).toHaveAttribute(
              "aria-pressed",
              d === otherDay ? "true" : "false"
            );
          await create.setName(name);
          await create.turnOnDealWhenSlotFree(() =>
            waitForFreeDealSlot(token, restaurantId)
          );
          await create.expectSaved();
        }
      );

      const dealId = await allure.step("read back", async () => {
        const deal = await savedDeal(name);
        expect(deal.status).toBe("ACTIVE");
        expect(deal.dealPrice).toBe(13.99);
        expect(linesOf(deal)).toEqual([fixed(riceBowl), fixed(fries)]);
        expect(deal.validDays).toEqual([otherDay]);
        expect(deal.validTimeStart ?? null).toBeNull();
        expect(deal.validTimeEnd ?? null).toBeNull();
        return deal.id;
      });

      await allure.step(
        `not today: not offered on the public list, lima or wind`,
        async () => {
          const res = await getActiveDealsPublic(restaurantId, { v2: true });
          expect(res.ok, JSON.stringify(res.data)).toBe(true);
          expect(
            (res.data.deals ?? []).map((d) => d.id),
            "a deal valid on another day only is not listed"
          ).not.toContain(dealId);

          const lima = createLimaStorefrontPage(page);
          const limaDeals = createLimaDealPage(page);
          const [limaList] = await Promise.all([
            page.waitForResponse(activeDeals, { timeout: 30_000 }),
            lima.gotoMenu(slug),
          ]);
          expect(await listedIn(limaList)).not.toContain(dealId);
          // Positive control: the menu rendered after the list arrived.
          await expect(lima.itemCard(riceBowl.name)).toBeVisible({
            timeout: 30_000,
          });
          await expect(limaDeals.dealCard(name)).toHaveCount(0);
          await limaDeals.gotoBuilder(slug, dealId);
          await expect(page.getByText("Deal not found")).toBeVisible({
            timeout: 20_000,
          });

          const windMenu = createCustomerMenuPage(page);
          const windDeals = createCustomerDealPage(page);
          const [windList] = await Promise.all([
            page.waitForResponse(activeDeals, { timeout: 30_000 }),
            windMenu.goto(restaurantId),
          ]);
          expect(await listedIn(windList)).not.toContain(dealId);
          await expect(windMenu.itemCard(riceBowl.name)).toBeVisible({
            timeout: 30_000,
          });
          await expect(windDeals.dealCard(name)).toHaveCount(0);
          await windDeals.gotoBuilder(restaurantId, dealId);
          await expect(windDeals.dealNotFound()).toBeVisible({
            timeout: 20_000,
          });
        }
      );

      await allure.step(`edit: ${today} only`, async () => {
        const edit = await openEdit(ownerPage, name);
        await edit.openRule("When?");
        await edit.dayChip(otherDay).click();
        await edit.dayChip(today).click();
        await expect(edit.dayChip(today)).toHaveAttribute(
          "aria-pressed",
          "true"
        );
        await expect(edit.dayChip(otherDay)).toHaveAttribute(
          "aria-pressed",
          "false"
        );
        await saveEdit(ownerPage);
        const deal = await getDealApi(token, dealId);
        expect(deal.validDays).toEqual([today]);
        const res = await getActiveDealsPublic(restaurantId, { v2: true });
        expect(res.data.deals?.find((d) => d.id === dealId)?.availableNow).toBe(
          true
        );
      });

      const want: ExpectedDealCheckout = {
        dealId,
        dealPrice: 13.99,
        upcharge: 0,
        regular: riceBowl.price + fries.price,
      };

      await allure.step("lima: offered today → checkout", async () => {
        const deals = await limaOpenDeal(page, name);
        await expect(page.getByTestId("deal-availability-label")).toHaveCount(
          0
        );
        await deals.completeFixedSteps();
        await limaKeepShoppingToCheckout(page, quotes, name, want);
      });

      await allure.step("wind: offered today → checkout", async () => {
        const deals = await windOpenDeal(page, name);
        await expect(deals.builderAvailabilityLabel()).toHaveCount(0);
        await deals.completeFixedSteps();
        await windKeepShoppingToCheckout(page, quotes, name, want);
      });
    } finally {
      await cleanup(name);
    }
  });

  test("TC-870: @scenario S8 Chain combo built in the chain shell — the fan-out confirm, then the member location's lima and wind offer and price it", async ({
    ownerPage,
    page,
  }) => {
    test.setTimeout(SCENARIO_TEST_TIMEOUT_MS);
    const state = readSharedState();
    const chainGroupId = state.chainGroupId ?? "";
    const locA = state.chainLocationAId ?? "";
    const locAName = state.chainLocationAName ?? "";
    // Lima addresses a chain by the CHAIN's slug and a location picker (a
    // member's own slug does not resolve while the member is unpublished).
    const chainSlug = state.chainSlug ?? "";
    test.skip(
      !chainGroupId || !locA || !locAName || !chainSlug,
      "Automation Chain fixture (or its ordering slug) not available"
    );
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD needed (publish location A for lima, hard-delete the chain items)"
    );
    let admin = "";
    const adminToken = () => admin;
    admin = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    await allure.description(
      "Chain menu: a per-run chain category with Wrap ($9) and Drink ($3). Build in the chain shell: Create promotion → Combo price → Wrap + Drink, $10.49 → Save and turn on asks 'Heads up — chain-wide change … This will affect all N locations' → Continue. Read back (chain list + deal): owned by the chain group, the two lines, $10.49. Edit in the chain shell: price → $10.99 (the confirm again). Location A on lima (the chain's slug → the location picker → Order here at A) and wind (?restaurantId=A) list it in Today's Deals; building it prices $10.99 at checkout, You're saving = $12 − $10.99."
    );
    await allure.parameter(
      "location A",
      `${locAName} ${locA} (lima: ${chainSlug} → pick the location)`
    );
    const name = promoName("Chain combo");
    const group = "What's in the combo?";
    const promos = createOwnerPromotionsPage(ownerPage);
    const create = createOwnerCreatePromotionPage(ownerPage);
    const quotes = trackQuotes(page);
    const chainItems: Item[] = [];
    let chainCategory = "";
    const fanOut = ownerPage
      .getByRole("dialog")
      .filter({ hasText: "Heads up — chain-wide change" });
    /** Clears "Don't ask again" for the fan-out confirm (session scoped). */
    const resetFanOutConfirm = () =>
      ownerPage.evaluate(() => {
        for (const k of Object.keys(sessionStorage))
          if (k.startsWith("restaunax:fanOutConfirm"))
            sessionStorage.removeItem(k);
      });
    try {
      chainCategory = (
        await createMenuGroupNamed(
          token,
          `Automation Menu Chain Scenarios ${runId}`,
          { groupId: chainGroupId }
        )
      ).id;
      for (const [label, price] of [
        ["Chain Wrap", 9],
        ["Chain Drink", 3],
      ] as const) {
        const itemName = `AUTO Scn ${label} ${runId}`;
        const made = await createMenuItemFull(
          token,
          chainCategory,
          itemName,
          price
        );
        chainItems.push({ id: made.id, name: itemName, price });
      }
      const [wrap, drink] = chainItems as [Item, Item];

      await allure.step(
        "build it in the chain shell (fan-out confirm)",
        async () => {
          await promos.gotoChain(chainGroupId);
          await resetFanOutConfirm();
          await promos.clickCreate();
          await create.pickCard("Combo price");
          await create.pickItems(group, [wrap.name, drink.name]);
          await create.setAmount("Combo price", "10.49");
          await create.setName(name);
          await create.turnOnButton().click();
          await expect(fanOut).toBeVisible({ timeout: 20_000 });
          await expect(fanOut).toContainText(
            /This will affect all \d+ locations in your chain\./
          );
          await create.settle();
          await create.expectSaved();
        }
      );

      const dealId = await allure.step("read back", async () => {
        const row = (await listChainPromotions(token, chainGroupId)).find(
          (r) => r.name === name
        );
        expect(row, `the chain list has ${name}`).toBeTruthy();
        const deal = await getDealApi(token, row!.id);
        expect(deal.status).toBe("ACTIVE");
        expect(deal.restaurantGroupId).toBe(chainGroupId);
        expect(deal.dealPrice).toBe(10.49);
        expect(linesOf(deal), JSON.stringify(deal.items)).toEqual([
          fixed(wrap),
          fixed(drink),
        ]);
        return deal.id;
      });

      await allure.step("edit in the chain shell: price → $10.99", async () => {
        await promos.gotoChain(chainGroupId);
        await promos.openRowAction(name, "Edit");
        await create.expectEditing();
        await create.setAmount("Combo price", "10.99");
        await saveEdit(ownerPage);
        const deal = await getDealApi(token, dealId);
        expect(deal.dealPrice).toBe(10.99);
        expect(linesOf(deal)).toEqual([fixed(wrap), fixed(drink)]);
      });

      const want: ExpectedDealCheckout = {
        dealId,
        dealPrice: 10.99,
        upcharge: 0,
        regular: wrap.price + drink.price,
      };

      await allure.step("location A on wind → checkout", async () => {
        const deals = await windOpenDeal(page, name, locA);
        await deals.completeFixedSteps();
        await windKeepShoppingToCheckout(page, quotes, name, want);
      });

      await allure.step("location A on lima → checkout", async () => {
        // The fixture's locations are unpublished, and lima's picker lists
        // published locations only: publish A for this step, restore after.
        // Leak-safe: a marker written first lets globalTeardown / the next
        // globalSetup restore it if this test dies mid-step.
        const restore = await publishTemporarily(adminToken(), locA);
        try {
          const deals = await limaOpenDeal(page, name, chainSlug, locAName);
          await deals.completeFixedSteps();
          await limaKeepShoppingToCheckout(page, quotes, name, want, chainSlug);
        } finally {
          await restore();
        }
      });
    } finally {
      await cleanupChain(chainGroupId, name);
      for (const it of chainItems) {
        // A chain item's category deletes only once the item row is gone:
        // hard delete (admin).
        const res = await permanentlyDeleteMenuItemRaw(adminToken(), it.id);
        if (!res.ok && res.status !== 404)
          console.warn(
            `[25-promotion-scenarios] chain item ${it.name} delete → ${res.status}`
          );
      }
      if (chainCategory) {
        const res = await deleteMenuGroupRaw(token, chainCategory);
        if (!res.ok && res.status !== 404)
          console.warn(
            `[25-promotion-scenarios] chain category ${chainCategory} delete → ${res.status} (globalTeardown's "Automation Menu" sweep backstops it)`
          );
      }
    }
  });
});
