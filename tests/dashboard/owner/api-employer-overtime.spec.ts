/**
 * api-employer-overtime.spec.ts — combined overtime across an employer
 * group on QA (TC-1410..1412). RestauNax back-office audit 2026-10, Stage 5,
 * W3:C4 (docs/features/back-office/EMPLOYER_GROUP.md).
 *
 * The FLSA counts one workweek per EMPLOYER: a person who works at two of
 * the employer's restaurants gets overtime over the combined hours, credited
 * to the restaurant where the LATER hours were worked. The same numbers as
 * the backend int test (src/Service/employer/__tests__/employerGroup.int.test.ts):
 * 25 h at A (Mon 10 h, Tue 10 h, Wed 5 h) then 25 h at B (Thu 10 h,
 * Fri 10 h, Sat 5 h) at $30.00/h = A: 25 h regular, 0 overtime; B: 15 h
 * regular, 10 h overtime, $150.00 premium (10 h × 0.5 × $30.00).
 *
 * No browser. Per run: a fresh owner controlling two throwaway Miami
 * restaurants (Florida: weekly overtime only, no daily rule) with PAYROLL
 * granted (→ TIMECARDS). The worker is the owner's own POS membership at
 * each restaurant ("Clocks in" on), linked as one person. Hours are
 * manager-entered into the most recent FINISHED weekly period (the past).
 * Unlinked, the same hours are two separate 25 h weeks: no overtime.
 * Serial. Fails (does not skip) without admin credentials.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { addDays } from "../../../utils/backOfficeApi";
import {
  apiLogin,
  createStaffJobRaw,
  deleteTestRestaurant,
  payrollRaw,
  setMemberJobsRaw,
  setOwnerPosPin,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  employerRaw,
  lastFinishedPeriod,
  ownerWithRestaurants,
} from "../../../utils/employerApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const RATE_CENTS = 3000;
const REASON = "Entered from the paper sheet";

test.describe.configure({ mode: "serial" });

test.describe("Employer group — combined overtime (API)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let A = "";
  let B = "";
  let meA = "";
  let meB = "";
  let employerId = "";
  /** The finished Sunday-start week the hours go into. */
  let week = { startDate: "", endDate: "" };
  const created: string[] = [];

  const card = async (rid: string, staffMemberId: string) => {
    const r = await payrollRaw(
      ownerToken,
      rid,
      "GET",
      `/timecards?startDate=${week.startDate}&endDate=${week.endDate}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const c = list((r.data.data as Rec).employees).find(
      (e) => e.staffMemberId === staffMemberId
    );
    expect(c, `no timecard for ${staffMemberId} at ${rid}`).toBeTruthy();
    return c as Rec;
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    // Fail, never skip, without the environment (W5:T7).
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
      throw new Error(
        "[api-employer-overtime] ADMIN_EMAIL / ADMIN_PASSWORD not set: the two restaurants are minted by HQ"
      );
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const t = await ownerWithRestaurants(adminToken, runId, { count: 2 });
    ownerToken = t.ownerToken;
    [A, B] = t.restaurantIds as [string, string];
    created.push(A, B);

    // One group, one Sunday-start weekly calendar for both.
    const e = await employerRaw(ownerToken, "POST", "", {
      legalName: `Automation Overtime LLC ${runId}`,
      workweekStartDay: 0,
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      restaurantIds: [A, B],
    });
    if (e.status !== 201)
      throw new Error(
        `[api-employer-overtime] precondition: the employer group could not be created (${e.status} ${JSON.stringify(e.data)}) — is RestauNax Stage 5 (bo1031/employer) on this environment?`
      );
    employerId = String(e.data.data.id);

    // The worker: the owner's own POS record at each restaurant, $30.00/h.
    const jobs: string[] = [];
    for (const rid of [A, B]) {
      const me = await setOwnerPosPin(ownerToken, rid, "8462", {
        clocksIn: true,
      });
      const job = await createStaffJobRaw(ownerToken, rid, {
        name: `Line cook ${runId}`,
        defaultHourlyRateCents: RATE_CENTS,
      });
      const jobId = String(job.data.data?.id ?? "");
      if (!jobId)
        throw new Error(
          `[api-employer-overtime] job: ${JSON.stringify(job.data)}`
        );
      await setMemberJobsRaw(ownerToken, rid, me, [{ jobId, isPrimary: true }]);
      jobs.push(jobId);
      if (rid === A) meA = me;
      else meB = me;
    }
    const linked = await employerRaw(
      ownerToken,
      "POST",
      `/${employerId}/people`,
      { staffMemberIds: [meA, meB] }
    );
    if (linked.status !== 200)
      throw new Error(
        `[api-employer-overtime] link: ${JSON.stringify(linked.data)}`
      );

    week = await lastFinishedPeriod(ownerToken, A);
    const [jobA = "", jobB = ""] = jobs;
    const enter = async (
      rid: string,
      staffMemberId: string,
      jobId: string,
      dayOffset: number,
      hours: number
    ) => {
      const day = addDays(week.startDate, dayOffset);
      const out = 13 + hours;
      const r = await payrollRaw(ownerToken, rid, "POST", "/shifts", {
        staffMemberId,
        clockInAt: `${day}T13:00:00.000Z`,
        clockOutAt: `${day}T${String(out).padStart(2, "0")}:00:00.000Z`,
        jobId,
        reason: REASON,
      });
      if (r.status !== 201)
        throw new Error(
          `[api-employer-overtime] shift at ${rid} on ${day}: ${JSON.stringify(r.data)}`
        );
    };
    // Mon–Wed at A (25 h), then Thu–Sat at B (25 h). 13:00Z = morning in Miami.
    await enter(A, meA, jobA, 1, 10);
    await enter(A, meA, jobA, 2, 10);
    await enter(A, meA, jobA, 3, 5);
    await enter(B, meB, jobB, 4, 10);
    await enter(B, meB, jobB, 5, 10);
    await enter(B, meB, jobB, 6, 5);
  });

  test.afterAll(async () => {
    if (ownerToken && employerId)
      await employerRaw(ownerToken, "DELETE", `/${employerId}`).catch(() => {});
    if (adminToken)
      for (const rid of created)
        await deleteTestRestaurant(adminToken, rid).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Employer group");
    await allure.label("severity", "critical");
  });

  test("TC-1410: 25 h at A + 25 h at B = 10 h overtime, all on B's timecard", async () => {
    await allure.description(
      "Linked person, one workweek: A (worked first) shows 25 h regular, 0 overtime and only its own three " +
        "shifts; B shows 15 h regular, 10 h overtime and a $150.00 premium (10 h × 0.5 × $30.00)."
    );
    const a = await card(A, meA);
    expect(a).toMatchObject({ regularMinutes: 25 * 60, overtimeMinutes: 0 });
    expect(list(a.shifts)).toHaveLength(3);
    const b = await card(B, meB);
    expect(b).toMatchObject({
      regularMinutes: 15 * 60,
      overtimeMinutes: 10 * 60,
      overtimePremiumCents: Math.round(0.5 * RATE_CENTS * 10),
    });
    expect(list(b.shifts)).toHaveLength(3);
  });

  test("TC-1411: unlinked, the same hours are two separate weeks — no overtime anywhere", async () => {
    await allure.description(
      "Only linked people's hours combine. After DELETE /people/staff/:A-record the person is gone and each " +
        "restaurant sees 25 h regular, 0 overtime. Linking again brings B's 10 h of overtime back."
    );
    const un = await employerRaw(
      ownerToken,
      "DELETE",
      `/${employerId}/people/staff/${meA}`
    );
    expect(un.status, JSON.stringify(un.data)).toBe(200);
    for (const [rid, me] of [
      [A, meA],
      [B, meB],
    ] as const) {
      const c = await card(rid, me);
      expect(
        { rid, regular: c.regularMinutes, overtime: c.overtimeMinutes },
        JSON.stringify(c)
      ).toEqual({ rid, regular: 25 * 60, overtime: 0 });
    }
    const re = await employerRaw(ownerToken, "POST", `/${employerId}/people`, {
      staffMemberIds: [meA, meB],
    });
    expect(re.status, JSON.stringify(re.data)).toBe(200);
    expect((await card(B, meB)).overtimeMinutes).toBe(10 * 60);
  });

  test("TC-1412: deleting the employer makes both restaurants independent again", async () => {
    await allure.description(
      "No payroll company or policy attached → DELETE /api/employers/:id 200; both restaurants' /employer is " +
        "null, the group is 404, and B's overtime is gone (two separate 25 h weeks)."
    );
    const del = await employerRaw(ownerToken, "DELETE", `/${employerId}`);
    expect(del.status, JSON.stringify(del.data)).toBe(200);
    const gone = await employerRaw(ownerToken, "GET", `/${employerId}`);
    expect(gone.status).toBe(404);
    employerId = "";
    for (const rid of [A, B]) {
      const r = await payrollRaw(ownerToken, rid, "GET", "/employer");
      expect({ rid, status: r.status, data: r.data.data }).toEqual({
        rid,
        status: 200,
        data: null,
      });
    }
    const b = await card(B, meB);
    expect(b).toMatchObject({ regularMinutes: 25 * 60, overtimeMinutes: 0 });
  });
});
