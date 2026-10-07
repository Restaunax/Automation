/**
 * 21-back-office-staff-ui.spec.ts — the dashboard's Staff area follows the
 * restaurant's add-ons, and its core screens render (TC-628..634).
 *
 * Browser. A per-run throwaway owner logs in through the UI (loginViaUi) and
 * opens Restaurant Management → Staff (?tab=staff). Add-ons are switched by
 * admin override between steps and the page reloaded:
 *   none       → People, Shifts, Roles, Discount & void rules — nothing else;
 *   SCHEDULING → + Schedule, Requests, Timecards, Labor, Jobs & wages,
 *                Payroll settings (Timecards replaces Shifts); no tips;
 *   + PAYROLL  → + Tips, Tip policy; Payroll settings offers the three ways
 *                to run payroll;
 *   removed    → back to the core tabs.
 * Plus: Roles lists the four presets, Jobs & wages shows a job and its rate,
 * People shows an invited person.
 */
import * as allure from "allure-js-commons";
import type { Page } from "@playwright/test";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  inviteStaffRaw,
  createStaffJobRaw,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

const CORE = ["People", "Shifts", "Roles", "Discount & void rules"];

test.describe.configure({ mode: "serial" });

test.describe("Owner — Staff area follows the add-ons (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;
  const jobName = `Barista ${runId}`;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const openStaff = async (staffTab?: string) => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=staff${
        staffTab ? `&staffTab=${staffTab}` : ""
      }`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page().getByRole("tab", { name: "People" })).toBeVisible({
      timeout: 20_000,
    });
  };
  /** Tab labels as shown (a badge count is stripped). */
  const tabs = async () =>
    (await page().getByRole("tab").allTextContents())
      .map((t) => t.replace(/\d+$/, "").trim())
      .filter(Boolean);
  const grant = async (feature: string) => {
    const r = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      feature,
      true
    );
    expect(r.ok, JSON.stringify(r.data)).toBe(true);
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[staff-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await inviteStaffRaw(ownerToken, restaurantId, {
      email: `auto-ui-quinn-${runId}@${DOMAIN}`,
      firstName: "Quinn",
      lastName: "Ui",
    });
    session = await loginViaUi(
      browser,
      tenant.email,
      process.env.OWNER2_PASSWORD || `Automation!Owner2-${runId}`
    );
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Staff (dashboard)");
    await allure.label("severity", "critical");
  });

  test("TC-628: without add-ons the Staff area shows only the core tabs; People lists an invite", async () => {
    await openStaff();
    expect(await tabs()).toEqual(CORE);
    await expect(
      page().getByText("Quinn", { exact: false }).first()
    ).toBeVisible();
  });

  test("TC-629: SCHEDULING adds the schedule, requests, timecards, labor, jobs and payroll settings — not tips", async () => {
    await grant("SCHEDULING");
    await openStaff();
    expect(await tabs()).toEqual([
      "People",
      "Schedule",
      "Requests",
      "Timecards",
      "Labor",
      "Jobs & wages",
      "Payroll settings",
      "Roles",
      "Discount & void rules",
    ]);
  });

  test("TC-630: PAYROLL adds tips and the tip policy; Payroll settings offers three ways to run payroll", async () => {
    await grant("PAYROLL");
    await openStaff("payrollSettings");
    const shown = await tabs();
    expect(shown).toContain("Tips");
    expect(shown).toContain("Tip policy");
    await expect(page().getByText("How you run payroll")).toBeVisible({
      timeout: 15_000,
    });
    for (const mode of ["Payroll file", "Your own Gusto", "RestauNax Payroll"])
      await expect(
        page().getByText(mode, { exact: true }).first()
      ).toBeVisible();
  });

  test("TC-631: Roles lists the four preset roles", async () => {
    await openStaff("roles");
    for (const role of ["Owner", "Manager", "Shift lead", "Staff"])
      await expect(page().getByText(role, { exact: true }).first()).toBeVisible(
        {
          timeout: 15_000,
        }
      );
  });

  test("TC-632: Jobs & wages shows a job with its default rate", async () => {
    const job = await createStaffJobRaw(ownerToken, restaurantId, {
      name: jobName,
      defaultHourlyRateCents: 1550,
    });
    expect(job.status).toBe(201);
    await openStaff("jobs");
    const row = page().getByText(jobName).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(page().getByText("$15.50").first()).toBeVisible();
  });

  test("TC-633: removing the add-ons takes the tabs away again", async () => {
    for (const f of ["PAYROLL", "SCHEDULING"])
      await deleteFeatureOverrideAdminRaw(adminToken, restaurantId, f);
    await openStaff();
    expect(await tabs()).toEqual(CORE);
  });

  test("TC-634: a direct link to a gated tab without the add-on shows no gated screen", async () => {
    await openStaff("timecards");
    expect(await tabs()).toEqual(CORE);
    await expect(page().getByText("How you run payroll")).toHaveCount(0);
  });
});
