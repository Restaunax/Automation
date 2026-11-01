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
 *
 * The second block (TC-1180..1184, RestauNax W5 Stage 1) covers the paid
 * add-ons outside the back office — Menu TVs, Social Media, Voice AI — both
 * ways through an HQ grant, and another owner probing (404, never "you lack
 * the add-on"). Gated by RELEASED_ON_QA.paywallStage1 until it is on QA.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
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
  ownerAddonRequestRaw,
  apiRequestRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import { addonRequestsLive } from "../../../utils/addonRequestGate";
import { probePaywallStage1, requireRelease } from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const BACK_OFFICE = ["PAYROLL", "SCHEDULING", "TIMECARDS", "TIP_MANAGEMENT"];

test.describe.configure({ mode: "serial" });

test.describe("Back-office add-ons gate every surface (API)", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenant"
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
    ownerMemberId = await setOwnerPosPin(ownerToken, restaurantId, PIN, {
      clocksIn: true,
    });
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

  test("TC-564: no add-ons — the POS time clock has clock-in and breaks, no job picker; timecard review and the schedule are refused", async () => {
    const clock = await timeClock();
    // Break types come with STAFF (free); the clock-in rule needs SCHEDULING.
    expect(
      list(clock.breakTypes)
        .map((b) => b.id)
        .sort()
    ).toEqual(["meal", "rest"]);
    expect(clock.clockInRule).toBe("OFF");
    const me = list(clock.data).find((s) => s.id === ownerMemberId) ?? {};
    expect(list(me.jobs)).toHaveLength(0);

    // Basic clock in/out stays free (STAFF floor).
    const inn = await tabletRaw<Rec>(tabletToken, "POST", "/staff/clock-in", {
      staffMemberId: ownerMemberId,
      pin: PIN,
    });
    expect(inn.status, JSON.stringify(inn.data)).toBe(200);
    // Basic breaks are free (packaging v2): a break starts and ends with no
    // add-on; api-free-breaks covers the hours.
    const brk = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/staff/break/start",
      { staffMemberId: ownerMemberId, pin: PIN, breakTypeId: "rest" }
    );
    expect(brk.status, JSON.stringify(brk.data)).toBe(200);
    const brkEnd = await tabletRaw<Rec>(
      tabletToken,
      "POST",
      "/staff/break/end",
      {
        staffMemberId: ownerMemberId,
        pin: PIN,
      }
    );
    expect(brkEnd.status, JSON.stringify(brkEnd.data)).toBe(200);
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

  test("TC-565: no add-ons — Restaunax Staff lists the restaurant with no sections and refuses time off", async () => {
    // restaunax #913: still listed (leaving it out told the person their
    // account wasn't linked), flagged as having no staff-app sections yet.
    expect(await staffAppRequests()).toMatchObject({
      staffAppEnabled: false,
      schedule: false,
      hours: false,
      tips: false,
      payStubs: false,
    });
    const me = await staffAppRaw<{ data: Rec }>(ownerToken, "GET", "/me");
    expect(list(me.data.data.staffWithoutAppSections)).toEqual([
      expect.objectContaining({ restaurantId }),
    ]);
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
    // Route-level gate since #909: the PAYROLL package itself.
    expect(embedded.status).toBe(403);
    expect(embedded.data).toMatchObject({ error: "FEATURE_NOT_ENTITLED" });

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
    expect(await staffAppRequests()).toMatchObject({
      requests: true,
      schedule: true,
      hours: true,
      tips: false,
      payStubs: false,
    });

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

  test("TC-567: SCHEDULING + TIP_MANAGEMENT, then Tip Management alone — tips without the schedule", async () => {
    await grant("TIP_MANAGEMENT");
    expect(await features()).toEqual(
      ["SCHEDULING", "TIMECARDS", "TIP_MANAGEMENT"].sort()
    );
    expect((await ownerStatuses()).tips).toBe(200);
    const provider = await payrollProviderRaw(
      ownerToken,
      restaurantId,
      "GET",
      ""
    );
    expect(provider.data.data.payrollEntitled, "tips aren't payroll").toBe(
      false
    );

    // Tip Management on its own: it brings TIMECARDS (tips split by hours).
    await remove("SCHEDULING");
    expect(await features()).toEqual(["TIMECARDS", "TIP_MANAGEMENT"].sort());
    expect(await ownerStatuses()).toEqual({
      jobs: 200,
      settings: 200,
      schedule: 403,
      tips: 200,
      provider: 200,
    });
    // Losing SCHEDULING turns the saved WARN rule off on the POS.
    expect((await timeClock()).clockInRule).toBe("OFF");
    expect(await staffAppRequests()).toMatchObject({
      requests: false,
      schedule: false,
      hours: true,
      tips: true,
    });
  });

  test("TC-568: PAYROLL alone brings tips and timecards; Tip Management can't be bought on top; TIMECARDS is never granted alone", async () => {
    await remove("TIP_MANAGEMENT");
    await grant("PAYROLL");
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
    const provider = await payrollProviderRaw(
      ownerToken,
      restaurantId,
      "GET",
      ""
    );
    expect(provider.data.data.payrollEntitled).toBe(true);

    // The owner catalogue shows Tip Management as included, never addable.
    const offered = list(
      (await ownerAddonsRaw(ownerToken, restaurantId, "GET")).data.data?.addons
    );
    const tips = offered.find((x) => x.feature === "TIP_MANAGEMENT");
    test.info().annotations.push({
      type: "catalogue",
      description: `back-office add-ons offered on QA: ${
        offered
          .map((x) => `${x.feature}:${x.status}`)
          .filter((x) => /SCHEDULING|TIP_MANAGEMENT|PAYROLL/.test(x))
          .join(", ") || "none"
      }`,
    });
    if (tips) {
      // Since restaunax #998 owners only request add-ons: the row has no
      // request button while it's included, and the old purchase route is
      // gone (404). Before #998: canAdd false and the purchase refused (400).
      const live = await addonRequestsLive(adminToken);
      expect(tips).toMatchObject(
        live
          ? {
              status: "INCLUDED",
              canRequestAdd: false,
              canRequestRemove: false,
            }
          : { status: "INCLUDED", canAdd: false }
      );
      const bought = await ownerAddonsRaw(ownerToken, restaurantId, "POST", {
        addonId: tips.id,
      });
      expect(bought.status, JSON.stringify(bought.data)).toBe(live ? 404 : 400);
    }

    // TIMECARDS is a component: never granted alone…
    const alone = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TIMECARDS",
      true
    );
    expect(alone.status).toBe(400);
    expect(
      String((alone.data as Rec).message ?? (alone.data as Rec).error)
    ).toMatch(/part of a package/);
    // …but an admin may revoke it inside a package.
    await grant("TIMECARDS", false);
    expect((await ownerStatuses()).jobs).toBe(403);
    await remove("TIMECARDS");
    expect((await ownerStatuses()).jobs).toBe(200);
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
    expect((await staffAppRequests())?.staffAppEnabled).toBe(false);

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
      // Since restaunax #998 every active add-on is offered to a storefront
      // and the owner REQUESTS it; a home seller's request for a back-office
      // add-on is refused (404 "isn't available"). Before #998 the purchase
      // route refused it (400).
      const live = await addonRequestsLive(adminToken);
      if (live)
        expect(forStore.map((x) => x.feature)).toEqual(
          expect.arrayContaining(["SCHEDULING", "TIP_MANAGEMENT"])
        );
      for (const addon of forStore) {
        const bought = live
          ? await ownerAddonRequestRaw(adminToken, homeId, {
              addonId: addon.id,
              kind: "ADD",
            })
          : await ownerAddonsRaw(adminToken, homeId, "POST", {
              addonId: addon.id,
            });
        expect(
          bought.status,
          `${addon.feature} offered to a home seller: ${JSON.stringify(bought.data)}`
        ).toBe(live ? 404 : 400);
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

// ── Menu TVs, Social Media, Voice AI (RestauNax W5:C1/H1/T3/L2) ──────────────

test.describe("Paid add-ons outside the back office gate their routes (API)", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenants"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let strangerToken = "";
  let strangerRestaurantId = "";
  let tvToken = "";
  let tvId = "";

  type Envelope = {
    success?: boolean;
    error?: string;
    feature?: string;
    message?: string;
    data?: Rec;
  };
  const owner = (method: string, path: string, body?: unknown) =>
    apiRequestRaw<Envelope>(method, path, body, ownerToken);
  const tv = (path: string) =>
    apiRequestRaw<Envelope>("GET", path, undefined, tvToken);
  const grant = async (feature: string, enabled: boolean) => {
    const r = enabled
      ? await setFeatureOverrideAdminRaw(
          adminToken,
          restaurantId,
          feature,
          true,
          `automation paid add-ons ${runId}`
        )
      : await deleteFeatureOverrideAdminRaw(adminToken, restaurantId, feature);
    // Removing an override that isn't there answers 404: already off.
    const ok = r.status < 300 || (!enabled && r.status === 404);
    expect(ok, `${feature} → ${r.status} ${JSON.stringify(r.data)}`).toBe(true);
  };
  const expectNotEntitled = (
    label: string,
    res: { status: number; data: Envelope },
    feature: string
  ) => {
    expect(
      { label, status: res.status, error: res.data?.error },
      JSON.stringify(res.data)
    ).toEqual({ label, status: 403, error: "FEATURE_NOT_ENTITLED" });
    expect(res.data?.feature).toBe(feature);
    // Resolved text, never an i18n key.
    expect(String(res.data?.message ?? "")).not.toMatch(/^(error|api):/);
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, `${runId}p`);
    const other = await createSecondOwner(adminToken, `${runId}q`);
    if (!tenant.restaurantId || !other.restaurantId)
      throw new Error("[api-addon-gating] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    strangerRestaurantId = other.restaurantId;
    strangerToken = other.accessToken;
  });

  test.afterAll(async () => {
    for (const id of [restaurantId, strangerRestaurantId]) {
      if (adminToken && id)
        await deleteTestRestaurant(adminToken, id).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Add-on gating");
    await allure.label("severity", "critical");
    requireRelease(
      "paywallStage1",
      await probePaywallStage1(ownerToken, restaurantId)
    );
  });

  test("TC-1180: Menu TVs without the add-on — claim, the TV list and layouts are refused; pairing a TV stays free", async () => {
    const initiate = await owner("POST", "/api/menu-tv/pair/initiate", {
      restaurantId,
      name: `Auto TV ${runId}`,
    });
    expect(initiate.status, JSON.stringify(initiate.data)).toBe(201);
    tvToken = String(initiate.data.data?.token ?? "");
    tvId = String(initiate.data.data?.deviceId ?? "");
    const code = String(initiate.data.data?.pairingCode ?? "");

    expectNotEntitled(
      "claim",
      await owner("POST", "/api/menu-tv/pair/claim", { code, name: "Bar TV" }),
      "MENU_TVS"
    );
    expectNotEntitled(
      "list",
      await owner("GET", `/api/menu-tv/restaurants/${restaurantId}/devices`),
      "MENU_TVS"
    );
    expectNotEntitled(
      "layouts",
      await owner("GET", `/api/menu-tv/layouts?restaurantId=${restaurantId}`),
      "MENU_TVS"
    );
    // The pending TV is still waiting for its code.
    const me = await tv("/api/menu-tv/me");
    expect(me.status).toBe(200);
    expect(me.data.data?.pending).toBe(true);
  });

  test("TC-1181: Menu TVs with an HQ grant — the TV is claimed and shows the menu; taking the grant away pauses it without unpairing", async () => {
    await grant("MENU_TVS", true);
    const pending = await tv("/api/menu-tv/me");
    const code = String(pending.data.data?.pairingCode ?? "");
    const claim = await owner("POST", "/api/menu-tv/pair/claim", {
      code,
      name: "Bar TV",
    });
    expect(claim.status, JSON.stringify(claim.data)).toBe(200);
    const list = await owner(
      "GET",
      `/api/menu-tv/restaurants/${restaurantId}/devices`
    );
    expect(list.status).toBe(200);

    const live = await tv("/api/menu-tv/me");
    expect(live.status).toBe(200);
    expect(live.data.data?.pending).toBe(false);
    expect(live.data.data?.paused ?? null).toBeNull();

    await grant("MENU_TVS", false);
    const paused = await apiRequestRaw<Envelope>(
      "GET",
      "/api/menu-tv/me",
      undefined,
      tvToken,
      { "Accept-Language": "es" }
    );
    // D1: never 401/403 for the TV — 200, empty menu, a resolved message.
    expect(paused.status).toBe(200);
    const data = paused.data.data as Rec;
    expect((data.device as Rec).id).toBe(tvId);
    expect((data.menu as Rec).menus).toEqual([]);
    expect((data.paused as Rec).reason).toBe("ADDON_OFF");
    expect(String((data.paused as Rec).message)).toMatch(/RestauNax/);
    const beat = await apiRequestRaw(
      "POST",
      "/api/menu-tv/me/heartbeat",
      undefined,
      tvToken
    );
    expect(beat.status).toBe(200);

    // Unpairing stays possible without the add-on.
    const unpair = await owner("DELETE", `/api/menu-tv/devices/${tvId}`);
    expect(unpair.status).toBe(200);
  });

  test("TC-1182: Social Media — the suite and AI media refuse without the add-on and answer with an HQ grant", async () => {
    const reads = [
      `/api/social-media/accounts/${restaurantId}`,
      `/api/social-media/posts/${restaurantId}`,
      `/api/social-media/restaurants/${restaurantId}/featured-reels`,
    ];
    const media = () =>
      apiRequestRaw<Envelope>(
        "GET",
        "/api/media/quota",
        undefined,
        ownerToken,
        {
          "X-Restaurant-Id": restaurantId,
        }
      );
    for (const path of reads)
      expectNotEntitled(path, await owner("GET", path), "SOCIAL_MEDIA");
    expectNotEntitled(
      "create post",
      await owner("POST", "/api/social-media/posts", {
        restaurantId,
        content: "Taco Tuesday",
      }),
      "SOCIAL_MEDIA"
    );
    expectNotEntitled("media quota", await media(), "SOCIAL_MEDIA");

    await grant("SOCIAL_MEDIA", true);
    try {
      for (const path of reads) {
        const res = await owner("GET", path);
        expect({ path, status: res.status }).toEqual({ path, status: 200 });
      }
      expect((await media()).status).toBe(200);
    } finally {
      await grant("SOCIAL_MEDIA", false);
    }
  });

  test("TC-1183: Voice AI — the owner summary needs the add-on, and the AI line can't be switched back on without it", async () => {
    expectNotEntitled(
      "owner summary",
      await owner(
        "GET",
        `/api/voice/owner-summary/${restaurantId}?window=week`
      ),
      "VOICE_AI"
    );
    expectNotEntitled(
      "enable the line",
      await owner("PATCH", `/api/voice/config/${restaurantId}`, {
        enabled: true,
      }),
      "VOICE_AI"
    );
    await grant("VOICE_AI", true);
    try {
      const summary = await owner(
        "GET",
        `/api/voice/owner-summary/${restaurantId}?window=week`
      );
      expect(summary.status, JSON.stringify(summary.data)).toBe(200);
    } finally {
      await grant("VOICE_AI", false);
    }
  });

  test("TC-1184: another owner learns nothing — 404 on every add-on route, add-on on or off", async () => {
    const probes = [
      `/api/staff/payroll/${restaurantId}/jobs`,
      `/api/staff/tips/${restaurantId}/policy`,
      `/api/staff/scheduling/${restaurantId}`,
      `/api/staff/payroll-provider/${restaurantId}`,
      `/api/accounting/${restaurantId}`,
      `/api/menu-tv/restaurants/${restaurantId}/devices`,
      `/api/social-media/posts/${restaurantId}`,
    ];
    for (const on of [false, true]) {
      for (const f of [
        "SCHEDULING",
        "TIP_MANAGEMENT",
        "MENU_TVS",
        "SOCIAL_MEDIA",
      ])
        await grant(f, on);
      for (const path of probes) {
        const res = await apiRequestRaw<Envelope>(
          "GET",
          path,
          undefined,
          strangerToken
        );
        expect({ path, on, status: res.status }).toEqual({
          path,
          on,
          status: 404,
        });
        expect(res.data?.error).not.toBe("FEATURE_NOT_ENTITLED");
      }
    }
    for (const f of [
      "SCHEDULING",
      "TIP_MANAGEMENT",
      "MENU_TVS",
      "SOCIAL_MEDIA",
    ])
      await grant(f, false);
  });
});
