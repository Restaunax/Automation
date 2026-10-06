/**
 * api-timecards.spec.ts — timecards, overtime, breaks, pay periods (P1) on QA
 * (TC-580..587).
 *
 * No browser. A per-run throwaway restaurant with PAYROLL (→ TIMECARDS), weekly
 * pay periods from the default Sunday anchor, and one staff member with a real
 * account (Gus) holding two jobs: Barista $15 and Shift lead $18. Hours are
 * manager-entered into the two most recent FINISHED pay periods (P1, P2) so
 * they can be approved; the POS part clocks in now.
 *   - the spec's blended-rate case: 30 h × $15 + 15 h × $18 = 45 h → $760.00;
 *   - overtime presets for their effect: FEDERAL, CALIFORNIA, CUSTOM daily;
 *   - a raise never re-prices existing shifts;
 *   - breaks: unpaid meal, paid rest, convert-paid-overage on/off;
 *   - a missed required break blocks approval until reviewed;
 *   - approve locks, reopen needs a reason, the staff app shows hours before
 *     approval and pay only after (and never with "show pay" off);
 *   - the POS: job picker, job not held, breaks on the time clock.
 * Restaurant is in Miami (America/New_York). Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, recordUserForCleanup } from "../../../utils/testData";
import { waitForEmail, extractInviteToken } from "../../../utils/emailHelper";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  registerWithInvite,
  inviteStaffRaw,
  createStaffJobRaw,
  setMemberJobsRaw,
  putPayrollSettingsRaw,
  payrollRaw,
  staffAppRaw,
  ownerStaffRaw,
  tabletRaw,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const DAY = 86_400_000;
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY)
    .toISOString()
    .slice(0, 10);
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00.000Z`;
const REASON = "Entered from the paper sheet";

test.describe.configure({ mode: "serial" });

test.describe("Timecards — overtime, breaks, approval (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );
  test.skip(
    !MAILPIT,
    "Requires Mailpit (MAILPIT_BASE_URL): the invite token travels by email"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tabletToken = "";
  const gus = { email: "", token: "", staffMemberId: "" };
  const GUS_PIN = "2741";
  let barista = "";
  let lead = "";
  /** Sunday-start weekly periods: P1 = last week, P2 = the week before. */
  let p1 = "";
  let p2 = "";
  let monBarista = "";
  let satShift = "";
  let sunShift = "";

  const timecards = async (start: string) => {
    const r = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/timecards?startDate=${start}&endDate=${addDays(start, 6)}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };
  const gusCard = async (start: string) =>
    list((await timecards(start)).employees).find(
      (e) => e.staffMemberId === gus.staffMemberId
    ) as Rec;
  const lineOf = (card: Rec, shiftId: string) =>
    list(card.shifts).find((s) => s.id === shiftId) as Rec;
  const enter = async (
    clockInAt: string,
    clockOutAt: string,
    jobId: string
  ) => {
    const r = await payrollRaw(ownerToken, restaurantId, "POST", "/shifts", {
      staffMemberId: gus.staffMemberId,
      clockInAt,
      clockOutAt,
      jobId,
      reason: REASON,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    return String(r.data.data.id);
  };
  const settings = async (patch: Rec) => {
    const r = await putPayrollSettingsRaw(ownerToken, restaurantId, patch);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return (r.data.data as Rec).settings as Rec;
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-timecards] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "PAYROLL",
      true
    );
    if (!g.ok)
      throw new Error(`[api-timecards] grant: ${JSON.stringify(g.data)}`);

    gus.email = `auto-tc-gus-${runId}@${DOMAIN}`;
    recordUserForCleanup(gus.email);
    const invited = await inviteStaffRaw(ownerToken, restaurantId, {
      email: gus.email,
      firstName: "Gus",
      lastName: "Hale",
    });
    gus.staffMemberId = String(invited.data.data?.staffMemberId ?? "");
    const mail = await waitForEmail(gus.email, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    gus.token = (
      await registerWithInvite({
        firstName: "Gus",
        lastName: "Hale",
        email: gus.email,
        password: `Automation!Staff-${runId}`,
        userInvitationToken: extractInviteToken(
          mail.text_body || mail.html_body
        ),
      })
    ).accessToken;

    barista = String(
      (
        await createStaffJobRaw(ownerToken, restaurantId, {
          name: `Barista ${runId}`,
          defaultHourlyRateCents: 1500,
        })
      ).data.data?.id
    );
    lead = String(
      (
        await createStaffJobRaw(ownerToken, restaurantId, {
          name: `Shift lead ${runId}`,
          defaultHourlyRateCents: 1800,
        })
      ).data.data?.id
    );
    await setMemberJobsRaw(ownerToken, restaurantId, gus.staffMemberId, [
      { jobId: barista, isPrimary: true },
      { jobId: lead },
    ]);
    await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/${gus.staffMemberId}/pin`,
      { pin: GUS_PIN }
    );

    const saved = await settings({
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      workweekStartDay: 0,
    });
    if (saved.payFrequency !== "WEEKLY")
      throw new Error("[api-timecards] weekly periods not saved");
    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=6"
    );
    const finished = list(periods.data.data?.periods)
      .filter((p) => p.status === "OPEN")
      .map((p) => String(p.startDate))
      .sort()
      .reverse();
    p1 = finished[0] ?? "";
    p2 = finished[1] ?? "";
    if (!p1 || !p2)
      throw new Error(
        `[api-timecards] no finished periods: ${JSON.stringify(periods.data)}`
      );

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-tc-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Timecards");
    await allure.label("severity", "critical");
  });

  test("TC-580: two jobs, 45 hours — overtime at the blended rate: $760.00 exactly", async () => {
    // Mon–Fri: Barista 09:00–15:00, Shift lead 15:00–18:00 (local).
    for (let i = 1; i <= 5; i++) {
      const d = addDays(p1, i);
      const id = await enter(at(d, "13:00"), at(d, "19:00"), barista);
      if (i === 1) monBarista = id;
      await enter(at(d, "19:00"), at(d, "22:00"), lead);
    }
    const card = await gusCard(p1);
    expect(card).toMatchObject({
      regularMinutes: 40 * 60,
      overtimeMinutes: 5 * 60,
      doubleTimeMinutes: 0,
      straightTimeCents: 30 * 1500 + 15 * 1800, // $720
      overtimePremiumCents: 4000, // 5 h × 0.5 × $16.00 blended
      totalCents: 76000,
      blockingCount: 0,
    });
    const byJob = new Map(list(card.byJob).map((j) => [j.jobId, j]));
    expect(byJob.get(barista)?.hourlyRateCents).toBe(1500);
    expect(byJob.get(lead)?.hourlyRateCents).toBe(1800);
    // Manager entries are marked, but don't block.
    expect(lineOf(card, monBarista).flags).toContain("MANAGER_ENTRY");
    expect(lineOf(card, monBarista).blockingFlags).toEqual([]);
    const edits = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/shifts/${monBarista}/edits`
    );
    expect(list(edits.data.data)[0]).toMatchObject({
      action: "CREATE",
      reason: REASON,
    });
    // A reason is required for every correction.
    const noReason = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/shifts",
      {
        staffMemberId: gus.staffMemberId,
        clockInAt: at(addDays(p1, 6), "02:00"),
        clockOutAt: at(addDays(p1, 6), "03:00"),
        jobId: barista,
      }
    );
    expect(noReason.status).toBe(400);
    // Overlapping an existing shift is refused.
    const overlap = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/shifts",
      {
        staffMemberId: gus.staffMemberId,
        clockInAt: at(addDays(p1, 1), "14:00"),
        clockOutAt: at(addDays(p1, 1), "15:00"),
        jobId: barista,
        reason: REASON,
      }
    );
    expect(overlap.status).toBe(400);
  });

  test("TC-581: overtime rules for their effect on a 13-hour day — FEDERAL, CALIFORNIA, CUSTOM", async () => {
    const wed = addDays(p2, 3);
    // 07:00–20:00 local as Shift lead ($18).
    const long = await enter(
      at(wed, "11:00"),
      at(addDays(wed, 1), "00:00"),
      lead
    );
    expect(lineOf(await gusCard(p2), long).paidMinutes).toBe(13 * 60);
    const federal = await gusCard(p2);
    expect(federal).toMatchObject({
      regularMinutes: 13 * 60,
      overtimeMinutes: 0,
      totalCents: 13 * 1800,
    });

    const ca = await settings({ overtime: { preset: "CALIFORNIA" } });
    expect(ca.overtime).toMatchObject({
      preset: "CALIFORNIA",
      dailyThresholdHours: 8,
      dailyDoubleTimeHours: 12,
    });
    expect(await gusCard(p2)).toMatchObject({
      regularMinutes: 8 * 60,
      overtimeMinutes: 4 * 60,
      doubleTimeMinutes: 60,
      totalCents: 8 * 1800 + 4 * 2700 + 3600,
    });

    const custom = await settings({
      overtime: {
        preset: "CUSTOM",
        weeklyThresholdHours: 40,
        dailyThresholdHours: 10,
        dailyDoubleTimeHours: null,
        seventhConsecutiveDay: false,
        overtimeMultiplier: 1.5,
        doubleTimeMultiplier: 2,
      },
    });
    expect(custom.overtime.preset).toBe("CUSTOM");
    expect(await gusCard(p2)).toMatchObject({
      regularMinutes: 10 * 60,
      overtimeMinutes: 3 * 60,
      doubleTimeMinutes: 0,
      totalCents: 10 * 1800 + 3 * 2700,
    });

    const back = await settings({ overtime: { preset: "FEDERAL" } });
    expect(back.overtime).toMatchObject({
      preset: "FEDERAL",
      weeklyThresholdHours: 40,
      dailyThresholdHours: null,
    });
    expect((await gusCard(p2)).totalCents).toBe(13 * 1800);
  });

  test("TC-582: a raise never re-prices hours already worked", async () => {
    const raise = await payrollRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/jobs/${barista}`,
      { defaultHourlyRateCents: 1600 }
    );
    expect(raise.status, JSON.stringify(raise.data)).toBe(200);
    expect((await gusCard(p1)).totalCents).toBe(76000);
    // Saturday 09:00–13:00 local, entered after the raise: $16.
    const sat = addDays(p1, 6);
    satShift = await enter(at(sat, "13:00"), at(sat, "17:00"), barista);
    expect(lineOf(await gusCard(p1), satShift).hourlyRateCents).toBe(1600);
  });

  test("TC-583: breaks — unpaid meal reduces paid time, a paid rest doesn't, overage converts only when on", async () => {
    const sat = addDays(p1, 6);
    const add = async (breakTypeId: string, from: string, to: string) => {
      const r = await payrollRaw(
        ownerToken,
        restaurantId,
        "POST",
        `/shifts/${satShift}/breaks`,
        {
          breakTypeId,
          startAt: at(sat, from),
          endAt: at(sat, to),
          reason: REASON,
        }
      );
      expect(r.status, JSON.stringify(r.data)).toBe(201);
    };
    await add("meal", "14:00", "14:30");
    let line = lineOf(await gusCard(p1), satShift);
    expect(line).toMatchObject({ paidMinutes: 210, unpaidBreakMinutes: 30 });

    // A paid 10-minute rest taken for 16 minutes.
    await add("rest", "15:00", "15:16");
    line = lineOf(await gusCard(p1), satShift);
    expect(line).toMatchObject({
      paidMinutes: 210,
      paidBreakMinutes: 16,
      unpaidBreakMinutes: 30,
    });

    const on = await settings({
      breaks: {
        types: [
          {
            id: "meal",
            name: "Meal break",
            expectedMinutes: 30,
            isPaid: false,
          },
          { id: "rest", name: "Rest break", expectedMinutes: 10, isPaid: true },
        ],
        rules: [],
        convertPaidOverageToUnpaid: true,
      },
    });
    expect(on.breaks.convertPaidOverageToUnpaid).toBe(true);
    line = lineOf(await gusCard(p1), satShift);
    expect(line).toMatchObject({
      paidMinutes: 204,
      paidBreakMinutes: 10,
      unpaidBreakMinutes: 36,
    });
  });

  test("TC-584: a missed required break blocks approval until a manager reviews it", async () => {
    await settings({
      breaks: {
        types: [
          {
            id: "meal",
            name: "Meal break",
            expectedMinutes: 30,
            isPaid: false,
          },
          { id: "rest", name: "Rest break", expectedMinutes: 10, isPaid: true },
        ],
        rules: [
          {
            breakTypeId: "meal",
            afterHours: 6.5,
            repeat: false,
            waivable: false,
          },
        ],
        convertPaidOverageToUnpaid: true,
      },
    });
    // Sunday 09:00–16:00 local, 7 h, no break.
    sunShift = await enter(at(p1, "13:00"), at(p1, "20:00"), barista);
    let card = await gusCard(p1);
    expect(lineOf(card, sunShift).blockingFlags).toContain("MISSED_BREAK");
    // 6-hour shifts are under the rule.
    expect(lineOf(card, monBarista).flags).not.toContain("MISSED_BREAK");
    expect(card.blockingCount).toBe(1);

    const refused = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`
    );
    expect(refused.status).toBe(400);

    const noReason = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/shifts/${sunShift}/review`,
      {}
    );
    expect(noReason.status).toBe(400);
    const reviewed = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/shifts/${sunShift}/review`,
      { reason: "Took his break off the clock, confirmed" }
    );
    expect(reviewed.status, JSON.stringify(reviewed.data)).toBe(200);
    card = await gusCard(p1);
    expect(lineOf(card, sunShift).reviewed).toBe(true);
    expect(card.blockingCount).toBe(0);
  });

  test("TC-585: approve locks the period; reopen needs a reason; the labor report agrees", async () => {
    const before = await gusCard(p1);
    // Staff app before approval: hours, no money.
    const pending = await staffAppRaw<{ data: Rec }>(
      gus.token,
      "GET",
      `/restaurants/${restaurantId}/pay-periods/${p1}`
    );
    expect(pending.status).toBe(200);
    expect(pending.data.data).toMatchObject({
      approved: false,
      regularMinutes: before.regularMinutes,
      overtimeMinutes: before.overtimeMinutes,
      wagesCents: null,
    });

    const ok = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`
    );
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    expect(ok.data.data).toMatchObject({ startDate: p1, status: "APPROVED" });
    const again = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`
    );
    expect(again.status).toBe(400);

    const edit = await payrollRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/shifts/${monBarista}`,
      { clockOutAt: at(addDays(p1, 1), "18:30"), reason: REASON }
    );
    expect(edit.status, "locked").toBe(403);
    const add = await payrollRaw(ownerToken, restaurantId, "POST", "/shifts", {
      staffMemberId: gus.staffMemberId,
      clockInAt: at(addDays(p1, 6), "02:00"),
      clockOutAt: at(addDays(p1, 6), "03:00"),
      jobId: barista,
      reason: REASON,
    });
    expect(add.status, "locked").toBe(403);

    // Staff app after approval: the approved money, exactly.
    const approved = await staffAppRaw<{ data: Rec }>(
      gus.token,
      "GET",
      `/restaurants/${restaurantId}/pay-periods/${p1}`
    );
    expect(approved.data.data).toMatchObject({
      approved: true,
      wagesCents: before.totalCents,
      regularMinutes: before.regularMinutes,
    });

    // Labor report for the period = the timecards.
    const labor = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/labor?startDate=${p1}&endDate=${addDays(p1, 6)}&groupBy=employee`
    );
    expect(labor.status).toBe(200);
    expect(labor.data.data.totals).toMatchObject({
      wageCents: before.totalCents,
      regularMinutes: before.regularMinutes,
      overtimeMinutes: before.overtimeMinutes,
    });
    const csv = await payrollRaw<string>(
      ownerToken,
      restaurantId,
      "GET",
      `/labor.csv?startDate=${p1}&endDate=${addDays(p1, 6)}&groupBy=employee`
    );
    expect(csv.status).toBe(200);
    expect(String(csv.data)).toContain((before.totalCents / 100).toFixed(2));

    const noReason = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/reopen`,
      {}
    );
    expect(noReason.status).toBe(400);
    const reopened = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/reopen`,
      { reason: "Fix Monday's clock-out" }
    );
    expect(reopened.status).toBe(200);
    expect(reopened.data.data.status).toBe("REOPENED");
    const fixed = await payrollRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/shifts/${monBarista}`,
      { clockOutAt: at(addDays(p1, 1), "18:30"), reason: REASON }
    );
    expect(fixed.status, JSON.stringify(fixed.data)).toBe(200);
    expect(lineOf(await gusCard(p1), monBarista).paidMinutes).toBe(330);
    const re = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`
    );
    expect(re.status, JSON.stringify(re.data)).toBe(200);
  });

  test("TC-586: periods that aren't over can't be approved; 'show pay' off hides approved pay", async () => {
    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=3"
    );
    const current = list(periods.data.data.periods).find(
      (p) => p.status === "IN_PROGRESS"
    );
    expect(current).toBeTruthy();
    const early = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${current?.startDate}/approve`
    );
    expect(early.status).toBe(400);
    const notBoundary = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${addDays(p2, 2)}/approve`
    );
    expect(notBoundary.status).toBe(400);

    await settings({ scheduling: { showPayToStaff: false } });
    const hidden = await staffAppRaw<{ data: Rec }>(
      gus.token,
      "GET",
      `/restaurants/${restaurantId}/pay-periods/${p1}`
    );
    expect(hidden.data.data).toMatchObject({
      approved: true,
      payHidden: true,
      wagesCents: null,
    });
    expect(hidden.data.data.regularMinutes).toBeGreaterThan(0);
    await settings({ scheduling: { showPayToStaff: true } });
  });

  test("TC-587: POS time clock — job picker, a job not held is refused, breaks", async () => {
    const clock = await tabletRaw<Rec>(tabletToken, "GET", "/staff/time-clock");
    expect(clock.status).toBe(200);
    expect(
      list(clock.data.breakTypes)
        .map((b) => b.id)
        .sort()
    ).toEqual(["meal", "rest"]);
    const me = list(clock.data.data).find((s) => s.id === gus.staffMemberId);
    expect(list(me?.jobs).length).toBe(2);

    const other = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Host ${runId}`,
      defaultHourlyRateCents: 1400,
    });
    const notHeld = await tabletRaw(tabletToken, "POST", "/staff/clock-in", {
      staffMemberId: gus.staffMemberId,
      pin: GUS_PIN,
      jobId: other.data.data?.id,
    });
    expect(notHeld.status).toBe(400);

    const inn = await tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
      staffMemberId: gus.staffMemberId,
      pin: GUS_PIN,
      jobId: lead,
    });
    expect(inn.status, JSON.stringify(inn.data)).toBe(200);
    expect(inn.data.data.shift).toMatchObject({
      jobId: lead,
      hourlyRateCents: 1800,
    });
    const body = { staffMemberId: gus.staffMemberId, pin: GUS_PIN };
    const start = await tabletRaw(tabletToken, "POST", "/staff/break/start", {
      ...body,
      breakTypeId: "rest",
    });
    expect(start.status, JSON.stringify(start.data)).toBe(200);
    const onBreak = list(
      (await tabletRaw<Rec>(tabletToken, "GET", "/staff/time-clock")).data.data
    ).find((s) => s.id === gus.staffMemberId);
    expect(onBreak?.activeBreak).toMatchObject({ breakTypeName: "Rest break" });
    const end = await tabletRaw(tabletToken, "POST", "/staff/break/end", body);
    expect(end.status, JSON.stringify(end.data)).toBe(200);
    const out = await tabletRaw(tabletToken, "POST", "/staff/clock-out", body);
    expect(out.status, JSON.stringify(out.data)).toBe(200);
  });
});
