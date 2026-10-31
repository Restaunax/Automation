/**
 * 18-table-qr-on-pos.spec.ts — a guest orders from a table's QR card and the
 * register sees it for that table, without the table being taken
 * (docs/COVERAGE_MAP.md G18) (TC-1090..1093).
 *
 * The guest's browser path (banner, dine-in checkout, a retired card) is
 * tests/table-qr/tableQrOrdering.spec.ts. This is what happens after: the
 * order as the restaurant and the POS see it. Per docs/features/
 * TABLE_QR_ORDERING.md a card order is PREPAID, like any online order: it
 * carries the table, but it never opens a check or makes the table read
 * taken, and a server can still seat the table.
 *
 * A per-run throwaway restaurant (table service, 7% tax, Stripe TEST,
 * published) with floor tables T4 and T5, a numbered card "T4" linked to T4
 * and a blank card on T5; a REGISTER device with the owner signed in. Orders
 * are placed the way the ordering site does, with the card's code, and paid
 * with a Stripe test card.
 *
 *   TC-1090 An order from T4's card is a paid DINE_IN / TABLE_QR order for
 *           table T4 (its table id and label).
 *   TC-1091 The register finds it by the guest's name, marked Table QR, for
 *           T4.
 *   TC-1092 T4 isn't taken by it: the floor shows no check on T4, and a
 *           server can still open a check there.
 *   TC-1093 A blank card on T5 sends its order to T5, by the table's name.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  createTableOwnerRaw,
  createTabletDevice,
  createTabletOrderRaw,
  deactivateTabletDevice,
  deleteTestRestaurant,
  ensureBusinessHours,
  ensureOrderingSlug,
  ensureTaxRate,
  getOrderFullRaw,
  getTabletTablesRaw,
  setOwnerPosPin,
  setRestaurantPublishedApi,
  stripeConfigRaw,
  stripeTestOnboardingRaw,
  tabletLogin,
  tabletRaw,
  tabletStaffSignIn,
  updateRestaurantSettingsApi,
  type LooseJson,
} from "../../utils/apiHelper";
import { placePaidOnlineOrder } from "../../utils/comboFoodSurfaces";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;

test.describe.configure({ mode: "serial" });

test.describe("Table QR orders on the POS (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tablet = "";
  let ownerSession = "";
  let pk = "";
  let burgerId = "";
  const tables = { t4: "", t5: "" };
  const codes = { t4: "", blank: "" };
  let t4OrderId = "";
  const guestLast = `Tableqr${runId}`;

  /** The code in a card's link (`…?table=<code>`). */
  const codeOf = (card: Rec) =>
    new URL(String(card.url)).searchParams.get("table") ?? "";
  /** A burger ordered and paid from a table card, as the ordering site does. */
  const orderFromCard = (tableCardCode: string, firstName: string) =>
    placePaidOnlineOrder(pk, restaurantId, {
      orderType: "DINE_IN",
      orderSource: "TABLE_QR",
      tableCardCode,
      subtotal: 12,
      tax: 0.84,
      tip: 0,
      deliveryFee: 0,
      total: 12.84,
      customerEmail: `auto-${firstName.toLowerCase()}-${runId}@restaunax-test.com`,
      customerPhone: "5555550123",
      firstName,
      lastName: guestLast,
      orderItems: [
        {
          menuItemId: burgerId,
          menuItemName: "Burger",
          quantity: 1,
          price: 12,
        },
      ],
    });

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[table-qr-pos] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    await ensureTaxRate(ownerToken, restaurantId, 7);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await ensureBusinessHours(ownerToken, restaurantId);
    const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
    if (onboard.status !== 200)
      throw new Error(`[table-qr-pos] stripe: ${JSON.stringify(onboard.data)}`);
    pk = String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
    await ensureOrderingSlug(
      adminToken,
      "restaurant",
      restaurantId,
      `auto-tqr-${runId}`
    );
    const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
      restaurantId,
    });
    burgerId = (await createMenuItemFull(ownerToken, food.id, "Burger", 12)).id;

    for (const [key, name] of [
      ["t4", "T4"],
      ["t5", "T5"],
    ] as const) {
      const t = await createTableOwnerRaw(ownerToken, restaurantId, {
        name,
        capacity: 4,
      });
      if (t.status !== 201)
        throw new Error(`[table-qr-pos] table: ${JSON.stringify(t.data)}`);
      tables[key] = String(((t.data.data ?? t.data) as Rec).id);
    }
    const cards = await apiRequestRaw<{ data?: Rec[] }>(
      "POST",
      `/restaurant/${restaurantId}/table-qr-cards`,
      {
        numbered: [{ label: "T4", tableId: tables.t4 }],
        blankForTableIds: [tables.t5],
      },
      ownerToken
    );
    const made = cards.data.data ?? [];
    if (!cards.ok || made.length !== 2)
      throw new Error(`[table-qr-pos] cards: ${JSON.stringify(cards.data)}`);
    const numbered = made.find((c) => c.label === "T4");
    const blank = made.find((c) => !c.label);
    if (!numbered || !blank)
      throw new Error(`[table-qr-pos] cards: ${JSON.stringify(made)}`);
    codes.t4 = codeOf(numbered);
    codes.blank = codeOf(blank);

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-tqr-${runId}`
    );
    deviceId = device.id;
    tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(ownerToken, restaurantId, "8462");
    ownerSession = await tabletStaffSignIn(tablet, ownerMember, "8462");
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
          () => {}
        );
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Table QR ordering — POS");
    await allure.label("severity", "critical");
  });

  test("TC-1090: an order from T4's card is a paid dine-in Table QR order for T4", async () => {
    const placed = await orderFromCard(codes.t4, "Tara");
    t4OrderId = placed.id;
    const r = await getOrderFullRaw(ownerToken, t4OrderId);
    expect(r.ok, JSON.stringify(r.data)).toBe(true);
    expect(r.data).toMatchObject({
      orderType: "DINE_IN",
      orderSource: "TABLE_QR",
      tableId: tables.t4,
      tableNumber: "T4",
      tabOpenedAt: null,
    });
    // Paid: Stripe's confirmation lands a moment after the card is charged.
    await expect
      .poll(
        async () =>
          (await getOrderFullRaw(ownerToken, t4OrderId)).data.paymentStatus,
        { timeout: 30_000 }
      )
      .toBe("COMPLETED");
  });

  test("TC-1091: the register finds it by the guest's name, marked Table QR, for T4", async () => {
    const found = await tabletRaw<{ data?: Rec[] }>(
      tablet,
      "GET",
      `/orders/search?q=${encodeURIComponent(guestLast)}`,
      undefined,
      ownerSession
    );
    expect(found.status, JSON.stringify(found.data)).toBe(200);
    const row = (found.data.data ?? []).find((o) => o.id === t4OrderId);
    expect(row, JSON.stringify(found.data)).toBeTruthy();
    expect(row).toMatchObject({ orderSource: "TABLE_QR", tableNumber: "T4" });
  });

  test("TC-1092: T4 isn't taken by it — no check on the floor, and a server can still seat it", async () => {
    const floor = await getTabletTablesRaw(tablet);
    expect(floor.status, JSON.stringify(floor.data)).toBe(200);
    const t4 = (floor.data.tables ?? []).find((t) => t.name === "T4");
    expect(t4, JSON.stringify(floor.data)).toBeTruthy();
    expect(t4?.openChecks ?? []).toHaveLength(0);

    const seated = await createTabletOrderRaw(tablet, ownerSession, {
      restaurantId,
      orderType: "DINE_IN",
      subtotal: 12,
      tax: 0.84,
      tip: 0,
      total: 12.84,
      customerPhone: "",
      orderItems: [
        {
          menuItemId: burgerId,
          menuItemName: "Burger",
          quantity: 1,
          price: 12,
        },
      ],
      openCheck: true,
      tableId: tables.t4,
      guestCount: 2,
    });
    expect(seated.status, JSON.stringify(seated.data)).toBe(201);
    const after = await getTabletTablesRaw(tablet);
    const t4After = (after.data.tables ?? []).find((t) => t.name === "T4");
    // The one check on T4 is the server's, not the guest's prepaid order.
    expect((t4After?.openChecks ?? []).map((c) => c.orderId)).toEqual([
      String(seated.data.id),
    ]);
  });

  test("TC-1093: a blank card on T5 sends its order to T5, by the table's name", async () => {
    const placed = await orderFromCard(codes.blank, "Bea");
    const r = await getOrderFullRaw(ownerToken, placed.id);
    expect(r.ok, JSON.stringify(r.data)).toBe(true);
    expect(r.data).toMatchObject({
      orderType: "DINE_IN",
      orderSource: "TABLE_QR",
      tableId: tables.t5,
      tableNumber: "T5",
    });
  });
});
