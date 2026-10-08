/**
 * api-tips.spec.ts — tip pooling, tip-outs and cash tips (P2) on QA, every
 * policy option for its effect in exact cents (TC-588..596).
 *
 * No browser. A per-run throwaway restaurant with PAYROLL (→ TIP_MANAGEMENT),
 * table service on, one $10.00 menu item and a REGISTER device. Three people
 * worked today (manager-entered, already finished):
 *   Ana — Server, 60 min · Cal — Server, 40 min · Ben — Busser, 60 min.
 * Ana and Cal each open a check on the POS (so their tips are attributed to
 * them); the owner settles both in cash with tips: Ana $10.00 on a $20.00
 * check, Cal $6.00 on a $10.00 check. The tips report is computed live from
 * those orders under the CURRENT policy, so each test saves a policy and reads
 * the same day back.
 *
 * Not covered here (QA can't produce it): card-fee withholding needs a CAPTURED
 * card tip, which needs Stripe Terminal or a Connect-onboarded storefront. The
 * policy save + engine math for it are unit-tested in restaunax (tipEngine).
 *
 * Serial. Needs ADMIN creds. The tenant is moved to a zone where it is about
 * noon (zoneAtMidday), so "today's finished hours" hold at any hour.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  createStaffJobRaw,
  setMemberJobsRaw,
  payrollRaw,
  tipsRaw,
  tabletRaw,
  updateRestaurantSettingsApi,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  openRegisterSessionPos,
  createTabletOrderRaw,
  settleTabCashRaw,
  restaurantBasicInfoRaw,
  zoneAtMidday,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
/** Where the tenant is moved: about noon now, so today's finished hours
 *  and today's business day always line up (runs at any hour). */
const ZONE = zoneAtMidday();

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(new Date());
const minutesAgo = (m: number) =>
  new Date(Math.floor(Date.now() / 60_000) * 60_000 - m * 60_000).toISOString();

test.describe.configure({ mode: "serial" });

