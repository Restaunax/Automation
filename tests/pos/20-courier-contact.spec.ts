/**
 * 20-courier-contact.spec.ts — who may see a courier's contact, and who may
 * replace a courier (API level).
 *
 * restaunax docs/features/UBER_DIRECT.md → "Reaching a courier". Staff get a
 * masked number plus a PIN and an "If you need to call Uber" block. A customer
 * must never get either, on any view of the order. `replace-courier` costs the
 * restaurant money, so only that restaurant's own staff device may call it.
 *
 * Own tenants: two per-run throwaway restaurants (createSecondOwner), so the
 * cross-tenant cases never touch shared QA data.
 *
 * A Delivery row only exists after a real Uber dispatch, which this suite does
 * not do, and a customer view of an order with no courier proves little. So the
 * customer check has two modes:
 *   - COURIER_SEED_DATABASE_URL set (a LOCAL backend's database only; anything
 *     but localhost is refused): the spec writes a Delivery row holding a PIN,
 *     and first proves the owner's payload does carry it. This is the real test.
 *   - unset (QA): the scan runs on an order with no courier and is annotated as
 *     shape-only. Robo Courier on QA is what covers the live path.
 * The replace-courier cases need no courier: each refusal happens before Uber.
 *
 * Run alone: `npx playwright test --project=pos --grep @courier-contact`.
 */

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId, generateSeedPhone } from "../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  createSeededOrder,
  createTabletDevice,
  deactivateTabletDevice,
  deleteTestRestaurant,
  ensureBusinessHours,
  ensureTaxRate,
  getOrderByIdRaw,
  setRestaurantPublishedApi,
  tabletLogin,
  updateDeviceModeOwnerRaw,
  updateRestaurantSettingsApi,
  type SeededOrder,
  type TabletDevice,
} from "../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const SEED_DB_URL = process.env.COURIER_SEED_DATABASE_URL ?? "";
/** ENABLE_SMS is off outside production: any phone verifies with this OTP. */
const QA_OTP = "123456";

const COURIER_PIN = "73914260";
const COURIER_CONTACT_PHONE = "+18005550142";
const UBER_SUPPORT_EMAIL = "uberdirect@uber.com";

interface Tenant {
  ownerToken: string;
  restaurantId: string;
  order: SeededOrder;
  device: TabletDevice;
  tabletToken: string;
}

interface OrderPayload {
  id?: string;
  viewToken?: string | null;
  delivery?: Record<string, unknown> | null;
}

const replaceCourierRaw = (
  tabletToken: string,
  restaurantId: string,
  orderId: string
) =>
  apiRequestRaw<{ code?: string }>(
    "POST",
    `/api/delivery/restaurants/${restaurantId}/orders/${orderId}/replace-courier`,
    {},
    tabletToken
  );

/** The courier fields of a Delivery row, at the status that shows them. */
function seedCourierRow(order: SeededOrder, restaurantId: string): void {
  const url = new URL(SEED_DB_URL);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("COURIER_SEED_DATABASE_URL must be a local database");
  }
  const uberId = `del_auto_${randomUUID()}`;
  // Far from late: nothing here may ever reach Uber.
  execFileSync("psql", [
    SEED_DB_URL,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `INSERT INTO "Delivery" (
       id, "orderId", "restaurantId", service, "externalDeliveryId",
       "uberDeliveryId", status, "driverName", "driverPhone",
       "driverContactPhone", "driverContactPin", "trackingUrl",
       "pickupReadyAt", "lateBaselineAt", "updatedAt"
     ) VALUES (
       '${randomUUID()}', '${order.id}', '${restaurantId}', 'UBER', '${uberId}',
       '${uberId}', 'DRIVER_ASSIGNED', 'Auto Courier', '+18005550199',
       '${COURIER_CONTACT_PHONE}', '${COURIER_PIN}',
       'https://www.ubereats.com/orders/auto-${uberId}',
       NOW() + INTERVAL '1 hour', NOW() + INTERVAL '1 hour', NOW()
     )`,
  ]);
}

