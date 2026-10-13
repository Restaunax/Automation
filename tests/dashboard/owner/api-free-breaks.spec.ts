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
 *     exact);
 *   - break RULES: ignored without TIMECARDS (no skipped-break question at
 *     clock-out), enforced with it (SCHEDULING brings TIMECARDS).
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
  type Person = { id: string; pin: string };
  const rae: Person = { id: "", pin: "3816" }; // replayed hours
  const tia: Person = { id: "", pin: "5207" }; // live break
  const uma: Person = { id: "", pin: "6491" }; // rules without TIMECARDS
  const vic: Person = { id: "", pin: "7359" }; // rules with TIMECARDS

  const replay = (who: Person, events: Rec[]) =>
    tabletRaw<Rec>(tabletToken, "POST", "/staff/time-clock/replay", {
      events: events.map((e, i) => ({
        clientEventId: `${runId}-${who.id}-${i}-${String(e.kind)}`,
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
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
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
    const r = await replay(rae, [
      { kind: "CLOCK_IN", occurredAt: minutesAgo(120) },
      { kind: "BREAK_START", occurredAt: minutesAgo(100), breakTypeId: "meal" },
      { kind: "BREAK_END", occurredAt: minutesAgo(70) },
      { kind: "BREAK_START", occurredAt: minutesAgo(60), breakTypeId: "rest" },
      { kind: "BREAK_END", occurredAt: minutesAgo(50) },
      { kind: "CLOCK_OUT", occurredAt: minutesAgo(20) },
    ]);
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
    const inn = await replay(uma, [
      { kind: "CLOCK_IN", occurredAt: minutesAgo(45) },
    ]);
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
      const inn = await replay(vic, [
        { kind: "CLOCK_IN", occurredAt: minutesAgo(45) },
      ]);
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
