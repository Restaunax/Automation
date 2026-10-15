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
 * category with three items (two to sell, one free gift), so a live sale or
 * free item never reprices the seed item other files assert on. Every
 * promotion has an AUTO name (and an AUTO code when it takes one) and is
 * deleted in its test's `finally`; the category goes in afterAll, and
 * globalTeardown's AUTO / "Automation Menu" sweeps backstop an interrupted run.
 * Deal-type promotions (TC-824, TC-826's combo) wait for a free slot under the
 * 10-active cap first — see TEST_PLAN.md's footprint table.
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
  deleteCouponApi,
  deleteDealRaw,
  deleteMenuGroupRaw,
  deleteMenuItemRaw,
  getActiveDealsPublic,
  getRestaurantCoupons,
  waitForFreeDealSlot,
} from "../../../utils/apiHelper";
import {
  createCouponPromotion,
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

  const promoName = (label: string) => `AUTO ${label} ${runId}`;

  /** The server's row for `name`, or undefined. */
  const serverRow = async (
    name: string
  ): Promise<PromotionListRow | undefined> =>
    (await listPromotions(token, restaurantId)).find((r) => r.name === name);

  /** Deletes every promotion titled `name` (coupon or deal). Best-effort. */
  const cleanup = async (name: string) => {
    const rows = (await listPromotions(token, restaurantId)).filter(
      (r) => r.name === name
    );
    for (const r of rows) {
      if (r.source === "COUPON") {
        await deleteCouponApi(token, r.id).catch(() => {
          // Already gone (the test deleted it) — nothing to clean.
        });
      } else {
        await deleteDealRaw(token, r.id);
      }
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
  });

  test.afterAll(async () => {
    if (!token) return;
    for (const item of [itemA, itemB, gift]) {
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
      await waitForFreeDealSlot(token, restaurantId);
      await create.turnOn();
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

  // The examples area of Create is being redesigned (filtered by type,
  // grouped by goal, built from the restaurant's menu); this case is
  // rewritten against the new gallery once it ships.
  test.fixme("TC-825: create Combo price from an example — pending create-flow redesign — rewritten after it ships", async () => {});

  test("TC-826: create Free item (spend $40), Free delivery ($15+, up to $8) and Combo price ($15 for two items)", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The remaining card types save and list as Live; the combo is built from its card (the from-an-example path is TC-825, pending the examples redesign)."
    );
    const freeItem = promoName("Free item");
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
        await create.setName(freeItem);
        await create.turnOn();
        await create.expectSaved();
        await list.showAllRows();
        await list.expectRowStatus(freeItem, "Live");
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
        await create.setAmount("Combo price", "15");
        await create.setName(combo);
        await create.expectPreviewText(/\$15\.00/);
        await waitForFreeDealSlot(token, restaurantId);
        await create.turnOn();
        await create.expectSaved();
        await list.showAllRows();
        await list.expectRowStatus(combo, "Live");
        expect((await serverRow(combo))?.status).toBe("ACTIVE");
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

  test("TC-830: Delete asks once and removes the promotion", async ({
    ownerPage,
  }) => {
    await allure.description(
      'One confirm ("Delete this promotion?"), then the row is gone and the server no longer lists it.'
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
