/**
 * affiliate-commission.spec.ts — the affiliate commission plan in HQ
 * (RestauNax feat/sales-attribution, Plan 2; spec
 * docs/features/AFFILIATE_COMMISSION.md).
 *
 * TC-1107..1111. The "Status and commission plan" dialog shows a hint under
 * every plan field and a live example that follows the share; an after-window
 * rate not lower than the share is refused on its field; the Program defaults
 * tab saves and pre-fills the next approval; terminating needs a payout
 * outcome (API) and succeeds with "Pay what was earned" (UI), ending the
 * affiliate's referrals; a terminated affiliate's Edit action is disabled.
 *
 * Gated: until the branch is merged and deployed,
 * `/api/affiliates/admin/program-defaults` answers 404 and every test here
 * SKIPS with that reason (utils/releaseGate.ts →
 * RELEASED_ON_QA.affiliateCommission). Select with `--grep @affiliate-commission`.
 *
 * Data: ONE new affiliate per run (`auto-commission-<runId>`), PENDING at the
 * start, approved in TC-1109 and terminated in TC-1110. It cannot be a reused
 * fixture: TERMINATED is final, and a user with an Affiliate row can never be
 * deleted, so each run leaves one terminated affiliate behind (by design).
 * TC-1109 changes the GLOBAL program defaults and puts them back right after
 * (and again in afterAll if the test failed midway).
 *
 * Not covered here: an enrolled referral needs the restaurant to ACTIVATE
 * (a real paid Stripe subscription), which this suite cannot create, so the
 * per-run affiliate has no referrals and TC-1110 asserts exactly that (an
 * empty list) rather than "referrals ended". Ending an enrolled referral, the
 * ledger and payouts are covered by the backend unit suites and the branch's
 * local preview walk.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createAdminAffiliatesPage } from "../../../pages/dashboard/admin/AdminAffiliatesPage";
import {
  type CommissionPlanTerms,
  apiLogin,
  createPendingAffiliate,
  getAffiliateDetailsRaw,
  getAffiliatePlanRaw,
  getProgramDefaultsRaw,
  putProgramDefaultsRaw,
  setAffiliateStatusRaw,
} from "../../../utils/apiHelper";
import { generateRunId } from "../../../utils/testData";
import {
  probeAffiliateCommission,
  requireRelease,
} from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const TERMINATION_REASON = "Automation: the partner left the program";

const HINTS = [
  "Percent of what the restaurant pays us for its plan and add-ons, taken from each paid invoice.",
  "How many months after the owner activates the restaurant this share is paid.",
  "Optional lower percent paid after the window ends",
  "Paid once, when the restaurant's first invoice is paid. Set to 0 for no bounty.",
  "Not paid on. Equipment sales and rentals are left out of the share.",
];

test.describe(
  "HQ — Affiliate commission plan",
  { tag: "@affiliate-commission" },
  () => {
    test.describe.configure({ mode: "serial" });
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
    );

    let adminToken = "";
    let deployed = false;
    let originalDefaults: CommissionPlanTerms | null = null;
    let affiliate = { affiliateId: "", referralTag: "", name: "" };
    const runId = generateRunId();

    const readDefaults = async (): Promise<CommissionPlanTerms> => {
      const res = await getProgramDefaultsRaw(adminToken);
      const d = (
        res.data as { data: CommissionPlanTerms & Record<string, unknown> }
      ).data;
      return {
        sharePct: d.sharePct,
        windowMonths: d.windowMonths,
        afterWindowPct: d.afterWindowPct,
        bountyAmount: d.bountyAmount,
        chainRule: d.chainRule,
        expansionPct: d.expansionPct,
        hardwareRule: d.hardwareRule,
      };
    };

    const restoreDefaults = async () => {
      if (!originalDefaults) return;
      const res = await putProgramDefaultsRaw(adminToken, originalDefaults);
      if (res.status !== 200) {
        console.warn(
          `[affiliate-commission] restoring the program defaults failed: ${res.status} ${JSON.stringify(res.data)}`
        );
      }
    };

    test.beforeAll(async () => {
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      deployed = await probeAffiliateCommission(adminToken);
      if (!deployed) return;
      originalDefaults = await readDefaults();
      affiliate = await createPendingAffiliate(adminToken, runId);
    });

    test.afterAll(async () => {
      if (deployed) await restoreDefaults();
    });

    test.beforeEach(async () => {
      await allure.label("feature", "Affiliate commission");
      await allure.label("severity", "normal");
      requireRelease("affiliateCommission", deployed);
    });

    test("TC-1107: approving shows the plan with a hint under each field, and the live example follows the share", async ({
      adminPage,
    }) => {
      await allure.label("severity", "critical");
      const ui = createAdminAffiliatesPage(adminPage);

      await allure.step(
        "Open the PENDING affiliate and choose Active",
        async () => {
          await ui.openStatusDialog(affiliate.referralTag);
          await ui.chooseStatus("Active");
          await ui.waitForPlan();
        }
      );

      await allure.step("Every plan field carries its hint", async () => {
        await expect(
          ui.dialog().getByText("Commission plan", { exact: true })
        ).toBeVisible();
        await expect(
          ui.dialog().getByText("Pre-filled from the program defaults")
        ).toBeVisible();
        for (const hint of HINTS) {
          await expect(
            ui.dialog().getByText(hint, { exact: false })
          ).toBeVisible();
        }
      });

      await allure.step(
        "The example recomputes when the share changes",
        async () => {
          await ui.shareInput().fill("20");
          await ui
            .dialog()
            .getByRole("spinbutton", { name: "Window (months)" })
            .fill("12");
          await expect(ui.liveExample()).toContainText(
            "A restaurant paying $400 a month: $80 a month for 12 months"
          );
          await ui.shareInput().fill("25");
          await expect(ui.liveExample()).toContainText(
            "$100 a month for 12 months"
          );
        }
      );

      await allure.step("Cancel leaves the affiliate PENDING", async () => {
        await ui.cancelDialog();
        await expect(ui.row(affiliate.referralTag)).toContainText("Pending");
      });
    });

    test("TC-1108: an after-window rate not lower than the share is refused on its field", async ({
      adminPage,
    }) => {
      const ui = createAdminAffiliatesPage(adminPage);

      await allure.step(
        "Active with share 20 and after-window 20",
        async () => {
          await ui.openStatusDialog(affiliate.referralTag);
          await ui.chooseStatus("Active");
          await ui.waitForPlan();
          await ui.shareInput().fill("20");
          await ui.afterWindowInput().fill("20");
          await ui.submitDialog();
        }
      );

      await allure.step(
        "The field shows the refusal; nothing saved",
        async () => {
          await expect(
            ui
              .dialog()
              .getByText("The after-window rate must be lower than the share.")
          ).toBeVisible({ timeout: 10_000 });
          await expect(ui.dialog()).toBeVisible();
          const details = await getAffiliateDetailsRaw(
            adminToken,
            affiliate.affiliateId
          );
          expect(
            (details.data as { affiliate?: { status?: string } }).affiliate
              ?.status
          ).toBe("PENDING");
        }
      );
    });

    test("TC-1109: program defaults save and pre-fill the next approval", async ({
      adminPage,
    }) => {
      const ui = createAdminAffiliatesPage(adminPage);
      // A value no other run leaves behind, so the pre-fill is provably ours.
      const share = originalDefaults?.sharePct === 22 ? 23 : 22;

      try {
        await allure.step(
          `Save the defaults with share ${share}%`,
          async () => {
            await ui.openProgramDefaults();
            await expect(ui.defaultsShareInput()).not.toHaveValue("", {
              timeout: 10_000,
            });
            await ui.defaultsShareInput().fill(String(share));
            await ui.saveDefaults("Automation: check the approval pre-fill");
            expect((await readDefaults()).sharePct).toBe(share);
          }
        );

        await allure.step(
          "The next approval is pre-filled from them; approving saves that plan",
          async () => {
            await ui.openStatusDialog(affiliate.referralTag);
            await ui.chooseStatus("Active");
            await ui.waitForPlan();
            await expect(
              ui.dialog().getByText("Pre-filled from the program defaults")
            ).toBeVisible();
            await expect(ui.shareInput()).toHaveValue(String(share));
            await ui.submitDialog();
            await expect(ui.dialog()).toBeHidden({ timeout: 10_000 });
            const plan = await getAffiliatePlanRaw(
              adminToken,
              affiliate.affiliateId
            );
            expect(plan.status).toBe(200);
            expect(
              (plan.data as { data?: { sharePct?: number } }).data?.sharePct
            ).toBe(share);
          }
        );
      } finally {
        await restoreDefaults();
      }
    });

    test("TC-1110: terminating needs a payout outcome; Pay what was earned succeeds", async ({
      adminPage,
    }) => {
      await allure.label("severity", "critical");
      const ui = createAdminAffiliatesPage(adminPage);

      await allure.step(
        "API: TERMINATED without an outcome is refused",
        async () => {
          const res = await setAffiliateStatusRaw(
            adminToken,
            affiliate.affiliateId,
            {
              status: "TERMINATED",
              statusChangedReason: TERMINATION_REASON,
            }
          );
          expect(res.status).toBe(400);
          expect(JSON.stringify(res.data)).toContain(
            "Choose what happens to the commission already earned"
          );
        }
      );

      await allure.step("UI: terminate with Pay what was earned", async () => {
        await ui.openStatusDialog(affiliate.referralTag);
        await ui.chooseStatus("Terminated");
        const payEarned = ui
          .dialog()
          .getByRole("radio", { name: "Pay what was earned" });
        await expect(payEarned).toBeVisible({ timeout: 10_000 });
        await payEarned.check();
        await expect(
          ui
            .dialog()
            .getByText("The agreement promises earned commission is paid.", {
              exact: false,
            })
        ).toBeVisible();
        await ui.reasonInput().fill(TERMINATION_REASON);
        await ui.submitDialog();
        await expect(ui.dialog()).toBeHidden({ timeout: 10_000 });
        await expect(ui.row(affiliate.referralTag)).toContainText("Terminated");
      });

      await allure.step(
        "The details API records TERMINATED; a fresh affiliate has no referrals to end",
        async () => {
          test.info().annotations.push({
            type: "note",
            description:
              "A fresh affiliate has no enrolled referrals; ending an enrolled referral is covered by the backend unit tests",
          });
          const res = await getAffiliateDetailsRaw(
            adminToken,
            affiliate.affiliateId
          );
          expect(res.status).toBe(200);
          const a = (
            res.data as {
              affiliate?: {
                status?: string;
                referrals?: { status?: string }[];
              };
            }
          ).affiliate;
          expect(a?.status).toBe("TERMINATED");
          expect(Array.isArray(a?.referrals)).toBe(true);
          expect(a?.referrals).toHaveLength(0);
        }
      );
    });

    test("TC-1111: a terminated affiliate's Edit action is disabled", async ({
      adminPage,
    }) => {
      const ui = createAdminAffiliatesPage(adminPage);
      await ui.goto();
      await ui.search(affiliate.referralTag);
      const edit = ui.row(affiliate.referralTag).getByRole("button", {
        name: "Terminated affiliates cannot be reinstated",
      });
      await expect(edit).toBeVisible();
      await expect(edit).toBeDisabled();

      await allure.step("The API refuses a reinstatement too", async () => {
        const res = await setAffiliateStatusRaw(
          adminToken,
          affiliate.affiliateId,
          {
            status: "ACTIVE",
            plan: originalDefaults,
          }
        );
        expect(res.status).toBe(409);
      });
    });
  }
);
