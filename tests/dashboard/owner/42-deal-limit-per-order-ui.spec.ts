/**
 * 42-deal-limit-per-order-ui.spec.ts — Owner → Promotions → Edit → Limits →
 * "Limit per order (optional)" on a deal-backed promotion.
 *
 * Spec: restaunax docs/features/DEAL_COPIES_AND_LATE_PROMOTIONS.md, Part 2
 * (`Deal.maxPerOrder`: null = no limit). Keys: promotions namespace
 * `rules.card.limits.perOrder.*` (EN+ES).
 *
 * Gated (utils/releaseGate.ts, tag @deal-copies): RELEASED_ON_QA
 * .dealCopiesDashboard (the field is in the dashboard bundle) and
 * .dealCopies (the backend stores maxPerOrder). Flip each once it is on QA.
 *
 * Own data on the seed restaurant: a per-run "Automation Menu Promo Limit"
 * category with two items and one PAUSED combo of them (paused = no active
 * deal slot used), all deleted in afterAll; globalTeardown's AUTO /
 * "Automation Menu" sweeps backstop an interrupted run.
 *
 *   TC-2118 the field saves (2), reloads with 2 (the API says 2), and
 *           clearing it saves "no limit" (null).
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerPromotionsPage } from "../../../pages/dashboard/owner/OwnerPromotionsPage";
import { createOwnerCreatePromotionPage } from "../../../pages/dashboard/owner/OwnerCreatePromotionPage";
import {
  apiLogin,
  createDealApiCapSafe,
  createMenuGroupNamed,
  createMenuItemFull,
  deleteDealApi,
  deleteMenuGroupRaw,
  deleteMenuItemRaw,
  getDealApi,
  type ApiDeal,
} from "../../../utils/apiHelper";
import {
  probeDealCopies,
  probeDealCopiesDashboard,
  requireRelease,
} from "../../../utils/releaseGate";
import { generateRunId, readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

/** The field's input (AmountField puts the id on the input). */
const FIELD_ID = "#promotion-rules-max-per-order";

test.describe("Owner — deal limit per order @deal-copies", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  const runId = generateRunId();
  let token = "";
  let restaurantId = "";
  let groupId = "";
  const itemIds: string[] = [];
  let deal: ApiDeal | undefined;

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    ({ restaurantId } = readSharedState());
    ({ accessToken: token } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD));
    groupId = (
      await createMenuGroupNamed(
        token,
        `Automation Menu Promo Limit ${runId}`,
        { restaurantId }
      )
    ).id;
    const make = async (label: string, price: number) => {
      const name = `AUTO Limit ${label} ${runId}`;
      const item = await createMenuItemFull(token, groupId, name, price);
      itemIds.push(item.id);
      return { id: item.id, name, price };
    };
    const wrap = await make("Wrap", 10);
    const soda = await make("Soda", 3);
    deal = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Limit combo ${runId}`,
      11,
      [wrap, soda],
      { status: "INACTIVE" }
    );
  });

  test.afterAll(async () => {
    if (!token) return;
    // Best-effort cleanup — globalTeardown's AUTO sweep removes a leftover.
    if (deal) await deleteDealApi(token, deal.id).catch(() => {});
    for (const id of itemIds) await deleteMenuItemRaw(token, id);
    if (groupId) await deleteMenuGroupRaw(token, groupId);
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Promotions");
    await allure.label("severity", "normal");
  });

  test("TC-2118: 'Limit per order' on a deal saves, reloads with the saved value, and clearing it saves no limit", async ({
    ownerPage,
  }) => {
    requireRelease("dealCopiesDashboard", await probeDealCopiesDashboard());
    requireRelease("dealCopies", await probeDealCopies(token, deal!.id));
    const name = deal!.name;
    const list = createOwnerPromotionsPage(ownerPage);
    const edit = createOwnerCreatePromotionPage(ownerPage);
    const field = ownerPage.locator(FIELD_ID);
    const storedLimit = async () =>
      (
        (await getDealApi(token, deal!.id)) as ApiDeal & {
          maxPerOrder?: number | null;
        }
      ).maxPerOrder;

    const openLimits = async () => {
      await list.goto(restaurantId);
      await list.openRowAction(name, "Edit");
      await edit.expectEditing();
      await edit.openRule("Limits");
      await expect(field).toBeVisible();
    };

    await allure.step("empty by default; type 2 and save", async () => {
      await openLimits();
      await expect(
        ownerPage.getByText("Limit per order (optional)", { exact: true })
      ).toBeVisible();
      await expect(field).toHaveValue("");
      await field.fill("2");
      await expect(
        ownerPage.getByText("copies per order", { exact: true })
      ).toBeVisible();
      await edit.save();
      await edit.expectSaved();
      await expect
        .poll(storedLimit, { message: "saved maxPerOrder", timeout: 15_000 })
        .toBe(2);
    });

    await allure.step(
      "reopened: the field shows 2; clear it and save",
      async () => {
        await openLimits();
        await expect(field).toHaveValue("2");
        await field.fill("");
        await edit.save();
        await edit.expectSaved();
        await expect
          .poll(storedLimit, {
            message: "cleared maxPerOrder",
            timeout: 15_000,
          })
          .toBeNull();
      }
    );
  });
});
