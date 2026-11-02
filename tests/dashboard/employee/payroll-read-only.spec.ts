/**
 * payroll-read-only.spec.ts — RestauNax company staff (role EMPLOYEE) can
 * look at a restaurant's payroll, wages and tip rules but not change them
 * (TC-1186, RestauNax W5:L4). A RestauNax ADMIN still can (the logged
 * override). Throwaway tenant with Scheduling & Timecards + Tip Management
 * granted by HQ. API only.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import { probePaywallStage1, requireRelease } from "../../../utils/releaseGate";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  payrollRaw,
  tipsRaw,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? "";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

test.describe("Employee — read-only on payroll, wages and tip rules (API)", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD", "EMPLOYEE_EMAIL", "EMPLOYEE_PASSWORD"],
    "mints a tenant as HQ, then acts as company staff"
  );

  const runId = generateRunId();
  let adminToken = "";
  let employeeToken = "";
  let ownerToken = "";
  let restaurantId = "";

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !EMPLOYEE_EMAIL) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    employeeToken = (await apiLogin(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD))
      .accessToken;
    const tenant = await createSecondOwner(adminToken, `${runId}e`);
    if (!tenant.restaurantId) throw new Error("[payroll-read-only] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    for (const feature of ["SCHEDULING", "TIP_MANAGEMENT"]) {
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true,
        `automation employee read-only ${runId}`
      );
      if (g.status >= 300)
        throw new Error(`[payroll-read-only] grant: ${JSON.stringify(g.data)}`);
    }
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Add-on gating");
    await allure.label("severity", "critical");
    requireRelease(
      "paywallStage1",
      await probePaywallStage1(ownerToken, restaurantId)
    );
  });

  test("TC-1186: EMPLOYEE reads jobs, settings and the tip policy, but every change is refused; ADMIN's change goes through", async () => {
    for (const path of ["/jobs", "/settings"]) {
      const read = await payrollRaw(employeeToken, restaurantId, "GET", path);
      expect({ path, status: read.status }).toEqual({ path, status: 200 });
    }
    const policy = await tipsRaw(employeeToken, restaurantId, "GET", "/policy");
    expect(policy.status).toBe(200);

    const job = { name: `HQ job ${runId}`, defaultHourlyRateCents: 1500 };
    const refusals = [
      await payrollRaw(employeeToken, restaurantId, "POST", "/jobs", job),
      await payrollRaw(employeeToken, restaurantId, "PUT", "/settings", {}),
      await tipsRaw(employeeToken, restaurantId, "PUT", "/policy", {}),
    ];
    for (const res of refusals) {
      expect(res.status, JSON.stringify(res.data)).toBe(403);
      expect(res.data).toMatchObject({ error: "PLATFORM_EMPLOYEE_READ_ONLY" });
      expect(String((res.data as { message?: string }).message)).toMatch(
        /RestauNax staff/
      );
    }

    const byAdmin = await payrollRaw(
      adminToken,
      restaurantId,
      "POST",
      "/jobs",
      job
    );
    expect(byAdmin.status, JSON.stringify(byAdmin.data)).toBeLessThan(300);
  });
});
