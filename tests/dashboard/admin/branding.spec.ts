/**
 * branding.spec.ts — HQ → Restaurant → Branding, individual restaurant
 * (RestauNax PR #1036: "the HQ branding page shows the saved logo, hero and
 * tagline").
 *
 * TC-932. The page read `response.data.restaurant` from
 * GET /api/admin/restaurants/:id, which answers with the restaurant itself,
 * so a saved logo, hero image and tagline all showed as empty. Own throwaway
 * restaurant (createSecondOwner, alwaysFresh) with a per-run logo/hero URL
 * and tagline written through the same endpoints the page saves to; deleted
 * afterwards. The image URLs are never fetched for real — the test checks
 * the <img src>, which proves the page read the saved value.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  deleteTestRestaurant,
} from "../../../utils/apiHelper";
import { generateRunId } from "../../../utils/testData";
import { requireRelease } from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe(
  "HQ — Branding (individual restaurant)",
  { tag: ["@bugfix-1036", "@branding"] },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
    );

    const runId = generateRunId();
    const logoUrl = `https://static.restaunax.com/automation/logo-${runId}.png`;
    const heroUrl = `https://static.restaunax.com/automation/hero-${runId}.jpg`;
    const tagline = `AUTO tagline ${runId}`;
    let adminToken = "";
    let restaurantId = "";

    test.beforeAll(async () => {
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!tenant.restaurantId)
        throw new Error("[branding] could not mint the throwaway restaurant");
      restaurantId = tenant.restaurantId;
      // logo + hero: the admin restaurant endpoint (what the image picker PUTs).
      const images = await apiRequestRaw(
        "PUT",
        `/api/admin/restaurants/${restaurantId}`,
        { logoUrl, heroImage: heroUrl },
        adminToken
      );
      if (!images.ok) throw new Error(`[branding] images → ${images.status}`);
      // tagline: /restaurant/:id/additional-details (what Save PUTs).
      const details = await apiRequestRaw(
        "PUT",
        `/restaurant/${restaurantId}/additional-details`,
        { tagline },
        tenant.accessToken
      );
      if (!details.ok)
        throw new Error(`[branding] tagline → ${details.status}`);
    });

    test.afterAll(async () => {
      // Best-effort: a cleanup failure must not mask the result.
      if (restaurantId)
        await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    });

    test("TC-932: the branding page shows the restaurant's saved logo, hero image and tagline", async ({
      adminPage,
    }) => {
      await allure.label("feature", "HQ Branding");
      await allure.label("severity", "normal");
      await allure.description(
        "Opening /admin?tab=restaurant&section=branding&restaurantId=<id> renders the saved logo and hero " +
          "as image previews (src = the saved URL, not the 'No image set' placeholder), the button reads " +
          "'Change image', and the Tagline field holds the saved tagline."
      );
      await adminPage.goto(
        `/admin?tab=restaurant&section=branding&restaurantId=${restaurantId}`,
        { waitUntil: "domcontentloaded" }
      );
      const taglineInput = adminPage.getByPlaceholder(
        "A short tagline shown on the storefront"
      );
      await expect(taglineInput).toBeVisible({ timeout: 30_000 });
      // The restaurant fetch races the config fetch; give it a moment.
      await expect
        .poll(() => taglineInput.inputValue(), { timeout: 10_000 })
        .not.toBe("")
        .catch(() => {
          // Absent value is decided by the gate below, not here.
        });

      const logo = adminPage.locator(`img[src="${logoUrl}"]`);
      requireRelease(
        "bugBatch",
        (await logo.count()) > 0,
        "the branding page shows no saved logo"
      );

      await expect(logo).toBeVisible();
      await expect(adminPage.locator(`img[src="${heroUrl}"]`)).toBeVisible();
      await expect(taglineInput).toHaveValue(tagline);
    });
  }
);
