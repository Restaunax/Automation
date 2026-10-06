/**
 * api-payroll-export.spec.ts — the payroll export file (P3) on QA, every
 * format, totals equal to the approved period (TC-597..603).
 *
 * No browser. A per-run throwaway restaurant with PAYROLL, weekly pay periods,
 * and last week's (finished) period P1 filled by manager entry:
 *   Hal — Barista $15.00: Mon–Fri 8 h + Sat 4 h = 44 h → 40 × $15 + 4 × $22.50
 *         = $690.00 (straight $660.00 + premium $30.00); declared cash $12.34.
 *   Ivy — Host $14.00: two 4 h shifts = 8 h → $112.00; no payroll ID.
 * Approve P1 → preview warnings per format → set the IDs/codes → the files,
 * row by row; the export marks the period EXPORTED; a re-export after a raise
 * is byte-identical (the snapshot, not today's rates); an unapproved period
 * can't be exported; the staff app shows the approved wages.
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
  const hal = { id: "", token: "", email: "" };
  const ivy = { id: "" };
  let barista = "";
  let host = "";
  let baristaName = "";
  let hostName = "";
  let p1 = "";
  let p2 = "";
  let restaunaxFile = "";

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
  const codes = (w: Rec) =>
    list(w.warnings)
      .map((x) => String(x.code))
      .sort();

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !MAILPIT) return;
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
          defaultHourlyRateCents: 1400,
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

  test("TC-597: only an approved period exports; approval freezes $690.00 + $112.00", async () => {
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
      totalCents: 11200,
    });
    expect(cards.data.data.totals.totalCents).toBe(80200);

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
    // declared, grossPaid — sorted by last name.
    expect(rows[1]).toBe(
      `${p1},${addDays(p1, 6)},E-100,Avery,Hal,${baristaName},BAR,15.00,40.00,4.00,0.00,660.00,30.00,690.00,0.00,0.00,12.34,690.00`
    );
    expect(rows[2]).toBe(
      `${p1},${addDays(p1, 6)},,Zane,Ivy,${hostName},,14.00,8.00,0.00,0.00,112.00,0.00,112.00,0.00,0.00,0.00,112.00`
    );
    const wages = rows
      .slice(1)
      .reduce((s, l) => s + Math.round(Number(l.split(",")[13]) * 100), 0);
    expect(wages).toBe(80200);

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
    const gusto = lines((await file("GUSTO")).data);
    expect(gusto[0]).toBe(
      "Last_name,First_name,Gusto_employee_id,Title,Regular_hours,Overtime_hours,Double_overtime_hours,paycheck_tips,cash_tips"
    );
    expect(gusto).toContain(
      `Avery,Hal,E-100,${baristaName},40.00,4.00,0.00,0.00,12.34`
    );
    expect(gusto).toContain(`Zane,Ivy,,${hostName},8.00,0.00,0.00,0.00,0.00`);

    const adp = lines((await file("ADP_RUN")).data);
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

    const paychex = lines((await file("PAYCHEX")).data);
    expect(paychex[0]).toBe(
      "Client ID,Worker ID,Job Number,Pay Component,Rate,Hours,Amount"
    );
    expect(paychex).toEqual(
      expect.arrayContaining([
        "9876,E-100,BAR,REG,15.00,40.00,",
        "9876,E-100,BAR,OT,15.00,4.00,",
        "9876,E-100,BAR,CTIPS,,,12.34",
        "9876,,,REG,14.00,8.00,",
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
});
