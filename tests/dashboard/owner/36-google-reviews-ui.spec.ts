/**
 * 36-google-reviews-ui.spec.ts — the owner dashboard's "Google reviews" tab
 * (RestauNax feat/google-review-replies), UI level. Tag `@google-reviews`.
 *
 *   TC-1100  Connect card → Connect → (fake) consent → return page → back on
 *            the Reviews tab with the list; "Needs reply" is the default.
 *   TC-1101  Reply with AI → the draft is labelled "check before posting" →
 *            edit it → Post → "Waiting for Google to publish" (the posted
 *            review leaves Needs reply and shows under Replied).
 *   TC-1102  Type a reply by hand → Post → shown under Replied.
 *   TC-1103  Edit a posted reply.
 *   TC-1104  Delete a reply: confirm dialog, then the reply is gone.
 *   TC-1105  A translated review shows the translation toggle; it flips
 *            between the translation and the original.
 *   TC-1106  Reply settings dialog saves tone / sign-off / contact line /
 *            guidance (and the baseline is restored afterwards).
 *   TC-1107  Chain "Reviews" page lists the chain's locations (skips when the
 *            owner has no chain).
 *
 * Runs against the backend's FAKE Google client (GOOGLE_BUSINESS_PROVIDER=fake,
 * REVIEW_REPLY_AI=fake): the consent page is a backend redirect, both fake
 * locations are offered to every user, and each holds 8 seeded reviews (one
 * already replied). Only ONE restaurant can hold FAKE_PLACE_1, so the file
 * disconnects at the start and in afterAll. The API helpers (googleBusinessApi)
 * do all cleanup — Google throttles reply writes to 10/min, which the helpers
 * wait out.
 *
 * Needs OWNER_EMAIL / OWNER_PASSWORD; logs in through the UI itself (no
 * globalSetup storageState). Gated by RELEASED_ON_QA.googleReviews.
 */
import type { Browser, BrowserContext, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  apiLogin,
  getOwnedChains,
  getOwnerRestaurants,
} from "../../../utils/apiHelper";
import { loginViaUi } from "../../../utils/auth";
import { requireRelease, probeGoogleReviews } from "../../../utils/releaseGate";
import * as gb from "../../../utils/googleBusinessApi";
import {
  createReviewsPage,
  type ReviewsPage,
} from "../../../pages/dashboard/owner/ReviewsPage";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

// Reply writes are throttled and the cleanup waits the window out.
test.describe.configure({ mode: "serial", timeout: 180_000 });

