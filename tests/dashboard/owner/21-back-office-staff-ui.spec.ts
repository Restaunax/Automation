/**
 * 21-back-office-staff-ui.spec.ts — the dashboard's Staff area follows the
 * restaurant's add-ons, and its core screens render (TC-628..634).
 *
 * Browser. A per-run throwaway owner logs in through the UI (loginViaUi) and
 * opens Restaurant Management → Staff (?tab=staff). Since RestauNax #1074 the
 * page shows four groups first (Team · Schedule · Time & pay · Tips,
 * data-testid="staff-groups"), then only the open group's own tabs. Each
 * check walks every group and reads its tabs. Add-ons are switched by admin
 * override between steps and the page reloaded:
 *   none       → Team: People, Jobs (names only), Roles, Discount & void
 *                rules; Time & pay: Shifts, Breaks;
 *   SCHEDULING → + Schedule group (Schedule, Requests, Schedule settings);
 *                Time & pay becomes Timecards, Payday, Labor, Payroll
 *                settings (Timecards replaces Shifts); Jobs & wages; no tips;
 *   + PAYROLL  → + Tips group (Tips, Tip policy); Payroll settings asks "Do
 *                you already use Gusto?" (own Gusto / RestauNax Payroll / a
 *                payroll file);
 *   removed    → back to the core groups.
 * Plus: Roles lists the four presets, Jobs & wages shows a job and its rate,
 * People shows an invited person.
 */
import * as allure from "allure-js-commons";
import type { Locator, Page } from "@playwright/test";
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

// Free (no add-on): basic breaks have their own tab (packaging v2), and job
// names are free for every restaurant — a names-only "Jobs" tab without
// TIMECARDS (RestauNax #1002 roles-vs-jobs, 2026-10-19). Group → its tabs,
// in the order shown (staffJobsModel.ts staffGroupsFor).
type StaffLayout = Record<string, string[]>;
const TEAM_CORE = ["People", "Jobs", "Roles", "Discount & void rules"];
const TEAM_PAID = ["People", "Jobs & wages", "Roles", "Discount & void rules"];
const CORE: StaffLayout = {
  Team: TEAM_CORE,
  "Time & pay": ["Shifts", "Breaks"],
};
const TIME_PAY = ["Timecards", "Payday", "Labor", "Payroll settings"];

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
  const groupBar = () => page().getByTestId("staff-groups");
  // The open group's own tab bar sits right after the group bar.
  const groupTabs = () =>
    page().locator('[data-testid="staff-groups"] + .MuiTabs-root [role="tab"]');
  const openStaff = async (staffTab?: string) => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=staff${
        staffTab ? `&staffTab=${staffTab}` : ""
      }`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(groupBar().getByRole("tab").first()).toBeVisible({
      timeout: 20_000,
    });
  };
  /** Labels as shown (a badge count is stripped). */
  const labels = async (tabs: Locator) =>
    (await tabs.allTextContents())
      .map((t) => t.replace(/\d+$/, "").trim())
      .filter(Boolean);
  /** Every group with its own tabs: open each group, read its tab bar. */
  const layout = async (): Promise<StaffLayout> => {
    const groups = await labels(groupBar().getByRole("tab"));
    const out: StaffLayout = {};
    for (const name of groups) {
      const tab = groupBar().getByRole("tab", { name, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(groupTabs().first()).toBeVisible({ timeout: 10_000 });
      out[name] = await labels(groupTabs());
    }
    return out;
  };
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

  test("TC-628: without add-ons the Staff area shows only the core groups and tabs; People lists an invite", async () => {
    await openStaff();
    // Team is the group the page opens on, with People showing.
    await expect(
      page().getByText("Quinn", { exact: false }).first()
    ).toBeVisible();
    expect(await layout()).toEqual(CORE);
    // The free Breaks tab lists the break types.
    await openStaff("breaks");
    // Names are editable fields: read their values.
    const field = page().locator("input");
    await expect(field.first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () =>
        (
          await field.evaluateAll((els) =>
            els.map((e) => (e as HTMLInputElement).value)
          )
        ).filter((v) => /break/i.test(v))
      )
      .toEqual(expect.arrayContaining(["Meal break", "Rest break"]));
  });

  test("TC-629: SCHEDULING adds the Schedule group and Timecards, Payday, Labor, Jobs & wages, Payroll settings — not tips", async () => {
    await grant("SCHEDULING");
    await openStaff();
    expect(await layout()).toEqual({
      Team: TEAM_PAID,
      Schedule: ["Schedule", "Requests", "Schedule settings"],
      "Time & pay": TIME_PAY,
    });
  });

  test("TC-630: PAYROLL adds the Tips group (tips, tip policy); Payroll settings asks one question with three ways to run payroll", async () => {
    await grant("PAYROLL");
    await openStaff("payrollSettings");
    // The deep link opens Time & pay with Payroll settings selected.
    await expect(
      groupBar().getByRole("tab", { name: "Time & pay", exact: true })
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      groupTabs().filter({ hasText: "Payroll settings" })
    ).toHaveAttribute("aria-selected", "true");
    await expect(page().getByText("How you run payroll")).toBeVisible({
      timeout: 15_000,
    });
    // One question with three answers (RestauNax #1074, round 1 item 6):
    // own Gusto, RestauNax Payroll ("No"), or a payroll file.
    await expect(
      page().getByRole("heading", { name: "Do you already use Gusto?" })
    ).toBeVisible();
    await expect(
      page().getByText("Payroll file", { exact: true }).first()
    ).toBeVisible();
    for (const answer of [
      "Yes, I use Gusto",
      "No",
      "I'll use a payroll file (ADP, Paychex or my accountant)",
    ])
      await expect(
        page().getByRole("button", { name: answer, exact: true })
      ).toBeVisible();
    await page().getByRole("button", { name: "Yes, I use Gusto" }).click();
    await expect(page().getByText("Connect your Gusto").first()).toBeVisible();
    // With the PAYROLL add-on, "No" offers RestauNax Payroll.
    await page().getByRole("button", { name: "No", exact: true }).click();
    await expect(
      page().getByText("RestauNax Payroll", { exact: true }).first()
    ).toBeVisible();
    expect((await layout()).Tips).toEqual(["Tips", "Tip policy"]);
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

  test("TC-633: removing the add-ons takes the groups and tabs away again", async () => {
    for (const f of ["PAYROLL", "SCHEDULING"])
      await deleteFeatureOverrideAdminRaw(adminToken, restaurantId, f);
    await openStaff();
    expect(await layout()).toEqual(CORE);
  });

  test("TC-634: a direct link to a gated tab without the add-on shows no gated screen", async () => {
    await openStaff("timecards");
    // Falls back to Team → People rather than a blank screen.
    await expect(
      groupBar().getByRole("tab", { name: "Team", exact: true })
    ).toHaveAttribute("aria-selected", "true");
    expect(await layout()).toEqual(CORE);
    await expect(page().getByText("How you run payroll")).toHaveCount(0);
  });

  test("TC-650: Tip Management alone — Time & pay (timecards, payday, labor, payroll settings), jobs and the Tips group; no schedule", async () => {
    await grant("TIP_MANAGEMENT");
    try {
      await openStaff();
      expect(await layout()).toEqual({
        Team: TEAM_PAID,
        "Time & pay": TIME_PAY,
        Tips: ["Tips", "Tip policy"],
      });
    } finally {
      await deleteFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        "TIP_MANAGEMENT"
      );
    }
  });
});
