/**
 * 26-promotion-preview.spec.ts — "Try it as a customer" from the dashboard to
 * template-lima on QA (TC-882 → TC-887; spec: restaunax
 * docs/superpowers/specs/2026-10-16-promotion-preview-design.md).
 *
 * The owner builds a promotion in Create (or Edit) and presses "Try it as a
 * customer": the dashboard opens a blank tab, creates a hidden PREVIEW copy
 * and points the tab at lima's /preview/<token>/…, where it can be shopped up
 * to the checkout total but never ordered.
 *
 * Seed restaurant, own data: a per-run "Automation Menu Try <id>" category
 * with four AUTO items (two gyros, a soda, a cookie), so a preview sale never
 * reprices an item another file asserts on. Nothing here is saved as a live
 * promotion except TC-883's PAUSED combo (no deal slot; deleted in its
 * finally). Previews never take a deal slot; every test ends the preview(s)
 * it opened in its own `finally` (at most two live at once, TC-886) — the
 * afterAll pass is only a backstop. api-promotion-preview runs on its own
 * tenant, so this file owns the seed owner's 5-live-preview cap and create
 * rate limit (up to 7 creates per run, against 20 per 15 minutes).
 *
 * The whole file skips — instead of failing — when the backend refuses to
 * mint previews (503 PROMOTION_PREVIEW_UNAVAILABLE: QA's ORDERING_BASE_URL
 * unset), or when the dashboard reports "Customer previews aren't available
 * here yet." and hides the button. Nightly lane (no @smoke).
 */
