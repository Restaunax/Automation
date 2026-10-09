/**
 * 11-deals.spec.ts — Owner → Deals (Layer 2: Manage Deals table, Create/Edit
 * form, cap banners, Deal Analytics, AI Generator smoke).
 *
 * TC-86/87 are the original navigation checks; TC-351..364 assert the UI on
 * API-seeded deals (see docs/DEALS_TAB_TEST_STRATEGY.md §4 Layer 2). Guided
 * deal types (restaunax DEAL_TYPES.md): the form tests TC-360..362 were
 * rewritten for the type-first, one-line-per-unit form and TC-678..680 cover
 * BOGO free / BOGO % off / two-of-the-same combo — all gated on the new form
 * (utils/dealTypesGate.ts). Own data:
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
import { createAiDealsGeneratorPage } from "../../../pages/dashboard/owner/AiDealsGeneratorPage";
import {
  createDealFormPage,
  type DealFormPage,
} from "../../../pages/dashboard/owner/DealFormPage";
import { createDealAnalyticsPage } from "../../../pages/dashboard/owner/DealAnalyticsPage";
import { readSharedState, generateRunId } from "../../../utils/testData";
import { type Page } from "@playwright/test";
import {
  MEAL_CHIP,
  SCHEDULE_CHIP_LABELS,
  type ScheduleChip,
} from "../../../pages/dashboard/owner/DealFormPage";
import { requireScheduling } from "../../../utils/dealScheduleGate";
import { requireDealTypes } from "../../../utils/dealTypesGate";
import {
  WEEKDAYS,
  formatClockEn,
  formatDateKeyEn,
  formatInstantClockEn,
  laterTodayWindow,
  localDateKey,
  minutesOf,
  normalizeSpaces,
  openSpanOn,
} from "../../../utils/dealSchedule";

import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  createDealApi,
  createDealApiCapSafe,
  waitForFreeDealSlot,
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
      await expect(row).toContainText("Any time the store is open");
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
      // scheduleSummary: "Mon, Wed · 11:00 AM–2:00 PM".
      await expect(row).toContainText(/11:00\s?AM\s?[–-]\s?2:00\s?PM/);
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

  test("TC-353: the Status filter narrows to Live now / Coming up / Off / Ended; an ended row's switch is disabled with 'This deal has ended…'", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Rewritten for deal scheduling (restaunax #898): the options are live statuses — Live now, Coming up " +
        "(LATER_TODAY + SCHEDULED), Off, Ended. The old Active / Inactive / Expired options and the 'Cannot toggle " +
        "expired deals' tooltip are gone. A temporary deal starting three local days out covers Coming up."
    );
    const dealsPage = createOwnerDealsPage(ownerPage);
    await dealsPage.gotoManageDeals(restaurantId);
    requireScheduling("dashboard", await dealsPage.hasLiveStatusFilter());
    const tz = await getRestaurantTimeZonePublic(restaurantId);
    requireScheduling("backend", Boolean(tz));
    const upcoming = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Table Upcoming ${runId}`,
      12,
      two(),
      {
        startDate: localDateKey(tz, 3),
      }
    );
    try {
      await dealsPage.gotoManageDeals(restaurantId);
      await dealsPage.search("AUTO Table");
      await dealsPage.selectStatusFilter("Off");
      await expect(dealsPage.row(N.inactive)).toBeVisible();
      await expect(dealsPage.row(N.restricted)).toBeVisible();
      await expect(dealsPage.row(N.plain)).toHaveCount(0);
      await expect(dealsPage.row(N.expired)).toHaveCount(0);
      await expect(dealsPage.row(upcoming.name)).toHaveCount(0);

      await dealsPage.selectStatusFilter("Ended");
      await expect(dealsPage.row(N.expired)).toBeVisible();
      await expect(dealsPage.row(N.plain)).toHaveCount(0);
      await expect(dealsPage.rowSwitch(N.expired)).toBeDisabled();
      await expect(dealsPage.rowSwitchTooltip(N.expired)).toHaveAttribute(
        "aria-label",
        "This deal has ended. Change its last day to turn it back on."
      );

      await dealsPage.selectStatusFilter("Coming up");
      await expect(dealsPage.row(upcoming.name)).toBeVisible();
      await expect(dealsPage.row(N.plain)).toHaveCount(0);

      await dealsPage.selectStatusFilter("Live now");
      await expect(dealsPage.row(N.plain)).toBeVisible();
      await expect(dealsPage.row(N.inactive)).toHaveCount(0);
      await expect(dealsPage.row(N.expired)).toHaveCount(0);
      await expect(dealsPage.row(upcoming.name)).toHaveCount(0);
      await expect(dealsPage.rowSwitchTooltip(N.plain)).toHaveAttribute(
        "aria-label",
        "Deactivate"
      );

      await dealsPage.selectStatusFilter("All Statuses");
      await expect(dealsPage.row(N.inactive)).toBeVisible();
    } finally {
      // Best-effort — the AUTO sweep in globalTeardown backstops a leftover.
      await deleteDealApi(await freshToken(), upcoming.id).catch(() => {});
    }
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
      // Since #898 an ended deal can't be switched back on (400 DEAL_ENDED) and
      // no longer counts toward the cap, so this restore is a harmless no-op
      // there; it still matters on a pre-#898 backend, where the date-expired
      // deal held a slot. Either way a refusal is safe to ignore.
      await setDealStatusRaw(token, seeded.expired!.id, "ACTIVE").catch(
        () => {}
      );
    }
  });

  // ── Create / Edit form ────────────────────────────────────────────────────
  //
  // Guided deal types (restaunax DEAL_TYPES.md) replaced the form: type cards
  // first, one line per unit, no quantity box, no "already in the deal"
  // refusal. TC-360..362 were rewritten for it and TC-678..680 added; all are
  // gated on the guided form (utils/dealTypesGate.ts — flip
  // DEAL_TYPES_ON_QA.dashboard once it is on QA) and need a post-deploy run.

  /** Open Create Deal on the guided form (skips while QA predates it). */
  const openGuidedCreate = async (ownerPage: Page) => {
    const dealsPage = createOwnerDealsPage(ownerPage);
    const form = createDealFormPage(ownerPage);
    await dealsPage.gotoTab(restaurantId, "create-deal");
    await form.assertCreateMode();
    requireDealTypes("dashboard", await form.hasGuidedForm());
    return { dealsPage, form };
  };
  /** Save a create through the form after waiting for a free cap slot; returns the new id + bodies. */
  const saveGuidedCreate = async (form: DealFormPage) => {
    // The form can't retry on the 10-active cap, so wait for a free slot first.
    await waitForFreeDealSlot(token, restaurantId);
    const { status, body, requestBody } = await form.submitAndWait("create");
    const dealId = (body as { deal?: { id?: string } }).deal?.id ?? "";
    if (dealId) extraDealIds.push(dealId);
    return { status, body, requestBody, dealId };
  };
  const rolesOf = (d: ApiDeal) =>
    (d.items ?? [])
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((i) => i.role);

  test("TC-360: the guided form asks 'What kind of deal?' first; a combo takes one line per unit (picking an item again adds a line), the price preview is live, and a combo at its regular price is not saved", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Rewritten for guided deal types: the four type cards are shown; COMBO → picking the Burger twice gives " +
        "TWO Burger lines (the old qty box and the 'This item is already in the deal' snackbar are gone); " +
        "deal-price-preview follows the price live (2 × 10 at 15 → regular $20.00, saves $5.00 (25%); + Fries " +
        "at 20 → $26.50 / $6.50); removing a line reprices; an empty name shows 'Deal name is required'; a " +
        "price equal to the regular $16.50 never creates a deal (client-blocked, or a 400 from the server's " +
        "priceMustBeBelowRegular). Post-deploy run."
    );
    const { form } = await openGuidedCreate(ownerPage);
    for (const t of [
      "COMBO",
      "BOGO_FREE",
      "BOGO_PERCENT_OFF",
      "PERCENT_OFF",
    ] as const)
      await expect(form.typeCard(t)).toBeVisible();
    await form.chooseType("COMBO");
    await form.addLine("INCLUDED", itemA.name);
    await expect(form.lineItems("INCLUDED", itemA.name)).toHaveCount(1);
    await form.addLine("INCLUDED", itemA.name);
    await expect(form.lineItems("INCLUDED", itemA.name)).toHaveCount(2);
    await expect(form.duplicateItemSnackbar()).toHaveCount(0);

    await form.priceInput().fill("15");
    await expect(form.pricePreview()).toContainText("$20.00");
    await expect(form.pricePreview()).toContainText("$5.00");
    await expect(form.pricePreview()).toContainText("25%");

    await form.addLine("INCLUDED", itemB.name);
    await form.priceInput().fill("20");
    await expect(form.pricePreview()).toContainText("$26.50");
    await expect(form.pricePreview()).toContainText("$6.50");

    await form.removeLine("INCLUDED", itemA.name);
    await expect(form.lineItems("INCLUDED", itemA.name)).toHaveCount(1);
    await expect(form.pricePreview()).toContainText("$16.50");

    await form.saveButton().click();
    await expect(form.nameRequiredError()).toBeVisible();

    const name = `AUTO Form Invalid ${runId}`;
    await form.nameInput().fill(name);
    await form.priceInput().fill("16.5");
    const posted = ownerPage
      .waitForResponse(
        (r) =>
          /\/api\/deals\/restaurant\/[^/]+$/.test(r.url()) &&
          r.request().method() === "POST",
        { timeout: 5_000 }
      )
      // No POST within 5 s = the form blocked it client-side; the list check below is the real assertion.
      .catch(() => null);
    await form.saveButton().click();
    const res = await posted;
    if (res) expect(res.status(), "a combo at its regular price").toBe(400);
    await expect(form.heading()).toBeVisible();
    expect(
      (await getRestaurantDeals(token, restaurantId)).some(
        (d) => d.name === name
      )
    ).toBe(false);
  });

  test("TC-361: creating a combo through the guided form — the Burger picked twice + Fries — persists three unit rows and the server-computed savings, then lands on the table", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Rewritten for guided deal types (was: Burger qty 2 via the quantity box). COMBO, Burger line ×2 + " +
        "Fries, price 21 → POST 201 with dealType COMBO; the row shows 3 items, $21.00, $26.50, 21% off; the " +
        "API has three qty-1 INCLUDED rows (two Burgers), originalPrice 26.50, savings 5.50. Post-deploy run."
    );
    const { dealsPage, form } = await openGuidedCreate(ownerPage);
    const name = `AUTO Form Created ${runId}`;
    await form.chooseType("COMBO");
    await form.addLine("INCLUDED", itemA.name);
    await form.addLine("INCLUDED", itemA.name);
    await form.addLine("INCLUDED", itemB.name);
    await form.priceInput().fill("21");
    await form.nameInput().fill(name);
    await form.descriptionInput().fill("created through the UI");
    const { status, body, requestBody, dealId } = await saveGuidedCreate(form);
    try {
      expect(status, JSON.stringify(body)).toBe(201);
      expect(requestBody.dealType ?? "COMBO").toBe("COMBO");
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
      expect(api.dealType).toBe("COMBO");
      expect(api.items).toHaveLength(3);
      expect(api.items!.every((i) => i.quantity === 1)).toBe(true);
      expect(api.items!.filter((i) => i.menuItemId === itemA.id)).toHaveLength(
        2
      );
      expect(rolesOf(api)).toEqual(["INCLUDED", "INCLUDED", "INCLUDED"]);
      expect(api.originalPrice).toBe(26.5);
      expect(api.savingsAmount).toBe(5.5);
      expect(api.description).toBe("created through the UI");
    } finally {
      // Free the shared restaurant's slot now, not in afterAll.
      if (dealId) await deleteDealApi(token, dealId).catch(() => {}); // best effort; AUTO sweep backstops
    }
  });

  test("TC-362: Edit pre-fills the guided form; renaming, repricing, removing and adding a line round-trips through PUT and the table", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Rewritten for guided deal types (lines instead of item cards). An API-seeded COMBO (Burger + Fries at " +
        "12) opens in Edit with one line each and price 12; rename, remove the Fries line, add a Drink line, " +
        "price 11 (preview regular $14.00) → PUT 200 → row $11.00 / $14.00 / 21% off; API items Burger + " +
        "Drink, still a COMBO. Post-deploy run."
    );
    const original = await createDealApiCapSafe(
      token,
      restaurantId,
      `AUTO Form Editable ${runId}`,
      12,
      two()
    );
    extraDealIds.push(original.id);
    try {
      const dealsPage = createOwnerDealsPage(ownerPage);
      const form = createDealFormPage(ownerPage);
      await dealsPage.gotoManageDeals(restaurantId);
      await dealsPage.search(original.name);
      await dealsPage.openRowMenu(original.name);
      await dealsPage.editMenuItem().click();
      await form.assertEditMode();
      requireDealTypes("dashboard", await form.hasGuidedForm());
      await expect(form.nameInput()).toHaveValue(original.name);
      await expect(form.priceInput()).toHaveValue("12");
      await expect(form.lineItems("INCLUDED", itemA.name)).toHaveCount(1);
      await expect(form.lineItems("INCLUDED", itemB.name)).toHaveCount(1);
      await expect(form.submitButton()).toHaveText("Update Deal");

      const renamed = `AUTO Form Edited ${runId}`;
      await form.nameInput().fill(renamed);
      await form.removeLine("INCLUDED", itemB.name);
      await expect(form.lineItems("INCLUDED", itemB.name)).toHaveCount(0);
      await form.addLine("INCLUDED", itemC.name);
      await form.priceInput().fill("11");
      await expect(form.pricePreview()).toContainText("$14.00");
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
      expect(api.dealType).toBe("COMBO");
      expect(api.items!.map((i) => i.menuItemId).sort()).toEqual(
        [itemA.id, itemC.id].sort()
      );
    } finally {
      // Free the shared restaurant's slot now, not in afterAll.
      await deleteDealApi(token, original.id).catch(() => {}); // best effort; AUTO sweep backstops
    }
  });

  test("TC-678: Buy one get one FREE with 'Same item' — the form shows the computed price, and the API stores a BOGO_FREE deal with a BUY and a GET row of the Burger", async ({
    ownerPage,
  }) => {
    await allure.description(
      "BOGO_FREE → Burger in 'They buy' → 'Same item' copies it into 'They get' → deal-price-preview shows the " +
        "computed $10.00 (the owner types no price) → save → POST 201 with dealType BOGO_FREE; GET /:id: two " +
        "Burger rows, roles BUY then GET, dealPrice 10, originalPrice 20. Post-deploy run."
    );
    const { form } = await openGuidedCreate(ownerPage);
    await form.chooseType("BOGO_FREE");
    await form.addLine("BUY", itemA.name);
    await expect(form.lineItems("BUY", itemA.name)).toHaveCount(1);
    await form.sameItemButton().click();
    await expect(form.lineItems("GET", itemA.name)).toHaveCount(1);
    await expect(form.pricePreview()).toContainText("$10.00");
    await form.nameInput().fill(`AUTO Form BOGO ${runId}`);
    const { status, body, requestBody, dealId } = await saveGuidedCreate(form);
    try {
      expect(status, JSON.stringify(body)).toBe(201);
      expect(requestBody.dealType).toBe("BOGO_FREE");
      const api = await getDealApi(token, dealId);
      expect(api).toMatchObject({
        dealType: "BOGO_FREE",
        dealPrice: 10,
        originalPrice: 20,
      });
      expect(api.items).toHaveLength(2);
      expect(api.items!.every((i) => i.menuItemId === itemA.id)).toBe(true);
      expect(rolesOf(api)).toEqual(["BUY", "GET"]);
    } finally {
      if (dealId) await deleteDealApi(token, dealId).catch(() => {}); // best effort; AUTO sweep backstops
    }
  });

  test("TC-679: Buy one get one 50% off — Burger bought, Fries at half price: preview and stored price are 13.25, discountPercent 50", async ({
    ownerPage,
  }) => {
    await allure.description(
      "BOGO_PERCENT_OFF → Burger in 'They buy', Fries in 'They get', deal-percent-input 50 → preview $13.25 " +
        "(10 + 6.50 × 50%) → save → API dealType BOGO_PERCENT_OFF, discountPercent 50, dealPrice 13.25, " +
        "roles BUY/GET. Post-deploy run."
    );
    const { form } = await openGuidedCreate(ownerPage);
    await form.chooseType("BOGO_PERCENT_OFF");
    await form.addLine("BUY", itemA.name);
    await form.addLine("GET", itemB.name);
    await form.percentInput().fill("50");
    await expect(form.pricePreview()).toContainText("$13.25");
    await form.nameInput().fill(`AUTO Form BOGO Half ${runId}`);
    const { status, body, requestBody, dealId } = await saveGuidedCreate(form);
    try {
      expect(status, JSON.stringify(body)).toBe(201);
      expect(requestBody).toMatchObject({
        dealType: "BOGO_PERCENT_OFF",
        discountPercent: 50,
      });
      const api = await getDealApi(token, dealId);
      expect(api).toMatchObject({
        dealType: "BOGO_PERCENT_OFF",
        discountPercent: 50,
        dealPrice: 13.25,
        originalPrice: 16.5,
      });
      expect(rolesOf(api)).toEqual(["BUY", "GET"]);
      expect(
        api.items!.find((i) => i.role === "GET")?.menuItemId,
        "the Fries are the discounted item"
      ).toBe(itemB.id);
    } finally {
      if (dealId) await deleteDealApi(token, dealId).catch(() => {}); // best effort; AUTO sweep backstops
    }
  });

  test("TC-680: a combo of two of the SAME item ('2 burgers for $15') — impossible on the old form — saves as two Burger rows", async ({
    ownerPage,
  }) => {
    await allure.description(
      "COMBO → pick the Burger twice → two lines, price 15, preview regular $20.00 → save → 201; the row shows " +
        "2 items / $15.00 / $20.00; API: two qty-1 INCLUDED Burger rows, savings 5. Post-deploy run."
    );
    const { dealsPage, form } = await openGuidedCreate(ownerPage);
    const name = `AUTO Form Two Burgers ${runId}`;
    await form.chooseType("COMBO");
    await form.addLine("INCLUDED", itemA.name);
    await form.addLine("INCLUDED", itemA.name);
    await expect(form.lineItems("INCLUDED", itemA.name)).toHaveCount(2);
    await form.priceInput().fill("15");
    await expect(form.pricePreview()).toContainText("$20.00");
    await form.nameInput().fill(name);
    const { status, body, dealId } = await saveGuidedCreate(form);
    try {
      expect(status, JSON.stringify(body)).toBe(201);
      await dealsPage.assertManageDealsLoaded();
      await dealsPage.search(name);
      const row = dealsPage.row(name);
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText("2 items");
      await expect(row).toContainText("$15.00");
      await expect(row).toContainText("$20.00");
      const api = await getDealApi(token, dealId);
      expect(api.dealType).toBe("COMBO");
      expect(api.items).toHaveLength(2);
      expect(api.items!.every((i) => i.menuItemId === itemA.id)).toBe(true);
      expect(rolesOf(api)).toEqual(["INCLUDED", "INCLUDED"]);
      expect(api.savingsAmount).toBe(5);
    } finally {
      if (dealId) await deleteDealApi(token, dealId).catch(() => {}); // best effort; AUTO sweep backstops
    }
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
      // Guided deal types: a COMBO on the new form, the picker on the old one.
      await form.addComboItems([itemA.name, itemB.name]);
      await form.priceInput().fill("12");
    };
    /** Submit a create, keep this file's ACTIVE footprint at two, return the body sent + new id. */
    const createAndPark = async (
      form: ReturnType<typeof createDealFormPage>
    ) => {
      // The form can't retry on the 10-active cap: wait for a free slot first.
      await waitForFreeDealSlot(token, restaurantId);
      const { status, body, requestBody } = await form.submitAndWait("create");
      const id = (body as { deal?: { id?: string } }).deal?.id ?? "";
      if (id) {
        extraDealIds.push(id);
        // Park immediately so a failed assertion below can't hold the slot.
        await setDealStatusRaw(token, id, "INACTIVE");
      }
      expect(status, JSON.stringify(body)).toBe(201);
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

    test("TC-531: Manage Deals shows each deal's live status chip and schedule text; an ended deal's switch is disabled with an 'ended' tooltip", async ({
      ownerPage,
    }) => {
      requireScheduling("backend", Boolean(tz));
      const dealsPage = createOwnerDealsPage(ownerPage);
      const hours =
        (await getBusinessHoursRaw(token, restaurantId)).data.businessHours ??
        [];
      const span = openSpanOn(hours, localDateKey(tz));
      const window = span
        ? laterTodayWindow(tz, { notBefore: span.open, notAfter: span.close })
        : null;
      const startKey = localDateKey(tz, 3);
      const temp: string[] = [];
      try {
        const scheduled = await createDealApiCapSafe(
          token,
          restaurantId,
          `AUTO Chips Scheduled ${runId}`,
          12,
          two(),
          {
            startDate: startKey,
          }
        );
        temp.push(scheduled.id);
        const later = window
          ? await createDealApiCapSafe(
              token,
              restaurantId,
              `AUTO Chips Later ${runId}`,
              12,
              two(),
              {
                validTimeStart: window.start,
                validTimeEnd: window.end,
              }
            )
          : null;
        if (later) temp.push(later.id);
        const list =
          (await getRestaurantDealsRaw(token, restaurantId)).data.deals ?? [];
        const fromList = (id: string) => list.find((d) => d.id === id)!;

        await dealsPage.gotoManageDeals(restaurantId);
        requireScheduling(
          "dashboard",
          (await dealsPage.liveStatusChips().count()) > 0
        );
        await dealsPage.setRowsPerPage(25);
        const chip = async (name: string, expected: string | RegExp) => {
          await dealsPage.search(name);
          await expect(dealsPage.rowLiveStatus(name)).toHaveText(expected);
        };
        await chip(N.plain, "Live now");
        await chip(N.inactive, "Off");
        await chip(N.expired, "Ended");
        await expect(dealsPage.rowSwitch(N.expired)).toBeDisabled();
        await expect(dealsPage.rowSwitchTooltip(N.expired)).toHaveAttribute(
          "aria-label",
          "This deal has ended. Change its last day to turn it back on."
        );
        await expect(dealsPage.rowSwitch(N.expired)).toHaveAttribute(
          "aria-label",
          /ended/i
        );
        // The chip shows the server's resolved availabilityLabel ("Starts Oct 10",
        // or "Available Saturday at 11:00 AM" when under a week away).
        await chip(
          scheduled.name,
          normalizeSpaces(fromList(scheduled.id).availabilityLabel ?? "")
        );
        await expect(dealsPage.row(scheduled.name)).toContainText(
          normalizeSpaces(fromList(scheduled.id).scheduleSummary ?? "")
        );
        await dealsPage.search(N.plain);
        await expect(dealsPage.row(N.plain)).toContainText(
          "Any time the store is open"
        );
        if (later) {
          const at = new Date(fromList(later.id).nextAvailableAt!);
          await dealsPage.search(later.name);
          // Server text, e.g. "Available from 3:00 PM" (spec §3 as built).
          expect(
            normalizeSpaces(
              await dealsPage.rowLiveStatus(later.name).innerText()
            )
          ).toBe(normalizeSpaces(fromList(later.id).availabilityLabel ?? ""));
          expect(
            normalizeSpaces(fromList(later.id).availabilityLabel ?? "")
          ).toContain(formatInstantClockEn(tz, at));
        } else {
          test.info().annotations.push({
            type: "note",
            description:
              "'Later today' chip not asserted — no hour left in today's business hours",
          });
        }
      } finally {
        const t = await freshToken();
        // Best-effort — the AUTO sweep in globalTeardown backstops a leftover.
        for (const id of temp) await deleteDealApi(t, id).catch(() => {});
      }
    });

    test("TC-532: the AI generator unlocks meal type; (stubbed, never-paid) suggestion cards show their schedule; 'Edit before saving' asks 'Edit this suggestion?' and Edit opens Create Deal pre-filled", async ({
      ownerPage,
    }) => {
      await allure.description(
        "POST /api/deals/ai/generate/:id is PAID — it is intercepted with page.route and never reaches the " +
          "backend (asserted: exactly one intercepted call). The job status poll is stubbed to 'completed' with TWO " +
          "suggestions built from this run's real items — a Lunch one (Mon–Fri 11:00–14:00) and a Dinner one — so " +
          "'Edit before saving' goes through the 'Edit this suggestion?' confirm. Nothing is created."
      );
      requireScheduling("backend", Boolean(tz));
      const ai = createAiDealsGeneratorPage(ownerPage);
      const form = createDealFormPage(ownerPage);
      const dealsPage = createOwnerDealsPage(ownerPage);
      const jobId = `auto-mock-${runId}`;
      const suggestion = {
        name: `AUTO AI Lunch ${runId}`,
        description: "stubbed suggestion",
        suggestedPrice: 14,
        originalPrice: 16.5,
        items: [itemA, itemB].map((i) => ({
          menuItemId: i.id,
          menuItemName: i.name,
          menuItemPrice: i.price,
          quantity: 1,
        })),
        targetAudience: "Family",
        mealType: "Lunch",
        occasion: "Everyday",
        reasoning: "Weekday lunch combo",
        validDays: [...WEEKDAYS],
        validTimeStart: "11:00",
        validTimeEnd: "14:00",
      };
      const second = {
        ...suggestion,
        name: `AUTO AI Dinner ${runId}`,
        mealType: "Dinner",
        reasoning: "Evening combo",
        validDays: [],
        validTimeStart: "17:00",
        validTimeEnd: "22:00",
      };
      let generateCalls = 0;
      await ownerPage.route(/\/api\/deals\/ai\/generate\//, async (route) => {
        generateCalls += 1;
        await route.fulfill({ json: { success: true, jobId } });
      });
      await ownerPage.route(new RegExp(`/api/jobs/${jobId}/status`), (route) =>
        route.fulfill({
          json: {
            success: true,
            data: {
              status: "completed",
              progress: 100,
              result: {
                deals: [suggestion, second],
                menuItemCount: 3,
                generatedCount: 2,
              },
            },
          },
        })
      );

      await dealsPage.gotoTab(restaurantId, "ai-deals");
      await expect(ai.heading()).toBeVisible({ timeout: 15_000 });
      // Dashboard gate right after the backend gate: before #898 the meal-type
      // radios are disabled, so "Lunch enabled" is the presence signal.
      requireScheduling("dashboard", await ai.radio("Lunch").isEnabled());
      for (const label of [
        "Breakfast",
        "Lunch",
        "Dinner",
        "Late Night",
        "All Day",
      ])
        await expect(ai.radio(label)).toBeEnabled();
      await ai.radio("Family").check();
      await ai.radio("Mid-Range").check();
      await ai.radio("Lunch").check();
      await ai.generateButton().click();
      await expect(ai.card(suggestion.name)).toBeVisible({ timeout: 30_000 });
      const shown = normalizeSpaces(
        await ai.cardSchedule(suggestion.name).innerText()
      );
      expect(shown).toMatch(/Mon\s?[–-]\s?Fri/);
      expect(shown).toMatch(/11:00 AM/);
      expect(shown).toMatch(/2:00 PM/);
      await expect(ai.card(second.name)).toBeVisible();

      await ai.cardEdit(suggestion.name).click();
      await expect(ai.editConfirmDialog()).toBeVisible();
      await expect(ai.keepSuggestionsButton()).toBeVisible();
      await ai.editConfirmButton().click();
      await form.assertCreateMode();
      await expect(form.nameInput()).toHaveValue(suggestion.name);
      await expect(form.priceInput()).toHaveValue("14");
      // A guided line or a legacy item card, whichever form is deployed.
      await expect(form.itemShown(itemA.name)).toBeVisible();
      await expect(form.itemShown(itemB.name)).toBeVisible();
      await form.assertChipSelected("lunch");
      for (const d of WEEKDAYS) await form.assertDaySelected(d);
      await expect(form.summaryLine()).toContainText(
        "Mon–Fri, 11:00 AM–2:00 PM"
      );
      await form.cancelButton().click();

      expect(
        generateCalls,
        "the paid generate endpoint was stubbed, never reached"
      ).toBe(1);
      expect(
        (await getRestaurantDeals(await freshToken(), restaurantId)).some((d) =>
          [suggestion.name, second.name].includes(d.name)
        )
      ).toBe(false);
    });
  });
});
