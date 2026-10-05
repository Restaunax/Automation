/**
 * 10-deals.spec.ts — Deals at the POS (device-in-store), API level.
 *
 * Baseline first coverage of deals on the POS: the in-store deal list is the
 * public /active scoped to ?channel=in_person (DEAL_CHANNELS.md), and a deal
 * rings up on a ticket through POST /api/tablet/create-order, which re-checks
 * the deal's channel (an online-only deal is refused at the counter) and —
 * since deal scheduling (restaunax Plan 1) — its schedule on the restaurant's
 * clock (TC-527).
 *
 * Own tenant: per-run throwaway restaurant (createSecondOwner) — open checks
 * need RestaurantSettings.tableServiceEnabled and the seed restaurant's deal
 * cap is shared. Tickets are OPEN CHECKS (no tender → no register session
 * needed), all cancelled in afterAll. Setup chain mirrors 03-open-checks:
 * settings → menu → ADMIN-created device → tablet login → owner PIN → staff
 * sign-in. Tax is left unset (0) so every total is a clean sum.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import { requireScheduling } from "../../utils/dealScheduleGate";
import {
  dayNameOfKey,
  liveNowWindow,
  localDateKey,
} from "../../utils/dealSchedule";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  createDealApi,
  getRestaurantTimeZonePublic,
  deleteDealApi,
  getActiveDealsPublic,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  updateRestaurantSettingsApi,
  setOwnerPosPin,
  tabletStaffSignIn,
  createTabletOrderRaw,
  cancelTabletOrderRaw,
  getOrderFullRaw,
  type ApiDeal,
  type ApiMenuItem,
  type TabletDevice,
} from "../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const BURGER = 10;
const FRIES = 6.5;
const SODA = 3;
const round2 = (n: number) => Math.round(n * 100) / 100;
const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

test.describe("POS — Deals", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER + ADMIN creds needed (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let token = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let groupId = "";
  let burger: ApiMenuItem;
  let fries: ApiMenuItem;
  let soda: ApiMenuItem;
  let everywhere: ApiDeal;
  let inStoreOnly: ApiDeal;
  let onlineOnly: ApiDeal;
  const dealIds: string[] = [];
  let device: TabletDevice | undefined;
  let tabletToken = "";
  let staffSession = "";
  const openedOrderIds: string[] = [];

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  const bundle = () => [
    { id: burger.id, name: burger.name, price: BURGER },
    { id: fries.id, name: fries.name, price: FRIES },
  ];

  /** Open-check ticket: one soda + the deal (burger + fries). Real DB prices so the pricing floor passes. */
  const dealTicket = (tableName: string, deal: ApiDeal) => {
    const dealPrice = deal.dealPrice ?? 0;
    return {
      restaurantId,
      orderType: "PICKUP",
      subtotal: round2(SODA + dealPrice),
      tax: 0,
      tip: 0,
      total: round2(SODA + dealPrice),
      customerPhone: "",
      orderItems: [
        {
          menuItemId: soda.id,
          menuItemName: soda.name,
          quantity: 1,
          price: SODA,
        },
      ],
      orderDeals: [
        {
          dealId: deal.id,
          dealName: deal.name,
          dealPrice,
          quantity: 1,
          items: [burger, fries].map((i) => ({
            menuItemId: i.id,
            menuItemName: i.name,
            menuItemPrice: i.price,
            quantity: 1,
          })),
        },
      ],
      dealDiscountAmount: round2(BURGER + FRIES - dealPrice),
      openCheck: true,
      tableName,
      guestCount: 2,
    };
  };

  /** Ring a ticket; a 201 is remembered for the afterAll cancel sweep. */
  const ring = async (tableName: string, deal: ApiDeal) => {
    const res = await createTabletOrderRaw(
      tabletToken,
      staffSession,
      dealTicket(tableName, deal)
    );
    if (res.status === 201 && res.data.id) openedOrderIds.push(res.data.id);
    return res;
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error("[pos-deals] could not mint the throwaway tenant");
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;
    await updateRestaurantSettingsApi(token, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    groupId = (
      await createMenuGroupNamed(token, `Automation POS Deals ${runId}`, {
        restaurantId,
      })
    ).id;
    burger = await createMenuItemFull(
      token,
      groupId,
      `POS Burger ${runId}`,
      BURGER
    );
    fries = await createMenuItemFull(
      token,
      groupId,
      `POS Fries ${runId}`,
      FRIES
    );
    soda = await createMenuItemFull(token, groupId, `POS Soda ${runId}`, SODA);
    everywhere = await createDealApi(
      token,
      restaurantId,
      `AUTO POS Combo ${runId}`,
      14,
      bundle()
    );
    inStoreOnly = await createDealApi(
      token,
      restaurantId,
      `AUTO POS InStore ${runId}`,
      13,
      bundle(),
      {
        availableChannels: ["IN_PERSON"],
      }
    );
    onlineOnly = await createDealApi(
      token,
      restaurantId,
      `AUTO POS Online ${runId}`,
      13,
      bundle(),
      {
        availableChannels: ["ONLINE"],
      }
    );
    dealIds.push(everywhere.id, inStoreOnly.id, onlineOnly.id);
    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Deals POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);
    const pin = "8462";
    const staffMemberId = await setOwnerPosPin(token, restaurantId, pin);
    staffSession = await tabletStaffSignIn(tabletToken, staffMemberId, pin);
  });

  test.afterAll(async () => {
    if (!token) return;
    for (const orderId of openedOrderIds) {
      // Best-effort: an already-cancelled check answers 400; the restaurant is archived below anyway.
      await cancelTabletOrderRaw(
        tabletToken,
        staffSession,
        orderId,
        "Automation cleanup"
      ).catch(() => {});
    }
    const t = await freshOwnerToken().catch(() => token);
    // Best-effort cleanup — a leftover AUTO deal is swept by globalTeardown.
    for (const id of dealIds) await deleteDealApi(t, id).catch(() => {});
    for (const it of [burger, fries, soda].filter(Boolean))
      // Best-effort — the archived tenant hides leftovers from every surface.
      await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
    // Best-effort — same reason as above.
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    if (device) await deactivateTabletDevice(t, restaurantId, device.id);
    // Admin DELETE archives the throwaway restaurant (never a hard delete); failure leaves an inert test store.
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS Deals");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  test("TC-524: the POS deal list (?channel=in_person) offers everywhere + in-store deals and hides online-only ones; the online list is the mirror image", async () => {
    await allure.description(
      "device-in-store lists deals from the public /active with ?channel=in_person. An availableChannels " +
        "['IN_PERSON'] deal is in-store only, ['ONLINE'] is online only, [] is everywhere."
    );
    const inStore = await getActiveDealsPublic(restaurantId, {
      channel: "in_person",
    });
    expect(inStore.status).toBe(200);
    const inStoreIds = (inStore.data.deals ?? []).map((d) => d.id);
    expect(inStoreIds).toContain(everywhere.id);
    expect(inStoreIds).toContain(inStoreOnly.id);
    expect(inStoreIds).not.toContain(onlineOnly.id);

    const online = await getActiveDealsPublic(restaurantId);
    const onlineIds = (online.data.deals ?? []).map((d) => d.id);
    expect(onlineIds).toContain(everywhere.id);
    expect(onlineIds).toContain(onlineOnly.id);
    expect(onlineIds).not.toContain(inStoreOnly.id);
  });

  test("TC-525: a deal rings up on a POS ticket — 201, and the order carries the deal at its deal price with its two items", async () => {
    const res = await ring(`Deals ${runId} 1`, everywhere);
    expect(res.status, msg(res.data)).toBe(201);
    expect(res.data.total).toBe(round2(SODA + 14));
    const order = await getOrderFullRaw(token, res.data.id!);
    expect(order.status).toBe(200);
    const deals = order.data.orderDeals as
      | {
          dealId: string;
          dealPrice: number;
          quantity: number;
          orderDealItems?: unknown[];
        }[]
      | undefined;
    expect(deals).toHaveLength(1);
    expect(deals![0]).toMatchObject({
      dealId: everywhere.id,
      dealPrice: 14,
      quantity: 1,
    });
    expect(deals![0]!.orderDealItems).toHaveLength(2);
    // No dealItemId assertion: this body is hand-built, not the device's (see Task 3 note).
  });

  test("TC-526: an online-only deal is refused at the counter with the channel message", async () => {
    const res = await ring(`Deals ${runId} 2`, onlineOnly);
    expect(res.status, msg(res.data)).toBe(400);
    expect(msg(res.data)).toBe(
      "This deal is not available for this type of order"
    );
  });

  test("TC-527: a deal outside its schedule is refused at the POS with DEAL_NOT_AVAILABLE_AT_TIME, judged on the restaurant's clock (a deal live in the restaurant's current window rings up)", async () => {
    const tz = await getRestaurantTimeZonePublic(restaurantId);
    requireScheduling("backend", Boolean(tz));
    const offDay = dayNameOfKey(localDateKey(tz, 3));
    const notToday = await createDealApi(
      token,
      restaurantId,
      `AUTO POS OffDay ${runId}`,
      14,
      bundle(),
      {
        validDays: [offDay],
      }
    );
    dealIds.push(notToday.id);
    const refused = await ring(`Deals ${runId} 3`, notToday);
    expect(refused.status, msg(refused.data)).toBe(400);
    expect((refused.data as { errorCode?: string }).errorCode).toBe(
      "DEAL_NOT_AVAILABLE_AT_TIME"
    );
    // The POS floor returns the code only — no details (DEAL_SCHEDULING.md → Quote and order).
    expect((refused.data as { details?: unknown }).details).toBeUndefined();
    expect(msg(refused.data)).toBe(
      "One of the deals on this ticket isn't available right now. Remove it to continue."
    );

    const now = liveNowWindow(tz);
    if (!now) {
      test.info().annotations.push({
        type: "note",
        description:
          "positive window control skipped — too close to the restaurant's midnight",
      });
      return;
    }
    const liveWindow = await createDealApi(
      token,
      restaurantId,
      `AUTO POS LiveWindow ${runId}`,
      14,
      bundle(),
      {
        validDays: [dayNameOfKey(now.dateKey)],
        validTimeStart: now.start,
        validTimeEnd: now.end,
      }
    );
    dealIds.push(liveWindow.id);
    const ok = await ring(`Deals ${runId} 4`, liveWindow);
    expect(ok.status, msg(ok.data)).toBe(201);
  });
});
