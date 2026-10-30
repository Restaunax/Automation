/**
 * 33-partial-refund-ui.spec.ts — the owner refunds part of a paid card order
 * from the dashboard, then the rest (TC-1040..1042, RestauNax #1109).
 *
 * Browser. A per-run throwaway restaurant (7% tax, a Stripe TEST account)
 * and one paid online order: Burger $12.00 + Fries $4.00 + $1.12 tax + a
 * $3.00 tip = $20.12 on a test card. Until #1109 the dashboard had no way to
 * refund part of an order (Cancel Order refunded everything), and the refund
 * route checked an amount against the order total, not what was left.
 *
 *   TC-1040 The order offers Refund; a partial refund of $4.28 ("the fries
 *           were cold") with a bad and a too-large amount refused inside the
 *           dialog first; "Refunded $4.28." is seen and the order stays live.
 *   TC-1041 The route refuses more than is left, in words: "Only $15.84 is
 *           left to refund on this order."
 *   TC-1042 Refunding everything left closes the order: Refunded, and no
 *           Refund button any more.
 *
 * Known to fail until RestauNax #1109 is on QA (EXPECT_FIX_1109=1 runs it
 * strictly).
 */
import type { Locator, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsApi,
  ensureTaxRate,
  ensureBusinessHours,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  stripeConfigRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  refundOrderRaw,
} from "../../../utils/apiHelper";
import { placePaidOnlineOrder } from "../../../utils/comboFoodSurfaces";
import {
  activeDialog,
  DESKTOP,
  expectSeenByUser,
} from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const FIX_1109 = "RestauNax #1109 not on QA yet";
const FIXED_1109 = process.env.EXPECT_FIX_1109 === "1";

test.describe.configure({ mode: "serial" });

test.describe("Partial refund from the dashboard (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let orderId = "";
  let session: UiLoginSession | undefined;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  /** The order's sheet, opened from Orders the way an owner does. */
  const openOrder = async (): Promise<Locator> => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Orders`,
      { waitUntil: "domcontentloaded" }
    );
    const row = page().getByRole("row", { name: /^#\d+ .*Gia Guest/ });
    await row.getByRole("button", { name: "View Details" }).click({
      timeout: 25_000,
    });
    const sheet = activeDialog(page());
    await expect(
      sheet.getByRole("heading", { name: "Order Information" })
    ).toBeVisible({
      timeout: 20_000,
    });
    return sheet;
  };
  const openRefund = async (sheet: Locator) => {
    await sheet.getByRole("button", { name: "Refund", exact: true }).click();
    const dialog = page().getByRole("dialog", { name: "Process Refund" });
    await expect(dialog).toBeVisible();
    return dialog;
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[partial-refund] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });
    await ensureTaxRate(ownerToken, restaurantId, 7);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await ensureBusinessHours(ownerToken, restaurantId);
    const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
    if (onboard.status !== 200)
      throw new Error(
        `[partial-refund] stripe: ${JSON.stringify(onboard.data)}`
      );
    const pk = String(
      (await stripeConfigRaw()).data.data?.publishableKey ?? ""
    );
    const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
      restaurantId,
    });
    const burger = await createMenuItemFull(ownerToken, food.id, "Burger", 12);
    const fries = await createMenuItemFull(ownerToken, food.id, "Fries", 4);
    const order = await placePaidOnlineOrder(pk, restaurantId, {
      orderType: "PICKUP",
      subtotal: 16,
      tax: 1.12,
      tip: 3,
      deliveryFee: 0,
      total: 20.12,
      customerEmail: `auto-guest-${runId}@restaunax-test.com`,
      customerPhone: "5555550123",
      firstName: "Gia",
      lastName: "Guest",
      orderItems: [
        {
          menuItemId: burger.id,
          menuItemName: "Burger",
          quantity: 1,
          price: 12,
        },
        { menuItemId: fries.id, menuItemName: "Fries", quantity: 1, price: 4 },
      ],
    });
    orderId = order.id;
    session = await loginViaUi(browser, tenant.email, tenant.password);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    test.fail(!FIXED_1109, FIX_1109);
    await allure.label("feature", "Orders — partial refund");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  test("TC-1040: a partial refund of $4.28 — bad amounts refused in the dialog; the order stays live", async () => {
    const sheet = await openOrder();
    const dialog = await openRefund(sheet);
    await expect(
      dialog.getByText("Give back everything that's left: $20.12")
    ).toBeVisible();
    await dialog.getByRole("radio", { name: /^Partial Refund/ }).check();
    const amount = dialog.getByRole("textbox", { name: "Refund Amount" });
    await expect(dialog.getByText("Maximum refundable: $20.12")).toBeVisible();
    const send = dialog.getByRole("button", { name: "Process Refund" });

    await amount.fill("0");
    await send.click();
    await expectSeenByUser(
      dialog.getByText("Please enter a valid refund amount"),
      "the bad-amount message"
    );
    await amount.fill("25");
    await send.click();
    await expectSeenByUser(
      dialog.getByText("You can refund at most $20.12."),
      "the too-much message"
    );

    await amount.fill("4.28");
    await dialog
      .getByRole("textbox", { name: "Reason for Refund (Optional)" })
      .fill("The fries were cold");
    await send.click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expectSeenByUser(
      sheet.getByText("Refunded $4.28."),
      '"Refunded $4.28."'
    );
    // Still a live order: it can be refunded again or cancelled.
    await expect(
      sheet.getByRole("button", { name: "Refund", exact: true })
    ).toBeVisible();
    await expect(
      sheet.getByRole("button", { name: "Cancel Order" })
    ).toBeVisible();
  });

  test("TC-1041: the route refuses more than is left, in words", async () => {
    const r = await refundOrderRaw(ownerToken, orderId, { amount: 16 });
    expect(r.status).toBe(400);
    expect(String(r.data.message)).toBe(
      "Only $15.84 is left to refund on this order."
    );
  });

  test("TC-1042: refunding everything left closes the order", async () => {
    const sheet = await openOrder();
    const dialog = await openRefund(sheet);
    await expect(dialog.getByText("Already refunded: $4.28")).toBeVisible();
    await expect(
      dialog.getByText("Give back everything that's left: $15.84")
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Process Refund" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expectSeenByUser(
      sheet.getByText("Refunded $15.84."),
      '"Refunded $15.84."'
    );
    await expect(
      sheet.getByRole("button", { name: "Refund", exact: true })
    ).toHaveCount(0);
    const again = await refundOrderRaw(ownerToken, orderId, { amount: 1 });
    expect(String(again.data.message)).toBe("Order has already been refunded");
  });
});
