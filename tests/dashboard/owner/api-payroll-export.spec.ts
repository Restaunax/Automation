/**
 * api-payroll-export.spec.ts — the payroll export file (P3) on QA, every
 * format, totals equal to the approved period (TC-597..603).
 *
 * No browser. A per-run throwaway restaurant with PAYROLL, weekly pay periods,
 * and last week's (finished) period P1 filled by manager entry:
 *   Hal — Barista $15.00: Mon–Fri 8 h + Sat 4 h = 44 h → 40 × $15 + 4 × $22.50
 *         = $690.00 (straight $660.00 + premium $30.00); declared cash $12.34.
 *   Ivy — Host $16.00: two 4 h shifts = 8 h → $128.00; no payroll ID.
 *         (W3:C3: Miami's $15.00 minimum refuses the old $14.00 rate.)
 * Approve P1 → preview warnings per format → set the IDs/codes → the files,
 * row by row; the export marks the period EXPORTED; a re-export after a raise
 * is byte-identical (the snapshot, not today's rates); an unapproved period
 * can't be exported; the staff app shows the approved wages.
 * W3:C1 (TC-1263): a two-rate week in P2 — Lead $20 then Barista $15, the
 * overtime on Barista — puts the premium on the full regular rate that the
 * provider's 1.5 × $15 leaves out on an "overtime premium adjustment"
 * earning in every format, and Gusto gets one row per job.
 * W3:H7 (TC-1364..1366): mark-paid refuses a period that isn't approved (P1,
 * reopened in TC-603); P2 (exported) marked paid stays PAID through a
 * re-export and the file is unchanged; a shift added to paid P2 for Ivy
 * (4 h × $16 = $64.00) is carried by the next open period — P1 — and P1's
 * files get the prior-period adjustment column, only then. The tenant is
 * this file's own (deleted in afterAll), so PAID — which can't be reopened —
 * never outlives the run.
 *
 * Restaurant is in Miami (America/New_York). Serial. Needs Mailpit (Hal claims
 * his invite so the staff-app check is real).
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
  tipsRaw,
  staffAppRaw,
  ownerStaffRaw,
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
const usDate = (d: string) =>
  `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;
/** CSV body → lines (BOM and trailing newline dropped). */
const lines = (body: unknown) =>
  String(body)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.length > 0);

test.describe.configure({ mode: "serial" });

