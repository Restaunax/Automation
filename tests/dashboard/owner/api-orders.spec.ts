/**
 * api-orders.spec.ts — Owner order-management API contract (Layer 1).
 *
 * No browser. Hits /api/order/statistics/* and /api/order/orderId/:id/status
 * with an owner JWT and asserts status codes, bodies and business rules the
 * Orders tab depends on. These are the checks that survive a UI redesign and
 * catch a controller refactor.
 *
 * Deliberately NOT here (deferred by decision 2026-08-15, see
 * docs/ORDERS_TAB_TEST_STRATEGY.md §1 / §4-P0): auth / tenant-isolation pins
 * (TC-226..230). Add them once the backend side is settled.
 *
 * Own data: every test seeds its own order(s) via createSeededOrder (no
 * Stripe). Seeded orders are permanent QA residue — assert on our rows only.
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
  createSeededOrder,
  listOrders,
  listOrdersRaw,
  updateOrderStatusRaw,
  cancelOrderRaw,
  refundOrderRaw,
  exportOrdersRaw,
  type SeededOrder,
} from "../../../utils/apiHelper";
import { parseCsv } from "../../../utils/csvHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

const errorMessage = (body: unknown): string => {
  if (body && typeof body === "object" && "message" in body)
    return String((body as { message: unknown }).message);
  return typeof body === "string" ? body : JSON.stringify(body);
};

test.describe("Owner — Orders API contract", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  const runId = generateRunId();
  const surname = generateSeedSurname(runId);
  let token = "";
  let restaurantId = "";
  let seeded: SeededOrder; // PICKUP CONFIRMED, unpaid
  let initialized: SeededOrder; // never bumped — stays INITIALIZED
  const initEmailLocal = `orders_api_${runId}_init`;

  const seedItem = () => {
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    return { menuItemId, name: menuItemName, price: menuItemPrice };
  };
  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    ({ restaurantId } = readSharedState());
    token = await freshToken();
    seeded = await createSeededOrder(token, restaurantId, seedItem(), {
      status: "CONFIRMED",
      lastName: surname,
      customerPhone: generateSeedPhone(),
    });
    initialized = await createSeededOrder(token, restaurantId, seedItem(), {
      status: null,
      lastName: surname,
      customerEmail: `${initEmailLocal}@restaunax-test.com`,
      customerPhone: generateSeedPhone(),
    });
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Orders API");
    await allure.label("severity", "normal");
    // Access tokens live 15 min; the file is short but re-login is cheap.
    token = await freshToken();
  });

  test("TC-255: an unknown status value is rejected by both status endpoints @smoke", async () => {
    await allure.description(
      "PUT /api/order/orderId/:id/status and PUT /api/order/statistics/:id/status validate the " +
        "status against a 9-value allowlist (PENDING…REFUNDED). A bogus value is a 400 'Invalid order " +
        "status' and the order is left untouched. INITIALIZED and SHIPPED exist in the enum but are " +
        "deliberately not accepted here either."
    );
    for (const via of ["order", "statistics"] as const) {
      const res = await updateOrderStatusRaw(token, seeded.id, "BOGUS", via);
      await allure.parameter(`${via} status`, String(res.status));
      expect(res.status, via).toBe(400);
      expect(errorMessage(res.data)).toMatch(/invalid order status/i);
    }
    const initRes = await updateOrderStatusRaw(token, seeded.id, "INITIALIZED");
    expect(initRes.status).toBe(400);

    const list = await listOrders(token, restaurantId, {
      search: seeded.receiptNumber,
    });
    expect(list.orders.find((o) => o.id === seeded.id)?.status).toBe(
      "CONFIRMED"
    );
  });

  test("TC-256: cancelling an already-cancelled order is rejected", async () => {
    await allure.description(
      "PUT /api/order/statistics/cancel/:id on a live unpaid order → 200 {action:'CANCELLED'}; the " +
        "same call again → 400 'already been cancelled'. Prevents double-cancel from a stale sheet."
    );
    const order = await createSeededOrder(token, restaurantId, seedItem(), {
      status: "CONFIRMED",
      lastName: surname,
      customerPhone: generateSeedPhone(),
    });
    const first = await cancelOrderRaw(token, order.id, {
      reason: `AUTO ${runId} api cancel`,
    });
    expect(first.status).toBe(200);
    expect(first.data.success).toBe(true);
    expect(first.data.action).toBe("CANCELLED");

    const second = await cancelOrderRaw(token, order.id, {
      reason: "again",
    });
    await allure.parameter("second status", String(second.status));
    expect(second.status).toBe(400);
    expect(errorMessage(second.data)).toMatch(/already been/i);
  });

  test("TC-257: refunding an unpaid order is rejected", async () => {
    await allure.description(
      "POST /api/order/statistics/refund/:id requires paymentStatus COMPLETED. A seeded (unpaid) " +
        "order → 400 'Only completed payments can be refunded' — no Stripe call is attempted."
    );
    const res = await refundOrderRaw(token, seeded.id, {
      reason: `AUTO ${runId}`,
    });
    await allure.parameter("status", String(res.status));
    expect(res.status).toBe(400);
    expect(errorMessage(res.data)).toMatch(/only completed payments/i);
  });

  test("TC-258: INITIALIZED (pre-payment) orders are excluded from the owner list unless asked for explicitly", async () => {
    await allure.description(
      "GET /api/order/statistics/management/:id hides INITIALIZED placeholders by default (a search that " +
        "can only match the un-bumped seed returns nothing). Passing status=INITIALIZED explicitly DOES " +
        "return it — pinned as current behaviour pending a product decision on whether owners should " +
        "ever see placeholders."
    );
    const hidden = await listOrders(token, restaurantId, {
      search: initEmailLocal,
    });
    expect(hidden.totalCount).toBe(0);
    expect(hidden.orders).toEqual([]);

    const explicit = await listOrders(token, restaurantId, {
      search: initEmailLocal,
      status: "INITIALIZED",
    });
    expect(explicit.orders.map((o) => o.id)).toEqual([initialized.id]);
    expect(explicit.orders[0]?.status).toBe("INITIALIZED");
  });

  test("TC-259: [pinned] backwards status moves are currently accepted and clear completedAt", async () => {
    await allure.description(
      "The dashboard is forward-only but the API is not a state machine: DELIVERED → PENDING is a 200 " +
        "today and resets completedAt to null. Pinned on purpose (decision 2026-08-15) so a future " +
        "state-machine change is a conscious one — see the fixme twin below."
    );
    const order = await createSeededOrder(token, restaurantId, seedItem(), {
      status: "PENDING",
      lastName: surname,
      customerPhone: generateSeedPhone(),
    });
    const delivered = await updateOrderStatusRaw(token, order.id, "PICKED_UP");
    expect(delivered.status).toBe(200);
    expect(delivered.data.completedAt).toBeTruthy();

    const back = await updateOrderStatusRaw(token, order.id, "PENDING");
    await allure.parameter("backwards status", String(back.status));
    expect(back.status).toBe(200);
    expect(back.data.status).toBe("PENDING");
    expect(back.data.completedAt).toBeNull();
  });

  test.fixme("TC-259b: [expected once a state machine lands] backwards status moves are rejected with 409", async () => {
    // When the backend validates transitions, flip TC-259 to expect 409
    // (or 400) for PICKED_UP → PENDING and delete this twin.
  });

  test("TC-260: CSV export rejects an empty result set and streams a 32-column CSV otherwise", async () => {
    await allure.description(
      "POST /api/order/statistics/export/:id with a search that matches nothing → 400 'No orders found'. " +
        "With the seed surname → 200 text/csv whose header is the 32 documented columns and whose " +
        "'Order Number' column (the receipt number) includes our seeded order."
    );
    const empty = await exportOrdersRaw(token, restaurantId, {
      exportType: "current",
      search: `nonexistent-${runId}`,
    });
    await allure.parameter("empty status", String(empty.status));
    expect(empty.status).toBe(400);
    expect(errorMessage(empty.data)).toMatch(/no orders found/i);

    const ok = await exportOrdersRaw(token, restaurantId, {
      exportType: "current",
      search: surname,
    });
    expect(ok.status).toBe(200);
    expect(typeof ok.data).toBe("string");
    const rows = parseCsv(ok.data as string);
    expect(rows[0]).toHaveLength(32);
    expect(rows[0]?.[0]).toBe("Order Number");
    expect(rows[0]?.[4]).toBe("Status");
    expect(rows.slice(1).map((r) => r[0])).toContain(seeded.receiptNumber);
  });

  test("TC-261: the management list honours sort direction and page size", async () => {
    await allure.description(
      "sortBy=total&sortDirection=asc returns non-decreasing totals; limit=2 caps the page and " +
        "totalPages = ceil(totalCount / limit). Search-scoped to this file's seeds plus whatever else " +
        "matches, so it stays true regardless of QA residue."
    );
    // Make sure there are ≥3 rows with the surname (seeded + TC-256/259 rows).
    const asc = await listOrders(token, restaurantId, {
      search: surname,
      sortBy: "total",
      sortDirection: "asc",
      limit: 100,
    });
    const totals = asc.orders.map((o) => Number(o.total));
    for (let i = 1; i < totals.length; i++)
      expect(totals[i]!).toBeGreaterThanOrEqual(totals[i - 1]!);

    const paged = await listOrders(token, restaurantId, {
      search: surname,
      limit: 2,
      page: 1,
    });
    expect(paged.orders.length).toBeLessThanOrEqual(2);
    expect(paged.limit).toBe(2);
    expect(paged.totalPages).toBe(Math.ceil(paged.totalCount / 2));

    const raw = await listOrdersRaw(token, restaurantId, { search: surname });
    expect(raw.status).toBe(200);
  });
});
