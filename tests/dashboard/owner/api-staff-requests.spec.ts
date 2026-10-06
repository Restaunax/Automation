/**
 * api-staff-requests.spec.ts — Restaunax Staff requests end to end (TC-543..552).
 *
 * No browser. A per-run throwaway restaurant with SCHEDULING + TIMECARDS, two
 * staff members who claim their invites from Mailpit into REAL RestauNax
 * accounts (the staff app's identity), a job they both hold and published
 * shifts. Then the T1b/T1c flows across both sides of the API:
 *   - the person (/api/staff-app, their own token): schedule, time off,
 *     availability, release / pick up a shift;
 *   - the owner (/api/staff/scheduling/:id/requests): the inbox, decisions,
 *     and the schedule week that reflects them.
 * Plus the walls: a staff token can't open the owner inbox, a coworker can't
 * withdraw someone else's request, and a restaurant you don't work at is 404.
 *
 * Serial: each step builds on the last (one tenant per run, deleted after).
 * Skips without ADMIN creds or Mailpit (the invite token only travels by email).
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
  createShiftRaw,
  publishScheduleRaw,
  getScheduleWeekRaw,
  getRequestsRaw,
  decideRequestRaw,
  staffAppRaw,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

/** "YYYY-MM-DD" n days from today (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
/** 18:00–22:00 UTC on a date: the same local day in every US timezone. */
const evening = (date: string) => ({
  startAt: `${date}T18:00:00.000Z`,
  endAt: `${date}T22:00:00.000Z`,
});

type Rec = Record<string, unknown>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);

test.describe.configure({ mode: "serial" });

