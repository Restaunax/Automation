/**
 * manager-role.spec.ts — the manager dashboard role (W0:MF-2) on QA
 * (TC-1550..1557).
 *
 * No browser. A per-run throwaway restaurant with SCHEDULING (implies
 * TIMECARDS) and TIP_MANAGEMENT. One staff member with a real account
 * (invite → Mailpit → register); the owner makes them a manager. Then, signed
 * in as the manager:
 *   - their restaurant is listed with accessRole MANAGER and the server's
 *     managerCapabilities (the clients gate on nothing else);
 *   - 200 on the schedule, staff requests, timecards, the pay-period list, day
 *     close, orders and the sales dashboard — and no pay field anywhere in the
 *     timecards, schedule or jobs answers;
 *   - 403 MANAGER_NOT_ALLOWED (in the request language) on payroll approval,
 *     Payday, export, labor, payroll settings, jobs & pay, tips, the payroll
 *     provider, billing, add-ons, books, sales tax and handing out access;
 *   - the owner still sees pay on the same timecards route;
 *   - removing manager access ends it.
 *
 * Gating: needs admin credentials (it mints its own tenant) and Mailpit (the
 * invite travels by email) — FAILS, never skips, without them.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, recordUserForCleanup } from "../../../utils/testData";
import { waitForEmail, extractInviteToken } from "../../../utils/emailHelper";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  deleteTestRestaurant,
  inviteStaffRaw,
  registerWithInvite,
  setFeatureOverrideAdminRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

type Rec = Record<string, LooseJson>;

/** Any key that carries pay (backend managerScope.ts isPayKey). */
const PAY_KEY =
  /"(pay|wage|wages|laborPercent|wageFloor|hourlyRateCents|wageCents|defaultHourlyRateCents|overtimePremiumCents|tipsCents|totalCents)"/;

const isoDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

test.describe.configure({ mode: "serial" });

