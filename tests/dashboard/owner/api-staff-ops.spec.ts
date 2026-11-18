/**
 * api-staff-ops.spec.ts — staff operations on QA (RestauNax back-office
 * audit Stage 5: W3:M3 auto clock-out, W3:M7 disputes of manager edits,
 * W3:M9 terminations / final pay / former staff, W3:H6 tipped occupation
 * codes + Form 8027 allocation, W4:M8 the overtime split in the file)
 * (TC-1460..1472).
 *
 * No browser. A per-run throwaway restaurant (createSecondOwner alwaysFresh,
 * Miami, America/New_York) with PAYROLL (→ TIMECARDS), weekly pay periods
 * from a Sunday, and:
 *   Gus — a real account (claims his invite from Mailpit), Barista $16.00,
 *         a POS PIN. One manager-entered 8 h shift in last week's finished
 *         period P1 (no overtime).
 *   Tess — invited only; terminated to read her final-pay deadline.
 * The flow:
 *   TC-1460 POS clock-in carries `pendingAutoClockOuts: []` and a null
 *           answer token (nothing was swept); answering with a bad or no
 *           token → 401 "This question expired…".
 *   TC-1461 Terminating someone on the clock → 400 STILL_CLOCKED_IN; clock out.
 *   TC-1462 The owner's entry shows in Gus's Restaunax Staff "shift edits"
 *           (needsAnswer); /me counts it (shiftEditsToAnswer) and has
 *           formerRestaurants [].
 *   TC-1463 Answer validation: dispute without a note → 400 NOTE_REQUIRED,
 *           a bad status → 400 INVALID_STATUS, unknown shift → 404 NOT_FOUND.
 *   TC-1464 Gus disputes; a second answer → 409 ALREADY_ANSWERED; the
 *           timecard line is flagged EMPLOYEE_DISPUTE and P1 can't be
 *           approved; the owner's disputes list and Needs you
 *           (TIMECARD_DISPUTE) carry it.
 *   TC-1465 Resolve: no note → 400, unknown shift → 404, with a note → 200;
 *           the list and Needs you empty; Gus sees the resolution.
 *   TC-1466 Tip occupation codes: 101 Bartenders, restaurant codes first.
 *   TC-1467 A job's TTOC: "999" → 400, "101" saved, "" clears.
 *   TC-1468 Payroll settings `staffOps` defaults, round-trip, restored; the
 *           8027 allocation: bad range → 400, enabled follows the setting.
 *   TC-1469 P1 approved and exported: no overtime → the RestauNax file has
 *           no federal/state overtime columns; Gus's year-end figures; a
 *           year out of range → 404.
 *   TC-1470 Terminate validation: bad reason, bad date, too far ahead,
 *           unknown person.
 *   TC-1471 Tess terminated (quit): the final-pay status and sentence, the
 *           final-pays list, Needs you FINAL_PAY, off-cycle refused (not on
 *           RestauNax Payroll), mark paid takes her off.
 *   TC-1472 Gus terminated: he is a former employee — formerRestaurants, his
 *           year-end still reads, shift edits are gone (404).
 *
 * Safe on QA: everything happens on this file's own tenant (deleted in
 * afterAll); no seeded QA staff is ever terminated. The nightly auto
 * clock-out sweep itself is covered by the backend integration test
 * (autoClockOut.int) — not practical to wait for on QA.
 * Serial. Fails (never skips) without ADMIN creds or Mailpit.
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
  getPayrollSettingsRaw,
  putPayrollSettingsRaw,
  payrollRaw,
  staffAppRaw,
  ownerStaffRaw,
  tabletRaw,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  type LooseJson,
  type RawResponse,
} from "../../../utils/apiHelper";
import {
  addDays,
  localToday,
  looksLikeKey,
  needsYouRaw,
} from "../../../utils/backOfficeApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";
const ZONE = "America/New_York";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const at = (date: string, hhmm: string) => `${date}T${hhmm}:00.000Z`;
/** The resolved sentence on an error body. */
const said = (r: RawResponse<LooseJson>) =>
  String((r.data as Rec | undefined)?.message ?? "");
const REASON = "Entered from the paper sheet";
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
const csvLines = (body: unknown) =>
  String(body)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.length > 0);

test.describe.configure({ mode: "serial" });

