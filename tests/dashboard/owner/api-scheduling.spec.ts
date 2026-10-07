/**
 * api-scheduling.spec.ts — scheduling (L1) end to end on QA (TC-570..579).
 *
 * No browser. A per-run throwaway restaurant with SCHEDULING, two staff with
 * real accounts (invite → Mailpit → register), a job, a REGISTER device.
 *   - build a week: personal vs default rate, unpaid break, open shift → the
 *     costed week (exact cents); projected overtime (FEDERAL, 48h → 8h at 1.5×);
 *   - warnings: overlap, job not held, short rest (and minRestHours = 0 turns
 *     it off), can't-notify (email channel off);
 *   - publish: only published shifts reach the staff app, one email each;
 *     editing after publish keeps the published copy until republished;
 *   - copy a week as open shifts;
 *   - clock-in rule on the POS: BLOCK (409, then a manager PIN), WARN (flag),
 *     early window, OFF;
 *   - request settings for their effect: time-off notice (sick exempt),
 *     blackouts, availability and shift changes without approval, "show pay".
 *
 * Restaurant is in Miami (FL → FEDERAL overtime, America/New_York). Serial.
 * Skips without ADMIN creds or Mailpit.
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
  staffAppRaw,
  schedulingRaw,
  ownerStaffRaw,
  tabletRaw,
  setOwnerPosPin,
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
const day = (n: number) =>
  new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY)
    .toISOString()
    .slice(0, 10);
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00.000Z`;

test.describe.configure({ mode: "serial" });

test.describe("Scheduling — build, cost, warn, publish, clock-in rule (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );
  test.skip(
    !MAILPIT,
    "Requires Mailpit (MAILPIT_BASE_URL): invites and schedules travel by email"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let restaurantName = "";
  let deviceId = "";
  let tabletToken = "";
  let ownerMemberId = "";
  const OWNER_PIN = "5813";
  let jobId = "";
  let otherJobId = "";
  type Person = {
    email: string;
    token: string;
    staffMemberId: string;
  };
  const dee: Person = { email: "", token: "", staffMemberId: "" };
  const eve: Person = { email: "", token: "", staffMemberId: "" };
  const DEE_PIN = "3946";
  /** Week 1 (built, warned, published), week 2 (overtime), week 3 (copy). */
  let w1 = "";
  let w2 = "";
  let w3 = "";
  const ids = { deeD1: "", open: "", eveD2: "" };
  /** TC-576's shift today (published), reused by TC-636. */
  let todayShift = "";

  const hire = async (who: Person, first: string, last: string) => {
    who.email = `auto-sched-${first.toLowerCase()}-${runId}@${DOMAIN}`;
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
    const claimed = await registerWithInvite({
      firstName: first,
      lastName: last,
      email: who.email,
      password: `Automation!Staff-${runId}`,
      userInvitationToken: extractInviteToken(mail.text_body || mail.html_body),
    });
    who.token = claimed.accessToken;
  };

  const week = async (date: string) => {
    const res = await getScheduleWeekRaw(ownerToken, restaurantId, date);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return res.data.data as Rec;
  };
  const shift = async (
    staffMemberId: string | null,
    startAt: string,
    endAt: string,
    extra: Rec = {}
  ) => {
    const r = await createShiftRaw(ownerToken, restaurantId, {
      staffMemberId,
      jobId,
      startAt,
      endAt,
      ...extra,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    return String(r.data.data?.shift.id);
  };
  const removeShift = async (id: string) => {
    const r = await schedulingRaw(
      ownerToken,
      restaurantId,
      "DELETE",
      `/shifts/${id}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
  };
  const settings = async (scheduling: Rec) => {
    const r = await putPayrollSettingsRaw(ownerToken, restaurantId, {
      scheduling,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const saved = (r.data.data as Rec).settings.scheduling as Rec;
    for (const [k, v] of Object.entries(scheduling))
      expect(saved[k], k).toEqual(v);
    return saved;
  };
  const codes = (w: Rec, code: string) =>
    list(w.warnings).filter((x) => x.code === code);

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-scheduling] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    restaurantName = `Automation Owner2 Store ${runId}`;
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SCHEDULING",
      true
    );
    if (!g.ok)
      throw new Error(`[api-scheduling] grant: ${JSON.stringify(g.data)}`);
    await hire(dee, "Dee", "Park");
    await hire(eve, "Eve", "Stone");
    const job = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Server ${runId}`,
      defaultHourlyRateCents: 1500,
    });
    jobId = String(job.data.data?.id);
    const other = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Dish ${runId}`,
      defaultHourlyRateCents: 1300,
    });
    otherJobId = String(other.data.data?.id);
    // Dee earns her own $20.00; Eve the job's $15.00.
    await setMemberJobsRaw(ownerToken, restaurantId, dee.staffMemberId, [
      { jobId, hourlyRateCents: 2000, isPrimary: true },
    ]);
    await setMemberJobsRaw(ownerToken, restaurantId, eve.staffMemberId, [
      { jobId, isPrimary: true },
    ]);
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-sched-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
    ownerMemberId = await setOwnerPosPin(ownerToken, restaurantId, OWNER_PIN);
    await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/${dee.staffMemberId}/pin`,
      { pin: DEE_PIN }
    );
    w1 = String((await week(day(14))).weekStart);
    w2 = String((await week(day(28))).weekStart);
    w3 = String((await week(day(42))).weekStart);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Scheduling");
    await allure.label("severity", "critical");
  });

  test("TC-570: a built week is costed in exact cents — personal rate, unpaid break, open shift at the job default", async () => {
    const d0 = addDays(w1, 1);
    const d1 = addDays(w1, 2);
    ids.deeD1 = await shift(
      dee.staffMemberId,
      at(d0, "18:00"),
      at(d0, "22:00"),
      {
        breakMinutes: 30,
      }
    );
    ids.open = await shift(null, at(d0, "18:00"), at(d0, "22:00"));
    ids.eveD2 = await shift(
      eve.staffMemberId,
      at(d1, "18:00"),
      at(d1, "22:00")
    );

    const w = await week(w1);
    const byId = new Map(list(w.shifts).map((s) => [s.id, s]));
    expect(byId.get(ids.deeD1)?.hourlyRateCents).toBe(2000);
    expect(byId.get(ids.eveD2)?.hourlyRateCents).toBe(1500);
    expect(byId.get(ids.open)?.hourlyRateCents).toBe(1500);
    // Dee 3.5h × $20 = $70; open 4h × $15 = $60; Eve 4h × $15 = $60.
    expect(w.cost.totals).toMatchObject({
      minutes: 210 + 240 + 240,
      overtimeMinutes: 0,
      wageCents: 7000 + 6000 + 6000,
    });
    const costOf = (date: string) =>
      list(w.cost.days).find((d) => d.date === date);
    expect(costOf(d0)).toMatchObject({ minutes: 450, wageCents: 13000 });
    expect(costOf(d1)).toMatchObject({ minutes: 240, wageCents: 6000 });
    expect(list(w.staff).find((s) => s.id === dee.staffMemberId)).toMatchObject(
      { minutes: 210, wageCents: 7000 }
    );
    // Nothing published yet: all three are pending changes.
    expect(w.pendingCount).toBe(3);
    expect(list(w.shifts).every((s) => s.pending && !s.published)).toBe(true);
  });

  test("TC-571: projected overtime — 48 scheduled hours cost 40 × rate + 8 × 1.5 × rate", async () => {
    for (let i = 0; i < 6; i++) {
      const d = addDays(w2, i);
      await shift(dee.staffMemberId, at(d, "14:00"), at(d, "22:00"));
    }
    const w = await week(w2);
    expect(w.cost.totals).toMatchObject({
      minutes: 48 * 60,
      overtimeMinutes: 8 * 60,
      wageCents: 40 * 2000 + 8 * 3000,
    });
    expect(codes(w, "OVERTIME")).toEqual([
      expect.objectContaining({
        staffMemberId: dee.staffMemberId,
        overtimeMinutes: 480,
      }),
    ]);
  });

  test("TC-572: warnings — overlap, job not held, short rest (off at 0 h), can't notify (email off)", async () => {
    const d0 = addDays(w1, 1);
    const d1 = addDays(w1, 2);
    const overlap = await shift(
      dee.staffMemberId,
      at(d0, "20:00"),
      at(d0, "23:00")
    );
    const notHeld = await createShiftRaw(ownerToken, restaurantId, {
      staffMemberId: eve.staffMemberId,
      jobId: otherJobId,
      startAt: at(addDays(w1, 4), "18:00"),
      endAt: at(addDays(w1, 4), "20:00"),
    });
    expect(notHeld.status).toBe(201);
    const notHeldId = String(notHeld.data.data?.shift.id);
    // 04:00Z on d1 = midnight in Miami, the next local day.
    const early = await shift(
      dee.staffMemberId,
      at(d1, "04:00"),
      at(d1, "08:00")
    );

    let w = await week(w1);
    expect(codes(w, "OVERLAP")).toEqual([
      expect.objectContaining({
        staffMemberId: dee.staffMemberId,
        shiftIds: expect.arrayContaining([ids.deeD1, overlap]),
      }),
    ]);
    expect(codes(w, "NOT_ASSIGNED_TO_JOB")).toEqual([
      expect.objectContaining({
        staffMemberId: eve.staffMemberId,
        shiftId: notHeldId,
      }),
    ]);
    expect(codes(w, "SHORT_REST")).toEqual([
      expect.objectContaining({
        staffMemberId: dee.staffMemberId,
        // After the overlapping 20:00–23:00Z shift, not 22:00Z: 5 h.
        restMinutes: 300,
      }),
    ]);
    // Each warning carries a message for the screen (text, not a key).
    for (const x of list(w.warnings)) {
      expect(typeof x.message).toBe("string");
      expect(String(x.message)).not.toMatch(/^[\w]+(\.[\w]+)+$/);
    }
    expect(codes(w, "CANNOT_NOTIFY")).toEqual([]);

    await settings({ minRestHours: 0 });
    w = await week(w1);
    expect(codes(w, "SHORT_REST")).toEqual([]);
    await settings({ minRestHours: 8 });

    // No phone on file + email channel off → nobody can be told.
    await settings({ notifyByEmail: false });
    w = await week(w1);
    expect(
      codes(w, "CANNOT_NOTIFY")
        .map((x) => x.staffMemberId)
        .sort()
    ).toEqual([dee.staffMemberId, eve.staffMemberId].sort());
    await settings({ notifyByEmail: true });

    for (const id of [overlap, notHeldId, early]) await removeShift(id);
    w = await week(w1);
    expect(codes(w, "OVERLAP")).toEqual([]);
    expect(codes(w, "NOT_ASSIGNED_TO_JOB")).toEqual([]);
  });

  test("TC-573: publishing tells each person once; the staff app shows published shifts only @email", async () => {
    const pub = await publishScheduleRaw(
      ownerToken,
      restaurantId,
      w1,
      "CHANGED"
    );
    expect(pub.status, JSON.stringify(pub.data)).toBe(200);
    expect(pub.data.data).toMatchObject({ published: 3, notified: 2 });

    // A draft added after publishing stays off the staff app.
    const draft = await shift(
      dee.staffMemberId,
      at(addDays(w1, 3), "18:00"),
      at(addDays(w1, 3), "22:00")
    );
    const w = await week(w1);
    expect(w.pendingCount).toBe(1);
    expect(list(w.shifts).find((s) => s.id === draft)?.published).toBeFalsy();

    const mine = await staffAppRaw<{ data: Rec[] }>(
      dee.token,
      "GET",
      `/schedule?from=${at(w1, "00:00")}&to=${at(addDays(w1, 8), "00:00")}`
    );
    expect(mine.status).toBe(200);
    expect(mine.data.data.map((s) => s.id)).toEqual([ids.deeD1]);
    expect(mine.data.data[0]).toMatchObject({
      restaurantId,
      breakMinutes: 30,
      startAt: at(addDays(w1, 1), "18:00"),
    });

    for (const p of [dee, eve]) {
      const mail = await waitForEmail(p.email, {
        subjectPattern: /^Your schedule at /,
        timeoutMs: 90_000,
      });
      expect(mail.subject).toContain(restaurantName);
    }
    await removeShift(draft);
  });

  test("TC-574: editing a published shift keeps what staff were told until it's republished @email", async () => {
    const edited = await schedulingRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/shifts/${ids.deeD1}`,
      {
        startAt: at(addDays(w1, 1), "19:00"),
        endAt: at(addDays(w1, 1), "23:00"),
      }
    );
    expect(edited.status, JSON.stringify(edited.data)).toBe(200);
    let w = await week(w1);
    const s = list(w.shifts).find((x) => x.id === ids.deeD1);
    expect(s?.pending).toBe(true);
    expect(new Date(s?.published.startAt).toISOString()).toBe(
      at(addDays(w1, 1), "18:00")
    );
    const range = `/schedule?from=${at(w1, "00:00")}&to=${at(addDays(w1, 8), "00:00")}`;
    let mine = await staffAppRaw<{ data: Rec[] }>(dee.token, "GET", range);
    expect(new Date(mine.data.data[0]?.startAt).toISOString()).toBe(
      at(addDays(w1, 1), "18:00")
    );

    const pub = await publishScheduleRaw(
      ownerToken,
      restaurantId,
      w1,
      "CHANGED"
    );
    expect(pub.data.data).toMatchObject({ published: 1, notified: 1 });
    w = await week(w1);
    expect(w.pendingCount).toBe(0);
    mine = await staffAppRaw<{ data: Rec[] }>(dee.token, "GET", range);
    expect(new Date(mine.data.data[0]?.startAt).toISOString()).toBe(
      at(addDays(w1, 1), "19:00")
    );
    const mail = await waitForEmail(dee.email, {
      subjectPattern: /^Schedule change at /,
      timeoutMs: 90_000,
    });
    expect(mail.subject).toContain(restaurantName);

    // "Nobody" publishes without telling anyone.
    const quiet = await schedulingRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/shifts/${ids.eveD2}`,
      { breakMinutes: 15 }
    );
    expect(quiet.status).toBe(200);
    const none = await publishScheduleRaw(ownerToken, restaurantId, w1, "NONE");
    expect(none.data.data).toMatchObject({ published: 1, notified: 0 });
  });

  test("TC-575: copy a week as open shifts", async () => {
    const r = await schedulingRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/copy-week",
      {
        fromDate: w1,
        toDate: w3,
        asOpen: true,
      }
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const w = await week(w3);
    const shifts = list(w.shifts);
    expect(shifts).toHaveLength(3);
    expect(shifts.every((s) => s.staffMemberId === null)).toBe(true);
    expect(shifts.every((s) => s.pending)).toBe(true);
    // Same weekday and LOCAL time, four weeks on — across the DST change in
    // early November the UTC hour moves, the Miami wall-clock time doesn't.
    const localHour = (iso: string) =>
      Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          hourCycle: "h23",
        }).format(new Date(iso))
      );
    const sourceHours = list((await week(w1)).shifts)
      .map((s) => localHour(s.startAt))
      .sort();
    const times = shifts.map((s) => localHour(s.startAt)).sort();
    expect(times).toEqual(sourceHours);
  });

  test("TC-576: clock-in rule on the POS — BLOCK needs a manager, WARN flags, the early window and OFF", async () => {
    // A shift starting in an hour, today. Too close to local midnight and
    // "today" would end before it starts.
    // A one-hour shift starting in 30 minutes: 15 minutes is too early for
    // it, 120 isn't. It must end on today's local date (and after the 04:00
    // business-day cutoff), or "today" no longer holds it.
    const start = new Date(
      Math.ceil((Date.now() + 30 * 60_000) / 60_000) * 60_000
    );
    const end = new Date(start.getTime() + 60 * 60_000);
    const localDate = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
        d
      );
    const localHourNow = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        hourCycle: "h23",
      }).format(new Date())
    );
    test.skip(
      localDate(end) !== localDate(new Date()) || localHourNow < 4,
      "too close to midnight in Miami for a shift today"
    );
    const today = await shift(
      dee.staffMemberId,
      start.toISOString(),
      end.toISOString()
    );
    todayShift = today;
    const p = await publishScheduleRaw(
      ownerToken,
      restaurantId,
      start.toISOString().slice(0, 10),
      "NONE"
    );
    expect(p.status).toBe(200);

    const clockIn = (extra: Rec = {}) =>
      tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
        staffMemberId: dee.staffMemberId,
        pin: DEE_PIN,
        supportsClockInRules: true,
        ...extra,
      });
    const clockOut = async () => {
      const r = await tabletRaw(tabletToken, "POST", "/staff/clock-out", {
        staffMemberId: dee.staffMemberId,
        pin: DEE_PIN,
      });
      expect(r.status, JSON.stringify(r.data)).toBe(200);
    };

    await settings({ clockInRule: "BLOCK", earlyClockInMinutes: 15 });
    const blocked = await clockIn();
    expect(blocked.status, JSON.stringify(blocked.data)).toBe(409);
    expect(blocked.data).toMatchObject({
      errorCode: "CLOCK_IN_APPROVAL_REQUIRED",
      details: { reason: "EARLY" },
    });
    expect(String(blocked.data.message)).toMatch(/\d/); // names the times
    // A wrong manager PIN doesn't approve it.
    const wrongPin = await clockIn({
      managerPin: "1357",
      approverStaffMemberId: ownerMemberId,
    });
    expect(wrongPin.status).toBeGreaterThanOrEqual(400);
    const approved = await clockIn({
      managerPin: OWNER_PIN,
      approverStaffMemberId: ownerMemberId,
    });
    expect(approved.status, JSON.stringify(approved.data)).toBe(200);
    expect(approved.data.data.shift).toMatchObject({
      clockInException: "EARLY",
      clockInApprovedByStaffMemberId: ownerMemberId,
    });
    await clockOut();

    await settings({ clockInRule: "WARN" });
    const warned = await clockIn();
    expect(warned.status, JSON.stringify(warned.data)).toBe(200);
    expect(warned.data.data.shift.clockInException).toBe("EARLY");
    await clockOut();

    // Two hours' early window: now is inside it — a plain matched clock-in.
    await settings({ clockInRule: "BLOCK", earlyClockInMinutes: 120 });
    const matched = await clockIn();
    expect(matched.status, JSON.stringify(matched.data)).toBe(200);
    expect(matched.data.data.shift).toMatchObject({
      clockInException: null,
      scheduledShiftId: today,
    });
    await clockOut();

    await settings({ clockInRule: "OFF", earlyClockInMinutes: 15 });
    const off = await clockIn();
    expect(off.status).toBe(200);
    expect(off.data.data.shift.clockInException).toBeNull();
    await clockOut();
  });

  test("TC-577: time-off rules — minimum notice (sick exempt) and blackout dates", async () => {
    const blackout = day(40);
    await settings({
      timeOffMinNoticeDays: 7,
      timeOffBlackouts: [
        { startDate: blackout, endDate: blackout, label: "Inventory day" },
      ],
    });
    const ask = (date: string, type: string) =>
      staffAppRaw<{ data: Rec }>(
        eve.token,
        "POST",
        `/restaurants/${restaurantId}/time-off`,
        { startDate: date, endDate: date, type }
      );
    expect((await ask(day(3), "UNPAID")).status, "inside notice").toBe(400);
    expect((await ask(day(3), "SICK")).status, "sick is exempt").toBe(201);
    expect((await ask(day(10), "PAID")).status, "outside notice").toBe(201);
    expect((await ask(blackout, "UNPAID")).status, "blackout").toBe(400);
    const rules = await staffAppRaw<{ data: Rec }>(
      eve.token,
      "GET",
      `/restaurants/${restaurantId}/time-off`
    );
    expect(rules.data.data.rules).toMatchObject({
      minNoticeDays: 7,
      blackouts: [expect.objectContaining({ startDate: blackout })],
    });
    await settings({ timeOffMinNoticeDays: 0, timeOffBlackouts: [] });
  });

  test("TC-578: without approval, availability applies at once and a picked-up shift is the taker's", async () => {
    await settings({
      availabilityNeedsApproval: false,
      shiftChangesNeedApproval: false,
    });
    const weekly = Array.from({ length: 7 }, () => ({
      allDayUnavailable: false,
      unavailable: [] as { start: string; end: string }[],
      preferred: [] as { start: string; end: string }[],
    }));
    const avail = await staffAppRaw<{ data: Rec }>(
      eve.token,
      "PUT",
      `/restaurants/${restaurantId}/availability`,
      { weekly, effectiveFrom: day(0) }
    );
    expect(avail.status, JSON.stringify(avail.data)).toBe(200);
    expect(avail.data.data.status).toBe("APPROVED");

    const released = await staffAppRaw<{ data: Rec }>(
      dee.token,
      "POST",
      `/restaurants/${restaurantId}/shifts/${ids.deeD1}/release`,
      { note: "dentist" }
    );
    expect(released.status, JSON.stringify(released.data)).toBe(201);
    const taken = await staffAppRaw<{ data: Rec }>(
      eve.token,
      "POST",
      `/restaurants/${restaurantId}/shifts/${ids.deeD1}/pick-up`
    );
    expect(taken.status, JSON.stringify(taken.data)).toBe(200);
    expect(taken.data.data.status).toBe("APPROVED");
    const w = await week(w1);
    const moved = list(w.shifts).find((s) => s.id === ids.deeD1);
    expect(moved?.staffMemberId).toBe(eve.staffMemberId);
    expect(moved?.published.staffMemberId).toBe(eve.staffMemberId);
    await settings({
      availabilityNeedsApproval: true,
      shiftChangesNeedApproval: true,
    });
  });

  test("TC-579: 'show pay to staff' decides whether the staff app shows pay", async () => {
    const showPay = async () => {
      const me = await staffAppRaw<{ data: Rec }>(dee.token, "GET", "/me");
      return list(me.data.data.restaurants)[0]?.showPay;
    };
    expect(await showPay()).toBe(true);
    await settings({ showPayToStaff: false });
    expect(await showPay()).toBe(false);
    await settings({ showPayToStaff: true });
  });

  test("TC-636: a manager-approved early clock-in counts as attendance for its shift", async () => {
    // Was bug B2 (found 2026-10-06, fixed in restaunax #909): an EARLY
    // clock-in wasn't linked to its shift, so attendance showed "not in".
    test.skip(!todayShift, "TC-576 didn't run (time window)");
    // A fresh shift today for the owner (who holds APPROVE_CLOCK_IN, so an
    // early clock-in is approved on the spot) — no other clock-in is linked
    // to it, unlike TC-576's shift.
    const start = new Date(
      Math.ceil((Date.now() + 30 * 60_000) / 60_000) * 60_000
    );
    const end = new Date(start.getTime() + 30 * 60_000);
    const mine = await shift(
      ownerMemberId,
      start.toISOString(),
      end.toISOString()
    );
    await publishScheduleRaw(
      ownerToken,
      restaurantId,
      start.toISOString().slice(0, 10),
      "NONE"
    );
    await settings({ clockInRule: "BLOCK", earlyClockInMinutes: 15 });
    const inn = await tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
      staffMemberId: ownerMemberId,
      pin: OWNER_PIN,
      supportsClockInRules: true,
    });
    expect(inn.status, JSON.stringify(inn.data)).toBe(200);
    expect(inn.data.data.shift.clockInException).toBe("EARLY");
    try {
      const w = await week(start.toISOString().slice(0, 10));
      const s = list(w.shifts).find((x) => x.id === mine);
      expect(inn.data.data.shift.scheduledShiftId).toBe(mine);
      expect(s?.attendance?.clockInAt).toBeTruthy();
    } finally {
      await tabletRaw(tabletToken, "POST", "/staff/clock-out", {
        staffMemberId: ownerMemberId,
        pin: OWNER_PIN,
      });
      await settings({ clockInRule: "OFF" });
    }
  });
});
