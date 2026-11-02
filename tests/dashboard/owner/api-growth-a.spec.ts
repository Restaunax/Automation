/**
 * api-growth-a.spec.ts — RestauNax back-office audit Stage 7, growth A
 * (TC-1760..1768):
 *   - W0:MF-5 prime cost lite: weekly costs typed in or imported as invoice
 *     totals, prime cost % per workweek, gated like the labor report
 *     (TIMECARDS).
 *   - W0:MF-7 staff, jobs and wages import (People → Import): Toast
 *     TimeEntries.csv or an employee list with a column mapper; dry run;
 *     nobody invited until the owner asks.
 *   - W0:MF-9 nightly cash tip-out sheet: opt-in per restaurant, the sheet,
 *     and its refusals (off, no open drawer).
 *
 * restaunax docs/features/back-office/PRIME_COST.md, STAFF_IMPORT.md and
 * CASH_TIP_SHEET.md. Paying the sheet from an open drawer, F1 (the paycheck
 * leaves it off) and the books line are proven against a real database by
 * restaunax `growthA.int.test.ts`; the POS step by device-in-store's
 * CloseDayWizardCashTips test and Maestro back-office/06-cash-tip-sheet.
 *
 * No browser. One throwaway restaurant (NY) with Timecards + Tip Management
 * granted by admin override. Gated by `RELEASED_ON_QA.growthAStage7` until
 * the change is on QA. Serial. Tag: @growth-a.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import { probeGrowthAStage7, requireRelease } from "../../../utils/releaseGate";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  BACKEND_URL,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  type LooseJson,
  type RawResponse,
} from "../../../utils/apiHelper";

type Rec = Record<string, LooseJson>;
const TZ = "America/New_York";
const localDay = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(Date.now() + offsetDays * 86_400_000)
  );
/** No API text may be an i18n key (CLAUDE.md: responses carry text). */
const notAKey = (s: unknown) => expect(String(s)).not.toMatch(/^(api|error):/);

/** Multipart upload (apiRequestRaw is JSON-only). */
async function upload(
  token: string,
  path: string,
  csv: string,
  fields: Record<string, string> = {},
  language = "en"
): Promise<RawResponse<Rec>> {
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), "file.csv");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Accept-Language": language },
    body: form,
  });
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* leave as text */
  }
  return { status: res.status, ok: res.ok, data: data as Rec } as never;
}

test.describe.configure({ mode: "serial" });

