/**
 * 38-growth-a-ui.spec.ts — the Stage 7 growth A screens the way an owner
 * uses them (TC-1769..1771): People → Import (W0:MF-7), the Prime cost card
 * on Analytics (W0:MF-5) and the nightly cash tip-out sheet on the Tips tab
 * (W0:MF-9).
 *
 * The rules themselves are TC-1760..1768 (api-growth-a); this is the
 * browser. Labels follow the dashboard's EN locales (restaunax
 * public/locales/en/staff.json → staffImport / tipSheet, analytics.json →
 * primeCost).
 *
 * Browser. A per-run throwaway restaurant (NY) with Timecards + Tip
 * Management by admin override. Gated by `RELEASED_ON_QA.growthAStage7`.
 * Serial. Tag: @growth-a.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import { probeGrowthAStage7, requireRelease } from "../../../utils/releaseGate";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
} from "../../../utils/apiHelper";
import { activeDialog, DESKTOP } from "../../../utils/humanQa";

test.describe.configure({ mode: "serial" });

test.describe("Growth A — import, prime cost, cash tip-out sheet (UI) @growth-a", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenant and grants Timecards + Tip Management"
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
  const open = (query: string) =>
    page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?${query}`,
      { waitUntil: "domcontentloaded" }
    );

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    adminToken = (
      await apiLogin(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)
    ).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[growth-a-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    for (const feature of ["TIMECARDS", "TIP_MANAGEMENT"]) {
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      if (!g.ok) throw new Error(`[growth-a-ui] grant ${feature}`);
    }
    session = await loginViaUi(browser, tenant.email, tenant.password);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Back office growth A");
    await allure.label("severity", "normal");
    requireRelease(
      "growthAStage7",
      await probeGrowthAStage7(ownerToken, restaurantId)
    );
    await page().setViewportSize(DESKTOP);
  });

  test("TC-1769: People → Import — a CSV shows the dry run, Import adds the person and sends no invite", async () => {
    await open("tab=staff&staffTab=people");
    await page().getByTestId("staff-import-open").click();
    const dialog = activeDialog(page());
    await expect(
      dialog.getByText("Import staff, jobs and wages")
    ).toBeVisible();
    const csv = [
      "first_name,last_name,email,job,hourly_rate",
      `Uma,Import${runId.slice(-4)},,Line Cook,21.00`,
    ].join("\n");
    await page()
      .getByTestId("staff-import-file")
      .setInputFiles({
        name: "staff.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      });
    await expect(dialog.getByText("1 to add")).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/Line Cook/).first()).toBeVisible();
    await dialog.getByTestId("staff-import-confirm").click();
    await expect(
      dialog.getByText(/1 added and 0 updated\. No invites were sent\./)
    ).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(
      page()
        .getByText(`Import${runId.slice(-4)}`)
        .first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-1770: Analytics → Prime cost — Enter costs for this week saves and shows it as entered", async () => {
    await open("tab=Analytics");
    const card = page().getByTestId("prime-cost-card");
    await expect(card.getByText("Prime cost")).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "Enter costs" }).first().click();
    const dialog = activeDialog(page());
    await dialog.getByLabel("Food").fill("1500");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(card.getByText("Entered").first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("TC-1771: Tips → nightly cash tip-out sheet — off by default; turned on it shows the day's sheet", async () => {
    await open("tab=staff&staffTab=tips");
    const card = page().getByTestId("cash-tip-sheet");
    await expect(card.getByText("Nightly cash tip-out sheet")).toBeVisible({
      timeout: 30_000,
    });
    const toggle = card.getByRole("checkbox", {
      name: "Use the nightly sheet",
    });
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(card.getByText("Business day")).toBeVisible();
    await expect(card.getByText("No tips for this day yet.")).toBeVisible({
      timeout: 20_000,
    });
    // Back off, so the tenant ends as it started.
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  });
});