test.describe("Staff operations — auto clock-out, disputes, termination, TTOC (API)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tabletToken = "";
  const gus = { email: "", token: "", staffMemberId: "" };
  const tess = { staffMemberId: "" };
  const GUS_PIN = "3852";
  let barista = "";
  let bartender = "";
  /** Last week's finished pay period (Sunday start). */
  let p1 = "";
  let shiftId = "";

  const gusCard = async () => {
    const r = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/timecards?startDate=${p1}&endDate=${addDays(p1, 6)}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return list((r.data.data as Rec).employees).find(
      (e) => e.staffMemberId === gus.staffMemberId
    ) as Rec;
  };
  const shiftEdits = () =>
    staffAppRaw<Rec>(
      gus.token,
      "GET",
      `/restaurants/${restaurantId}/shift-edits`
    );
  const respond = (id: string, body: Rec) =>
    staffAppRaw<Rec>(
      gus.token,
      "POST",
      `/restaurants/${restaurantId}/shift-edits/${id}/respond`,
      body
    );
  const me = async () => {
    const r = await staffAppRaw<Rec>(gus.token, "GET", "/me");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };
  const needsYouItems = async () => {
    const r = await needsYouRaw(ownerToken, restaurantId);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return list((r.data.data as Rec).items);
  };
  const terminate = (staffMemberId: string, body: Rec) =>
    ownerStaffRaw<Rec>(
      ownerToken,
      restaurantId,
      "POST",
      `/${staffMemberId}/terminate`,
      body
    );
  const finalPays = async () => {
    const r = await ownerStaffRaw<Rec>(
      ownerToken,
      restaurantId,
      "GET",
      "/final-pays"
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(Array.isArray(r.data.data), JSON.stringify(r.data)).toBe(true);
    return list(r.data.data);
  };
  const settings = async (patch: Rec) => {
    const r = await putPayrollSettingsRaw(ownerToken, restaurantId, patch);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return (r.data.data as Rec).settings as Rec;
  };
  const yearEnd = (year: number | string) =>
    staffAppRaw<Rec>(
      gus.token,
      "GET",
      `/restaurants/${restaurantId}/year-end/${year}`
    );
  const expectFinalPayStatus = (s: Rec, name: string) => {
    expect(s).toMatchObject({ name, finalPayPaidAt: null });
    expect(String(s.terminatedAt)).toMatch(ISO_RE);
    expect(String(s.separationDate)).toMatch(DATE_RE);
    expect(String(s.deadline?.dueDate)).toMatch(DATE_RE);
    expect(["FIRED", "QUIT"]).toContain(s.deadline?.basis);
    expect(typeof s.deadline?.estimated).toBe("boolean");
    expect(["CONFIRMED", "DRAFT", "MISSING"]).toContain(s.ruleStatus);
    for (const f of ["text", "reasonLabel"])
      expect(looksLikeKey(s[f]), `${f}: ${s[f]}`).toBe(false);
    expect(String(s.text)).toContain(name);
    if (s.ruleStatus === "CONFIRMED") expect(s.ruleNote).toBeNull();
    else expect(looksLikeKey(s.ruleNote)).toBe(false);
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    // Fail, never skip, without the environment (W5:T7).
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
      throw new Error("[api-staff-ops] ADMIN_EMAIL / ADMIN_PASSWORD not set");
    if (!MAILPIT)
      throw new Error(
        "[api-staff-ops] MAILPIT_BASE_URL not set: the invite token travels by email"
      );
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[api-staff-ops] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "PAYROLL",
      true
    );
    if (!g.ok)
      throw new Error(`[api-staff-ops] grant: ${JSON.stringify(g.data)}`);

    gus.email = `auto-so-gus-${runId}@${DOMAIN}`;
    recordUserForCleanup(gus.email);
    const invited = await inviteStaffRaw(ownerToken, restaurantId, {
      email: gus.email,
      firstName: "Gus",
      lastName: "Hale",
    });
    gus.staffMemberId = String(invited.data.data?.staffMemberId ?? "");
    if (!gus.staffMemberId)
      throw new Error(
        `[api-staff-ops] invite: ${JSON.stringify(invited.data)}`
      );
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

    const tessInvite = await inviteStaffRaw(ownerToken, restaurantId, {
      email: `auto-so-tess-${runId}@${DOMAIN}`,
      firstName: "Tess",
      lastName: "Quill",
    });
    tess.staffMemberId = String(tessInvite.data.data?.staffMemberId ?? "");
    if (!tess.staffMemberId)
      throw new Error(
        `[api-staff-ops] Tess invite: ${JSON.stringify(tessInvite.data)}`
      );

    // At or above Miami's $15.00 minimum (W3:C3).
    barista = String(
      (
        await createStaffJobRaw(ownerToken, restaurantId, {
          name: `Barista ${runId}`,
          defaultHourlyRateCents: 1600,
        })
      ).data.data?.id
    );
    bartender = String(
      (
        await createStaffJobRaw(ownerToken, restaurantId, {
          name: `Bartender ${runId}`,
          defaultHourlyRateCents: 1600,
          isTipped: true,
        })
      ).data.data?.id
    );
    if (!barista || barista === "undefined" || !bartender)
      throw new Error("[api-staff-ops] jobs not created");
    await setMemberJobsRaw(ownerToken, restaurantId, gus.staffMemberId, [
      { jobId: barista, isPrimary: true },
    ]);
    const pin = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/${gus.staffMemberId}/pin`,
      { pin: GUS_PIN }
    );
    if (!pin.ok)
      throw new Error(`[api-staff-ops] PIN: ${JSON.stringify(pin.data)}`);

    const saved = await settings({
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      workweekStartDay: 0,
    });
    if (saved.payFrequency !== "WEEKLY")
      throw new Error("[api-staff-ops] weekly periods not saved");
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
    if (!p1)
      throw new Error(
        `[api-staff-ops] no finished period: ${JSON.stringify(periods.data)}`
      );

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-so-${runId}`
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
    await allure.label("feature", "Staff operations");
    await allure.label("severity", "critical");
  });

  // ── W3:M3 auto clock-out: the POS question ──────────────────────────────

  test("TC-1460: W3:M3 POS clock-in carries the auto clock-out question (none pending); a bad or missing answer token → 401", async () => {
    const inn = await tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
      staffMemberId: gus.staffMemberId,
      pin: GUS_PIN,
      jobId: barista,
    });
    expect(inn.status, JSON.stringify(inn.data)).toBe(200);
    const data = inn.data.data as Rec;
    expect(data.shift).toBeTruthy();
    // Additive fields an old POS ignores: nothing was swept for Gus.
    expect(Array.isArray(data.pendingAutoClockOuts)).toBe(true);
    expect(data.pendingAutoClockOuts).toEqual([]);
    expect(data).toHaveProperty("autoClockOutAnswerToken", null);

    const expired = "This question expired. Clock in again to answer it.";
    const bad = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/staff/auto-clock-out/respond",
      {
        answerToken: "not-a-real-token",
        shiftId: String(data.shift?.id ?? UNKNOWN_ID),
        status: "CONFIRMED",
      }
    );
    expect(bad.status, JSON.stringify(bad.data)).toBe(401);
    expect(said(bad)).toBe(expired);

    const missing = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/staff/auto-clock-out/respond",
      { shiftId: UNKNOWN_ID, status: "CONFIRMED" }
    );
    expect(missing.status, JSON.stringify(missing.data)).toBe(401);
    expect(said(missing)).toBe(expired);
  });

  test("TC-1461: W3:M9 terminating someone still on the clock → 400 STILL_CLOCKED_IN; nothing is saved", async () => {
    const r = await terminate(gus.staffMemberId, { reason: "QUIT" });
    expect(r.status, JSON.stringify(r.data)).toBe(400);
    expect(said(r)).toBe(
      "This person is still clocked in. Clock them out first."
    );
    const none = await ownerStaffRaw<Rec>(
      ownerToken,
      restaurantId,
      "GET",
      `/${gus.staffMemberId}/final-pay`
    );
    expect(none.status, JSON.stringify(none.data)).toBe(404);
    expect(said(none)).toBe("This person has no termination on record.");

    const out = await tabletRaw(tabletToken, "POST", "/staff/clock-out", {
      staffMemberId: gus.staffMemberId,
      pin: GUS_PIN,
    });
    expect(out.status, JSON.stringify(out.data)).toBe(200);
  });

  // ── W3:M7 manager edits → the employee answers ──────────────────────────

  test("TC-1462: W3:M7 a manager's entry shows in Restaunax Staff shift edits; /me counts it", async () => {
    const mon = addDays(p1, 1);
    const created = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/shifts",
      {
        staffMemberId: gus.staffMemberId,
        clockInAt: at(mon, "13:00"),
        clockOutAt: at(mon, "21:00"),
        jobId: barista,
        reason: REASON,
      }
    );
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    shiftId = String(created.data.data.id);

    const r = await shiftEdits();
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(Array.isArray(r.data.data), JSON.stringify(r.data)).toBe(true);
    const edit = list(r.data.data).find((e) => e.shiftId === shiftId);
    expect(edit, JSON.stringify(r.data.data)).toBeTruthy();
    expect(edit).toMatchObject({
      shiftId,
      localDate: mon,
      jobName: `Barista ${runId}`,
      voided: false,
      needsAnswer: true,
      response: null,
    });
    expect(String(edit?.after?.clockInAt)).toMatch(ISO_RE);
    expect(String(edit?.after?.clockOutAt)).toMatch(ISO_RE);
    expect(String(edit?.lastEditedAt)).toMatch(ISO_RE);
    const lines = list(edit?.edits);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines[0]).toMatchObject({ action: "CREATE", reason: REASON });
    for (const l of lines)
      expect(looksLikeKey(l.label), `label: ${l.label}`).toBe(false);

    const mine = await me();
    expect(Array.isArray(mine.formerRestaurants)).toBe(true);
    expect(mine.formerRestaurants).toEqual([]);
    const here = list(mine.restaurants).find(
      (x) => x.restaurantId === restaurantId
    );
    expect(here, JSON.stringify(mine.restaurants)).toBeTruthy();
    expect(typeof here?.shiftEditsToAnswer).toBe("number");
    expect(here?.shiftEditsToAnswer).toBe(1);
  });

  test("TC-1463: W3:M7 answer validation — dispute without a note 400 NOTE_REQUIRED, bad status 400, unknown shift 404", async () => {
    const noNote = await respond(shiftId, { status: "DISPUTED" });
    expect(noNote.status, JSON.stringify(noNote.data)).toBe(400);
    expect(noNote.data).toMatchObject({
      errorCode: "NOTE_REQUIRED",
      message: "Say what is wrong so your manager can fix it.",
    });
    const blank = await respond(shiftId, { status: "DISPUTED", note: "   " });
    expect(blank.status).toBe(400);
    expect(blank.data.errorCode).toBe("NOTE_REQUIRED");

    const badStatus = await respond(shiftId, { status: "MAYBE" });
    expect(badStatus.status, JSON.stringify(badStatus.data)).toBe(400);
    expect(badStatus.data).toMatchObject({
      errorCode: "INVALID_STATUS",
      message: "Choose confirm or dispute.",
    });

    const unknown = await respond(UNKNOWN_ID, { status: "CONFIRMED" });
    expect(unknown.status, JSON.stringify(unknown.data)).toBe(404);
    expect(unknown.data).toMatchObject({
      errorCode: "NOT_FOUND",
      message: "That shift was not found.",
    });

    // Nothing was recorded: still waiting for an answer.
    const still = list((await shiftEdits()).data.data).find(
      (e) => e.shiftId === shiftId
    );
    expect(still).toMatchObject({ needsAnswer: true, response: null });
  });

  test("TC-1464: W3:M7 Gus disputes; a second answer 409; the line is flagged EMPLOYEE_DISPUTE and blocks approval; disputes + Needs you carry it", async () => {
    const note = "I stayed until 6pm closing the bar";
    const r = await respond(shiftId, { status: "DISPUTED", note });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.data).toMatchObject({ status: "DISPUTED" });
    expect(looksLikeKey(r.data.message)).toBe(false);

    const again = await respond(shiftId, { status: "CONFIRMED" });
    expect(again.status, JSON.stringify(again.data)).toBe(409);
    expect(again.data).toMatchObject({
      errorCode: "ALREADY_ANSWERED",
      message: "You already answered this change.",
    });

    const edit = list((await shiftEdits()).data.data).find(
      (e) => e.shiftId === shiftId
    );
    expect(edit).toMatchObject({
      needsAnswer: false,
      response: { status: "DISPUTED", note, resolvedAt: null },
    });

    // The owner's timecard: the line is flagged and answered.
    const line = list((await gusCard()).shifts).find((s) => s.id === shiftId);
    expect(line?.flags, JSON.stringify(line)).toContain("EMPLOYEE_DISPUTE");
    expect(line?.employeeResponse).toMatchObject({
      kind: "MANAGER_EDIT",
      status: "DISPUTED",
      note,
      resolvedAt: null,
    });
    // An open dispute is always blocking.
    const approve = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`
    );
    expect(approve.status, JSON.stringify(approve.data)).toBeGreaterThanOrEqual(
      400
    );
    expect(approve.status).toBeLessThan(500);
    expect(said(approve)).toMatch(/still needs? review/);

    const disputes = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/disputes"
    );
    expect(disputes.status, JSON.stringify(disputes.data)).toBe(200);
    const row = list(disputes.data.data).find((d) => d.shiftId === shiftId);
    expect(row, JSON.stringify(disputes.data.data)).toBeTruthy();
    expect(row).toMatchObject({ shiftId, note, name: "Gus Hale" });
    expect(typeof row?.id).toBe("string");
    expect(String(row?.respondedAt)).toMatch(ISO_RE);
    expect(String(row?.clockInAt)).toMatch(ISO_RE);

    const item = (await needsYouItems()).find(
      (i) => i.kind === "TIMECARD_DISPUTE"
    );
    expect(item, "Needs you has the dispute").toBeTruthy();
    for (const f of ["title", "detail"])
      expect(looksLikeKey(item?.[f]), f).toBe(false);
    expect(looksLikeKey(item?.action?.label)).toBe(false);
    expect(String(item?.detail)).toContain("Gus");
    const appRoute = String(item?.action?.appRoute ?? "");
    expect(appRoute).toContain(`/restaurant/${restaurantId}/staff`);
    expect(appRoute).toContain("tab=timecards");
    expect(appRoute).toContain(`shiftId=${shiftId}`);
    const webPath = String(item?.action?.webPath ?? "");
    const q = new URLSearchParams(webPath.split("?")[1] ?? "");
    expect(q.get("tab")).toBe("staff");
    expect(q.get("staffTab")).toBe("timecards");
    expect(q.get("shiftId")).toBe(shiftId);
  });

  test("TC-1465: W3:M7 resolving needs a note (400), an unknown shift is 404; resolved, the list and Needs you are empty and Gus sees why", async () => {
    const resolve = (id: string, body: Rec) =>
      payrollRaw<Rec>(
        ownerToken,
        restaurantId,
        "POST",
        `/shifts/${id}/dispute/resolve`,
        body
      );
    const noNote = await resolve(shiftId, {});
    expect(noNote.status, JSON.stringify(noNote.data)).toBe(400);
    expect(said(noNote)).toBe(
      "Write what you decided so the employee can see it."
    );
    const unknown = await resolve(UNKNOWN_ID, { note: "Checked" });
    expect(unknown.status, JSON.stringify(unknown.data)).toBe(404);
    expect(said(unknown)).toBe("There is no open dispute on this shift.");

    const decision = "The bar closed at 5, checked the camera";
    const ok = await resolve(shiftId, { note: decision });
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    expect(looksLikeKey(ok.data.message)).toBe(false);

    const disputes = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/disputes"
    );
    expect(disputes.status).toBe(200);
    expect(
      list(disputes.data.data).filter((d) => d.shiftId === shiftId)
    ).toEqual([]);
    expect((await needsYouItems()).map((i) => i.kind)).not.toContain(
      "TIMECARD_DISPUTE"
    );
    const line = list((await gusCard()).shifts).find((s) => s.id === shiftId);
    expect(line?.flags).not.toContain("EMPLOYEE_DISPUTE");

    const edit = list((await shiftEdits()).data.data).find(
      (e) => e.shiftId === shiftId
    );
    expect(String(edit?.response?.resolvedAt)).toMatch(ISO_RE);
    expect(looksLikeKey(edit?.response?.resolution)).toBe(false);
    expect(String(edit?.response?.resolution)).toContain(decision);
    const here = list((await me()).restaurants).find(
      (x) => x.restaurantId === restaurantId
    );
    expect(here?.shiftEditsToAnswer).toBe(0);
  });

  // ── W3:H6 tipped occupation codes + the 8027 allocation ─────────────────

  test("TC-1466: W3:H6 tip occupation codes — 101 Bartenders, restaurant codes first, with the source", async () => {
    const r = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/tip-occupation-codes"
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const data = r.data.data as Rec;
    const codes = list(data.codes);
    expect(codes.length).toBeGreaterThan(10);
    expect(codes.find((c) => c.code === "101")).toEqual({
      code: "101",
      label: "Bartenders",
      restaurant: true,
    });
    const flags = codes.map((c) => c.restaurant === true);
    const lastRestaurant = flags.lastIndexOf(true);
    const firstOther = flags.indexOf(false);
    expect(lastRestaurant).toBeGreaterThanOrEqual(0);
    expect(firstOther, "restaurant codes come first").toBeGreaterThan(
      lastRestaurant
    );
    for (const c of codes) {
      expect(String(c.code)).toMatch(/^\d{3}$/);
      expect(looksLikeKey(c.label), `label ${c.code}`).toBe(false);
    }
    expect(typeof data.source).toBe("string");
    expect(String(data.verifiedOn)).toMatch(DATE_RE);
  });

  test("TC-1467: W3:H6 a job's tipped occupation code — 999 → 400, 101 saved, empty clears", async () => {
    const patch = (tipOccupationCode: string) =>
      payrollRaw<Rec>(ownerToken, restaurantId, "PATCH", `/jobs/${bartender}`, {
        tipOccupationCode,
      });
    const bad = await patch("999");
    expect(bad.status, JSON.stringify(bad.data)).toBe(400);
    expect(said(bad)).toBe(
      "That is not an IRS tipped occupation code. Pick one from the list."
    );

    const saved = await patch("101");
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    expect(saved.data.data).toMatchObject({
      id: bartender,
      tipOccupationCode: "101",
    });
    const jobs = await payrollRaw(ownerToken, restaurantId, "GET", "/jobs");
    expect(jobs.status).toBe(200);
    const job = list(jobs.data.data).find((j) => j.id === bartender);
    expect(job?.tipOccupationCode).toBe("101");
    expect(
      list(jobs.data.data).find((j) => j.id === barista)?.tipOccupationCode
    ).toBeNull();

    const cleared = await patch("");
    expect(cleared.status, JSON.stringify(cleared.data)).toBe(200);
    expect(cleared.data.data.tipOccupationCode).toBeNull();
  });

  test("TC-1468: W3:M3/H6 payroll settings staffOps defaults, round-trip and restore; the 8027 allocation follows it", async () => {
    const got = await getPayrollSettingsRaw(ownerToken, restaurantId);
    expect(got.status, JSON.stringify(got.data)).toBe(200);
    expect(((got.data.data as Rec).settings as Rec).staffOps).toEqual({
      autoClockOutAtDayEnd: true,
      largeFoodEstablishment: false,
    });

    const allocation = (q: string) =>
      payrollRaw<Rec>(ownerToken, restaurantId, "GET", `/tip-allocation${q}`);
    for (const q of [
      "",
      "?startDate=nope&endDate=2026-01-07",
      `?startDate=${addDays(p1, 6)}&endDate=${p1}`,
    ]) {
      const r = await allocation(q);
      expect(r.status, `${q}: ${JSON.stringify(r.data)}`).toBe(400);
      expect(looksLikeKey(said(r))).toBe(false);
    }
    const range = `?startDate=${p1}&endDate=${addDays(p1, 6)}`;
    const off = await allocation(range);
    expect(off.status, JSON.stringify(off.data)).toBe(200);
    expect(off.data.data).toMatchObject({
      startDate: p1,
      endDate: addDays(p1, 6),
      enabled: false,
      worksheet: null,
    });
    expect(looksLikeKey(off.data.data.text)).toBe(false);

    try {
      // Partial: one key changes, the other keeps its value.
      expect(
        (await settings({ staffOps: { largeFoodEstablishment: true } }))
          .staffOps
      ).toEqual({ autoClockOutAtDayEnd: true, largeFoodEstablishment: true });
      const on = await allocation(range);
      expect(on.status, JSON.stringify(on.data)).toBe(200);
      expect(on.data.data).toMatchObject({ enabled: true, text: null });
      expect(typeof on.data.data.enabled).toBe("boolean");

      expect(
        (await settings({ staffOps: { autoClockOutAtDayEnd: false } })).staffOps
      ).toEqual({ autoClockOutAtDayEnd: false, largeFoodEstablishment: true });
      const reread = await getPayrollSettingsRaw(ownerToken, restaurantId);
      expect(((reread.data.data as Rec).settings as Rec).staffOps).toEqual({
        autoClockOutAtDayEnd: false,
        largeFoodEstablishment: true,
      });
    } finally {
      const restored = await settings({
        staffOps: { autoClockOutAtDayEnd: true, largeFoodEstablishment: false },
      });
      expect(restored.staffOps).toEqual({
        autoClockOutAtDayEnd: true,
        largeFoodEstablishment: false,
      });
    }
  });

  // ── W4:M8 the file, W3:M9 year-end figures ──────────────────────────────

  test("TC-1469: W4:M8 no overtime → the RestauNax file has no overtime-split columns; Gus's year-end figures; a year out of range 404", async () => {
    const approved = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`
    );
    expect(approved.status, JSON.stringify(approved.data)).toBe(200);

    const file = await payrollRaw<string>(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/export`,
      { format: "RESTAUNAX" }
    );
    expect(file.status, JSON.stringify(file.data)).toBe(200);
    const rows = csvLines(file.data);
    const header = rows[0] ?? "";
    expect(header).toContain("Gross paid");
    for (const col of [
      "flsaOvertimeHours",
      "stateOvertimeHours",
      "qualifiedOvertimePremium",
      "Federal (FLSA) overtime hours",
      "State-only overtime hours",
      "Qualified overtime premium",
    ])
      expect(header, col).not.toContain(col);
    // 8 h × $16.00, gross last.
    const gusRow = rows.find((l) => l.includes(",Hale,Gus,"));
    expect(gusRow, rows.join("\n")).toBeTruthy();
    expect(gusRow?.split(",").at(-1)).toBe("128.00");

    const year = new Date().getUTCFullYear();
    const r = await yearEnd(year);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const y = r.data.data as Rec;
    expect(y).toMatchObject({
      year,
      payHidden: false,
      flsaOvertimeMinutes: 0,
    });
    expect(Array.isArray(y.occupationCodes)).toBe(true);
    expect(looksLikeKey(y.note)).toBe(false);
    for (const f of [
      "wagesCents",
      "reportedTipsCents",
      "qualifiedTipsCents",
      "qualifiedOvertimePremiumCents",
    ])
      expect(y, f).toHaveProperty(f);
    // P1 counts in the year its period ends.
    if (addDays(p1, 6).startsWith(String(year))) {
      expect(y.periodsCounted).toBe(1);
      expect(y.wagesCents).toBe(12800);
    }

    for (const bad of [year - 6, year + 1, "abc"]) {
      const out = await yearEnd(bad);
      expect(out.status, `${bad}: ${JSON.stringify(out.data)}`).toBe(404);
    }
  });

  // ── W3:M9 termination and final pay ─────────────────────────────────────

  test("TC-1470: W3:M9 terminate validation — bad reason, bad or far date, unknown person", async () => {
    const reason = "Choose why the employment ended.";
    for (const body of [{}, { reason: "FIRED" }, { reason: 7 }]) {
      const r = await terminate(tess.staffMemberId, body);
      expect(
        r.status,
        `${JSON.stringify(body)}: ${JSON.stringify(r.data)}`
      ).toBe(400);
      expect(said(r)).toBe(reason);
    }
    const date = "Enter the last day worked (not more than 60 days ahead).";
    const today = localToday(ZONE);
    for (const lastDay of ["next week", addDays(today, 90)]) {
      const r = await terminate(tess.staffMemberId, {
        reason: "QUIT",
        lastDay,
      });
      expect(r.status, `${lastDay}: ${JSON.stringify(r.data)}`).toBe(400);
      expect(said(r)).toBe(date);
    }
    const unknown = await terminate(UNKNOWN_ID, { reason: "QUIT" });
    expect(unknown.status, JSON.stringify(unknown.data)).toBe(404);

    // Still employed after all the refusals.
    expect(
      (await finalPays()).filter((s) => s.staffMemberId === tess.staffMemberId)
    ).toEqual([]);
  });

  test("TC-1471: W3:M9 Tess quits — final-pay deadline and sentence, the list, Needs you FINAL_PAY, off-cycle refused, mark paid", async () => {
    const r = await terminate(tess.staffMemberId, {
      reason: "QUIT",
      note: "Moving to Orlando",
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const status = r.data.data as Rec;
    expect(status).toMatchObject({
      staffMemberId: tess.staffMemberId,
      reason: "QUIT",
      separationDate: localToday(ZONE),
    });
    expect(status.deadline?.basis).toBe("QUIT");
    expectFinalPayStatus(status, "Tess Quill");
    expect(looksLikeKey(r.data.message)).toBe(false);

    const owed = (await finalPays()).find(
      (s) => s.staffMemberId === tess.staffMemberId
    );
    expect(owed, "Tess is on the final-pays list").toBeTruthy();
    expectFinalPayStatus(owed as Rec, "Tess Quill");
    expect(owed?.deadline?.dueDate).toBe(status.deadline.dueDate);

    const one = await ownerStaffRaw<Rec>(
      ownerToken,
      restaurantId,
      "GET",
      `/${tess.staffMemberId}/final-pay`
    );
    expect(one.status, JSON.stringify(one.data)).toBe(200);
    expect(one.data.data).toMatchObject({
      staffMemberId: tess.staffMemberId,
      reason: "QUIT",
    });

    const item = (await needsYouItems()).find(
      (i) =>
        i.kind === "FINAL_PAY" &&
        String(i.action?.appRoute ?? "").includes(tess.staffMemberId)
    );
    expect(item, "Needs you has Tess's final pay").toBeTruthy();
    expect(["URGENT", "TODAY", "SOON"]).toContain(item?.severity);
    for (const f of ["title", "detail"])
      expect(looksLikeKey(item?.[f]), f).toBe(false);
    expect(String(item?.title)).toContain("Tess");
    const appRoute = String(item?.action?.appRoute ?? "");
    expect(appRoute).toContain(`/restaurant/${restaurantId}/staff`);
    expect(appRoute).toContain("tab=payday");
    expect(appRoute).toContain(`finalPay=${tess.staffMemberId}`);
    const q = new URLSearchParams(
      String(item?.action?.webPath ?? "").split("?")[1] ?? ""
    );
    expect(q.get("staffTab")).toBe("payday");
    expect(q.get("finalPay")).toBe(tess.staffMemberId);

    // Not on RestauNax Payroll (embedded Gusto): pay it through the provider.
    const offCycle = await ownerStaffRaw<Rec>(
      ownerToken,
      restaurantId,
      "POST",
      `/${tess.staffMemberId}/final-pay/off-cycle`
    );
    expect(offCycle.status, JSON.stringify(offCycle.data)).toBe(400);
    expect(said(offCycle)).toBe(
      "The off-cycle final payroll needs RestauNax Payroll. Pay the final check through your payroll provider."
    );

    const paid = await ownerStaffRaw<Rec>(
      ownerToken,
      restaurantId,
      "POST",
      `/${tess.staffMemberId}/final-pay/paid`
    );
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    expect(looksLikeKey(paid.data.message)).toBe(false);
    expect(
      (await finalPays()).filter((s) => s.staffMemberId === tess.staffMemberId)
    ).toEqual([]);
    expect(
      (await needsYouItems()).filter(
        (i) =>
          i.kind === "FINAL_PAY" &&
          String(i.action?.appRoute ?? "").includes(tess.staffMemberId)
      )
    ).toEqual([]);
  });

  test("TC-1472: W3:M9 Gus is discharged — a former employee keeps year-end figures; shift edits are gone", async () => {
    const r = await terminate(gus.staffMemberId, {
      reason: "DISCHARGED",
      lastDay: localToday(ZONE),
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.data).toMatchObject({
      staffMemberId: gus.staffMemberId,
      reason: "DISCHARGED",
    });
    expect(r.data.data.deadline?.basis).toBe("FIRED");
    expectFinalPayStatus(r.data.data as Rec, "Gus Hale");

    const mine = await me();
    expect(
      list(mine.restaurants).filter((x) => x.restaurantId === restaurantId)
    ).toEqual([]);
    const former = list(mine.formerRestaurants).find(
      (x) => x.restaurantId === restaurantId
    );
    expect(former, JSON.stringify(mine.formerRestaurants)).toBeTruthy();
    expect(former).toMatchObject({
      restaurantId,
      staffMemberId: gus.staffMemberId,
      yearEnd: true,
    });
    expect(typeof former?.payStubs).toBe("boolean");
    expect(typeof former?.restaurantName).toBe("string");
    expect(String(former?.leftAt)).toMatch(ISO_RE);
    expect(String(former?.accessUntil)).toMatch(ISO_RE);

    const year = new Date().getUTCFullYear();
    const y = await yearEnd(year);
    expect(y.status, JSON.stringify(y.data)).toBe(200);
    expect(y.data.data).toMatchObject({ year });

    // Former staff see only stubs and year-end: no schedule, no edits.
    const edits = await shiftEdits();
    expect(edits.status, JSON.stringify(edits.data)).toBe(404);
  });
});
