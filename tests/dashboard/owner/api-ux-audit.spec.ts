/**
 * api-ux-audit.spec.ts — the UX-audit fixes (restaunax #913) on QA
 * (TC-651..666).
 *
 * No browser. A per-run throwaway restaurant with SCHEDULING (Miami), a
 * REGISTER device, the owner signed in on it, and:
 *   Pat — Staff role, created on the POS (PIN, no account);
 *   Kim — Staff role, created on the POS (the cashier for the drawer test);
 *   Ola — invited by email in Spanish, claims an account (no PIN);
 *   Pia — invited by email, PIN set by the owner (active, no account);
 *   Rex — already has a RestauNax account when invited.
 * Covers: the "Get started" checklist ticking from real data; clock-in
 * approval by a signed-in manager's session; time-clock hasPin / jobName;
 * the POS schedule for another day (read-only); tracksTime from the POS;
 * hasAccount; default discount/comp/void reasons (EN/ES, saved lists,
 * saved-empty, tablet); the account language; the Spanish invite; an
 * existing account claiming its invite after signing in; the account
 * invite for an active person without one; payroll-settings location; the
 * add-ons page sources; and the drawer owner when a manager approves.
 * Serial. Needs Mailpit.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, recordUserForCleanup } from "../../../utils/testData";
import { waitForEmail, extractInviteToken } from "../../../utils/emailHelper";
import {
  apiLogin,
  register,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  registerWithInvite,
  inviteStaffRaw,
  createStaffJobRaw,
  setMemberJobsRaw,
  createShiftRaw,
  publishScheduleRaw,
  putPayrollSettingsRaw,
  payrollRaw,
  schedulingRaw,
  staffAppRaw,
  ownerStaffRaw,
  ownerAddonsRaw,
  usersRaw,
  getRestaurantSettingsRaw,
  updateRestaurantSettingsRaw,
  claimStaffInviteSignedInRaw,
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
const TZ = "America/New_York";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const localDay = (offset: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(Date.now() + offset * 86_400_000)
  );

test.describe.configure({ mode: "serial" });

test.describe("UX-audit fixes (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );
  test.skip(
    !MAILPIT,
    "Requires Mailpit (MAILPIT_BASE_URL): invites travel by email"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let restaurantName = "";
  let deviceId = "";
  let tabletToken = "";
  const owner = { id: "", pin: "8462", session: "" };
  const pat = { id: "", pin: "3816", session: "" };
  const kim = { id: "", pin: "5207", session: "" };
  const ola = { id: "", email: "", token: "" };
  const pia = { id: "", email: "" };
  const rex = { id: "", email: "", password: "" };
  let jobId = "";
  const jobName = `Server ${runId}`;

  const posStaff = async (first: string, pin: string) => {
    const r = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/staff/manage",
      { firstName: first, lastName: "Ux", pin },
      owner.session
    );
    if (r.status !== 201)
      throw new Error(`[ux-audit] staff: ${JSON.stringify(r.data)}`);
    return String(r.data.data.id);
  };
  const staffRow = async (id: string) => {
    const r = await ownerStaffRaw(ownerToken, restaurantId, "GET");
    return list(r.data.data).find((s) => s.id === id) as Rec;
  };
  const gettingStarted = async () => {
    const r = await schedulingRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/getting-started"
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[ux-audit] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    restaurantName = `Automation Owner2 Store ${runId}`;
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SCHEDULING",
      true
    );
    if (!g.ok) throw new Error(`[ux-audit] grant: ${JSON.stringify(g.data)}`);
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-ux-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
    owner.id = await setOwnerPosPin(ownerToken, restaurantId, owner.pin);
    owner.session = await tabletStaffSignIn(tabletToken, owner.id, owner.pin);
    pat.id = await posStaff("Pat", pat.pin);
    kim.id = await posStaff("Kim", kim.pin);
    pat.session = await tabletStaffSignIn(tabletToken, pat.id, pat.pin);
    kim.session = await tabletStaffSignIn(tabletToken, kim.id, kim.pin);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "UX audit fixes");
    await allure.label("severity", "critical");
  });

  test('TC-651: the "Get started" checklist ticks itself from the restaurant\'s data', async () => {
    let gs = await gettingStarted();
    expect(gs.steps).toEqual({
      jobs: false,
      assignJobs: false,
      settings: false,
      publish: false,
      approve: false,
    });
    // Everyone on the time clock (owner, Pat, Kim) has no job yet.
    expect(gs.peopleWithoutJob).toBe(3);

    const job = await createStaffJobRaw(ownerToken, restaurantId, {
      name: jobName,
      defaultHourlyRateCents: 1500,
    });
    jobId = String(job.data.data?.id);
    gs = await gettingStarted();
    expect(gs.steps).toMatchObject({ jobs: true, assignJobs: false });
    for (const id of [owner.id, pat.id, kim.id])
      await setMemberJobsRaw(ownerToken, restaurantId, id, [
        { jobId, isPrimary: true },
      ]);
    gs = await gettingStarted();
    expect(gs).toMatchObject({
      peopleWithoutJob: 0,
      steps: { assignJobs: true },
    });

    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      workweekStartDay: 0,
    });
    const day = localDay(5);
    await createShiftRaw(ownerToken, restaurantId, {
      staffMemberId: pat.id,
      jobId,
      startAt: `${day}T18:00:00.000Z`,
      endAt: `${day}T22:00:00.000Z`,
    });
    await publishScheduleRaw(ownerToken, restaurantId, day, "NONE");
    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=3"
    );
    const finished = list(periods.data.data?.periods).find(
      (p) => p.status === "OPEN"
    );
    const ok = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${finished?.startDate}/approve`
    );
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    gs = await gettingStarted();
    expect(gs.steps).toEqual({
      jobs: true,
      assignJobs: true,
      settings: true,
      publish: true,
      approve: true,
    });
  });

  test("TC-652: a signed-in manager approves an early/unscheduled clock-in with their session; a Staff session can't", async () => {
    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      scheduling: { clockInRule: "BLOCK" },
    });
    try {
      const body = {
        staffMemberId: pat.id,
        pin: pat.pin,
        supportsClockInRules: true,
        approveWithStaffSession: true,
      };
      const refused = await tabletRaw<Rec>(
        tabletToken,
        "POST",
        "/staff/clock-in",
        body,
        kim.session
      );
      expect(refused.status, "Kim lacks APPROVE_CLOCK_IN").toBe(409);
      const approved = await tabletRaw<Rec>(
        tabletToken,
        "POST",
        "/staff/clock-in",
        body,
        owner.session
      );
      expect(approved.status, JSON.stringify(approved.data)).toBe(200);
      expect(approved.data.data.shift).toMatchObject({
        clockInException: "UNSCHEDULED",
        clockInApprovedByStaffMemberId: owner.id,
      });
    } finally {
      await putPayrollSettingsRaw(ownerToken, restaurantId, {
        scheduling: { clockInRule: "OFF" },
      });
    }
  });

  test("TC-653: the time clock says who has a PIN and what job each person is on the clock as", async () => {
    // Ola: invited in Spanish, claims an account, never sets a PIN.
    ola.email = `auto-ux-ola-${runId}@${DOMAIN}`;
    recordUserForCleanup(ola.email);
    const inv = await inviteStaffRaw(ownerToken, restaurantId, {
      email: ola.email,
      firstName: "Ola",
      lastName: "Ux",
      language: "es",
    });
    expect(inv.status, JSON.stringify(inv.data)).toBe(201);
    ola.id = String(inv.data.data?.staffMemberId);
    const mail = await waitForEmail(ola.email, {
      subjectPattern: /equipo de/i,
      timeoutMs: 90_000,
    });
    ola.token = (
      await registerWithInvite({
        firstName: "Ola",
        lastName: "Ux",
        email: ola.email,
        password: `Automation!Staff-${runId}`,
        userInvitationToken: extractInviteToken(
          mail.text_body || mail.html_body
        ),
      })
    ).accessToken;

    const clock = await tabletRaw<Rec>(tabletToken, "GET", "/staff/time-clock");
    expect(clock.status).toBe(200);
    const by = new Map(list(clock.data.data).map((s) => [s.id, s]));
    expect(by.get(ola.id)?.hasPin).toBe(false);
    expect(by.get(pat.id)?.hasPin).toBe(true);
    // Pat is on the clock (TC-652) as his job.
    expect(by.get(pat.id)?.activeShift).toMatchObject({ jobName });
    const out = await tabletRaw(tabletToken, "POST", "/staff/clock-out", {
      staffMemberId: pat.id,
      pin: pat.pin,
    });
    expect(out.status).toBe(200);
  });

  test("TC-654: the Spanish invite — subject and body in Spanish, 7-day expiry, language kept on the person", async () => {
    const mail = await waitForEmail(ola.email, {
      subjectPattern: /equipo de/i,
      timeoutMs: 30_000,
    });
    expect(mail.subject).toBe(`Te agregaron al equipo de ${restaurantName}`);
    const body = mail.text_body || mail.html_body;
    expect(body).toMatch(/7 días/);
    expect(body).toMatch(/Aceptar invitación|Configura tu cuenta/);
    expect((await staffRow(ola.id))?.locale).toBe("es");
  });

  test("TC-655: the POS schedule for another day is read-only", async () => {
    const today = await tabletRaw<Rec>(
      tabletToken,
      "GET",
      "/schedule/today",
      undefined,
      owner.session
    );
    expect(today.status, JSON.stringify(today.data)).toBe(200);
    expect(today.data.data.canManage).toBe(true);
    expect(today.data.data.readOnly ?? false).toBe(false);
    const later = await tabletRaw<Rec>(
      tabletToken,
      "GET",
      `/schedule/today?date=${localDay(5)}`,
      undefined,
      owner.session
    );
    expect(later.status, JSON.stringify(later.data)).toBe(200);
    expect(later.data.data).toMatchObject({ readOnly: true, canManage: false });
    expect(JSON.stringify(later.data.data)).toContain(pat.id);
    const bad = await tabletRaw(
      tabletToken,
      "GET",
      "/schedule/today?date=next-week",
      undefined,
      owner.session
    );
    expect(bad.status).toBe(400);
  });

  test('TC-656: "Clocks in" from the POS; hasAccount on the staff list', async () => {
    const off = await tabletRaw(
      tabletToken,
      "PATCH",
      `/staff/manage/${kim.id}`,
      { tracksTime: false },
      owner.session
    );
    expect(off.status, JSON.stringify(off.data)).toBe(200);
    expect((await staffRow(kim.id))?.tracksTime).toBe(false);
    const clock = await tabletRaw<Rec>(tabletToken, "GET", "/staff/time-clock");
    expect(list(clock.data.data).find((s) => s.id === kim.id)?.tracksTime).toBe(
      false
    );
    // A non-boolean is ignored, not saved.
    await tabletRaw(
      tabletToken,
      "PATCH",
      `/staff/manage/${kim.id}`,
      { tracksTime: "yes" },
      owner.session
    );
    expect((await staffRow(kim.id))?.tracksTime).toBe(false);
    await tabletRaw(
      tabletToken,
      "PATCH",
      `/staff/manage/${kim.id}`,
      { tracksTime: true },
      owner.session
    );

    expect((await staffRow(ola.id))?.hasAccount).toBe(true);
    expect((await staffRow(pat.id))?.hasAccount).toBe(false);
  });

  test("TC-657: default discount / comp / void reasons — EN and ES text, a saved list wins, a saved empty list stays empty", async () => {
    const read = async (lang: string) => {
      const r = await getRestaurantSettingsRaw(ownerToken, restaurantId, {
        "Accept-Language": lang,
      });
      expect(r.status).toBe(200);
      return r.data as Rec;
    };
    let en = await read("en");
    expect(en.posApprovalPolicy.reasons.discount).toMatchObject({
      usesDefaults: true,
    });
    expect(en.posApprovalPolicy.reasons.discount.options).toContain(
      "Employee meal"
    );
    expect(en.posReasonDefaults.void).toContain("Entered by mistake");
    const es = await read("es");
    expect(es.posApprovalPolicy.reasons.discount.options).toContain(
      "Comida de empleado"
    );

    const saved = await updateRestaurantSettingsRaw(ownerToken, restaurantId, {
      posApprovalPolicy: {
        staffDiscountAllowancePercent: 0,
        customItems: "ANYONE",
        reasons: {
          discount: { required: false, options: [`House rule ${runId}`] },
          comp: { required: false, options: [], usesDefaults: false },
          void: { required: false, options: [], usesDefaults: true },
        },
      },
    });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    en = await read("en");
    expect(en.posApprovalPolicy.reasons.discount).toMatchObject({
      usesDefaults: false,
      options: [`House rule ${runId}`],
    });
    expect(en.posApprovalPolicy.reasons.comp).toMatchObject({
      usesDefaults: false,
      options: [],
    });
    expect(en.posApprovalPolicy.reasons.void.usesDefaults).toBe(true);

    // The POS gets the same, in its language.
    const tablet = await tabletRaw<Rec>(
      tabletToken,
      "GET",
      "/settings",
      undefined,
      undefined,
      { "Accept-Language": "es" }
    );
    expect(tablet.status).toBe(200);
    const reasons = (tablet.data.data ?? tablet.data).posApprovalPolicy.reasons;
    expect(reasons.void).toMatchObject({ usesDefaults: true });
    expect(reasons.void.options).toContain("Ingresado por error");
    expect(reasons.discount.options).toEqual([`House rule ${runId}`]);
    expect(reasons.comp.options).toEqual([]);
  });

  test("TC-658: the account language is saved", async () => {
    const set = await usersRaw(ola.token, "PATCH", "/me/locale", {
      locale: "es",
    });
    expect(set.status, JSON.stringify(set.data)).toBe(200);
    const me = await usersRaw<Rec>(ola.token, "GET", "/me");
    expect(JSON.stringify(me.data)).toContain('"locale":"es"');
    const bad = await usersRaw(ola.token, "PATCH", "/me/locale", {
      locale: "fr",
    });
    expect(bad.status).toBe(400);
    await usersRaw(ola.token, "PATCH", "/me/locale", { locale: "en" });
  });

  test("TC-659: an existing account accepts its invite after signing in", async () => {
    rex.email = `auto-ux-rex-${runId}@${DOMAIN}`;
    rex.password = `Automation!Rex-${runId}`;
    recordUserForCleanup(rex.email);
    await register({
      firstName: "Rex",
      lastName: "Ux",
      email: rex.email,
      password: rex.password,
    });
    const inv = await inviteStaffRaw(ownerToken, restaurantId, {
      email: rex.email,
      firstName: "Rex",
      lastName: "Ux",
    });
    expect(inv.status).toBe(201);
    rex.id = String(inv.data.data?.staffMemberId);
    const mail = await waitForEmail(rex.email, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    const token = extractInviteToken(mail.text_body || mail.html_body);
    const login = await apiLogin(rex.email, rex.password);
    const claimed = await claimStaffInviteSignedInRaw(login.accessToken, token);
    expect(claimed.status, JSON.stringify(claimed.data)).toBe(200);
    const fresh = await apiLogin(rex.email, rex.password);
    const me = await staffAppRaw<{ data: Rec }>(
      fresh.accessToken,
      "GET",
      "/me"
    );
    expect(list(me.data.data.restaurants)).toEqual([
      expect.objectContaining({
        restaurantId,
        staffMemberId: rex.id,
        staffAppEnabled: true,
      }),
    ]);
    expect(me.data.data.staffWithoutAppSections).toEqual([]);
    expect(me.data.data).toHaveProperty("app");
    expect((await staffRow(rex.id))?.hasAccount).toBe(true);
  });

  test("TC-660: an active person without an account gets an account invite", async () => {
    pia.email = `auto-ux-pia-${runId}@${DOMAIN}`;
    recordUserForCleanup(pia.email);
    const inv = await inviteStaffRaw(ownerToken, restaurantId, {
      email: pia.email,
      firstName: "Pia",
      lastName: "Ux",
    });
    pia.id = String(inv.data.data?.staffMemberId);
    await waitForEmail(pia.email, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    const pin = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/${pia.id}/pin`,
      {
        pin: "6491",
      }
    );
    expect(pin.status).toBe(200);
    expect(await staffRow(pia.id)).toMatchObject({
      status: "active",
      hasAccount: false,
    });

    const sent = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/${pia.id}/resend-invite`
    );
    expect(sent.status, JSON.stringify(sent.data)).toBe(200);
    const mail = await waitForEmail(pia.email, {
      subjectPattern: /^Reminder: finish setting up your/,
      timeoutMs: 90_000,
    });
    expect(mail.subject).toContain(restaurantName);
    expect(extractInviteToken(mail.text_body || mail.html_body)).toBeTruthy();
  });

  test("TC-661: payroll settings say where the restaurant is and which overtime preset fits", async () => {
    const r = await payrollRaw(ownerToken, restaurantId, "GET", "/settings");
    expect(r.status).toBe(200);
    expect(r.data.data.location).toEqual({
      state: "FL",
      recommendedPreset: "FEDERAL",
    });
    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      overtime: { preset: "CALIFORNIA" },
    });
    const after = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/settings"
    );
    // The screen warns on this mismatch: chosen ≠ recommended.
    expect(after.data.data.settings.overtime.preset).toBe("CALIFORNIA");
    expect(after.data.data.location.recommendedPreset).toBe("FEDERAL");
    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      overtime: { preset: "FEDERAL" },
    });
  });

  test("TC-662: the add-ons page says where each feature comes from", async () => {
    const rows = async () => {
      const r = await ownerAddonsRaw(ownerToken, restaurantId, "GET");
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      return new Map(list(r.data.data?.features).map((f) => [f.feature, f]));
    };
    let by = await rows();
    expect(by.get("SCHEDULING")).toMatchObject({ source: "RESTAUNAX" });
    expect(by.get("PAYROLL")?.source ?? null).toBeNull();
    const tips = by.get("TIP_MANAGEMENT");
    expect(tips?.source ?? null).toBeNull();
    // Either it can be added, or the owner is told to talk to us — never neither.
    expect(Boolean(tips?.canAdd) || Boolean(tips?.contactUs)).toBe(true);

    await setFeatureOverrideAdminRaw(adminToken, restaurantId, "PAYROLL", true);
    try {
      by = await rows();
      expect(by.get("TIP_MANAGEMENT")).toMatchObject({
        source: "INCLUDED_WITH",
        includedWith: "PAYROLL",
        canAdd: false,
      });
    } finally {
      await deleteFeatureOverrideAdminRaw(adminToken, restaurantId, "PAYROLL");
    }
  });

  test("TC-663: a manager-approved drawer belongs to the cashier who opened it", async () => {
    const opened = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/register/open",
      {
        openingFloat: 100,
        managerPin: owner.pin,
        approverStaffMemberId: owner.id,
      },
      kim.session
    );
    expect(opened.status, JSON.stringify(opened.data)).toBe(201);
    expect(opened.data.data.session.assignedStaffMember.id).toBe(kim.id);
  });
});
