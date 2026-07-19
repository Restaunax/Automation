import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createAdminMarketingPage } from "../../../pages/dashboard/admin/AdminMarketingPage";
import {
  apiLogin,
  getAutomationsApi,
  patchAutomationApi,
  runAutomationNowRaw,
  toggleAutomationApi,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/**
 * Admin — Lifecycle automations tab (Coupons & Campaigns → Campaigns →
 * Automations). Covers the 2026-07-19 lifecycle engine surface: the three
 * seeded programs, the edit dialog (partial save + view-only template), the
 * enable toggle, and the API-level template-lock regression.
 *
 * Run-now on an ENABLED automation is deliberately NOT automated — it sends
 * real emails to lapsed QA customers. TC-205 exercises the endpoint via the
 * safe path (disabled → 400, zero sends).
 */
test.describe("Admin — Marketing automations", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Admin Marketing Automations");
    await allure.label("severity", "normal");
  });

  test("TC-201: automations tab lists the three seeded programs with intro and caps", async ({
    adminPage,
  }) => {
    await allure.description(
      "Win-Back, Welcome, and VIP rows render with the explainer banner, the global caps fields, and the pace helper text (nobody-is-skipped copy)."
    );
    const marketing = createAdminMarketingPage(adminPage);

    await marketing.gotoCampaignScheduler();
    await marketing.openAutomationsSubTab();

    await allure.step("Intro banner + global caps render", async () => {
      await expect(marketing.introBanner()).toBeVisible();
      await expect(marketing.capsTitle()).toBeVisible();
      await expect(marketing.frequencyCapInput()).toBeVisible();
      await expect(marketing.dailyCapInput()).toBeVisible();
      await expect(marketing.dailyPaceHelper()).toBeVisible();
    });

    await allure.step("All three program rows render", async () => {
      for (const type of ["Win-Back", "Welcome", "VIP"] as const) {
        await expect(marketing.programRow(type)).toBeVisible();
      }
    });
  });

  test("TC-202: edit dialog shows per-type fields, locks the template, and persists a change", async ({
    adminPage,
  }) => {
    await allure.description(
      "Win-Back's dialog shows its inactivity threshold, the email template is view-only (disabled input — content can never mismatch the program), and a cooldown change round-trips through save + reload."
    );
    const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const winBack = (await getAutomationsApi(accessToken)).find(
      (a) => a.type === "WIN_BACK"
    );
    expect(winBack, "Seeded WIN_BACK automation missing on QA").toBeTruthy();
    const originalCooldown = winBack!.cooldownDays;
    const newCooldown = originalCooldown === 61 ? 62 : 61;

    const marketing = createAdminMarketingPage(adminPage);
    try {
      await marketing.gotoCampaignScheduler();
      await marketing.openAutomationsSubTab();
      await marketing.openEditDialog("Win-Back");

      await allure.step("Per-type field + locked template", async () => {
        await expect(
          marketing.dialogFieldInput("Days without an order")
        ).toBeVisible();
        await expect(
          marketing.dialogFieldInput("Email template")
        ).toBeDisabled();
      });

      await allure.step("Change cooldown and save", async () => {
        const cooldown = marketing.dialogFieldInput("Cooldown (days)");
        await cooldown.fill(String(newCooldown));
        await marketing.saveDialog();
      });

      await allure.step("Change persisted (API)", async () => {
        const after = (await getAutomationsApi(accessToken)).find(
          (a) => a.id === winBack!.id
        );
        expect(after?.cooldownDays).toBe(newCooldown);
      });
    } finally {
      await patchAutomationApi(accessToken, winBack!.id, {
        cooldownDays: originalCooldown,
      }).catch(() => {});
    }
  });

  test("TC-203: the enabled switch toggles a program and persists", async ({
    adminPage,
  }) => {
    await allure.description(
      "Flipping a program's Enabled switch persists to the backend; the test restores the original state so no automation is left accidentally enabled/disabled on QA."
    );
    const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const vip = (await getAutomationsApi(accessToken)).find(
      (a) => a.type === "VIP"
    );
    expect(vip, "Seeded VIP automation missing on QA").toBeTruthy();
    const originalEnabled = vip!.isEnabled;

    const marketing = createAdminMarketingPage(adminPage);
    try {
      await marketing.gotoCampaignScheduler();
      await marketing.openAutomationsSubTab();

      await allure.step("Flip the VIP switch", async () => {
        await marketing.programSwitch("VIP").click();
      });

      await allure.step("New state persisted (API)", async () => {
        await expect
          .poll(async () => {
            const after = (await getAutomationsApi(accessToken)).find(
              (a) => a.id === vip!.id
            );
            return after?.isEnabled;
          })
          .toBe(!originalEnabled);
      });
    } finally {
      await toggleAutomationApi(accessToken, vip!.id, originalEnabled).catch(
        () => {}
      );
    }
  });

  test("TC-204: templateId cannot be reassigned through the API (view-only lock)", async () => {
    await allure.description(
      "Regression for the template lock: PATCHing templateId is silently ignored by the field allowlist, so a program can never be pointed at mismatched email content."
    );
    const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const winBack = (await getAutomationsApi(accessToken)).find(
      (a) => a.type === "WIN_BACK"
    );
    expect(winBack, "Seeded WIN_BACK automation missing on QA").toBeTruthy();

    const updated = await patchAutomationApi(accessToken, winBack!.id, {
      templateId: "00000000-0000-0000-0000-000000000000",
    });
    expect(updated.templateId).toBe(winBack!.templateId);
  });

  test("TC-205: run-now on a disabled automation is rejected without sending", async () => {
    await allure.description(
      "The safe half of the run-now contract: a disabled program returns 400 and creates zero sends. (Run-now on an enabled program sends real mail and is intentionally not automated.)"
    );
    const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const disabled = (await getAutomationsApi(accessToken)).find(
      (a) => !a.isEnabled
    );
    test.skip(
      !disabled,
      "Every automation is enabled on QA — no safe run-now target"
    );

    const res = await runAutomationNowRaw(accessToken, disabled!.id);
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});
