/**
 * 01-order-lifecycle.spec.ts — Device In Store (POS), API level.
 *
 * Closes the biggest business-loop gap: the customer-ordering suite proves an
 * order can be PLACED (TC-26), but nothing proved the restaurant RECEIVES and
 * PROCESSES it. This drives that second half at the API level (the POS is a
 * React Native app — see tests/pos/README.md), using the same backend the
 * device talks to.
 *
 * Auth notes: order status + current-orders are staff/POS-only (guarded by
 * requireTabletOrPermission after the 2026-07-06 backend fix). This test logs
 * in the provisioned tablet and passes that JWT, mirroring a real POS session.
 * Tablet-initiated CANCEL additionally needs an X-Staff-Session (staff sign-in)
 * and is tracked as a follow-up: https://github.com/Restaunax/Automation/issues/15
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import {
  apiLogin,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  createSeededOrder,
  getCurrentOrders,
  updateOrderStatus,
  type TabletDevice,
} from "../../utils/apiHelper";
import { readSharedState, generateRunId } from "../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("POS — Order Lifecycle", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  let ownerToken = "";
  let restaurantId = "";
  let device: TabletDevice | undefined;

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    ownerToken = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    ({ restaurantId } = readSharedState());
    // Device names are globally unique — use a run-unique name.
    device = await createTabletDevice(
      ownerToken,
      restaurantId,
      `Automation POS ${generateRunId()}`
    );
  });

  test.afterAll(async () => {
    // No device-delete API — deactivate so the name is freed for reuse.
    if (ownerToken && restaurantId && device) {
      await deactivateTabletDevice(ownerToken, restaurantId, device.id);
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS Order Lifecycle");
    await allure.label("severity", "critical");
  });

  test("TC-100: a placed order is received on the POS and driven through the full lifecycle", async () => {
    await allure.description(
      "A customer order (seeded via the public order API at its real menu " +
        "price, bumped to PENDING — no Stripe) appears in the restaurant's " +
        "live current-orders feed, and can be driven PENDING → CONFIRMED → " +
        "PREPARING → READY → PICKED_UP with each transition confirmed at the " +
        "API source of truth."
    );

    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();

    const tabletToken = await allure.step("Tablet logs in", async () => {
      // The device code is returned only at creation (beforeAll).
      const token = await tabletLogin(device!.name, device!.code);
      expect(token).toBeTruthy();
      return token;
    });
    expect(tabletToken).toBeTruthy();

    const order = await allure.step("Customer places an order", async () => {
      // The pricing guard requires the real DB price (total:0 is rejected), so
      // a nonzero order is created INITIALIZED and bumped to PENDING — the
      // same state a just-paid customer order lands in.
      const placed = await createSeededOrder(
        ownerToken,
        restaurantId,
        { menuItemId, name: menuItemName, price: menuItemPrice },
        { status: "PENDING" }
      );
      expect(placed.status).toBe("PENDING");
      await allure.parameter("orderId", placed.id);
      return placed;
    });

    await allure.step(
      "Restaurant receives it in the live orders feed",
      async () => {
        const current = await getCurrentOrders(tabletToken, restaurantId);
        expect(
          current.some((o) => o.id === order.id),
          "seeded order should appear in GET .../orders/current"
        ).toBe(true);
      }
    );

    // Free-form transitions, but assert the realistic kitchen progression.
    for (const status of [
      "CONFIRMED",
      "PREPARING",
      "READY",
      "PICKED_UP",
    ] as const) {
      await allure.step(`Advance to ${status}`, async () => {
        const updated = await updateOrderStatus(tabletToken, order.id, status);
        expect(updated.status).toBe(status);
      });
    }

    await allure.step(
      "Completed order is still on today's feed at its final status",
      async () => {
        // The current-orders feed excludes only INITIALIZED/CANCELLED/REFUNDED,
        // so a same-day PICKED_UP order stays visible — the fulfilled state is
        // what the kitchen/owner sees. Confirm it's there and terminal.
        const current = await getCurrentOrders(tabletToken, restaurantId);
        const found = current.find((o) => o.id === order.id);
        expect(found?.status).toBe("PICKED_UP");
      }
    );
  });

  // Regression guard for the 2026-07-06 backend auth fix (requireTabletOr
  // Permission on order status + current-orders). Kept as fixme until the fix
  // is deployed to QA — asserting a 401 now would fail against the still-open
  // endpoints. Flip to a real test once the backend PR lands on QA.
  // Tracking: https://github.com/Restaunax/Automation/issues/17
  test.fixme("TC-101: current-orders + status reject an unauthenticated caller", async () => {
    // const noAuth = await getCurrentOrdersRaw(restaurantId); // no token
    // expect(noAuth.status).toBe(401);
  });
});