test.describe("Payroll export — every format from the approved period (API)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  const hal = { id: "", token: "", email: "" };
  const ivy = { id: "" };
  let barista = "";
  let host = "";
  let baristaName = "";
  let hostName = "";
  let p1 = "";
  let p2 = "";
  let restaunaxFile = "";
  /** P2's RestauNax file as exported in TC-1263 (lines). */
  let p2Restaunax: string[] = [];

  const preview = async (format: string) => {
    const r = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/pay-periods/${p1}/export/preview?format=${format}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };
  const file = async (format: string, start = p1) =>
    payrollRaw<string>(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${start}/export`,
      { format }
    );
  /** A file that must download: 200 and CSV text, else show what came. */
  const csvOf = async (format: string) => {
    const r = await file(format);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(typeof r.data, JSON.stringify(r.data)).toBe("string");
    return lines(r.data);
  };
  const codes = (w: Rec) =>
    list(w.warnings)
      .map((x) => String(x.code))
      .sort();

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    // Fail, never skip, without the environment (W5:T7).
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
      throw new Error(
        "[api-payroll-export] ADMIN_EMAIL / ADMIN_PASSWORD not set"
      );
    if (!MAILPIT)
      throw new Error(
        "[api-payroll-export] MAILPIT_BASE_URL not set: the invite token travels by email"
      );
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-payroll-export] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "PAYROLL",
      true
    );
    if (!g.ok)
      throw new Error(`[api-payroll-export] grant: ${JSON.stringify(g.data)}`);
    await putPayrollSettingsRaw(ownerToken, restaurantId, {
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      workweekStartDay: 0,
    });

    hal.email = `auto-export-hal-${runId}@${DOMAIN}`;
    recordUserForCleanup(hal.email);
    hal.id = String(
      (
        await inviteStaffRaw(ownerToken, restaurantId, {
          email: hal.email,
          firstName: "Hal",
          lastName: "Avery",
        })
      ).data.data?.staffMemberId
    );
    const mail = await waitForEmail(hal.email, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    hal.token = (
      await registerWithInvite({
        firstName: "Hal",
        lastName: "Avery",
        email: hal.email,
        password: `Automation!Staff-${runId}`,
        userInvitationToken: extractInviteToken(
          mail.text_body || mail.html_body
        ),
      })
    ).accessToken;
    ivy.id = String(
      (
        await inviteStaffRaw(ownerToken, restaurantId, {
          email: `auto-export-ivy-${runId}@${DOMAIN}`,
          firstName: "Ivy",
          lastName: "Zane",
        })
      ).data.data?.staffMemberId
    );

    baristaName = `Barista ${runId}`;
    hostName = `Host ${runId}`;
    barista = String(
      (
        await createStaffJobRaw(ownerToken, restaurantId, {
          name: baristaName,
          defaultHourlyRateCents: 1500,
          isTipped: true,
        })
      ).data.data?.id
    );
    host = String(
      (
        await createStaffJobRaw(ownerToken, restaurantId, {
          name: hostName,
          defaultHourlyRateCents: 1600,
        })
      ).data.data?.id
    );
    await setMemberJobsRaw(ownerToken, restaurantId, hal.id, [
      { jobId: barista, isPrimary: true },
    ]);
    await setMemberJobsRaw(ownerToken, restaurantId, ivy.id, [
      { jobId: host, isPrimary: true },
    ]);

    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=4"
    );
    const finished = list(periods.data.data?.periods)
      .filter((p) => p.status === "OPEN")
      .map((p) => String(p.startDate))
      .sort()
      .reverse();
    p1 = finished[0] ?? "";
    p2 = finished[1] ?? "";
    if (!p1 || !p2) throw new Error("[api-payroll-export] no finished periods");

    const enter = async (
      id: string,
      date: string,
      from: string,
      to: string,
      jobId: string
    ) => {
      const r = await payrollRaw(ownerToken, restaurantId, "POST", "/shifts", {
        staffMemberId: id,
        clockInAt: at(date, from),
        clockOutAt: at(date, to),
        jobId,
        reason: "Paper timesheet",
      });
      if (r.status !== 201)
        throw new Error(
          `[api-payroll-export] shift: ${JSON.stringify(r.data)}`
        );
    };
    // 13:00Z = 09:00 in Miami.
    for (let i = 1; i <= 5; i++)
      await enter(hal.id, addDays(p1, i), "13:00", "21:00", barista);
    await enter(hal.id, addDays(p1, 6), "13:00", "17:00", barista);
    await enter(ivy.id, addDays(p1, 2), "14:00", "18:00", host);
    await enter(ivy.id, addDays(p1, 4), "14:00", "18:00", host);
    const declared = await tipsRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/declarations",
      {
        staffMemberId: hal.id,
        businessDate: addDays(p1, 1),
        amountCents: 1234,
      }
    );
    if (declared.status !== 201)
      throw new Error(
        `[api-payroll-export] declare: ${JSON.stringify(declared.data)}`
      );
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Payroll export");
    await allure.label("severity", "critical");
  });

  test("TC-597: only an approved period exports; approval freezes $690.00 + $128.00", async () => {
    const early = await file("RESTAUNAX");
    expect(early.status, "not approved yet").toBe(400);

    const cards = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/timecards?startDate=${p1}&endDate=${addDays(p1, 6)}`
    );
    const by = new Map(
      list(cards.data.data.employees).map((e) => [e.staffMemberId, e])
    );
    expect(by.get(hal.id)).toMatchObject({
      regularMinutes: 2400,
      overtimeMinutes: 240,
      straightTimeCents: 66000,
      overtimePremiumCents: 3000,
      totalCents: 69000,
    });
    expect(by.get(ivy.id)).toMatchObject({
      regularMinutes: 480,
      totalCents: 12800,
      // W3:C3: both paid at least the $15.00 minimum — nothing to top up.
      minimumWageTopUpCents: 0,
    });
    expect(by.get(hal.id)?.minimumWageTopUpCents).toBe(0);
    expect(cards.data.data.totals.totalCents).toBe(81800);

    const ok = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`
    );
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    // Declared cash can't land in a locked period.
    const late = await tipsRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/declarations",
      {
        staffMemberId: ivy.id,
        businessDate: addDays(p1, 2),
        amountCents: 500,
      }
    );
    expect(late.status).toBe(403);
  });

  test("TC-598: preview warns what each format is missing, and records nothing", async () => {
    const rx = await preview("RESTAUNAX");
    expect(rx).toMatchObject({ format: "RESTAUNAX", rowCount: 2 });
    expect(codes(rx)).toEqual(["MISSING_PAYROLL_ID", "MISSING_PAYROLL_ID"]);
    for (const w of list(rx.warnings))
      expect(String(w.message)).not.toMatch(/^api:/);

    const adp = await preview("ADP_RUN");
    expect(codes(adp)).toEqual(
      [
        "MISSING_COMPANY_CODE",
        "MISSING_EARNING_CODE",
        "MISSING_EARNING_CODE",
        "MISSING_EARNING_CODE",
        "MISSING_PAYROLL_ID",
        "MISSING_PAYROLL_ID",
      ].sort()
    );
    const paychex = await preview("PAYCHEX");
    expect(codes(paychex)).toContain("MISSING_CLIENT_ID");

    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=4"
    );
    expect(
      list(periods.data.data.periods).find((p) => p.startDate === p1)?.status
    ).toBe("APPROVED");

    // Fill Hal's payroll ID, the job code and the provider codes.
    await ownerStaffRaw(ownerToken, restaurantId, "PATCH", `/${hal.id}`, {
      payrollEmployeeId: "E-100",
    });
    await payrollRaw(ownerToken, restaurantId, "PATCH", `/jobs/${barista}`, {
      payrollCode: "BAR",
    });
    const earnings = {
      regular: "REG",
      overtime: "OT",
      doubleTime: "DT",
      tipsPaid: "TIPS",
      tipsReported: "CTIPS",
    };
    const saved = await putPayrollSettingsRaw(ownerToken, restaurantId, {
      export: {
        defaultFormat: "ADP_RUN",
        adp: { companyCode: "ABC", earningCodes: earnings },
        paychex: { clientId: "9876", payComponents: earnings },
      },
    });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    expect(codes(await preview("ADP_RUN"))).toEqual(["MISSING_PAYROLL_ID"]);
    expect(codes(await preview("PAYCHEX"))).toEqual(["MISSING_PAYROLL_ID"]);
  });

  test("TC-599: the RestauNax file — one row per person per job, totals = the approval", async () => {
    const r = await file("RESTAUNAX");
    expect(r.status, String(r.data)).toBe(200);
    restaunaxFile = String(r.data);
    const rows = lines(r.data);
    expect(rows).toHaveLength(3);
    // periodStart, periodEnd, payrollId, last, first, job, jobCode, rate,
    // reg h, OT h, DT h, straight, premium, wages, tipsPaid, fromDrawer,
    // declared, serviceCharges, minimumWageTopUp, grossPaid — sorted by
    // last name.
    expect(rows[1]).toBe(
      `${p1},${addDays(p1, 6)},E-100,Avery,Hal,${baristaName},BAR,15.00,40.00,4.00,0.00,660.00,30.00,690.00,0.00,0.00,12.34,0.00,0.00,690.00`
    );
    expect(rows[2]).toBe(
      `${p1},${addDays(p1, 6)},,Zane,Ivy,${hostName},,16.00,8.00,0.00,0.00,128.00,0.00,128.00,0.00,0.00,0.00,0.00,0.00,128.00`
    );
    const wages = rows
      .slice(1)
      .reduce((s, l) => s + Math.round(Number(l.split(",")[13]) * 100), 0);
    expect(wages).toBe(81800);

    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=4"
    );
    expect(
      list(periods.data.data.periods).find((p) => p.startDate === p1)?.status
    ).toBe("EXPORTED");
  });

  test("TC-600: Gusto, ADP RUN and Paychex files carry the same hours and money", async () => {
    const gusto = await csvOf("GUSTO");
    expect(gusto[0]).toBe(
      "Last_name,First_name,Gusto_employee_id,Title,Regular_hours,Overtime_hours,Double_overtime_hours,paycheck_tips,cash_tips,service_charges,overtime_premium_adjustment,minimum_wage_top_up"
    );
    // One job, one rate, no tip credit: Gusto's own 1.5 × $15 is the
    // engine's premium, so no adjustment.
    expect(gusto).toContain(
      `Avery,Hal,E-100,${baristaName},40.00,4.00,0.00,0.00,12.34,0.00,0.00,0.00`
    );
    expect(gusto).toContain(
      `Zane,Ivy,,${hostName},8.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00`
    );

    const adp = await csvOf("ADP_RUN");
    const dates = `W,${usDate(p1)},${usDate(addDays(p1, 6))}`;
    expect(adp).toEqual(
      expect.arrayContaining([
        `ABC,${dates},E-100,REG,40.00,,BAR`,
        `ABC,${dates},E-100,OT,4.00,,BAR`,
        `ABC,${dates},E-100,CTIPS,,12.34,BAR`,
        `ABC,${dates},,REG,8.00,,`,
      ])
    );
    expect(adp).toHaveLength(5);

    const paychex = await csvOf("PAYCHEX");
    expect(paychex[0]).toBe(
      "Client ID,Worker ID,Job Number,Pay Component,Rate,Hours,Amount"
    );
    expect(paychex).toEqual(
      expect.arrayContaining([
        "9876,E-100,BAR,REG,15.00,40.00,",
        "9876,E-100,BAR,OT,15.00,4.00,",
        "9876,E-100,BAR,CTIPS,,,12.34",
        "9876,,,REG,16.00,8.00,",
      ])
    );
  });

  test("TC-601: a re-export after a raise is the same file (built from the approval)", async () => {
    await payrollRaw(ownerToken, restaurantId, "PATCH", `/jobs/${barista}`, {
      defaultHourlyRateCents: 1700,
    });
    const again = await file("RESTAUNAX");
    expect(String(again.data)).toBe(restaunaxFile);
  });

  test("TC-602: the staff app shows Hal the approved wages and hours", async () => {
    const r = await staffAppRaw<{ data: Rec }>(
      hal.token,
      "GET",
      `/restaurants/${restaurantId}/pay-periods/${p1}`
    );
    expect(r.status).toBe(200);
    expect(r.data.data).toMatchObject({
      approved: true,
      status: "EXPORTED",
      regularMinutes: 2400,
      overtimeMinutes: 240,
      wagesCents: 69000,
    });
    expect(list(r.data.data.shifts)).toHaveLength(6);
    expect(list(r.data.data.jobs)[0]).toMatchObject({
      rateCents: 1500,
      wagesCents: 69000,
      // #913: the overtime rate the approved premium paid ($15 + ½ × $15).
      overtimeRateCents: 2250,
      doubleTimeRateCents: null,
    });
  });

  test("TC-603: an unapproved period can't be exported; reopening an exported period is allowed with a reason", async () => {
    expect((await file("GUSTO", p2)).status).toBe(400);
    const reopened = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/reopen`,
      { reason: "Ivy's Thursday was wrong" }
    );
    expect(reopened.status, JSON.stringify(reopened.data)).toBe(200);
    expect((await file("RESTAUNAX")).status, "reopened = not exportable").toBe(
      400
    );
  });

  test("TC-1263: W3:C1 a two-rate week — the premium the provider's 1.5× leaves out rides on its own earning, every format", async () => {
    // P2: Hal is Lead at $20 Mon–Tue (7.5 h each), then Barista at $15
    // Wed–Fri (10 h each) = 45 h; the 5 overtime hours are the last ones,
    // on Barista. Regular rate (300 + 450) / 45 = $16.667 → premium
    // 0.5 × 16.667 × 5 = $41.67; the provider's 1.5 × $15 pays $37.50 of it
    // → a $4.17 overtime premium adjustment. Total $750.00 + $41.67.
    const lead = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Lead ${runId}`,
      defaultHourlyRateCents: 2000,
    });
    expect(lead.status, JSON.stringify(lead.data)).toBe(201);
    const leadId = String(lead.data.data?.id);
    await payrollRaw(ownerToken, restaurantId, "PATCH", `/jobs/${leadId}`, {
      payrollCode: "LEAD",
    });
    await setMemberJobsRaw(ownerToken, restaurantId, hal.id, [
      { jobId: barista, isPrimary: true, hourlyRateCents: 1500 },
      { jobId: leadId },
    ]);
    const enter = async (
      date: string,
      from: string,
      to: string,
      jobId: string
    ) => {
      const r = await payrollRaw(ownerToken, restaurantId, "POST", "/shifts", {
        staffMemberId: hal.id,
        clockInAt: at(date, from),
        clockOutAt: at(date, to),
        jobId,
        reason: "Paper timesheet",
      });
      expect(r.status, JSON.stringify(r.data)).toBe(201);
    };
    await enter(addDays(p2, 1), "13:00", "20:30", leadId);
    await enter(addDays(p2, 2), "13:00", "20:30", leadId);
    for (const d of [3, 4, 5])
      await enter(addDays(p2, d), "12:00", "22:00", barista);

    const cards = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/timecards?startDate=${p2}&endDate=${addDays(p2, 6)}`
    );
    const halCard = list(cards.data.data.employees).find(
      (e) => e.staffMemberId === hal.id
    ) as Rec;
    expect(halCard).toMatchObject({
      regularMinutes: 2400,
      overtimeMinutes: 300,
      straightTimeCents: 75000,
      overtimePremiumCents: 4167,
      totalCents: 79167,
    });
    const ok = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p2}/approve`
    );
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);

    const codesNow = {
      regular: "REG",
      overtime: "OT",
      doubleTime: "DT",
      tipsPaid: "TIPS",
      tipsReported: "CTIPS",
      serviceCharges: "SVC",
      overtimePremiumAdjustment: "OTADJ",
      minimumWageTopUp: "MWTU",
    };
    const saved = await putPayrollSettingsRaw(ownerToken, restaurantId, {
      export: {
        defaultFormat: "ADP_RUN",
        adp: { companyCode: "ABC", earningCodes: codesNow },
        paychex: { clientId: "9876", payComponents: codesNow },
      },
    });
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    const csv = async (format: string) => {
      const r = await file(format, p2);
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      return lines(r.data);
    };

    const gusto = await csv("GUSTO");
    expect(gusto).toEqual(
      expect.arrayContaining([
        `Avery,Hal,E-100,${baristaName},25.00,5.00,0.00,0.00,0.00,0.00,4.17,0.00`,
        `Avery,Hal,E-100,Lead ${runId},15.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00`,
      ])
    );
    const dates = `W,${usDate(p2)},${usDate(addDays(p2, 6))}`;
    const adp = await csv("ADP_RUN");
    expect(adp).toEqual(
      expect.arrayContaining([
        `ABC,${dates},E-100,REG,25.00,,BAR`,
        `ABC,${dates},E-100,OT,5.00,,BAR`,
        `ABC,${dates},E-100,REG,15.00,,LEAD`,
        `ABC,${dates},E-100,OTADJ,,4.17,BAR`,
      ])
    );
    const paychex = await csv("PAYCHEX");
    expect(paychex).toEqual(
      expect.arrayContaining([
        "9876,E-100,BAR,REG,15.00,25.00,",
        "9876,E-100,BAR,OT,15.00,5.00,",
        "9876,E-100,LEAD,REG,20.00,15.00,",
        "9876,E-100,BAR,OTADJ,,,4.17",
      ])
    );
    // Σ provider pay + adjustment = the engine's $791.67, in Paychex terms.
    const paid = paychex.slice(1).reduce((sum, row) => {
      const [, , , code, rate, hrs, amount] = row.split(",");
      const mult = code === "OT" ? 1.5 : code === "REG" ? 1 : 0;
      return (
        sum +
        Math.round(Number(rate || 0) * 100) * Number(hrs || 0) * mult +
        (code === "OTADJ" ? Math.round(Number(amount) * 100) : 0)
      );
    }, 0);
    expect(Math.round(paid)).toBe(79167);
    const rx = await csv("RESTAUNAX");
    p2Restaunax = rx;
    const premium = rx
      .slice(1)
      .filter((l) => l.includes(`${p2},`))
      .reduce((sum, l) => sum + Math.round(Number(l.split(",")[12]) * 100), 0);
    expect(premium).toBe(4167);
  });
  // ── W3:H7: paid pay periods lock (RestauNax back-office audit Stage 4) ──

  test("TC-1364: W3:H7 mark-paid refuses a period that isn't approved — 400 PERIOD_NOT_APPROVED", async () => {
    // P1 was reopened in TC-603: not approved.
    const r = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/mark-paid`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(400);
    expect((r.data as Rec).details).toMatchObject({
      code: "PERIOD_NOT_APPROVED",
    });
    expect(String((r.data as Rec).message)).toBe(
      "This pay period isn't approved."
    );
  });

  test("TC-1365: W3:H7 an exported period marked paid stays PAID through a re-export; the file is unchanged", async () => {
    // Exported, not yet paid: still locked for corrections (PERIOD_LOCKED).
    const locked = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/shifts",
      {
        staffMemberId: ivy.id,
        clockInAt: at(addDays(p2, 6), "14:00"),
        clockOutAt: at(addDays(p2, 6), "18:00"),
        jobId: host,
        reason: "Paper timesheet",
      }
    );
    expect(locked.status, JSON.stringify(locked.data)).toBe(403);
    expect((locked.data as Rec).details).toMatchObject({
      code: "PERIOD_LOCKED",
    });

    const paid = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p2}/mark-paid`
    );
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    expect(paid.data.data).toMatchObject({ startDate: p2, status: "PAID" });
    const paidAt = String(paid.data.data.paidAt ?? "");
    expect(Number.isNaN(Date.parse(paidAt)), paidAt).toBe(false);

    const again = await file("RESTAUNAX", p2);
    expect(again.status, JSON.stringify(again.data)).toBe(200);
    // No adjustments carried: byte-identical to before, no new column.
    expect(lines(again.data)).toEqual(p2Restaunax);
    const gusto = await file("GUSTO", p2);
    expect(gusto.status, JSON.stringify(gusto.data)).toBe(200);
    expect(lines(gusto.data)[0]).not.toContain("prior_period_adjustment");

    const periods = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/pay-periods?count=4"
    );
    expect(
      list(periods.data.data.periods).find((p) => p.startDate === p2)
    ).toMatchObject({ status: "PAID", paidAt });
  });

  test("TC-1366: W3:H7 a correction in the paid period is carried by the next open period, and only its files get the adjustment column", async () => {
    const REASON = "Ivy's Saturday was missing";
    // Ivy, Saturday of paid P2: 4 h × $16.00 = $64.00, no overtime.
    const added = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/shifts",
      {
        staffMemberId: ivy.id,
        clockInAt: at(addDays(p2, 6), "14:00"),
        clockOutAt: at(addDays(p2, 6), "18:00"),
        jobId: host,
        reason: REASON,
      }
    );
    expect(added.status, JSON.stringify(added.data)).toBe(201);

    // P1 (the next period, reopened → not frozen) carries it.
    const payday = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/pay-periods/${p1}/payday`
    );
    expect(payday.status, JSON.stringify(payday.data)).toBe(200);
    expect(list(payday.data.data.adjustmentsIn)).toEqual([
      expect.objectContaining({
        staffMemberId: ivy.id,
        name: "Ivy Zane",
        sourceStartDate: p2,
        cents: 6400,
        minutes: 240,
        reasons: [REASON],
      }),
    ]);
    const paidDay = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/pay-periods/${p2}/payday`
    );
    expect(paidDay.data.data.period).toMatchObject({ status: "PAID" });
    expect(paidDay.data.data.period.paidAt).toBeTruthy();

    // P2's own file is untouched (the paid snapshot is never rewritten).
    expect(lines((await file("RESTAUNAX", p2)).data)).toEqual(p2Restaunax);

    // Approve P1 again: its files carry the prior-period adjustment.
    const ok = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`
    );
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    const rx = await csvOf("RESTAUNAX");
    const header = rx[0] ?? "";
    const col = header.split(",").indexOf("Prior-period adjustment");
    expect(col, header).toBeGreaterThan(-1);
    const row = (last: string) =>
      rx.find((l) => l.split(",")[3] === last)?.split(",") ?? [];
    expect(row("Zane")[col]).toBe("64.00");
    expect(row("Avery")[col]).toBe("0.00");

    const gusto = await csvOf("GUSTO");
    expect(gusto[0] ?? "").toMatch(/,prior_period_adjustment$/);
    expect(gusto).toContain(
      `Zane,Ivy,,${hostName},8.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,64.00`
    );
  });
});
