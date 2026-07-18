import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerDailyReportPage } from "../../../pages/dashboard/owner/OwnerDailyReportPage";
import { readSharedState } from "../../../utils/testData";
import {
  apiLogin,
  createSeededOrder,
  getDailyReportKpis,
  type DayKpis,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

// Seed a few nonzero-revenue orders into the CURRENT business day so the report
// shows real numbers. These are permanent QA residue (no order-delete API), so
// assertions are DELTA-based (>=) and tolerant of concurrent seeding by other
// specs — other specs only ever ADD orders, so the day's KPIs can only grow.
const SEED_ORDER_COUNT = 3;
// The backend is server-authoritative on pricing: it discards the client subtotal
// and books each order at the seed item's DB price. So we seed at — and assert
// against — the real menuItemPrice, captured in beforeAll, NOT a hardcoded amount.
// (A stale 15 vs the item's 12.99 is exactly what made TC-142 fail every night.)
let seededNetSales = 0; // = SEED_ORDER_COUNT * menuItemPrice, set in beforeAll

test.describe("Owner — Daily Report Tab", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  let baseline: DayKpis;

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const { restaurantId, menuItemId, menuItemName, menuItemPrice } =
      readSharedState();
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);

    // The report books each seeded order at the item's DB price (menuItemPrice),
    // so that's the per-order net-sales the delta assertion must expect.
    seededNetSales = SEED_ORDER_COUNT * menuItemPrice;

    // Capture the day's KPIs BEFORE seeding so TC-142 can assert the delta.
    baseline = await getDailyReportKpis(accessToken, restaurantId);

    // Seed N CONFIRMED orders. CONFIRMED is an included status, so they count
    // toward today's report immediately. Claimed subtotal == the DB price, so the
    // recorded net-sales matches what we assert (no server-vs-client mismatch).
    for (let i = 0; i < SEED_ORDER_COUNT; i++) {
      await createSeededOrder(
        accessToken,
        restaurantId,
        { menuItemId, name: menuItemName, price: menuItemPrice },
        { subtotal: menuItemPrice, status: "CONFIRMED" }
      );
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Daily Report");
    await allure.label("severity", "critical");
  });

  test("TC-141: owner can open the Daily Report and see the current day's live report", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Store Operations → Daily Report opens the current business day's live report: the 'At a Glance' " +
        "comparison KPIs (Net Sales / Orders) render with no load error. Seeded orders in beforeAll " +
        "guarantee the day has real data behind the numbers."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const reportPage = createOwnerDailyReportPage(ownerPage);

    await allure.step(
      `Navigate to restaurant management (id: ${restaurantId})`,
      async () => {
        await mgmtPage.goto(restaurantId);
      }
    );

    await allure.step("Open Store Operations → Daily Report", async () => {
      await reportPage.navigateToDailyReportTab();
    });

    await allure.step("Verify the live report rendered", async () => {
      await reportPage.assertReportLoaded();
      await reportPage.assertNoLoadError();
      await allure.parameter("URL", ownerPage.url());
    });
  });

  test("TC-142: the seeded orders are reflected in today's Daily Report KPIs", async () => {
    await allure.description(
      "Deterministic proof that the report aggregates real order data: after seeding " +
        `${SEED_ORDER_COUNT} CONFIRMED orders worth the seed item's DB price net each, the current ` +
        "business day's KPIs (from GET /restaurant/:id/daily-close?include=report) have grown by at " +
        "least the seeded order count and net-sales amount vs. the pre-seed baseline. Uses >= (not ==) " +
        "because other specs may add orders to the same day concurrently — they only ever increase it."
    );

    const { restaurantId } = readSharedState();
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);

    const after = await allure.step(
      "Re-read the current business day's KPIs after seeding",
      async () => getDailyReportKpis(accessToken, restaurantId)
    );

    await allure.step("Verify the order-count delta", async () => {
      await allure.parameter("orderCount before", String(baseline.orderCount));
      await allure.parameter("orderCount after", String(after.orderCount));
      expect(after.orderCount - baseline.orderCount).toBeGreaterThanOrEqual(
        SEED_ORDER_COUNT
      );
    });

    await allure.step("Verify the net-sales delta", async () => {
      await allure.parameter("netSales before", String(baseline.netSales));
      await allure.parameter("netSales after", String(after.netSales));
      // Allow a tiny rounding tolerance on the floor.
      expect(after.netSales - baseline.netSales).toBeGreaterThanOrEqual(
        seededNetSales - 0.01
      );
    });
  });
});
