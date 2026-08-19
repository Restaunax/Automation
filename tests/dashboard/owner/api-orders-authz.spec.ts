/**
 * api-orders-authz.spec.ts — Orders API auth / tenant-isolation pins (Layer 1).
 *
 * TC-226..230 from docs/ORDERS_TAB_TEST_STRATEGY.md §1 / §4-P0. Both §1
 * findings were fixed in RestauNax PR #621 (merged to qa 2026-08-19):
 *   • GET /api/order/now (anonymous all-orders PII dump) is DELETED — the
 *     path now falls through to the public GET /api/order/:orderId matcher,
 *     so "now" is treated as an order id → 404 ORDER_NOT_FOUND.
 *   • The five statistics READ routes (management/:restaurantId,
 *     export/:restaurantId, restaurantId/:restaurantId, :orderId,
 *     :orderId/receipt) now 403 when the authenticated owner doesn't control
 *     the restaurant. Unknown orders 404 BEFORE the ownership check on the
 *     orderId routes.
 * These tests pin that state so the holes can't come back.
 *
 * Second tenant: NO OWNER2_* credentials required — createSecondOwner mints a
 * per-run throwaway OWNER + restaurant via the admin API (and transparently
 * uses OWNER2_EMAIL/OWNER2_PASSWORD instead when both are set in .env). The
 * throwaway restaurant is archived in afterAll. The intruder reads the SEED
 * restaurant's data, so no menu/order seeding is needed on the throwaway side.
 *
 * Own data: order-scoped tests seed one order on the seed restaurant via
 * createSeededOrder (no Stripe). Seeded orders are permanent QA residue —
 * assert on our rows only.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  readSharedState,
  generateRunId,
  generateSeedPhone,
  generateSeedSurname,
} from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  createSeededOrder,
  deleteTestRestaurant,
  listOrdersRaw,
  getOrderStatsRaw,
  exportOrdersRaw,
  getOrderDetailRaw,
  getOrderReceiptRaw,
  getOrdersNowRaw,
  updateOrderStatusRaw,
  cancelOrderRaw,
  refundOrderRaw,
  type SeededOrder,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/** A well-formed-but-nonexistent order id derived from a real one. */
const unknownOrderId = (realId: string): string =>
  realId.slice(0, -4) + (realId.endsWith("0000") ? "1111" : "0000");