import * as allure from "allure-js-commons";
import type { Page } from "@playwright/test";
import { test, expect } from "../../../fixtures/base";
import {
  createOwnerCreatePromotionPage,
  type OwnerCreatePromotionPage,
} from "../../../pages/dashboard/owner/OwnerCreatePromotionPage";
import { createOwnerPromotionsPage } from "../../../pages/dashboard/owner/OwnerPromotionsPage";
import { createLimaCheckoutPage } from "../../../pages/lima/LimaCheckoutPage";
import { createLimaDealPage } from "../../../pages/lima/LimaDealPage";
import { createLimaPreviewPage } from "../../../pages/lima/LimaPreviewPage";
import { createLimaStorefrontPage } from "../../../pages/lima/LimaStorefrontPage";
import {
  apiLogin,
  apiRequestRaw,
  createDealApi,
  createMenuGroupNamed,
  createMenuItemFull,
  deleteMenuGroupRaw,
  deleteMenuItemRaw,
  getActiveDealsCountRaw,
  getDealApi,
} from "../../../utils/apiHelper";
import {
  createRestaurantPreviewRaw,
  endPreviewRaw,
  getPreviewRaw,
} from "../../../utils/previewApi";
import {
  deletePromotionRaw,
  listPromotions,
} from "../../../utils/promotionsApi";
import {
  expectShownMatchesLatestQuote,
  trackQuotes,
} from "../../../utils/quoteTracker";
import { generateRunId, readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const API_UNAVAILABLE_REASON =
  "Previews are switched off on this backend (503 PROMOTION_PREVIEW_UNAVAILABLE): set ORDERING_BASE_URL on QA, then re-run";
const UI_UNAVAILABLE_REASON =
  'The dashboard says "Customer previews aren\'t available here yet." (the backend answered 503 PROMOTION_PREVIEW_UNAVAILABLE or has no preview route): deploy the preview backend / set ORDERING_BASE_URL on QA, then re-run';
const PREVIEW_MENU_URL = /\/preview\/[A-Za-z0-9_-]{43}\/menu/;
const money = (n: number) => `$${n.toFixed(2)}`;

interface OwnItem {
  label: string;
  price: number;
  id: string;
  name: string;
}

test.describe("Owner — Try it as a customer (dashboard → lima)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  let token = "";
  let restaurantId = "";
  let groupId = "";
  let previewsUnavailable = false;
  /** Every preview token this file opened — afterAll's backstop only. */
  const opened: string[] = [];

  const item = (label: string, price: number): OwnItem => ({
    label,
    price,
    id: "",
    name: `AUTO Try ${label} ${runId}`,
  });
  const gyroA = item("Chicken Gyro", 12);
  const gyroB = item("Lamb Gyro", 13);
  const soda = item("Soda", 2);
  const cookie = item("Cookie", 4);
  const all = [gyroA, gyroB, soda, cookie];

  /**
   * Presses "Try it as a customer" and returns the lima tab plus its token
   * (recorded for the backstop at once). Skips the rest of the file when the
   * dashboard reports previews unavailable; any other refusal fails.
   */
  const tryIt = async (
    create: OwnerCreatePromotionPage
  ): Promise<{ tab: Page; previewToken: string }> => {
    let tab: Page;
    try {
      tab = await create.tryAsCustomer();
    } catch (err) {
      if (await create.previewUnavailableNotice().isVisible()) {
        previewsUnavailable = true;
        test.skip(true, UI_UNAVAILABLE_REASON);
      }
      throw err;
    }
    const previewToken = createLimaPreviewPage(tab).token();
    opened.push(previewToken);
    return { tab, previewToken };
  };

  /** Ends a preview (idempotent) and closes its tab, whatever state it is in. */
  const endAndClose = async (previewToken: string, tab: Page | null) => {
    if (previewToken) await endPreviewRaw(previewToken).catch(() => undefined);
    if (tab && !tab.isClosed()) await tab.close();
  };

  /** The preview's own (hidden) promotion id, from its public payload. */
  const previewPromotionId = async (previewToken: string): Promise<string> => {
    const res = await getPreviewRaw(previewToken);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return (res.data.data!.promotion as { id: string }).id;
  };

  test.beforeAll(async () => {
    ({ restaurantId } = readSharedState());
    ({ accessToken: token } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD));

    // Availability probe — an empty body. The backend answers 503 before it
    // validates anything when previews are off; otherwise it is a 400 and
    // nothing is created (costs one of the create limiter's 20 / 15 min).
    const probe = await createRestaurantPreviewRaw(token, restaurantId, {});
    if (
      probe.status === 503 &&
      probe.data.errorCode === "PROMOTION_PREVIEW_UNAVAILABLE"
    ) {
      previewsUnavailable = true;
      return;
    }

    groupId = (
      await createMenuGroupNamed(token, `Automation Menu Try ${runId}`, {
        restaurantId,
      })
    ).id;
    for (const it of all) {
      it.id = (await createMenuItemFull(token, groupId, it.name, it.price)).id;
    }
  });

  test.afterAll(async () => {
    for (const t of opened) await endPreviewRaw(t).catch(() => undefined);
    for (const it of all) {
      if (it.id) await deleteMenuItemRaw(token, it.id).catch(() => undefined);
    }
    if (groupId)
      await deleteMenuGroupRaw(token, groupId).catch(() => undefined);
  });

  test.beforeEach(async () => {
    test.skip(
      previewsUnavailable,
      previewsUnavailable && !groupId
        ? API_UNAVAILABLE_REASON
        : UI_UNAVAILABLE_REASON
    );
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
  });

  test("TC-882: an unsaved BOGO with an option line, tried as a customer, end to end", async ({
    ownerPage,
  }) => {
    const name = `AUTO Try BOGO ${runId}`;
    const create = createOwnerCreatePromotionPage(ownerPage);
    await create.goto(restaurantId);
    await create.pickCard("Buy one, get one");
    await create.pickItems("They buy", [gyroA.name, gyroB.name], {
      choice: true,
    });
    await create.chooseOption("Same item");
    await create.chooseOption("For a set price");
    await create.setAmount("They pay", "1.99");
    await create.setName(name);

    const { tab, previewToken } = await tryIt(create);
    const preview = createLimaPreviewPage(tab);
    try {
      await expect(preview.banner()).toContainText(
        "Preview — orders can't be placed",
        { timeout: 20_000 }
      );

      await allure.step("the builder: one pick per slot", async () => {
        const deal = createLimaDealPage(tab);
        await expect(deal.builderHeading(name)).toBeVisible({
          timeout: 20_000,
        });
        await deal.pickChoice(0, gyroB.name);
        await deal.pickChoice(1, gyroA.name);
        await deal.assertDealComplete();
        // Equal-or-lesser: Lamb $13 at full price, Chicken $12 at $1.99.
        await expect(deal.progressDealPrice()).toHaveText(money(13 + 1.99));
        await deal.keepShoppingButton().click();
        await expect(tab).toHaveURL(PREVIEW_MENU_URL);
        await expect(preview.previewChip().first()).toBeVisible();
      });

      await allure.step(
        "add a soda → checkout total = the latest /quote; ordering blocked",
        async () => {
          const store = createLimaStorefrontPage(tab);
          await store.openItemModal(soda.name);
          await store.clickAddToCart();

          const quotes = trackQuotes(tab);
          await store.cartButton().click();
          const checkout = createLimaCheckoutPage(tab);
          await checkout.goToCheckout();
          await expectShownMatchesLatestQuote(
            () => checkout.readTotal(),
            quotes
          );
          await expect(preview.checkoutNotice()).toBeVisible();
          await expect(checkout.placeOrderButton()).toHaveCount(0);
        }
      );

      await allure.step(
        "the dashboard never lists it and it holds no deal slot",
        async () => {
          const dealId = await previewPromotionId(previewToken);
          const rows = await listPromotions(token, restaurantId);
          expect(rows.some((r) => r.id === dealId)).toBe(false);
          expect(rows.some((r) => r.name === name)).toBe(false);
          // Other workers turn their own deals on and off meanwhile, so the
          // count is compared with the server's own slot holders, retried.
          await expect(async () => {
            const count = (await getActiveDealsCountRaw(token, restaurantId))
              .data.activeDealsCount;
            const holders = (await listPromotions(token, restaurantId)).filter(
              (r) => r.source === "DEAL" && r.holdsDealSlot
            );
            expect(holders.some((r) => r.id === dealId)).toBe(false);
            expect(count).toBe(holders.length);
          }).toPass({ timeout: 30_000 });
        }
      );
    } finally {
      await endAndClose(previewToken, tab);
    }
  });

  test("TC-883: Edit — preview a new combo price while the live deal keeps the old one", async ({
    ownerPage,
  }) => {
    const name = `AUTO Try Edit ${runId}`;
    // Paused: no deal slot. Gyro $12 + Soda $2 = $14 regular.
    const live = await createDealApi(
      token,
      restaurantId,
      name,
      12.99,
      [
        { id: gyroA.id, name: gyroA.name, price: gyroA.price },
        { id: soda.id, name: soda.name, price: soda.price },
      ],
      { status: "INACTIVE" }
    );
    const list = createOwnerPromotionsPage(ownerPage);
    const edit = createOwnerCreatePromotionPage(ownerPage);
    let tab: Page | null = null;
    let previewToken = "";
    try {
      await list.goto(restaurantId);
      await list.showAllRows();
      await list.openRowAction(name, "Edit");
      await edit.expectEditing();
      await expect(edit.amountField("Combo price")).toHaveValue("12.99");
      await edit.setAmount("Combo price", "9.49");
      ({ tab, previewToken } = await tryIt(edit));
      const preview = createLimaPreviewPage(tab);
      await expect(preview.banner()).toContainText(
        `Unsaved changes to ${name}`,
        { timeout: 20_000 }
      );
      const deal = createLimaDealPage(tab);
      await expect(deal.builderHeading(name)).toBeVisible({ timeout: 20_000 });
      await expect(deal.progressDealPrice()).toHaveText(/\$9\.49/);
      const stored = await getDealApi(token, live.id);
      expect(stored.dealPrice).toBe(12.99);
      expect(stored.status).toBe("INACTIVE");
    } finally {
      await endAndClose(previewToken, tab);
      await deletePromotionRaw(token, { source: "DEAL", id: live.id });
    }
  });

  test("TC-884: Sale on items — the lima menu shows the preview sale price", async ({
    ownerPage,
  }) => {
    const create = createOwnerCreatePromotionPage(ownerPage);
    await create.goto(restaurantId);
    await create.pickCard("Sale on items");
    await create.pickItems("Which items are on sale?", [gyroA.name]);
    await create.setAmount("Percentage off", "50");
    await create.setName(`AUTO Try Sale ${runId}`);
    const { tab, previewToken } = await tryIt(create);
    try {
      await expect(tab).toHaveURL(PREVIEW_MENU_URL, { timeout: 20_000 });
      const store = createLimaStorefrontPage(tab);
      await expect(store.cardSaleLabel(gyroA.name)).toBeVisible({
        timeout: 20_000,
      });
      await expect(store.itemCard(gyroA.name)).toContainText("$6.00");
      await expect(store.cardRegularPrice(gyroA.name)).toContainText("$12.00");
    } finally {
      await endAndClose(previewToken, tab);
    }
  });

  test("TC-885: Free item — the banner hints the trigger and checkout offers the gift", async ({
    ownerPage,
  }) => {
    const create = createOwnerCreatePromotionPage(ownerPage);
    await create.goto(restaurantId);
    await create.pickCard("Free item");
    await create.pickItems("Which item is free?", [cookie.name]);
    await create.chooseOption("When they buy");
    await create.pickItems("What do they need to buy?", [gyroA.name]);
    await create.setName(`AUTO Try Gift ${runId}`);
    const { tab, previewToken } = await tryIt(create);
    const preview = createLimaPreviewPage(tab);
    try {
      await expect(preview.banner()).toContainText(
        `Add ${gyroA.name} to your cart to see the free ${cookie.name} at checkout.`,
        { timeout: 20_000 }
      );
      await expect(tab).toHaveURL(PREVIEW_MENU_URL);
      const store = createLimaStorefrontPage(tab);
      await store.openItemModal(gyroA.name);
      await store.clickAddToCart();
      await store.cartButton().click();
      const checkout = createLimaCheckoutPage(tab);
      await checkout.goToCheckout();
      await expect(checkout.freeItemOfferButton()).toBeVisible({
        timeout: 20_000,
      });
      await expect(preview.checkoutNotice()).toBeVisible();
    } finally {
      await endAndClose(previewToken, tab);
    }
  });

  test("TC-886: a second press replaces the first; ended previews show the ended page and can't be ordered", async ({
    ownerPage,
  }) => {
    const create = createOwnerCreatePromotionPage(ownerPage);
    await create.goto(restaurantId);
    await create.pickCard("Combo price");
    await create.pickItems("What's in the combo?", [soda.name, cookie.name]);
    await create.setAmount("Combo price", "4.99");
    await create.setName(`AUTO Try End ${runId}`);

    let first: { tab: Page; previewToken: string } | null = null;
    let second: { tab: Page; previewToken: string } | null = null;
    try {
      first = await tryIt(create);
      const firstPreview = createLimaPreviewPage(first.tab);
      await expect(firstPreview.banner()).toBeVisible({ timeout: 20_000 });
      const firstDealId = await previewPromotionId(first.previewToken);

      await allure.step(
        "press again: a new preview replaces the first",
        async () => {
          await ownerPage.bringToFront();
          second = await tryIt(create);
          expect(second.previewToken).not.toBe(first!.previewToken);
          await expect(createLimaPreviewPage(second.tab).banner()).toBeVisible({
            timeout: 20_000,
          });
          expect((await getPreviewRaw(first!.previewToken)).status).toBe(404);
        }
      );

      await allure.step(
        "back on the first tab: the ended page, also after a reload",
        async () => {
          await firstPreview.returnToTab();
          await expect(firstPreview.endedMessage()).toBeVisible({
            timeout: 15_000,
          });
          await expect(firstPreview.banner()).toHaveCount(0);
          await first!.tab.reload();
          await expect(firstPreview.endedMessage()).toBeVisible();
        }
      );

      await allure.step(
        "End preview in the banner ends the second",
        async () => {
          const secondPreview = createLimaPreviewPage(second!.tab);
          await secondPreview.endPreviewButton().click();
          // The tab was opened by script, so lima may close it; either way the
          // preview is gone.
          await expect
            .poll(
              async () => (await getPreviewRaw(second!.previewToken)).status,
              {
                timeout: 15_000,
              }
            )
            .toBe(404);
          // Closed by lima, or left open on the ended page — nothing else.
          await expect
            .poll(
              async () =>
                second!.tab.isClosed() ||
                (await secondPreview
                  .endedMessage()
                  .isVisible()
                  .catch(() => second!.tab.isClosed())),
              { timeout: 15_000 }
            )
            .toBe(true);
        }
      );

      await allure.step(
        "a direct order with the ended preview's deal is refused",
        async () => {
          const direct = await apiRequestRaw(
            "POST",
            `/api/order/new/restaurantId/${restaurantId}`,
            {
              orderType: "PICKUP",
              orderItems: [],
              orderDeals: [
                {
                  dealId: firstDealId,
                  quantity: 1,
                  dealPrice: 4.99,
                  items: [{ menuItemId: soda.id }, { menuItemId: cookie.id }],
                },
              ],
            }
          );
          expect(direct.ok, JSON.stringify(direct.data)).toBe(false);
        }
      );
    } finally {
      const a = first as { tab: Page; previewToken: string } | null;
      const b = second as { tab: Page; previewToken: string } | null;
      if (a) await endAndClose(a.previewToken, a.tab);
      if (b) await endAndClose(b.previewToken, b.tab);
    }
  });

  test("TC-887: hidden for money off and free delivery, disabled in-store only; on a phone it lives in the Preview bar, not the save buttons", async ({
    ownerPage,
  }) => {
    const create = createOwnerCreatePromotionPage(ownerPage);

    await allure.step(
      "desktop: offered for a combo, in the preview panel",
      async () => {
        await create.goto(restaurantId);
        await create.pickCard("Combo price");
        await expect(
          create.previewPanel().getByTestId("try-as-customer")
        ).toBeVisible();
        await expect(create.tryAsCustomerButton()).toHaveText(
          "Try it as a customer"
        );
        await expect(create.tryAsCustomerHint()).toHaveText(
          "Opens your ordering page in a new tab with this promotion. Nothing is saved and no orders can be placed."
        );
      }
    );

    await allure.step(
      "in-store only: shown disabled, with the reason",
      async () => {
        await create.setWhere("In-store only");
        await expect(create.tryAsCustomerButton()).toBeDisabled();
        await expect(create.tryAsCustomerReason()).toHaveText(
          "This promotion is in-store only, so there's nothing to try online."
        );
      }
    );

    for (const type of ["Money off the order", "Free delivery"] as const) {
      await allure.step(`${type}: no button`, async () => {
        await create.goto(restaurantId);
        await create.pickCard(type);
        await expect(create.previewPanel()).toBeVisible();
        await expect(create.tryAsCustomerButton()).toHaveCount(0);
      });
    }

    await allure.step(
      "390 px: inside the expanded Preview bar only",
      async () => {
        await ownerPage.setViewportSize({ width: 390, height: 844 });
        await create.goto(restaurantId);
        await create.pickCard("Combo price");
        await create.openPreviewBar();
        await expect(
          create.previewBarBody().getByTestId("try-as-customer")
        ).toBeVisible();
        const saveRow = create.saveForLaterButton().locator("xpath=..");
        await expect(saveRow.getByTestId("try-as-customer")).toHaveCount(0);
      }
    );
  });
});
