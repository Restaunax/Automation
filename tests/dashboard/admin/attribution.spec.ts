/**
 * attribution.spec.ts — who brought a restaurant in (RestauNax
 * feat/sales-attribution; spec docs/features/RESTAURANT_ATTRIBUTION.md).
 *
 * TC-1103..1106. Linking a restaurant to an affiliate from the affiliate's
 * Sales tab and seeing it on the restaurant's "Brought in by" row; the lock
 * refusal for an activated restaurant; the business-card leaderboard; and
 * Remove (reason required) clearing the row.
 *
 * Gated: until the branch is merged and deployed, `/api/admin/attribution`
 * answers 404 and every test here SKIPS with that reason (utils/releaseGate.ts
 * → RELEASED_ON_QA.attribution). Select with `--grep @attribution`.
 *
 * Data: two throwaway restaurants per run (created unactivated through
 * POST /restaurant/new, deleted in afterAll; their attribution rows cascade).
 * The affiliate and the business card are ONE persistent fixture each
 * ("auto-attribution"): a user with an Affiliate row can never be deleted and
 * cards can only be disabled, so per-run ones would pile up on QA.
 * TC-1104 needs the shared seed restaurant to be ACTIVATED (it has a real
 * subscription on QA); it skips with that reason otherwise and never links it.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createAdminAttributionPage } from "../../../pages/dashboard/admin/AdminAttributionPage";
import {
  AUTOMATION_ATTRIBUTION_AFFILIATE_TAG,
  apiLogin,
  createRestaurantRaw,
  deleteTestRestaurant,
  ensureAttributionAffiliate,
  ensureAttributionCard,
  getRestaurantAttributionApi,
  setRestaurantAttributionRaw,
} from "../../../utils/apiHelper";
import { generateRunId, readSharedState } from "../../../utils/testData";
import { probeAttribution, requireRelease } from "../../../utils/releaseGate";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const REASON = "Automation: met the owner at a trade show";

test.describe("HQ — Restaurant attribution", { tag: "@attribution" }, () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  let adminToken = "";
  let deployed = false;
  let affiliateName = "";
  let cardName = "";
  const runId = generateRunId();
  const linkName = `AUTO Attribution Link ${runId}`;
  const removeName = `AUTO Attribution Remove ${runId}`;
  const created: string[] = [];
  let removeId = "";

  const createThrowaway = async (name: string): Promise<string> => {
    const res = await createRestaurantRaw(adminToken, {
      name,
      street: "123 Test Street",
      city: "Miami",
      state: "FL",
      zipCode: "33101",
      cuisineType: "Italian",
      restaurantPhone: "5551234567",
      description: "Automation attribution test (throwaway)",
      minimumOrderPreparationTime: 0,
    });
    const id = (res.data as { restaurant?: { id?: string } })?.restaurant?.id;
    if (!id) {
      throw new Error(
        `Failed to create ${name}: ${res.status} ${JSON.stringify(res.data)}`
      );
    }
    created.push(id);
    return id;
  };

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    const admin = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    adminToken = admin.accessToken;
    deployed = await probeAttribution(adminToken);
    if (!deployed) return;

    const affiliate = await ensureAttributionAffiliate(adminToken);
    affiliateName = affiliate.displayName;
    cardName = (await ensureAttributionCard(adminToken, admin.userId)).fullName;

    await createThrowaway(linkName);
    removeId = await createThrowaway(removeName);
    const linked = await setRestaurantAttributionRaw(adminToken, removeId, {
      affiliateId: affiliate.affiliateId,
      reason: REASON,
    });
    if (linked.status !== 200) {
      throw new Error(
        `Seeding the source for ${removeName} failed: ${linked.status} ${JSON.stringify(linked.data)}`
      );
    }
  });

  test.afterAll(async () => {
    for (const id of created) {
      try {
        await deleteTestRestaurant(adminToken, id);
      } catch (err) {
        console.warn(`[attribution] cleanup of ${id} failed:`, err);
      }
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Attribution");
    await allure.label("severity", "normal");
    requireRelease("attribution", deployed);
  });

  test("TC-1103: linking a restaurant from the affiliate's Sales tab shows on its Brought-in-by row", async ({
    adminPage,
  }) => {
    await allure.label("severity", "critical");
    const ui = createAdminAttributionPage(adminPage);

    await allure.step("Open the affiliate's Sales tab", async () => {
      await ui.openAffiliateSalesTab(AUTOMATION_ATTRIBUTION_AFFILIATE_TAG);
    });

    await allure.step(
      "Link the throwaway restaurant with a reason",
      async () => {
        await ui.fillLinkDialog(linkName, REASON);
        await ui.submitLink();
        await ui.assertLinkedToast();
      }
    );

    await allure.step(
      "The restaurant's Brought-in-by row names the affiliate, set in HQ",
      async () => {
        await ui.openRestaurantDetails(linkName);
        await ui.assertSource(affiliateName, /Set in HQ/);
        await expect(ui.broughtInBy()).toContainText("Affiliate");
        await expect(
          ui.broughtInBy().getByRole("button", { name: "Change" })
        ).toBeVisible();
      }
    );
  });

  test("TC-1104: linking an activated restaurant is refused with the lock message", async ({
    adminPage,
  }) => {
    const seed = readSharedState();
    test.skip(
      !seed.restaurantId,
      "No seed restaurant this run (OWNER_EMAIL / OWNER_PASSWORD unset), so there is no activated restaurant to try"
    );
    const before = await getRestaurantAttributionApi(
      adminToken,
      seed.restaurantId
    );
    test.skip(
      !before.activatedAt,
      `Seed restaurant ${seed.restaurantName} is not activated on this environment, so it is not locked`
    );
    const ui = createAdminAttributionPage(adminPage);

    await allure.step("Try to link the activated seed restaurant", async () => {
      await ui.openAffiliateSalesTab(AUTOMATION_ATTRIBUTION_AFFILIATE_TAG);
      await ui.fillLinkDialog(seed.restaurantName, REASON);
      await ui.submitLink();
    });

    await allure.step("The dialog shows the lock refusal", async () => {
      await ui.assertLinkRefused(
        /activated on .*Its source is locked because money has been attributed under it/
      );
    });

    await allure.step("Nothing changed on the restaurant", async () => {
      const after = await getRestaurantAttributionApi(
        adminToken,
        seed.restaurantId
      );
      expect(after.data?.payee.id ?? null).toBe(before.data?.payee.id ?? null);
    });
  });

  test("TC-1105: the business-card leaderboard lists the seeded card", async ({
    adminPage,
  }) => {
    const ui = createAdminAttributionPage(adminPage);

    await allure.step("Open Business cards → Leaderboard", async () => {
      await ui.gotoBusinessCards();
      await ui.showLeaderboard();
    });

    await allure.step("The seeded card has a ranked row", async () => {
      await expect(ui.leaderboardRow(cardName)).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test("TC-1106: Remove requires a reason and clears the Brought-in-by row", async ({
    adminPage,
  }) => {
    const ui = createAdminAttributionPage(adminPage);

    await allure.step("Open the linked throwaway restaurant", async () => {
      await ui.openRestaurantDetails(removeName);
      await ui.assertSource(affiliateName, /Set in HQ/);
    });

    await allure.step(
      "Remove stays disabled until the reason is long enough",
      async () => {
        await ui.openRemove();
        await expect(ui.removeSubmitButton()).toBeDisabled();
        await ui.typeRemoveReason("too short");
        await expect(ui.removeSubmitButton()).toBeDisabled();
        await ui.typeRemoveReason(REASON);
        await expect(ui.removeSubmitButton()).toBeEnabled();
      }
    );

    await allure.step("Remove clears the row", async () => {
      await ui.removeSubmitButton().click();
      await ui.assertNoSource();
      const after = await getRestaurantAttributionApi(adminToken, removeId);
      expect(after.data).toBeNull();
    });
  });
});