test.describe("Restaunax Staff — requests and shift changes (API)", () => {
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
  let ownerEmail = "";
  let restaurantId = "";
  let jobId = "";
  const ana = {
    email: "",
    token: "",
    staffMemberId: "",
    shiftOff: "",
    shiftGive: "",
  };
  const bo = { email: "", token: "", staffMemberId: "" };
  const OFF_DATE = day(10);
  // Never a Sunday: TC-549 makes Bo unavailable on Sundays, and he must be
  // able to take this shift in TC-550.
  const GIVE_DATE = [12, 13]
    .map(day)
    .find((d) => new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) as string;
  let timeOffId = "";

  /** Invite → email → claim: a staff member with a real account. */
  const hire = async (
    who: { email: string; token: string; staffMemberId: string },
    first: string,
    last: string
  ) => {
    who.email = `auto-staff-${first.toLowerCase()}-${runId}@${DOMAIN}`;
    recordUserForCleanup(who.email);
    const invited = await inviteStaffRaw(ownerToken, restaurantId, {
      email: who.email,
      firstName: first,
      lastName: last,
    });
    expect(invited.status, JSON.stringify(invited.data)).toBe(201);
    who.staffMemberId = String(invited.data.data?.staffMemberId ?? "");
    const mail = await waitForEmail(who.email, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    const token = extractInviteToken(mail.text_body || mail.html_body);
    const claimed = await registerWithInvite({
      firstName: first,
      lastName: last,
      email: who.email,
      password: `Automation!Staff-${runId}`,
      userInvitationToken: token,
    });
    who.token = claimed.accessToken;
  };

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-staff-requests] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    ownerEmail = tenant.email;
    // SCHEDULING is a sellable package that implies TIMECARDS (jobs, wages).
    // TIMECARDS itself is a component and can't be granted on its own.
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SCHEDULING",
      true
    );
    if (!g.ok) {
      throw new Error(
        `[api-staff-requests] could not grant SCHEDULING: ${JSON.stringify(g.data)}`
      );
    }
    await hire(ana, "Ana", "Ruiz");
    await hire(bo, "Bo", "Lee");
    const job = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Server ${runId}`,
      defaultHourlyRateCents: 1500,
      isTipped: true,
    });
    jobId = String(job.data.data?.id ?? "");
    for (const p of [ana, bo]) {
      const set = await setMemberJobsRaw(
        ownerToken,
        restaurantId,
        p.staffMemberId,
        [{ jobId, isPrimary: true }]
      );
      if (!set.ok)
        throw new Error("[api-staff-requests] could not assign the job");
    }
    // Ana works OFF_DATE (time off will land on it) and GIVE_DATE (she'll
    // release it); Bo overlaps her on OFF_DATE so coworkers show.
    const shift = async (staffMemberId: string, date: string) => {
      const r = await createShiftRaw(ownerToken, restaurantId, {
        staffMemberId,
        jobId,
        ...evening(date),
      });
      if (r.status !== 201)
        throw new Error(
          `[api-staff-requests] shift: ${JSON.stringify(r.data)}`
        );
      return String(r.data.data?.shift.id ?? "");
    };
    ana.shiftOff = await shift(ana.staffMemberId, OFF_DATE);
    await shift(bo.staffMemberId, OFF_DATE);
    ana.shiftGive = await shift(ana.staffMemberId, GIVE_DATE);
    for (const d of new Set([OFF_DATE, GIVE_DATE])) {
      const p = await publishScheduleRaw(ownerToken, restaurantId, d, "NONE");
      if (!p.ok)
        throw new Error(
          `[api-staff-requests] publish: ${JSON.stringify(p.data)}`
        );
    }
  });

  test.afterAll(async () => {
    // Best-effort: the restaurant (and everything under it) goes; the staff
    // accounts are swept by globalTeardown (recordUserForCleanup above).
    if (adminToken && restaurantId) {
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Restaunax Staff");
    await allure.label("severity", "critical");
  });

  test("TC-543: a claimed invite is a staff account that sees its restaurant", async () => {
    const me = await staffAppRaw<{ data: Rec }>(ana.token, "GET", "/me");
    expect(me.status).toBe(200);
    const restaurants = list(me.data.data.restaurants);
    expect(restaurants).toHaveLength(1);
    expect(restaurants[0]).toMatchObject({
      restaurantId,
      staffMemberId: ana.staffMemberId,
      requests: true,
    });
  });

  test("TC-544: my schedule shows published shifts; coworkers as first name + initial, no wages", async () => {
    const from = `${OFF_DATE}T00:00:00.000Z`;
    const to = `${day(14)}T00:00:00.000Z`;
    const res = await staffAppRaw<{ data: Rec[] }>(
      ana.token,
      "GET",
      `/schedule?from=${from}&to=${to}`
    );
    expect(res.status).toBe(200);
    const off = res.data.data.find((s) => s.id === ana.shiftOff);
    expect(off).toBeTruthy();
    const coworkers = list(off?.coworkers);
    expect(coworkers.map((c) => c.name)).toEqual(["Bo L."]);
    // Only name, job and times leave the server about a coworker.
    expect(Object.keys(coworkers[0] ?? {}).sort()).toEqual(
      ["endAt", "jobName", "name", "startAt"].sort()
    );
  });

  test("TC-545: a staff token can't open the owner's inbox", async () => {
    const res = await getRequestsRaw(ana.token, restaurantId);
    expect([401, 403]).toContain(res.status);
  });

  test("TC-546: time off — the past is refused; a request lists the shift it lands on", async () => {
    const past = await staffAppRaw(
      ana.token,
      "POST",
      `/restaurants/${restaurantId}/time-off`,
      {
        startDate: day(-3),
        endDate: day(-2),
        type: "UNPAID",
      }
    );
    expect(past.status).toBe(400);

    const asked = await staffAppRaw<{ data: Rec }>(
      ana.token,
      "POST",
      `/restaurants/${restaurantId}/time-off`,
      {
        startDate: OFF_DATE,
        endDate: OFF_DATE,
        type: "UNPAID",
        note: `wedding ${runId}`,
      }
    );
    expect(asked.status, JSON.stringify(asked.data)).toBe(201);
    expect(asked.data.data.status).toBe("PENDING");
    timeOffId = String(asked.data.data.id);

    const inbox = await getRequestsRaw(ownerToken, restaurantId);
    const row = list(inbox.data.data?.timeOff).find((t) => t.id === timeOffId);
    expect(row).toMatchObject({
      staffMemberId: ana.staffMemberId,
      status: "PENDING",
    });
    expect(list(row?.conflicts).map((c) => c.shiftId)).toEqual([ana.shiftOff]);
  });

  test("TC-547: a coworker can't withdraw someone else's request", async () => {
    const res = await staffAppRaw(
      bo.token,
      "DELETE",
      `/restaurants/${restaurantId}/time-off/${timeOffId}`
    );
    expect(res.status).toBe(404);
  });

  test("TC-548: approving time off keeps the shift and warns on the schedule", async () => {
    const decided = await decideRequestRaw(
      ownerToken,
      restaurantId,
      "time-off",
      timeOffId,
      true,
      "Enjoy"
    );
    expect(decided.status, JSON.stringify(decided.data)).toBe(200);

    const week = await getScheduleWeekRaw(ownerToken, restaurantId, OFF_DATE);
    const data = week.data.data ?? {};
    expect(list(data.shifts).some((s) => s.id === ana.shiftOff)).toBe(true);
    expect(list(data.timeOff).find((t) => t.id === timeOffId)?.status).toBe(
      "APPROVED"
    );
    expect(
      list(data.warnings).some(
        (w) => w.code === "TIME_OFF" && w.shiftId === ana.shiftOff
      )
    ).toBe(true);

    const mine = await staffAppRaw<{ data: { requests: Rec[] } }>(
      ana.token,
      "GET",
      `/restaurants/${restaurantId}/time-off`
    );
    expect(
      mine.data.data.requests.find((r) => r.id === timeOffId)
    ).toMatchObject({
      status: "APPROVED",
      decisionNote: "Enjoy",
    });
  });

  test("TC-549: availability waits for the manager, then shows on the week", async () => {
    const weekly = Array.from({ length: 7 }, () => ({
      allDayUnavailable: false,
      unavailable: [] as { start: string; end: string }[],
      preferred: [] as { start: string; end: string }[],
    }));
    weekly[0]!.allDayUnavailable = true; // Sundays off
    const sent = await staffAppRaw<{ data: Rec }>(
      bo.token,
      "PUT",
      `/restaurants/${restaurantId}/availability`,
      { weekly, effectiveFrom: day(0) }
    );
    expect(sent.status, JSON.stringify(sent.data)).toBe(200);
    expect(sent.data.data.status).toBe("PENDING");

    const inbox = await getRequestsRaw(ownerToken, restaurantId);
    const row = list(inbox.data.data?.availability).find(
      (a) => a.id === sent.data.data.id
    );
    expect(row?.staffMemberId).toBe(bo.staffMemberId);

    const ok = await decideRequestRaw(
      ownerToken,
      restaurantId,
      "availability",
      String(sent.data.data.id),
      true
    );
    expect(ok.status).toBe(200);

    // The next Sunday on or after today carries the all-day block.
    let sunday = day(0);
    for (
      let i = 0;
      i < 7 && new Date(`${sunday}T12:00:00Z`).getUTCDay() !== 0;
      i++
    ) {
      sunday = day(i + 1);
    }
    const week = await getScheduleWeekRaw(ownerToken, restaurantId, sunday);
    const block = list(week.data.data?.availability).find(
      (a) => a.staffMemberId === bo.staffMemberId && a.date === sunday
    );
    expect(block?.allDayUnavailable).toBe(true);
  });

  test("TC-550: release → a coworker picks it up → the manager approves → it's theirs", async () => {
    const released = await staffAppRaw<{ data: Rec }>(
      ana.token,
      "POST",
      `/restaurants/${restaurantId}/shifts/${ana.shiftGive}/release`,
      { note: "exam" }
    );
    expect(released.status, JSON.stringify(released.data)).toBe(201);
    expect(released.data.data.status).toBe("OPEN");

    const forBo = await staffAppRaw<{ data: { upForGrabs: Rec[] } }>(
      bo.token,
      "GET",
      `/restaurants/${restaurantId}/shift-changes`
    );
    expect(
      forBo.data.data.upForGrabs.some(
        (g) => (g.shift as Rec).id === ana.shiftGive
      )
    ).toBe(true);

    const taken = await staffAppRaw<{ data: Rec }>(
      bo.token,
      "POST",
      `/restaurants/${restaurantId}/shifts/${ana.shiftGive}/pick-up`
    );
    expect(taken.status, JSON.stringify(taken.data)).toBe(200);
    expect(taken.data.data.status).toBe("PENDING");

    // A second release of the same shift is refused while one is in play.
    const again = await staffAppRaw(
      ana.token,
      "POST",
      `/restaurants/${restaurantId}/shifts/${ana.shiftGive}/release`
    );
    expect(again.status).toBe(400);

    const inbox = await getRequestsRaw(ownerToken, restaurantId);
    const change = list(inbox.data.data?.shiftChanges).find(
      (c) => c.id === released.data.data.id
    );
    expect(change).toMatchObject({ stillEligible: true });
    expect((change?.to as Rec)?.staffMemberId).toBe(bo.staffMemberId);

    const ok = await decideRequestRaw(
      ownerToken,
      restaurantId,
      "shift-change",
      String(released.data.data.id),
      true
    );
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);

    const week = await getScheduleWeekRaw(ownerToken, restaurantId, GIVE_DATE);
    const moved = list(week.data.data?.shifts).find(
      (s) => s.id === ana.shiftGive
    );
    expect(moved?.staffMemberId).toBe(bo.staffMemberId);
    expect((moved?.published as Rec)?.staffMemberId).toBe(bo.staffMemberId);
  });

  test("TC-551: a restaurant you don't work at is 404; pay stubs only with RestauNax Payroll", async () => {
    const other = await staffAppRaw(
      ana.token,
      "GET",
      `/restaurants/00000000-0000-4000-8000-000000000000/time-off`
    );
    expect(other.status).toBe(404);

    const stubs = await staffAppRaw<{ data: Rec }>(
      ana.token,
      "GET",
      `/restaurants/${restaurantId}/pay-stubs`
    );
    expect(stubs.status).toBe(200);
    expect(stubs.data.data).toMatchObject({ available: false, stubs: [] });
  });

  test("TC-552: the owner is emailed when a time-off request needs a decision @email", async () => {
    const mail = await waitForEmail(ownerEmail, {
      subjectPattern: /Ana Ruiz asked for time off/i,
      timeoutMs: 90_000,
    });
    const body = mail.text_body || mail.html_body;
    expect(body).toContain(`wedding ${runId}`);
    expect(body).toMatch(/staffTab=requests/);
  });
});
