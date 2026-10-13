/**
 * api-clocks-in.spec.ts — "Clocks in" off for a person (salaried / family
 * staff, packaging v2) on QA (TC-642..646).
 *
 * No browser. A per-run throwaway restaurant with SCHEDULING + TIP_MANAGEMENT,
 * weekly pay periods, a REGISTER device and two people with one job:
 *   Wes — "Clocks in" OFF (a real account, so the staff app check is real);
 *   Xan — tracked as usual.
 * Wes may still clock in (who's on the clock works), but the clock-in rule
 * never stops him, he gets no attendance flags, and his hours stay out of
 * labor cost, timecards, approval and the export — while tips still count
 * them. Restaurant in Miami. Serial. Needs Mailpit (Wes claims his invite).
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
  putPayrollSettingsRaw,
  payrollRaw,
  tipsRaw,
  staffAppRaw,
  ownerStaffRaw,
  tabletRaw,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
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

test.describe.configure({ mode: "serial" });

test.describe('"Clocks in" off for a person (API)', () => {
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
  let jobId = "";
  const wes = { id: "", pin: "3816", token: "", email: "" };
  const xan = { id: "", pin: "5207" };
  let p1 = "";

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-clocks-in] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    for (const f of ["SCHEDULING", "TIP_MANAGEMENT"]) {
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        f,
        true
      );
      if (!g.ok)
        throw new Error(
          `[api-clocks-in] grant ${f}: ${JSON.stringify(g.data)}`
        );
    }
    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      workweekStartDay: 0,
    });

    wes.email = `auto-clocks-wes-${runId}@${DOMAIN}`;
    recordUserForCleanup(wes.email);
    wes.id = String(
      (
        await inviteStaffRaw(ownerToken, restaurantId, {
          email: wes.email,
          firstName: "Wes",
          lastName: "Salary",
        })
      ).data.data?.staffMemberId
    );
    const mail = await waitForEmail(wes.email, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    wes.token = (
      await registerWithInvite({
        firstName: "Wes",
        lastName: "Salary",
        email: wes.email,
        password: `Automation!Staff-${runId}`,
        userInvitationToken: extractInviteToken(
          mail.text_body || mail.html_body
        ),
      })
    ).accessToken;
    await ownerStaffRaw(ownerToken, restaurantId, "POST", `/${wes.id}/pin`, {
      pin: wes.pin,
    });

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-clocks-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
    const owner = await setOwnerPosPin(ownerToken, restaurantId, "8462");
    const session = await tabletStaffSignIn(tabletToken, owner, "8462");
    const created = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/staff/manage",
      { firstName: "Xan", lastName: "Hourly", pin: xan.pin },
      session
    );
    xan.id = String(created.data.data?.id);

    jobId = String(
      (
        await createStaffJobRaw(ownerToken, restaurantId, {
          name: `Manager on duty ${runId}`,
          defaultHourlyRateCents: 2000,
          isTipped: true,
        })
      ).data.data?.id
    );
    for (const id of [wes.id, xan.id])
      await setMemberJobsRaw(ownerToken, restaurantId, id, [
        { jobId, isPrimary: true },
      ]);

    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=4"
    );
    p1 =
      list(periods.data.data?.periods)
        .filter((p) => p.status === "OPEN")
        .map((p) => String(p.startDate))
        .sort()
        .reverse()[0] ?? "";
    if (!p1) throw new Error("[api-clocks-in] no finished pay period");
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Clocks in");
    await allure.label("severity", "critical");
  });

  test('TC-642: the owner turns "Clocks in" off; a non-boolean is refused; the staff app knows', async () => {
    const bad = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/${wes.id}`,
      {
        tracksTime: "no",
      }
    );
    expect(bad.status).toBe(400);
    const off = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/${wes.id}`,
      {
        tracksTime: false,
      }
    );
    expect(off.status, JSON.stringify(off.data)).toBe(200);
    const staff = await ownerStaffRaw(ownerToken, restaurantId, "GET");
    const by = new Map(list(staff.data.data).map((s) => [s.id, s]));
    expect(by.get(wes.id)?.tracksTime).toBe(false);
    expect(by.get(xan.id)?.tracksTime).toBe(true);

    const me = await staffAppRaw<{ data: Rec }>(wes.token, "GET", "/me");
    expect(list(me.data.data.restaurants)[0]).toMatchObject({
      restaurantId,
      tracksTime: false,
    });
    // Still on the time clock (so he can show as on the clock).
    const clock = await tabletRaw<Rec>(tabletToken, "GET", "/staff/time-clock");
    expect(list(clock.data.data).some((s) => s.id === wes.id)).toBe(true);
  });

  test("TC-643: the clock-in rule never stops him; it still stops a tracked person", async () => {
    const rule = await putPayrollSettingsRaw(ownerToken, restaurantId, {
      scheduling: { clockInRule: "BLOCK" },
    });
    expect(rule.status).toBe(200);
    const clockIn = (p: { id: string; pin: string }) =>
      tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
        staffMemberId: p.id,
        pin: p.pin,
        supportsClockInRules: true,
      });
    const x = await clockIn(xan);
    expect(x.status, "unscheduled, tracked").toBe(409);
    const w = await clockIn(wes);
    expect(w.status, JSON.stringify(w.data)).toBe(200);
    expect(w.data.data.shift.clockInException ?? null).toBeNull();
    const out = await tabletRaw(tabletToken, "POST", "/staff/clock-out", {
      staffMemberId: wes.id,
      pin: wes.pin,
    });
    expect(out.status).toBe(200);
    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      scheduling: { clockInRule: "OFF" },
    });
  });

  test("TC-644: on the schedule he costs nothing and carries no attendance", async () => {
    const date = addDays(p1, 2); // a finished day: a missed shift is a no-show
    const make = async (id: string) => {
      const r = await createShiftRaw(ownerToken, restaurantId, {
        staffMemberId: id,
        jobId,
        startAt: at(date, "14:00"),
        endAt: at(date, "18:00"),
      });
      expect(r.status, JSON.stringify(r.data)).toBe(201);
      return String(r.data.data?.shift.id);
    };
    const wShift = await make(wes.id);
    const xShift = await make(xan.id);
    const pub = await publishScheduleRaw(
      ownerToken,
      restaurantId,
      date,
      "NONE"
    );
    expect(pub.status, JSON.stringify(pub.data)).toBe(200);
    const week = (await getScheduleWeekRaw(ownerToken, restaurantId, date)).data
      .data as Rec;
    const shift = (id: string) => list(week.shifts).find((s) => s.id === id);
    expect(shift(wShift)?.attendance ?? null).toBeNull();
    expect(shift(xShift)?.attendance?.status).toBe("NO_SHOW");
    const staff = new Map(list(week.staff).map((s) => [s.id, s]));
    expect(staff.get(wes.id)?.wageCents ?? 0).toBe(0);
    expect(staff.get(xan.id)?.wageCents).toBe(4 * 2000);
    expect(week.cost.totals.wageCents).toBe(4 * 2000);
  });

  test("TC-645: his hours stay out of timecards, labor and the export; tips still count them", async () => {
    const day = addDays(p1, 3);
    for (const id of [wes.id, xan.id]) {
      const r = await payrollRaw(ownerToken, restaurantId, "POST", "/shifts", {
        staffMemberId: id,
        clockInAt: at(day, "13:00"),
        clockOutAt: at(day, "17:00"),
        jobId,
        reason: "Paper sheet",
      });
      expect(r.status, JSON.stringify(r.data)).toBe(201);
    }
    const declared = await tipsRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/declarations",
      {
        staffMemberId: wes.id,
        businessDate: day,
        amountCents: 500,
      }
    );
    expect(declared.status).toBe(201);

    const end = addDays(p1, 6);
    const cards = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/timecards?startDate=${p1}&endDate=${end}`
    );
    const ids = list(cards.data.data.employees).map((e) => e.staffMemberId);
    expect(ids).toContain(xan.id);
    expect(ids).not.toContain(wes.id);
    expect(cards.data.data.totals.totalCents).toBe(4 * 2000);

    const labor = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/labor?startDate=${p1}&endDate=${end}&groupBy=employee`
    );
    expect(labor.data.data.totals.wageCents).toBe(4 * 2000);

    // Tips count everyone's hours.
    const tips = await tipsRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/report?startDate=${p1}&endDate=${end}`
    );
    const wTips = list(tips.data.data.people).find(
      (p) => p.staffMemberId === wes.id
    );
    expect(wTips).toMatchObject({ declaredCashCents: 500, minutes: 240 });

    const ok = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`
    );
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    const file = await payrollRaw<string>(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/export`,
      { format: "GUSTO" }
    );
    expect(file.status, JSON.stringify(file.data)).toBe(200);
    const rows = String(file.data).split(/\r?\n/).filter(Boolean);
    expect(rows.find((r) => r.startsWith("Hourly,Xan,"))).toContain(",4.00,");
    // Wes appears only for his declared cash, with no hours.
    const w = rows.find((r) => r.startsWith("Salary,Wes,"));
    if (w) expect(w).toMatch(/,0\.00,0\.00,0\.00,0\.00,5\.00$/);
  });

  test("TC-646: turning it back on counts his hours again", async () => {
    const on = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/${wes.id}`,
      {
        tracksTime: true,
      }
    );
    expect(on.status).toBe(200);
    const end = addDays(p1, 6);
    const cards = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/timecards?startDate=${p1}&endDate=${end}`
    );
    expect(
      list(cards.data.data.employees).map((e) => e.staffMemberId)
    ).toContain(wes.id);
  });
});
