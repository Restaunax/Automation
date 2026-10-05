/**
 * 11-deals.spec.ts — Owner → Deals (Layer 2: Manage Deals table, Create/Edit
 * form, cap banners, Deal Analytics, AI Generator smoke).
 *
 * TC-86/87 are the original navigation checks; TC-351..364 assert the UI on
 * API-seeded deals (see docs/DEALS_TAB_TEST_STRATEGY.md §4 Layer 2). Own data:
 * a per-run "Automation Deals UI <id>" category with three items on the seed
 * restaurant and six AUTO deals (plain / restricted / inactive / expired / two
 * more for sorting + pagination), all deleted in afterAll — globalTeardown's
 * AUTO sweep backstops it. Since deal scheduling (restaunax #898) the form's
 * "When is this deal available?" section is live and driven in the `schedule`
 * describe at the end of this file; the table assertions accept the legacy and
 * the #898 status / schedule text so they pass on both sides of the deploy.
 *
 * Concurrency note: the seed restaurant carries five real ACTIVE deals and only
 * ten may be active; customer/08-deals-handoff seeds two more from another
 * worker. So this file keeps its own ACTIVE footprint at two (plain,
 * restricted), asserts counts against the page's OWN list response, re-activates
 * with a cap-tolerant retry, and tears its cap top-ups down inside TC-359.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  createOwnerDealsPage,
  DEAL_STATUS_TEXT,
} from "../../../pages/dashboard/owner/OwnerDealsPage";
import { createDealFormPage } from "../../../pages/dashboard/owner/DealFormPage";
import { createDealAnalyticsPage } from "../../../pages/dashboard/owner/DealAnalyticsPage";
import { readSharedState, generateRunId } from "../../../utils/testData";
import { type Page } from "@playwright/test";
import {
  MEAL_CHIP,
  SCHEDULE_CHIP_LABELS,
  type ScheduleChip,
} from "../../../pages/dashboard/owner/DealFormPage";
import { requireScheduling } from "../../../utils/dealScheduleGate";
import {
  WEEKDAYS,
  formatClockEn,
  formatDateKeyEn,
  localDateKey,
  minutesOf,
  normalizeSpaces,
} from "../../../utils/dealSchedule";

import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  createDealApi,
  createDealApiCapSafe,
  getDealApi,
  getDealRaw,
  setDealStatusRaw,
  deleteDealApi,
  getRestaurantDeals,
  getRestaurantTimeZonePublic,
  getRestaurantDealsRaw,
  getMealPeriodsPublic,
  getBusinessHoursRaw,
  getActiveDealsCountRaw,
  type ApiDeal,
  type ApiMenuItem,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const daysFromNowIso = (d: number) =>
  new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();

test.describe("Owner — Deals", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  const runId = generateRunId();
  let token = "";
  let adminToken = "";
  let restaurantId = "";
  let groupId = "";
  let itemA: ApiMenuItem; // 10.00
  let itemB: ApiMenuItem; // 6.50
  let itemC: ApiMenuItem; // 4.00
  const seeded: Record<string, ApiDeal> = {};
  const extraDealIds: string[] = [];
  const N = {
    plain: `AUTO Table Plain ${runId}`,
    restricted: `AUTO Table Restricted ${runId}`,
    inactive: `AUTO Table Inactive ${runId}`,
    expired: `AUTO Table Expired ${runId}`,
    pricey: `AUTO Table Pricey ${runId}`,
    cheap: `AUTO Table Cheap ${runId}`,
  };

  const freshToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  const two = () => [
    { id: itemA.id, name: itemA.name, price: itemA.price },
    { id: itemB.id, name: itemB.name, price: itemB.price },
  ];

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readSharedState().restaurantId;
    token = await freshToken();
    if (ADMIN_EMAIL && ADMIN_PASSWORD)
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    groupId = (
      await createMenuGroupNamed(token, `Automation Deals UI ${runId}`, {
        restaurantId,
      })
    ).id;
    itemA = await createMenuItemFull(
      token,
      groupId,
      `Deal Burger ${runId}`,
      10
    );
    itemB = await createMenuItemFull(
      token,
      groupId,
      `Deal Fries ${runId}`,
      6.5
    );
    itemC = await createMenuItemFull(token, groupId, `Deal Drink ${runId}`, 4);
    seeded.plain = await createDealApi(
      token,
      restaurantId,
      N.plain,
      12,
      two(),
      {
        description: `table-search-${runId}`,
      }
    );
    seeded.restricted = await createDealApi(
      token,
      restaurantId,
      N.restricted,
      12,
      two(),
      {
        validDays: ["MONDAY", "WEDNESDAY"],
        validTimeStart: "11:00",
        validTimeEnd: "14:00",
      }
    );
    seeded.inactive = await createDealApi(
      token,
      restaurantId,
      N.inactive,
      12,
      two()
    );
    await setDealStatusRaw(token, seeded.inactive!.id, "INACTIVE");
    // Keep this file's steady active footprint small — the seed restaurant has
    // ~5 real active deals + the storefront file's 2, and the cap is 10 (now
    // enforced on create, #618). restricted stays INACTIVE; its window text
    // (TC-351) and the Inactive filter (TC-353) don't need it active.
    await setDealStatusRaw(token, seeded.restricted!.id, "INACTIVE");
    seeded.expired = await createDealApi(
      token,
      restaurantId,
      N.expired,
      12,
      two(),
      // -2: "expired" is judged on the restaurant's calendar since Plan 1
      { endDate: daysFromNowIso(-2) }
    );
    seeded.pricey = await createDealApi(token, restaurantId, N.pricey, 20, [
      { id: itemA.id, name: itemA.name, price: itemA.price, quantity: 2 },
      { id: itemC.id, name: itemC.name, price: itemC.price },
    ]);
    seeded.cheap = await createDealApi(token, restaurantId, N.cheap, 8, [
      { id: itemB.id, name: itemB.name, price: itemB.price },
      { id: itemC.id, name: itemC.name, price: itemC.price },
    ]);
    // Keep the ACTIVE footprint on the shared restaurant minimal (see header).
    await setDealStatusRaw(token, seeded.pricey!.id, "INACTIVE");
    await setDealStatusRaw(token, seeded.cheap!.id, "INACTIVE");
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await freshToken().catch(() => token);
    for (const d of Object.values(seeded))
      await deleteDealApi(t, d.id).catch(() => {});
    for (const id of extraDealIds) await deleteDealApi(t, id).catch(() => {});
    // Anything created through the UI in this run carries the run id.
    for (const d of await getRestaurantDeals(t, restaurantId).catch(() => []))
      if (d.name?.includes(runId)) await deleteDealApi(t, d.id).catch(() => {});
    if (adminToken)
      for (const it of [itemA, itemB, itemC].filter(Boolean))
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Deals");
    await allure.label("severity", "critical");
    token = await freshToken();
  });

  test("TC-86: owner can reach the Manage Deals tab", async ({ ownerPage }) => {
    await allure.description(
      "Owner expands the Deals flyout section in the sidebar and clicks Manage Deals, landing on " +
        "?tab=deals with the Manage Deals heading visible."
    );
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.navigateToManageDeals(restaurantId);
    await allure.parameter("URL", ownerPage.url());
    await dealsPage.assertManageDealsLoaded();
  });

  test("TC-87: Manage Deals tab shows the Create Deal and AI Generate Deals actions", async ({
    ownerPage,
  }) => {
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.gotoManageDeals(restaurantId);
    await expect(dealsPage.createDealButton()).toBeVisible({ timeout: 10_000 });
    await expect(dealsPage.aiGenerateButton()).toBeVisible();
    // Restaurant scope has no "View Analytics" header button (chain-only).
    await expect(dealsPage.viewAnalyticsButton()).toHaveCount(0);
  });

  // ── Manage Deals table ────────────────────────────────────────────────────

  test("TC-351: the table renders the seeded deals cell-for-cell and the stat cards equal the page's own list response", async ({
    ownerPage,
  }) => {
    await allure.description(
      "For API-seeded deals the row shows: name, 'N items' (qty-1 slots), $deal + struck $original, " +
        "'X% off' (0 dp), restrictions ('All days'/'All day' or 'Mon, Wed' + '11:00 - 14:00'), the status " +
        "badge, and '0 times'. Stat cards Total/Active Deals equal the counts in the GET " +
        "/api/deals/restaurant/:id response the page itself received (concurrency-safe)."
    );
    const dealsPage = createOwnerDealsPage(ownerPage);
    const [listRes] = await Promise.all([
      ownerPage.waitForResponse(
        (r) =>
          new RegExp(`/api/deals/restaurant/${restaurantId}$`).test(r.url()) &&
          r.request().method() === "GET",
        { timeout: 30_000 }
      ),
      dealsPage.gotoTab(restaurantId, "deals"),
    ]);
    const list = ((await listRes.json()) as { deals?: ApiDeal[] }).deals ?? [];
    await dealsPage.assertManageDealsLoaded();
    await dealsPage.setRowsPerPage(25);

    await allure.step("plain deal row", async () => {
      const row = dealsPage.row(N.plain);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText("2 items");
      await expect(row).toContainText("$12.00");
      await expect(row).toContainText("$16.50");
      await expect(row).toContainText("27% off");
      // Legacy column: "All days"/"All day"; #898 column: "Any time the store is open".
      await expect(row).toContainText(/All days|Any time the store is open/);
      await expect(row).toContainText("0 times");
      await expect(dealsPage.rowStatusText(N.plain)).toHaveText(
        DEAL_STATUS_TEXT.active
      );
      await expect(dealsPage.rowSwitch(N.plain)).toBeChecked();
      await expect(dealsPage.rowScopeChip(N.plain)).toHaveText("Location");
    });
    await allure.step("restricted deal shows its window", async () => {
      const row = dealsPage.row(N.restricted);
      await expect(row).toContainText("Mon, Wed");
      // Legacy "11:00 - 14:00"; #898 shows scheduleSummary "Mon, Wed · 11:00 AM–2:00 PM".
      await expect(row).toContainText(
        /11:00 - 14:00|11:00\s?AM\s?[–-]\s?2:00\s?PM/
      );
    });
    await allure.step("pricey deal: 3 slots, 20 of 24 → 17% off", async () => {
      const row = dealsPage.row(N.pricey);
      await expect(row).toContainText("3 items");
      await expect(row).toContainText("$20.00");
      await expect(row).toContainText("$24.00");
      await expect(row).toContainText("17% off");
    });
    await allure.step("inactive + expired badges", async () => {
      await expect(dealsPage.rowStatusText(N.inactive)).toHaveText(
        DEAL_STATUS_TEXT.inactive
      );
      await expect(dealsPage.rowSwitch(N.inactive)).not.toBeChecked();
      await expect(dealsPage.rowStatusText(N.expired)).toHaveText(
        DEAL_STATUS_TEXT.expired
      );
      await expect(dealsPage.rowSwitch(N.expired)).toBeDisabled();
    });
    await allure.step("stat cards = list response", async () => {
      const active = list.filter(
        (d) => (d.computedStatus ?? d.status) === "ACTIVE"
      ).length;
      await expect(dealsPage.statCardValue("Total Deals")).toHaveText(
        String(list.length)
      );
      await expect(dealsPage.statCardValue("Active Deals")).toHaveText(
        String(active)
      );
      const used = list.reduce((s, d) => s + (d.timesUsed ?? 0), 0);
      await expect(dealsPage.statCardValue("Times Used")).toHaveText(
        String(used)
      );
    });
  });

  test("TC-352: search filters by name and description; no match → 'No deals found' + 'Create Your First Deal'; Refresh re-fetches", async ({
    ownerPage,
  }) => {
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.gotoManageDeals(restaurantId);
    await dealsPage.search(N.cheap);
    await expect(dealsPage.row(N.cheap)).toBeVisible();
    await expect(dealsPage.row(N.plain)).toHaveCount(0);
    await dealsPage.search(`table-search-${runId}`);
    await expect(dealsPage.row(N.plain)).toBeVisible();
    await expect(dealsPage.row(N.cheap)).toHaveCount(0);
    await dealsPage.search(`zzz-no-such-deal-${runId}`);
    await expect(dealsPage.emptyState()).toBeVisible();
    await expect(dealsPage.createFirstDealButton()).toBeVisible();
    await dealsPage.search("");
    const [res] = await Promise.all([
      ownerPage.waitForResponse(
        (r) =>
          new RegExp(`/api/deals/restaurant/${restaurantId}$`).test(r.url()) &&
          r.request().method() === "GET"
      ),
      dealsPage.refreshButton().click(),
    ]);
    expect(res.status()).toBe(200);
    await dealsPage.search(N.plain);
    await expect(dealsPage.row(N.plain)).toBeVisible();
  });

  test("TC-353: the Status filter narrows to Active / Inactive / Expired; an expired row has a disabled switch with 'Cannot toggle expired deals'", async ({
    ownerPage,
  }) => {
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.gotoManageDeals(restaurantId);
    await dealsPage.search(`AUTO Table`);
    await dealsPage.selectStatusFilter("Inactive");
    await expect(dealsPage.row(N.inactive)).toBeVisible();
    await expect(dealsPage.row(N.restricted)).toBeVisible();
    await expect(dealsPage.row(N.plain)).toHaveCount(0);
    await expect(dealsPage.row(N.expired)).toHaveCount(0);
    await dealsPage.selectStatusFilter("Expired");
    await expect(dealsPage.row(N.expired)).toBeVisible();
    await expect(dealsPage.row(N.plain)).toHaveCount(0);
    await expect(dealsPage.rowSwitch(N.expired)).toBeDisabled();
    await expect(dealsPage.rowSwitchTooltip(N.expired)).toHaveAttribute(
      "aria-label",
      "Cannot toggle expired deals"
    );
    await dealsPage.selectStatusFilter("Active");
    await expect(dealsPage.row(N.plain)).toBeVisible();
    await expect(dealsPage.row(N.inactive)).toHaveCount(0);
    await expect(dealsPage.row(N.expired)).toHaveCount(0);
    await expect(dealsPage.rowSwitchTooltip(N.plain)).toHaveAttribute(
      "aria-label",
      "Deactivate"
    );
    await dealsPage.selectStatusFilter("All Statuses");
    await expect(dealsPage.row(N.inactive)).toBeVisible();
  });

  test("TC-354: sorting by Price and Savings orders the seeded rows by the server numbers", async ({
    ownerPage,
  }) => {
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.gotoManageDeals(restaurantId);
    await dealsPage.search(`AUTO Table`);
    const order = async () =>
      (await dealsPage.rowNames()).filter((n) => n.includes(runId));
    // rowNames() is a one-shot read — poll until the re-render lands.
    const expectOrder = (before: string, after: string) =>
      expect
        .poll(
          async () => {
            const names = await order();
            return names.indexOf(before) < names.indexOf(after);
          },
          { timeout: 10_000, message: `${before} before ${after}` }
        )
        .toBe(true);
    await dealsPage.sortBy("Price"); // asc
    await expectOrder(N.cheap, N.plain);
    await expectOrder(N.plain, N.pricey);
    await dealsPage.sortBy("Price"); // desc
    await expectOrder(N.pricey, N.cheap);
    // Savings %: cheap 8/10.5 → 23.8%, plain 12/16.5 → 27.3%, pricey 20/24 → 16.7%
    await dealsPage.sortBy("Savings"); // asc
    await expectOrder(N.pricey, N.cheap);
    await expectOrder(N.cheap, N.plain);
  });

  test("TC-355: expanding a row lists its slots as '1x <item> ($price)' chips", async ({
    ownerPage,
  }) => {
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.gotoManageDeals(restaurantId);
    await dealsPage.search(N.pricey);
    await dealsPage.expandRow(N.pricey);
    const chips = dealsPage.expandedItemChips();
    await expect(chips).toHaveCount(3);
    await expect(
      chips.filter({ hasText: `1x ${itemA.name} ($10.00)` })
    ).toHaveCount(2);
    await expect(
      chips.filter({ hasText: `1x ${itemC.name} ($4.00)` })
    ).toHaveCount(1);
  });

  test("TC-356: the status switch deactivates and re-activates a deal (PATCH 200 + snackbar + badge)", async ({
    ownerPage,
  }) => {
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.gotoManageDeals(restaurantId);
    await dealsPage.search(N.cheap);
    await expect(dealsPage.rowStatusText(N.cheap)).toHaveText(
      DEAL_STATUS_TEXT.inactive
    );
    const on = await dealsPage.activateWithRetry(N.cheap);
    expect(on.status, JSON.stringify(on.body)).toBe(200);
    await expect(dealsPage.snackbar("Deal activated successfully")).toBeVisible(
      {
        timeout: 5_000,
      }
    );
    await expect(dealsPage.rowStatusText(N.cheap)).toHaveText(
      DEAL_STATUS_TEXT.active
    );
    await expect(dealsPage.rowSwitch(N.cheap)).toBeChecked();
    expect((await getDealApi(token, seeded.cheap!.id)).status).toBe("ACTIVE");
    const off = await dealsPage.toggleStatus(N.cheap);
    expect(off.status).toBe(200);
    await expect(
      dealsPage.snackbar("Deal deactivated successfully")
    ).toBeVisible({
      timeout: 5_000,
    });
    await expect(dealsPage.rowStatusText(N.cheap)).toHaveText(
      DEAL_STATUS_TEXT.inactive
    );
    await expect(dealsPage.rowSwitch(N.cheap)).not.toBeChecked();
    expect((await getDealApi(token, seeded.cheap!.id)).status).toBe("INACTIVE");
  });

  test("TC-357: Delete asks for confirmation (title + three consequences); Cancel keeps the deal, Confirm hard-deletes it", async ({
    ownerPage,
  }) => {
    const victim = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Table Victim ${runId}`,
      9,
      two()
    );
    extraDealIds.push(victim.id);
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.gotoManageDeals(restaurantId);
    await dealsPage.search(victim.name);
    await dealsPage.deleteViaMenu(victim.name);
    await expect(dealsPage.confirmDialog()).toContainText(
      `You're about to delete the deal "${victim.name}".`
    );
    await expect(dealsPage.confirmDialogConsequences()).toHaveCount(3);
    await expect(dealsPage.confirmDialogConsequences().nth(2)).toContainText(
      "Deleted deals cannot be recovered"
    );
    await dealsPage.cancelButton().click();
    await expect(dealsPage.confirmDialog()).toBeHidden();
    await expect(dealsPage.row(victim.name)).toBeVisible();
    expect((await getDealRaw(token, victim.id)).status).toBe(200);

    await dealsPage.deleteViaMenu(victim.name);
    expect(await dealsPage.confirmDelete()).toBe(200);
    await expect(dealsPage.snackbar("Deal deleted successfully")).toBeVisible({
      timeout: 5_000,
    });
    await expect(dealsPage.row(victim.name)).toHaveCount(0);
    expect((await getDealRaw(token, victim.id)).status).toBe(404);
  });

  test("TC-358: searching from page 2 shows the matching row — pagination resets on filter (RestauNax #618)", async ({
    ownerPage,
  }) => {
    await allure.description(
      "DealsDashboard used to reset the page index only on a rows-per-page change, so a search typed while " +
        "on page 2 that matched \u2264 5 rows rendered an empty table. #618 resets to page 0 on search / status-filter change."
    );
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.gotoManageDeals(restaurantId);
    await dealsPage.setRowsPerPage(5);
    await expect(dealsPage.nextPageButton()).toBeEnabled();
    await dealsPage.nextPageButton().click();
    await expect(dealsPage.previousPageButton()).toBeEnabled();
    await dealsPage.search(N.plain);
    await expect(dealsPage.row(N.plain)).toBeVisible({ timeout: 5_000 });
  });

  test("TC-359: active-deal cap banners — 'You have N of 10' at ≥8, 'Maximum active deals reached' at 10, and activating another is refused with the server message", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Tops the seed restaurant up with AUTO deals until ≥ 8 are active (info banner), then to 10 (warning " +
        "banner) and toggles the INACTIVE seeded deal ON → PATCH 400 MAX_ACTIVE_DEALS_REACHED shown as a " +
        "warning snackbar with the backend's English message. The banners are hard-coded English (an i18n " +
        "gap noted in the strategy doc). Restores everything."
    );
    const dealsPage = createOwnerDealsPage(ownerPage);
    const capIds: string[] = [];
    // Count actives the way the BACKEND cap does — its /active-count endpoint,
    // which counts status===ACTIVE (an expired-but-ACTIVE deal counts too). A
    // local status+endDate filter under-counts and overshoots the cap.
    const activeCount = async () =>
      (await getActiveDealsCountRaw(token, restaurantId)).data
        .activeDealsCount ?? 0;
    const topUpTo = async (target: number) => {
      let n = await activeCount();
      while (n < target) {
        try {
          const d = await createDealApi(
            token,
            restaurantId,
            `AUTO Table Cap ${n} ${runId}`,
            9,
            two()
          );
          capIds.push(d.id);
          extraDealIds.push(d.id);
        } catch {
          break; // hit the 10-active cap (create is capped since #618)
        }
        n = await activeCount();
      }
    };
    // The seeded EXPIRED deal is status-ACTIVE, so it eats a backend cap slot
    // but the dashboard (which counts computedStatus) doesn't show it as active
    // — the two counts would disagree by one and the "Maximum" banner (a
    // dashboard-count threshold) could never be reached under the backend cap.
    // Park it INACTIVE for this test so both counts agree, and restore it after.
    await setDealStatusRaw(token, seeded.expired!.id, "INACTIVE");
    try {
      await topUpTo(8);
      await dealsPage.gotoManageDeals(restaurantId);
      await expect(dealsPage.capBanner()).toBeVisible({ timeout: 10_000 });
      await topUpTo(10);
      await dealsPage.gotoManageDeals(restaurantId);
      await expect(dealsPage.capBanner()).toContainText(
        "Maximum active deals reached",
        { timeout: 10_000 }
      );
      await dealsPage.search(N.inactive);
      // Another worker may free a slot mid-test; retry until the cap holds.
      let refused = false;
      for (let attempt = 0; attempt < 3 && !refused; attempt++) {
        const res = await dealsPage.toggleStatus(N.inactive);
        if (res.status === 400) {
          refused = true;
          expect(res.body.error).toBe("MAX_ACTIVE_DEALS_REACHED");
          await expect(
            dealsPage.snackbar(
              "You can only have 10 active deals at a time. Please deactivate another deal before activating this one."
            )
          ).toBeVisible({ timeout: 5_000 });
          await expect(dealsPage.rowSwitch(N.inactive)).not.toBeChecked();
        } else {
          await setDealStatusRaw(token, seeded.inactive!.id, "INACTIVE");
          await topUpTo(10);
          await dealsPage.gotoManageDeals(restaurantId);
          await dealsPage.search(N.inactive);
        }
      }
      expect(refused, "toggle at the cap was refused").toBe(true);
      expect((await getDealApi(token, seeded.inactive!.id)).status).toBe(
        "INACTIVE"
      );
    } finally {
      // Free the shared restaurant's slots right away, not in afterAll — the
      // storefront file re-activates its own deals concurrently.
      for (const id of capIds) await deleteDealApi(token, id).catch(() => {});
      await setDealStatusRaw(token, seeded.expired!.id, "ACTIVE").catch(
        () => {}
      );
    }
  });

  // ── Create / Edit form ────────────────────────────────────────────────────

  test("TC-360: the form validates on submit and shows the live math (original price, savings, preview chip, ≥90% warning); duplicate items are refused; submit is disabled below 2 items", async ({
    ownerPage,
  }) => {
    const dealsPage = createOwnerDealsPage(ownerPage);
    const form = createDealFormPage(ownerPage);
    await dealsPage.gotoTab(restaurantId, "create-deal");
    await form.assertCreateMode();
    await expect(form.submitButton()).toBeDisabled();
    await expect(form.previewNoItems()).toBeVisible();
    await form.addItem(itemA.name);
    await expect(form.itemCard(itemA.name)).toBeVisible();
    await expect(form.submitButton()).toBeDisabled();
    await form.addItem(itemA.name);
    await expect(form.duplicateItemSnackbar()).toBeVisible({ timeout: 5_000 });
    await form.addItem(itemB.name);
    await expect(form.itemCard(itemB.name)).toBeVisible();
    await expect(form.submitButton()).toBeEnabled();
    await expect(form.originalPriceText()).toContainText("$16.50");
    await expect(form.previewIncludesChips()).toHaveText([
      `1x ${itemA.name}`,
      `1x ${itemB.name}`,
    ]);

    await form.submitButton().click();
    await expect(form.nameRequiredError()).toBeVisible();
    await expect(form.pricePositiveError()).toBeVisible();

    await form.nameInput().fill(`AUTO Form Invalid ${runId}`);
    await form.priceInput().fill("0");
    await form.submitButton().click();
    await expect(form.pricePositiveError()).toBeVisible();
    await expect(form.nameRequiredError()).toHaveCount(0);

    await form.priceInput().fill("16.5");
    await form.submitButton().click();
    await expect(form.priceBelowOriginalError()).toBeVisible();

    await form.priceInput().fill("1");
    await expect(form.savingsText()).toHaveText("Savings: $15.50 (94% off)");
    await expect(form.previewSaveChip()).toHaveText("Save 94%");
    await expect(form.highDiscountWarning()).toBeVisible();

    await form.setItemQty(itemA.name, 2);
    await form.priceInput().fill("20");
    await expect(form.originalPriceText()).toContainText("$26.50");
    await expect(form.savingsText()).toHaveText("Savings: $6.50 (25% off)");
    await expect(form.previewIncludesChips().first()).toHaveText(
      `2x ${itemA.name}`
    );
    await expect(form.highDiscountWarning()).toHaveCount(0);
    // Nothing was created.
    expect(
      (await getRestaurantDeals(token, restaurantId)).some(
        (d) => d.name === `AUTO Form Invalid ${runId}`
      )
    ).toBe(false);
  });

  test("TC-361: creating a deal through the form persists the split slots and the server-computed savings, then lands on the table", async ({
    ownerPage,
  }) => {
    const dealsPage = createOwnerDealsPage(ownerPage);
    const form = createDealFormPage(ownerPage);
    const name = `AUTO Form Created ${runId}`;
    await dealsPage.gotoTab(restaurantId, "create-deal");
    await form.assertCreateMode();
    await form.nameInput().fill(name);
    await form.descriptionInput().fill("created through the UI");
    await form.addItem(itemA.name);
    await form.addItem(itemB.name);
    await form.setItemQty(itemA.name, 2);
    await form.priceInput().fill("21");
    const { status, body } = await form.submitAndWait("create");
    expect(status, JSON.stringify(body)).toBe(201);
    const dealId = (body as { deal?: { id?: string } }).deal?.id ?? "";
    if (dealId) extraDealIds.push(dealId);
    await expect(form.createdSnackbar()).toBeVisible({ timeout: 5_000 });
    // 1.5 s later the form navigates back to the table.
    await dealsPage.assertManageDealsLoaded();
    await dealsPage.search(name);
    const row = dealsPage.row(name);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("3 items");
    await expect(row).toContainText("$21.00");
    await expect(row).toContainText("$26.50");
    await expect(row).toContainText("21% off");
    const api = await getDealApi(token, dealId);
    expect(api.items).toHaveLength(3);
    expect(api.items!.every((i) => i.quantity === 1)).toBe(true);
    expect(api.originalPrice).toBe(26.5);
    expect(api.savingsAmount).toBe(5.5);
    expect(api.description).toBe("created through the UI");
  });

  test("TC-362: Edit pre-fills the form; renaming, repricing, removing and adding a slot round-trips through PUT and the table", async ({
    ownerPage,
  }) => {
    const original = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Form Editable ${runId}`,
      12,
      two()
    );
    extraDealIds.push(original.id);
    const dealsPage = createOwnerDealsPage(ownerPage);
    const form = createDealFormPage(ownerPage);
    await dealsPage.gotoManageDeals(restaurantId);
    await dealsPage.search(original.name);
    await dealsPage.openRowMenu(original.name);
    await dealsPage.editMenuItem().click();
    await form.assertEditMode();
    await expect(form.nameInput()).toHaveValue(original.name);
    await expect(form.priceInput()).toHaveValue("12");
    await expect(form.itemCard(itemA.name)).toBeVisible();
    await expect(form.itemCard(itemB.name)).toBeVisible();
    await expect(form.submitButton()).toHaveText("Update Deal");

    const renamed = `AUTO Form Edited ${runId}`;
    await form.nameInput().fill(renamed);
    await form.removeItem(itemB.name);
    await expect(form.itemCard(itemB.name)).toHaveCount(0);
    await form.addItem(itemC.name);
    await form.priceInput().fill("11");
    await expect(form.originalPriceText()).toContainText("$14.00");
    const { status, body } = await form.submitAndWait("update");
    expect(status, JSON.stringify(body)).toBe(200);
    await expect(form.updatedSnackbar()).toBeVisible({ timeout: 5_000 });
    await dealsPage.assertManageDealsLoaded();
    await dealsPage.search(renamed);
    const row = dealsPage.row(renamed);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText("$11.00");
    await expect(row).toContainText("$14.00");
    await expect(row).toContainText("21% off");
    const api = await getDealApi(token, original.id);
    expect(api.name).toBe(renamed);
    expect(api.dealPrice).toBe(11);
    expect(api.items!.map((i) => i.menuItemId).sort()).toEqual(
      [itemA.id, itemC.id].sort()
    );
  });

  // ── Analytics + AI smoke ──────────────────────────────────────────────────

  test("TC-363: Deal Analytics renders the metric cards and summaries from GET /stats and lists top deals (or the no-usage empty state)", async ({
    ownerPage,
  }) => {
    const dealsPage = createOwnerDealsPage(ownerPage);
    const analytics = createDealAnalyticsPage(ownerPage);
    const [statsRes] = await Promise.all([
      ownerPage.waitForResponse(
        (r) =>
          new RegExp(`/api/deals/restaurant/${restaurantId}/stats$`).test(
            r.url()
          ) && r.request().method() === "GET",
        { timeout: 30_000 }
      ),
      dealsPage.gotoTab(restaurantId, "deal-analytics"),
    ]);
    const stats = (await statsRes.json()) as {
      summary: {
        totalCount: number;
        activeCount: number;
        totalRevenue: number;
        totalSavingsGiven: number;
        totalTimesUsed: number;
      };
      topDeals: { name: string; timesUsed: number }[];
    };
    await analytics.assertLoaded();
    const s = stats.summary;
    await expect(analytics.metricValue("Total Deals")).toHaveText(
      String(s.totalCount)
    );
    await expect(analytics.metricValue("Active Deals")).toHaveText(
      String(s.activeCount)
    );
    await expect(analytics.metricValue("Total Revenue")).toHaveText(
      `$${s.totalRevenue.toFixed(2)}`
    );
    await expect(analytics.metricValue("Total Savings Given")).toHaveText(
      `$${s.totalSavingsGiven.toFixed(2)}`
    );
    await expect(analytics.metricValue("Total Orders with Deals")).toHaveText(
      String(s.totalTimesUsed)
    );
    if (stats.topDeals.length > 0) {
      const top = stats.topDeals[0]!;
      const row = analytics.topDealRow(top.name);
      await expect(row).toBeVisible();
      await expect(row).toContainText("#1");
      await expect(row).toContainText(String(top.timesUsed));
    } else {
      await expect(analytics.noUsageYet()).toBeVisible();
    }
    // Our fresh deals never used → not in the top table.
    await expect(analytics.topDealRow(N.plain)).toHaveCount(0);
  });

  test("TC-364: AI Deal Generator smoke — stepper, server questionnaire, Generate gated on the required answers (never clicked)", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Presence-only: the paid POST /api/deals/ai/generate is never triggered. Asserts the 3-step stepper, " +
        "the questionnaire radios rendered from the public GET /api/deals/ai/questions (meal type is " +
        "unlocked since deal scheduling — TC-532), and that 'Generate Deals' is disabled until audience + price range " +
        "are picked."
    );
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.gotoTab(restaurantId, "ai-deals");
    await expect(
      ownerPage.getByRole("heading", { name: "AI Deal Generator", level: 1 })
    ).toBeVisible({ timeout: 15_000 });
    for (const step of ["Questionnaire", "Generate Deals", "Review & Create"])
      await expect(
        ownerPage.getByText(step, { exact: true }).first()
      ).toBeVisible();
    const generate = ownerPage.getByRole("button", { name: "Generate Deals" });
    await expect(generate).toBeDisabled();
    await ownerPage.getByRole("radio", { name: /^Family/ }).check();
    await expect(generate).toBeDisabled();
    await ownerPage.getByRole("radio", { name: /^Mid-Range/ }).check();
    await expect(generate).toBeEnabled();
    // Deliberately no click.
  });

  // ── Deal scheduling — the form's "When is this deal available?" (#898) ─────
  test.describe("schedule", () => {
    let tz = "";
    let tzLabel = "";

    test.beforeAll(async () => {
      if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
      const t = await freshToken();
      tz = await getRestaurantTimeZonePublic(restaurantId);
      tzLabel =
        (await getRestaurantDealsRaw(t, restaurantId)).data.timeZoneLabel ?? "";
    });

    /** Deep-link to Create Deal and gate on Plans 1 + 2 being on QA. */
    const openCreateForm = async (ownerPage: Page) => {
      const dealsPage = createOwnerDealsPage(ownerPage);
      const form = createDealFormPage(ownerPage);
      requireScheduling("backend", Boolean(tz));
      await dealsPage.gotoTab(restaurantId, "create-deal");
      await form.assertCreateMode();
      requireScheduling("dashboard", await form.hasScheduleSection());
      return { dealsPage, form };
    };
    /** Name + two items + price — the minimum a create needs. */
    const fillBasics = async (
      form: ReturnType<typeof createDealFormPage>,
      name: string
    ) => {
      await form.nameInput().fill(name);
      await form.addItem(itemA.name);
      await form.addItem(itemB.name);
      await form.priceInput().fill("12");
    };
    /** Submit a create, keep this file's ACTIVE footprint at two, return the body sent + new id. */
    const createAndPark = async (
      form: ReturnType<typeof createDealFormPage>
    ) => {
      const { status, body, requestBody } = await form.submitAndWait("create");
      expect(status, JSON.stringify(body)).toBe(201);
      const id = (body as { deal?: { id?: string } }).deal?.id ?? "";
      extraDealIds.push(id);
      await setDealStatusRaw(token, id, "INACTIVE");
      return { id, requestBody };
    };

    test("TC-528: both chip rows are always visible — Weekdays/Weekends + day chips, Any time / meal periods with their server hours / Happy hour / Custom; presets fill the pickers, Any time hides them; the summary names days, hours and zone; meal type is not in Extra details", async ({
      ownerPage,
    }) => {
      const periods = (await getMealPeriodsPublic()).data.data ?? [];
      const { form } = await openCreateForm(ownerPage);

      await allure.step(
        "defaults, chip labels with meal-period hours",
        async () => {
          for (const chip of Object.keys(
            SCHEDULE_CHIP_LABELS
          ) as ScheduleChip[])
            await expect(form.scheduleChip(chip)).toBeVisible();
          await expect(form.dayPresetChip("weekdays")).toBeVisible();
          await expect(form.dayPresetChip("weekends")).toBeVisible();
          await form.assertChipSelected("any");
          await expect(form.timeStartField()).toBeHidden();
          await expect(form.summaryLine()).toHaveText(
            "Customers can get this deal any time the store is open."
          );
          for (const p of periods) {
            const chip = MEAL_CHIP[p.value];
            if (!chip || !p.start || !p.end) continue;
            const hours =
              p.end < p.start
                ? `${formatClockEn(p.start)} – close`
                : `${formatClockEn(p.start)} – ${formatClockEn(p.end)}`;
            expect(
              normalizeSpaces(await form.scheduleChip(chip).innerText())
            ).toBe(`${SCHEDULE_CHIP_LABELS[chip]} · ${hours}`);
          }
          expect(
            normalizeSpaces(await form.scheduleChip("happy-hour").innerText())
          ).toBe("Happy hour · 3:00 PM – 5:00 PM");
        }
      );

      await allure.step(
        "Lunch fills 11:00–14:00 and the summary names the zone",
        async () => {
          await form.pickScheduleChip("lunch");
          await form.assertChipSelected("lunch");
          await form.assertChipSelected("any", false);
          await expect(form.timeStartInput()).toHaveValue("11:00 AM");
          await expect(form.timeEndInput()).toHaveValue("02:00 PM");
          await expect(form.summaryLine()).toHaveText(
            `Customers can get this deal every day, 11:00 AM–2:00 PM (${tzLabel}).`
          );
        }
      );

      await allure.step(
        "Weekdays / Weekends shortcuts set the day chips",
        async () => {
          await form.dayPresetChip("weekdays").click();
          await expect(form.dayPresetChip("weekdays")).toHaveAttribute(
            "aria-pressed",
            "true"
          );
          for (const d of WEEKDAYS) await form.assertDaySelected(d);
          await form.assertDaySelected("SATURDAY", false);
          await expect(form.summaryLine()).toContainText(
            "Mon–Fri, 11:00 AM–2:00 PM"
          );
          await form.dayPresetChip("weekends").click();
          await expect(form.dayPresetChip("weekends")).toHaveAttribute(
            "aria-pressed",
            "true"
          );
          await expect(form.dayPresetChip("weekdays")).toHaveAttribute(
            "aria-pressed",
            "false"
          );
          await form.assertDaySelected("SATURDAY");
          await form.assertDaySelected("SUNDAY");
          await form.assertDaySelected("MONDAY", false);
        }
      );

      await allure.step(
        "Happy hour and Late Night (overnight) fill their windows",
        async () => {
          await form.pickScheduleChip("happy-hour");
          await expect(form.timeStartInput()).toHaveValue("03:00 PM");
          await expect(form.timeEndInput()).toHaveValue("05:00 PM");
          await form.pickScheduleChip("late-night");
          await expect(form.timeStartInput()).toHaveValue("10:00 PM");
          await expect(form.timeEndInput()).toHaveValue("05:00 AM");
          await expect(form.summaryLine()).toContainText(
            "10:00 PM–5:00 AM (ends the next day)"
          );
        }
      );

      await allure.step(
        "Custom keeps the pickers; Any time hides them",
        async () => {
          await form.pickScheduleChip("custom");
          await form.assertChipSelected("custom");
          await form.assertChipSelected("late-night", false);
          await expect(form.timeStartField()).toBeVisible();
          await expect(form.timeEndField()).toBeVisible();
          await expect(form.untilCloseCheckbox()).toBeVisible();
          await form.pickScheduleChip("any");
          await expect(form.timeStartField()).toBeHidden();
          await expect(form.summaryLine()).toHaveText(
            "Customers can get this deal Sat, Sun, any time the store is open."
          );
        }
      );

      await allure.step(
        "date range switch + Extra details without meal type",
        async () => {
          await form.dateRangeSwitch().click();
          await expect(form.startDateField()).toBeVisible();
          await expect(form.endDateField()).toBeVisible();
          await form.extraDetailsToggle().click();
          await expect(form.audienceSelect()).toBeVisible();
          await expect(form.occasionSelect()).toBeVisible();
          await expect(form.mealTypeSelect()).toHaveCount(0);
        }
      );
    });

    test("TC-529: saving Lunch + Weekdays sends 11:00–14:00, mealType Lunch and the five days; the API keeps them and Edit pre-selects them", async ({
      ownerPage,
    }) => {
      const { dealsPage, form } = await openCreateForm(ownerPage);
      const name = `AUTO Sched Lunch ${runId}`;
      await fillBasics(form, name);
      await form.pickScheduleChip("lunch");
      await form.dayPresetChip("weekdays").click();
      const { id, requestBody } = await createAndPark(form);
      expect(requestBody).toMatchObject({
        validTimeStart: "11:00",
        validTimeEnd: "14:00",
        mealType: "Lunch",
      });
      expect([...((requestBody.validDays as string[]) ?? [])].sort()).toEqual(
        [...WEEKDAYS].sort()
      );
      const api = await getDealApi(token, id);
      expect(api).toMatchObject({
        validTimeStart: "11:00",
        validTimeEnd: "14:00",
        mealType: "Lunch",
      });
      expect([...(api.validDays ?? [])].sort()).toEqual([...WEEKDAYS].sort());

      await dealsPage.gotoManageDeals(restaurantId);
      await dealsPage.search(name);
      await dealsPage.openRowMenu(name);
      await dealsPage.editMenuItem().click();
      await form.assertEditMode();
      await form.assertChipSelected("lunch");
      await expect(form.dayPresetChip("weekdays")).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      for (const d of WEEKDAYS) await form.assertDaySelected(d);
      await form.assertDaySelected("SUNDAY", false);
      await expect(form.summaryLine()).toContainText(
        "Mon–Fri, 11:00 AM–2:00 PM"
      );
      await form.cancelButton().click();
    });

    test("TC-530: a Breakfast schedule that starts before the store opens (or on a closed day) shows the yellow business-hours warning from the page's own schedule-check, and still saves", async ({
      ownerPage,
    }) => {
      await allure.description(
        "Expectation is derived from the seed restaurant's REAL hours (GET /restaurant/:id/hours): a warning is " +
          "due when any day is closed or opens after 05:00 (Breakfast starts 05:00; only deals that START outside " +
          "hours are flagged). The UI must render every warning the page's schedule-check returned, link to " +
          "'Check business hours', and not block Create."
      );
      const hours =
        (await getBusinessHoursRaw(token, restaurantId)).data.businessHours ??
        [];
      const warningDue =
        hours.length > 0 &&
        hours.some(
          (h) =>
            (h.isClosed && !h.is24Hours) ||
            (!h.is24Hours &&
              !h.isClosed &&
              h.openingTime !== null &&
              minutesOf(h.openingTime) > 5 * 60)
        );
      const { form } = await openCreateForm(ownerPage);
      await fillBasics(form, `AUTO Sched Breakfast ${runId}`);
      const [checkRes] = await Promise.all([
        form.waitForScheduleCheck((url) =>
          url.includes("validTimeStart=05:00")
        ),
        form.pickScheduleChip("breakfast"),
      ]);
      const warnings =
        (
          (await checkRes.json()) as {
            data?: { warnings?: { message: string }[] };
          }
        ).data?.warnings ?? [];
      expect(
        warnings.length > 0,
        "server warning matches the restaurant's real hours"
      ).toBe(warningDue);
      if (warningDue) {
        await expect(form.hoursWarning()).toBeVisible();
        for (const w of warnings)
          await expect(form.hoursWarning()).toContainText(w.message);
        await expect(form.hoursWarningLink()).toBeVisible();
      } else {
        await expect(form.hoursWarning()).toBeHidden();
        test.info().annotations.push({
          type: "note",
          description:
            "seed restaurant is open 24h every day — no warning possible; non-blocking save still checked",
        });
      }
      await createAndPark(form);
    });

    test("TC-540: Custom clears the meal type — after Lunch, Custom + a typed 4:00 PM–6:00 PM window saves with mealType null", async ({
      ownerPage,
    }) => {
      const { form } = await openCreateForm(ownerPage);
      await fillBasics(form, `AUTO Sched Custom ${runId}`);
      await form.pickScheduleChip("lunch");
      await form.pickScheduleChip("custom");
      await form.assertChipSelected("custom");
      await form.assertChipSelected("lunch", false);
      await form.setStartTime("16:00");
      await form.setEndTime("18:00");
      await expect(form.timeStartInput()).toHaveValue("04:00 PM");
      await expect(form.timeEndInput()).toHaveValue("06:00 PM");
      await expect(form.summaryLine()).toContainText(
        "every day, 4:00 PM–6:00 PM"
      );
      const { id, requestBody } = await createAndPark(form);
      expect(requestBody).toMatchObject({
        validTimeStart: "16:00",
        validTimeEnd: "18:00",
        mealType: null,
      });
      expect((await getDealApi(token, id)).mealType ?? null).toBeNull();
    });

    test("TC-541: editing a meal's hours keeps the meal type; 'Until close' sends no end time; typed first/last days are sent as YYYY-MM-DD", async ({
      ownerPage,
    }) => {
      requireScheduling("backend", Boolean(tz));
      const first = localDateKey(tz, 1);
      const last = localDateKey(tz, 8);
      const { form } = await openCreateForm(ownerPage);
      const name = `AUTO Sched Dinner ${runId}`;
      await fillBasics(form, name);
      await form.pickScheduleChip("dinner");
      await form.setStartTime("18:00");
      // Times no longer match Dinner's 17:00–22:00, so Custom lights up — but the meal stays.
      await form.assertChipSelected("custom");
      await form.untilCloseCheckbox().check();
      await expect(form.untilCloseCheckbox()).toBeChecked();
      await expect(form.summaryLine()).toContainText(
        "from 6:00 PM until close"
      );
      await form.dateRangeSwitch().click();
      await form.setStartDate(first);
      await form.setEndDate(last);
      await expect(form.summaryLine()).toContainText(
        `${formatDateKeyEn(first)} – ${formatDateKeyEn(last)}`
      );
      const { id, requestBody } = await createAndPark(form);
      expect(requestBody).toMatchObject({
        mealType: "Dinner",
        validTimeStart: "18:00",
        validTimeEnd: null,
        startDate: first,
        endDate: last,
      });
      const row = (await getRestaurantDeals(token, restaurantId)).find(
        (d) => d.id === id
      )!;
      expect(row).toMatchObject({
        mealType: "Dinner",
        validTimeStart: "18:00",
        startDate: first,
        endDate: last,
      });
      expect(row.validTimeEnd ?? null).toBeNull();
    });
  });
});
