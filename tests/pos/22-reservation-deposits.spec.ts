/**
 * 22-reservation-deposits.spec.ts — reservation deposits (reservations phase 4,
 * Contract C), real HTTP + real Stripe TEST mode. Spec:
 * restaunax/docs/features/TABLE_RESERVATIONS.md → Reservation deposits.
 *
 * Payments are REAL test-mode charges (server-side confirm with pm_card_visa /
 * pm_card_chargeDeclined) on a real destination charge, and the webhook is the
 * REAL event Stripe emitted, POSTed to /api/stripe/webhook signed with the
 * backend's own secret (utils/stripeTestMode.ts). Refunds are checked on Stripe.
 *
 * Needs: scripts/with-stripe-test-env.sh (Stripe secrets) + E2E_LOCAL_DATABASE_URL
 * (RUNNING_TESTS.md). Without them the file skips. Each Stripe tenant gets its own
 * real Custom test account. The local DB is only written to link that account and
 * to age rows instead of sleeping; never a delete.
 *
 * Tenants: `t` (Stripe + a $20-per-guest rule, the main stage), `m` (Stripe, rule
 * matching and "Require deposit"), `ns` (add-on, deposits off, no Stripe), `bare`
 * (no add-on). TC-1266 → TC-1297. Gated on probeReservationsPhase4.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateGuestPhone, generateRunId } from "../../utils/testData";
import { localDateKey } from "../../utils/dealSchedule";
import {
  apiRequestRaw,
  cancelManagedReservationRaw,
  createPinStaffTabletRaw,
  createPublicReservationRaw,
  createReservationOwnerRaw,
  createReservationTabletRaw,
  createTableOwnerRaw,
  createTabletOrderRaw,
  cancelTabletOrderRaw,
  deactivateTabletDevice,
  deleteTestRestaurant,
  getHostRaw,
  getManagedReservationRaw,
  getOrderStatisticsDetailRaw,
  getPublicAvailabilityRaw,
  getReservationSettingsOwnerRaw,
  listReservationsOwnerRaw,
  patchReservationOwnerRaw,
  putReservationSettingsOwnerRaw,
  reservationStatusTabletRaw,
  seatReservationTabletRaw,
  settleTabCashRaw,
  openRegisterSessionPos,
  tabletStaffSignIn,
} from "../../utils/apiHelper";
import {
  probeReservationsPhase4,
  requireRelease,
} from "../../utils/releaseGate";
import {
  ITEM_PRICE,
  acceptDepositPolicyRaw,
  closeCoveredRaw,
  createDepositRuleRaw,
  deleteDepositRuleRaw,
  depositQuoteOwnerRaw,
  depositQuoteTabletRaw,
  errorCode,
  listDepositRulesRaw,
  localDbReady,
  localSql,
  mintPhase4Tenant,
  msg,
  openCheckBody,
  refundDepositOwnerRaw,
  refundDepositTabletRaw,
  searchReservationsOwnerRaw,
  searchReservationsTabletRaw,
  sendDepositLinkOwnerRaw,
  sendDepositLinkTabletRaw,
  smsTypesOf,
  unwrap,
  updateDepositRuleRaw,
  voidLegPreviewRaw,
  voidLegRaw,
  type Phase4Tenant,
} from "../../utils/reservationPhase4Api";
import {
  confirmIntent,
  deliverBadlySignedEvent,
  deliverStripeEvent,
  findStripeEvent,
  fireStripeEvent,
  intentIdFromClientSecret,
  listRefunds,
  payIntentAndFireWebhook,
  retrieveIntent,
  stripeApi,
  stripeTestModeReady,
} from "../../utils/stripeTestMode";

const CREDS_OK = !!process.env.ADMIN_EMAIL && !!process.env.ADMIN_PASSWORD;
const MONEY_OK = stripeTestModeReady() && localDbReady();
const HOUR = 3_600_000;

test.describe("POS — Reservation deposits (phase 4) @reservations-phase4", () => {
  test.skip(!CREDS_OK, "ADMIN creds needed (the file mints its own tenants)");
  test.skip(
    !MONEY_OK,
    "Needs real Stripe test mode: run through scripts/with-stripe-test-env.sh with E2E_LOCAL_DATABASE_URL (RUNNING_TESTS.md)"
  );

  const runId = generateRunId();
  let t: Phase4Tenant;
  let m: Phase4Tenant;
  let ns: Phase4Tenant;
  let bare: Phase4Tenant;
  let onStack = false;
  let serverSession = "";
  let serverId = "";
  let seq = 300;
  let slotIndex = 0;
  const phone = () => generateGuestPhone(runId, ++seq);
  const name = (label: string) => `${label} ${runId}`;

  /** $20 a guest: a party of 2 owes $40 (4000 cents). */
  const BASE_RULE = { amountCents: 2000, amountType: "PER_GUEST" as const };
  const TWO_GUESTS = 4000;

  /** The next free slot on the day `daysAhead` from now. */
  const nextSlot = async (
    tenant: Phase4Tenant,
    daysAhead: number,
    partySize = 2
  ) => {
    const date = localDateKey(tenant.timeZone, daysAhead);
    const avail = unwrap(
      await getPublicAvailabilityRaw(tenant.restaurantId, date, partySize)
    );
    const slots = avail.slots as {
      scheduledAt: string;
      depositCents?: number;
    }[];
    return slots[slotIndex++ % slots.length]!;
  };

  /** A slot a few hours from now: inside a 24-hour refund window. */
  const slotInHours = async (tenant: Phase4Tenant, hours: number) => {
    const at = new Date(Date.now() + hours * HOUR);
    const date = localDateKey(tenant.timeZone, 0, at);
    const avail = unwrap(
      await getPublicAvailabilityRaw(tenant.restaurantId, date, 2)
    );
    const slots = (avail.slots as { scheduledAt: string }[]).filter(
      (s) => new Date(s.scheduledAt).getTime() >= at.getTime()
    );
    expect(slots.length, `no slot ${hours}h from now`).toBeGreaterThan(0);
    return slots[slotIndex++ % slots.length]!.scheduledAt;
  };

  interface Booked {
    id: string;
    token: string;
    intentId: string;
    deposit: any;
    scheduledAt: string;
    guestPhone: string;
    guestName: string;
    raw: any;
  }

  const bookPublic = async (
    label: string,
    {
      tenant = t,
      daysAhead = 3,
      scheduledAt,
      partySize = 2,
    }: {
      tenant?: Phase4Tenant;
      daysAhead?: number;
      scheduledAt?: string;
      partySize?: number;
    } = {}
  ): Promise<Booked> => {
    const at =
      scheduledAt ?? (await nextSlot(tenant, daysAhead, partySize)).scheduledAt;
    const guestPhone = phone();
    const guestName = name(label);
    const res = await createPublicReservationRaw(tenant.restaurantId, {
      partySize,
      scheduledAt: at,
      guestName,
      guestPhone,
      policyAccepted: true,
      clientRequestId: `dep-${runId}-${++seq}`,
    });
    expect(res.status, msg(res.data)).toBe(201);
    const d = unwrap(res);
    return {
      id: d.id ?? d.reservationId,
      token: String(d.manageUrl).split("/").pop() as string,
      intentId: d.deposit?.clientSecret
        ? intentIdFromClientSecret(d.deposit.clientSecret)
        : "",
      deposit: d.deposit,
      scheduledAt: at,
      guestPhone,
      guestName,
      raw: d,
    };
  };

  const bookAndPay = async (
    label: string,
    opts: Parameters<typeof bookPublic>[1] = {}
  ): Promise<Booked> => {
    const b = await bookPublic(label, opts);
    await payIntentAndFireWebhook(b.intentId);
    return b;
  };

  /** A staff booking through the owner route (ADVISORY: no pacing refusal). */
  const bookOwner = async (
    label: string,
    {
      tenant = t,
      hours = 72,
      extra = {},
    }: {
      tenant?: Phase4Tenant;
      hours?: number;
      extra?: Record<string, unknown>;
    } = {}
  ) => {
    const res = await createReservationOwnerRaw(
      tenant.token,
      tenant.restaurantId,
      {
        partySize: 2,
        scheduledAt: new Date(
          Math.floor((Date.now() + hours * HOUR) / 900_000) * 900_000
        ).toISOString(),
        guestName: name(label),
        guestPhone: phone(),
        ...extra,
      }
    );
    expect(res.status, msg(res.data)).toBe(201);
    return unwrap(res);
  };

  const manage = async (token: string) => {
    const res = await getManagedReservationRaw(token);
    expect(res.status, msg(res.data)).toBe(200);
    return unwrap(res);
  };

  /** Row summary as staff see it, whatever the day: the search route. */
  const ownerRow = async (b: { guestName: string; id: string }, tenant = t) => {
    const res = await searchReservationsOwnerRaw(
      tenant.token,
      tenant.restaurantId,
      b.guestName
    );
    expect(res.status, msg(res.data)).toBe(200);
    const list = unwrap(res);
    const rows = (Array.isArray(list) ? list : list.reservations) as any[];
    return rows.find((r) => r.id === b.id);
  };

  /** Manager, on a new table: seat the party, open a check linked to it. */
  const newTable = async (tenant = t) => {
    const res = await createTableOwnerRaw(tenant.token, tenant.restaurantId, {
      name: `Dep ${runId}-${++seq}`,
      capacity: 4,
    });
    expect(res.status, msg(res.data)).toBe(201);
    return unwrap(res).id as string;
  };

  const seatAndOpenCheck = async (
    b: Booked,
    price = ITEM_PRICE,
    quantity = 1
  ) => {
    const tableId = await newTable();
    const seat = await seatReservationTabletRaw(
      t.tabletToken,
      t.managerSession,
      b.id,
      { tableIds: [tableId] }
    );
    expect(seat.status, msg(seat.data)).toBeLessThan(300);
    const check = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, tableId, { reservationId: b.id }, price, quantity)
    );
    expect(check.status, msg(check.data)).toBe(201);
    return { tableId, orderId: check.data.id as string };
  };

  const orderDetail = async (orderId: string) => {
    const res = await getOrderStatisticsDetailRaw(t.token, orderId);
    expect(res.status).toBe(200);
    return res.data as any;
  };

  const depositLeg = (order: any) =>
    (order.payments as any[]).find(
      (p) => p.paymentMethod === "RESERVATION_DEPOSIT"
    );

  const refundedOnStripe = async (intentId: string) => {
    const refunds = await listRefunds(intentId);
    return refunds.reduce((sum, r) => sum + (r.amount as number), 0);
  };

  test.beforeAll(async () => {
    test.setTimeout(5 * 60_000);
    if (!CREDS_OK || !MONEY_OK) return;
    const key = process.env.E2E_STRIPE_SECRET_KEY ?? "";
    if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_"))
      throw new Error("Refusing to run: not a Stripe test key");
    t = await mintPhase4Tenant(runId, {
      label: "dep",
      stripe: true,
      maxPartiesPerSlot: 20,
    });
    m = await mintPhase4Tenant(runId, {
      label: "depm",
      stripe: true,
      maxPartiesPerSlot: 20,
    });
    ns = await mintPhase4Tenant(runId, {
      label: "depns",
      maxPartiesPerSlot: 20,
    });
    bare = await mintPhase4Tenant(runId, { label: "depbare", addOn: false });
    onStack = await probeReservationsPhase4(t.token, t.restaurantId);
    for (const tenant of [t, m]) {
      const on = await putReservationSettingsOwnerRaw(
        tenant.token,
        tenant.restaurantId,
        { depositsEnabled: true }
      );
      if (!on.ok) throw new Error(`deposits on: ${msg(on.data)}`);
    }
    const rule = await createDepositRuleRaw(t.token, t.restaurantId, BASE_RULE);
    if (rule.status !== 201) throw new Error(`rule: ${msg(rule.data)}`);
    // A plain server, signed in BEFORE the drawer opens: an open register is
    // assigned to its opener and refuses other staff sign-ins.
    const pin = "5211";
    const added = await createPinStaffTabletRaw(
      t.tabletToken,
      t.managerSession,
      {
        firstName: "Rae",
        lastName: "Server",
        pin,
        staffRole: "STAFF",
      }
    );
    if (added.status !== 201) throw new Error(`staff: ${msg(added.data)}`);
    serverId = String((added.data as any).data.id);
    serverSession = await tabletStaffSignIn(t.tabletToken, serverId, pin);
    await openRegisterSessionPos(t.tabletToken, t.managerSession, 100);
  });

  test.afterAll(async () => {
    for (const tenant of [t, m, ns, bare]) {
      if (!tenant) continue;
      await deactivateTabletDevice(
        tenant.adminToken,
        tenant.restaurantId,
        tenant.deviceId
      ).catch(() => {});
      await deleteTestRestaurant(tenant.adminToken, tenant.restaurantId).catch(
        () => {}
      );
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Reservations — deposits");
    await allure.label("severity", "critical");
    requireRelease("reservationsPhase4", onStack);
  });

  test("TC-1266: off by default — no money anywhere: settings, slots, rows, create answers, quotes", async () => {
    const s = unwrap(
      await getReservationSettingsOwnerRaw(ns.token, ns.restaurantId)
    );
    expect(s.depositsEnabled).toBe(false);
    expect(s.depositRefundWindowHours).toBe(24);
    expect(s.depositPolicyNote).toBeNull();
    expect(s.depositUnpaidHoldMinutes).toBe(15);
    expect(s.depositPhoneBookingPayHours).toBeNull();

    // A rule on file changes nothing while the switch is off.
    const rule = await createDepositRuleRaw(
      ns.token,
      ns.restaurantId,
      BASE_RULE
    );
    expect(rule.status, msg(rule.data)).toBe(201);

    const date = localDateKey(ns.timeZone, 3);
    const avail = unwrap(
      await getPublicAvailabilityRaw(ns.restaurantId, date, 2)
    );
    expect(avail.slots[0]).not.toHaveProperty("depositCents");
    expect(avail).not.toHaveProperty("depositPolicy");

    const created = await createPublicReservationRaw(ns.restaurantId, {
      partySize: 2,
      scheduledAt: avail.slots[0].scheduledAt,
      guestName: name("No deposit"),
      guestPhone: phone(),
    });
    expect(created.status, msg(created.data)).toBe(201);
    const d = unwrap(created);
    expect(d).not.toHaveProperty("deposit");
    const view = await manage(String(d.manageUrl).split("/").pop() as string);
    expect(view.deposit).toBeNull();
    expect(view.depositDue).toBeNull();
    expect(view.depositPolicy).toBeNull();

    const staffRow = await bookOwner("Staff no deposit", {
      tenant: ns,
      extra: { requireDeposit: true },
    });
    expect(staffRow.deposit ?? null).toBeNull();

    const quote = unwrap(
      await depositQuoteOwnerRaw(
        ns.token,
        ns.restaurantId,
        avail.slots[0].scheduledAt,
        2
      )
    );
    expect(quote).toEqual({
      depositsEnabled: false,
      amountCents: null,
      ruleId: null,
      refundWindowHours: 24,
    });
  });

  test("TC-1267: settings are validated; switching on needs a Stripe account that can take charges", async () => {
    const notReady = await putReservationSettingsOwnerRaw(
      ns.token,
      ns.restaurantId,
      {
        depositsEnabled: true,
      }
    );
    expect(notReady.status).toBe(400);
    expect(errorCode(notReady.data)).toBe("DEPOSIT_STRIPE_NOT_READY");

    for (const bad of [
      { depositRefundWindowHours: -1 },
      { depositRefundWindowHours: 721 },
      { depositRefundWindowHours: 2.5 },
      { depositPolicyNote: "x".repeat(501) },
      { depositPolicyNote: 5 },
      { depositUnpaidHoldMinutes: 4 },
      { depositUnpaidHoldMinutes: 61 },
      { depositPhoneBookingPayHours: 0 },
      { depositPhoneBookingPayHours: 169 },
    ]) {
      const res = await putReservationSettingsOwnerRaw(
        m.token,
        m.restaurantId,
        bad
      );
      expect(res.status, JSON.stringify(bad).slice(0, 60)).toBe(400);
      expect(errorCode(res.data)).toBe("RESERVATION_SETTINGS_INVALID_RANGE");
    }
    const ok = await putReservationSettingsOwnerRaw(m.token, m.restaurantId, {
      depositRefundWindowHours: 0,
      depositPolicyNote: "  ",
      depositUnpaidHoldMinutes: 60,
      depositPhoneBookingPayHours: 168,
    });
    expect(ok.status, msg(ok.data)).toBe(200);
    const s = unwrap(ok);
    expect(s.depositRefundWindowHours).toBe(0);
    expect(s.depositUnpaidHoldMinutes).toBe(60);
    expect(s.depositPhoneBookingPayHours).toBe(168);
    expect(s.depositsEnabled).toBe(true);
    const cleared = await putReservationSettingsOwnerRaw(
      m.token,
      m.restaurantId,
      {
        depositRefundWindowHours: 24,
        depositPolicyNote: "",
        depositUnpaidHoldMinutes: 15,
        depositPhoneBookingPayHours: null,
      }
    );
    expect(unwrap(cleared).depositPolicyNote).toBeNull();
  });

  test("TC-1268: without the add-on — rule reads answer readOnly, every write and staff route refuses", async () => {
    const read = await listDepositRulesRaw(bare.token, bare.restaurantId);
    expect(read.status).toBe(200);
    expect((read.data as any).readOnly).toBe(true);
    const write = await createDepositRuleRaw(
      bare.token,
      bare.restaurantId,
      BASE_RULE
    );
    expect(write.status).toBe(403);
    expect(errorCode(write.data)).toBe("RESERVATIONS_NOT_ENABLED");
    const at = new Date(Date.now() + 72 * HOUR).toISOString();
    const quote = await depositQuoteOwnerRaw(
      bare.token,
      bare.restaurantId,
      at,
      2
    );
    expect(quote.status).toBe(403);
    const posQuote = await depositQuoteTabletRaw(
      bare.tabletToken,
      bare.managerSession,
      at,
      2
    );
    expect(posQuote.status).toBe(403);
    const fake = "00000000-0000-4000-8000-000000000000";
    const refund = await refundDepositOwnerRaw(
      bare.token,
      bare.restaurantId,
      fake,
      {
        reason: "x",
      }
    );
    expect(refund.status).toBe(403);
    const posRefund = await refundDepositTabletRaw(
      bare.tabletToken,
      bare.managerSession,
      fake,
      { reason: "x" }
    );
    expect(posRefund.status).toBe(403);
    const link = await sendDepositLinkOwnerRaw(
      bare.token,
      bare.restaurantId,
      fake
    );
    expect(link.status).toBe(403);
    const posSearch = await searchReservationsTabletRaw(
      bare.tabletToken,
      bare.managerSession,
      "anna"
    );
    expect(posSearch.status).toBe(403);
    const search = await searchReservationsOwnerRaw(
      bare.token,
      bare.restaurantId,
      "anna"
    );
    expect(search.status, msg(search.data)).toBe(200);
    expect((search.data as any).readOnly).toBe(true);
  });

  test("TC-1269: rules CRUD — create, list oldest first, partial update, delete, 404", async () => {
    const rid = m.restaurantId;
    const a = await createDepositRuleRaw(m.token, rid, {
      name: "Weekend",
      amountCents: 2500,
      amountType: "PER_BOOKING",
      minPartySize: 2,
      maxPartySize: 6,
      daysOfWeek: [5, 6],
      startTime: "17:00",
      endTime: "22:00",
    });
    expect(a.status, msg(a.data)).toBe(201);
    const rule = unwrap(a);
    expect(rule).toMatchObject({
      name: "Weekend",
      amountCents: 2500,
      amountType: "PER_BOOKING",
      minPartySize: 2,
      maxPartySize: 6,
      daysOfWeek: [5, 6],
      startTime: "17:00",
      endTime: "22:00",
      specificDates: [],
      active: true,
    });
    const b = unwrap(
      await createDepositRuleRaw(m.token, rid, { amountCents: 100 })
    );
    expect(b.amountType).toBe("PER_GUEST");
    expect(b.name).toBeNull();

    const list = unwrap(await listDepositRulesRaw(m.token, rid)) as any[];
    expect(list.map((r) => r.id)).toEqual([rule.id, b.id]);

    const updated = await updateDepositRuleRaw(m.token, rid, rule.id, {
      amountCents: 3000,
      active: false,
    });
    expect(updated.status, msg(updated.data)).toBe(200);
    expect(unwrap(updated).amountCents).toBe(3000);
    expect(unwrap(updated).active).toBe(false);
    expect(unwrap(updated).startTime).toBe("17:00");

    const missing = "00000000-0000-4000-8000-000000000000";
    for (const res of [
      await updateDepositRuleRaw(m.token, rid, missing, { amountCents: 500 }),
      await deleteDepositRuleRaw(m.token, rid, missing),
    ]) {
      expect(res.status).toBe(404);
      expect(errorCode(res.data)).toBe("DEPOSIT_RULE_NOT_FOUND");
    }
    // Another restaurant's rule is not mine to touch.
    const foreign = await updateDepositRuleRaw(
      t.token,
      t.restaurantId,
      rule.id,
      {
        amountCents: 500,
      }
    );
    expect(foreign.status).toBe(404);

    for (const id of [rule.id, b.id]) {
      const del = await deleteDepositRuleRaw(m.token, rid, id);
      expect(del.status, msg(del.data)).toBe(200);
    }
    expect(unwrap(await listDepositRulesRaw(m.token, rid))).toEqual([]);
  });

  test("TC-1270: bad rules name the field that's wrong", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ amountCents: 99 }, "amountCents"],
      [{ amountCents: 100001 }, "amountCents"],
      [{ amountCents: 10.5 }, "amountCents"],
      [{ amountCents: 500, amountType: "PER_TABLE" }, "amountType"],
      [{ amountCents: 500, minPartySize: 0 }, "minPartySize"],
      [{ amountCents: 500, maxPartySize: 100 }, "maxPartySize"],
      [{ amountCents: 500, minPartySize: 6, maxPartySize: 2 }, "maxPartySize"],
      [{ amountCents: 500, daysOfWeek: [7] }, "daysOfWeek"],
      [{ amountCents: 500, startTime: "25:00" }, "startTime"],
      [{ amountCents: 500, startTime: "20:00", endTime: "18:00" }, "endTime"],
      [{ amountCents: 500, specificDates: ["12/25/2026"] }, "specificDates"],
      [{ amountCents: 500, name: "x".repeat(61) }, "name"],
    ];
    for (const [body, field] of cases) {
      const res = await createDepositRuleRaw(m.token, m.restaurantId, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(errorCode(res.data)).toBe("DEPOSIT_RULE_INVALID");
      expect((res.data as any).details?.field, JSON.stringify(body)).toBe(
        field
      );
    }
  });

  test("TC-1271: matching — every set condition must hold, highest amount wins, per guest multiplies, inactive never counts", async () => {
    const rid = m.restaurantId;
    const created: string[] = [];
    const add = async (body: Record<string, unknown>) => {
      const res = await createDepositRuleRaw(m.token, rid, body);
      expect(res.status, msg(res.data)).toBe(201);
      created.push(unwrap(res).id);
      return unwrap(res).id as string;
    };
    const date = localDateKey(m.timeZone, 5);
    const slots = unwrap(await getPublicAvailabilityRaw(rid, date, 2))
      .slots as any[];
    expect(slots[0]).toHaveProperty("depositCents");
    expect(slots[0].depositCents).toBeNull();
    const slotAtLocal = (hhmm: string) =>
      slots.find(
        (s) =>
          new Intl.DateTimeFormat("en-GB", {
            timeZone: m.timeZone,
            hour: "2-digit",
            minute: "2-digit",
          }).format(new Date(s.scheduledAt)) === hhmm
      ).scheduledAt as string;
    const dinner = slotAtLocal("19:00");
    const lunch = slotAtLocal("12:00");
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const quote = async (at: string, party: number) =>
      unwrap(await depositQuoteOwnerRaw(m.token, rid, at, party));

    // Per guest × party; per booking flat.
    const perGuest = await add({ amountCents: 500, minPartySize: 4 });
    const flat = await add({
      amountCents: 3000,
      amountType: "PER_BOOKING",
      maxPartySize: 5,
    });
    expect(await quote(dinner, 4)).toMatchObject({
      amountCents: 3000,
      ruleId: flat,
    });
    expect((await quote(dinner, 6)).amountCents).toBe(3000 * 0 + 500 * 6);
    expect((await quote(dinner, 6)).ruleId).toBe(perGuest);
    expect((await quote(dinner, 2)).ruleId).toBe(flat);

    // Time of day: start inclusive, end exclusive.
    const evening = await add({
      amountCents: 9000,
      amountType: "PER_BOOKING",
      startTime: "19:00",
      endTime: "21:00",
    });
    expect((await quote(dinner, 2)).ruleId).toBe(evening);
    expect((await quote(lunch, 2)).ruleId).toBe(flat);
    expect((await quote(slotAtLocal("21:00"), 2)).ruleId).toBe(flat);

    // Day of week.
    const otherDay = await add({
      amountCents: 9500,
      amountType: "PER_BOOKING",
      daysOfWeek: [(weekday + 1) % 7],
    });
    expect((await quote(dinner, 2)).ruleId).toBe(evening);
    const rightDay = await add({
      amountCents: 9600,
      amountType: "PER_BOOKING",
      daysOfWeek: [weekday],
    });
    expect((await quote(dinner, 2)).ruleId).toBe(rightDay);

    // Specific dates: only those dates, and daysOfWeek is ignored.
    const elsewhere = localDateKey(m.timeZone, 6);
    const notToday = await add({
      amountCents: 9700,
      amountType: "PER_BOOKING",
      specificDates: [elsewhere],
    });
    expect((await quote(dinner, 2)).ruleId).toBe(rightDay);
    const thisDate = await add({
      amountCents: 9800,
      amountType: "PER_BOOKING",
      specificDates: [date],
      daysOfWeek: [(weekday + 1) % 7],
    });
    expect((await quote(dinner, 2)).ruleId).toBe(thisDate);

    // Inactive never counts.
    await updateDepositRuleRaw(m.token, rid, thisDate, { active: false });
    expect((await quote(dinner, 2)).ruleId).toBe(rightDay);

    // Availability carries the same per-slot answer.
    const after = unwrap(await getPublicAvailabilityRaw(rid, date, 2))
      .slots as any[];
    expect(after.find((s) => s.scheduledAt === dinner).depositCents).toBe(9600);

    for (const id of [otherDay, notToday, ...created]) {
      await deleteDepositRuleRaw(m.token, rid, id).catch(() => {});
    }
  });

  test("TC-1272: the staff quote — owner and POS agree; bad input refused; depositsEnabled is true with no rule", async () => {
    const at = (await nextSlot(t, 4)).scheduledAt;
    const owner = unwrap(
      await depositQuoteOwnerRaw(t.token, t.restaurantId, at, 3)
    );
    const pos = unwrap(
      await depositQuoteTabletRaw(t.tabletToken, t.managerSession, at, 3)
    );
    expect(owner).toEqual(pos);
    expect(owner.depositsEnabled).toBe(true);
    expect(owner.amountCents).toBe(6000);
    expect(owner.ruleId).toBeTruthy();
    expect(owner.refundWindowHours).toBe(24);

    const none = unwrap(
      await depositQuoteOwnerRaw(m.token, m.restaurantId, at, 2)
    );
    expect(none).toEqual({
      depositsEnabled: true,
      amountCents: null,
      ruleId: null,
      refundWindowHours: 24,
    });

    for (const party of [0, 100, "x"]) {
      const res = await depositQuoteOwnerRaw(
        t.token,
        t.restaurantId,
        at,
        party
      );
      expect(res.status).toBe(400);
      expect(errorCode(res.data)).toBe("RESERVATION_PARTY_SIZE_INVALID");
    }
    const badTime = await depositQuoteOwnerRaw(
      t.token,
      t.restaurantId,
      "not-a-date",
      2
    );
    expect(badTime.status).toBe(400);
    expect(errorCode(badTime.data)).toBe("SYSTEM_VALIDATION_ERROR");
  });

  test("TC-1273: availability shows each slot's amount and the policy text — no amount in it, in the guest's language, same text stored at booking", async () => {
    await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      depositPolicyNote: "Parties over 8 please call.",
    });
    const date = localDateKey(t.timeZone, 6);
    const en = unwrap(await getPublicAvailabilityRaw(t.restaurantId, date, 2));
    expect(en.slots[0].depositCents).toBe(TWO_GUESTS);
    expect(en.depositPolicy.refundWindowHours).toBe(24);
    expect(en.depositPolicy.text).toContain("Parties over 8 please call.");
    expect(en.depositPolicy.text).toContain("24");
    expect(en.depositPolicy.text).not.toMatch(/\$\d/);

    const es = await apiRequestRaw<any>(
      "GET",
      `/api/public/restaurants/${t.restaurantId}/reservation-availability?date=${date}&partySize=2`,
      undefined,
      undefined,
      { "Accept-Language": "es" }
    );
    expect(es.data.data.depositPolicy.text).not.toBe(en.depositPolicy.text);
    expect(es.data.data.depositPolicy.text).toMatch(/dep[oó]sito/i);

    const b = await bookPublic("Policy text", {
      scheduledAt: en.slots[1].scheduledAt,
    });
    expect(b.deposit.policyText).toBe(en.depositPolicy.text);
    expect(b.deposit.refundWindowHours).toBe(24);
    await cancelManagedReservationRaw(b.token);
    await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      depositPolicyNote: null,
    });
  });

  test("TC-1274: a booking that owes a deposit is refused without policyAccepted, before anything is booked", async () => {
    const guestName = name("No policy");
    const at = (await nextSlot(t, 3)).scheduledAt;
    for (const policyAccepted of [undefined, false, "true"]) {
      const res = await createPublicReservationRaw(t.restaurantId, {
        partySize: 2,
        scheduledAt: at,
        guestName,
        guestPhone: phone(),
        policyAccepted,
      });
      expect(res.status, msg(res.data)).toBe(400);
      expect(errorCode(res.data)).toBe("DEPOSIT_POLICY_NOT_ACCEPTED");
    }
    const search = unwrap(
      await searchReservationsOwnerRaw(t.token, t.restaurantId, guestName)
    );
    expect(Array.isArray(search) ? search : search.reservations).toEqual([]);
  });

  test("TC-1275: the 201 carries the deposit block, the intent is a real destination charge, and no confirmation goes out before payment", async () => {
    const b = await bookPublic("Intent shape");
    expect(b.deposit).toMatchObject({
      amountCents: TWO_GUESTS,
      status: "PENDING",
      refundWindowHours: 24,
    });
    expect(b.deposit.publishableKey).toMatch(/^pk_test_/);
    expect(
      new Date(b.deposit.expiresAt).getTime() - Date.now()
    ).toBeGreaterThan(14 * 60_000);
    expect(msg({ message: b.raw.message ?? "" })).toBeDefined();

    const pi = await retrieveIntent(b.intentId);
    expect(pi.amount).toBe(TWO_GUESTS);
    expect(pi.currency).toBe("usd");
    expect(pi.status).toBe("requires_payment_method");
    expect(pi.payment_method_types).toEqual(["card"]);
    expect(pi.transfer_data.destination).toBe(t.stripeAccountId);
    expect(pi.on_behalf_of).toBe(t.stripeAccountId);
    // 2.9% + $0.30 of $40.00, the orders' estimate; nothing on the guest's bill.
    expect(pi.application_fee_amount).toBe(146);
    expect(pi.metadata.type).toBe("reservation_deposit");
    expect(pi.metadata.reservationId).toBe(b.id);
    expect(pi.metadata.restaurantId).toBe(t.restaurantId);

    expect(smsTypesOf(b.id)).toEqual([]);
    const view = await manage(b.token);
    expect(view.status).toBe("BOOKED");
    expect(view.deposit).toMatchObject({
      amountCents: TWO_GUESTS,
      status: "PENDING",
      refundedCents: 0,
      paidAt: null,
    });
    expect(view.depositDue.amountCents).toBe(TWO_GUESTS);
    expect(view.depositDue.policyAccepted).toBe(true);
    expect(view.depositDue.clientSecret).toBeTruthy();
    expect(view.depositDue.lastPaymentError).toBeNull();
    await cancelManagedReservationRaw(b.token);
  });

  test("TC-1276: a real 4242 charge + its real webhook → PAID, then and only then the confirmation; redelivery changes nothing; a bad signature is refused", async () => {
    const guestPhone = phone();
    const slot = (await nextSlot(t, 3)).scheduledAt;
    const clientRequestId = `dep-${runId}-paid`;
    const body = {
      partySize: 2,
      scheduledAt: slot,
      guestName: name("Paid deposit"),
      guestPhone,
      policyAccepted: true,
      clientRequestId,
    };
    const created = await createPublicReservationRaw(t.restaurantId, body);
    expect(created.status, msg(created.data)).toBe(201);
    const d = unwrap(created);
    const intentId = intentIdFromClientSecret(d.deposit.clientSecret);
    const token = String(d.manageUrl).split("/").pop() as string;
    const replayBefore = await createPublicReservationRaw(t.restaurantId, body);
    expect(replayBefore.status).toBe(200);
    expect(unwrap(replayBefore).deposit.clientSecret).toBe(
      d.deposit.clientSecret
    );

    const confirmed = await confirmIntent(intentId, "pm_card_visa");
    expect(confirmed.data.status).toBe("succeeded");

    // The money moved but the backend hasn't heard yet.
    expect((await manage(token)).deposit.status).toBe("PENDING");

    const event = await findStripeEvent("payment_intent.succeeded", intentId);
    expect(await deliverBadlySignedEvent(event)).toBe(400);
    expect((await manage(token)).deposit.status).toBe("PENDING");

    const delivered = await deliverStripeEvent(event);
    expect(delivered.status, delivered.body).toBeLessThan(300);

    const view = await manage(token);
    expect(view.deposit.status).toBe("PAID");
    expect(view.deposit.paidAt).toBeTruthy();
    expect(view.depositDue).toBeNull();
    expect(view.depositPolicy.refundableUntil).toBeTruthy();
    expect(smsTypesOf(d.id ?? d.reservationId)).toContain(
      "RESERVATION_CONFIRMED"
    );

    const smsBefore = smsTypesOf(d.id ?? d.reservationId).length;
    const again = await deliverStripeEvent(event);
    expect(again.status).toBeLessThan(300);
    expect(smsTypesOf(d.id ?? d.reservationId).length).toBe(smsBefore);

    const replayAfter = await createPublicReservationRaw(t.restaurantId, body);
    expect(replayAfter.status).toBe(200);
    expect(unwrap(replayAfter).deposit.clientSecret).toBeNull();
    expect(unwrap(replayAfter).deposit.status).toBe("PAID");

    const row = await ownerRow({
      guestName: body.guestName,
      id: d.id ?? d.reservationId,
    });
    expect(row.deposit).toMatchObject({
      amountCents: TWO_GUESTS,
      status: "PAID",
      refundedCents: 0,
      refundFailed: false,
    });
    const scheduledDate = localDateKey(t.timeZone, 0, new Date(slot));
    const hostRows = unwrap(
      await getHostRaw(t.tabletToken, t.managerSession, scheduledDate)
    ) as any[];
    expect(hostRows.find((r) => r.id === row.id).deposit.status).toBe("PAID");
    const dayRows = unwrap(
      await listReservationsOwnerRaw(t.token, t.restaurantId, {
        date: scheduledDate,
      })
    );
    expect(
      (Array.isArray(dayRows) ? dayRows : dayRows.reservations).find(
        (r: any) => r.id === row.id
      ).deposit.status
    ).toBe("PAID");

    // The money sits with the restaurant.
    const charge = (
      await stripeApi("GET", `/charges/${confirmed.data.latest_charge}`)
    ).data;
    expect(charge.destination).toBe(t.stripeAccountId);
  });

  test("TC-1277: a declined card leaves it PENDING with the reason on the manage view; the same intent then pays", async () => {
    const b = await bookPublic("Declined");
    const declined = await confirmIntent(b.intentId, "pm_card_chargeDeclined");
    expect(declined.status).toBe(402);
    await fireStripeEvent("payment_intent.payment_failed", b.intentId);
    const view = await manage(b.token);
    expect(view.deposit.status).toBe("PENDING");
    expect(view.status).toBe("BOOKED");
    expect(view.depositDue.lastPaymentError).toBeTruthy();
    expect(view.depositDue.clientSecret).toBeTruthy();
    expect(smsTypesOf(b.id)).toEqual([]);

    await payIntentAndFireWebhook(b.intentId);
    const paid = await manage(b.token);
    expect(paid.deposit.status).toBe("PAID");
    expect(paid.depositDue).toBeNull();
  });

  test("TC-1278: a phone booking — deposit due, request text instead of confirmation, the guest accepts then pays on the manage page", async () => {
    const row = await bookOwner("Phone deposit");
    expect(row.deposit).toMatchObject({
      amountCents: TWO_GUESTS,
      status: "PENDING",
    });
    expect(smsTypesOf(row.id).join()).not.toContain("CONFIRMED");
    expect(smsTypesOf(row.id).length).toBe(1);
    const token = localSql<{ manageToken: string }>(
      `select "manageToken" from "Reservation" where id = '${row.id}'`
    )[0]!.manageToken;

    const view = await manage(token);
    expect(view.depositDue.policyAccepted).toBe(false);
    expect(view.depositDue.clientSecret).toBeNull();
    expect(view.depositPolicy.text).toBeTruthy();

    const refused = await acceptDepositPolicyRaw(token, {});
    expect(refused.status).toBe(400);
    expect(errorCode(refused.data)).toBe("DEPOSIT_POLICY_NOT_ACCEPTED");
    const unknown = await acceptDepositPolicyRaw("not-a-token", {
      policyAccepted: true,
    });
    expect(unknown.status).toBe(404);

    const accepted = await acceptDepositPolicyRaw(token, {
      policyAccepted: true,
    });
    expect(accepted.status, msg(accepted.data)).toBe(200);
    const after = unwrap(accepted);
    expect(after.depositDue.policyAccepted).toBe(true);
    expect(after.depositDue.clientSecret).toBeTruthy();
    expect(after.depositDue.publishableKey).toMatch(/^pk_test_/);

    await payIntentAndFireWebhook(
      intentIdFromClientSecret(after.depositDue.clientSecret)
    );
    const paid = await manage(token);
    expect(paid.deposit.status).toBe("PAID");
    expect(smsTypesOf(row.id).join()).toContain("CONFIRMED");

    const notDue = await acceptDepositPolicyRaw(token, {
      policyAccepted: true,
    });
    expect(notDue.status).toBe(409);
    expect(errorCode(notDue.data)).toBe("DEPOSIT_NOT_DUE");
  });

  test("TC-1279: guest cancels before the window → automatic full refund, on Stripe too, with the transfer reversed", async () => {
    const b = await bookAndPay("Guest cancel early");
    const view = await manage(b.token);
    expect(new Date(view.depositPolicy.refundableUntil).getTime()).toBe(
      new Date(b.scheduledAt).getTime() - 24 * HOUR
    );
    const res = await cancelManagedReservationRaw(b.token);
    expect(res.status, msg(res.data)).toBe(200);
    expect(msg(res.data)).toContain("$40.00");
    expect(msg(res.data).toLowerCase()).toContain("refund");
    expect(unwrap(res).deposit.status).toBe("REFUNDED");
    expect(unwrap(res).deposit.refundedCents).toBe(TWO_GUESTS);

    const refunds = await listRefunds(b.intentId);
    expect(refunds.map((r) => r.amount)).toEqual([TWO_GUESTS]);
    const charge = (
      await stripeApi("GET", `/charges/${refunds[0]!.charge}`, {
        "expand[]": "transfer",
      })
    ).data;
    expect(charge.refunded).toBe(true);
    expect(charge.transfer.amount_reversed).toBe(charge.transfer.amount);
    // "Not returned on a refund": the platform keeps the card cost.
    expect(charge.application_fee_amount).toBe(146);
  });

  test("TC-1280: guest cancels inside the window → cancelled, deposit FORFEITED, no money moves, policy + phone shown", async () => {
    const b = await bookAndPay("Guest cancel late", {
      scheduledAt: await slotInHours(t, 3),
    });
    const before = await manage(b.token);
    expect(
      new Date(before.depositPolicy.refundableUntil).getTime()
    ).toBeLessThan(Date.now());
    const res = await cancelManagedReservationRaw(b.token);
    expect(res.status, msg(res.data)).toBe(200);
    expect(msg(res.data)).toContain("$40.00");
    expect(msg(res.data).toLowerCase()).toContain("not refunded");
    expect(unwrap(res).deposit.status).toBe("FORFEITED");
    expect(await listRefunds(b.intentId)).toEqual([]);
    const view = await manage(b.token);
    expect(view.status).toBe("CANCELLED");
    expect(view.depositPolicy.text).toBeTruthy();
    expect(view).toHaveProperty("restaurantPhone");
  });

  test("TC-1281: guest cancels with the deposit unpaid → intent cancelled, deposit CANCELLED", async () => {
    const b = await bookPublic("Guest cancel unpaid");
    const res = await cancelManagedReservationRaw(b.token);
    expect(res.status, msg(res.data)).toBe(200);
    expect(unwrap(res).deposit.status).toBe("CANCELLED");
    expect((await retrieveIntent(b.intentId)).status).toBe("canceled");
    await fireStripeEvent("payment_intent.canceled", b.intentId);
    expect((await manage(b.token)).deposit.status).toBe("CANCELLED");
  });

  test("TC-1282: restaurant cancels — owner and POS always refund in full, even inside the window; a part-refunded deposit refunds what's left", async () => {
    const owner = await bookAndPay("Restaurant cancel", {
      scheduledAt: await slotInHours(t, 2),
    });
    const patched = await patchReservationOwnerRaw(
      t.token,
      t.restaurantId,
      owner.id,
      {
        status: "CANCELLED",
      }
    );
    expect(patched.status, msg(patched.data)).toBe(200);
    expect(unwrap(patched).deposit).toMatchObject({
      status: "REFUNDED",
      refundedCents: TWO_GUESTS,
      refundFailed: false,
    });
    expect(await refundedOnStripe(owner.intentId)).toBe(TWO_GUESTS);

    const pos = await bookAndPay("POS cancel");
    const cancel = await reservationStatusTabletRaw(
      t.tabletToken,
      t.managerSession,
      pos.id,
      "cancel"
    );
    expect(cancel.status, msg(cancel.data)).toBe(200);
    expect(unwrap(cancel).deposit.status).toBe("REFUNDED");
    expect(await refundedOnStripe(pos.intentId)).toBe(TWO_GUESTS);

    const part = await bookAndPay("Part refunded cancel");
    const partial = await refundDepositOwnerRaw(
      t.token,
      t.restaurantId,
      part.id,
      {
        amountCents: 1500,
        reason: "Goodwill",
      }
    );
    expect(partial.status, msg(partial.data)).toBe(200);
    const rest = await reservationStatusTabletRaw(
      t.tabletToken,
      t.managerSession,
      part.id,
      "cancel"
    );
    expect(rest.status, msg(rest.data)).toBe(200);
    expect(unwrap(rest).deposit).toMatchObject({
      status: "REFUNDED",
      refundedCents: TWO_GUESTS,
    });
    const amounts = (await listRefunds(part.intentId))
      .map((r) => r.amount)
      .sort();
    expect(amounts).toEqual([1500, 2500]);

    // A staff cancel of an unpaid booking cancels the intent.
    const unpaid = await bookPublic("Unpaid staff cancel");
    const pending = await reservationStatusTabletRaw(
      t.tabletToken,
      t.managerSession,
      unpaid.id,
      "cancel"
    );
    expect(unwrap(pending).deposit.status).toBe("CANCELLED");
    expect((await retrieveIntent(unpaid.intentId)).status).toBe("canceled");
  });

  test("TC-1283: no-show → FORFEITED, no money moves; reinstating leaves it FORFEITED; a manager can still refund it", async () => {
    const b = await bookAndPay("No-show");
    const noShow = await reservationStatusTabletRaw(
      t.tabletToken,
      t.managerSession,
      b.id,
      "no_show"
    );
    expect(noShow.status, msg(noShow.data)).toBe(200);
    expect(unwrap(noShow).deposit.status).toBe("FORFEITED");
    expect(await listRefunds(b.intentId)).toEqual([]);

    const back = await reservationStatusTabletRaw(
      t.tabletToken,
      t.managerSession,
      b.id,
      "reinstate"
    );
    expect(back.status, msg(back.data)).toBe(200);
    expect(unwrap(back).deposit.status).toBe("FORFEITED");

    const refund = await refundDepositOwnerRaw(t.token, t.restaurantId, b.id, {
      reason: "Illness, goodwill",
    });
    expect(refund.status, msg(refund.data)).toBe(200);
    expect(unwrap(refund).deposit.status).toBe("REFUNDED");
    expect(await refundedOnStripe(b.intentId)).toBe(TWO_GUESTS);

    // Owner PATCH no-show follows the same rule.
    const owner = await bookAndPay("Owner no-show");
    const patched = await patchReservationOwnerRaw(
      t.token,
      t.restaurantId,
      owner.id,
      {
        status: "NO_SHOW",
      }
    );
    expect(patched.status, msg(patched.data)).toBe(200);
    expect(unwrap(patched).deposit.status).toBe("FORFEITED");
  });

  test("TC-1284: manual refund (owner) — reason required, amount checked, part then rest, nothing left, no deposit", async () => {
    const b = await bookAndPay("Manual refund");
    const noReason = await refundDepositOwnerRaw(
      t.token,
      t.restaurantId,
      b.id,
      {}
    );
    expect(noReason.status).toBe(400);
    expect(errorCode(noReason.data)).toBe("DEPOSIT_REFUND_REASON_REQUIRED");
    const longReason = await refundDepositOwnerRaw(
      t.token,
      t.restaurantId,
      b.id,
      {
        reason: "x".repeat(201),
      }
    );
    expect(longReason.status).toBe(400);
    for (const amountCents of [0, -5, 1.5, TWO_GUESTS + 1, "abc"]) {
      const res = await refundDepositOwnerRaw(t.token, t.restaurantId, b.id, {
        amountCents,
        reason: "Testing",
      });
      expect(res.status, String(amountCents)).toBe(400);
      expect(errorCode(res.data)).toBe("DEPOSIT_REFUND_INVALID_AMOUNT");
    }

    const part = await refundDepositOwnerRaw(t.token, t.restaurantId, b.id, {
      amountCents: 1000,
      reason: "Part refund",
    });
    expect(part.status, msg(part.data)).toBe(200);
    expect(unwrap(part).refundedCents).toBe(1000);
    expect(unwrap(part).deposit).toMatchObject({
      status: "PARTIALLY_REFUNDED",
      refundedCents: 1000,
    });
    expect(await refundedOnStripe(b.intentId)).toBe(1000);
    const event = (await listRefunds(b.intentId))[0]!;
    await fireStripeEvent("refund.created", event.id as string);
    expect((await manage(b.token)).deposit.refundedCents).toBe(1000);

    const tooMuch = await refundDepositOwnerRaw(t.token, t.restaurantId, b.id, {
      amountCents: TWO_GUESTS - 999,
      reason: "Over",
    });
    expect(tooMuch.status).toBe(400);

    const rest = await refundDepositOwnerRaw(t.token, t.restaurantId, b.id, {
      reason: "The rest",
    });
    expect(rest.status, msg(rest.data)).toBe(200);
    expect(unwrap(rest).refundedCents).toBe(TWO_GUESTS - 1000);
    expect(unwrap(rest).deposit).toMatchObject({
      status: "REFUNDED",
      refundedCents: TWO_GUESTS,
    });
    expect(await refundedOnStripe(b.intentId)).toBe(TWO_GUESTS);

    const empty = await refundDepositOwnerRaw(t.token, t.restaurantId, b.id, {
      reason: "Again",
    });
    expect(empty.status).toBe(409);
    expect(errorCode(empty.data)).toBe("DEPOSIT_NOT_REFUNDABLE");

    const none = await bookOwner("No deposit row", { tenant: m });
    const noDeposit = await refundDepositOwnerRaw(
      m.token,
      m.restaurantId,
      none.id,
      {
        reason: "Nothing",
      }
    );
    expect(noDeposit.status).toBe(404);
    expect(errorCode(noDeposit.data)).toBe("DEPOSIT_NOT_FOUND");

    const unpaid = await bookPublic("Unpaid refund");
    const pending = await refundDepositOwnerRaw(
      t.token,
      t.restaurantId,
      unpaid.id,
      {
        reason: "Unpaid",
      }
    );
    expect(pending.status).toBe(409);
    expect(errorCode(pending.data)).toBe("DEPOSIT_NOT_REFUNDABLE");
    await cancelManagedReservationRaw(unpaid.token);
  });

  test("TC-1285: manual refund (POS) — a server without APPROVE_REFUND is refused, a manager PIN approves, a manager's own session works", async () => {
    const session = serverSession;
    const b = await bookAndPay("POS refund");
    const refused = await refundDepositTabletRaw(t.tabletToken, session, b.id, {
      amountCents: 500,
      reason: "No authority",
    });
    // Their own capability is missing, so the policy asks for a manager's PIN.
    expect(refused.status).toBe(400);
    expect(errorCode(refused.data)).toBe("STAFF_PIN_REQUIRED");
    const selfApproved = await refundDepositTabletRaw(
      t.tabletToken,
      session,
      b.id,
      {
        amountCents: 500,
        reason: "Own PIN is not authority",
        managerPin: "5211",
        approverStaffMemberId: serverId,
      }
    );
    expect(selfApproved.status).toBe(403);
    expect(await listRefunds(b.intentId)).toEqual([]);

    const wrongPin = await refundDepositTabletRaw(
      t.tabletToken,
      session,
      b.id,
      {
        amountCents: 500,
        reason: "Wrong pin",
        managerPin: "0000",
        approverStaffMemberId: t.managerId,
      }
    );
    expect(wrongPin.status).toBeGreaterThanOrEqual(400);
    expect(await listRefunds(b.intentId)).toEqual([]);

    const approved = await refundDepositTabletRaw(
      t.tabletToken,
      session,
      b.id,
      {
        amountCents: 500,
        reason: "Approved by manager",
        managerPin: t.managerPin,
        approverStaffMemberId: t.managerId,
      }
    );
    expect(approved.status, msg(approved.data)).toBe(200);
    expect(unwrap(approved).deposit.refundedCents).toBe(500);

    const own = await refundDepositTabletRaw(
      t.tabletToken,
      t.managerSession,
      b.id,
      {
        reason: "Manager, the rest",
      }
    );
    expect(own.status, msg(own.data)).toBe(200);
    expect(unwrap(own).deposit.status).toBe("REFUNDED");
    expect(await refundedOnStripe(b.intentId)).toBe(TWO_GUESTS);
  });

  test("TC-1286: opening the check applies the deposit as a tender — remaining falls by it, the deposit reads APPLIED, a manual refund says refund through the check", async () => {
    const b = await bookAndPay("Apply to check");
    const { orderId } = await seatAndOpenCheck(b, 60);
    const order = await orderDetail(orderId);
    const leg = depositLeg(order);
    expect(leg).toBeTruthy();
    expect(Number(leg.amount)).toBe(40);
    expect(leg.status).toBe("SUCCEEDED");
    expect(leg.purpose).toBe("ORDER");
    expect(leg.tipAmount).toBeNull();
    expect(leg.stripePaymentIntentId).toBeNull();
    expect(String(leg.note)).toMatch(/^reservation_deposit:/);

    const row = await ownerRow(b);
    expect(row.deposit.status).toBe("APPLIED");

    const refund = await refundDepositOwnerRaw(t.token, t.restaurantId, b.id, {
      reason: "Should refuse",
    });
    expect(refund.status).toBe(409);
    expect(errorCode(refund.data)).toBe("DEPOSIT_APPLIED_REFUND_THROUGH_CHECK");
    expect(msg(refund.data).toLowerCase()).toContain("check");

    // Money is still due: settle the rest in cash and it closes.
    const settle = await settleTabCashRaw(
      t.tabletToken,
      t.managerSession,
      orderId,
      {
        amount: 20,
        cashTendered: 20,
        idempotencyKey: `cash-${runId}-${++seq}`,
      }
    );
    expect(settle.status, msg(settle.data)).toBe(200);
    expect(settle.data.remaining).toBe(0);
    expect(settle.data.closed).toBe(true);
    expect((await ownerRow(b)).deposit.status).toBe("APPLIED");
  });

  test("TC-1287: close-covered — refused while money is due or with no deposit; the excess goes back to the card; a replay answers 0", async () => {
    const due = await bookAndPay("Not covered");
    const notCovered = await seatAndOpenCheck(due, 60);
    const refused = await closeCoveredRaw(
      t.tabletToken,
      t.managerSession,
      notCovered.orderId
    );
    expect(refused.status).toBe(409);
    expect(errorCode(refused.data)).toBe("TAB_NOT_COVERED");
    expect((refused.data as any).details?.remaining).toBe(20);

    const plainTable = await newTable();
    const plain = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, plainTable)
    );
    expect(plain.status, msg(plain.data)).toBe(201);
    const noDeposit = await closeCoveredRaw(
      t.tabletToken,
      t.managerSession,
      plain.data.id as string
    );
    expect(noDeposit.status).toBe(409);
    expect(errorCode(noDeposit.data)).toBe("TAB_NOT_COVERED");

    const b = await bookAndPay("Covered");
    const { orderId } = await seatAndOpenCheck(b, ITEM_PRICE);
    const closed = await closeCoveredRaw(
      t.tabletToken,
      t.managerSession,
      orderId
    );
    expect(closed.status, msg(closed.data)).toBe(200);
    expect(closed.data).toMatchObject({
      remaining: 0,
      closed: true,
      excessRefundedCents: 3000,
    });
    expect(await refundedOnStripe(b.intentId)).toBe(3000);
    const row = await ownerRow(b);
    expect(row.deposit).toMatchObject({
      status: "APPLIED",
      refundedCents: 3000,
    });
    const order = await orderDetail(orderId);
    expect(Number(depositLeg(order).amount)).toBe(10);

    const replay = await closeCoveredRaw(
      t.tabletToken,
      t.managerSession,
      orderId
    );
    expect(replay.status, msg(replay.data)).toBe(200);
    expect(replay.data).toMatchObject({
      remaining: 0,
      closed: true,
      excessRefundedCents: 0,
    });
    expect(await refundedOnStripe(b.intentId)).toBe(3000);
  });

  test("TC-1288: cancelling an open check puts the deposit back to PAID with no refund; the next check re-applies it", async () => {
    const b = await bookAndPay("Check cancel");
    const first = await seatAndOpenCheck(b, 60);
    expect((await ownerRow(b)).deposit.status).toBe("APPLIED");

    const preview = await apiRequestRaw<any>(
      "GET",
      `/api/tablet/orders/${first.orderId}/cancel-preview`,
      undefined,
      t.tabletToken,
      { "X-Staff-Session": t.managerSession }
    );
    expect(preview.status, msg(preview.data)).toBe(200);
    expect(JSON.stringify(preview.data.data ?? preview.data)).not.toContain(
      "RESERVATION_DEPOSIT"
    );

    const cancel = await cancelTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      first.orderId,
      "Wrong table"
    );
    expect(cancel.status, msg(cancel.data)).toBe(200);
    const row = await ownerRow(b);
    expect(row.deposit.status).toBe("PAID");
    expect(row.deposit.refundedCents).toBe(0);
    expect(await listRefunds(b.intentId)).toEqual([]);
    const cancelled = await orderDetail(first.orderId);
    expect(depositLeg(cancelled).status).toBe("REFUNDED");

    const again = await createTabletOrderRaw(
      t.tabletToken,
      t.managerSession,
      openCheckBody(t, first.tableId, { reservationId: b.id }, 60)
    );
    expect(again.status, msg(again.data)).toBe(201);
    expect((await ownerRow(b)).deposit.status).toBe("APPLIED");
    const second = await orderDetail(again.data.id as string);
    expect(Number(depositLeg(second).amount)).toBe(40);
    expect(depositLeg(second).status).toBe("SUCCEEDED");
  });

  test("TC-1289: Remove this payment on the deposit leg — back to the card, the check shows it due again", async () => {
    const b = await bookAndPay("Void leg");
    const { orderId } = await seatAndOpenCheck(b, 60);
    const legId = depositLeg(await orderDetail(orderId)).id as string;
    const preview = await voidLegPreviewRaw(
      t.tabletToken,
      t.managerSession,
      orderId,
      legId
    );
    expect(preview.status, msg(preview.data)).toBe(200);
    const voided = await voidLegRaw(
      t.tabletToken,
      t.managerSession,
      orderId,
      legId,
      {
        reason: "Guest asked",
      }
    );
    expect(voided.status, msg(voided.data)).toBe(200);
    expect(await refundedOnStripe(b.intentId)).toBe(TWO_GUESTS);
    const closeNow = await closeCoveredRaw(
      t.tabletToken,
      t.managerSession,
      orderId
    );
    expect(closeNow.status).toBe(409);
    expect(errorCode(closeNow.data)).toBe("TAB_NOT_COVERED");
    expect((closeNow.data as any).details?.remaining ?? 60).toBe(60);
    const row = await ownerRow(b);
    expect(row.deposit.refundedCents).toBe(TWO_GUESTS);
  });

  test("TC-1290: cancelling a CLOSED check is a real refund back to the card", async () => {
    const b = await bookAndPay("Closed check");
    const { orderId } = await seatAndOpenCheck(b, TWO_GUESTS / 100);
    const closed = await closeCoveredRaw(
      t.tabletToken,
      t.managerSession,
      orderId
    );
    expect(closed.status, msg(closed.data)).toBe(200);
    expect(closed.data.excessRefundedCents).toBe(0);
    const preview = await apiRequestRaw<any>(
      "GET",
      `/api/tablet/orders/${orderId}/cancel-preview`,
      undefined,
      t.tabletToken,
      { "X-Staff-Session": t.managerSession }
    );
    expect(preview.status, msg(preview.data)).toBe(200);
    const totals = (preview.data.data ?? preview.data).totals;
    expect(Number(totals.card)).toBe(40);
    const cancel = await apiRequestRaw<any>(
      "POST",
      `/api/tablet/cancel-order/${orderId}`,
      { reason: "Guest complaint", refundSettledPayments: true },
      t.tabletToken,
      { "X-Staff-Session": t.managerSession }
    );
    expect(cancel.status, msg(cancel.data)).toBe(200);
    expect(await refundedOnStripe(b.intentId)).toBe(TWO_GUESTS);
  });

  test("TC-1291: seating a party whose deposit is still PENDING cancels the intent and the guest is asked for nothing more", async () => {
    const b = await bookPublic("Seated unpaid");
    const tableId = await newTable();
    const seat = await seatReservationTabletRaw(
      t.tabletToken,
      t.managerSession,
      b.id,
      { tableIds: [tableId] }
    );
    expect(seat.status, msg(seat.data)).toBeLessThan(300);
    expect((await retrieveIntent(b.intentId)).status).toBe("canceled");
    const view = await manage(b.token);
    expect(view.deposit.status).toBe("CANCELLED");
    expect(view.depositDue).toBeNull();
  });

  test("TC-1292: a guest's time or party change keeps the deposit amount", async () => {
    const b = await bookAndPay("Guest change");
    const newAt = (await nextSlot(t, 4)).scheduledAt;
    const res = await apiRequestRaw<any>(
      "PATCH",
      `/api/public/reservations/manage/${b.token}`,
      { scheduledAt: newAt, partySize: 4 }
    );
    expect(res.status, msg(res.data)).toBe(200);
    const view = await manage(b.token);
    expect(view.partySize).toBe(4);
    expect(view.deposit.amountCents).toBe(TWO_GUESTS);
    expect(view.deposit.status).toBe("PAID");
  });

  test("TC-1293: search across dates — name, phone digits, confirmation code; both surfaces; short query refused; deposit on the rows", async () => {
    const near = await bookAndPay("Searchable near", { daysAhead: 2 });
    const far = await bookPublic("Searchable far", { daysAhead: 20 });
    const code = String(near.raw.confirmationCode);
    const asRows = (d: any) => (Array.isArray(d) ? d : d.reservations) as any[];

    const byName = asRows(
      unwrap(
        await searchReservationsOwnerRaw(
          t.token,
          t.restaurantId,
          `searchable ${""}`.trim() + " near " + runId
        )
      )
    );
    expect(byName.map((r) => r.id)).toEqual([near.id]);
    expect(byName[0].deposit.status).toBe("PAID");
    expect(byName[0]).toHaveProperty("tables");

    const both = asRows(
      unwrap(
        await searchReservationsOwnerRaw(t.token, t.restaurantId, "Searchable")
      )
    ).map((r) => r.id);
    expect(both).toEqual(expect.arrayContaining([near.id, far.id]));
    // Newest first.
    expect(both.indexOf(far.id)).toBeLessThan(both.indexOf(near.id));

    const byPhone = asRows(
      unwrap(
        await searchReservationsOwnerRaw(
          t.token,
          t.restaurantId,
          near.guestPhone.slice(-7)
        )
      )
    );
    expect(byPhone.map((r) => r.id)).toContain(near.id);

    const byCode = asRows(
      unwrap(
        await searchReservationsOwnerRaw(
          t.token,
          t.restaurantId,
          code.toLowerCase()
        )
      )
    );
    expect(byCode.map((r) => r.id)).toEqual([near.id]);

    const pos = await searchReservationsTabletRaw(
      t.tabletToken,
      t.managerSession,
      code
    );
    expect(pos.status, msg(pos.data)).toBe(200);
    expect(asRows(unwrap(pos)).map((r) => r.id)).toEqual([near.id]);

    for (const q of ["a", "x".repeat(101)]) {
      const res = await searchReservationsOwnerRaw(t.token, t.restaurantId, q);
      expect(res.status).toBe(400);
      expect(errorCode(res.data)).toBe("RESERVATION_SEARCH_QUERY_INVALID");
    }
    const limited = asRows(
      unwrap(
        await searchReservationsOwnerRaw(
          t.token,
          t.restaurantId,
          "Searchable",
          1
        )
      )
    );
    expect(limited.length).toBe(1);
    await cancelManagedReservationRaw(far.token);
  });

  test("TC-1294: resend the pay link — 2-minute cooldown, 3 texts at most, PENDING only, both surfaces", async () => {
    const row = await bookOwner("Send link");
    // The booking's own request text counts as the first.
    const cooldown = await sendDepositLinkOwnerRaw(
      t.token,
      t.restaurantId,
      row.id
    );
    expect(cooldown.status).toBe(429);
    expect(errorCode(cooldown.data)).toBe("DEPOSIT_LINK_COOLDOWN");

    const age = () =>
      localSql(
        `update "SmsLog" set "createdAt" = "createdAt" - interval '3 minutes' where "reservationId" = '${row.id}'`
      );
    age();
    const second = await sendDepositLinkOwnerRaw(
      t.token,
      t.restaurantId,
      row.id
    );
    expect(second.status, msg(second.data)).toBe(200);
    expect((second.data as any).data.status).toBe("PENDING");
    expect((second.data as any).sms).toEqual({ status: "SENT", reason: null });

    age();
    const third = await sendDepositLinkTabletRaw(
      t.tabletToken,
      t.managerSession,
      row.id
    );
    expect(third.status, msg(third.data)).toBe(200);
    expect((third.data as any).sms.status).toBe("SENT");

    age();
    const limit = await sendDepositLinkTabletRaw(
      t.tabletToken,
      t.managerSession,
      row.id
    );
    expect(limit.status).toBe(409);
    expect(errorCode(limit.data)).toBe("DEPOSIT_LINK_LIMIT");

    const paid = await bookAndPay("Link not due");
    const notDue = await sendDepositLinkOwnerRaw(
      t.token,
      t.restaurantId,
      paid.id
    );
    expect(notDue.status).toBe(409);
    expect(errorCode(notDue.data)).toBe("DEPOSIT_NOT_DUE");

    const none = await bookOwner("Link none", { tenant: m });
    const noDeposit = await sendDepositLinkOwnerRaw(
      m.token,
      m.restaurantId,
      none.id
    );
    expect(noDeposit.status).toBe(404);
    expect(errorCode(noDeposit.data)).toBe("DEPOSIT_NOT_FOUND");
  });

  test("TC-1295: Require deposit with no matching rule charges the largest amount any active rule would charge this party; no rules → none", async () => {
    // m has no rules: the tick asks for nothing.
    const noRules = await bookOwner("Tick no rules", {
      tenant: m,
      extra: { requireDeposit: true },
    });
    expect(noRules.deposit ?? null).toBeNull();

    const big = unwrap(
      await createDepositRuleRaw(m.token, m.restaurantId, {
        amountCents: 2500,
        amountType: "PER_GUEST",
        minPartySize: 10,
      })
    );
    const flat = unwrap(
      await createDepositRuleRaw(m.token, m.restaurantId, {
        amountCents: 3000,
        amountType: "PER_BOOKING",
        minPartySize: 12,
      })
    );
    const inactive = unwrap(
      await createDepositRuleRaw(m.token, m.restaurantId, {
        amountCents: 99_000,
        amountType: "PER_BOOKING",
        minPartySize: 12,
        active: false,
      })
    );

    // A party of 2: nothing matches. Largest active: max(25 × 2, 30) = $50.
    const at = (await nextSlot(m, 4)).scheduledAt;
    const quote = unwrap(
      await depositQuoteOwnerRaw(m.token, m.restaurantId, at, 2)
    );
    expect(quote.amountCents).toBeNull();

    const noTick = await bookOwner("No tick", { tenant: m });
    expect(noTick.deposit ?? null).toBeNull();

    const ticked = await bookOwner("Ticked", {
      tenant: m,
      extra: { requireDeposit: true },
    });
    expect(ticked.deposit).toMatchObject({
      amountCents: 5000,
      status: "PENDING",
    });

    const pos = await createReservationTabletRaw(
      m.tabletToken,
      m.managerSession,
      {
        kind: "RESERVATION",
        partySize: 2,
        scheduledAt: new Date(
          Math.floor((Date.now() + 80 * HOUR) / 900_000) * 900_000
        ).toISOString(),
        guestName: name("POS ticked"),
        guestPhone: phone(),
        requireDeposit: true,
      }
    );
    expect(pos.status, msg(pos.data)).toBe(201);
    expect(unwrap(pos).deposit).toMatchObject({
      amountCents: 5000,
      status: "PENDING",
    });

    for (const r of [big, flat, inactive])
      await deleteDepositRuleRaw(m.token, m.restaurantId, r.id);
  });

  test("TC-1296: earnings by day report deposits at gross, fee, refunded and net", async () => {
    const b = await bookAndPay("Earnings");
    await refundDepositOwnerRaw(t.token, t.restaurantId, b.id, {
      amountCents: 1000,
      reason: "Earnings test",
    });
    const res = await apiRequestRaw<any>(
      "GET",
      `/api/subscriptions/restaurants/${t.restaurantId}/earnings-by-day?startDate=${localDateKey(t.timeZone, -1)}&endDate=${localDateKey(t.timeZone, 1)}`,
      undefined,
      t.token
    );
    expect(res.status, msg(res.data)).toBe(200);
    const days = (res.data.data?.days ??
      res.data.days ??
      res.data.data) as any[];
    const totals = days.reduce(
      (acc, d) => {
        const r = d.reservationDeposits;
        if (!r) return acc;
        acc.count += r.count;
        acc.gross += r.gross;
        acc.refunded += r.refunded;
        return acc;
      },
      { count: 0, gross: 0, refunded: 0 }
    );
    expect(totals.count).toBeGreaterThan(0);
    expect(totals.gross).toBeGreaterThanOrEqual(40);
    expect(totals.refunded).toBeGreaterThanOrEqual(10);
  });

  test("TC-1297: the unpaid sweep — an online hold past its time and a phone booking past its pay-by are released; never-expire is left alone @slow", async () => {
    test.setTimeout(7 * 60_000);
    const online = await bookPublic("Sweep online");
    await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      depositPhoneBookingPayHours: 1,
    });
    const phoneBooked = await bookOwner("Sweep phone");
    await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      depositPhoneBookingPayHours: null,
    });
    const neverExpires = await bookOwner("Sweep never");
    expect(neverExpires.deposit.status).toBe("PENDING");

    // Age both instead of waiting 15 minutes / an hour; the REAL sweep (every
    // five minutes in the running backend) does the rest.
    localSql(
      `update "ReservationDeposit" set "expiresAt" = now() - interval '1 minute' where "reservationId" in ('${online.id}', '${phoneBooked.id}')`
    );
    const phoneIntent = localSql<{ stripePaymentIntentId: string }>(
      `select "stripePaymentIntentId" from "ReservationDeposit" where "reservationId" = '${phoneBooked.id}'`
    )[0]!.stripePaymentIntentId;

    await expect
      .poll(
        () =>
          localSql<{ status: string }>(
            `select status from "Reservation" where id = '${online.id}'`
          )[0]!.status,
        { timeout: 6 * 60_000, intervals: [10_000] }
      )
      .toBe("CANCELLED");

    expect((await retrieveIntent(online.intentId)).status).toBe("canceled");
    const onlineView = await manage(online.token);
    expect(onlineView.deposit.status).toBe("CANCELLED");

    await expect
      .poll(
        () =>
          localSql<{ status: string }>(
            `select status from "Reservation" where id = '${phoneBooked.id}'`
          )[0]!.status,
        { timeout: 60_000, intervals: [5_000] }
      )
      .toBe("CANCELLED");
    if (phoneIntent) {
      expect((await retrieveIntent(phoneIntent)).status).toBe("canceled");
    }
    expect(smsTypesOf(phoneBooked.id).length).toBeGreaterThanOrEqual(2);

    const stillThere = localSql<{ status: string }>(
      `select status from "Reservation" where id = '${neverExpires.id}'`
    )[0]!.status;
    expect(stillThere).toBe("BOOKED");
  });
});
