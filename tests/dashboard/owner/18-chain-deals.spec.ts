/**
 * 18-chain-deals.spec.ts — chain-scoped Deals in the owner portal (Layer 2c).
 *
 * The chain shell (`/chain/:groupId/restaurantManagement?tab=deals|create-deal`)
 * lists chain deals (RestaurantGroup-scoped: "Chain" chip, "across N chain
 * locations", "View Analytics"), creates them through DealForm behind the
 * fan-out confirm ("Heads up — chain-wide change" → "Create deal for all N
 * locations"), and every member location's per-restaurant Deals section is
 * disabled ("Managed at chain level"). Chain deals reach the storefront of
 * every member — asserted on the public /active endpoint here; the UI storefront
 * journey lives in customer/08-deals-handoff.spec.ts. Rules from
 * CHAIN_RESTAURANTS.md; inventory in docs/DEALS_TAB_TEST_STRATEGY.md §4 (2c).
 *
 * Uses the persistent "Automation Chain" fixture (globalSetup →
 * ensureAutomationChain) and skips with a reason when it isn't available. Own
 * data: a shared master category "Automation Chain Deals <id>" with two items
 * (hard-deleted via the admin permanent-delete) and AUTO chain deals deleted in
 * afterAll (chain deals go through the scope-agnostic DELETE /api/deals/:id).
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerDealsPage } from "../../../pages/dashboard/owner/OwnerDealsPage";
import { createDealFormPage } from "../../../pages/dashboard/owner/DealFormPage";
import { createDealAnalyticsPage } from "../../../pages/dashboard/owner/DealAnalyticsPage";
import { readSharedState, generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  createChainDealRaw,
  getChainDealsRaw,
  getActiveDealsPublic,
  getRestaurantDeals,
  deleteDealApi,
  type ApiDeal,
  type ApiMenuItem,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Owner — Chain deals", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  let token = "";
  let adminToken = "";
  let chainGroupId = "";
  let locA = "";
  let locB = "";
  let sharedGroupId = "";
  let s1: ApiMenuItem; // 9.00
  let s2: ApiMenuItem; // 6.00
  let seededChainDeal: ApiDeal;
  const createdDealIds: string[] = [];

  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  const skipWithoutChain = () =>
    test.skip(
      !chainGroupId,
      "Automation Chain fixture not available (globalSetup could not build it — needs ADMIN creds)"
    );

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const state = readSharedState();
    chainGroupId = state.chainGroupId ?? "";
    locA = state.chainLocationAId ?? "";
    locB = state.chainLocationBId ?? "";
    if (!chainGroupId) return;
    token = await freshToken();
    if (ADMIN_EMAIL && ADMIN_PASSWORD)
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    sharedGroupId = (
      await createMenuGroupNamed(token, `Automation Chain Deals ${runId}`, {
        groupId: chainGroupId,
      })
    ).id;
    s1 = await createMenuItemFull(
      token,
      sharedGroupId,
      `Chain Deal Pizza ${runId}`,
      9
    );
    s2 = await createMenuItemFull(
      token,
      sharedGroupId,
      `Chain Deal Soda ${runId}`,
      6
    );
    const res = await createChainDealRaw(token, chainGroupId, {
      name: `AUTO Chain Seeded ${runId}`,
      description: "seeded chain deal",
      dealPrice: 12,
      items: [
        { menuItemId: s1.id, quantity: 1, itemName: s1.name, itemPrice: 9 },
        { menuItemId: s2.id, quantity: 1, itemName: s2.name, itemPrice: 6 },
      ],
    });
    if (!res.ok || !res.data.deal)
      throw new Error(
        `chain deal seed failed: ${res.status} ${JSON.stringify(res.data)}`
      );
    seededChainDeal = res.data.deal;
    createdDealIds.push(seededChainDeal.id);
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshToken().catch(() => token);
    for (const id of createdDealIds) await deleteDealApi(t, id).catch(() => {});
    // UI-created chain deals carry the run id.
    const chainList = await getChainDealsRaw(t, chainGroupId).catch(() => null);
    for (const d of chainList?.data?.deals ?? [])
      if (d.name?.includes(runId)) await deleteDealApi(t, d.id).catch(() => {});
    if (adminToken)
      for (const it of [s1, s2].filter(Boolean))
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
    if (sharedGroupId)
      await deleteTestMenuGroup(t, sharedGroupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Chain Deals");
    await allure.label("severity", "critical");
    if (token) token = await freshToken();
  });

  test("TC-365: the chain shell lists chain deals with the Chain chip, rollup caption and View Analytics; a member's own Deals section is managed at chain level", async ({
    ownerPage,
  }) => {
    skipWithoutChain();
    await allure.description(
      "/chain/:gid/restaurantManagement?tab=deals renders the seeded chain deal row (name, 2 items, $12.00 / " +
        "$15.00, 20% off, 'Chain' scope chip), the caption 'across 2 chain locations' and the chain-only " +
        "'View Analytics' button, which opens Deal Analytics fed by /api/chains/:gid/deal-stats. Location A's " +
        "shell shows the Deals sidebar entry disabled and ?tab=deals renders 'Managed at chain level'; its owner " +
        "list (GET /api/deals/restaurant/A) does not contain the chain deal, while public /active at A and B does."
    );
    const dealsPage = createOwnerDealsPage(ownerPage);
    const analytics = createDealAnalyticsPage(ownerPage);
    await dealsPage.gotoChainManageDeals(chainGroupId);
    await expect(dealsPage.chainRollupCaption()).toHaveText(
      "across 2 chain locations"
    );
    await expect(dealsPage.viewAnalyticsButton()).toBeVisible();
    const row = dealsPage.row(seededChainDeal.name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("2 items");
    await expect(row).toContainText("$12.00");
    await expect(row).toContainText("$15.00");
    await expect(row).toContainText("20% off");
    await expect(dealsPage.rowScopeChip(seededChainDeal.name)).toHaveText(
      "Chain"
    );

    await allure.step("View Analytics → chain deal stats", async () => {
      const [statsRes] = await Promise.all([
        ownerPage.waitForResponse(
          (r) =>
            new RegExp(`/api/chains/${chainGroupId}/deal-stats`).test(
              r.url()
            ) && r.request().method() === "GET",
          { timeout: 20_000 }
        ),
        dealsPage.viewAnalyticsButton().click(),
      ]);
      expect(statsRes.status()).toBe(200);
      const stats = (await statsRes.json()) as {
        summary: { totalCount: number; activeCount: number };
      };
      await analytics.assertLoaded();
      await expect(analytics.metricValue("Total Deals")).toHaveText(
        String(stats.summary.totalCount)
      );
      expect(stats.summary.totalCount).toBeGreaterThanOrEqual(1);
    });

    await allure.step("member location: managed at chain level", async () => {
      await dealsPage.gotoTab(locA, "deals");
      await expect(dealsPage.disabledSidebarDeals()).toBeVisible({
        timeout: 15_000,
      });
      await expect(dealsPage.chainManagedHeading()).toBeVisible();
      await expect(dealsPage.row(seededChainDeal.name)).toHaveCount(0);
    });

    await allure.step("scope: owner list vs public /active", async () => {
      const ownerListA = await getRestaurantDeals(token, locA);
      expect(ownerListA.some((d) => d.id === seededChainDeal.id)).toBe(false);
      for (const loc of [locA, locB]) {
        const pub = await getActiveDealsPublic(loc);
        expect(
          (pub.data.deals ?? []).some((d) => d.id === seededChainDeal.id),
          `offered at ${loc}`
        ).toBe(true);
      }
    });
  });

  test("TC-366: creating a chain deal in the chain shell goes through the fan-out confirm and lands at every location", async ({
    ownerPage,
  }) => {
    skipWithoutChain();
    await allure.description(
      "Chain shell → Create Deal: the picker lists shared master items (anchor-location caption), the submit " +
        "reads 'Create deal for all 2 locations', clicking it opens 'Heads up — chain-wide change' → Continue → " +
        "POST /api/chains/:gid/deals 201 → 'Deal created successfully' → back on the chain table with a 'Chain' " +
        "row; public /active at BOTH locations lists it. (The fan-out confirm is suppressed for the rest of the " +
        "browser session after the first Continue — this test clears that flag first.)"
    );
    const dealsPage = createOwnerDealsPage(ownerPage);
    const form = createDealFormPage(ownerPage);
    const name = `AUTO Chain UI ${runId}`;
    await dealsPage.gotoChainTab(chainGroupId, "create-deal");
    await ownerPage.evaluate(() => {
      for (const k of Object.keys(sessionStorage))
        if (k.startsWith("restaunax:fanOutConfirm"))
          sessionStorage.removeItem(k);
    });
    await form.assertCreateMode();
    await expect(
      ownerPage.getByText(/Menu items shown reflect the chain's first location/)
    ).toBeVisible();
    await form.nameInput().fill(name);
    await form.addItem(s1.name);
    await form.addItem(s2.name);
    await form.priceInput().fill("13");
    await expect(form.submitButton()).toHaveText(
      "Create deal for all 2 locations"
    );
    await form.submitButton().click();
    await expect(form.fanOutDialog()).toBeVisible({ timeout: 10_000 });
    await expect(form.fanOutDialog()).toContainText("create a deal");
    const [res] = await Promise.all([
      ownerPage.waitForResponse(
        (r) =>
          new RegExp(`/api/chains/${chainGroupId}/deals$`).test(r.url()) &&
          r.request().method() === "POST",
        { timeout: 20_000 }
      ),
      form.fanOutContinue().click(),
    ]);
    expect(res.status()).toBe(201);
    const created = ((await res.json()) as { deal?: ApiDeal }).deal;
    if (created?.id) createdDealIds.push(created.id);
    expect(created?.restaurantGroupId).toBe(chainGroupId);
    await expect(form.createdSnackbar()).toBeVisible({ timeout: 5_000 });
    await dealsPage.assertManageDealsLoaded();
    await dealsPage.search(name);
    const row = dealsPage.row(name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("$13.00");
    await expect(row).toContainText("$15.00");
    await expect(dealsPage.rowScopeChip(name)).toHaveText("Chain");
    for (const loc of [locA, locB]) {
      const pub = await getActiveDealsPublic(loc);
      expect(
        (pub.data.deals ?? []).some((d) => d.id === created?.id),
        `offered at ${loc}`
      ).toBe(true);
    }
  });
});
