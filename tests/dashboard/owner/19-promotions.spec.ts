/**
 * 19-promotions.spec.ts — Owner → Promotions (the one section that replaced
 * the Coupon and Deal pages; spec: restaunax docs/features/PROMOTIONS.md →
 * "Dashboard as built (plan 2)").
 *
 * Old links, the six create flows, validation, edit, pause / turn on, delete
 * and Results — driven through the dashboard, with the server's view checked
 * through the API (utils/promotionsApi.ts, the public deal list and menu).
 *
 * Own data on the seed restaurant: a per-run "Automation Menu Promo <id>"
 * category with four items (two to sell, one free gift, one spare), so a live sale or
 * free item never reprices the seed item other files assert on. Every
 * promotion has an AUTO name (and an AUTO code when it takes one) and is
 * deleted in its test's `finally`; the category goes in afterAll, and
 * globalTeardown's AUTO / "Automation Menu" sweeps backstop an interrupted run.
 * Deal-type promotions (TC-824, TC-826's combo) wait for a free slot under the
 * 10-active cap first, and retry the Turn on when another worker took the slot
 * in between (turnOnDealWhenSlotFree); TC-825's example combo is saved paused
 * — see TEST_PLAN.md's footprint table.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerPromotionsPage } from "../../../pages/dashboard/owner/OwnerPromotionsPage";
import { createOwnerCreatePromotionPage } from "../../../pages/dashboard/owner/OwnerCreatePromotionPage";
import { createOwnerPromotionResultsPage } from "../../../pages/dashboard/owner/OwnerPromotionResultsPage";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  deleteMenuGroupRaw,
  deleteMenuItemRaw,
  getActiveDealsPublic,
  getDealApi,
  getMenuItemApi,
  getRestaurantCoupons,
  waitForFreeDealSlot,
  DEAL_SLOT_TEST_TIMEOUT_MS,
} from "../../../utils/apiHelper";
import {
  createCouponPromotion,
  deletePromotionRaw,
  listPromotions,
  type PromotionListRow,
} from "../../../utils/promotionsApi";
import { publicMenuItem } from "../../../utils/promotionFixtures";
import {
  generateCouponCode,
  generateRunId,
  readSharedState,
} from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

interface OwnItem {
  id: string;
  name: string;
  price: number;
}

/** Deal line read back from the public list (`items[].options[]`). */
interface DealLineWithOptions {
  options?: { menuItemId: string }[];
}