test.describe("Tips — pools, tip-outs, cash (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tabletToken = "";
  const today = localToday();
  const jobs = { server: "", busser: "", manager: "", host: "" };
  const ana = { id: "", pin: "3816" };
  const cal = { id: "", pin: "5207" };
  const ben = { id: "", pin: "6491" };

  const report = async () => {
    const r = await tipsRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/report?startDate=${today}&endDate=${today}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const data = r.data.data as Rec;
    const by = new Map(list(data.people).map((p) => [p.staffMemberId, p]));
    return { data, of: (id: string) => (by.get(id) ?? {}) as Rec };
  };
  const policy = async (pool: Rec, extra: Rec = {}) => {
    const r = await tipsRaw(ownerToken, restaurantId, "PUT", "/policy", {
      usesTipCredit: false,
      cardFeeWithholding: { enabled: false, mode: "ACTUAL_FEE" },
      pool: {
        enabled: true,
        contributors: [],
        recipients: [],
        splitWithinJob: "BY_HOURS",
        ...pool,
      },
      ...extra,
    });
    return r;
  };
  const save = async (pool: Rec, extra: Rec = {}) => {
    const r = await policy(pool, extra);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
  };
  /** Net per person, and the day still balances to the cent. */
  const nets = async () => {
    const { data, of } = await report();
    const sum = list(data.people).reduce((s, p) => s + Number(p.netCents), 0);
    expect(sum + Number(data.totals.unassignedCents)).toBe(1600);
    return {
      ana: of(ana.id),
      cal: of(cal.id),
      ben: of(ben.id),
      data,
    };
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-tips] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const zone = await restaurantBasicInfoRaw(ownerToken, restaurantId, {
      timezone: ZONE,
    });
    if (zone.status !== 200)
      throw new Error(`[api-tips] timezone: ${JSON.stringify(zone.data)}`);
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "PAYROLL",
      true
    );
    if (!g.ok) throw new Error(`[api-tips] grant: ${JSON.stringify(g.data)}`);
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    const groupId = (
      await createMenuGroupNamed(ownerToken, `Tips ${runId}`, { restaurantId })
    ).id;
    const item = await createMenuItemFull(
      ownerToken,
      groupId,
      `Tip Burger ${runId}`,
      10
    );

    const job = async (
      name: string,
      extra: { isTipped?: boolean; isManagerial?: boolean }
    ) => {
      const r = await createStaffJobRaw(ownerToken, restaurantId, {
        name: `${name} ${runId}`,
        defaultHourlyRateCents: 1000,
        ...extra,
      });
      if (r.status !== 201)
        throw new Error(`[api-tips] job: ${JSON.stringify(r.data)}`);
      return String(r.data.data?.id);
    };
    jobs.server = await job("Server", { isTipped: true });
    jobs.busser = await job("Busser", { isTipped: true });
    jobs.manager = await job("Floor manager", {
      isTipped: true,
      isManagerial: true,
    });
    jobs.host = await job("Host", { isTipped: false });

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-tips-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(ownerToken, restaurantId, "8462");
    const ownerSession = await tabletStaffSignIn(
      tabletToken,
      ownerMember,
      "8462"
    );
    // People are created on the POS (PIN-only, active at once): an emailed
    // invite stays "pending" until the link is used, and a pending person
    // can't sign in even with an owner-set PIN (see api-staff-hiring TC-618).
    const person = async (
      p: { id: string; pin: string },
      first: string,
      jobId: string
    ) => {
      const r = await tabletRaw<Rec>(
        tabletToken,
        "POST",
        "/staff/manage",
        { firstName: first, lastName: "Tipsy", pin: p.pin },
        ownerSession
      );
      if (r.status !== 201)
        throw new Error(`[api-tips] staff: ${JSON.stringify(r.data)}`);
      p.id = String(r.data.data.id);
      await setMemberJobsRaw(ownerToken, restaurantId, p.id, [
        { jobId, isPrimary: true },
      ]);
    };
    await person(ana, "Ana", jobs.server);
    await person(cal, "Cal", jobs.server);
    await person(ben, "Ben", jobs.busser);

    const worked = async (
      id: string,
      jobId: string,
      from: number,
      to: number
    ) => {
      const r = await payrollRaw(ownerToken, restaurantId, "POST", "/shifts", {
        staffMemberId: id,
        clockInAt: minutesAgo(from),
        clockOutAt: minutesAgo(to),
        jobId,
        reason: "Worked today",
      });
      if (r.status !== 201)
        throw new Error(`[api-tips] shift: ${JSON.stringify(r.data)}`);
    };
    await worked(ana.id, jobs.server, 130, 70);
    await worked(ben.id, jobs.busser, 130, 70);
    await worked(cal.id, jobs.server, 60, 20);

    // Ana and Cal open their checks before anyone holds the drawer.
    const openCheck = async (
      p: { id: string; pin: string },
      table: string,
      qty: number
    ) => {
      const session = await tabletStaffSignIn(tabletToken, p.id, p.pin);
      const r = await createTabletOrderRaw(tabletToken, session, {
        restaurantId,
        orderType: "PICKUP",
        subtotal: 10 * qty,
        tax: 0,
        tip: 0,
        total: 10 * qty,
        customerPhone: "",
        orderItems: [
          {
            menuItemId: item.id,
            menuItemName: item.name,
            quantity: qty,
            price: 10,
          },
        ],
        openCheck: true,
        tableName: table,
        guestCount: 2,
      });
      if (r.status !== 201)
        throw new Error(`[api-tips] open check: ${JSON.stringify(r.data)}`);
      return { id: String(r.data.id), total: Number(r.data.total) };
    };
    const anaCheck = await openCheck(ana, "T1", 2);
    const calCheck = await openCheck(cal, "T2", 1);

    // The owner (Owner role) opens the drawer and settles both in cash.
    await openRegisterSessionPos(tabletToken, ownerSession, 100);
    const settle = async (
      check: { id: string; total: number },
      tip: number
    ) => {
      const r = await settleTabCashRaw(tabletToken, ownerSession, check.id, {
        amount: check.total,
        cashTendered: check.total + tip,
        tip,
        idempotencyKey: `tip-${check.id}`,
      });
      if (!r.ok)
        throw new Error(`[api-tips] settle: ${JSON.stringify(r.data)}`);
    };
    await settle(anaCheck, 10);
    await settle(calCheck, 6);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Tips");
    await allure.label("severity", "critical");
  });

  test("TC-588: no pool — everyone keeps the cash tips they earned", async () => {
    const off = await tipsRaw(ownerToken, restaurantId, "PUT", "/policy", {
      pool: { enabled: false },
    });
    expect(off.status, JSON.stringify(off.data)).toBe(200);
    const { ana: a, cal: c, ben: b, data } = await nets();
    expect(data.totals).toMatchObject({
      totalTipsCents: 1600,
      feeWithheldCents: 0,
      unassignedCents: 0,
    });
    expect(a).toMatchObject({
      cashTipsCents: 1000,
      cardTipsCents: 0,
      poolOutCents: 0,
      netCents: 1000,
      minutes: 60,
    });
    expect(c).toMatchObject({ cashTipsCents: 600, netCents: 600, minutes: 40 });
    expect(b.netCents ?? 0).toBe(0);
  });

  test("TC-589: full pool by points × hours — $16.00 over 600:400:300 weights, cents balance", async () => {
    await save({
      contributors: [
        { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 100 },
      ],
      recipients: [
        { jobId: jobs.server, points: 10 },
        { jobId: jobs.busser, points: 5 },
      ],
      splitWithinJob: "BY_HOURS",
    });
    const { ana: a, cal: c, ben: b, data } = await nets();
    // 1600 × 600/1300 = 738.46, × 400/1300 = 492.31, × 300/1300 = 369.23;
    // the leftover cent goes to the largest remainder (Ana).
    expect(a).toMatchObject({
      poolOutCents: 1000,
      poolInCents: 739,
      netCents: 739,
    });
    expect(c).toMatchObject({
      poolOutCents: 600,
      poolInCents: 492,
      netCents: 492,
    });
    expect(b).toMatchObject({ poolInCents: 369, netCents: 369 });
    expect(list(data.days)[0]?.poolCents).toBe(1600);
  });

  test("TC-590: pool split EQUAL — points per person, hours ignored", async () => {
    await save({
      contributors: [
        { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 100 },
      ],
      recipients: [
        { jobId: jobs.server, points: 10 },
        { jobId: jobs.busser, points: 5 },
      ],
      splitWithinJob: "EQUAL",
    });
    const { ana: a, cal: c, ben: b } = await nets();
    expect([a.netCents, c.netCents, b.netCents]).toEqual([640, 640, 320]);
  });

  test("TC-591: tip-out — servers give 20% of their tips to the bussers", async () => {
    await save({
      contributors: [
        { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 20 },
      ],
      recipients: [{ jobId: jobs.busser, points: 1 }],
    });
    const { ana: a, cal: c, ben: b } = await nets();
    expect(a).toMatchObject({
      poolOutCents: 200,
      poolInCents: 0,
      netCents: 800,
    });
    expect(c).toMatchObject({ poolOutCents: 120, netCents: 480 });
    expect(b).toMatchObject({ poolInCents: 320, netCents: 320 });
  });

  test("TC-592: tip-out on sales — 2% of the food each server rang ($20.00 / $10.00)", async () => {
    await save({
      contributors: [
        { jobId: jobs.server, kind: "PERCENT_OF_SALES", percent: 2 },
      ],
      recipients: [{ jobId: jobs.busser, points: 1 }],
    });
    const { ana: a, cal: c, ben: b } = await nets();
    expect(a).toMatchObject({ poolOutCents: 40, netCents: 960 });
    expect(c).toMatchObject({ poolOutCents: 20, netCents: 580 });
    expect(b).toMatchObject({ poolInCents: 60, netCents: 60 });
  });

  test("TC-593: legal guards — no managerial recipient; under a tip credit, tipped jobs only", async () => {
    const manager = await policy({
      recipients: [{ jobId: jobs.manager, points: 1 }],
    });
    expect(manager.status).toBe(400);
    const credit = await policy(
      { recipients: [{ jobId: jobs.host, points: 1 }] },
      { usesTipCredit: true }
    );
    expect(credit.status).toBe(400);
    const fine = await policy(
      {
        contributors: [
          { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 20 },
        ],
        recipients: [{ jobId: jobs.busser, points: 1 }],
      },
      { usesTipCredit: true }
    );
    expect(fine.status, JSON.stringify(fine.data)).toBe(200);
    // Out-of-range values are clamped, never stored as typed.
    const clamped = await policy({
      contributors: [
        { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 250 },
      ],
      recipients: [{ jobId: jobs.busser, points: 1 }],
    });
    expect(clamped.status).toBe(200);
    expect(clamped.data.data.policy.pool.contributors[0].percent).toBe(100);
  });

  test("TC-594: a recipient job turned managerial after saving gets nothing — and nothing is taken", async () => {
    await save({
      contributors: [
        { jobId: jobs.server, kind: "PERCENT_OF_TIPS", percent: 20 },
      ],
      recipients: [{ jobId: jobs.busser, points: 1 }],
    });
    const flip = await payrollRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/jobs/${jobs.busser}`,
      { isManagerial: true }
    );
    expect(flip.status, JSON.stringify(flip.data)).toBe(200);
    const { ana: a, cal: c, ben: b, data } = await nets();
    expect(list(data.days)[0]?.notes).toContain("NO_ELIGIBLE_RECIPIENTS");
    expect(a).toMatchObject({ poolOutCents: 0, netCents: 1000 });
    expect(c).toMatchObject({ poolOutCents: 0, netCents: 600 });
    expect(b.netCents ?? 0).toBe(0);
    await payrollRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/jobs/${jobs.busser}`,
      {
        isManagerial: false,
      }
    );
  });

  test("TC-595: declared cash tips are the person's own — reported, never pooled; a correction supersedes", async () => {
    const declare = (amountCents: number) =>
      tipsRaw(ownerToken, restaurantId, "POST", "/declarations", {
        staffMemberId: ben.id,
        businessDate: today,
        amountCents,
      });
    expect((await declare(700)).status).toBe(201);
    let r = await nets();
    expect(r.ben).toMatchObject({ declaredCashCents: 700, poolInCents: 320 });
    // Net (what payroll pays) excludes declared cash.
    expect(r.ben.netCents).toBe(320);
    expect(r.data.totals.declaredCashCents).toBe(700);

    expect((await declare(650)).status).toBe(201);
    r = await nets();
    expect(r.ben.declaredCashCents).toBe(650);

    const stranger = await tipsRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/declarations",
      {
        staffMemberId: "00000000-0000-4000-8000-000000000000",
        businessDate: today,
        amountCents: 100,
      }
    );
    expect(stranger.status).toBe(404);
    const silly = await declare(600_000);
    expect(silly.status, "over $5,000 is a typo").toBe(400);
  });

  test("TC-596: the tips CSV carries the same numbers", async () => {
    const csv = await tipsRaw<string>(
      ownerToken,
      restaurantId,
      "GET",
      `/report.csv?startDate=${today}&endDate=${today}`
    );
    expect(csv.status).toBe(200);
    const rows = String(csv.data)
      .replace(/^\uFEFF/, "")
      .split("\n");
    expect(rows).toHaveLength(4); // header + Ana, Cal, Ben
    // name, hours, card, cash, payroll, declared, given, received, fee, net
    expect(rows).toContain(
      "Ana Tipsy,1.00,0.00,10.00,0.00,0.00,2.00,0.00,0.00,8.00"
    );
    expect(rows).toContain(
      "Cal Tipsy,0.67,0.00,6.00,0.00,0.00,1.20,0.00,0.00,4.80"
    );
    expect(rows).toContain(
      "Ben Tipsy,1.00,0.00,0.00,0.00,6.50,0.00,3.20,0.00,3.20"
    );
  });
});