test.describe("Growth A — prime cost, staff import, cash tip-out sheet (API) @growth-a", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenant and grants Timecards + Tip Management"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let weekStart = "";
  let batchId = "";
  let importedId = "";
  const pc = () => `/api/staff/prime-cost/${restaurantId}`;
  const si = () => `/api/staff/import/${restaurantId}`;
  const ts = () => `/api/staff/tip-sheet/${restaurantId}`;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    adminToken = (
      await apiLogin(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)
    ).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[api-growth-a] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Back office growth A");
    await allure.label("severity", "critical");
    requireRelease(
      "growthAStage7",
      await probeGrowthAStage7(ownerToken, restaurantId)
    );
  });

  test("TC-1760: prime cost is gated like the labor report — no Timecards, no prime cost; with it, 8 workweeks", async () => {
    const before = await apiRequestRaw("GET", pc(), undefined, ownerToken);
    expect(before.status).toBe(403);
    // TIP_MANAGEMENT brings TIMECARDS (a component, never granted alone).
    for (const feature of ["TIP_MANAGEMENT"]) {
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      expect(g.ok, feature).toBe(true);
    }
    const res = await apiRequestRaw<Rec>(
      "GET",
      `${pc()}?weeks=8`,
      undefined,
      ownerToken
    );
    expect(res.status).toBe(200);
    const data = res.data.data as Rec;
    expect(data.weeks).toHaveLength(8);
    weekStart = String(data.currentWeekStart);
    expect(weekStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const w of data.weeks as Rec[]) {
      expect(w).toHaveProperty("laborCents");
      expect(w).toHaveProperty("netSalesCents");
      // No costs entered yet: no prime cost %.
      expect(w.primeCostPercent).toBeNull();
    }
  });

  test("TC-1761: typing a week's costs — a date that isn't a workweek start, or a negative cost, is refused in words (EN + ES)", async () => {
    const notStart = await apiRequestRaw<Rec>(
      "PUT",
      `${pc()}/weeks/${localDay(0) === weekStart ? localDay(1) : localDay(0)}`,
      { foodCents: 100 },
      ownerToken
    );
    expect(notStart.status).toBe(400);
    notAKey(notStart.data.message);
    const neg = await apiRequestRaw<Rec>(
      "PUT",
      `${pc()}/weeks/${weekStart}`,
      { foodCents: -1 },
      ownerToken,
      { "Accept-Language": "es" }
    );
    expect(neg.status).toBe(400);
    expect(neg.data.message).toBe("Ingresa cada costo como 0 o más.");
    const ok = await apiRequestRaw<Rec>(
      "PUT",
      `${pc()}/weeks/${weekStart}`,
      { foodCents: 120_000, beverageCents: 30_000, paperOtherCents: null },
      ownerToken
    );
    expect(ok.status).toBe(200);
    notAKey(ok.data.message);
    expect(ok.data.data).toMatchObject({
      weekStart,
      cogs: { foodCents: 120_000, beverageCents: 30_000, paperOtherCents: 0 },
      sources: { FOOD: "TYPED", BEVERAGE: "TYPED", PAPER_OTHER: "NONE" },
      costsEntered: true,
    });
  });

  test("TC-1762: invoice totals from a CSV — dry run, import, the same file again adds nothing, undo", async () => {
    const csv = [
      "Invoice Date,Vendor,Invoice #,Category,Total",
      `${weekStart},Sysco,GA-${runId}-1,Paper goods,42.10`,
      `${weekStart},Sysco,GA-${runId}-2,Food,999.00`,
      "nope,Sysco,X,Food,1",
    ].join("\n");
    const preview = await upload(ownerToken, `${pc()}/invoices/preview`, csv);
    expect(preview.status).toBe(200);
    expect(preview.data.data).toMatchObject({
      newCount: 2,
      duplicateCount: 0,
      errors: [{ row: 4, reason: "BAD_DATE" }],
    });
    const imported = await upload(ownerToken, `${pc()}/invoices`, csv);
    expect(imported.status).toBe(201);
    notAKey(imported.data.message);
    batchId = String((imported.data.data as Rec).batchId);
    const again = await upload(ownerToken, `${pc()}/invoices`, csv);
    expect(again.data.data).toMatchObject({ imported: 0, duplicates: 2 });
    const report = await apiRequestRaw<Rec>(
      "GET",
      `${pc()}?weeks=1`,
      undefined,
      ownerToken
    );
    const week = (report.data.data as Rec).weeks[0] as Rec;
    // Food stays typed; paper/other comes from the invoice.
    expect(week.cogs).toMatchObject({
      foodCents: 120_000,
      paperOtherCents: 4210,
    });
    expect(week.sources).toMatchObject({ PAPER_OTHER: "INVOICES" });
    const undo = await apiRequestRaw<Rec>(
      "DELETE",
      `${pc()}/invoices/batches/${batchId}`,
      undefined,
      ownerToken
    );
    expect(undo.status).toBe(200);
    expect((undo.data.data as Rec).removed).toBe(2);
  });

  const toast = [
    '"Location","Employee Id","Employee External Id","Employee","Job Title","In Date","Out Date","Wage"',
    `"Main","1","GA-${runId}","Rivera, Lu","Server","10/01/2026 4:00 PM","10/01/2026 11:00 PM","19.00"`,
    `"Main","1","GA-${runId}","Rivera, Lu","Server","10/08/2026 4:00 PM","10/08/2026 11:00 PM","20.00"`,
    '"Main","2","","Chen, Bo","Line Cook","10/05/2026 8:00 AM","10/05/2026 4:00 PM","21.00"',
    '"Main","2","","Chen, Bo","Dish","10/06/2026 8:00 AM","10/06/2026 4:00 PM","1.00"',
  ].join("\n");

  test("TC-1763: staff import dry run (Toast TimeEntries) — adds, new jobs, latest wage, the minimum wage on each rate; nothing written", async () => {
    const res = await upload(ownerToken, `${si()}/preview`, toast);
    expect(res.status).toBe(200);
    const d = res.data.data as Rec;
    expect(d.format).toBe("TOAST_TIME_ENTRIES");
    expect(d.summary).toMatchObject({ creates: 2, ratesIgnored: false });
    expect((d.summary.newJobs as Rec[]).map((j) => j.name)).toEqual(
      expect.arrayContaining(["Dish", "Line Cook"])
    );
    const lu = (d.people as Rec[]).find((p) => p.firstName === "Lu") as Rec;
    expect(lu).toMatchObject({
      action: "CREATE",
      payrollEmployeeId: `GA-${runId}`,
      jobs: [{ name: "Server", rateCents: 2000 }],
    });
    const dish = (
      (d.people as Rec[]).find((p) => p.firstName === "Bo") as Rec
    ).jobs.find((j: Rec) => j.name === "Dish") as Rec;
    // $1.00/h is under any minimum wage: refused (CONFIRMED) or flagged (DRAFT).
    expect(dish.belowMinimum).toMatchObject({ rateCents: 100 });
    const staff = await apiRequestRaw<Rec>(
      "GET",
      `/restaurant/${restaurantId}/staff?includeInactive=true`,
      undefined,
      ownerToken
    );
    expect((staff.data.data as Rec[]).some((m) => m.firstName === "Lu")).toBe(
      false
    );
  });

  test("TC-1764: staff import — people, jobs and rates written; nobody is invited; the same file again adds nobody", async () => {
    const res = await upload(ownerToken, si(), toast);
    expect(res.status).toBe(201);
    notAKey(res.data.message);
    const created = (res.data.data as Rec).created as Rec[];
    expect(created.map((c) => c.firstName).sort()).toEqual(["Bo", "Lu"]);
    const staff = await apiRequestRaw<Rec>(
      "GET",
      `/restaurant/${restaurantId}/staff?includeInactive=true`,
      undefined,
      ownerToken
    );
    const lu = (staff.data.data as Rec[]).find((m) => m.firstName === "Lu");
    expect(lu).toBeTruthy();
    // No email on file and no invitation sent.
    expect(lu?.email ?? null).toBeNull();
    const again = await upload(ownerToken, si(), toast);
    expect(((again.data.data as Rec).created as Rec[]).length).toBe(0);
  });

  test("TC-1765: an employee list with headers we don't know — refused until the columns are matched; invites only when asked", async () => {
    const csv = [
      "Nombre,Apellido,Correo,Puesto,Pago",
      `Ivy,Ng,ivy.${runId}@test.restaunax.com,Line Cook,22`,
    ].join("\n");
    const unmapped = await upload(ownerToken, `${si()}/preview`, csv);
    expect(unmapped.status).toBe(400);
    expect((unmapped.data.details as Rec).code).toBe("UNRECOGNISED");
    notAKey(unmapped.data.message);
    const mapping = JSON.stringify({
      firstName: "Nombre",
      lastName: "Apellido",
      email: "Correo",
      jobName: "Puesto",
      rate: "Pago",
    });
    const res = await upload(ownerToken, si(), csv, { mapping });
    expect(res.status).toBe(201);
    const ivy = ((res.data.data as Rec).created as Rec[])[0] as Rec;
    expect(ivy.email).toBe(`ivy.${runId}@test.restaunax.com`);
    importedId = String(ivy.id);
    const invites = await apiRequestRaw<Rec>(
      "POST",
      `${si()}/invites`,
      { staffMemberIds: [importedId] },
      ownerToken
    );
    expect(invites.status).toBe(200);
    notAKey(invites.data.message);
    expect((invites.data.data as Rec).sent).toEqual([
      { id: importedId, email: `ivy.${runId}@test.restaunax.com` },
    ]);
    const none = await apiRequestRaw<Rec>(
      "POST",
      `${si()}/invites`,
      { staffMemberIds: [] },
      ownerToken
    );
    expect(none.status).toBe(400);
  });

  test("TC-1766: the cash tip-out sheet is off by default; paying while off is refused", async () => {
    const off = await apiRequestRaw<Rec>(
      "GET",
      `${ts()}/settings`,
      undefined,
      ownerToken
    );
    expect(off.status).toBe(200);
    expect(off.data.data).toEqual({ enabled: false });
    const pay = await apiRequestRaw<Rec>(
      "POST",
      `${ts()}/pay`,
      {
        businessDate: localDay(0),
        registerSessionId: "none",
        lines: [{ staffMemberId: importedId, amountCents: 100 }],
      },
      ownerToken
    );
    expect(pay.status).toBe(400);
    expect((pay.data.details as Rec).code).toBe("SHEET_OFF");
    notAKey(pay.data.message);
  });

  test("TC-1767: turned on, the day's sheet — lines, totals, open drawers; paying needs an open drawer of that day", async () => {
    const on = await apiRequestRaw<Rec>(
      "PUT",
      `${ts()}/settings`,
      { enabled: true },
      ownerToken
    );
    expect(on.status).toBe(200);
    notAKey(on.data.message);
    const sheet = await apiRequestRaw<Rec>(
      "GET",
      `${ts()}?date=${localDay(0)}`,
      undefined,
      ownerToken
    );
    expect(sheet.status).toBe(200);
    const s = sheet.data.data as Rec;
    expect(s).toMatchObject({
      enabled: true,
      businessDate: localDay(0),
      locked: false,
      openDrawers: [],
    });
    expect(Array.isArray(s.lines)).toBe(true);
    expect(s.totals).toHaveProperty("owedCents");
    const pay = await apiRequestRaw<Rec>(
      "POST",
      `${ts()}/pay`,
      {
        businessDate: localDay(0),
        registerSessionId: "no-such-drawer",
        lines: [{ staffMemberId: importedId, amountCents: 100 }],
      },
      ownerToken,
      { "Accept-Language": "es" }
    );
    expect(pay.status).toBe(400);
    expect((pay.data.details as Rec).code).toBe("DRAWER_NOT_OPEN");
    expect(pay.data.message).toBe(
      "Paga las propinas desde una caja que siga abierta, antes de contarla."
    );
  });

  test("TC-1768: without Tip Management the sheet's routes answer 403 (gated like the tips report)", async () => {
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TIP_MANAGEMENT",
      false
    );
    expect(g.ok).toBe(true);
    for (const path of [`${ts()}/settings`, ts()]) {
      const res = await apiRequestRaw("GET", path, undefined, ownerToken);
      expect(res.status, path).toBe(403);
    }
  });
});
