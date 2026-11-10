/**
 * affiliate-portal.spec.ts — what an affiliate sees in the dashboard app
 * (RestauNax feat/sales-attribution; spec docs/features/AFFILIATE_COMMISSION.md
 * → "Where HQ and the affiliate see it" → Affiliate portal).
 *
 * TC-1112..1116. A brand-new user applies through the UI (the agreement must
 * be accepted first) and lands on the dashboard PENDING; the ACTIVE actor
 * sees its tag and referral link; an affiliate with no activity sees the
 * empty referrals list, an empty payment history and the Stripe Connect
 * call to action; a SUSPENDED affiliate sees the payouts-on-hold notice;
 * a signed-out visitor at /affiliate sees the program page.
 *
 * Actor: `affiliatePage` = the ONE persistent "auto-attribution" affiliate
 * (AFFILIATE_EMAIL / AFFILIATE_PASSWORD, session saved by globalSetup). It is
 * set ACTIVE in beforeAll (ensureAttributionAffiliate) and again after
 * TC-1115 suspends it, in a finally and in afterAll, so it is never left
 * suspended. TC-1113..1115 skip when the pair is unset.
 *
 * Gated: until the branch is merged and deployed,
 * `/api/affiliates/admin/program-defaults` answers 404 and every test here
 * SKIPS with that reason (utils/releaseGate.ts →
 * RELEASED_ON_QA.affiliateCommission). Select with `--grep @affiliate-portal`.
 *
 * Data: TC-1112 leaves ONE permanent PENDING affiliate per run
 * (user "AUTO Portal Signup <runId>", tag auto-portal-<runId>): a user with
 * an Affiliate row can never be deleted. Same cost as the commission suite's
 * createPendingAffiliate.
 *
 * Not in the portal (so not asserted): an affiliate-level "terms card" with
 * the plan's share / window / bounty (terms are shown per referral in Active
 * Accounts only) and a commission ledger view (HQ only).
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  FAKE_PLACE,
  createAffiliatePortalPage,
} from "../../../pages/dashboard/affiliate/AffiliatePortalPage";
import { createSignInPage } from "../../../pages/dashboard/auth/SignInPage";
import {
  AUTOMATION_ATTRIBUTION_AFFILIATE_TAG,
  adminCreateUser,
  affiliateActorCredentials,
  apiLogin,
  apiRequestRaw,
  ensureAttributionAffiliate,
  getAffiliateDetailsRaw,
  setAffiliateStatusRaw,
} from "../../../utils/apiHelper";
import { FRONTEND_URL, generateRunId } from "../../../utils/testData";
import {
  probeAffiliateCommission,
  requireRelease,
} from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const HAS_AFFILIATE_LOGIN = affiliateActorCredentials().fromEnv;
const NO_AFFILIATE_REASON =
  "AFFILIATE_EMAIL / AFFILIATE_PASSWORD not set in .env (the affiliate actor)";

const SUSPEND_REASON = "Automation: portal hold notice check";

test.describe("Affiliate portal", { tag: "@affiliate-portal" }, () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  let adminToken = "";
  let deployed = false;
  let actorId = "";
  const runId = generateRunId();

  const reactivateActor = async () => {
    if (!adminToken || !HAS_AFFILIATE_LOGIN) return;
    try {
      await ensureAttributionAffiliate(adminToken);
    } catch (err) {
      console.warn(
        `[affiliate-portal] could not set the affiliate actor ACTIVE again: ${String(err)}`
      );
    }
  };

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    deployed = await probeAffiliateCommission(adminToken);
    if (!deployed || !HAS_AFFILIATE_LOGIN) return;
    actorId = (await ensureAttributionAffiliate(adminToken)).affiliateId;
  });

  test.afterAll(async () => {
    if (deployed) await reactivateActor();
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Affiliate portal");
    await allure.label("severity", "normal");
    requireRelease("affiliateCommission", deployed);
  });

  test("TC-1112: a new user applies through the UI; the agreement is accepted first and the dashboard shows Pending", async ({
    browser,
  }) => {
    await allure.label("severity", "critical");
    const domain = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";
    const referralTag = `auto-portal-${runId}`.toLowerCase();
    const email = `${referralTag}@${domain}`;
    const password = "Automation!Portal-1";

    await allure.step(
      `Admin creates the user AUTO Portal Signup ${runId}`,
      async () => {
        await adminCreateUser(adminToken, {
          firstName: "AUTO",
          lastName: `Portal Signup ${runId}`,
          email,
          password,
          role: "USER",
        });
      }
    );

    const context = await browser.newContext({ baseURL: FRONTEND_URL });
    try {
      const page = await context.newPage();
      const ui = createAffiliatePortalPage(page);
      // A fixed fake address instead of live Google Places (referrer-locked
      // key, billed lookups); see AffiliatePortalPage.stubGooglePlaces.
      await ui.stubGooglePlaces();
      await createSignInPage(page).loginAndWait(email, password);

      await allure.step("Fill the application up to the terms", async () => {
        await ui.gotoSignup();
        await expect(ui.applicationForm()).toBeVisible();
        await ui.fillBasics(referralTag, "Automation portal signup");
        await ui.pickAddress(FAKE_PLACE.search, FAKE_PLACE.suggestion);
        await ui.skipSocialLinks();
      });

      await allure.step(
        "Submit is disabled until the agreement is accepted in the modal",
        async () => {
          await expect(ui.submitButton()).toBeVisible();
          await expect(ui.submitButton()).toBeDisabled();
          await expect(ui.agreeCheckbox()).not.toBeChecked();
          await ui.acceptAgreementInModal();
          await expect(ui.agreeCheckbox()).toBeChecked();
          await expect(ui.submitButton()).toBeEnabled();
        }
      );

      await allure.step("Submit → the dashboard, Pending", async () => {
        await ui.submitButton().click();
        // The page has an "Application Submitted!" screen with a 3-second
        // redirect, but updateUserData() puts the new affiliate on
        // currentUser first and the page's own "already an affiliate"
        // effect navigates at once, so that screen is skipped. Assert the
        // landing, not the transient screen.
        await page.waitForURL(/\/affiliate\/dashboard/, { timeout: 15_000 });
        await expect(
          page.getByRole("heading", { name: "Welcome back, AUTO!" })
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText(`@${referralTag}`).first()).toBeVisible();
        await expect(ui.statusChip("PENDING")).toBeVisible();
        await expect(
          ui
            .referralLinkCard()
            .getByText(
              "Your referral link will be activated once your application is approved."
            )
        ).toBeVisible();
      });

      await allure.step(
        "The API records PENDING with agreement version 2026-11",
        async () => {
          const login = await apiLogin(email, password);
          const profile = await apiRequestRaw<{
            affiliate?: {
              id?: string;
              status?: string;
              agreementVersion?: string | null;
            };
          }>("GET", "/api/affiliates/profile", undefined, login.accessToken);
          expect(profile.status).toBe(200);
          expect(profile.data.affiliate?.status).toBe("PENDING");
          expect(profile.data.affiliate?.agreementVersion).toBe("2026-11");
        }
      );
    } finally {
      await context.close();
    }
  });

  test("TC-1113: the ACTIVE affiliate's dashboard shows its tag and referral link", async ({
    affiliatePage,
  }) => {
    test.skip(!HAS_AFFILIATE_LOGIN, NO_AFFILIATE_REASON);
    const ui = createAffiliatePortalPage(affiliatePage);
    await ui.gotoDashboard();

    await allure.step("Header: tag and ACTIVE chip", async () => {
      await expect(
        ui.header().getByText(`@${AUTOMATION_ATTRIBUTION_AFFILIATE_TAG}`)
      ).toBeVisible();
      await expect(ui.statusChip("ACTIVE")).toBeVisible();
      await expect(
        ui.header().getByRole("button", { name: "Share Link" })
      ).toBeVisible();
    });

    await allure.step(
      "Overview: the referral link points at the tag's get-started page",
      async () => {
        await expect(ui.referralLinkField()).toHaveValue(
          new RegExp(`/get-started/${AUTOMATION_ATTRIBUTION_AFFILIATE_TAG}$`)
        );
        await expect(
          ui.referralLinkCard().getByRole("button", { name: "Show QR Code" })
        ).toBeVisible();
      }
    );

    test.info().annotations.push({
      type: "note",
      description:
        "The portal has no affiliate-level commission terms card (share / window / bounty); terms show per enrolled referral in Active Accounts only, so the plan numbers are not asserted here.",
    });
  });

  test("TC-1114: no activity → empty referrals and payment history; the Stripe Connect call to action is offered", async ({
    affiliatePage,
  }) => {
    test.skip(!HAS_AFFILIATE_LOGIN, NO_AFFILIATE_REASON);
    const ui = createAffiliatePortalPage(affiliatePage);

    const profile = await getAffiliateDetailsRaw(adminToken, actorId);
    const a = (
      profile.data as {
        affiliate?: {
          referrals?: unknown[];
          payouts?: unknown[];
          stripeAccountStatus?: string | null;
        };
      }
    ).affiliate;
    test.skip(
      (a?.referrals?.length ?? 0) > 0 || (a?.payouts?.length ?? 0) > 0,
      "The affiliate actor has referrals or payouts on this environment; the empty states cannot be shown"
    );
    test.skip(
      a?.stripeAccountStatus === "active",
      "The affiliate actor finished Stripe onboarding on this environment; no call to action to show"
    );

    await ui.gotoDashboard();

    await allure.step("Overview: nothing pending", async () => {
      await expect(ui.statCard("Pending commission")).toContainText("$0.00");
      await expect(ui.statCard("Total Earnings")).toContainText("$0.00");
    });

    await allure.step("Active Accounts: the empty referrals row", async () => {
      await ui.openTab("Active Accounts");
      await expect(
        affiliatePage.getByText("You haven't made any referrals yet")
      ).toBeVisible();
      await expect(
        affiliatePage.getByRole("button", {
          name: "Share Your Referral Link",
        })
      ).toBeEnabled();
    });

    await allure.step(
      "Payments: Stripe Connect call to action, history waits for setup",
      async () => {
        await ui.openTab("Payments");
        await expect(
          affiliatePage.getByRole("heading", { name: "Payment Dashboard" })
        ).toBeVisible({ timeout: 15_000 });
        await expect(ui.stripeSetupCard()).toBeVisible({ timeout: 15_000 });
        await expect(
          ui.stripeSetupCard().getByRole("button", {
            name: /^(Set Up Payment Account|Complete Setup)$/,
          })
        ).toBeEnabled({ timeout: 15_000 });
        await expect(
          affiliatePage.getByRole("heading", { name: "Payment History" })
        ).toBeVisible();
        await expect(
          affiliatePage.getByText(
            "Complete your payment account setup above to start receiving commissions and view payment history."
          )
        ).toBeVisible();
        await expect(
          affiliatePage.getByRole("button", { name: "Download Full Report" })
        ).toBeDisabled();
      }
    );
  });

  test("TC-1115: a SUSPENDED affiliate sees the payouts-on-hold notice", async ({
    affiliatePage,
  }) => {
    test.skip(!HAS_AFFILIATE_LOGIN, NO_AFFILIATE_REASON);
    const ui = createAffiliatePortalPage(affiliatePage);

    try {
      await allure.step("HQ suspends the affiliate (API)", async () => {
        const res = await setAffiliateStatusRaw(adminToken, actorId, {
          status: "SUSPENDED",
          statusChangedReason: SUSPEND_REASON,
        });
        expect(res.status, JSON.stringify(res.data)).toBe(200);
      });

      await allure.step(
        "The portal shows SUSPENDED and the hold notice",
        async () => {
          await ui.gotoDashboard();
          await expect(ui.statusChip("SUSPENDED")).toBeVisible();
          await expect(ui.holdNotice()).toBeVisible();
          await expect(ui.holdNotice()).toHaveText(
            /^Your payouts are on hold since [A-Z][a-z]{2} \d{1,2}, \d{4}\. \$\d+\.\d{2} is held and will be paid once your account is active again\.$/
          );
          // Only ACTIVE affiliates get the share actions.
          await expect(
            ui.header().getByRole("button", { name: "Share Link" })
          ).toHaveCount(0);
        }
      );
    } finally {
      await reactivateActor();
    }

    await allure.step("Reactivated: the notice is gone", async () => {
      await ui.gotoDashboard();
      await expect(ui.statusChip("ACTIVE")).toBeVisible();
      await expect(ui.holdNotice()).toHaveCount(0);
    });
  });

  test("TC-1116: a signed-out visitor at /affiliate sees the program page and is sent to sign up", async ({
    page,
  }) => {
    const ui = createAffiliatePortalPage(page);
    await page.goto(`${FRONTEND_URL}/affiliate`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "Join Our Affiliate Program" })
      .waitFor({ state: "visible", timeout: 15_000 });

    await allure.step(
      "The call to action shows; the form waits for an account",
      async () => {
        await expect(
          page.getByRole("heading", { name: "Ready to Start Earning?" })
        ).toBeVisible();
        await expect(ui.startApplicationButton()).toBeVisible();
        await expect(ui.applicationForm()).toHaveCount(0);
      }
    );

    await allure.step(
      "Start Your Application → sign-up, returning to the form",
      async () => {
        await ui.startApplicationButton().click();
        await page.waitForURL(
          /\/sign-up\?redirect=(%2F|\/)affiliate(%2F|\/)signup/,
          {
            timeout: 10_000,
          }
        );
      }
    );
  });
});