test.describe("Manager dashboard role (API)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let managerToken = "";
  let managerStaffId = "";
  const managerEmail = `auto-mgr-${runId}@${DOMAIN}`;
  const managerPassword = `Automation!Mgr-${runId}`;
  const start = isoDay(-7);
  const end = isoDay(-1);

  const call = (
    token: string,
    method: string,
    path: string,
    body?: unknown,
    lang = "en"
  ) =>
    apiRequestRaw<Rec>(method, path, body, token, { "Accept-Language": lang });

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "[manager-role] ADMIN_EMAIL / ADMIN_PASSWORD must be set: this file mints its own tenant"
      );
    }
    if (!MAILPIT) {
      throw new Error(
        "[manager-role] MAILPIT_BASE_URL must be set: the staff invite travels by email"
      );
    }
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[manager-role] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    for (const feature of ["SCHEDULING", "TIMECARDS", "TIP_MANAGEMENT"]) {
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      if (!g.ok)
        throw new Error(
          `[manager-role] grant ${feature}: ${JSON.stringify(g.data)}`
        );
    }

    // A team member with their own account…
    recordUserForCleanup(managerEmail);
    const invited = await inviteStaffRaw(ownerToken, restaurantId, {
      email: managerEmail,
      firstName: "Mia",
      lastName: "Manager",
    });
    if (invited.status !== 201)
      throw new Error(`[manager-role] invite: ${JSON.stringify(invited.data)}`);
    managerStaffId = String(invited.data.data?.staffMemberId ?? "");
    const mail = await waitForEmail(managerEmail, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    await registerWithInvite({
      firstName: "Mia",
      lastName: "Manager",
      email: managerEmail,
      password: managerPassword,
      userInvitationToken: extractInviteToken(mail.text_body || mail.html_body),
    });
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Manager role");
    await allure.label("severity", "critical");
  });

  test("TC-1550: the owner makes a team member a manager (live at once: they already have an account)", async () => {
    const res = await call(
      ownerToken,
      "POST",
      `/restaurant/${restaurantId}/staff/managers`,
      {
        staffMemberId: managerStaffId,
      }
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.data).toEqual({
      staffMemberId: managerStaffId,
      status: "ACTIVE",
    });
    // A fresh sign-in carries the promoted account.
    managerToken = (await apiLogin(managerEmail, managerPassword)).accessToken;
    expect(managerToken).toBeTruthy();
  });

  test("TC-1551: the manager's restaurant list says MANAGER and carries the server's capability list", async () => {
    const res = await call(managerToken, "GET", "/restaurant/owned");
    expect(res.status).toBe(200);
    const rows = (res.data.restaurant ?? []) as Rec[];
    const row = rows.find((r) => r.id === restaurantId);
    expect(row?.accessRole).toBe("MANAGER");
    expect(row?.managerCapabilities).toEqual([
      "orders",
      "menuAvailability",
      "schedule",
      "staffRequests",
      "timecards",
      "dayClose",
      "reports",
    ]);
  });

  test("TC-1552: 200 on the schedule, requests, timecards, pay-period list, day close, orders and sales dashboard", async () => {
    const paths = [
      `/api/staff/scheduling/${restaurantId}?date=${start}`,
      `/api/staff/scheduling/${restaurantId}/requests`,
      `/api/staff/payroll/${restaurantId}/timecards?startDate=${start}&endDate=${end}`,
      `/api/staff/payroll/${restaurantId}/pay-periods?count=4`,
      `/api/staff/payroll/${restaurantId}/jobs`,
      `/restaurant/${restaurantId}/daily-close`,
      `/restaurant/${restaurantId}/daily-close/history`,
      `/api/order/statistics/management/${restaurantId}`,
      `/api/analytics/dashboard/${restaurantId}?startDate=${start}&endDate=${end}`,
      `/api/reports/${restaurantId}/sales-by-day.csv?startDate=${start}&endDate=${end}`,
      `/restaurant/restaurantId/${restaurantId}/features`,
      `/restaurant/${restaurantId}/staff`,
    ];
    const out: string[] = [];
    for (const p of paths) {
      const res = await call(managerToken, "GET", p);
      out.push(`${p} → ${res.status}`);
    }
    expect(out.filter((l) => !l.endsWith("→ 200"))).toEqual([]);
  });

  test("TC-1553: no pay field in the timecards, schedule, pay-period or jobs answers", async () => {
    for (const p of [
      `/api/staff/payroll/${restaurantId}/timecards?startDate=${start}&endDate=${end}`,
      `/api/staff/scheduling/${restaurantId}?date=${start}`,
      `/api/staff/payroll/${restaurantId}/pay-periods?count=4`,
      `/api/staff/payroll/${restaurantId}/jobs`,
      `/restaurant/${restaurantId}/staff`,
    ]) {
      const res = await call(managerToken, "GET", p);
      expect(JSON.stringify(res.data), p).not.toMatch(PAY_KEY);
    }
    const restaurant = await call(
      managerToken,
      "GET",
      `/restaurant/restaurantId/${restaurantId}`
    );
    expect(restaurant.status).toBe(200);
    expect(JSON.stringify(restaurant.data)).not.toMatch(
      /"subscription"|"stripe/
    );
  });

  test("TC-1554: 403 MANAGER_NOT_ALLOWED on payroll, wages, tips, billing, books, add-ons and access — in the request language", async () => {
    const refused: [string, string][] = [
      [
        "POST",
        `/api/staff/payroll/${restaurantId}/pay-periods/${start}/approve`,
      ],
      [
        "POST",
        `/api/staff/payroll/${restaurantId}/pay-periods/${start}/reopen`,
      ],
      ["GET", `/api/staff/payroll/${restaurantId}/pay-periods/${start}/payday`],
      [
        "POST",
        `/api/staff/payroll/${restaurantId}/pay-periods/${start}/export`,
      ],
      ["GET", `/api/staff/payroll/${restaurantId}/labor`],
      ["GET", `/api/staff/payroll/${restaurantId}/settings`],
      ["POST", `/api/staff/payroll/${restaurantId}/jobs`],
      ["GET", `/api/staff/tips/${restaurantId}/policy`],
      ["GET", `/api/staff/payroll-provider/${restaurantId}/status`],
      ["GET", `/api/subscriptions/restaurants/${restaurantId}`],
      ["GET", `/api/subscriptions/restaurants/${restaurantId}/invoices`],
      ["GET", `/restaurant/${restaurantId}/addons`],
      ["GET", `/api/books/${restaurantId}/overview`],
      ["GET", `/api/tax/${restaurantId}/report`],
      ["POST", `/restaurant/${restaurantId}/staff/managers`],
      ["POST", `/restaurant/${restaurantId}/staff/co-owners`],
      ["POST", `/restaurant/${restaurantId}/staff/invite`],
      ["PUT", `/api/restaurantId/${restaurantId}/settings`],
    ];
    const wrong: string[] = [];
    for (const [method, path] of refused) {
      const res = await call(managerToken, method, path, {}, "es");
      const ok =
        res.status === 403 &&
        res.data.error === "MANAGER_NOT_ALLOWED" &&
        res.data.message ===
          "Los gerentes no pueden abrir esto. Pídeselo al dueño.";
      if (!ok)
        wrong.push(
          `${method} ${path} → ${res.status} ${JSON.stringify(res.data)}`
        );
    }
    expect(wrong).toEqual([]);
  });

  test("TC-1555: the owner on the same timecards route still gets pay fields", async () => {
    const res = await call(
      ownerToken,
      "GET",
      `/api/staff/payroll/${restaurantId}/timecards?startDate=${start}&endDate=${end}`
    );
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.data)).toMatch(/"totalCents"/);
  });

  test("TC-1556: a manager can't hand out or end access", async () => {
    const res = await call(
      managerToken,
      "DELETE",
      `/restaurant/${restaurantId}/staff/${managerStaffId}/manager`
    );
    expect(res.status).toBe(403);
  });

  test("TC-1557: removing manager access ends it", async () => {
    const res = await call(
      ownerToken,
      "DELETE",
      `/restaurant/${restaurantId}/staff/${managerStaffId}/manager`
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const fresh = (await apiLogin(managerEmail, managerPassword)).accessToken;
    const owned = await call(fresh, "GET", "/restaurant/owned");
    const rows = (owned.data?.restaurant ?? []) as Rec[];
    expect(rows.some((r) => r.id === restaurantId)).toBe(false);
    const schedule = await call(
      fresh,
      "GET",
      `/api/staff/scheduling/${restaurantId}?date=${start}`
    );
    expect([403, 404]).toContain(schedule.status);
  });
});