test.describe("Owner — Orders API auth & tenant isolation", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER_* / ADMIN_* credentials not set in .env (admin mints the second tenant)"
  );

  const runId = generateRunId();
  const surname = generateSeedSurname(runId);
  let ownerToken = ""; // seed OWNER — controls the seed restaurant
  let intruderToken = ""; // per-run second OWNER — does NOT
  let adminToken = "";
  let seedRestaurantId = "";
  let intruderRestaurantId: string | null = null;
  let intruderIsEnvOwner2 = false;
  let seeded: SeededOrder; // PICKUP CONFIRMED on the seed restaurant

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    ({ restaurantId: seedRestaurantId } = readSharedState());
    ownerToken = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    intruderIsEnvOwner2 = Boolean(
      process.env.OWNER2_EMAIL && process.env.OWNER2_PASSWORD
    );
    const tenant = await createSecondOwner(adminToken, runId);
    intruderToken = tenant.accessToken;
    intruderRestaurantId = tenant.restaurantId;
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    seeded = await createSeededOrder(
      ownerToken,
      seedRestaurantId,
      { menuItemId, name: menuItemName, price: menuItemPrice },
      {
        status: "CONFIRMED",
        lastName: surname,
        customerPhone: generateSeedPhone(),
      }
    );
  });

  test.afterAll(async () => {
    // Admin DELETE archives the throwaway restaurant (never a hard delete).
    if (intruderRestaurantId && !intruderIsEnvOwner2)
      await deleteTestRestaurant(adminToken, intruderRestaurantId).catch(
        () => {}
      );
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Orders API");
    await allure.label("severity", "critical");
  });

  test("TC-226: the anonymous all-orders dump GET /api/order/now is gone @smoke", async () => {
    await allure.description(
      "Before RestauNax #621 this route had no auth middleware and returned every order on the " +
        "platform (~170 MB of PII on QA). The route is now DELETED: 'now' falls through to the " +
        "public GET /api/order/:orderId matcher and is treated as an order id, so Express answers " +
        "404 ORDER_NOT_FOUND (pinned live on QA 2026-08-19). Anything in the 401/404 family is " +
        "acceptable; a 200 with a body is the regression this test exists to catch."
    );
    const anon = await getOrdersNowRaw();
    await allure.parameter("anonymous status", String(anon.status));
    expect(anon.status).not.toBe(200);
    // Pin the current behaviour: 404 ORDER_NOT_FOUND from the :orderId matcher.
    expect([401, 403, 404]).toContain(anon.status);
    expect(anon.status).toBe(404);
    expect((anon.data as { errorCode?: string })?.errorCode).toBe(
      "ORDER_NOT_FOUND"
    );

    // Deleted means deleted — a valid owner token doesn't resurrect it.
    const authed = await getOrdersNowRaw(ownerToken);
    expect(authed.status).toBe(404);
  });

  test("TC-227: another owner cannot read a restaurant's order list, stats or order detail", async () => {
    await allure.description(
      "The intruder (a real OWNER with VIEW_RESTAURANT, owning a different restaurant) hits the " +
        "statistics READ routes with the seed restaurant's id / order id → 403 on every one " +
        "(RestauNax #621; before it, the routes checked only the permission and leaked customer " +
        "PII cross-tenant). Positive controls: the seed owner gets 200 on the same URLs, and the " +
        "intruder gets 200 on their OWN restaurant. Unknown order ids are 404 — the lookup runs " +
        "before the ownership check, so ids can't be probed for existence via the 403. The " +
        "receipt route is pinned separately (TC-227b)."
    );
    // Cross-tenant reads → 403.
    const list = await listOrdersRaw(intruderToken, seedRestaurantId, {
      search: surname,
    });
    await allure.parameter("intruder list status", String(list.status));
    expect(list.status).toBe(403);

    const stats = await getOrderStatsRaw(intruderToken, seedRestaurantId);
    expect(stats.status).toBe(403);

    const detail = await getOrderDetailRaw(intruderToken, seeded.id);
    expect(detail.status).toBe(403);

    // Unknown order → 404 first, even cross-tenant.
    const ghost = unknownOrderId(seeded.id);
    expect((await getOrderDetailRaw(intruderToken, ghost)).status).toBe(404);

    // Positive controls — the fix must not have broken legitimate access.
    const own = await listOrdersRaw(ownerToken, seedRestaurantId, {
      search: surname,
    });
    expect(own.status).toBe(200);
    expect(own.data.orders.map((o) => o.id)).toContain(seeded.id);
    expect((await getOrderStatsRaw(ownerToken, seedRestaurantId)).status).toBe(
      200
    );
    expect((await getOrderDetailRaw(ownerToken, seeded.id)).status).toBe(200);
    if (intruderRestaurantId) {
      const intruderOwn = await listOrdersRaw(
        intruderToken,
        intruderRestaurantId
      );
      expect(intruderOwn.status).toBe(200);
    }
  });

  test("TC-227b: the receipt route enforces ownership (was a 500 for everyone)", async () => {
    await allure.description(
      "GET /api/order/statistics/:orderId/receipt. History: this route 500'd for EVERY " +
        "caller (invalid Restaurant.street select thrown before the #621 tenant check — " +
        "found 2026-08-19 while implementing these pins, fixed in RestauNax #622). Now: " +
        "intruder → 403, unknown order → 404, owner → 200 with the order payload."
    );
    const intruder = await getOrderReceiptRaw(intruderToken, seeded.id);
    await allure.parameter("intruder status", String(intruder.status));
    expect(intruder.status).toBe(403);
    expect(intruder.data).not.toHaveProperty("order");

    const unknown = await getOrderReceiptRaw(
      ownerToken,
      "00000000-0000-4000-8000-000000000000"
    );
    expect(unknown.status).toBe(404);

    const owner = await getOrderReceiptRaw(ownerToken, seeded.id);
    expect(owner.status).toBe(200);
    expect(owner.data).toHaveProperty("order");
  });

  test("TC-228: another owner cannot export a restaurant's orders", async () => {
    await allure.description(
      "POST /api/order/statistics/export/:restaurantId with the seed restaurant's id and an " +
        "intruder token → 403 (RestauNax #621; before it, any VIEW_RESTAURANT holder could " +
        "export another restaurant's full order history incl. customer email/phone as CSV). " +
        "Positive control: the seed owner exporting the same search → 200 CSV containing the " +
        "seeded receipt number."
    );
    const res = await exportOrdersRaw(intruderToken, seedRestaurantId, {
      exportType: "all",
      search: surname,
    });
    await allure.parameter("intruder export status", String(res.status));
    expect(res.status).toBe(403);

    const own = await exportOrdersRaw(ownerToken, seedRestaurantId, {
      exportType: "current",
      search: surname,
    });
    expect(own.status).toBe(200);
    expect(typeof own.data).toBe("string");
    expect(own.data as string).toContain(seeded.receiptNumber);
  });

  test("TC-229: mutating order endpoints keep enforcing ownership (positive control)", async () => {
    await allure.description(
      "Status update (both PUT variants), cancel and refund already called " +
        "assertControlsOrderRestaurant before #621 — they were the positive controls in the " +
        "original finding. Pin them too: an intruder gets 403 on every mutating path and the " +
        "order is left untouched (still CONFIRMED for the real owner)."
    );
    const viaOrder = await updateOrderStatusRaw(
      intruderToken,
      seeded.id,
      "PREPARING",
      "order"
    );
    expect(viaOrder.status).toBe(403);
    const viaStats = await updateOrderStatusRaw(
      intruderToken,
      seeded.id,
      "PREPARING",
      "statistics"
    );
    expect(viaStats.status).toBe(403);

    const cancel = await cancelOrderRaw(intruderToken, seeded.id, {
      reason: `AUTO ${runId} intruder`,
    });
    expect(cancel.status).toBe(403);

    const refund = await refundOrderRaw(intruderToken, seeded.id, {
      reason: `AUTO ${runId} intruder`,
    });
    expect(refund.status).toBe(403);

    // The order is untouched.
    const detail = await getOrderDetailRaw(ownerToken, seeded.id);
    expect(detail.status).toBe(200);
    expect((detail.data as { status?: string }).status).toBe("CONFIRMED");
  });

  test("TC-230: every order-statistics route rejects a missing bearer token with 401", async () => {
    await allure.description(
      "All /api/order/statistics/* routes sit behind requireAuth — with no Authorization header " +
        "every read AND mutating route answers 401 before touching any data."
    );
    const anon = ""; // apiHelper sends no Authorization header for a falsy token
    const results: Array<[string, number]> = [
      ["management", (await listOrdersRaw(anon, seedRestaurantId)).status],
      ["stats", (await getOrderStatsRaw(anon, seedRestaurantId)).status],
      [
        "export",
        (
          await exportOrdersRaw(anon, seedRestaurantId, {
            exportType: "current",
          })
        ).status,
      ],
      ["detail", (await getOrderDetailRaw(undefined, seeded.id)).status],
      ["receipt", (await getOrderReceiptRaw(undefined, seeded.id)).status],
      [
        "status",
        (await updateOrderStatusRaw(anon, seeded.id, "PREPARING", "statistics"))
          .status,
      ],
      ["cancel", (await cancelOrderRaw(anon, seeded.id)).status],
      ["refund", (await refundOrderRaw(anon, seeded.id)).status],
    ];
    for (const [route, status] of results) {
      await allure.parameter(route, String(status));
      expect(status, route).toBe(401);
    }
  });
});
