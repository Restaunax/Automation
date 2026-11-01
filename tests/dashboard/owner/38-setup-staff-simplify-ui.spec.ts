/**
 * 38-setup-staff-simplify-ui.spec.ts — RestauNax back-office audit Stage 6,
 * setup & staff page simplification on the dashboard (TC-1709..1712).
 *
 *   TC-1709  The setup interview (W0:J1-a): an Arizona owner opens "Answer 5
 *            questions" from the setup card, sees their state from the
 *            address, picks pool-by-hours tips, every two weeks, the payroll
 *            file and "we don't schedule", saves — the overtime preset is
 *            STATE (not FEDERAL) and the checklist's steps are ticked.
 *   TC-1710  One Permissions screen (W0:J1-b): roles and discount & void
 *            rules side by side; a manager-only comp is set without leaving
 *            it (Shift lead loses "Comp an item", comps need a reason); the
 *            per-person exceptions link opens People.
 *   TC-1711  One payroll mode shown (W0:OB-3): with the payroll file chosen,
 *            Pay & overtime shows only it, no Gusto / RestauNax Payroll
 *            wording, and "Change payroll method" brings the question back.
 *   TC-1712  RestauNax setup values on one line (W0:OB-5): an owner sees one
 *            line with "Contact support" (mailto) and the values only after
 *            "Show details".
 *
 * Browser. A per-run throwaway owner (loginViaUi) on an Arizona restaurant
 * with SCHEDULING + TIP_MANAGEMENT (Timecards comes with them; no Payroll).
 * Gated by `RELEASED_ON_QA.staffSetupStage6`. Serial. Tag: @staff-setup.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  probeStaffSetupStage6,
  requireRelease,
} from "../../../utils/releaseGate";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  getRestaurantSettingsRaw,
  payrollRaw,
  setFeatureOverrideAdminRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  backOfficeSetupRaw,
  setupInterviewRaw,
  staffCapabilitiesRaw,
} from "../../../utils/backOfficeApi";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);

/** The first object under `root` that has `key` (settings payloads nest). */
const findKey = (root: unknown, key: string, depth = 0): unknown => {
  if (!root || typeof root !== "object" || depth > 4) return undefined;
  const rec = root as Record<string, unknown>;
  if (key in rec) return rec[key];
  for (const v of Object.values(rec)) {
    const hit = findKey(v, key, depth + 1);
    if (hit !== undefined) return hit;
  }
  return undefined;
};

test.describe.configure({ mode: "serial" });

