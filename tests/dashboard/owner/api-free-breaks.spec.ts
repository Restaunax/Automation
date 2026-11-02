/**
 * api-free-breaks.spec.ts — basic breaks are free (packaging v2) on QA
 * (TC-637..641).
 *
 * No browser. A per-run throwaway restaurant with NO add-on, a REGISTER
 * device, and four PIN staff created on the POS (one per scenario, so their
 * shifts never overlap):
 *   - break TYPES come with STAFF: the time clock offers them, the owner edits
 *     them through /restaurant/:rid/staff/break-types (the rest of payroll
 *     settings stays behind TIMECARDS);
 *   - start / end a break on the time clock with no add-on;
 *   - hours: unpaid break time is not worked time, paid break time is
 *     (offline replay places the punches in the past, so the minutes are
 *     exact); an "unpaid" break under 20 minutes is paid, and a break type
 *     can't be unpaid and under 20 minutes (29 CFR 785.18);
 *   - break RULES: ignored without TIMECARDS (no skipped-break question at
 *     clock-out), enforced with it (SCHEDULING brings TIMECARDS).
 *   - W3:H2 (TC-1435, Stage 5 labor-law engines, gated by
 *     `RELEASED_ON_QA.laborEngines`): the 20 minutes is the federal floor; a
 *     CONFIRMED state meal-break rule can raise it. The tenant is in Miami
 *     (no Florida meal-break law), so the labor rules — a core read, no
 *     add-on — report 20, matching TC-1150 / TC-1151. The manager's break
 *     decision (Pay premium / Employee waived) is a timecards action: on the
 *     free tier it answers 403 FEATURE_NOT_ENTITLED like the rest of payroll.
 * Fails (never skips) without ADMIN_EMAIL / ADMIN_PASSWORD. Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { requireRelease, probeLaborEngines } from "../../../utils/releaseGate";
import { laborRulesRaw } from "../../../utils/backOfficeApi";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  ownerStaffRaw,
  payrollRaw,
  putPayrollSettingsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const minutesAgo = (m: number) =>
  new Date(Math.floor(Date.now() / 60_000) * 60_000 - m * 60_000).toISOString();

test.describe.configure({ mode: "serial" });

test.describe("Basic breaks without an add-on (API)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tabletToken = "";
  type Person = { id: string; pin: string };
  const rae: Person = { id: "", pin: "3816" }; // replayed hours
  const tia: Person = { id: "", pin: "5207" }; // live break
  const uma: Person = { id: "", pin: "6491" }; // rules without TIMECARDS
  const vic: Person = { id: "", pin: "7359" }; // rules with TIMECARDS

  // `tag` keeps clientEventIds unique per replay: a reused id comes back as a
  // duplicate (TC-1151 once replayed TC-638's ids and its CLOCK_OUT bounced).
  const replay = (who: Person, events: Rec[], tag: string) =>
    tabletRaw<Rec>(tabletToken, "POST", "/staff/time-clock/replay", {
      events: events.map((e, i) => ({
        clientEventId: `${runId}-${tag}-${who.id}-${i}-${String(e.kind)}`,
        staffMemberId: who.id,
        ...e,
      })),
    });
  const clock = async () => {
    const r = await tabletRaw<Rec>(tabletToken, "GET", "/staff/time-clock");
    expect(r.status).toBe(200);
    return r.data;
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    // Fail, never skip, without the environment (W5:T7): the file mints its
    // own tenant.
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
      throw new Error("[api-free-breaks] ADMIN_EMAIL / ADMIN_PASSWORD not set");
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-free-breaks] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-breaks-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
    const owner = await setOwnerPosPin(ownerToken, restaurantId, "8462");
    const session = await tabletStaffSignIn(tabletToken, owner, "8462");
    for (const [p, first] of [
      [rae, "Rae"],
      [tia, "Tia"],
      [uma, "Uma"],
      [vic, "Vic"],
    ] as const) {
      const r = await tabletRaw<Rec>(
        tabletToken,
        "POST",
        "/staff/manage",
        { firstName: first, lastName: "Break", pin: p.pin },
        session
      );
      if (r.status !== 201)
        throw new Error(`[api-free-breaks] staff: ${JSON.stringify(r.data)}`);
      p.id = String(r.data.data.id);
    }
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Basic breaks");
    await allure.label("severity", "critical");
  });

  test("TC-637: with no add-on the time clock offers the break types, and the owner edits them", async () => {
    const types = list((await clock()).breakTypes);
    expect(types).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "meal",
          expectedMinutes: 30,
          isPaid: false,
        }),
        expect.objectContaining({
          id: "rest",
          expectedMinutes: 10,
          isPaid: true,
        }),
      ])
    );
    const got = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/break-types"
    );
    expect(got.status, JSON.stringify(got.data)).toBe(200);
    expect(
      list(got.data.data.breakTypes)
        .map((t) => t.id)
        .sort()
    ).toEqual(["meal", "rest"]);

    const saved = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/break-types",
      {
        breakTypes: [
          {
            id: "meal",
            name: "Meal break",
            expectedMinutes: 30,
            isPaid: false,
          },
          { id: "rest", name: "Coffee", expectedMinutes: 15, isPaid: true },
        ],
      }
    );
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    const coffee = list((await clock()).breakTypes).find(
      (t) => t.id === "rest"
    );
    expect(coffee).toMatchObject({
      name: "Coffee",
      expectedMinutes: 15,
      isPaid: true,
    });

    // Everything else in payroll settings still needs the add-on.
    expect(
      (await payrollRaw(ownerToken, restaurantId, "GET", "/settings")).status
    ).toBe(403);
  });

  test("TC-638: hours — an unpaid break isn't worked time, a paid one is", async () => {
    // 100 minutes on the clock: a 30-minute meal (unpaid) and a 10-minute
    // coffee (paid) → 70 paid minutes.
    const r = await replay(
      rae,
      [
        { kind: "CLOCK_IN", occurredAt: minutesAgo(120) },
        {
          kind: "BREAK_START",
          occurredAt: minutesAgo(100),
          breakTypeId: "meal",
        },
        { kind: "BREAK_END", occurredAt: minutesAgo(70) },
        {
          kind: "BREAK_START",
          occurredAt: minutesAgo(60),
          breakTypeId: "rest",
        },
        { kind: "BREAK_END", occurredAt: minutesAgo(50) },
        { kind: "CLOCK_OUT", occurredAt: minutesAgo(20) },
      ],
      "tc638"
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(list(r.data.data?.results).map((x) => x.status)).toEqual(
      Array(6).fill("applied")
    );

    const from = minutesAgo(180);
    const to = minutesAgo(-5);
    const shifts = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/shifts?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );
    expect(shifts.status, JSON.stringify(shifts.data)).toBe(200);
    const mine = list(shifts.data.data).find((s) => s.staffMemberId === rae.id);
    expect(mine).toMatchObject({
      durationMinutes: 100,
      unpaidBreakMinutes: 30,
      paidMinutes: 70,
    });
  });

  // W3:H1 (29 CFR 785.18): breaks under 20 minutes are paid time. Since
  // Stage 5 (W3:H2) 20 is the federal fallback; a confirmed state meal rule
  // can raise it. Miami has none, so 20 stands.
  test("TC-1150: an unpaid break type under 20 minutes is refused, in plain words", async () => {
    const res = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/break-types",
      {
        breakTypes: [
          {
            id: "meal",
            name: "Meal break",
            expectedMinutes: 30,
            isPaid: false,
          },
          { id: "smoke", name: "Smoke", expectedMinutes: 10, isPaid: false },
        ],
      }
    );
    expect(res.status, JSON.stringify(res.data)).toBe(400);
    expect(String(res.data.message)).toContain("Smoke");
    expect(String(res.data.message)).toContain("20 minutes");
    // Nothing was saved.
    const got = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/break-types"
    );
    expect(list(got.data.data.breakTypes).map((t) => t.id)).not.toContain(
      "smoke"
    );
  });

  test("TC-1151: an unpaid break taken for under 20 minutes stays paid time", async () => {
    // After TC-638's shift: 17 minutes on the clock with a 12-minute meal.
    const r = await replay(
      rae,
      [
        { kind: "CLOCK_IN", occurredAt: minutesAgo(19) },
        {
          kind: "BREAK_START",
          occurredAt: minutesAgo(17),
          breakTypeId: "meal",
        },
        { kind: "BREAK_END", occurredAt: minutesAgo(5) },
        { kind: "CLOCK_OUT", occurredAt: minutesAgo(2) },
      ],
      "tc1151"
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(list(r.data.data?.results).map((x) => x.status)).toEqual(
      Array(4).fill("applied")
    );
    const shifts = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/shifts?from=${encodeURIComponent(minutesAgo(30))}&to=${encodeURIComponent(minutesAgo(-5))}`
    );
    expect(shifts.status, JSON.stringify(shifts.data)).toBe(200);
    const mine = list(shifts.data.data).find(
      (s) => s.staffMemberId === rae.id && s.durationMinutes === 17
    );
    expect(mine).toMatchObject({ unpaidBreakMinutes: 0, paidMinutes: 17 });
  });

  test("TC-1435: W3:H2 free tier — the labor rules say 20 minutes (federal floor); a break decision needs Timecards @labor-engines", async () => {
    requireRelease(
      "laborEngines",
      await probeLaborEngines(ownerToken, restaurantId)
    );
    // Core read, no add-on: Florida has no meal-break law to raise the floor.
    const rules = await laborRulesRaw(ownerToken, restaurantId);
    expect(rules.status, JSON.stringify(rules.data)).toBe(200);
    expect(rules.data.data).toMatchObject({ minUnpaidBreakMinutes: 20 });
    const meal = list(rules.data.data?.rules).find(
      (r) => r.ruleKey === "mealBreak"
    );
    // Florida's row says "no requirement" (value null), so nothing raises it.
    expect(meal, JSON.stringify(rules.data.data?.rules)).toBeTruthy();
    expect(meal?.value ?? null).toBeNull();

    // Rae's 100-minute shift (TC-638): deciding on it is a payroll action.
    const shifts = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/shifts?from=${encodeURIComponent(minutesAgo(24 * 60))}&to=${encodeURIComponent(minutesAgo(-5))}`
    );
    expect(shifts.status, JSON.stringify(shifts.data)).toBe(200);
    const raes = list(shifts.data.data).find(
      (s) => s.staffMemberId === rae.id && s.durationMinutes === 100
    );
    expect(raes, JSON.stringify(shifts.data.data)).toBeTruthy();
    const decided = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/shifts/${String(raes?.id)}/break-decision`,
      { decision: "PAY_PREMIUM" }
    );
    expect(decided.status, JSON.stringify(decided.data)).toBe(403);
    expect((decided.data as Rec).error).toBe("FEATURE_NOT_ENTITLED");
  });

  test("TC-639: start and end a break on the time clock with no add-on", async () => {
    const body = { staffMemberId: tia.id, pin: tia.pin };
    const early = await tabletRaw(tabletToken, "POST", "/staff/break/start", {
      ...body,
      breakTypeId: "meal",
    });
    expect(early.status, "not clocked in").toBeGreaterThanOrEqual(400);
    expect(early.status).toBeLessThan(500);

    expect(
      (await tabletRaw(tabletToken, "POST", "/staff/clock-in", body)).status
    ).toBe(200);
    const start = await tabletRaw(tabletToken, "POST", "/staff/break/start", {
      ...body,
      breakTypeId: "meal",
    });
    expect(start.status, JSON.stringify(start.data)).toBe(200);
    const onBreak = list((await clock()).data).find((s) => s.id === tia.id);
    expect(onBreak?.activeBreak).toMatchObject({ breakTypeName: "Meal break" });
    // A break is a pause, not a clock-out: still on the clock.
    expect(onBreak?.activeShift).toBeTruthy();
    const end = await tabletRaw(tabletToken, "POST", "/staff/break/end", body);
    expect(end.status, JSON.stringify(end.data)).toBe(200);
    const after = list((await clock()).data).find((s) => s.id === tia.id);
    expect(after?.activeBreak).toBeNull();
    expect(
      (await tabletRaw(tabletToken, "POST", "/staff/clock-out", body)).status
    ).toBe(200);
  });

  test("TC-640: break rules are ignored without TIMECARDS — no skipped-break question at clock-out", async () => {
    // Rules can only be saved with TIMECARDS: save one, then take it away.
    await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SCHEDULING",
      true
    );
    const rule = await putPayrollSettingsRaw(ownerToken, restaurantId, {
      breaks: {
        types: [
          {
            id: "meal",
            name: "Meal break",
            expectedMinutes: 30,
            isPaid: false,
          },
          { id: "rest", name: "Coffee", expectedMinutes: 15, isPaid: true },
        ],
        rules: [
          {
            breakTypeId: "meal",
            afterHours: 0.5,
            repeat: false,
            waivable: true,
          },
        ],
        convertPaidOverageToUnpaid: false,
      },
    });
    expect(rule.status, JSON.stringify(rule.data)).toBe(200);
    await deleteFeatureOverrideAdminRaw(adminToken, restaurantId, "SCHEDULING");

    // 45 minutes on the clock, no break, past the 30-minute rule.
    const inn = await replay(
      uma,
      [{ kind: "CLOCK_IN", occurredAt: minutesAgo(45) }],
      "tc640"
    );
    expect(inn.status, JSON.stringify(inn.data)).toBe(200);
    const out = await tabletRaw(tabletToken, "POST", "/staff/clock-out", {
      staffMemberId: uma.id,
      pin: uma.pin,
      supportsBreakWaivers: true,
    });
    expect(out.status, JSON.stringify(out.data)).toBe(200);
  });

  test("TC-641: with TIMECARDS the same rule asks at clock-out, and a waiver closes the shift", async () => {
    await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SCHEDULING",
      true
    );
    try {
      const inn = await replay(
        vic,
        [{ kind: "CLOCK_IN", occurredAt: minutesAgo(45) }],
        "tc641"
      );
      expect(inn.status, JSON.stringify(inn.data)).toBe(200);
      const body = {
        staffMemberId: vic.id,
        pin: vic.pin,
        supportsBreakWaivers: true,
      };
      const asked = await tabletRaw<Rec>(
        tabletToken,
        "POST",
        "/staff/clock-out",
        body
      );
      expect(asked.status, JSON.stringify(asked.data)).toBe(409);
      expect(asked.data.errorCode).toBe("STAFF_BREAK_WAIVER_REQUIRED");
      expect(
        list(asked.data.details?.dueBreaks).map((d) => d.breakTypeId ?? d.id)
      ).toContain("meal");
      const waived = await tabletRaw(tabletToken, "POST", "/staff/clock-out", {
        ...body,
        breakWaivers: ["meal"],
      });
      expect(waived.status, JSON.stringify(waived.data)).toBe(200);
    } finally {
      await deleteFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        "SCHEDULING"
      );
    }
  });
});
