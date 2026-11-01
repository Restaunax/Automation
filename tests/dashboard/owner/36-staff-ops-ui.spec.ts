/**
 * 36-staff-ops-ui.spec.ts — a light browser check of the dashboard controls
 * added by RestauNax back-office audit Stage 5 "staff operations"
 * (TC-1474, TC-1475). The rules are pinned at API level in
 * api-staff-ops.spec.ts (TC-1460..1472); these only prove the owner can see
 * and use the new settings.
 *
 *   TC-1474  Staff → Time & pay → Payroll settings shows the two staffOps
 *            switches: "Clock out forgotten shifts at the end of the business
 *            day" (on by default) and "Large food establishment" (off).
 *   TC-1475  Staff → Team → Jobs & wages → Add job: a tipped job offers the
 *            "Tipped occupation code" field (IRS TTOC, W3:H6).
 *
 * Browser. A per-run throwaway owner (createSecondOwner alwaysFresh) with the
 * SCHEDULING + PAYROLL add-ons, signed in through the UI (loginViaUi). The
 * restaurant is deleted afterwards. Fails (never skips) without ADMIN creds.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  getPayrollSettingsRaw,
  setFeatureOverrideAdminRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import { activeDialog, DESKTOP } from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const AUTO_CLOCK_OUT =
  "Clock out forgotten shifts at the end of the business day";
const LARGE_FOOD = "Large food establishment";
const TTOC_FIELD = "Tipped occupation code";

type Rec = Record<string, LooseJson>;

test.describe.configure({ mode: "serial" });

test.describe("Owner — staff operations settings (UI)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const groupBar = () => page().getByTestId("staff-groups");
  const openStaff = async (staffTab: string) => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=staff&staffTab=${staffTab}`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(groupBar().getByRole("tab").first()).toBeVisible({
      timeout: 20_000,
    });
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    // Fail, never skip, without the environment (W5:T7).
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD)
      throw new Error("[staff-ops-ui] ADMIN_EMAIL / ADMIN_PASSWORD not set");
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[staff-ops-ui] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    for (const feature of ["SCHEDULING", "PAYROLL"]) {
      const granted = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      if (!granted.ok)
        throw new Error(
          `[staff-ops-ui] ${feature}: ${JSON.stringify(granted.data)}`
        );
    }
    session = await loginViaUi(browser, tenant.email, tenant.password);
    await page().setViewportSize(DESKTOP);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Staff operations (dashboard)");
    await allure.label("severity", "normal");
  });

  test("TC-1474: Payroll settings shows the auto clock-out (on) and large food establishment (off) switches", async () => {
    // The server's defaults the switches must mirror.
    const got = await getPayrollSettingsRaw(ownerToken, restaurantId);
    expect(((got.data.data as Rec).settings as Rec).staffOps).toEqual({
      autoClockOutAtDayEnd: true,
      largeFoodEstablishment: false,
    });

    await openStaff("payrollSettings");
    const autoClockOut = page().getByRole("switch", { name: AUTO_CLOCK_OUT });
    const largeFood = page().getByRole("switch", { name: LARGE_FOOD });
    await autoClockOut.scrollIntoViewIfNeeded({ timeout: 20_000 });
    await expect(autoClockOut).toBeVisible();
    await expect(autoClockOut).toBeChecked();
    await largeFood.scrollIntoViewIfNeeded();
    await expect(largeFood).toBeVisible();
    await expect(largeFood).not.toBeChecked();
  });

  test("TC-1475: the Add job dialog offers the tipped occupation code for a tipped job", async () => {
    await openStaff("jobs");
    await page().getByRole("button", { name: "Add job" }).click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName("Add a job");
    const tipped = dialog.getByRole("checkbox", { name: "Tipped job" });
    await expect(tipped).toBeVisible();
    await tipped.check();
    const field = dialog.getByLabel(TTOC_FIELD).first();
    await expect(field).toBeVisible();
    await expect(field).toBeEnabled();
    // Nothing saved: close without adding the job.
    await page().keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
