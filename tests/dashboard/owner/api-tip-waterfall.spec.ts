/**
 * api-tip-waterfall.spec.ts — the tip-out waterfall (P6, restaunax #924) on
 * QA (TC-667..676).
 *
 * No browser. A per-run throwaway restaurant with TIP_MANAGEMENT, moved to a
 * zone where it is about 16:00 (so a whole day of finished shifts fits
 * "today", at any hour), a REGISTER device and, as in the spec's §5 Saturday:
 *   Ana Server 6 h $300 · Ben Server 4 h $200 · Cal Bartender 8 h $150 ·
 *   Dee Busser 5 h · Eli Busser 3 h
 * Rules: Servers → Bartenders 7% of tips; Bartenders → Bussers 10% of tips
 * including what they received; bussers split by hours.
 *
 * Card tips can't be produced on QA (a card leg is verified against Stripe),
 * so the day's tips are paid in CASH: the gave / received / net columns match
 * §5 to the cent and the card fee is $0. The §5 card-fee arithmetic is checked
 * through POST /preview, which runs the real engine on its made-up card day.
 *
 * Also: run order (GET /policy tipOutOrder), validation in EN/ES, a rule
 * whose receiving job had nobody on shift, a tip from someone not clocked in,
 * a two-job day (each tip under the job clocked into when it was paid), a
 * % of category sales rule, no rules = everyone keeps their own, and the
 * staff app's tip receipt (approved period only, hidden with pay, none
 * without Tip Management).
 * Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  createStaffJobRaw,
  setMemberJobsRaw,
  payrollRaw,
  putPayrollSettingsRaw,
  tipsRaw,
  staffAppRaw,
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

/** About 16:00 local now: an 8-hour shift that just ended began today. */
const ZONE = zoneAtMidday(new Date(), 16);
const localDate = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONE }).format(d);
const minutesAgo = (m: number) =>
  new Date(Math.floor(Date.now() / 60_000) * 60_000 - m * 60_000).toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);

test.describe.configure({ mode: "serial" });

