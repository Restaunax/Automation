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
 * The policy side is covered: PERCENT_ONLY default, and the hard block in a
 * state that bans withholding (TC-1152, TC-1153).
 *
 * Rates (W3:C3): the tenant is in Miami, FL ($15.00 full minimum wage,
 * $11.98 tipped cash wage, a CONFIRMED rule). The tipped jobs pay $12.00,
 * so a tip credit is DERIVED from the rates (never the client's checkbox)
 * and the untipped Host may not share the pool; Host pays $15.00.
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
/** FL 2026 (W3:C3): above the $11.98 tipped cash wage, below the $15 full. */
const TIPPED_RATE = 1200;
const FULL_RATE = 1500;
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
    // Time zone is RestauNax setup: an owner change is 403 HQ_ONLY_FIELDS.
    const zone = await restaurantBasicInfoRaw(adminToken, restaurantId, {
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
        // Lawful in FL (W3:C3): tipped jobs at the $11.98 cash wage or more,
        // the rest at the $15.00 full minimum wage.
        defaultHourlyRateCents: extra.isTipped ? TIPPED_RATE : FULL_RATE,
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
    // W3:C3: the tip credit is derived from the $12.00 tipped rates — the
    // client saying "no tip credit" changes nothing.
    const credit = await policy(
      { recipients: [{ jobId: jobs.host, points: 1 }] },
      { usesTipCredit: false }
    );
    expect(credit.status).toBe(400);
    expect(String(credit.data.message)).toMatch(
      /below the full minimum wage.*tip credit/
    );
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
    // Rule-based tip-outs (tip-out waterfall, P6) got their own columns, next
    // to the pool's; this policy has a pool and no tip-out rules.
    // "Tips added after the charge" (RestauNax #1101): tips added after the
    // card was charged.
    expect(rows[0]).toBe(
      "Name,Hours,Card tips,Cash tips,Tips added after the charge,Declared cash tips," +
        "Tip-outs given,Tip-outs received,Given to the pool,Pool received," +
        "Card fee withheld,Net tips," +
        // RestauNax 9d9578a45 (2026-10-22): cash tips never paid twice;
        // unassigned tips shared across the pay period.
        "Unassigned tips shared,Paid from drawer,Cash tips kept at shift," +
        // RestauNax fe9a2576f: service charges paid to staff are wages, in
        // a column of their own (none here).
        "Service charges (paid as wages)"
    );
    // name, hours, card, cash, payroll, declared, tip-outs given, tip-outs
    // received, given to pool, pool received, fee, net, unassigned shared,
    // paid from drawer, cash kept at shift, service charges (none of the
    // last four here)
    expect(rows).toContain(
      "Ana Tipsy,1.00,0.00,10.00,0.00,0.00,0.00,0.00,2.00,0.00,0.00,8.00,0.00,0.00,0.00,0.00"
    );
    expect(rows).toContain(
      "Cal Tipsy,0.67,0.00,6.00,0.00,0.00,0.00,0.00,1.20,0.00,0.00,4.80,0.00,0.00,0.00,0.00"
    );
    expect(rows).toContain(
      "Ben Tipsy,1.00,0.00,0.00,0.00,6.50,0.00,0.00,0.00,3.20,0.00,3.20,0.00,0.00,0.00,0.00"
    );
  });

  // W3:H4 — PERCENT_ONLY (Stripe's percentage of the tip, no fixed fee) is
  // the default for a new policy; a saved mode is kept.
  test("TC-1152: a new tip policy defaults to the percentage-only card fee; a saved mode is kept", async () => {
    const fresh = await tipsRaw(ownerToken, restaurantId, "PUT", "/policy", {
      pool: { enabled: false, contributors: [], recipients: [] },
    });
    expect(fresh.status, JSON.stringify(fresh.data)).toBe(200);
    expect(fresh.data.data.policy.cardFeeWithholding).toMatchObject({
      enabled: false,
      mode: "PERCENT_ONLY",
    });
    const actual = await tipsRaw(ownerToken, restaurantId, "PUT", "/policy", {
      cardFeeWithholding: { enabled: true, mode: "ACTUAL_FEE" },
    });
    expect(actual.status, JSON.stringify(actual.data)).toBe(200);
    expect(actual.data.data.policy.cardFeeWithholding).toMatchObject({
      enabled: true,
      mode: "ACTUAL_FEE",
    });
  });

  // W3:H4 — where state law bans card-fee withholding (CA Lab. Code §351,
  // MA c.149 §152A), saving it is refused, and a saved one stops applying.
  test("TC-1153: in California, card-fee withholding is refused and a saved one is off", async () => {
    const move = (state: string, city: string, zipCode: string) =>
      restaurantBasicInfoRaw(adminToken, restaurantId, {
        address: { street: "300 Other Street", city, state, zipCode },
      });
    const ca = await move("CA", "Los Angeles", "90012");
    expect(ca.status, JSON.stringify(ca.data)).toBe(200);
    try {
      // TC-1152 left withholding on (ACTUAL_FEE): it no longer applies here.
      const view = await tipsRaw(ownerToken, restaurantId, "GET", "/policy");
      expect(view.status).toBe(200);
      expect(view.data.data.stateRules).toContain("NO_CARD_FEE_WITHHOLDING");
      expect(view.data.data.policy.cardFeeWithholding.enabled).toBe(false);
      const refused = await tipsRaw(
        ownerToken,
        restaurantId,
        "PUT",
        "/policy",
        {
          cardFeeWithholding: { enabled: true, mode: "PERCENT_ONLY" },
        }
      );
      expect(refused.status).toBe(400);
      expect(String(refused.data.message)).toBe(
        "Card fees can't be taken out of tips in CA. Turn off card-fee withholding."
      );
      const off = await tipsRaw(ownerToken, restaurantId, "PUT", "/policy", {
        cardFeeWithholding: { enabled: false, mode: "PERCENT_ONLY" },
      });
      expect(off.status, JSON.stringify(off.data)).toBe(200);
    } finally {
      await move("FL", "Miami", "33101");
    }
  });

  test("TC-1260: W3:C3 the policy reports the tip credit derived from the rates", async () => {
    const r = await tipsRaw(ownerToken, restaurantId, "GET", "/policy");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const data = r.data.data as Rec;
    expect((data.policy as Rec).usesTipCredit).toBe(true);
    const credit = data.tipCredit as Rec;
    expect(credit.usesTipCredit).toBe(true);
    expect((credit.floor as Rec).fullWageCents).toBe(FULL_RATE);
    expect((credit.floor as Rec).tippedCashWageCents).toBe(1198);
    expect(list(credit.jobs).map((j) => j.jobId)).toEqual(
      expect.arrayContaining([jobs.server, jobs.busser])
    );
  });

  test("TC-1261: W3:C3 a tipped rate that would start a tip credit is refused while Host is in the pool", async () => {
    const patch = (jobId: string, cents: number) =>
      payrollRaw(ownerToken, restaurantId, "PATCH", `/jobs/${jobId}`, {
        defaultHourlyRateCents: cents,
      });
    // Everyone at the full wage: no tip credit, so Host may share the pool.
    for (const id of [jobs.server, jobs.busser, jobs.manager]) {
      const up = await patch(id, FULL_RATE);
      expect(up.status, JSON.stringify(up.data)).toBe(200);
    }
    await save({ recipients: [{ jobId: jobs.host, points: 1 }] });
    // Back below the full wage would mean a tip credit: refused, by name.
    const down = await patch(jobs.server, TIPPED_RATE);
    expect(down.status).toBe(400);
    expect(String(down.data.message)).toContain(`Host ${runId}`);
    expect(String(down.data.message)).toContain("$15.00");
    // Restore: busser-only pool, then the $12.00 tipped rates.
    await save({ recipients: [{ jobId: jobs.busser, points: 1 }] });
    for (const id of [jobs.server, jobs.busser, jobs.manager]) {
      const back = await patch(id, TIPPED_RATE);
      expect(back.status, JSON.stringify(back.data)).toBe(200);
    }
  });

  test("TC-1262: W3:C3 a rate below the FL minimum is refused, naming the minimum and its source", async () => {
    const low = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Dish ${runId}`,
      defaultHourlyRateCents: 1400,
    });
    expect(low.status).toBe(400);
    expect(String((low.data as Rec).message)).toMatch(
      /\$14\.00 an hour for Dish .* is below the minimum wage here: \$15\.00 an hour \(FL state minimum wage\)/
    );
    const tippedLow = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Runner ${runId}`,
      defaultHourlyRateCents: 1100,
      isTipped: true,
    });
    expect(tippedLow.status).toBe(400);
    expect(String((tippedLow.data as Rec).message)).toContain("$11.98");
  });
});
