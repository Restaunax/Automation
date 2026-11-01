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
 *   - the POS: job picker, job not held, breaks on the time clock;
 *   - W3:C3 (TC-1264/1265): Miami's $15.00 minimum ($11.98 tipped cash wage,
 *     a CONFIRMED rule) refuses a low rate; a tipped server at the cash
 *     wage working 45 h with no tips gets overtime on the full minimum
 *     ($7.50 premium an hour, not half the cash wage) and a weekly top-up.
 *   - W3:H7 (TC-1360..1363): P1 marked paid → PAID with paidAt, idempotent;
 *     a paid period is never reopened (403 PERIOD_PAID); a correction inside
 *     it is allowed and its pay difference is carried by the next open
 *     period (the current one) as a prior-period adjustment. Safe on QA: the
 *     tenant is this file's own and is deleted in afterAll, so a PAID period
 *     (which can't be reopened) never outlives the run.
 *   - W3:M1 / H2 (TC-1430..1434, Stage 5 labor-law engines, gated by
 *     `RELEASED_ON_QA.laborEngines`): the timecards carry `laborRules`
 *     (overtime applied and why, break / premium rules, the 20-minute
 *     federal unpaid-break floor in Florida) and premium fields; a missed
 *     break is settled by a break decision (Pay premium, or Employee waived
 *     with what they attested to) as well as by the old "Mark reviewed"
 *     (TC-584, kept for older builds); "Use my state's rules" (STATE) is the
 *     default overtime preset and is accepted on save; the owner reads and
 *     confirms the state's labor rules. Florida has no state overtime beyond
 *     the federal 40 hours and no state meal-break law, so every amount the
 *     older cases assert is unchanged under STATE.
 *   - W0:J5 (TC-1730, Stage 6 daily views, gated by
 *     `RELEASED_ON_QA.dailyViewsStage6`): the approve preview of an approved
 *     period is its frozen snapshot; reopened, the preview rebuilds the
 *     snapshot approval would store — the same per-person figures and
 *     totals — and wages + premiums = the timecards' total.
 * Restaurant is in Miami (America/New_York). Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  requireRelease,
  probeLaborEngines,
  probeDailyViewsStage6,
} from "../../../utils/releaseGate";
import {
  laborRulesRaw,
  confirmLaborRuleRaw,
  looksLikeKey,
} from "../../../utils/backOfficeApi";
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
  /** The settings GET before this file saved anything (W3:M1 default). */
  let unsavedSettings: Rec = {};

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
    // Fail, never skip, without the environment (W5:T7).
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
      throw new Error("[api-timecards] ADMIN_EMAIL / ADMIN_PASSWORD not set");
    if (!MAILPIT)
      throw new Error(
        "[api-timecards] MAILPIT_BASE_URL not set: the invite token travels by email"
      );
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

    // Read before the first save: what a restaurant without saved settings
    // gets (TC-1432 asserts it once the Stage 5 change is on QA).
    const unsaved = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/settings"
    );
    unsavedSettings = ((unsaved.data.data as Rec | undefined)?.settings ??
      {}) as Rec;
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

  test("TC-1730: W0:J5 the approve preview equals the snapshot approval freezes @daily-views", async () => {
    requireRelease(
      "dailyViewsStage6",
      await probeDailyViewsStage6(ownerToken, restaurantId)
    );
    const preview = async () => {
      const r = await payrollRaw<{ data: Rec }>(
        ownerToken,
        restaurantId,
        "GET",
        `/pay-periods/${p1}/approve-preview`
      );
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      return r.data.data;
    };
    // P1 is approved (TC-585): the preview is the stored snapshot.
    const frozen = await preview();
    expect(frozen.frozen).toBe(true);
    const card = await gusCard(p1);
    const gusLine = list(frozen.people).find(
      (p) => p.staffMemberId === gus.staffMemberId
    );
    expect(gusLine, "Gus has a line").toBeTruthy();
    expect(Number(gusLine?.wagesCents) + Number(gusLine?.premiumsCents)).toBe(
      card.totalCents
    );
    expect(Number(gusLine?.minutes)).toBe(
      card.regularMinutes + card.overtimeMinutes + card.doubleTimeMinutes
    );
    // Reopened, nothing changed: the rebuilt preview is the same document.
    const reopened = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/reopen`,
      { reason: "Check the approve preview" }
    );
    expect(reopened.status, JSON.stringify(reopened.data)).toBe(200);
    const open = await preview();
    expect(open.frozen).toBe(false);
    expect(open.people).toEqual(frozen.people);
    expect(open.totals).toEqual(frozen.totals);
    // Plain sentences, never codes, for anything to confirm.
    for (const n of list(open.notices)) {
      expect(String(n.message)).not.toMatch(/^api:|approveNotice/);
    }
    const again = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`,
      {
        acknowledge: list(open.notices)
          .filter((n) => n.needsConfirmation)
          .map((n) => n.code),
      }
    );
    expect(again.status, JSON.stringify(again.data)).toBe(200);
    expect((await preview()).totals).toEqual(open.totals);
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
      // At or above Miami's $15.00 minimum (W3:C3).
      defaultHourlyRateCents: 1600,
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

  test("TC-1264: W3:C3 a rate below Miami's minimum is refused; the minimum and the tip credit read back", async () => {
    const low = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Dish ${runId}`,
      defaultHourlyRateCents: 900,
    });
    expect(low.status).toBe(400);
    expect(String((low.data as Rec).message)).toBe(
      `$9.00 an hour for Dish ${runId} is below the minimum wage here: $15.00 an hour (FL state minimum wage).`
    );
    const credit = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/tip-credit"
    );
    expect(credit.status, JSON.stringify(credit.data)).toBe(200);
    expect(credit.data.data).toMatchObject({
      usesTipCredit: false,
      floor: {
        fullWageCents: 1500,
        tippedCashWageCents: 1198,
        status: "CONFIRMED",
        fullWageSourceLabel: "FL state minimum wage",
      },
    });
  });

  test("TC-1265: W3:C2/C3 a tipped server at the cash wage, 45 h, no tips: OT on the full minimum + a weekly top-up", async () => {
    const server = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Server ${runId}`,
      defaultHourlyRateCents: 1198,
      isTipped: true,
    });
    expect(server.status, JSON.stringify(server.data)).toBe(201);
    const serverId = String(server.data.data?.id);
    await setMemberJobsRaw(ownerToken, restaurantId, gus.staffMemberId, [
      { jobId: barista, isPrimary: true },
      { jobId: lead },
      { jobId: serverId },
    ]);
    // The tip credit is now derived from the rates.
    const credit = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/tip-credit"
    );
    expect(credit.data.data.usesTipCredit).toBe(true);
    // A free week three weeks back: Mon–Fri 9 h as Server = 45 h.
    const week = addDays(p2, -7);
    for (let d = 1; d <= 5; d++)
      await enter(
        at(addDays(week, d), "13:00"),
        at(addDays(week, d), "22:00"),
        serverId
      );
    const card = await gusCard(week);
    // Straight 45 × $11.98 = $539.10. Regular rate = cash + $3.02 tip credit
    // = $15.00, so 5 OT hours carry 5 × $7.50 = $37.50 (each OT hour pays
    // $19.48 = 1.5 × $15.00 − $3.02). No tips: cash $539.10 is short of
    // 45 × $15.00 = $675.00 by $135.90 — the top-up.
    expect(card).toMatchObject({
      regularMinutes: 2400,
      overtimeMinutes: 300,
      straightTimeCents: 53910,
      overtimePremiumCents: 3750,
      tipCreditCents: 45 * 302,
      minimumWageTopUpCents: 13590,
      totalCents: 53910 + 3750 + 13590,
    });
    expect(list(card.wageWeeks)[0]).toMatchObject({
      weekStart: week,
      regularRateCents: 1500,
      requiredCents: 67500,
      tipsCents: 0,
      topUpCents: 13590,
    });
  });
  // ── W3:H7: paid pay periods lock (RestauNax back-office audit Stage 4) ──
  // P1 is APPROVED (re-approved in TC-585) and over. The tenant is this
  // file's own, so marking it PAID — irreversible — touches nothing else.
  let paidAt = "";

  test("TC-1360: W3:H7 marking an approved, finished period paid makes it PAID with paidAt", async () => {
    const r = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/mark-paid`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.data).toMatchObject({
      startDate: p1,
      endDate: addDays(p1, 6),
      status: "PAID",
    });
    paidAt = String(r.data.data.paidAt ?? "");
    expect(Number.isNaN(Date.parse(paidAt)), paidAt).toBe(false);
    expect(String(r.data.message ?? "")).not.toMatch(/^api:/);

    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=6"
    );
    expect(periods.status).toBe(200);
    expect(
      list(periods.data.data?.periods).find((p) => p.startDate === p1)
    ).toMatchObject({ status: "PAID", paidAt });
  });

  test("TC-1361: W3:H7 mark-paid is idempotent — the same paidAt again", async () => {
    const again = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/mark-paid`
    );
    expect(again.status, JSON.stringify(again.data)).toBe(200);
    expect(again.data.data).toMatchObject({ status: "PAID", paidAt });
  });

  test("TC-1362: W3:H7 a paid period is never reopened — 403 PERIOD_PAID, in words", async () => {
    const r = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/reopen`,
      { reason: "Fix Monday again" }
    );
    expect(r.status, JSON.stringify(r.data)).toBe(403);
    expect((r.data as Rec).details).toMatchObject({ code: "PERIOD_PAID" });
    expect(String((r.data as Rec).message)).toBe(
      "This pay period was paid, so it can't be reopened. Correct the shift instead: the difference is paid in the next pay period as a prior-period adjustment."
    );
  });

  test("TC-1363: W3:H7 a correction inside the paid period is allowed and carried to the next period", async () => {
    // Monday's Barista shift back to 09:00–15:00 local: +30 minutes.
    const fix = await payrollRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/shifts/${monBarista}`,
      { clockOutAt: at(addDays(p1, 1), "19:00"), reason: REASON }
    );
    expect(fix.status, JSON.stringify(fix.data)).toBe(200);

    // The paid period's own payday view still says PAID, with paidAt.
    const paidDay = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/pay-periods/${p1}/payday`
    );
    expect(paidDay.status, JSON.stringify(paidDay.data)).toBe(200);
    expect(paidDay.data.data.period).toMatchObject({
      startDate: p1,
      status: "PAID",
      paidAt,
    });

    // The next open period (the current one) carries the difference. The
    // week is already in overtime, so the 30 minutes pay at least $7.50.
    const next = addDays(p1, 7);
    const payday = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/pay-periods/${next}/payday`
    );
    expect(payday.status, JSON.stringify(payday.data)).toBe(200);
    const carried = list(payday.data.data.adjustmentsIn).find(
      (a) => a.staffMemberId === gus.staffMemberId && a.sourceStartDate === p1
    );
    expect(
      carried,
      JSON.stringify(payday.data.data.adjustmentsIn)
    ).toBeTruthy();
    expect(carried).toMatchObject({ name: "Gus Hale", minutes: 30 });
    expect(Number(carried?.cents)).toBeGreaterThanOrEqual(750);
    expect(carried?.reasons).toContain(REASON);
  });

  // ── W3:M1 / H2: labor-law engines (RestauNax back-office audit Stage 5) ──
  // Gated: the change is not on QA yet (utils/releaseGate.ts). Florida:
  // federal overtime (40 h weekly), no state meal or rest-break law, so no
  // premium is earned here; the shapes are asserted, and the amounts stay
  // exactly what TC-580..1363 already proved.
  const PREMIUM_KINDS = [
    "MEAL_BREAK",
    "REST_BREAK",
    "SPREAD_OF_HOURS",
    "SPLIT_SHIFT",
    "REPORTING_TIME",
    "SHORT_REST",
    "SCHEDULE_CHANGE",
  ];
  const VIOLATION_KINDS = [
    "MEAL_MISSED",
    "MEAL_LATE",
    "MEAL_SHORT",
    "REST_MISSED",
    "REST_SHORT",
  ];
  const LABOR_RULE_KEYS = [
    "overtime",
    "mealBreak",
    "restBreak",
    "spreadOfHours",
    "splitShift",
    "reportingTime",
    "predictiveScheduling",
  ];
  const STATUSES = ["CONFIRMED", "DRAFT", "MISSING"];
  const gateLaborEngines = async () =>
    requireRelease(
      "laborEngines",
      await probeLaborEngines(ownerToken, restaurantId)
    );
  /** The p2 13-hour Wednesday (TC-581): a missed meal under TC-584's rule. */
  const missedBreakLine = async () => {
    const line = list((await gusCard(p2)).shifts).find(
      (s) => Array.isArray(s.flags) && s.flags.includes("MISSED_BREAK")
    );
    expect(line, "p2's 13-hour day has no meal break").toBeTruthy();
    return line as Rec;
  };

  test("TC-1430: W3:M1/H2 timecards carry laborRules and the premium fields @labor-engines", async () => {
    await gateLaborEngines();
    const tc = await timecards(p2);
    const rules = tc.laborRules as Rec;
    expect(rules, JSON.stringify(tc)).toBeTruthy();
    expect(rules).toMatchObject({
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      // The federal floor: Florida has no state meal-break rule to raise it.
      minUnpaidBreakMinutes: 20,
      predictive: { covered: false, reason: "NO_RULE", noticeDays: null },
    });
    expect(String(rules.state ?? "")).toMatch(/^(FL|Florida)$/);
    const ot = rules.overtime as Rec;
    expect(["STATE", "FEDERAL", "CALIFORNIA", "CUSTOM"]).toContain(ot.preset);
    expect(["STATE_RULE", "FEDERAL_UNTIL_CONFIRMED", "SAVED"]).toContain(
      ot.applied
    );
    expect(STATUSES).toContain(ot.status);
    expect(typeof ot.needsConfirmation).toBe("boolean");
    expect(Array.isArray(ot.sources)).toBe(true);
    // TC-581 left the saved preset FEDERAL: the saved numbers apply.
    expect(ot).toMatchObject({ preset: "FEDERAL", applied: "SAVED" });
    for (const r of list(rules.rules)) {
      expect(LABOR_RULE_KEYS).toContain(r.ruleKey);
      expect(STATUSES).toContain(r.status);
      expect(["RULE", "OWNER", "NONE"]).toContain(r.decidedBy);
      expect(typeof r.needsConfirmation).toBe("boolean");
      expect(Array.isArray(r.sources)).toBe(true);
    }
    // The saved settings come back as saved, not with the rules filled in.
    expect((tc.settings as Rec).overtime).toMatchObject({ preset: "FEDERAL" });

    const card = await gusCard(p2);
    for (const p of list(card.premiums)) {
      expect(PREMIUM_KINDS).toContain(p.kind);
      expect(p).toMatchObject({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        hours: expect.any(Number),
        rateCents: expect.any(Number),
        cents: expect.any(Number),
        paid: expect.any(Boolean),
      });
    }
    // No state break or premium rule in Florida: nothing earned or owed.
    expect(card.premiumPayCents ?? 0).toBe(0);
    expect(card.premiumOwedCents ?? 0).toBe(0);
    expect((tc.totals as Rec | undefined)?.premiumPayCents ?? 0).toBe(0);
    expect(card.totalCents).toBe(13 * 1800);
    for (const line of list(card.shifts)) {
      for (const v of list(line.breakViolations)) {
        expect(VIOLATION_KINDS).toContain(v.kind);
        expect(typeof v.ordinal).toBe("number");
      }
      if (line.breakDecision !== undefined)
        expect([null, "PAY_PREMIUM", "WAIVED"]).toContain(line.breakDecision);
    }
  });

  test("TC-1431: W3:H2 a missed break is settled by a break decision — Pay premium, or a waiver with what was attested @labor-engines", async () => {
    await gateLaborEngines();
    const line = await missedBreakLine();
    const shiftId = String(line.id);
    expect(line.blockingFlags).toContain("MISSED_BREAK");
    const decide = (token: string, body: Rec) =>
      payrollRaw(
        token,
        restaurantId,
        "POST",
        `/shifts/${shiftId}/break-decision`,
        body
      );

    const invalid = await decide(ownerToken, { decision: "MAYBE" });
    expect(invalid.status, JSON.stringify(invalid.data)).toBe(400);
    expect(String((invalid.data as Rec).message)).toBe(
      "Choose Pay premium or Employee waived."
    );
    const noReason = await decide(ownerToken, { decision: "WAIVED" });
    expect(noReason.status, JSON.stringify(noReason.data)).toBe(400);
    expect(String((noReason.data as Rec).message)).toBe(
      "Enter a reason for this change."
    );
    const blank = await decide(ownerToken, {
      decision: "WAIVED",
      reason: "   ",
    });
    expect(blank.status).toBe(400);
    // Like "Mark reviewed": the employee can't settle it (MODIFY_RESTAURANT).
    // Someone with no control of the restaurant reads as 404 (W5:L2).
    const staff = await decide(gus.token, { decision: "PAY_PREMIUM" });
    expect(staff.status, JSON.stringify(staff.data)).toBe(404);
    // Nothing above changed the shift.
    expect((await missedBreakLine()).blockingFlags).toContain("MISSED_BREAK");

    const paid = await decide(ownerToken, { decision: "PAY_PREMIUM" });
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    expect(paid.data.data).toMatchObject({
      id: shiftId,
      breakDecision: "PAY_PREMIUM",
      breakDecisionReason: null,
    });
    expect(
      Number.isNaN(Date.parse(String(paid.data.data.breakDecisionAt)))
    ).toBe(false);
    expect(String((paid.data as Rec).message)).toBe(
      "The break premium will be paid with this pay period."
    );
    let after = lineOf(await gusCard(p2), shiftId);
    expect(after).toMatchObject({ breakDecision: "PAY_PREMIUM" });
    // The flag stays visible; it no longer blocks approval.
    expect(after.flags).toContain("MISSED_BREAK");
    expect(after.blockingFlags).not.toContain("MISSED_BREAK");

    const attested = "Employee chose to skip the meal and signed the waiver";
    const waived = await decide(ownerToken, {
      decision: "WAIVED",
      reason: attested,
    });
    expect(waived.status, JSON.stringify(waived.data)).toBe(200);
    expect(waived.data.data).toMatchObject({
      breakDecision: "WAIVED",
      breakDecisionReason: attested,
    });
    expect(String((waived.data as Rec).message)).toBe(
      "Recorded: the employee chose to skip the break. No premium is paid."
    );
    after = lineOf(await gusCard(p2), shiftId);
    expect(after.breakDecision).toBe("WAIVED");
    expect(after.blockingFlags).not.toContain("MISSED_BREAK");
    // A waiver pays nothing; Florida pays no break premium either way.
    expect((await gusCard(p2)).premiumPayCents ?? 0).toBe(0);
    // Both decisions are in the shift's history, the waiver with its reason.
    const edits = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/shifts/${shiftId}/edits`
    );
    expect(edits.status).toBe(200);
    expect(list(edits.data.data).map((e) => e.reason)).toEqual(
      expect.arrayContaining([attested])
    );
  });

  test('TC-1432: W3:M1 "Use my state\'s rules" (STATE) is the default overtime preset and is accepted on save @labor-engines', async () => {
    await gateLaborEngines();
    // A restaurant without saved settings (read before beforeAll's save).
    expect(
      unsavedSettings.overtime,
      JSON.stringify(unsavedSettings)
    ).toMatchObject({
      preset: "STATE",
      // Florida's stand-in numbers: federal.
      weeklyThresholdHours: 40,
      dailyThresholdHours: null,
    });
    const location = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/settings"
    );
    expect(location.status).toBe(200);
    expect((location.data.data as Rec).location).toMatchObject({
      recommendedPreset: "FEDERAL",
    });

    // Numbers sent with STATE are ignored: they come from the rules table.
    const state = await settings({
      overtime: { preset: "STATE", dailyThresholdHours: 6 },
    });
    expect(state.overtime).toMatchObject({
      preset: "STATE",
      weeklyThresholdHours: 40,
      dailyThresholdHours: null,
    });
    expect(["MIDNIGHT", "SHIFT_START"]).toContain(state.overtime.workdayStart);
    const ot = (await timecards(p2)).laborRules.overtime as Rec;
    expect(ot.preset).toBe("STATE");
    expect(["STATE_RULE", "FEDERAL_UNTIL_CONFIRMED"]).toContain(ot.applied);
    // Federal or Florida, the 13-hour day is straight time.
    expect((await gusCard(p2)).totalCents).toBe(13 * 1800);

    // Editing a number is CUSTOM, as before.
    const custom = await settings({
      overtime: {
        preset: "CUSTOM",
        weeklyThresholdHours: 40,
        dailyThresholdHours: null,
        dailyDoubleTimeHours: null,
        seventhConsecutiveDay: false,
        overtimeMultiplier: 1.5,
        doubleTimeMultiplier: 2,
      },
    });
    expect(custom.overtime.preset).toBe("CUSTOM");
    const back = await settings({ overtime: { preset: "STATE" } });
    expect(back.overtime.preset).toBe("STATE");
  });

  test("TC-1433: W3:M1 GET /api/compliance/:id/labor-rules — every labor rule in words, with status and source @labor-engines", async () => {
    await gateLaborEngines();
    const r = await laborRulesRaw(ownerToken, restaurantId);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const view = r.data.data as Rec;
    expect(view).toMatchObject({
      minUnpaidBreakMinutes: 20,
      predictive: { covered: false, reason: "NO_RULE" },
      overtime: { preset: "STATE" },
    });
    const rules = list(view.rules);
    expect(rules.map((x) => x.ruleKey).sort()).toEqual(
      [...LABOR_RULE_KEYS].sort()
    );
    for (const rule of rules) {
      expect(STATUSES).toContain(rule.status);
      expect(looksLikeKey(rule.label), String(rule.label)).toBe(false);
      expect(looksLikeKey(rule.summary), String(rule.summary)).toBe(false);
      expect(looksLikeKey(rule.statusLabel), String(rule.statusLabel)).toBe(
        false
      );
      expect(typeof rule.needsConfirmation).toBe("boolean");
      if (rule.needsConfirmation) expect(rule.status).toBe("DRAFT");
      for (const src of list(rule.sources)) {
        expect(typeof src.sourceUrl).toBe("string");
        expect(looksLikeKey(src.jurisdictionLabel)).toBe(false);
      }
    }
    // Florida's overtime row exists (weekly 40) and names its source.
    const ot = rules.find((x) => x.ruleKey === "overtime") as Rec;
    expect(ot.status).not.toBe("MISSING");
    expect(list(ot.sources).length).toBeGreaterThan(0);
    // The restaurant's own staff member can't read the owner's rules.
    const staff = await laborRulesRaw(gus.token, restaurantId);
    expect(staff.status).toBe(403);
  });

  test("TC-1434: W3:M1 the owner confirms the state's overtime rule; a made-up rule is refused @labor-engines", async () => {
    await gateLaborEngines();
    const bogus = await confirmLaborRuleRaw(ownerToken, restaurantId, "bogus");
    expect(bogus.status, JSON.stringify(bogus.data)).toBe(400);
    expect(String(bogus.data.message)).toBe(
      "That isn't a labor rule we can confirm, or its value isn't valid."
    );
    // minimumWage is a compliance rule, but not one this endpoint confirms.
    const notLabor = await confirmLaborRuleRaw(
      ownerToken,
      restaurantId,
      "minimumWage"
    );
    expect(notLabor.status).toBe(400);
    const staff = await confirmLaborRuleRaw(
      gus.token,
      restaurantId,
      "overtime"
    );
    expect(staff.status, JSON.stringify(staff.data)).toBe(403);

    const ok = await confirmLaborRuleRaw(ownerToken, restaurantId, "overtime");
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    expect(ok.data.data).toMatchObject({ ruleKey: "overtime" });
    expect(String(ok.data.message)).toMatch(
      /: confirmed\. Pay follows this rule from now on\.$/
    );
    expect(looksLikeKey(ok.data.message)).toBe(false);

    const after = await laborRulesRaw(ownerToken, restaurantId);
    const ot = list((after.data.data as Rec).rules).find(
      (x) => x.ruleKey === "overtime"
    ) as Rec;
    expect(ot).toMatchObject({ status: "CONFIRMED", needsConfirmation: false });
    // Under STATE (TC-1432) a confirmed state rule is what pay uses.
    const applied = (await timecards(p2)).laborRules.overtime as Rec;
    expect(applied).toMatchObject({
      preset: "STATE",
      applied: "STATE_RULE",
      status: "CONFIRMED",
      needsConfirmation: false,
    });
    expect((await gusCard(p2)).totalCents).toBe(13 * 1800);
  });
});