test.describe("Tip-out waterfall (API)", () => {
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
  let ownerSession = "";
  let ownerMember = "";
  const today = localDate();
  const jobs = { server: "", bar: "", busser: "", host: "", manager: "" };
  const names = {
    server: `Server ${runId}`,
    bar: `Bartender ${runId}`,
    busser: `Busser ${runId}`,
  };
  let barGroup = "";
  type P = { id: string; pin: string; session: string };
  const mk = (pin: string): P => ({ id: "", pin, session: "" });
  const ana = mk("3816");
  const ben = mk("5207");
  const cal = mk("6491");
  const dee = mk("7359");
  const eli = mk("2648");
  const fay = mk("4927");
  const sam = mk("8153");
  const checks: Record<string, { id: string; total: number }> = {};

  const WATERFALL = () => [
    // Listed downstream-first on purpose: the engine orders them.
    {
      id: "bar-to-bussers",
      fromJobId: jobs.bar,
      toJobId: jobs.busser,
      kind: "PERCENT_OF_TIPS",
      percent: 10,
      includeReceived: true,
      splitWithinJob: "BY_HOURS",
    },
    {
      id: "servers-to-bar",
      fromJobId: jobs.server,
      toJobId: jobs.bar,
      kind: "PERCENT_OF_TIPS",
      percent: 7,
      splitWithinJob: "BY_HOURS",
    },
  ];
  const policy = (tipOuts: Rec[], extra: Rec = {}) => ({
    usesTipCredit: false,
    cardFeeWithholding: { enabled: true, mode: "FIXED_PERCENT", percent: 3 },
    pool: {
      enabled: false,
      contributors: [],
      recipients: [],
      splitWithinJob: "BY_HOURS",
    },
    tipOuts,
    ...extra,
  });
  const save = async (body: Rec) => {
    const r = await tipsRaw(ownerToken, restaurantId, "PUT", "/policy", body);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
  };
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
    const day = list(data.days)[0] ?? {};
    // Every day balances to the cent.
    const net = list(data.people).reduce((s, p) => s + Number(p.netCents), 0);
    expect(
      net +
        Number(data.totals.feeWithheldCents) +
        Number(data.totals.unassignedCents)
    ).toBe(Number(data.totals.totalTipsCents));
    return { data, day, of: (p: P) => (by.get(p.id) ?? {}) as Rec };
  };
  const settle = async (key: string, tip: number) => {
    const c = checks[key];
    if (!c) throw new Error(`no check ${key}`);
    const r = await settleTabCashRaw(tabletToken, ownerSession, c.id, {
      amount: c.total,
      cashTendered: c.total + tip,
      tip,
      idempotencyKey: `tw-${runId}-${key}`,
    });
    expect(r.ok, JSON.stringify(r.data)).toBe(true);
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[tip-waterfall] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const zone = await restaurantBasicInfoRaw(ownerToken, restaurantId, {
      timezone: ZONE,
    });
    if (zone.status !== 200)
      throw new Error(`[tip-waterfall] zone: ${JSON.stringify(zone.data)}`);
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TIP_MANAGEMENT",
      true
    );
    if (!g.ok)
      throw new Error(`[tip-waterfall] grant: ${JSON.stringify(g.data)}`);
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });

    // Menu: a Bar category (for the % of category sales rule) and Food.
    barGroup = (
      await createMenuGroupNamed(ownerToken, `Bar ${runId}`, { restaurantId })
    ).id;
    const foodGroup = (
      await createMenuGroupNamed(ownerToken, `Food ${runId}`, { restaurantId })
    ).id;
    const beer = await createMenuItemFull(
      ownerToken,
      barGroup,
      `Beer ${runId}`,
      8
    );
    const burger = await createMenuItemFull(
      ownerToken,
      foodGroup,
      `Burger ${runId}`,
      10
    );

    const job = async (
      name: string,
      extra: { isTipped?: boolean; isManagerial?: boolean }
    ) => {
      const r = await createStaffJobRaw(ownerToken, restaurantId, {
        name,
        defaultHourlyRateCents: 1000,
        ...extra,
      });
      if (r.status !== 201)
        throw new Error(`[tip-waterfall] job: ${JSON.stringify(r.data)}`);
      return String(r.data.data?.id);
    };
    jobs.server = await job(names.server, { isTipped: true });
    jobs.bar = await job(names.bar, { isTipped: true });
    jobs.busser = await job(names.busser, { isTipped: true });
    jobs.host = await job(`Host ${runId}`, { isTipped: false });
    jobs.manager = await job(`Floor manager ${runId}`, {
      isTipped: true,
      isManagerial: true,
    });

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-tw-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
    ownerMember = await setOwnerPosPin(ownerToken, restaurantId, "8462");
    ownerSession = await tabletStaffSignIn(tabletToken, ownerMember, "8462");

    const people: [P, string, string[]][] = [
      [ana, "Ana", [jobs.server]],
      [ben, "Ben", [jobs.server]],
      [cal, "Cal", [jobs.bar]],
      [dee, "Dee", [jobs.busser]],
      [eli, "Eli", [jobs.busser]],
      [fay, "Fay", [jobs.server, jobs.bar]],
      [sam, "Sam", [jobs.server]],
    ];
    for (const [p, first, held] of people) {
      const r = await tabletRaw<Rec>(
        tabletToken,
        "POST",
        "/staff/manage",
        { firstName: first, lastName: "Tips", pin: p.pin },
        ownerSession
      );
      if (r.status !== 201)
        throw new Error(`[tip-waterfall] staff: ${JSON.stringify(r.data)}`);
      p.id = String(r.data.data.id);
      await setMemberJobsRaw(
        ownerToken,
        restaurantId,
        p.id,
        held.map((jobId, i) => ({ jobId, isPrimary: i === 0 }))
      );
    }

    // Finished shifts today, all ending two minutes ago.
    const worked = async (p: P, jobId: string, hours: number) => {
      const r = await payrollRaw(ownerToken, restaurantId, "POST", "/shifts", {
        staffMemberId: p.id,
        clockInAt: minutesAgo(2 + hours * 60),
        clockOutAt: minutesAgo(2),
        jobId,
        reason: "Saturday",
      });
      if (r.status !== 201)
        throw new Error(`[tip-waterfall] shift: ${JSON.stringify(r.data)}`);
    };
    await worked(ana, jobs.server, 6);
    await worked(ben, jobs.server, 4);
    await worked(cal, jobs.bar, 8);
    await worked(dee, jobs.busser, 5);
    await worked(eli, jobs.busser, 3);

    // Everyone opens their checks before anyone holds the drawer.
    const line = (
      item: { id: string; name: string },
      qty: number,
      price: number
    ) => ({
      menuItemId: item.id,
      menuItemName: item.name,
      quantity: qty,
      price,
    });
    const open = async (
      key: string,
      p: P,
      items: ReturnType<typeof line>[]
    ) => {
      if (!p.session)
        p.session = await tabletStaffSignIn(tabletToken, p.id, p.pin);
      const subtotal = items.reduce((s, l) => s + l.price * l.quantity, 0);
      const r = await createTabletOrderRaw(tabletToken, p.session, {
        restaurantId,
        orderType: "PICKUP",
        subtotal,
        tax: 0,
        tip: 0,
        total: subtotal,
        customerPhone: "",
        orderItems: items,
        openCheck: true,
        tableName: `T-${key}`,
        guestCount: 2,
      });
      if (r.status !== 201)
        throw new Error(`[tip-waterfall] check: ${JSON.stringify(r.data)}`);
      checks[key] = { id: String(r.data.id), total: Number(r.data.total) };
    };
    await open("ana", ana, [line(beer, 3, 8), line(burger, 1, 10)]);
    await open("ben", ben, [line(burger, 1, 10)]);
    await open("cal", cal, [line(beer, 1, 8)]);
    await open("fay-lunch", fay, [line(burger, 1, 10)]);
    await open("fay-night", fay, [line(beer, 1, 8)]);
    await open("sam", sam, [line(burger, 1, 10)]);

    await openRegisterSessionPos(tabletToken, ownerSession, 100);
    await settle("ana", 300);
    await settle("ben", 200);
    await settle("cal", 150);
    await save(policy(WATERFALL()));
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Tip-out waterfall");
    await allure.label("severity", "critical");
  });

  test("TC-667: the rules run upstream first, whatever order they were saved in", async () => {
    const r = await tipsRaw(ownerToken, restaurantId, "GET", "/policy");
    expect(r.status).toBe(200);
    expect(r.data.data.tipOutOrder).toEqual([
      "servers-to-bar",
      "bar-to-bussers",
    ]);
    expect(
      list(r.data.data.policy.tipOuts)
        .map((x) => x.id)
        .sort()
    ).toEqual(["bar-to-bussers", "servers-to-bar"].sort());
  });

  test("TC-668: Nate's Saturday — gave, received and paid per person to the cent; $650.00 balances", async () => {
    const { data, day, of } = await report();
    expect(data.totals).toMatchObject({
      totalTipsCents: 65000,
      netCents: 65000,
      // Cash tips: no card fee to withhold (the card case is TC-669).
      feeWithheldCents: 0,
      unassignedCents: 0,
    });
    expect(of(ana)).toMatchObject({
      cashTipsCents: 30000,
      tipOutGivenCents: 2100,
      tipOutReceivedCents: 0,
      netCents: 27900,
    });
    expect(of(ben)).toMatchObject({
      cashTipsCents: 20000,
      tipOutGivenCents: 1400,
      netCents: 18600,
    });
    expect(of(cal)).toMatchObject({
      cashTipsCents: 15000,
      tipOutGivenCents: 1850,
      tipOutReceivedCents: 3500,
      netCents: 16650,
    });
    // 10% of $185.00, split 5 : 3 by hours; the odd cent to the larger remainder.
    expect(of(dee)).toMatchObject({
      tipOutReceivedCents: 1156,
      netCents: 1156,
    });
    expect(of(eli)).toMatchObject({ tipOutReceivedCents: 694, netCents: 694 });

    const calBar = list(of(cal).byJob).find((j) => j.jobId === jobs.bar);
    expect(calBar).toMatchObject({
      ownCents: 15000,
      tipOutGivenCents: 1850,
      tipOutReceivedCents: 3500,
    });
    expect(list(calBar?.gaveTo)).toEqual([
      expect.objectContaining({ jobId: jobs.busser, cents: 1850 }),
    ]);
    expect(list(calBar?.receivedFrom)).toEqual([
      expect.objectContaining({ jobId: jobs.server, cents: 3500 }),
    ]);

    expect(
      list(day.tipOuts).map((r) => [r.ruleId, r.takenCents, r.skipped ?? null])
    ).toEqual([
      ["servers-to-bar", 3500, null],
      ["bar-to-bussers", 1850, null],
    ]);
    const first = list(day.tipOuts)[0];
    expect(
      list(first?.givers)
        .map((g) => [g.id, g.cents])
        .sort()
    ).toEqual(
      [
        [ana.id, 2100],
        [ben.id, 1400],
      ].sort()
    );
    expect(list(first?.receivers)).toEqual([
      expect.objectContaining({ id: cal.id, cents: 3500 }),
    ]);
  });

  test("TC-669: the preview runs the real engine with a 3% card fee — the fee follows the money", async () => {
    const r = await tipsRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/preview",
      policy(WATERFALL())
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const p = r.data.data as Rec;
    expect(p).toMatchObject({
      problem: null,
      problemMessage: null,
      order: ["servers-to-bar", "bar-to-bussers"],
    });
    // Made-up day: per job two people, 8 h and 4 h, $240 and $120 card tips.
    expect(p.example).toMatchObject({
      totalTipsCents: 72000,
      feeWithheldCents: 2160,
    });
    const job = new Map(list(p.example.jobs).map((j) => [j.jobId, j]));
    expect(job.get(jobs.server)).toMatchObject({
      ownCents: 36000,
      tipOutGivenCents: 2520,
      tipOutReceivedCents: 0,
      feeWithheldCents: 1005,
      paidCents: 32475,
    });
    expect(job.get(jobs.bar)).toMatchObject({
      ownCents: 36000,
      tipOutGivenCents: 3852, // 10% of ($240 + $16.80) and of ($120 + $8.40)
      tipOutReceivedCents: 2520,
    });
    expect(job.get(jobs.busser)).toMatchObject({
      ownCents: 0,
      tipOutReceivedCents: 3852,
    });
    // Card fee withheld is exactly 3% of all tips, split by who holds the money.
    const fees = [...job.values()].reduce(
      (s, j) => s + Number(j.feeWithheldCents),
      0
    );
    const paid = [...job.values()].reduce((s, j) => s + Number(j.paidCents), 0);
    expect(fees).toBe(2160);
    expect(paid).toBe(72000 - 2160);
    expect(
      Math.abs(Number(job.get(jobs.bar)?.feeWithheldCents) - 1039)
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(Number(job.get(jobs.busser)?.feeWithheldCents) - 116)
    ).toBeLessThanOrEqual(1);
    // Never saved: the stored policy is unchanged.
    const stored = await tipsRaw(ownerToken, restaurantId, "GET", "/policy");
    expect(list(stored.data.data.policy.tipOuts)).toHaveLength(2);
  });

  test("TC-670: rules that can't be saved say why, in English and Spanish; the preview explains instead of failing", async () => {
    const rule = (
      from: string,
      to: string,
      percent = 7,
      id = `${from}-${to}`
    ) => ({
      id,
      fromJobId: from,
      toJobId: to,
      kind: "PERCENT_OF_TIPS",
      percent,
    });
    const cases: [string, Rec, RegExp, RegExp][] = [
      [
        "cycle",
        policy([rule(jobs.server, jobs.bar), rule(jobs.bar, jobs.server)]),
        /These rules go in a circle/,
        /Estas reglas forman un círculo/,
      ],
      [
        "self",
        policy([rule(jobs.server, jobs.server)]),
        /can't tip out to itself/,
        /no puede darse propinas a sí mismo/,
      ],
      [
        "managerial",
        policy([rule(jobs.server, jobs.manager)]),
        /Managers and supervisors can't receive tips/,
        /Los gerentes y supervisores no pueden recibir propinas/,
      ],
      [
        "tip credit",
        policy([rule(jobs.server, jobs.host)], { usesTipCredit: true }),
        /only tipped jobs can receive tip-outs/,
        /solo los puestos con propinas pueden recibir/,
      ],
      [
        "over 100%",
        policy([
          rule(jobs.server, jobs.bar, 60, "a"),
          rule(jobs.server, jobs.busser, 50, "b"),
        ]),
        /would give more than 100% of their tips/,
        /daría más del 100% de sus propinas/,
      ],
    ];
    for (const [label, body, en, es] of cases) {
      const r = await tipsRaw(ownerToken, restaurantId, "PUT", "/policy", body);
      expect(r.status, label).toBe(400);
      expect(String(r.data.message), label).toMatch(en);
      const rEs = await tipsRaw(
        ownerToken,
        restaurantId,
        "PUT",
        "/policy",
        body,
        {
          "Accept-Language": "es",
        }
      );
      expect(String(rEs.data.message), label).toMatch(es);
    }
    const preview = await tipsRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/preview",
      cases[0]![1]
    );
    expect(preview.status).toBe(200);
    expect(preview.data.data).toMatchObject({ example: null });
    expect(preview.data.data.problem).toBeTruthy();
    expect(String(preview.data.data.problemMessage)).toMatch(/go in a circle/);
    // Nothing above was saved.
    const stored = await tipsRaw(ownerToken, restaurantId, "GET", "/policy");
    expect(stored.data.data.tipOutOrder).toEqual([
      "servers-to-bar",
      "bar-to-bussers",
    ]);
  });

  test("TC-671: a rule whose receiving job had nobody on shift takes nothing and is noted", async () => {
    // Hosts aren't tipped; without a tip credit they may still receive.
    await save(
      policy([
        ...WATERFALL(),
        {
          id: "bar-to-hosts",
          fromJobId: jobs.bar,
          toJobId: jobs.host,
          kind: "PERCENT_OF_TIPS",
          percent: 5,
        },
      ])
    );
    const { day, of } = await report();
    expect(list(day.notes)).toContain("TIP_OUT_NO_RECEIVERS");
    const hosts = list(day.tipOuts).find((r) => r.ruleId === "bar-to-hosts");
    expect(hosts).toMatchObject({ takenCents: 0, skipped: "NO_RECEIVERS" });
    expect(of(cal).netCents).toBe(16650); // nothing extra taken from Cal
    await save(policy(WATERFALL()));
  });

  test("TC-672: % of sales in a menu category — only the bar items count", async () => {
    await save(
      policy([
        {
          id: "servers-bar-sales",
          fromJobId: jobs.server,
          toJobId: jobs.bar,
          kind: "PERCENT_OF_SALES",
          percent: 7,
          menuGroupIds: [barGroup],
        },
        WATERFALL()[0]!,
      ])
    );
    const { of } = await report();
    // Ana rang 3 beers ($24.00) and a burger: 7% of $24.00 = $1.68.
    expect(of(ana)).toMatchObject({
      tipOutGivenCents: 168,
      netCents: 30000 - 168,
    });
    // Ben rang only food.
    expect(of(ben)).toMatchObject({ tipOutGivenCents: 0, netCents: 20000 });
    // Cal: +$1.68, then 10% of $151.68 = $15.168 → $15.17 to the bussers.
    expect(of(cal)).toMatchObject({
      tipOutReceivedCents: 168,
      tipOutGivenCents: 1517,
    });
    await save(policy(WATERFALL()));
  });

  test("TC-673: no rules — everyone keeps their own tips, as before P6", async () => {
    await save(policy([]));
    const { day, of } = await report();
    expect(of(ana)).toMatchObject({ tipOutGivenCents: 0, netCents: 30000 });
    expect(of(ben)).toMatchObject({ netCents: 20000 });
    expect(of(cal)).toMatchObject({ tipOutReceivedCents: 0, netCents: 15000 });
    expect(of(dee).netCents ?? 0).toBe(0);
    expect(list(day.tipOuts)).toEqual([]);
    await save(policy(WATERFALL()));
  });

  test("TC-674: a tip for someone not clocked in is kept by them and noted", async () => {
    await settle("sam", 12);
    const { day, of } = await report();
    expect(list(day.notes)).toContain("NOT_CLOCKED_IN");
    expect(list(day.notClockedIn)).toEqual([
      expect.objectContaining({ staffMemberId: sam.id, cents: 1200 }),
    ]);
    expect(of(sam)).toMatchObject({ tipOutGivenCents: 0, netCents: 1200 });
  });

  test("TC-675: two jobs in one day — each tip counts under the job clocked into when it was paid", async () => {
    test.setTimeout(240_000);
    const shiftAs = async (jobId: string, key: string, tip: number) => {
      const body = { staffMemberId: fay.id, pin: fay.pin };
      const inn = await tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
        ...body,
        jobId,
      });
      expect(inn.status, JSON.stringify(inn.data)).toBe(200);
      await settle(key, tip);
      // A minute on the clock, so the shift has paid time to cover the tip.
      await sleep(70_000);
      const out = await tabletRaw(
        tabletToken,
        "POST",
        "/staff/clock-out",
        body
      );
      expect(out.status, JSON.stringify(out.data)).toBe(200);
    };
    await shiftAs(jobs.server, "fay-lunch", 80);
    await shiftAs(jobs.bar, "fay-night", 60);

    const { of } = await report();
    const byJob = new Map(list(of(fay).byJob).map((j) => [j.jobId, j]));
    // $80.00 earned serving: 7% to the bar.
    expect(byJob.get(jobs.server)).toMatchObject({
      ownCents: 8000,
      tipOutGivenCents: 560,
    });
    expect(list(byJob.get(jobs.server)?.gaveTo)).toEqual([
      expect.objectContaining({ jobId: jobs.bar, cents: 560 }),
    ]);
    // $60.00 earned bartending: 10% of it (plus any bar share received) to the bussers.
    const bar = byJob.get(jobs.bar);
    expect(bar?.ownCents).toBe(6000);
    expect(Number(bar?.tipOutGivenCents)).toBe(
      Math.round((6000 + Number(bar?.tipOutReceivedCents ?? 0)) * 0.1)
    );
  });

  test("TC-676: the staff tip receipt — only in an approved period, never with pay hidden or without Tip Management", async () => {
    // The owner's own POS membership is their staff-app account.
    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      workweekStartDay: 0,
    });
    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=3"
    );
    const all = list(periods.data.data?.periods);
    const current = all.find((p) => p.status === "IN_PROGRESS");
    const finished = all.find((p) => p.status === "OPEN");
    const mine = (start: string) =>
      staffAppRaw<{ data: Rec }>(
        ownerToken,
        "GET",
        `/restaurants/${restaurantId}/pay-periods/${start}`
      );

    // Today's period isn't approved: no receipt.
    const live = await mine(String(current?.startDate));
    expect(live.status, JSON.stringify(live.data)).toBe(200);
    expect(live.data.data.tipReceipt).toBeNull();

    // A finished week with the owner's declared cash, approved.
    const day = String(finished?.startDate);
    // A job with a rate, or the shift would block approval (no rate).
    await setMemberJobsRaw(ownerToken, restaurantId, ownerMember, [
      { jobId: jobs.server, isPrimary: true },
    ]);
    const entered = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/shifts",
      {
        staffMemberId: ownerMember,
        clockInAt: `${day}T14:00:00.000Z`,
        clockOutAt: `${day}T18:00:00.000Z`,
        jobId: jobs.server,
        reason: "Paper sheet",
      }
    );
    expect(entered.status, JSON.stringify(entered.data)).toBe(201);
    const declared = await tipsRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/declarations",
      {
        staffMemberId: ownerMember,
        businessDate: day,
        amountCents: 500,
      }
    );
    expect(declared.status).toBe(201);
    const ok = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${day}/approve`
    );
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);

    const approved = await mine(day);
    expect(approved.data.data.tipReceipt).toMatchObject({
      ownTipsCents: 0,
      tipOutGivenCents: 0,
      tipOutReceivedCents: 0,
      cardFeeCents: 0,
      netCents: 0,
      heldCents: 500,
    });

    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      scheduling: { showPayToStaff: false },
    });
    expect((await mine(day)).data.data.tipReceipt).toBeNull();
    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      scheduling: { showPayToStaff: true },
    });

    // Without Tip Management (hours kept through Scheduling & Timecards).
    await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SCHEDULING",
      true
    );
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TIP_MANAGEMENT"
    );
    try {
      const without = await mine(day);
      expect(without.status, JSON.stringify(without.data)).toBe(200);
      expect(without.data.data.tipReceipt).toBeNull();
    } finally {
      await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        "TIP_MANAGEMENT",
        true
      );
      await deleteFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        "SCHEDULING"
      );
    }
  });
});