test.describe(
  "Google reviews — owner dashboard (UI)",
  { tag: "@google-reviews" },
  () => {
    test.skip(
      !OWNER_EMAIL || !OWNER_PASSWORD,
      "OWNER_EMAIL / OWNER_PASSWORD not set"
    );

    let token = "";
    let rid = "";
    let context: BrowserContext | undefined;
    let page: Page;
    let reviews: ReviewsPage;
    /** Reply-settings baseline, restored in afterAll. */
    let baselineSettings: gb.GbReplySettings | undefined;

    const disconnectQuietly = async () => {
      try {
        if (token && rid) await gb.disconnect(token, rid);
      } catch {
        /* best effort */
      }
    };

    /** Delete every reply on reviews we replied to (never the seeded one). */
    const clearOurReplies = async () => {
      if (!token || !rid) return;
      try {
        const res = await gb.listReviews(token, rid, {
          filter: "replied",
          limit: 50,
        });
        for (const r of res.data.data?.reviews ?? []) {
          if (r.reviewerName === "Ana Lopez") continue; // seeded
          await gb.deleteReply(token, rid, r.id);
        }
      } catch {
        /* best effort */
      }
    };

    test.beforeAll(async ({ browser }: { browser: Browser }) => {
      test.setTimeout(180_000);
      token = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
      const owned = await getOwnerRestaurants(token);
      rid = owned[0]?.id ?? "";
      test.skip(!rid, "the owner has no restaurant");
      requireRelease("googleReviews", await probeGoogleReviews(token, rid));

      const status = await gb.getStatus(token, rid);
      expect(status.status, JSON.stringify(status.data)).toBe(200);
      test.skip(
        status.data.data?.available === false,
        "Google Business is not configured on this backend (available:false)"
      );
      // Start from "not connected": clears a leftover from an aborted run.
      await clearOurReplies();
      await gb.disconnect(token, rid);
      baselineSettings = (await gb.getReplySettings(token, rid)).data.data
        ?.settings;

      const session = await loginViaUi(browser, OWNER_EMAIL, OWNER_PASSWORD);
      context = session.context;
      page = session.page;
      reviews = createReviewsPage(page);
    });

    test.beforeEach(async () => {
      await allure.label("feature", "Google review replies");
      await allure.label("severity", "normal");
    });

    test.afterAll(async () => {
      test.setTimeout(180_000);
      await clearOurReplies();
      if (baselineSettings && token && rid) {
        await gb.putReplySettings(token, rid, {
          tone: baselineSettings.tone,
          signOff: baselineSettings.signOff,
          contactLine: baselineSettings.contactLine,
          guidance: baselineSettings.guidance,
        });
      }
      await disconnectQuietly();
      await context?.close();
    });

    test("TC-1100 connect card → Connect → fake consent → Reviews list, Needs reply by default", async () => {
      await reviews.goto(rid);
      await expect(reviews.connectButton()).toBeVisible({ timeout: 30_000 });
      await reviews.connectButton().click();

      // The fake consent page redirects straight to the return page, which
      // either opens the Reviews tab or asks which listing is ours.
      await page.waitForURL(/google-business\/oauth-return|tab=reviews/, {
        timeout: 30_000,
      });
      const pick = page.getByRole("button", { name: /Fake Bistro/ }).first();
      const firstCard = reviews.cards().first();
      await expect(pick.or(firstCard)).toBeVisible({ timeout: 30_000 });
      if (await pick.isVisible()) {
        await page
          .getByRole("button", { name: /Fake Bistro(?! Uptown)/ })
          .first()
          .click();
      }

      await expect(page).toHaveURL(/tab=reviews/, { timeout: 30_000 });
      await expect(firstCard).toBeVisible({ timeout: 30_000 });
      await reviews.assertFilterSelected("unreplied");
      // The seeded reply (Ana Lopez) is not in Needs reply.
      await expect(reviews.cardFor("Ana Lopez")).toHaveCount(0);
      await expect(reviews.cardFor("Ben Carter")).toBeVisible();
    });

    test("TC-1101 Reply with AI → edit → Post → Waiting for Google to publish", async () => {
      const card = reviews.cardFor("Ben Carter");
      await reviews.openEditor(card);
      await reviews.aiButton(card).click();
      await expect(reviews.replyInput(card)).not.toHaveValue("", {
        timeout: 30_000,
      });
      await expect(reviews.draftLabel(card)).toBeVisible();
      await expect(reviews.aiUndo(card)).toBeVisible();

      const edited = "Thank you, Ben! We loved having you at brunch.";
      await reviews.replaceText(card, edited);
      await reviews.post(card);

      // A posted review leaves Needs reply ...
      await expect(reviews.cardFor("Ben Carter")).toHaveCount(0);
      // ... and shows up under Replied, still waiting for Google.
      await reviews.selectFilter("replied");
      const replied = reviews.cardFor("Ben Carter");
      await expect(replied).toBeVisible();
      await expect(replied).toContainText(edited);
      await expect(reviews.replyState(replied)).toHaveText(
        "Waiting for Google to publish"
      );
    });

    test("TC-1102 type a reply by hand → Post", async () => {
      await reviews.selectFilter("unreplied");
      const card = reviews.cardFor("Chris Dole");
      await reviews.openEditor(card);
      await expect(reviews.draftLabel(card)).toBeHidden();
      const text = "Sorry it was loud, Chris. Ask for the patio next time.";
      await reviews.replaceText(card, text);
      await expect(reviews.byteCounter(card)).toContainText(
        `${Buffer.byteLength(text, "utf8")} / 4096`
      );
      await reviews.post(card);

      await reviews.selectFilter("replied");
      const replied = reviews.cardFor("Chris Dole");
      await expect(replied).toContainText(text);
    });

    test("TC-1103 edit a posted reply", async () => {
      await reviews.selectFilter("replied");
      const card = reviews.cardFor("Ben Carter");
      await reviews.openEditor(card);
      await expect(reviews.replyInput(card)).toHaveValue(/loved having you/);
      const next = "Thanks again, Ben. Brunch is on us next time!";
      await reviews.replaceText(card, next);
      await reviews.post(card);
      await expect(reviews.cardFor("Ben Carter")).toContainText(next);
      await expect(reviews.cardFor("Ben Carter")).not.toContainText(
        "loved having you"
      );
    });

    test("TC-1104 delete a reply with confirmation", async () => {
      await reviews.selectFilter("replied");
      const card = reviews.cardFor("Chris Dole");
      await expect(card).toBeVisible();
      await reviews.confirmDelete(card);
      await expect(reviews.cardFor("Chris Dole")).toHaveCount(0, {
        timeout: 30_000,
      });
      // The review is back under Needs reply.
      await reviews.selectFilter("unreplied");
      await expect(reviews.cardFor("Chris Dole")).toBeVisible();
    });

    test("TC-1105 translated review: toggle between translation and original", async () => {
      await reviews.selectFilter("all");
      const card = reviews.cardFor("Hugo Ruiz");
      await expect(card).toBeVisible();
      const toggle = reviews.toggleTranslation(card);
      // Opens on the reviewer's own words ...
      await expect(toggle).toHaveText("Show translation");
      await expect(card).toContainText("Comida mala");
      await toggle.click();
      // ... one tap shows Google's translation ...
      await expect(toggle).toHaveText("Show original");
      await expect(card).toContainText("Bad food");
      // ... and another goes back.
      await toggle.click();
      await expect(toggle).toHaveText("Show translation");
      await expect(card).toContainText("Comida mala");
      // Reviews without a translation have no toggle.
      await expect(
        reviews.toggleTranslation(reviews.cardFor("Ben Carter"))
      ).toHaveCount(0);
    });

    test("TC-1106 reply settings dialog saves tone, sign-off, contact line and guidance", async () => {
      await reviews.openSettings();
      await reviews.pickTone("Professional");
      await reviews.settingsField("signoff").fill("- Maria, owner");
      await reviews.settingsField("contact").fill("reach out to us directly");
      await reviews.settingsField("guidance").fill("mention our patio");
      await reviews.saveSettings();

      const saved = await gb.getReplySettings(token, rid);
      expect(saved.data.data?.settings).toMatchObject({
        tone: "PROFESSIONAL",
        signOff: "- Maria, owner",
        contactLine: "reach out to us directly",
        guidance: "mention our patio",
      });

      // Re-opening shows what was saved.
      await reviews.openSettings();
      await expect(reviews.settingsField("signoff")).toHaveValue(
        "- Maria, owner"
      );
      await expect(reviews.settingsField("guidance")).toHaveValue(
        "mention our patio"
      );

      // Restore the baseline through the UI (WARM, empty fields).
      await reviews.pickTone("Warm and friendly");
      await reviews.settingsField("signoff").fill("");
      await reviews.settingsField("contact").fill("");
      await reviews.settingsField("guidance").fill("");
      await reviews.saveSettings();
      const restored = await gb.getReplySettings(token, rid);
      expect(restored.data.data?.settings.tone).toBe("WARM");
      expect(restored.data.data?.settings.signOff ?? "").toBe("");
      expect(restored.data.data?.settings.guidance ?? "").toBe("");
    });

    test("TC-1107 chain Reviews page lists the chain's locations", async () => {
      const chains = await getOwnedChains(token);
      const chain = chains.find((c) => c.restaurants.some((r) => r.id === rid));
      test.skip(!chain, "the test owner has no chain containing this location");
      await reviews.gotoChain(chain!.groupId);
      await expect(reviews.chainRows().first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(reviews.chainRows()).toHaveCount(chain!.locationCount);
      await expect(reviews.chainRows().first()).toContainText(
        /Connected|Not connected|Needs reconnect/
      );
    });
  }
);