test.describe("Owner — Promotions", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  const runId = generateRunId();
  let token = "";
  let restaurantId = "";
  let groupId = "";
  let itemA: OwnItem;
  let itemB: OwnItem;
  let gift: OwnItem;
  let extra: OwnItem;
  let side: OwnItem;
  let drink: OwnItem;

  const promoName = (label: string) => `AUTO ${label} ${runId}`;

  /** The server's row for `name`, or undefined. */
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
      const rows = (await listPromotions(token, restaurantId)).filter(
        (r) => r.name === name
      );
      for (const r of rows) {
        const res = await deletePromotionRaw(token, r);
        if (!res.ok) {
          console.warn(
            `[19-promotions] cleanup: deleting ${r.source} ${r.id} (${name}) → ${res.status} ${JSON.stringify(res.data)}`
          );
        }
      }
    } catch (err) {
      console.warn(`[19-promotions] cleanup of "${name}" failed:`, err);
    }
  };

  test.beforeAll(async () => {
    ({ restaurantId } = readSharedState());
    ({ accessToken: token } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD));
    const group = await createMenuGroupNamed(
      token,
      `Automation Menu Promo ${runId}`,
      { restaurantId }
    );
    groupId = group.id;
    const make = async (label: string, price: number): Promise<OwnItem> => {
      const name = `AUTO Promo ${label} ${runId}`;
      const item = await createMenuItemFull(token, groupId, name, price);
      return { id: item.id, name, price };
    };
    itemA = await make("Wrap", 10);
    itemB = await make("Bowl", 12);
    gift = await make("Cookie", 4);
    extra = await make("Salad", 6);
    side = await make("Fries", 3);
    drink = await make("Soda", 2);
  });

  test.afterAll(async () => {
    if (!token) return;
    for (const item of [itemA, itemB, gift, extra, side, drink]) {
      if (item) await deleteMenuItemRaw(token, item.id);
    }
    if (groupId) await deleteMenuGroupRaw(token, groupId);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
  });

  test("TC-832: @smoke the Promotions list loads for the seed restaurant", async ({
    ownerPage,
  }) => {
    await allure.description(
      "?tab=promotions shows the Promotions heading and the list (or its empty state). Read-only: creates nothing."
    );
    const list = createOwnerPromotionsPage(ownerPage);
    await list.goto(restaurantId);
    await expect(list.heading()).toBeVisible();
    await expect(list.table().or(list.emptyState())).toBeVisible();
  });

  test("TC-821: old coupon and deal links land on the Promotions tabs", async ({
    ownerPage,
  }) => {
    await allure.description(
      "redirectLegacyTab: coupons/deals → promotions, create-deal → create-promotion, deal-analytics → promotion-results, ai-deals → create-promotion&ai=1."
    );
    const list = createOwnerPromotionsPage(ownerPage);
    const cases: [string, RegExp][] = [
      ["coupons", /[?&]tab=promotions(&|$)/],
      ["deals", /[?&]tab=promotions(&|$)/],
      ["create-deal", /[?&]tab=create-promotion(&|$)/],
      ["deal-analytics", /[?&]tab=promotion-results(&|$)/],
      ["ai-deals", /[?&]tab=create-promotion&ai=1(&|$)/],
    ];
    for (const [legacy, expected] of cases) {
      await allure.step(`?tab=${legacy}`, async () => {
        await list.gotoLegacyTab(restaurantId, legacy);
        await expect(ownerPage).toHaveURL(expected, { timeout: 15_000 });
      });
    }
  });

  test("TC-822: create Money off the order — 15% off $30+, up to $4.50, code only", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The preview sentence names 15% and $30; Turn on lands on the list with the row Live and its code; the server lists it ACTIVE with that code."
    );
    const name = promoName("Money off");
    const code = generateCouponCode();
    const create = createOwnerCreatePromotionPage(ownerPage);
    const list = createOwnerPromotionsPage(ownerPage);
    try {
      await allure.step("fill the form", async () => {
        await create.goto(restaurantId);
        await create.pickCard("Money off the order");
        await create.setAmount("Percentage off", "15");
        await create.setAmount("Only on orders over", "30");
        await create.setAmount("Up to", "4.50");
        await create.setHowCustomersGetIt("Only with a code");
        await create.setName(name);
        await create.setCode(code);
      });
      await create.expectPreviewText(/15% off/);
      await create.expectPreviewText(/\$30/);
      await create.turnOn();
      await create.expectSaved();

      await list.showAllRows();
      await list.expectRowStatus(name, "Live");
      await list.expectRowCode(name, code);
      const row = await serverRow(name);
      expect(row, `listPromotions has ${name}`).toBeTruthy();
      expect(row?.code).toBe(code);
      expect(row?.status).toBe("ACTIVE");
    } finally {
      await cleanup(name);
    }
  });

  test("TC-823: create Sale on items — 50% off, applies by itself, no code", async ({
    ownerPage,
  }) => {
    await allure.description(
      "An automatic sale shows no code on its row, and the public online menu carries promotion.salePrice for the item."
    );
    const name = promoName("Sale");
    const create = createOwnerCreatePromotionPage(ownerPage);
    const list = createOwnerPromotionsPage(ownerPage);
    try {
      await create.goto(restaurantId);
      await create.pickCard("Sale on items");
      await create.pickItems("Which items are on sale?", [itemA.name]);
      await create.setAmount("Percentage off", "50");
      await create.setHowCustomersGetIt("Applies by itself");
      await create.setName(name);
      await create.expectPreviewText(/50% off/);
      await create.turnOn();
      await create.expectSaved();

      await list.showAllRows();
      await list.expectRowStatus(name, "Live");
      await list.expectRowCode(name, null);
      const row = await serverRow(name);
      expect(row?.code ?? null).toBeNull();

      await expect
        .poll(
          async () =>
            (await publicMenuItem(restaurantId, itemA.id))?.promotion
              ?.salePrice ?? null,
          { message: "public menu promotion.salePrice", timeout: 20_000 }
        )
        .toBeCloseTo(itemA.price / 2, 2);
    } finally {
      await cleanup(name);
    }
  });

  test("TC-824: create Buy one, get one — 2nd for $1.99 from one of two items", async ({
    ownerPage,
  }) => {
    // A slot wait (up to CAP_WAIT_MS) runs inside this test: size its budget so
    // starvation fails with the helper's message, not a bare test timeout.
    test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS);
    await allure.description(
      "They buy = choose from two items, They get = Same item, For a set price $1.99. The row is Live and the public v2 deal list returns it with both options on its lines."
    );
    const name = promoName("BOGO");
    const create = createOwnerCreatePromotionPage(ownerPage);
    const list = createOwnerPromotionsPage(ownerPage);
    try {
      await create.goto(restaurantId);
      await create.pickCard("Buy one, get one");
      await create.pickItems("They buy", [itemA.name, itemB.name], {
        choice: true,
      });
      await create.chooseOption("Same item");
      await create.chooseOption("For a set price");
      await create.setAmount("They pay", "1.99");
      await create.setName(name);
      await create.expectPreviewText(/\$1\.99/);
      await create.turnOnDealWhenSlotFree(() =>
        waitForFreeDealSlot(token, restaurantId)
      );
      await create.expectSaved();

      await list.showAllRows();
      await list.expectRowStatus(name, "Live");
      const res = await getActiveDealsPublic(restaurantId, { v2: true });
      expect(res.ok, JSON.stringify(res.data)).toBe(true);
      const deal = res.data.deals?.find((d) => d.name === name);
      expect(deal, `v2 /active lists ${name}`).toBeTruthy();
      const lines = (deal?.items ?? []) as DealLineWithOptions[];
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(
          (line.options ?? []).map((o) => o.menuItemId).sort(),
          JSON.stringify(deal?.items)
        ).toEqual([itemA.id, itemB.id].sort());
      }
    } finally {
      await cleanup(name);
    }
  });

  test("TC-825: create Combo price from a menu example — goal chips, prefilled items and price, Save for later", async ({
    ownerPage,
  }) => {
    await allure.description(
      "No type picked: the gallery shows the six goal chips. 'Sell items together' lists a combo built from the restaurant's own menu (title = items + price, labelled From your menu); picking it selects Combo price, prefills those items and the price, and the preview shows the price. Save for later stores it paused and the server deal has the same items at that price. Saved paused on purpose: the menu-built combo may use another file's per-run items, and an ACTIVE deal would block their delete (and take one of the seed restaurant's 10 slots)."
    );
    const name = promoName("Example combo");
    const create = createOwnerCreatePromotionPage(ownerPage);
    try {
      await create.goto(restaurantId);
      await allure.step("goal chips before any type is chosen", async () => {
        for (const goal of [
          "Bigger orders",
          "Sell items together",
          "Fill slow hours",
          "New customers",
          "Bring customers back",
          "Move a specific item",
        ]) {
          await expect(
            ownerPage
              .getByRole("group", { name: "Goal", exact: true })
              .getByRole("button", { name: goal, exact: true })
          ).toBeVisible();
        }
      });

      let items: string[] = [];
      let price = "";
      await allure.step("pick the combo built from the menu", async () => {
        await create.pickGoal("Sell items together");
        const menuCard = create
          .exampleCards()
          .filter({ hasText: "From your menu" })
          .filter({ hasText: "Combo price" })
          .first();
        // The menu loads after the page; wait for the menu-built card.
        await expect(menuCard).toBeVisible({ timeout: 20_000 });
        const title =
          (await menuCard.getByRole("heading", { level: 6 }).textContent()) ??
          "";
        const m = /^(.+) for (\$[\d,]+\.\d{2})$/.exec(title);
        expect(
          m,
          `combo title "${title}" is "<items> for $<price>"`
        ).toBeTruthy();
        items = (m?.[1] ?? "").split(" + ");
        price = m?.[2] ?? "";
        expect(items.length).toBeGreaterThanOrEqual(2);
        await menuCard.click();
      });

      await allure.step("Combo is selected and prefilled", async () => {
        await expect(create.card("Combo price")).toBeChecked();
        await create.expectTypeHint("Next: pick the items in the combo");
        const group = ownerPage.getByRole("group", {
          name: "What's in the combo?",
        });
        for (const item of items) {
          await expect(
            group.getByRole("button", {
              name: `Remove ${item}`,
              exact: true,
            })
          ).toBeVisible();
        }
        await expect(create.amountField("Combo price")).toHaveValue(
          price.replace("$", "")
        );
        await create.expectPreviewText(price);
      });

      await create.setName(name);
      // Paused, not turned on: the largest categories on the seed restaurant
      // are often other files' per-run menus, and an ACTIVE deal on their
      // items makes the backend refuse those items' deletes (409). A paused
      // deal blocks nothing and takes no ACTIVE slot.
      await create.saveForLater();
      await create.expectSaved();

      await allure.step("the server deal matches the example", async () => {
        const row = await serverRow(name);
        expect(row, `listPromotions has ${name}`).toBeTruthy();
        expect(row!.status).toBe("INACTIVE");
        const deal = await getDealApi(token, row!.id);
        expect(deal.dealType).toBe("COMBO");
        expect(deal.dealPrice).toBeCloseTo(
          Number(price.replace(/[$,]/g, "")),
          2
        );
        expect((deal.items ?? []).map((i) => i.itemName).sort()).toEqual(
          [...items].sort()
        );
        // Design rule: a menu-built combo saves 5%-20% against its parts.
        let regular = 0;
        for (const line of deal.items ?? []) {
          const item = await getMenuItemApi(token, line.menuItemId ?? "");
          regular += item.price * line.quantity;
        }
        const saving = 1 - (deal.dealPrice ?? 0) / regular;
        expect(
          saving,
          `saving ${saving} on regular ${regular}`
        ).toBeGreaterThanOrEqual(0.05);
        expect(saving).toBeLessThanOrEqual(0.2);
      });
    } finally {
      await cleanup(name);
    }
  });

  test("TC-859: picking a type first narrows the examples to that type and shows its hint", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Read-only. Pick the Buy one, get one card with nothing answered: the gallery drops its goal chips, every example card is a Buy one, get one card, and the 'Next: pick what customers buy, and what they get.' hint shows."
    );
    const create = createOwnerCreatePromotionPage(ownerPage);
    await create.goto(restaurantId);
    await create.pickCard("Buy one, get one");
    await create.expectTypeHint(
      "Next: pick what customers buy, and what they get."
    );
    await expect(
      ownerPage.getByText("Ideas for Buy one, get one.", { exact: false })
    ).toBeVisible();
    await expect(
      ownerPage.getByRole("group", { name: "Goal", exact: true })
    ).toHaveCount(0);
    const cards = create.exampleCards();
    await expect(cards.first()).toBeVisible();
    await expect(cards.filter({ hasNotText: "Buy one, get one" })).toHaveCount(
      0
    );
  });

  test("TC-860: changing the type after answers asks first — Keep leaves the form, Switch clears items and keeps days", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Start from a BOGO example (items prefilled), turn Sunday on under 'When?', then click the Combo price card: 'Switch to Combo price?' with the approved body. 'Keep Buy one, get one' leaves the prefilled BOGO; 'Switch' selects Combo with no items and Sunday still on. Read-only: nothing is saved."
    );
    const create = createOwnerCreatePromotionPage(ownerPage);
    await create.goto(restaurantId);
    await create.pickCard("Buy one, get one");
    const bogo = create
      .exampleCards()
      .filter({ hasText: "From your menu" })
      .first();
    await expect(bogo).toBeVisible({ timeout: 20_000 });
    await bogo.click();
    const buy = ownerPage.getByRole("group", { name: "They buy" }).first();
    await expect(buy.getByRole("button", { name: /^Remove / })).toHaveCount(1);

    await create.openRule("When?");
    const sunday = create.dayChip("SUNDAY");
    await sunday.click();
    await expect(sunday).toHaveAttribute("aria-pressed", "true");

    await allure.step("Keep leaves the form as it was", async () => {
      await create.card("Combo price").click();
      await create.expectSwitchConfirm("Combo price", "Buy one, get one");
      await create.keepType();
      await expect(create.card("Buy one, get one")).toBeChecked();
      await expect(buy.getByRole("button", { name: /^Remove / })).toHaveCount(
        1
      );
    });

    await allure.step("Switch clears items, keeps the days", async () => {
      await create.card("Combo price").click();
      await create.expectSwitchConfirm("Combo price", "Buy one, get one");
      await create.confirmSwitch();
      await expect(create.card("Combo price")).toBeChecked();
      await expect(
        ownerPage.getByText("No items yet. Search your menu below", {
          exact: false,
        })
      ).toBeVisible();
      await expect(
        ownerPage.getByRole("button", { name: /^Remove / })
      ).toHaveCount(0);
      await expect(create.dayChip("SUNDAY")).toHaveAttribute(
        "aria-pressed",
        "true"
      );
    });
  });

  test("TC-826: create Free item (spend $40, code only), Free delivery ($15+, up to $8) and Combo price ($15, the same item twice)", async ({
    ownerPage,
  }) => {
    // A slot wait (up to CAP_WAIT_MS) runs inside this test: size its budget so
    // starvation fails with the helper's message, not a bare test timeout.
    test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS);
    await allure.description(
      "The remaining card types save and list as Live; the combo is built from its card with the same item on two lines (two wraps + a bowl) and the server deal keeps both (the from-an-example path is TC-825)."
    );
    const freeItem = promoName("Free item");
    const freeItemCode = generateCouponCode();
    const freeDelivery = promoName("Free delivery");
    const combo = promoName("Combo");
    const create = createOwnerCreatePromotionPage(ownerPage);
    const list = createOwnerPromotionsPage(ownerPage);
    try {
      await allure.step("Free item", async () => {
        await create.goto(restaurantId);
        await create.pickCard("Free item");
        await create.pickItems("Which item is free?", [gift.name]);
        await create.chooseOption("When they spend");
        await create.setAmount("Order total of at least", "40");
        // Code only, not the UI's "Applies by itself": a live automatic spend
        // offer on the seed restaurant would offer its gift to every other
        // file's cart over $40 (customer/10-promotions owns the one automatic
        // free item — TEST_PLAN.md → "Seed-restaurant deal budget").
        await create.setHowCustomersGetIt("Only with a code");
        await create.setName(freeItem);
        await create.setCode(freeItemCode);
        await create.turnOn();
        await create.expectSaved();
        await list.showAllRows();
        await list.expectRowStatus(freeItem, "Live");
        await list.expectRowCode(freeItem, freeItemCode);
        const row = await serverRow(freeItem);
        expect(row?.status).toBe("ACTIVE");
        expect(row?.code).toBe(freeItemCode);
      });
      await allure.step("Free delivery", async () => {
        await create.goto(restaurantId);
        await create.pickCard("Free delivery");
        await create.setAmount("Free delivery on orders over", "15");
        await create.setAmount("Cover up to", "8");
        await create.setName(freeDelivery);
        await create.setCode(generateCouponCode());
        await create.turnOn();
        await create.expectSaved();
        await list.showAllRows();
        await list.expectRowStatus(freeDelivery, "Live");
      });
      await allure.step("Combo price", async () => {
        await create.goto(restaurantId);
        await create.pickCard("Combo price");
        await create.pickItems("What's in the combo?", [
          itemA.name,
          itemB.name,
        ]);
        // The same item twice: two wraps + a bowl ($32 regular).
        await create.repeatLine(itemA.name);
        await create.setAmount("Combo price", "15");
        await create.setName(combo);
        await create.expectPreviewText(/\$15\.00/);
        await create.turnOnDealWhenSlotFree(() =>
          waitForFreeDealSlot(token, restaurantId)
        );
        await create.expectSaved();
        await list.showAllRows();
        await list.expectRowStatus(combo, "Live");
        const row = await serverRow(combo);
        expect(row?.status).toBe("ACTIVE");
        const deal = await getDealApi(token, row?.id ?? "");
        const units = (id: string) =>
          (deal.items ?? [])
            .filter((i) => i.menuItemId === id)
            .reduce((n, i) => n + i.quantity, 0);
        expect(units(itemA.id), JSON.stringify(deal.items)).toBe(2);
        expect(units(itemB.id), JSON.stringify(deal.items)).toBe(1);
      });
    } finally {
      await cleanup(freeItem);
      await cleanup(freeDelivery);
      await cleanup(combo);
    }
  });

  test("TC-827: validation — a $0 amount and equal start and end times are refused", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Turn on marks both answers (stricter than the API, on purpose) and nothing is saved."
    );
    const name = promoName("Invalid");
    const create = createOwnerCreatePromotionPage(ownerPage);
    try {
      await create.goto(restaurantId);
      await create.pickCard("Money off the order");
      await create.chooseOption("$ off");
      await create.setAmount("Amount off", "0");
      await create.setTimeOfDay("1100AM", "1100AM");
      await create.setName(name);
      await create.setCode(generateCouponCode());
      await create.turnOn();

      await expect(create.fixErrorsAlert()).toBeVisible();
      await create.expectFieldError("Enter an amount above $0.");
      await create.expectFieldError(
        "The end time must be different from the start time."
      );
      await expect(ownerPage).toHaveURL(/[?&]tab=create-promotion/);
      expect(await serverRow(name)).toBeUndefined();
    } finally {
      await cleanup(name);
    }
  });

  test("TC-828: edit round-trip — 15% becomes 20%", async ({ ownerPage }) => {
    await allure.description(
      "Edit opens the saved promotion prefilled; Save changes stores the new value (read back from the coupon API)."
    );
    const name = promoName("Edit");
    const coupon = await createCouponPromotion(token, restaurantId, {
      name,
      code: generateCouponCode(),
      type: "PERCENTAGE",
      value: 15,
      minOrderAmount: 30,
      maxDiscount: 4.5,
    });
    const list = createOwnerPromotionsPage(ownerPage);
    const edit = createOwnerCreatePromotionPage(ownerPage);
    try {
      await list.goto(restaurantId);
      await list.openRowAction(name, "Edit");
      await edit.expectEditing();
      await expect(edit.amountField("Percentage off")).toHaveValue("15");
      await edit.setAmount("Percentage off", "20");
      await edit.save();
      await edit.expectSaved();

      await expect
        .poll(
          async () =>
            (await getRestaurantCoupons(token, restaurantId)).find(
              (c) => c.id === coupon.id
            )?.value,
          { message: "saved percentage", timeout: 15_000 }
        )
        .toBe(20);
    } finally {
      await cleanup(name);
    }
  });

  test("TC-829: Pause, then Turn on", async ({ ownerPage }) => {
    await allure.description(
      "The row menu's Pause shows Paused and stores INACTIVE; Turn on shows Live and stores ACTIVE."
    );
    const name = promoName("Pause");
    await createCouponPromotion(token, restaurantId, {
      name,
      code: generateCouponCode(),
      type: "FIXED_AMOUNT",
      value: 2,
    });
    const list = createOwnerPromotionsPage(ownerPage);
    try {
      await list.goto(restaurantId);
      await list.expectRowStatus(name, "Live");

      await list.openRowAction(name, "Pause");
      await list.expectRowStatus(name, "Paused");
      await expect
        .poll(async () => (await serverRow(name))?.status)
        .toBe("INACTIVE");

      await list.openRowAction(name, "Turn on");
      await list.expectRowStatus(name, "Live");
      await expect
        .poll(async () => (await serverRow(name))?.status)
        .toBe("ACTIVE");
    } finally {
      await cleanup(name);
    }
  });

  test("TC-830: Delete asks once — Cancel keeps the promotion, Delete removes it", async ({
    ownerPage,
  }) => {
    await allure.description(
      'One confirm ("Delete this promotion?"): Cancel leaves the row and the server row; Delete removes both.'
    );
    const name = promoName("Delete");
    await createCouponPromotion(token, restaurantId, {
      name,
      code: generateCouponCode(),
      type: "FIXED_AMOUNT",
      value: 2,
    });
    const list = createOwnerPromotionsPage(ownerPage);
    try {
      await list.goto(restaurantId);
      await allure.step("Cancel keeps it", async () => {
        await list.openRowAction(name, "Delete");
        await list.cancelDialog();
        await list.expectRow(name);
        expect(await serverRow(name)).toBeTruthy();
      });
      await list.openRowAction(name, "Delete");
      await expect(
        ownerPage.getByRole("dialog").getByText("Delete this promotion?")
      ).toBeVisible();
      await list.confirmDialog("Delete");
      await list.expectNoRow(name);
      expect(await serverRow(name)).toBeUndefined();
    } finally {
      await cleanup(name);
    }
  });

  test("TC-853: Duplicate opens Create prefilled as a copy and saves nothing until asked", async ({
    ownerPage,
  }) => {
    await allure.description(
      'The row menu\'s Duplicate opens "Copy a promotion" with the type and amount of the original, the name "Copy of <name>" and an empty code; leaving without saving creates no second promotion.'
    );
    const name = promoName("Duplicate");
    const copy = `Copy of ${name}`;
    await createCouponPromotion(token, restaurantId, {
      name,
      code: generateCouponCode(),
      type: "FIXED_AMOUNT",
      value: 3,
    });
    const list = createOwnerPromotionsPage(ownerPage);
    const create = createOwnerCreatePromotionPage(ownerPage);
    try {
      await list.goto(restaurantId);
      await list.openRowAction(name, "Duplicate");
      await create.expectDuplicating();
      await expect(create.card("Money off the order")).toBeChecked();
      await expect(create.amountField("Amount off")).toHaveValue(/^3(\.00)?$/);
      await expect(create.nameField()).toHaveValue(copy);
      await expect(create.codeField()).toHaveValue("");

      await create.cancel();
      const rows = (await listPromotions(token, restaurantId)).filter(
        (r) => r.name === name || r.name === copy
      );
      expect(rows.map((r) => r.name)).toEqual([name]);
    } finally {
      await cleanup(name);
      await cleanup(copy);
    }
  });

  test("TC-861: Change a picked item in place — position kept, others untouched, Keep cancels", async ({
    ownerPage,
  }) => {
    await allure.description(
      'Create → Combo price with three items. "Change <second item>" opens the menu search on that line; picking another item replaces that line in place (order item1, NEW, item3). "Change <first item>" then "Keep <first item>" leaves the list unchanged. Save for later (no deal slot) stores the deal with items item1, NEW, item3.'
    );
    const name = promoName("Change line");
    const create = createOwnerCreatePromotionPage(ownerPage);
    const group = "What's in the combo?";
    try {
      await create.goto(restaurantId);
      await create.pickCard("Combo price");
      await create.pickItems(group, [itemA.name, itemB.name, gift.name]);
      await create.setAmount("Combo price", "15");
      await create.setName(name);
      expect(await create.lineNames(group)).toEqual([
        itemA.name,
        itemB.name,
        gift.name,
      ]);

      await allure.step("Change the second line to another item", async () => {
        await create.changeLine(group, itemB.name);
        await create.pickReplacement(group, extra.name);
        await expect
          .poll(() => create.lineNames(group))
          .toEqual([itemA.name, extra.name, gift.name]);
      });

      await allure.step("Keep on the first line changes nothing", async () => {
        await create.changeLine(group, itemA.name);
        await create.keepLine(group, itemA.name);
        await expect
          .poll(() => create.lineNames(group))
          .toEqual([itemA.name, extra.name, gift.name]);
      });

      await create.saveForLater();
      await create.expectSaved();

      await allure.step("the server deal has the changed list", async () => {
        const row = await serverRow(name);
        expect(row, `listPromotions has ${name}`).toBeTruthy();
        expect(row!.status).toBe("INACTIVE");
        const deal = await getDealApi(token, row!.id);
        expect((deal.items ?? []).map((i) => i.itemName)).toEqual([
          itemA.name,
          extra.name,
          gift.name,
        ]);
      });
    } finally {
      await cleanup(name);
    }
  });

  // Owner-reported on QA 2026-10-15 (RestauNax fix/combo-option-lines): the
  // items ticked under "Choose from these items" were only kept by the box
  // until "Add these choices" was pressed, so a Save dropped them silently and
  // in Edit the same ticks said "Nothing to save". Fails against a dashboard
  // without that fix; passes once it is deployed.
  test("TC-862: Combo with a 'Choose from these items' line — the ticked choices are saved, shown in Edit, and one more choice saves", async ({
    ownerPage,
  }) => {
    await allure.description(
      'Create → Combo price: two fixed items, then "Choose from these items" with three items ticked (without pressing "Add these choices"), Save for later (no deal slot). The server deal has a line whose options are exactly those three items. Edit shows that line with the same choices. Changing it to four choices (one more, again only ticked) and Save changes is a change, not "Nothing to save", and the server line now has all four.'
    );
    const name = promoName("Choices");
    const create = createOwnerCreatePromotionPage(ownerPage);
    const list = createOwnerPromotionsPage(ownerPage);
    const group = "What's in the combo?";
    const choices = [gift, extra, side];
    /** The deal's choose-from lines, as sorted option item ids. */
    const optionLines = async (dealId: string): Promise<string[][]> => {
      const deal = await getDealApi(token, dealId);
      return ((deal.items ?? []) as DealLineWithOptions[])
        .map((line) => (line.options ?? []).map((o) => o.menuItemId).sort())
        .filter((ids) => ids.length > 0);
    };
    const ids = (items: OwnItem[]) => items.map((i) => i.id).sort();
    try {
      await create.goto(restaurantId);
      await create.pickCard("Combo price");
      await create.pickItems(group, [itemA.name, itemB.name]);
      await create.tickChoices(
        group,
        choices.map((c) => c.name)
      );
      await create.setAmount("Combo price", "20");
      await create.setName(name);
      await create.saveForLater();
      await create.expectSaved();

      const row = await serverRow(name);
      expect(row, `listPromotions has ${name}`).toBeTruthy();
      expect(row!.status).toBe("INACTIVE");

      await allure.step(
        "the server deal keeps every ticked choice",
        async () => {
          expect(await optionLines(row!.id)).toEqual([ids(choices)]);
        }
      );

      await allure.step("Edit shows the same choices", async () => {
        await list.goto(restaurantId);
        await list.openRowAction(name, "Edit");
        await create.expectEditing();
        await expect
          .poll(() => create.lineNames(group))
          .toEqual([
            itemA.name,
            itemB.name,
            choices.map((c) => c.name).join(", "),
          ]);
      });

      await allure.step("one more choice in Edit saves", async () => {
        const more = [...choices, drink];
        await create.tickChoices(
          group,
          more.map((c) => c.name),
          { change: choices.map((c) => c.name).join(", ") }
        );
        await create.save();
        await expect(
          ownerPage.getByText("Nothing to save", { exact: false })
        ).toHaveCount(0);
        await create.expectSaved();
        await expect
          .poll(() => optionLines(row!.id), { timeout: 15_000 })
          .toEqual([ids(more)]);
      });
    } finally {
      await cleanup(name);
    }
  });

  test("TC-831: Results load, and the 60-day range works", async ({
    ownerPage,
  }) => {
    await allure.description(
      "KPI cards and the day-by-day trend (or the no-activity state) render for 30 days, then for 60."
    );
    const results = createOwnerPromotionResultsPage(ownerPage);
    await results.goto(restaurantId);
    await results.expectLoaded(30);
    await results.selectRange(60);
    await results.expectLoaded(60);
  });
});