test.describe("Owner — setup interview and the simpler Staff page (UI) @staff-setup", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenant and grants add-ons"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const portal = (query: string) =>
    `/restaurant/restaurantId/${restaurantId}/restaurantManagement${query}`;
  const openStaff = async (staffTab?: string) => {
    await page().goto(
      portal(`?tab=staff${staffTab ? `&staffTab=${staffTab}` : ""}`),
      { waitUntil: "domcontentloaded" }
    );
    await expect(
      page().getByTestId("staff-groups").getByRole("tab").first()
    ).toBeVisible({ timeout: 20_000 });
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    adminToken = (
      await apiLogin(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)
    ).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      restaurant: {
        street: "100 W Washington St",
        city: "Phoenix",
        state: "AZ",
        zipCode: "85003",
      },
    });
    if (!tenant.restaurantId) throw new Error("[setup-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    for (const f of ["SCHEDULING", "TIP_MANAGEMENT"]) {
      const r = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        f,
        true
      );
      if (!r.ok) throw new Error(`[setup-ui] ${f}: ${JSON.stringify(r.data)}`);
    }
    session = await loginViaUi(
      browser,
      tenant.email,
      tenant.password ?? `Automation!Owner2-${runId}`
    );
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Back-office setup & Staff page (dashboard)");
    await allure.label("severity", "critical");
    requireRelease(
      "staffSetupStage6",
      await probeStaffSetupStage6(ownerToken, restaurantId)
    );
  });

  test("TC-1709: an Arizona owner answers the five setup questions; the overtime preset is STATE and the checklist is ticked", async () => {
    await page().setViewportSize({ width: 1280, height: 900 });
    await openStaff();
    const card = page().getByTestId("back-office-setup");
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByTestId("setup-interview-open").click();
    const dialog = page().getByTestId("setup-interview");
    await expect(dialog).toBeVisible();
    // 1. The state, from the address.
    await expect(dialog.getByTestId("interview-state")).toContainText(
      "Arizona"
    );
    // 2–5. A radio per answer (value = the option id; scheduling yes/no).
    const pick = async (group: string, value: string) => {
      const radio = dialog
        .getByTestId(group)
        .locator(`input[type="radio"][value="${value}"]`);
      await radio.check();
      await expect(radio).toBeChecked();
    };
    // Counter service: pool by hours is the recommended (pre-picked) answer.
    await expect(
      dialog
        .getByTestId("interview-tips")
        .locator('input[type="radio"][value="POOL_BY_HOURS"]')
    ).toBeChecked();
    await pick("interview-tips", "POOL_BY_HOURS");
    await pick("interview-pay-frequency", "BIWEEKLY");
    // No Payroll add-on: RestauNax Payroll isn't offered.
    await expect(
      dialog
        .getByTestId("interview-payroll-mode")
        .locator('input[value="RESTAUNAX_PAYROLL"]')
    ).toHaveCount(0);
    await pick("interview-payroll-mode", "FILE");
    await pick("interview-scheduling", "no");

    const saved = page().waitForResponse(
      (r) =>
        r.url().includes("/back-office/setup-interview") &&
        r.request().method() === "POST"
    );
    await dialog.getByTestId("setup-interview-save").click();
    expect((await saved).status()).toBe(200);
    await expect(dialog).toBeHidden();

    const settings = await payrollRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/settings"
    );
    const s = ((settings.data.data as Rec | undefined)?.settings ?? {}) as Rec;
    expect((s.overtime as Rec).preset).toBe("STATE");
    expect(s.payFrequency).toBe("BIWEEKLY");
    expect(s.payrollMode).toBe("FILE");

    const setup = await backOfficeSetupRaw(ownerToken, restaurantId);
    const steps = list((setup.data.data as Rec).steps);
    for (const id of [
      "paySchedule",
      "tipRules",
      "payrollMode",
      "publishSchedule",
    ])
      expect(steps.find((st) => st.id === id)?.status, id).toBe("done");
    // The card shows the ticked steps too.
    await page().reload({ waitUntil: "domcontentloaded" });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole("button", { name: "Show all steps" }).click();
    const tipStep = card.getByTestId("setup-step-tipRules");
    await expect(tipStep).toBeVisible();
    // A done step is struck through.
    await expect(tipStep.getByText(/./).first()).toHaveCSS(
      "text-decoration-line",
      "line-through"
    );
  });

  test("TC-1710: on the one Permissions screen a comp is made manager-only and needs a reason, without leaving it", async () => {
    await page().setViewportSize({ width: 1280, height: 900 });
    await openStaff("permissions");
    const screen = page().getByTestId("staff-permissions");
    await expect(screen).toBeVisible({ timeout: 20_000 });
    const roles = screen.getByTestId("permissions-roles");
    const rules = screen.getByTestId("permissions-rules");
    await expect(roles).toBeVisible();
    await expect(rules).toBeVisible();

    // Roles: Shift leads may no longer comp on their own.
    await roles.getByRole("button", { name: /^Shift lead/ }).click();
    const comp = roles.getByRole("checkbox", { name: /Comp an item/ });
    await expect(comp).toBeVisible();
    if (await comp.isChecked()) await comp.uncheck();
    const roleSaved = page().waitForResponse(
      (r) =>
        r.url().includes("/staff/roles") &&
        ["PATCH", "PUT"].includes(r.request().method())
    );
    await roles.getByRole("button", { name: "Save role" }).click();
    expect((await roleSaved).status()).toBe(200);

    // Rules, on the same screen: a comp needs a reason.
    const required = rules.getByRole("switch", {
      name: "Require a reason for comps",
    });
    if (!(await required.isChecked())) await required.click();
    await expect(required).toBeChecked();
    await rules
      .getByRole("button", { name: "Save permissions" })
      .first()
      .click();
    await expect(page()).toHaveURL(/staffTab=permissions/);

    await expect
      .poll(async () => {
        const cat = await staffCapabilitiesRaw(ownerToken, restaurantId);
        const lead = list((cat.data.data as Rec | undefined)?.roles).find(
          (r) => r.preset === "SHIFT_LEAD"
        );
        return (lead?.permissions as string[] | undefined) ?? null;
      })
      .not.toContain("APPROVE_COMP");
    await expect
      .poll(async () => {
        const res = await getRestaurantSettingsRaw(ownerToken, restaurantId);
        const policy = findKey(res.data, "posApprovalPolicy") as
          | { reasons?: { comp?: { required?: boolean } } }
          | undefined;
        return policy?.reasons?.comp?.required ?? null;
      })
      .toBe(true);

    // Per-person exceptions live on the person: the link opens People.
    await screen.getByTestId("permissions-exceptions-link").click();
    await expect(
      page()
        .getByTestId("staff-groups")
        .getByRole("tab", { name: "People", exact: true })
    ).toHaveAttribute("aria-selected", "true");
  });

  test("TC-1711: with the payroll file chosen, Pay & overtime shows only that mode until 'Change payroll method'", async () => {
    // Chosen in TC-1709; make it so here too when run alone.
    const chosen = await setupInterviewRaw(ownerToken, restaurantId, {
      state: "AZ",
      tipPreset: "POOL_BY_HOURS",
      payFrequency: "BIWEEKLY",
      payrollMode: "FILE",
      usesSchedule: false,
    });
    expect(chosen.status, JSON.stringify(chosen.data)).toBe(200);
    await page().setViewportSize({ width: 1280, height: 900 });
    await openStaff("payrollSettings");
    const mode = page().getByTestId("payroll-mode-chosen");
    await expect(mode).toBeVisible({ timeout: 20_000 });
    await expect(mode).toContainText("Payroll file");
    await expect(
      page().getByRole("heading", { name: "Do you already use Gusto?" })
    ).toHaveCount(0);
    for (const other of ["Connect your Gusto", "Yes, I use Gusto"])
      await expect(page().getByText(other)).toHaveCount(0);
    await expect(
      page().getByText("RestauNax Payroll", { exact: true })
    ).toHaveCount(0);

    await page().getByTestId("payroll-mode-change").click();
    await expect(
      page().getByRole("heading", { name: "Do you already use Gusto?" })
    ).toBeVisible();
    await expect(
      page().getByRole("button", { name: "Yes, I use Gusto" })
    ).toBeVisible();
  });

  test("TC-1712: an owner sees the RestauNax setup values as one line with Contact support; details on request", async () => {
    await page().setViewportSize({ width: 1280, height: 900 });
    await page().goto(portal("?tab=Store%20Settings"), {
      waitUntil: "domcontentloaded",
    });
    const card = page().getByTestId("restaunax-setup");
    await card.scrollIntoViewIfNeeded({ timeout: 25_000 });
    const summary = card.getByTestId("restaunax-setup-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("RestauNax setup");
    const contact = card.getByTestId("restaunax-setup-contact");
    await expect(contact).toBeVisible();
    await expect(contact).toHaveAttribute("href", /^mailto:support@/);
    // The read-only values stay folded away until asked for.
    const cutoff = card.getByText("Business day ends at");
    await expect(cutoff).toBeHidden();
    await card.getByTestId("restaunax-setup-details").click();
    await expect(cutoff).toBeVisible();
  });
});
