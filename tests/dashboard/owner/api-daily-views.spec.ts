/**
 * api-daily-views.spec.ts — the back-office audit's Stage 6 daily views on
 * QA (TC-1731..1735), through the API. No browser, no email.
 *
 * A per-run throwaway restaurant (createSecondOwner) with SCHEDULING and
 * ACCOUNTING_SYNC ("Books & Taxes"):
 *   - W0:MF-4 GET /api/today/:id: today's sales vs the same weekday last
 *     year, live labor and the day's discounts, comps and voids — the
 *     owner's copy carries the money.
 *   - W0:J6 "Send to my accountant": the month's figures
 *     (GET /api/accounting/:id/accountant-bundle) and the ZIP
 *     (…/accountant-bundle.zip) holding the sales-tax report, the journal
 *     in the chosen layout and the payroll summary; a bad month is refused.
 *   - W0:J2 the schedule forecast: an owner's expected sales for a day
 *     replace the forecast, change that day's labor %, and a day above the
 *     target labor % is marked over; clearing goes back to history.
 *   - Stage 6 preferences: defaults (void/comp push off at $25, overtime
 *     push at 38 h, Books tabs off for a new restaurant), a partial save,
 *     a bad value refused.
 *
 * Gated by `RELEASED_ON_QA.dailyViewsStage6` (skips with a reason until the
 * change is on QA, then fails if it goes missing). Fails (never skips)
 * without ADMIN creds. Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  probeDailyViewsStage6,
  requireRelease,
} from "../../../utils/releaseGate";
import {
  BACKEND_URL,
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  createShiftRaw,
  createStaffJobRaw,
  deleteTestRestaurant,
  getScheduleWeekRaw,
  schedulingRaw,
  setFeatureOverrideAdminRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const DAY = 86_400_000;
const day = (n: number) =>
  new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const lastMonth = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

test.describe.configure({ mode: "serial" });

test.describe("Stage 6 daily views — today, accountant bundle, forecast, preferences (API)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let jobId = "";

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    // Fail, never skip, without the environment (W5:T7).
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
      throw new Error("[api-daily-views] ADMIN_EMAIL / ADMIN_PASSWORD not set");
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[api-daily-views] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    for (const feature of ["SCHEDULING", "ACCOUNTING_SYNC"]) {
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      if (!g.ok)
        throw new Error(
          `[api-daily-views] grant ${feature}: ${JSON.stringify(g.data)}`
        );
    }
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Daily views");
    await allure.label("severity", "critical");
    requireRelease(
      "dailyViewsStage6",
      await probeDailyViewsStage6(ownerToken, restaurantId)
    );
  });

  test("TC-1731: W0:MF-4 today so far — sales vs last year, live labor, discounts/comps/voids @daily-views", async () => {
    const r = await apiRequestRaw<{ data: Rec }>(
      "GET",
      `/api/today/${restaurantId}`,
      undefined,
      ownerToken
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const d = r.data.data;
    expect(d.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Same weekday last year: 364 days back.
    expect(
      (Date.parse(`${d.businessDate}T12:00:00Z`) -
        Date.parse(`${d.sales.lastYearDate}T12:00:00Z`)) /
        DAY
    ).toBe(364);
    expect(typeof d.sales.todaySalesCents).toBe("number");
    expect(typeof d.labor.minutes).toBe("number");
    expect(typeof d.labor.onTheClock).toBe("number");
    // The owner's copy carries the money (a manager's has it stripped).
    expect(typeof d.labor.laborCents).toBe("number");
    expect(typeof d.exceptions.discountsCents).toBe("number");
    expect(typeof d.exceptions.compsCents).toBe("number");
    expect(typeof d.exceptions.voidsCents).toBe("number");
    // A fresh restaurant has nothing to compare with last year.
    expect(d.sales.lastYearSalesCents).toBeNull();
    expect(d.sales.changePercent).toBeNull();
  });

  test("TC-1732: W0:J6 send to my accountant — the month's figures and one ZIP; a bad month is refused @daily-views", async () => {
    const month = lastMonth();
    const r = await apiRequestRaw<{ data: Rec }>(
      "GET",
      `/api/accounting/${restaurantId}/accountant-bundle?month=${month}`,
      undefined,
      ownerToken
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const f = r.data.data;
    expect(f.month).toBe(month);
    expect(f.startDate).toBe(`${month}-01`);
    expect(f.salesTax).toMatchObject({
      netSalesCents: expect.any(Number),
      netTaxCollectedCents: expect.any(Number),
      taxDueCents: expect.any(Number),
    });
    // No approved pay period in a new restaurant.
    expect(f.payroll).toMatchObject({ periodCount: 0, wagesCents: 0 });

    for (const format of ["restaunax", "quickbooks", "xero"]) {
      const res = await fetch(
        `${BACKEND_URL}/api/accounting/${restaurantId}/accountant-bundle.zip?month=${month}&format=${format}`,
        { headers: { Authorization: `Bearer ${ownerToken}` } }
      );
      expect(res.status, format).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/zip");
      const body = Buffer.from(await res.arrayBuffer());
      expect(body.subarray(0, 2).toString(), format).toBe("PK");
      const names = body.toString("latin1");
      expect(names).toContain("README.txt");
      expect(names).toContain(`sales-tax-${month}.csv`);
      expect(names).toContain(`payroll-${month}.csv`);
    }

    const bad = await apiRequestRaw(
      "GET",
      `/api/accounting/${restaurantId}/accountant-bundle?month=2026-13`,
      undefined,
      ownerToken
    );
    expect(bad.status).toBe(400);
  });

  test("TC-1733: W0:J2 an expected-sales override changes the day's labor % and a target marks it over @daily-views", async () => {
    const job = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Line ${runId}`,
      defaultHourlyRateCents: 2000,
    });
    expect(job.status, JSON.stringify(job.data)).toBe(201);
    jobId = String(job.data.data?.id);
    const weekOf = async (date: string) => {
      const w = await getScheduleWeekRaw(ownerToken, restaurantId, date);
      expect(w.status, JSON.stringify(w.data)).toBe(200);
      return w.data.data as Rec;
    };
    const first = await weekOf(day(21));
    const date = String(first.weekStart);
    // A 10-hour open shift at the job's $20.00: $200 on that day.
    const shift = await createShiftRaw(ownerToken, restaurantId, {
      staffMemberId: null,
      jobId,
      startAt: `${date}T14:00:00.000Z`,
      endAt: `${date}T23:00:00.000Z`,
    });
    expect(shift.status, JSON.stringify(shift.data)).toBe(201);

    const override = await schedulingRaw(
      ownerToken,
      restaurantId,
      "PUT",
      `/forecast/days/${date}`,
      { expectedSalesCents: 60000 }
    );
    expect(override.status, JSON.stringify(override.data)).toBe(200);
    const target = await schedulingRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/forecast/target",
      { targetLaborPercent: 25 }
    );
    expect(target.status, JSON.stringify(target.data)).toBe(200);

    const week = await weekOf(date);
    const d0 = (week.cost.days as Rec[]).find((d) => d.date === date) as Rec;
    expect(d0.forecastSource).toBe("OVERRIDE");
    expect(d0.projectedSalesCents).toBe(60000);
    expect(d0.laborPercent).toBe(
      Math.round((Number(d0.wageCents) / 60000) * 1000) / 10
    );
    expect(d0.overTarget).toBe(Number(d0.laborPercent) > 25);
    expect(week.cost.targetLaborPercent).toBe(25);

    // Cleared: back to history (a new restaurant has none).
    const clear = await schedulingRaw(
      ownerToken,
      restaurantId,
      "PUT",
      `/forecast/days/${date}`,
      { expectedSalesCents: null }
    );
    expect(clear.status).toBe(200);
    const back = await weekOf(date);
    const b0 = (back.cost.days as Rec[]).find((d) => d.date === date) as Rec;
    expect(b0.forecastSource).not.toBe("OVERRIDE");

    // Refused: a negative amount, a target over 100 — in words.
    const neg = await schedulingRaw(
      ownerToken,
      restaurantId,
      "PUT",
      `/forecast/days/${date}`,
      { expectedSalesCents: -1 }
    );
    expect(neg.status).toBe(400);
    const said = neg.data as { error?: string; message?: string };
    expect(String(said?.error ?? said?.message)).not.toMatch(/^error:/);
    const over = await schedulingRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/forecast/target",
      { targetLaborPercent: 120 }
    );
    expect(over.status).toBe(400);
  });

  test("TC-1734: Stage 6 preferences — defaults, a partial save, a bad value refused @daily-views", async () => {
    const url = `/api/staff/back-office/${restaurantId}/preferences`;
    const get = await apiRequestRaw<{ data: Rec }>(
      "GET",
      url,
      undefined,
      ownerToken
    );
    expect(get.status, JSON.stringify(get.data)).toBe(200);
    expect(get.data.data).toMatchObject({
      voidCompAlertEnabled: false,
      voidCompAlertThresholdCents: 2500,
      overtimeAlertEnabled: true,
      overtimeAlertMinutes: 2280,
      // A restaurant created after the change: the optional tabs are off.
      booksDepositsEnabled: false,
      booksCalendarEnabled: false,
      booksYearEndEnabled: false,
    });
    const put = await apiRequestRaw<{ data: Rec }>(
      "PUT",
      url,
      { voidCompAlertEnabled: true, booksDepositsEnabled: true },
      ownerToken
    );
    expect(put.status, JSON.stringify(put.data)).toBe(200);
    expect(put.data.data).toMatchObject({
      voidCompAlertEnabled: true,
      booksDepositsEnabled: true,
      voidCompAlertThresholdCents: 2500,
      targetLaborPercent: 25,
    });
    const bad = await apiRequestRaw(
      "PUT",
      url,
      { overtimeAlertMinutes: 0 },
      ownerToken
    );
    expect(bad.status).toBe(400);
  });
});
