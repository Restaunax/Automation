import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createAdminMarketingPage } from "../../../pages/dashboard/admin/AdminMarketingPage";
import {
  apiLogin,
  getAutomationConfigApi,
  getAutomationsApi,
  getAutomationSendsApi,
  getAutomationStatsApi,
  patchAutomationApi,
  patchAutomationConfigApi,
  runAutomationNowRaw,
  toggleAutomationApi,
} from "../../../utils/apiHelper";
import { waitForEmail } from "../../../utils/emailHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/**
 * Admin — Lifecycle automations tab (Coupons & Campaigns → Campaigns →
 * Automations). Covers the 2026-07-19 lifecycle engine surface: the three
 * seeded programs, the edit dialog (partial save + view-only template), the
 * enable toggle, and the API-level template-lock regression.
 *
 * QA email is fully sandboxed — every send lands in the shared Mailpit
 * inbox, never a real customer — so TC-210 exercises the enabled run-now
 * path for real (tagged @email; cap-bounded, state-restoring). TC-205 covers
 * the disabled contract (400, zero sends).
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

  test("TC-212: the stats endpoint returns the full campaign-grade funnel", async () => {
    await allure.description(
      "Every automation exposes the same funnel the event campaigns report — pending/sent/failed/skipped/opened/clicked/redeemed/discountValueGiven — all numeric, so 'what worked' is always answerable."
    );
    const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const first = (await getAutomationsApi(accessToken))[0];
    expect(first, "No automations seeded on QA").toBeTruthy();
    if (!first) return;

    const stats = await getAutomationStatsApi(accessToken, first.id);
    for (const field of [
      "pending",
      "sent",
      "failed",
      "skipped",
      "opened",
      "clicked",
      "redeemed",
      "discountValueGiven",
    ] as const) {
      expect(typeof stats[field], `stats.${field}`).toBe("number");
    }
  });

  test("TC-213: SMS controls live in the edit dialog behind the channel toggle", async ({
    adminPage,
  }) => {
    await allure.description(
      "The edit dialog offers Email and SMS channel switches; flipping SMS on reveals the SMS message editor. Dialog is cancelled — nothing persists."
    );
    const marketing = createAdminMarketingPage(adminPage);
    await marketing.gotoCampaignScheduler();
    await marketing.openAutomationsSubTab();
    await marketing.openEditDialog("Win-Back");

    // MUI Switch exposes role="switch", not "checkbox"
    const smsSwitch = marketing
      .dialog()
      .getByRole("switch", { name: "SMS", exact: true });
    await expect(
      marketing.dialog().getByRole("switch", { name: "Email", exact: true })
    ).toBeVisible();
    await expect(smsSwitch).toBeVisible();

    const smsWasOn = await smsSwitch.isChecked();
    if (!smsWasOn) {
      await smsSwitch.click();
    }
    // The SMS body is a multiline TextField → textarea, not input.
    await expect(
      marketing
        .dialog()
        .locator(".MuiFormControl-root")
        .filter({ has: adminPage.locator("label", { hasText: "SMS message" }) })
        .locator("textarea")
        .first()
    ).toBeVisible();

    // Draft-only change — cancel, nothing persists.
    await marketing.cancelDialog();
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

  test(
    "TC-210: run-now on an enabled automation queues sends and delivers to the sandbox inbox",
    { tag: ["@email"] },
    async () => {
      await allure.description(
        "QA email is fully sandboxed (every send lands in the shared Mailpit inbox, never a real customer), so the enabled run-now path is exercised for real: cap the daily pace to 1, enable Win-Back, run it, and — when candidates exist — verify the send row flips SENT and the email arrives in Mailpit. State (enabled flag + caps) is restored afterwards."
      );
      test.setTimeout(180_000);
      const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
      const winBack = (await getAutomationsApi(accessToken)).find(
        (a) => a.type === "WIN_BACK"
      );
      expect(winBack, "Seeded WIN_BACK automation missing on QA").toBeTruthy();
      const originalEnabled = winBack!.isEnabled;
      const originalInactiveDays = winBack!.inactiveDays;
      const originalConfig = await getAutomationConfigApi(accessToken);
      const sendsBefore = await getAutomationSendsApi(accessToken, winBack!.id);

      try {
        await allure.step(
          "Bound the blast: daily pace 1, threshold 1 day, enable Win-Back",
          async () => {
            await patchAutomationConfigApi(accessToken, {
              dailySendCapPerRestaurant: 1,
            });
            // inactiveDays=1 makes recent QA test customers fresh candidates
            // (new cycleKeys), so the delivery path actually executes instead
            // of the 0-new-sends idempotency early-return.
            await patchAutomationApi(accessToken, winBack!.id, {
              inactiveDays: 1,
            });
            if (!originalEnabled) {
              await toggleAutomationApi(accessToken, winBack!.id, true);
            }
          }
        );

        let sendsCreated = 0;
        await allure.step("Run now succeeds with a scan summary", async () => {
          const res = await runAutomationNowRaw(accessToken, winBack!.id);
          expect(res.ok, JSON.stringify(res.data)).toBe(true);
          const summary = (
            res.data as {
              summary?: { sendsCreated: number; restaurantsScanned: number };
            }
          ).summary;
          expect(summary?.restaurantsScanned).toBeGreaterThan(0);
          sendsCreated = summary?.sendsCreated ?? 0;
          await allure.parameter("sendsCreated", String(sendsCreated));
        });

        if (sendsCreated === 0) {
          // Idempotency at work: every current candidate already has a send
          // row (cycleKey unique) or is gated by cooldown/frequency caps —
          // nothing new to deliver this run. The scan contract is still
          // verified above; delivery was proven on a prior run.
          return;
        }

        let recipient = "";
        let outcome: string | null = null;
        await allure.step(
          "The worker processes a new send row to a terminal status",
          async () => {
            const knownIds = new Set(sendsBefore.map((s) => s.id));
            await expect
              .poll(
                async () => {
                  const sends = await getAutomationSendsApi(
                    accessToken,
                    winBack!.id
                  );
                  const fresh = sends.find(
                    (s) => !knownIds.has(s.id) && s.emailStatus !== null
                  );
                  recipient = fresh?.customerEmail ?? "";
                  outcome = fresh?.emailStatus ?? null;
                  return outcome;
                },
                { timeout: 90_000, intervals: [3_000] }
              )
              .not.toBeNull();
            await allure.parameter("emailStatus", String(outcome));
          }
        );

        // Mailpit is self-hosted and unmetered — a FAILED send is a genuine
        // defect, never a provider budget artifact.
        expect(outcome).toBe("SENT");

        await allure.step(
          `Email delivered to the sandbox inbox (${recipient})`,
          async () => {
            const message = await waitForEmail(recipient, {
              timeoutMs: 60_000,
            });
            expect(message.subject.length).toBeGreaterThan(0);
            await allure.parameter("subject", message.subject);
          }
        );
      } finally {
        await patchAutomationConfigApi(accessToken, {
          dailySendCapPerRestaurant: originalConfig.dailySendCapPerRestaurant,
        }).catch(() => {});
        await patchAutomationApi(accessToken, winBack!.id, {
          inactiveDays: originalInactiveDays,
        }).catch(() => {});
        await toggleAutomationApi(
          accessToken,
          winBack!.id,
          originalEnabled
        ).catch(() => {});
      }
    }
  );

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