/** Nothing a customer can read may hold the PIN or the staff help block. */
function expectNoStaffCourierData(label: string, payload: unknown): void {
  const text = JSON.stringify(payload);
  expect(text, `${label}: driverContactPin key`).not.toContain(
    "driverContactPin"
  );
  expect(text, `${label}: driverContactPhone key`).not.toContain(
    "driverContactPhone"
  );
  expect(text, `${label}: PIN value`).not.toContain(COURIER_PIN);
  expect(text, `${label}: contact number`).not.toContain(COURIER_CONTACT_PHONE);
  expect(text, `${label}: Uber support email`).not.toContain(
    UBER_SUPPORT_EMAIL
  );
}

test.describe("Courier contact and replace-courier @courier-contact", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set"
  );

  const runId = generateRunId();
  const customerPhone = generateSeedPhone();
  let adminToken = "";
  let a: Tenant;
  let b: Tenant;

  const makeTenant = async (suffix: string): Promise<Tenant> => {
    const owner = await createSecondOwner(adminToken, `${runId}${suffix}`, {
      alwaysFresh: true,
    });
    if (!owner.restaurantId) throw new Error("no throwaway restaurant");
    const restaurantId = owner.restaurantId;
    await updateRestaurantSettingsApi(owner.accessToken, restaurantId, {
      acceptingOrders: true,
    });
    await ensureTaxRate(owner.accessToken, restaurantId, 0);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await ensureBusinessHours(owner.accessToken, restaurantId);
    const group = await createMenuGroupNamed(
      owner.accessToken,
      `AUTO Courier ${runId}${suffix}`,
      { restaurantId }
    );
    const item = await createMenuItemFull(
      owner.accessToken,
      group.id,
      `Courier Burger ${runId}`,
      10
    );
    const order = await createSeededOrder(
      owner.accessToken,
      restaurantId,
      { menuItemId: item.id, name: item.name, price: 10 },
      {
        orderType: "DELIVERY",
        customerPhone,
        deliveryAddress: {
          street: "100 Courier Way",
          city: "Miami",
          state: "FL",
          zipCode: "33101",
        },
      }
    );
    // An ADMIN-created device defaults to REGISTER: a staff device, so a 403
    // below is the tenant check and never the kiosk one.
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Auto Courier ${runId}${suffix}`
    );
    const tabletToken = await tabletLogin(device.name, device.code);
    return {
      ownerToken: owner.accessToken,
      restaurantId,
      order,
      device,
      tabletToken,
    };
  };

  test.beforeAll(async () => {
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    a = await makeTenant("a");
    b = await makeTenant("b");
    if (SEED_DB_URL) seedCourierRow(a.order, a.restaurantId);
  });

  test.afterAll(async () => {
    for (const tenant of [a, b]) {
      if (!tenant) continue;
      await deactivateTabletDevice(
        adminToken,
        tenant.restaurantId,
        tenant.device.id
      );
      await deleteTestRestaurant(adminToken, tenant.restaurantId);
    }
  });

  test(
    "TC-1804: a customer's views of a delivery order hold no courier PIN, contact number or Uber help block",
    { tag: ["@pos"] },
    async () => {
      await allure.severity("critical");
      test.info().annotations.push({
        type: "mode",
        description: SEED_DB_URL
          ? "seeded courier row: real check"
          : "no courier row: shape-only, see the file header",
      });

      const owner = await apiRequestRaw<OrderPayload>(
        "GET",
        `/api/order/statistics/${a.order.id}`,
        undefined,
        a.ownerToken
      );
      expect(owner.status, JSON.stringify(owner.data)).toBe(200);
      if (SEED_DB_URL) {
        await allure.step("Control: the owner's payload does hold it", () => {
          const delivery = owner.data.delivery;
          expect(delivery?.driverContactPin).toBe(COURIER_PIN);
          expect(delivery?.driverContactPhone).toBe(COURIER_CONTACT_PHONE);
          expect(delivery?.support).toMatchObject({
            email: UBER_SUPPORT_EMAIL,
          });
        });
      }

      await allure.step("Anyone holding the order id", async () => {
        const res = await getOrderByIdRaw(undefined, a.order.id);
        expect(res.status).toBe(200);
        expectNoStaffCourierData("bare id", res.data);
      });

      const viewToken = (a.order as OrderPayload).viewToken;
      expect(viewToken, "order creation returns a view token").toBeTruthy();
      await allure.step("Receipt holder, who gets the courier", async () => {
        const res = await apiRequestRaw<OrderPayload>(
          "GET",
          `/api/order/${a.order.id}?token=${viewToken}`
        );
        expect(res.status).toBe(200);
        expectNoStaffCourierData("receipt holder", res.data);
        if (SEED_DB_URL) {
          // The row did reach this view, so the scan above read a real courier.
          expect(res.data.delivery?.driverName).toBe("Auto Courier");
          expect(res.data.delivery?.canContactCourier).toBe(true);
        }
      });

      await allure.step("Signed-in customer of the ordering app", async () => {
        const send = await apiRequestRaw("POST", "/login/mobile/send-otp", {
          phone: customerPhone,
          restaurantId: a.restaurantId,
        });
        expect(send.status, JSON.stringify(send.data)).toBe(200);
        const verify = await apiRequestRaw<{ token?: string }>(
          "POST",
          "/login/mobile/verify-otp",
          { phone: customerPhone, otp: QA_OTP, restaurantId: a.restaurantId }
        );
        expect(verify.status, JSON.stringify(verify.data)).toBe(200);
        const token = verify.data.token;
        expect(token).toBeTruthy();

        const detail = await getOrderByIdRaw(token, a.order.id);
        expect(detail.status).toBe(200);
        expectNoStaffCourierData("mobile detail", detail.data);
        if (SEED_DB_URL) {
          expect(
            (detail.data as OrderPayload).delivery?.driverName,
            "this customer's view holds the courier"
          ).toBe("Auto Courier");
        }

        const history = await apiRequestRaw<{ orders: OrderPayload[] }>(
          "GET",
          "/api/mobile/customer/orders",
          undefined,
          token
        );
        expect(history.status).toBe(200);
        expect(history.data.orders.map((o) => o.id)).toContain(a.order.id);
        expectNoStaffCourierData("mobile history", history.data);
      });
    }
  );

  test(
    "TC-1805: replace-courier refuses another restaurant's tablet with 403",
    { tag: ["@pos"] },
    async () => {
      await allure.severity("critical");
      await allure.step(
        "Tablet A names restaurant B and its order",
        async () => {
          const res = await replaceCourierRaw(
            a.tabletToken,
            b.restaurantId,
            b.order.id
          );
          expect(res.status, JSON.stringify(res.data)).toBe(403);
        }
      );
      await allure.step("Tablet A names itself and B's order", async () => {
        const res = await replaceCourierRaw(
          a.tabletToken,
          a.restaurantId,
          b.order.id
        );
        expect(res.status, JSON.stringify(res.data)).toBe(403);
      });
    }
  );

  test(
    "TC-1806: replace-courier refuses a kiosk on its own restaurant with 403; a staff device gets a plain refusal when there is no late courier",
    { tag: ["@pos"] },
    async () => {
      await allure.severity("critical");
      await allure.step(
        "Staff device: reaches the rule, not the 403",
        async () => {
          const res = await replaceCourierRaw(
            a.tabletToken,
            a.restaurantId,
            a.order.id
          );
          expect(res.status, JSON.stringify(res.data)).toBe(409);
          expect(res.data.code).toBe("NOT_ELIGIBLE");
        }
      );
      await allure.step("Kiosk: refused", async () => {
        const mode = await updateDeviceModeOwnerRaw(
          adminToken,
          a.restaurantId,
          a.device.id,
          "KIOSK"
        );
        expect(mode.status, JSON.stringify(mode.data)).toBeLessThan(300);
        const res = await replaceCourierRaw(
          a.tabletToken,
          a.restaurantId,
          a.order.id
        );
        expect(res.status, JSON.stringify(res.data)).toBe(403);
      });
    }
  );
});
