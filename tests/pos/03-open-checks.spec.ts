/**
 * 03-open-checks.spec.ts — Table-service OPEN CHECKS (POS, API level).
 *
 * First coverage of the tab/* endpoint family shipped 2026-08-19 (backend
 * #620/#623): a server opens a CHECK for a table (kitchen fires, nothing is
 * paid), items are added during the meal, and settlement happens at the end,
 * per guest, by cash / card / gift card. Feature contract:
 * restaunax/docs/features/TABLE_SERVICE_OPEN_CHECKS.md.
 *
 * Own tenant: the WHOLE file runs on a per-run throwaway restaurant owned by
 * an admin-minted OWNER (`createSecondOwner`) — the feature is FLAG-GATED
 * (RestaurantSettings.tableServiceEnabled, default false) and cash legs need a
 * register session, so mutating the shared seed restaurant would leak state
 * into every other worker. Setup chain (all API, no browser):
 *   settings PUT (flag ON) → menu item → REGISTER device (ADMIN-created:
 *   owners may only create SERVER/KITCHEN_DISPLAY devices) → tablet login →
 *   owner POS PIN (creates their MANAGER membership) → staff sign-in
 *   (X-Staff-Session) → register/open (drawer for cash legs).
 *
 * Gift-card HAPPY-PATH TODO: a gift leg needs a real ACTIVE gift card, and
 * QA has no mint path without money — POST /api/gift-cards/purchase verifies
 * a SUCCEEDED Stripe PaymentIntent before minting, and the admin routes only
 * freeze/adjust EXISTING cards. Until an admin/demo mint endpoint exists this
 * file covers the gift-leg contract negatives only (unknown code 400,
 * smuggled tip 400). Same reason the terminal-card coverage stops at
 * create-intent validations + cancel: capturing needs a physical reader
 * (card_present PI), which is device-lane territory.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  updateRestaurantSettingsApi,
  setOwnerPosPin,
  tabletStaffSignIn,
  openRegisterSessionPos,
  createTabletOrderRaw,
  getTabletTablesRaw,
  transferTabTableRaw,
  modifyTabletOrderRaw,
  settleTabCashRaw,
  settleTabGiftCardRaw,
  createTabTerminalIntentRaw,
  cancelTabTerminalIntentRaw,
  cancelTabletOrderRaw,
  getOrderFullRaw,
  type TabletDevice,
  type ApiMenuItem,
} from "../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const ITEM_PRICE = 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

test.describe("POS — Table Service Open Checks", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER + ADMIN creds needed (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  /** Throwaway tenant owner (createSecondOwner). */
  let token = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let groupId = "";
  let item: ApiMenuItem;
  let device: TabletDevice | undefined;
  let tabletToken = "";
  let staffSession = "";
  /** Every check this file opens — swept in afterAll (settle or cancel). */
  const openedOrderIds: string[] = [];

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  /** Open-check create body: real menu price so the pricing floor passes;
   *  tax 0 keeps every split a clean cent value. */
  const openBody = (
    tableName: string,
    qty: number,
    extra: Record<string, unknown> = {}
  ) => ({
    restaurantId,
    // Frozen POS contract: the client sends its counter body (orderType
    // PICKUP) + the openCheck flag; the BACKEND forces DINE_IN.
    orderType: "PICKUP",
    subtotal: round2(ITEM_PRICE * qty),
    tax: 0,
    tip: 0,
    total: round2(ITEM_PRICE * qty),
    customerPhone: "",
    orderItems: [
      {
        menuItemId: item.id,
        menuItemName: item.name,
        quantity: qty,
        price: ITEM_PRICE,
      },
    ],
    openCheck: true,
    tableName,
    guestCount: 3,
    ...extra,
  });

  /** Open a check and track it for the afterAll sweep. */
  const openCheck = async (tableName: string, qty: number) => {
    const res = await createTabletOrderRaw(
      tabletToken,
      staffSession,
      openBody(tableName, qty)
    );
    expect(res.status, msg(res.data)).toBe(201);
    const id = res.data.id!;
    openedOrderIds.push(id);
    return { id, total: res.data.total!, create: res.data };
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[open-checks] could not mint the throwaway tenant restaurant"
      );
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

    // Flip the rollout flag ON (creates the settings row when missing — a
    // fresh restaurant may not have one, and create-order 400s without
    // acceptingOrders). TC-372 toggles it off/on inside its own test.
    await updateRestaurantSettingsApi(token, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });

    // One real menu item — the create-order pricing floor validates the
    // claimed total against DB prices.
    groupId = (
      await createMenuGroupNamed(token, `Automation Tabs ${runId}`, {
        restaurantId,
      })
    ).id;
    item = await createMenuItemFull(
      token,
      groupId,
      `Tab Burger ${runId}`,
      ITEM_PRICE
    );

    // REGISTER device — must be ADMIN-created (owners may only provision
    // SERVER / KITCHEN_DISPLAY; admin-created devices default to REGISTER,
    // which the cash-leg drawer gate requires). Names are globally unique.
    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Tabs POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);

    // Staff session: the owner's own POS PIN creates their MANAGER
    // membership; MANAGER self-authorizes OPEN_REGISTER.
    const pin = "8462";
    const staffMemberId = await setOwnerPosPin(token, restaurantId, pin);
    staffSession = await tabletStaffSignIn(tabletToken, staffMemberId, pin);

    // Open the drawer so cash legs pass assertDrawerOperableBy.
    await openRegisterSessionPos(tabletToken, staffSession, 100);
  });

  test.afterAll(async () => {
    if (!token) return;
    // Sweep: settle or cancel every check this run opened. A check with a
    // settled leg can't cancel — pay off its remaining in cash instead.
    for (const orderId of openedOrderIds) {
      try {
        const read = await getOrderFullRaw(await freshOwnerToken(), orderId);
        const status = String(read.data?.status ?? "");
        const paymentStatus = String(read.data?.paymentStatus ?? "");
        if (
          !read.ok ||
          paymentStatus === "COMPLETED" ||
          status === "CANCELLED" ||
          status === "REFUNDED"
        )
          continue;
        const cancel = await cancelTabletOrderRaw(
          tabletToken,
          staffSession,
          orderId,
          "Automation cleanup"
        );
        if (!cancel.ok) {
          // Settled legs block cancel — close it out with cash.
          const payoff = 10_000;
          await settleTabCashRaw(tabletToken, staffSession, orderId, {
            amount: round2(Number(read.data?.total ?? 0)),
            cashTendered: payoff,
            idempotencyKey: `cleanup-${orderId}`,
          });
        }
      } catch (err) {
        console.warn(`[open-checks] cleanup failed for ${orderId}:`, err);
      }
    }
    const t = await freshOwnerToken().catch(() => token);
    if (item)
      await permanentlyDeleteMenuItemApi(adminToken, item.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    if (device) await deactivateTabletDevice(t, restaurantId, device.id);
    // Admin DELETE archives the throwaway restaurant (never a hard delete).
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS Table Service Open Checks");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  test("TC-372: openCheck is refused with a clean 403 while tableServiceEnabled is off", async () => {
    await allure.description(
      "The feature is a per-restaurant rollout flag. With RestaurantSettings." +
        "tableServiceEnabled=false, POST /api/tablet/create-order {openCheck:true} " +
        "→ 403 (not a half-created tab); flipping the flag back on restores the path."
    );
    await updateRestaurantSettingsApi(token, restaurantId, {
      tableServiceEnabled: false,
    });
    try {
      const res = await createTabletOrderRaw(
        tabletToken,
        staffSession,
        openBody(`Gate ${runId}`, 1)
      );
      expect(res.status, msg(res.data)).toBe(403);
    } finally {
      await updateRestaurantSettingsApi(token, restaurantId, {
        tableServiceEnabled: true,
      });
    }
  });

  test("TC-373: opening a check births a DINE_IN CONFIRMED unpaid order with the table fields stamped", async () => {
    await allure.description(
      "POST create-order {openCheck:true, tableName, guestCount} → 201. The " +
        "backend forces orderType DINE_IN, status CONFIRMED (staff placing the " +
        "order IS the acknowledgment — never PENDING), paymentStatus PENDING, " +
        "and stamps tableId/tableNumber/guestCount/tabOpenedAt. The create " +
        "response's orderNumber is the PERMANENT receipt number (legacy tablet " +
        "wire name); dailyOrderNumber is the daily call number."
    );
    const tableName = `Patio 7 ${runId}`;
    const { id, create } = await openCheck(tableName, 2);
    expect(create.status).toBe("CONFIRMED");
    expect(create.total).toBe(20);
    expect(typeof create.orderNumber).toBe("string");
    expect(typeof create.dailyOrderNumber).toBe("number");

    const read = await getOrderFullRaw(token, id);
    expect(read.status, msg(read.data)).toBe(200);
    expect(read.data.orderType).toBe("DINE_IN");
    expect(read.data.status).toBe("CONFIRMED");
    expect(read.data.paymentStatus).toBe("PENDING");
    expect(read.data.tableNumber).toBe(tableName);
    expect(read.data.guestCount).toBe(3);
    expect(read.data.tabOpenedAt).toBeTruthy();
    expect(read.data.tableId).toBeTruthy();

    const cancel = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      id,
      "TC-373 cleanup"
    );
    expect(cancel.ok, msg(cancel.data)).toBe(true);
  });

  test("TC-374: any tender in the open body is rejected — a tab is born unpaid", async () => {
    await allure.description(
      "The open-check body contract refuses every tender-shaped field with a " +
        "400 (payments[], giftCardCode, cashDiscount, processingFee) — the " +
        "tender is unknown until the guests pay, dual pricing never applies to " +
        "tabs and the card fee is computed per leg at settlement. DELIVERY " +
        "orderType is also incompatible with a table."
    );
    const attempts: Record<string, unknown>[] = [
      { payments: [{ paymentMethod: "CASH", amount: 10 }] },
      { giftCardCode: "AUTOBOGUSCODE" },
      { cashDiscount: 0.4 },
      { processingFee: 0.5 },
      { orderType: "DELIVERY" },
    ];
    for (const extra of attempts) {
      const res = await createTabletOrderRaw(
        tabletToken,
        staffSession,
        openBody(`Reject ${runId}`, 1, extra)
      );
      expect(res.status, `${JSON.stringify(extra)} → ${msg(res.data)}`).toBe(
        400
      );
    }
  });

  test("TC-375: GET /api/tablet/tables lists the table with its open-check summary (remaining = total, daily + receipt numbers)", async () => {
    await allure.description(
      "The picker grid returns the upserted RestaurantTable row with the " +
        "check's live summary: remaining = full total before any leg, " +
        "orderNumber = the DAILY number and receiptNumber = the permanent one " +
        "(platform naming rule D10), tabOpenedAt, and the server's short name " +
        "from the staff attribution."
    );
    const tableName = `Tab A ${runId}`;
    const { id, create } = await openCheck(tableName, 2);

    const tables = await getTabletTablesRaw(tabletToken);
    expect(tables.status, msg(tables.data)).toBe(200);
    const row = (tables.data.tables ?? []).find((t) => t.name === tableName);
    expect(row, `table "${tableName}" should be listed`).toBeTruthy();
    const check = row!.openChecks.find((c) => c.orderId === id);
    expect(check, "the open check should appear under its table").toBeTruthy();
    expect(check!.remaining).toBe(20);
    expect(check!.orderNumber).toBe(create.dailyOrderNumber);
    expect(check!.receiptNumber).toBe(create.orderNumber);
    expect(check!.tabOpenedAt).toBeTruthy();
    // The owner's MANAGER membership took the order → "First L." attribution.
    expect(check!.serverName, "serverName should be attributed").toBeTruthy();

    const cancel = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      id,
      "TC-375 cleanup"
    );
    expect(cancel.ok, msg(cancel.data)).toBe(true);
  });

  test("TC-376: transferring the check to another table re-stamps it and the grid follows", async () => {
    await allure.description(
      "PATCH …/tab/table {tableName} upserts the destination table by name " +
        "(zero-config, same rule as open) and moves tableId + tableNumber; " +
        "GET /tables shows the check under the destination and no longer under " +
        "the source."
    );
    const from = `Tab B1 ${runId}`;
    const to = `Tab B2 ${runId}`;
    const { id } = await openCheck(from, 1);

    const moved = await transferTabTableRaw(tabletToken, staffSession, id, to);
    expect(moved.status, msg(moved.data)).toBe(200);
    expect(moved.data.order?.tableNumber).toBe(to);
    expect(moved.data.table?.name).toBe(to);

    const tables = await getTabletTablesRaw(tabletToken);
    const src = (tables.data.tables ?? []).find((t) => t.name === from);
    const dst = (tables.data.tables ?? []).find((t) => t.name === to);
    expect(
      src?.openChecks.some((c) => c.orderId === id) ?? false,
      "source table should no longer hold the check"
    ).toBe(false);
    expect(
      dst?.openChecks.some((c) => c.orderId === id),
      "destination table should hold the check"
    ).toBe(true);

    const cancel = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      id,
      "TC-376 cleanup"
    );
    expect(cancel.ok, msg(cancel.data)).toBe(true);
  });

  test("TC-377: adding items mid-meal raises the total and remaining follows — no balance-due machinery on an unpaid tab", async () => {
    await allure.description(
      "PATCH …/orders/:id/modify with the grown item list on an UNPAID tab: " +
        "the server recomputes the total (delta just moves Order.total), " +
        "balanceDue/requiresAdditionalPayment stay 0 (that machinery is for " +
        "already-PAID orders), and the tables grid's remaining tracks the new " +
        "total."
    );
    const tableName = `Tab C ${runId}`;
    const { id } = await openCheck(tableName, 1); // total 10

    const modified = await modifyTabletOrderRaw(tabletToken, staffSession, id, {
      orderItems: [
        {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: 3,
          price: ITEM_PRICE,
        },
      ],
    });
    expect(modified.status, msg(modified.data)).toBe(200);
    expect(modified.data.order?.total).toBe(30);
    expect(modified.data.delta).toBe(20);
    expect(modified.data.balanceDue).toBe(0);
    expect(modified.data.requiresAdditionalPayment).toBe(0);

    const tables = await getTabletTablesRaw(tabletToken);
    const row = (tables.data.tables ?? []).find((t) => t.name === tableName);
    const check = row?.openChecks.find((c) => c.orderId === id);
    expect(check?.remaining, "remaining should follow the new total").toBe(30);

    const cancel = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      id,
      "TC-377 cleanup"
    );
    expect(cancel.ok, msg(cancel.data)).toBe(true);
  });

  test("TC-378: full lifecycle — open, settle in two cash legs, check closes and the order completes @smoke", async () => {
    await allure.description(
      "The whole feature in one pass: open a check (kitchen fires, unpaid) → " +
        "guest 1 pays cash (remaining halves) → guest 2 pays cash with change " +
        "(closed:true, cashChange computed) → paymentStatus COMPLETED at the " +
        "source of truth. Every leg response carries {leg, remaining, closed} " +
        "with remaining recomputed server-side AFTER the leg."
    );
    const { id } = await openCheck(`Smoke ${runId}`, 2); // total 20

    const leg1 = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: `smoke-1-${runId}`,
    });
    expect(leg1.status, msg(leg1.data)).toBe(200);
    expect(leg1.data.leg?.status).toBe("SUCCEEDED");
    expect(leg1.data.leg?.paymentMethod).toBe("CASH");
    expect(leg1.data.remaining).toBe(10);
    expect(leg1.data.closed).toBe(false);

    const leg2 = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 20,
      idempotencyKey: `smoke-2-${runId}`,
    });
    expect(leg2.status, msg(leg2.data)).toBe(200);
    expect(leg2.data.cashChange).toBe(10);
    expect(leg2.data.remaining).toBe(0);
    expect(leg2.data.closed).toBe(true);

    const read = await getOrderFullRaw(token, id);
    expect(read.data.paymentStatus).toBe("COMPLETED");
    expect(read.data.status).toBe("CONFIRMED");
  });

  test("TC-379: even 3-way split — replaying a leg's idempotencyKey returns the SAME leg, close is exact, and a post-close leg is refused", async () => {
    await allure.description(
      "Three $10 legs on a $30 check. Replaying leg 2's idempotencyKey answers " +
        "the ORIGINAL OrderPayment row (replayed:true, same leg id, remaining " +
        "unchanged — no double drawer entry). The final leg flips closed:true; " +
        "replaying ITS key after close still answers idempotently, while a " +
        "genuinely NEW leg on the closed check is a 400."
    );
    const { id } = await openCheck(`Split ${runId}`, 3); // total 30
    const keys = [1, 2, 3].map((n) => `split-${n}-${runId}`);

    const leg1 = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: keys[0],
    });
    expect(leg1.status, msg(leg1.data)).toBe(200);
    expect(leg1.data.remaining).toBe(20);

    const leg2 = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: keys[1],
    });
    expect(leg2.status, msg(leg2.data)).toBe(200);
    expect(leg2.data.remaining).toBe(10);
    const leg2Id = leg2.data.leg?.id;

    // POS retry of leg 2 — same key, must not move money twice.
    const replay = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: keys[1],
    });
    expect(replay.status, msg(replay.data)).toBe(200);
    expect(replay.data.replayed).toBe(true);
    expect(replay.data.leg?.id).toBe(leg2Id);
    expect(replay.data.remaining).toBe(10);
    expect(replay.data.closed).toBe(false);

    const leg3 = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: keys[2],
    });
    expect(leg3.status, msg(leg3.data)).toBe(200);
    expect(leg3.data.remaining).toBe(0);
    expect(leg3.data.closed).toBe(true);

    // A retry of the CLOSING leg still answers idempotently after close.
    const closeReplay = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: keys[2],
    });
    expect(closeReplay.status, msg(closeReplay.data)).toBe(200);
    expect(closeReplay.data.replayed).toBe(true);
    expect(closeReplay.data.closed).toBe(true);

    // A genuinely NEW leg on the closed check is refused.
    const extra = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 5,
      cashTendered: 5,
      idempotencyKey: `split-extra-${runId}`,
    });
    expect(extra.status, msg(extra.data)).toBe(400);
  });

  test("TC-380: a tip on a cash leg rides on top — Order.tip/total bump, remaining consumes only the share", async () => {
    await allure.description(
      "Tips are per-guest, per-leg (OrderPayment.tipAmount): leg amount = " +
        "share + tip, and each successful leg atomically bumps Order.tip and " +
        "Order.total by the tip — which is exactly what keeps remaining " +
        "(total − Σ leg amounts) equal to the outstanding pre-tip check value. " +
        "$20 check, guest 1 pays $10 + $2 tip → remaining 10, order total 22, " +
        "tip 2; guest 2's plain $10 closes it."
    );
    const { id } = await openCheck(`Tip ${runId}`, 2); // total 20

    const leg1 = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      tip: 2,
      cashTendered: 12,
      idempotencyKey: `tip-1-${runId}`,
    });
    expect(leg1.status, msg(leg1.data)).toBe(200);
    expect(leg1.data.leg?.amount).toBe(12); // share + tip
    expect(leg1.data.leg?.tipAmount).toBe(2);
    expect(leg1.data.remaining).toBe(10); // tip never consumes remaining
    expect(leg1.data.closed).toBe(false);

    const mid = await getOrderFullRaw(token, id);
    expect(mid.data.tip).toBe(2);
    expect(mid.data.total).toBe(22);

    const leg2 = await settleTabCashRaw(tabletToken, staffSession, id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: `tip-2-${runId}`,
    });
    expect(leg2.status, msg(leg2.data)).toBe(200);
    expect(leg2.data.closed).toBe(true);

    const final = await getOrderFullRaw(token, id);
    expect(final.data.paymentStatus).toBe("COMPLETED");
    expect(final.data.tip).toBe(2);
    expect(final.data.total).toBe(22);
  });

  test("TC-381: gift-card leg contract — unknown code 400, smuggled tip 400 (gift cards never cover tips)", async () => {
    await allure.description(
      "…/tab/settle-gift-card negatives: an unknown code answers 400 (same " +
        "lookup + scope + status + balance rules as every redemption path), " +
        "and a tip in the body is refused loudly rather than silently dropped " +
        "— platform policy is that a gift card never covers the tip. " +
        "HAPPY-PATH TODO: needs a mintable ACTIVE gift card; QA has no mint " +
        "path without real money (purchase verifies a SUCCEEDED Stripe " +
        "PaymentIntent; admin routes only freeze/adjust existing cards)."
    );
    const { id } = await openCheck(`Gift ${runId}`, 1); // total 10

    const unknown = await settleTabGiftCardRaw(tabletToken, id, {
      code: `AUTOBOGUS${runId}`.toUpperCase().slice(0, 16),
      amount: 5,
      idempotencyKey: `gift-unknown-${runId}`,
    });
    expect(unknown.status, msg(unknown.data)).toBe(400);

    const tipped = await settleTabGiftCardRaw(tabletToken, id, {
      code: `AUTOBOGUS${runId}`.toUpperCase().slice(0, 16),
      amount: 5,
      tip: 2,
      idempotencyKey: `gift-tip-${runId}`,
    });
    expect(tipped.status, msg(tipped.data)).toBe(400);

    // Nothing was written — the check is still fully outstanding.
    const tables = await getTabletTablesRaw(tabletToken);
    const check = (tables.data.tables ?? [])
      .flatMap((t) => t.openChecks)
      .find((c) => c.orderId === id);
    expect(check?.remaining).toBe(10);

    const cancel = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      id,
      "TC-381 cleanup"
    );
    expect(cancel.ok, msg(cancel.data)).toBe(true);
  });

  test("TC-382: card leg — create-intent validates amounts, a PENDING leg never consumes remaining, cancel abandons it idempotently", async () => {
    await allure.description(
      "…/tab/create-terminal-intent: amount ≤ 0 → 400; amount > remaining → " +
        "400 (checked under the per-order advisory lock). A valid create " +
        "returns a bound card_present PaymentIntent (clientSecret) and a " +
        "PENDING leg — an intent is not money, remaining is unchanged. " +
        "cancel-terminal-intent flips the row FAILED (shares recompute) and a " +
        "second cancel replays idempotently. Capture needs a physical reader " +
        "— that half is device-lane coverage, not QA-API coverage."
    );
    const { id } = await openCheck(`Card ${runId}`, 2); // total 20

    const bad = await createTabTerminalIntentRaw(tabletToken, id, {
      amount: -5,
    });
    expect(bad.status, msg(bad.data)).toBe(400);

    const tooBig = await createTabTerminalIntentRaw(tabletToken, id, {
      amount: 25,
    });
    expect(tooBig.status, msg(tooBig.data)).toBe(400);

    const created = await createTabTerminalIntentRaw(tabletToken, id, {
      amount: 10,
    });
    expect(created.status, msg(created.data)).toBe(200);
    expect(created.data.paymentIntentId).toMatch(/^pi_/);
    expect(created.data.clientSecret).toBeTruthy();
    expect(created.data.leg?.status).toBe("PENDING");
    expect(created.data.leg?.paymentMethod).toBe("CARD");
    expect(created.data.remaining).toBe(20); // PENDING leg ≠ money
    expect(created.data.closed).toBe(false);

    const cancelled = await cancelTabTerminalIntentRaw(
      tabletToken,
      id,
      created.data.paymentIntentId!
    );
    expect(cancelled.status, msg(cancelled.data)).toBe(200);
    expect(cancelled.data.leg?.status).toBe("FAILED");
    expect(cancelled.data.remaining).toBe(20);

    const again = await cancelTabTerminalIntentRaw(
      tabletToken,
      id,
      created.data.paymentIntentId!
    );
    expect(again.status, msg(again.data)).toBe(200);
    expect(again.data.replayed).toBe(true);

    const cancel = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      id,
      "TC-382 cleanup"
    );
    expect(cancel.ok, msg(cancel.data)).toBe(true);
  });

  test("TC-383: cancel guard — a check with a settled leg refuses cancel (refund path only); a fresh check cancels and leaves the grid", async () => {
    await allure.description(
      "A tab with ANY SUCCEEDED leg is real collected money: POST " +
        "/api/tablet/cancel-order → 400 (reversal is a refund, never a " +
        "cancel). A fresh check with no settled legs cancels cleanly and " +
        "disappears from the tables summary (open-check is DERIVED: status " +
        "CANCELLED excludes it)."
    );
    // Half-settled check: cancel must refuse.
    const settled = await openCheck(`Guard A ${runId}`, 2); // total 20
    const leg = await settleTabCashRaw(tabletToken, staffSession, settled.id, {
      amount: 10,
      cashTendered: 10,
      idempotencyKey: `guard-${runId}`,
    });
    expect(leg.status, msg(leg.data)).toBe(200);
    const blocked = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      settled.id,
      "attempted cancel with settled leg"
    );
    expect(blocked.status, msg(blocked.data)).toBe(400);
    // Close it out so nothing leaks (also proves the check survived intact).
    const closeLeg = await settleTabCashRaw(
      tabletToken,
      staffSession,
      settled.id,
      { amount: 10, cashTendered: 10, idempotencyKey: `guard-close-${runId}` }
    );
    expect(closeLeg.data.closed).toBe(true);

    // Fresh check: cancel succeeds and the grid forgets it.
    const fresh = await openCheck(`Guard B ${runId}`, 1);
    const cancelled = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      fresh.id,
      "guest walked before ordering"
    );
    expect(cancelled.status, msg(cancelled.data)).toBe(200);
    expect(cancelled.data.action).toBe("CANCELLED");

    const tables = await getTabletTablesRaw(tabletToken);
    const stillListed = (tables.data.tables ?? [])
      .flatMap((t) => t.openChecks)
      .some((c) => c.orderId === fresh.id);
    expect(stillListed, "cancelled check must leave the summary").toBe(false);
  });
});
