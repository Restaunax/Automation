/**
 * api-payroll-gusto.spec.ts — Gusto connection (P4) and RestauNax Payroll
 * (P5) on QA, as far as QA's configuration allows (TC-625..627).
 *
 * The backend reports whether its Gusto client is configured
 * (GET /api/staff/payroll-provider/:rid → providers.GUSTO). When QA's Dokploy
 * env has no GUSTO_* vars this file says so and skips the provider calls —
 * the area is then "blocked: QA Dokploy needs GUSTO vars", not failing.
 * What doesn't need Gusto runs regardless: the payroll mode of a fresh
 * restaurant and the "not connected" answers.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  payrollProviderRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;

test.describe.configure({ mode: "serial" });

test.describe("Payroll provider — Gusto (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let gustoConfigured = false;

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-payroll-gusto] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await setFeatureOverrideAdminRaw(adminToken, restaurantId, "PAYROLL", true);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Payroll provider");
    await allure.label("severity", "normal");
  });

  test("TC-625: a fresh PAYROLL restaurant is not connected and says whether Gusto is available", async () => {
    const r = await payrollProviderRaw(ownerToken, restaurantId, "GET", "");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const data = r.data.data as Rec;
    expect(data).toMatchObject({
      connected: false,
      mode: null,
      payrollEntitled: true,
    });
    expect(typeof data.providers?.GUSTO).toBe("boolean");
    gustoConfigured = data.providers.GUSTO === true;
    test.info().annotations.push({
      type: "gusto",
      description: gustoConfigured
        ? "Gusto is configured on QA"
        : "blocked: QA Dokploy needs GUSTO vars",
    });
  });

  test("TC-626: connecting your own Gusto (P4) hands back Gusto's sign-in page", async () => {
    test.skip(!gustoConfigured, "blocked: QA Dokploy needs GUSTO vars");
    const r = await payrollProviderRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/connect/GUSTO"
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(String(r.data.data?.url)).toMatch(/^https:\/\/[^/]*gusto/);
  });

  test("TC-627: without Gusto configured, connecting is refused with a reason (never a 500)", async () => {
    test.skip(
      gustoConfigured,
      "Gusto is configured: TC-626 covers the happy path"
    );
    const r = await payrollProviderRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/connect/GUSTO"
    );
    expect(r.status).toBe(400);
    expect(String(r.data.message)).toMatch(/isn't switched on yet/);
  });
});
