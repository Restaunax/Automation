/**
 * api-addon-gating.spec.ts — back-office add-ons gate every surface (TC-563..569).
 *
 * No browser (the dashboard's navigation is covered by the UI spec). One
 * throwaway restaurant walks the packaging ladder from E0
 * (restaunax docs/features/back-office/E0_ENTITLEMENTS_AND_PACKAGING.md):
 *   nothing → SCHEDULING only → SCHEDULING + PAYROLL → PAYROLL only → nothing
 * and at each rung asks every surface what it sees:
 *   - the owner API (payroll, scheduling, tips, payroll provider routes);
 *   - the entitlement sets the dashboard (/restaurant/.../features) and the
 *     POS (/api/tablet/features) gate their screens on;
 *   - the POS time clock (job picker, breaks, clock-in rule, schedule tile);
 *   - Restaunax Staff (/me "requests", time off).
 * Core features (roles, sales tax, reports, basic clock in/out) answer at
 * every rung. Removing an add-on hides it without losing its data.
 *
 * The owner's own POS membership (my-pin) doubles as the staff-app account,
 * so no invite email is needed. Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  setOwnerPosPin,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  tabletRaw,
  ownerStaffRaw,
  payrollRaw,
  schedulingRaw,
  tipsRaw,
  payrollProviderRaw,
  staffAppRaw,
  getRestaurantFeaturesRaw,
  createStaffJobRaw,
  setMemberJobsRaw,
  createShiftRaw,
  getScheduleWeekRaw,
  taxRaw,
  reportsRaw,
  createRestaurantRaw,
  ownerAddonsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const BACK_OFFICE = ["PAYROLL", "SCHEDULING", "TIMECARDS", "TIP_MANAGEMENT"];

test.describe.configure({ mode: "serial" });

test.describe("Back-office add-ons gate every surface (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tabletToken = "";
  let ownerMemberId = "";
  const PIN = "5813";
  let jobId = "";
  let shiftId = "";
  const SHIFT_DATE = day(9);

  /** What the owner API answers on each gated router (status codes). */
  const ownerStatuses = async () => {
    const [jobs, settings, schedule, tips, provider] = await Promise.all([
      payrollRaw(ownerToken, restaurantId, "GET", "/jobs"),
      payrollRaw(ownerToken, restaurantId, "GET", "/settings"),
      schedulingRaw(ownerToken, restaurantId, "GET", `?date=${day(0)}`),
      tipsRaw(ownerToken, restaurantId, "GET", "/policy"),
      payrollProviderRaw(ownerToken, restaurantId, "GET", ""),
    ]);
    return {
      jobs: jobs.status,
      settings: settings.status,
      schedule: schedule.status,
      tips: tips.status,
      provider: provider.status,
    };
  };

  const features = async () => {
    const dash = await getRestaurantFeaturesRaw(ownerToken, restaurantId);
    expect(dash.status).toBe(200);
    const pos = await tabletRaw<{ features?: string[] }>(
      tabletToken,
      "GET",
      "/features"
    );
    expect(pos.status).toBe(200);
    const d = (dash.data.data?.features ?? []).filter((f) =>
      BACK_OFFICE.includes(f)
    );
    const p = (pos.data.features ?? []).filter((f) => BACK_OFFICE.includes(f));
    // Dashboard and POS must agree on what this restaurant has.
    expect(p.sort()).toEqual(d.sort());
    return d.sort();
  };

  const timeClock = async () => {
    const res = await tabletRaw<Rec>(tabletToken, "GET", "/staff/time-clock");
    expect(res.status).toBe(200);
    return res.data;
  };

  const staffAppRequests = async () => {
    const me = await staffAppRaw<{ data: Rec }>(ownerToken, "GET", "/me");
    expect(me.status).toBe(200);
    return list(me.data.data.restaurants).find(
      (r) => r.restaurantId === restaurantId
    );
  };

  const grant = async (feature: string, enabled = true) => {
    const r = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      feature,
      enabled,
      `automation gating ${runId}`
    );
    expect(r.ok, JSON.stringify(r.data)).toBe(true);
  };
  const remove = async (feature: string) => {
    const r = await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      feature
    );
    expect(r.status, JSON.stringify(r.data)).toBeLessThan(300);
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-addon-gating] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-gate-${runId}`
    );
    deviceId = device.id;
    tabletToken = await tabletLogin(device.name, device.code);
    ownerMemberId = await setOwnerPosPin(ownerToken, restaurantId, PIN);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Add-on gating");
    await allure.label("severity", "critical");
  });

  test("TC-563: no add-ons — every back-office owner route refuses; core features answer", async () => {
    expect(await features()).toEqual([]);
    expect(await ownerStatuses()).toEqual({
      jobs: 403,
      settings: 403,
      schedule: 403,
      tips: 403,
      provider: 403,
    });
    const refused = await payrollRaw(ownerToken, restaurantId, "GET", "/jobs");
    expect(refused.data).toMatchObject({ error: "FEATURE_NOT_ENTITLED" });
    // Writes are refused too, not just reads.
    const write = await createStaffJobRaw(ownerToken, restaurantId, {
      name: "Nope",
      defaultHourlyRateCents: 1000,
    });
    expect(write.status).toBe(403);

    // Core (never paywalled): staff + roles, sales tax, reports.
    const roles = await ownerStaffRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/roles"
    );
    expect(roles.status).toBe(200);
    const staff = await ownerStaffRaw(ownerToken, restaurantId, "GET");
    expect(staff.status).toBe(200);
    const tax = await taxRaw(ownerToken, restaurantId, "GET", "/rates");
    expect(tax.status).toBe(200);
    const report = await reportsRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/sales-by-day.csv?startDate=${day(-7)}&endDate=${day(0)}`
    );
    expect(report.status).toBe(200);
  });

  test("TC-564: no add-ons — the POS time clock is the plain one; breaks, timecards and schedule are refused", async () => {
    const clock = await timeClock();
    expect(clock.breakTypes).toEqual([]);
    expect(clock.clockInRule).toBe("OFF");
    const me = list(clock.data).find((s) => s.id === ownerMemberId) ?? {};
    expect(list(me.jobs)).toHaveLength(0);

    // Basic clock in/out stays free (STAFF floor).
    const inn = await tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
      staffMemberId: ownerMemberId,
      pin: PIN,
    });
    expect(inn.status, JSON.stringify(inn.data)).toBe(200);
    const brk = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/staff/break/start",
      {
        staffMemberId: ownerMemberId,
        pin: PIN,
        breakTypeId: "any",
      }
    );
    expect(brk.status).toBe(403);
    const out = await tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-out", {
      staffMemberId: ownerMemberId,
      pin: PIN,
    });
    expect(out.status, JSON.stringify(out.data)).toBe(200);

    const signIn = await tabletRaw<Rec>(tabletToken, "POST", "/staff/sign-in", {
      staffMemberId: ownerMemberId,
      pin: PIN,
    });
    expect(signIn.status).toBe(200);
    const session = String(signIn.data.data.staffSessionToken);
    const review = await tabletRaw(
      tabletToken,
      "GET",
      "/timecards/review",
      undefined,
      session
    );
    expect(review.status, "timecard review needs TIMECARDS").toBe(403);
    const today = await tabletRaw(
      tabletToken,
      "GET",
      "/schedule/today",
      undefined,
      session
    );
    expect(today.status, "today's schedule needs SCHEDULING").toBe(403);
  });

  test("TC-565: no add-ons — Restaunax Staff shows no requests and refuses time off", async () => {
    const r = await staffAppRequests();
    expect(r).toMatchObject({ requests: false, payStubs: false });
    const off = await staffAppRaw(
      ownerToken,
      "POST",
      `/restaurants/${restaurantId}/time-off`,
      { startDate: day(20), endDate: day(20), type: "UNPAID" }
    );
    expect(off.status).toBe(403);
  });

  test("TC-566: SCHEDULING only — schedule, jobs and the clock-in rule appear; tips and payroll runs don't", async () => {
    await grant("SCHEDULING");
    expect(await features()).toEqual(["SCHEDULING", "TIMECARDS"]);
    expect(await ownerStatuses()).toEqual({
      jobs: 200,
      settings: 200,
      schedule: 200,
      tips: 403,
      // P4 (connect your own Gusto) sends approved hours: TIMECARDS.
      provider: 200,
    });
    // Running payroll through RestauNax (P5) is PAYROLL only.
    const provider = await payrollProviderRaw(
      ownerToken,
      restaurantId,
      "GET",
      ""
    );
    expect(provider.data.data.payrollEntitled).toBe(false);
    const embedded = await payrollProviderRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/embedded/start",
      { legalName: `Automation ${runId} LLC`, acceptTerms: true }
    );
    expect(embedded.status).toBe(400);
    expect(String(embedded.data.message)).toMatch(/Payroll & Team add-on/);

    // The clock-in rule is OFF until the owner picks one; with SCHEDULING
    // the POS gets whatever they pick.
    expect((await timeClock()).clockInRule).toBe("OFF");
    const rule = await payrollRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/settings",
      {
        scheduling: { clockInRule: "WARN" },
      }
    );
    expect(rule.status, JSON.stringify(rule.data)).toBe(200);
    const clock = await timeClock();
    expect(clock.clockInRule).toBe("WARN");
    expect(
      list(clock.breakTypes)
        .map((b) => b.id)
        .sort()
    ).toEqual(["meal", "rest"]);
    expect((await staffAppRequests())?.requests).toBe(true);

    // Data made under SCHEDULING, to prove it survives the add-on going.
    const job = await createStaffJobRaw(ownerToken, restaurantId, {
      name: `Line cook ${runId}`,
      defaultHourlyRateCents: 1700,
    });
    expect(job.status, JSON.stringify(job.data)).toBe(201);
    jobId = String(job.data.data?.id);
    const held = await setMemberJobsRaw(
      ownerToken,
      restaurantId,
      ownerMemberId,
      [{ jobId, isPrimary: true }]
    );
    expect(held.status, JSON.stringify(held.data)).toBe(200);
    const shift = await createShiftRaw(ownerToken, restaurantId, {
      staffMemberId: ownerMemberId,
      jobId,
      startAt: `${SHIFT_DATE}T18:00:00.000Z`,
      endAt: `${SHIFT_DATE}T22:00:00.000Z`,
    });
    expect(shift.status, JSON.stringify(shift.data)).toBe(201);
    shiftId = String(shift.data.data?.shift.id);

    // The POS job picker now offers it.
    const me = list((await timeClock()).data).find(
      (s) => s.id === ownerMemberId
    );
    expect(list(me?.jobs).length).toBe(1);
  });

  test("TC-567: + PAYROLL — tips appear; PAYROLL alone keeps jobs and tips but drops scheduling", async () => {
    await grant("PAYROLL");
    expect(await features()).toEqual(
      ["PAYROLL", "SCHEDULING", "TIMECARDS", "TIP_MANAGEMENT"].sort()
    );
    expect((await ownerStatuses()).tips).toBe(200);
    const provider = await payrollProviderRaw(
      ownerToken,
      restaurantId,
      "GET",
      ""
    );
    expect(provider.data.data.payrollEntitled).toBe(true);

    await remove("SCHEDULING");
    expect(await features()).toEqual(
      ["PAYROLL", "TIMECARDS", "TIP_MANAGEMENT"].sort()
    );
    expect(await ownerStatuses()).toEqual({
      jobs: 200,
      settings: 200,
      schedule: 403,
      tips: 200,
      provider: 200,
    });
    // Losing SCHEDULING turns the saved WARN rule off on the POS.
    expect((await timeClock()).clockInRule).toBe("OFF");
    expect((await staffAppRequests())?.requests).toBe(false);
  });

  test("TC-568: a component can't be granted alone; revoking a component hides it under its package", async () => {
    const alone = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TIP_MANAGEMENT",
      true
    );
    expect(alone.status).toBe(400);
    // An admin may revoke a component inside a package.
    await grant("TIP_MANAGEMENT", false);
    expect(await features()).toEqual(["PAYROLL", "TIMECARDS"].sort());
    expect((await ownerStatuses()).tips).toBe(403);
    await remove("TIP_MANAGEMENT");
    expect((await ownerStatuses()).tips).toBe(200);
  });

  test("TC-569: removing the add-ons hides everything again; granting back finds the data intact", async () => {
    await remove("PAYROLL");
    expect(await features()).toEqual([]);
    expect(await ownerStatuses()).toEqual({
      jobs: 403,
      settings: 403,
      schedule: 403,
      tips: 403,
      provider: 403,
    });
    const me = list((await timeClock()).data).find(
      (s) => s.id === ownerMemberId
    );
    expect(list(me?.jobs), "no job picker without TIMECARDS").toHaveLength(0);

    await grant("SCHEDULING");
    const jobs = await payrollRaw(ownerToken, restaurantId, "GET", "/jobs");
    expect(list(jobs.data.data).some((j) => j.id === jobId)).toBe(true);
    const week = await getScheduleWeekRaw(ownerToken, restaurantId, SHIFT_DATE);
    expect(list(week.data.data?.shifts).some((s) => s.id === shiftId)).toBe(
      true
    );
    await remove("SCHEDULING");
  });

  test("TC-635: a home-food seller is never offered or sold back-office add-ons; only an explicit admin override grants them", async () => {
    const created = await createRestaurantRaw(adminToken, {
      name: `Automation Home Kitchen ${runId}`,
      street: "12 Garden Lane",
      city: "Miami",
      state: "FL",
      zipCode: "33101",
      cuisineType: "American",
      restaurantPhone: "3055550178",
      description: "Throwaway home-food seller (gating test)",
      minimumOrderPreparationTime: 0,
      businessType: "HOME_FOOD",
    });
    const homeId = String(
      (created.data as { restaurant?: { id?: string } })?.restaurant?.id ?? ""
    );
    expect(homeId, JSON.stringify(created.data)).not.toBe("");
    try {
      const backOfficeOf = async (id: string) =>
        (
          (await getRestaurantFeaturesRaw(adminToken, id)).data.data
            ?.features ?? []
        )
          .filter((f) => BACK_OFFICE.includes(f))
          .sort();
      expect(await backOfficeOf(homeId)).toEqual([]);

      // The self-serve catalogue: a storefront restaurant vs a home seller.
      const offered = async (token: string, id: string) =>
        list((await ownerAddonsRaw(token, id, "GET")).data.data?.addons).filter(
          (x) => BACK_OFFICE.includes(String(x.feature))
        );
      const forHome = await offered(adminToken, homeId);
      expect(forHome.map((x) => x.feature)).toEqual([]);
      const forStore = await offered(ownerToken, restaurantId);
      for (const addon of forStore) {
        const bought = await ownerAddonsRaw(adminToken, homeId, "POST", {
          addonId: addon.id,
        });
        expect(bought.status, `${addon.feature} sold to a home seller`).toBe(
          400
        );
      }
      test.info().annotations.push({
        type: "catalogue",
        description: `self-serve back-office add-ons on QA: ${
          forStore.map((x) => x.feature).join(", ") || "none"
        }`,
      });

      // Escape hatch by design (restaurantFeatureService step 3): an admin
      // override still grants, with the components.
      await setFeatureOverrideAdminRaw(adminToken, homeId, "SCHEDULING", true);
      expect(await backOfficeOf(homeId)).toEqual(
        ["SCHEDULING", "TIMECARDS"].sort()
      );
    } finally {
      await deleteTestRestaurant(adminToken, homeId).catch(() => {});
    }
  });
});
