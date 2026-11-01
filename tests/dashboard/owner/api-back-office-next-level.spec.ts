/**
 * api-back-office-next-level.spec.ts — the backend half of RestauNax PR #1074
 * ("back office: the next level") (TC-943..948).
 *
 *   TC-943  "Set up your back office": one checklist built from the
 *           restaurant's own data — empty without add-ons; with SCHEDULING
 *           the steps come in order, blocked steps say why, each links to its
 *           screen; adding a job ticks its step.
 *   TC-944  Payday header for a pay period: payroll mode + the deadline as a
 *           resolved sentence; a date that isn't a pay period → 400.
 *   TC-945  "Needs you today": an ended period with hours waiting → one
 *           PAY_PERIOD_APPROVAL item deep-linked to Timecards; approving
 *           clears it; someone who doesn't control the restaurant gets
 *           canManage:false and no items (never a 403).
 *   TC-946  Holiday & special hours (RestaurantSpecialHours): create, the
 *           refusals, "closed today" in the ordering status and the public
 *           details, edit to special times, delete; a stranger is refused.
 *   TC-947  Settings change history (RestaurantSettingChange): an owner's
 *           change is recorded with a resolved sentence and filtered by area;
 *           a stranger can't read it.
 *   TC-948  The "Yesterday at your restaurant" morning summary is on by
 *           default and the owner's switch turns it off and on.
 *
 * Specs: restaunax docs/superpowers/specs/2026-10-27-back-office-next-level/,
 * docs/features/back-office/NEEDS_YOU_TODAY.md, SETTINGS_SAFETY.md and
 * docs/features/HOLIDAY_HOURS.md.
 *
 * Data: a fresh owner + restaurant (createSecondOwner alwaysFresh), deleted
 * afterwards — never the shared seed restaurant or the QA sim restaurants.
 * The shared seed OWNER is used only as "someone who doesn't control this
 * restaurant" (reads and one refused write).
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  createStaffJobRaw,
  deleteTestRestaurant,
  payrollRaw,
  setFeatureOverrideAdminRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  addDays,
  backOfficeSetupRaw,
  localToday,
  looksLikeKey,
  needsYouMineRaw,
  needsYouRaw,
  orderingStatusRaw,
  paydayRaw,
  reportSettingsRaw,
  seedPeriodAwaitingApproval,
  settingChangesRaw,
  specialHoursRaw,
} from "../../../utils/backOfficeApi";
import { generateRunId } from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown): Rec[] => (Array.isArray(v) ? (v as Rec[]) : []);

test.describe.configure({ mode: "serial" });

test.describe("Owner — back office next level (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !OWNER_EMAIL || !OWNER_PASSWORD,
    "ADMIN_* / OWNER_* not set in .env (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  /** The shared seed owner: controls other restaurants, not this one. */
  let strangerToken = "";
  let restaurantId = "";
  let period = { startDate: "", endDate: "" };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    strangerToken = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId)
      throw new Error("[back-office] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Back office next level");
    await allure.label("severity", "critical");
  });

  test("TC-943: the back-office setup checklist follows the add-ons, in order, and ticks itself", async () => {
    // No back-office add-on: an answer, not a 403 — and nothing to do.
    const none = await backOfficeSetupRaw(ownerToken, restaurantId);
    expect(none.status, JSON.stringify(none.data)).toBe(200);
    expect(none.data.data).toMatchObject({
      steps: [],
      done: 0,
      total: 0,
      next: null,
    });

    const granted = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SCHEDULING",
      true
    );
    expect(granted.ok, JSON.stringify(granted.data)).toBe(true);

    const sched = await backOfficeSetupRaw(ownerToken, restaurantId);
    expect(sched.status).toBe(200);
    const data = sched.data.data as Rec;
    const steps = list(data.steps);
    const byId = new Map(steps.map((s) => [String(s.id), s]));
    // The order that works: jobs first; the steps that need jobs wait.
    expect(steps.map((s) => s.id)).toEqual([
      "jobs",
      "assignJobs",
      "paySchedule",
      "publishSchedule",
      "payrollMode",
      "approvePeriod",
      "salesTaxRate",
    ]);
    expect(data.next).toBe("jobs");
    expect(data.total).toBe(steps.length);
    expect(byId.get("jobs")).toMatchObject({
      status: "next",
      link: { tab: "staff", params: { staffTab: "jobs" } },
    });
    for (const id of ["assignJobs", "publishSchedule", "approvePeriod"]) {
      const step = byId.get(id) as Rec;
      expect(step.status, id).toBe("blocked");
      expect(step.blockedReason, id).toBe("Needs your jobs first");
    }
    expect(byId.get("approvePeriod")?.link).toEqual({
      tab: "staff",
      params: { staffTab: "payday" },
    });
    expect(byId.get("salesTaxRate")?.link).toEqual({
      tab: "Store Settings",
      params: { settingsTab: "sales-tax" },
    });
    for (const s of steps)
      expect(looksLikeKey(s.title), String(s.id)).toBe(false);
    expect(byId.get("jobs")?.title).toBe("Add your jobs and pay rates");

    // Adding a job ticks its step and unblocks the ones waiting for it.
    const job = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Server ${runId}`,
      // At least Miami's $15.00 minimum wage (W3:C3).
      defaultHourlyRateCents: 1500,
    });
    expect(job.status, JSON.stringify(job.data)).toBe(201);
    const after = await backOfficeSetupRaw(ownerToken, restaurantId);
    const afterById = new Map(
      list((after.data.data as Rec).steps).map((s) => [String(s.id), s])
    );
    expect(afterById.get("jobs")?.status).toBe("done");
    for (const id of ["assignJobs", "publishSchedule", "approvePeriod"])
      expect(afterById.get(id)?.status, id).not.toBe("blocked");
    expect((after.data.data as Rec).done).toBeGreaterThanOrEqual(1);
    expect((after.data.data as Rec).next).not.toBe("jobs");
  });

  test("TC-944: Payday says how payroll runs here and the deadline, in words", async () => {
    period = await seedPeriodAwaitingApproval(ownerToken, restaurantId, runId);
    const r = await paydayRaw(ownerToken, restaurantId, period.startDate);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.data).toMatchObject({
      period: {
        startDate: period.startDate,
        endDate: period.endDate,
        status: "OPEN",
      },
      // No Gusto connection: the payroll file.
      mode: "FILE",
      lastSentAt: null,
      setupComplete: true,
      deadline: {
        source: "PROVIDER",
        submitBy: null,
        payDate: null,
        text: "Your payroll provider sets the deadline. Download the file as soon as you approve and upload it there.",
      },
    });

    // A Monday is never a period start here (weeks start on Sunday).
    const bad = await paydayRaw(
      ownerToken,
      restaurantId,
      addDays(period.startDate, 1)
    );
    expect(bad.status, JSON.stringify(bad.data)).toBe(400);
    expect(bad.data).toMatchObject({
      success: false,
      details: { code: "NOT_A_PAY_PERIOD" },
      message: "That isn't one of this restaurant's pay periods.",
    });
  });

  test("TC-945: Needs you today lists the period to approve, deep-linked; approving clears it; a stranger sees no items", async () => {
    const r = await needsYouRaw(ownerToken, restaurantId);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const data = r.data.data as Rec;
    expect(data.canManage).toBe(true);
    const approval = list(data.items).filter(
      (i) => i.kind === "PAY_PERIOD_APPROVAL"
    );
    expect(approval, JSON.stringify(data.items)).toHaveLength(1);
    const item = approval[0] as Rec;
    expect(item).toMatchObject({
      severity: "TODAY",
      restaurantId,
      canManage: true,
      dueAt: null,
      dedupeKey: `${restaurantId}:PAY_PERIOD_APPROVAL:${period.startDate}`,
    });
    for (const f of ["title", "detail"])
      expect(looksLikeKey(item[f]), f).toBe(false);
    expect(looksLikeKey(item.action?.label)).toBe(false);
    const webPath = String(item.action?.webPath ?? "");
    expect(webPath).toContain(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?`
    );
    const q = new URLSearchParams(webPath.split("?")[1] ?? "");
    expect(q.get("tab")).toBe("staff");
    expect(q.get("staffTab")).toBe("timecards");
    expect(q.get("period")).toBe(period.startDate);
    expect(String(item.action?.appRoute ?? "")).toContain(
      `/restaurant/${restaurantId}/staff`
    );

    // The caller's own list across restaurants carries it too.
    const mine = await needsYouMineRaw(ownerToken);
    expect(mine.status, JSON.stringify(mine.data)).toBe(200);
    const mineData = mine.data.data as Rec;
    expect(
      list(mineData.restaurants).find((x) => x.restaurantId === restaurantId)
        ?.count
    ).toBeGreaterThanOrEqual(1);
    expect(
      list(mineData.items).some((i) => i.dedupeKey === item.dedupeKey)
    ).toBe(true);

    // Someone who doesn't control the restaurant: never a 403, nothing shown.
    const stranger = await needsYouRaw(strangerToken, restaurantId);
    expect(stranger.status, JSON.stringify(stranger.data)).toBe(200);
    expect(stranger.data.data).toMatchObject({
      canManage: false,
      items: [],
    });

    // Approving the period takes the item away (no Gusto: nothing to send).
    const approved = await payrollRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/pay-periods/${period.startDate}/approve`,
      {}
    );
    expect(approved.status, JSON.stringify(approved.data)).toBe(200);
    const after = await needsYouRaw(ownerToken, restaurantId);
    const kinds = list((after.data.data as Rec).items).map((i) => i.kind);
    expect(kinds).not.toContain("PAY_PERIOD_APPROVAL");
    expect(kinds).not.toContain("PAYROLL_SEND");
    // Payday now reads the period as approved.
    const payday = await paydayRaw(ownerToken, restaurantId, period.startDate);
    expect((payday.data.data as Rec).period?.status).toBe("APPROVED");
  });

  test("TC-946: holiday & special hours — create, refusals, closed today everywhere, edit, delete", async () => {
    const empty = await specialHoursRaw(ownerToken, restaurantId, "GET");
    expect(empty.status, JSON.stringify(empty.data)).toBe(200);
    expect(empty.data.data).toEqual([]);
    const tz = String(empty.data.timeZone ?? "");
    expect(tz).toMatch(/\//);
    const today = localToday(tz);

    // Closed all day, today, with a note.
    const created = await specialHoursRaw(
      ownerToken,
      restaurantId,
      "POST",
      undefined,
      { date: today, isClosed: true, note: `Auto Holiday ${runId}` }
    );
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    expect(created.data.message).toBe("Special hours saved");
    const row = created.data.data as Rec;
    expect(row).toMatchObject({
      date: today,
      nextDate: today,
      isClosed: true,
      openingTime: null,
      closingTime: null,
      note: `Auto Holiday ${runId}`,
      recurringYearly: false,
    });
    const id = String(row.id);

    try {
      // Refusals, each in plain words.
      const refusals: [Record<string, unknown>, number, string][] = [
        [
          { date: today, isClosed: true },
          400,
          "That date already has special hours. Edit it instead.",
        ],
        [
          { date: "2020-01-01", isClosed: true },
          400,
          "That date has passed. Pick today or a later date, or make it repeat every year.",
        ],
        [
          { date: addDays(today, 30), isClosed: false },
          400,
          "Enter an opening and a closing time, or mark the day closed.",
        ],
      ];
      for (const [body, status, message] of refusals) {
        const r = await specialHoursRaw(
          ownerToken,
          restaurantId,
          "POST",
          undefined,
          body
        );
        expect(r.status, JSON.stringify(body)).toBe(status);
        expect(r.data.message).toBe(message);
      }
      const stranger = await specialHoursRaw(
        strangerToken,
        restaurantId,
        "POST",
        undefined,
        { date: addDays(today, 40), isClosed: true }
      );
      expect(stranger.status).toBe(403);

      // The owner's status line and the public details both say closed today.
      const status = await orderingStatusRaw(ownerToken, restaurantId);
      expect(status.status).toBe(200);
      expect(status.data.data).toMatchObject({
        state: "CLOSED_BY_HOURS",
        isOpenByHours: false,
        todaySpecial: { isClosed: true, note: `Auto Holiday ${runId}` },
        headline: `Closed today: Auto Holiday ${runId}`,
      });
      const details = await apiRequestRaw<{ data?: Rec }>(
        "GET",
        `/restaurant/${restaurantId}/details`
      );
      expect(details.status).toBe(200);
      expect(details.data.data?.currentStatus).toMatchObject({
        isOpen: false,
        message: `Closed today: Auto Holiday ${runId}`,
      });
      expect(list(details.data.data?.specialHours)).toContainEqual(
        expect.objectContaining({ date: today, isClosed: true })
      );

      // Edit it to special times.
      const edited = await specialHoursRaw(
        ownerToken,
        restaurantId,
        "PUT",
        id,
        {
          date: today,
          isClosed: false,
          openingTime: "10:00",
          closingTime: "14:00",
          note: `Auto Holiday ${runId}`,
        }
      );
      expect(edited.status, JSON.stringify(edited.data)).toBe(200);
      expect(edited.data.data).toMatchObject({
        id,
        isClosed: false,
        openingTime: "10:00:00",
        closingTime: "14:00:00",
      });
      const listed = await specialHoursRaw(ownerToken, restaurantId, "GET");
      expect(list(listed.data.data).map((r) => r.id)).toEqual([id]);
    } finally {
      const del = await specialHoursRaw(ownerToken, restaurantId, "DELETE", id);
      expect(del.status, JSON.stringify(del.data)).toBe(200);
    }
    expect(
      (await specialHoursRaw(ownerToken, restaurantId, "DELETE", id)).status
    ).toBe(404);
    const after = await orderingStatusRaw(ownerToken, restaurantId);
    expect((after.data.data as Rec).todaySpecial).toBeNull();
  });

  test("TC-947: an owner's settings change is recorded as Recent changes, filtered by area; a stranger can't read it", async () => {
    const settingsPut = (body: Record<string, unknown>) =>
      apiRequestRaw(
        "PUT",
        `/api/restaurantId/${restaurantId}/settings`,
        body,
        ownerToken
      );
    const off = await settingsPut({ autoAcceptOrders: true });
    expect(off.status, JSON.stringify(off.data)).toBe(200);
    try {
      const r = await settingChangesRaw(ownerToken, restaurantId, {
        area: "ordering",
      });
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const items = r.data.data?.items ?? [];
      const change = items.find((i) => i.field === "autoAcceptOrders");
      expect(change, JSON.stringify(items)).toBeTruthy();
      expect(change).toMatchObject({
        area: "ordering",
        actorType: "OWNER",
        actorName: "Auto SecondOwner",
        oldValue: false,
        newValue: true,
      });
      // One resolved sentence, naming who did what (no key, no field name).
      expect(change?.sentence).toContain("Auto SecondOwner");
      expect(change?.sentence).toContain("turned on");
      expect(looksLikeKey(change?.sentence)).toBe(false);
      expect(change?.sentence).not.toContain("autoAcceptOrders");

      // Another area's filter leaves it out; the area list names all nine.
      const hours = await settingChangesRaw(ownerToken, restaurantId, {
        area: "hours",
      });
      expect((hours.data.data?.items ?? []).map((i) => i.field)).not.toContain(
        "autoAcceptOrders"
      );
      expect((r.data.data?.areas ?? []).map((a) => a.key)).toEqual([
        "ordering",
        "hours",
        "feesTips",
        "dineIn",
        "salesTax",
        "devices",
        "stations",
        "setup",
        "books",
        "staff",
        "other",
      ]);

      const stranger = await settingChangesRaw(strangerToken, restaurantId);
      expect(stranger.status).toBe(403);
    } finally {
      await settingsPut({ autoAcceptOrders: false });
    }
  });

  test("TC-948: the morning summary is on by default and the owner's switch turns it off and on", async () => {
    const before = await reportSettingsRaw(ownerToken, restaurantId);
    expect(before.status, JSON.stringify(before.data)).toBe(200);
    // On by default, while the business report itself stays off.
    expect(before.data.data).toMatchObject({
      morningSummaryEnabled: true,
      enabled: false,
    });

    const off = await reportSettingsRaw(ownerToken, restaurantId, {
      morningSummaryEnabled: false,
    });
    expect(off.status, JSON.stringify(off.data)).toBe(200);
    expect(off.data.data?.morningSummaryEnabled).toBe(false);
    // Only that switch moved.
    expect(off.data.data?.enabled).toBe(false);
    expect(
      (await reportSettingsRaw(ownerToken, restaurantId)).data.data
        ?.morningSummaryEnabled
    ).toBe(false);

    const on = await reportSettingsRaw(ownerToken, restaurantId, {
      morningSummaryEnabled: true,
    });
    expect(on.status).toBe(200);
    expect(on.data.data?.morningSummaryEnabled).toBe(true);

    // A stranger can't flip it.
    const stranger = await reportSettingsRaw(strangerToken, restaurantId, {
      morningSummaryEnabled: false,
    });
    expect(stranger.status).toBe(403);
    expect(
      (await reportSettingsRaw(ownerToken, restaurantId)).data.data
        ?.morningSummaryEnabled
    ).toBe(true);
  });
});
