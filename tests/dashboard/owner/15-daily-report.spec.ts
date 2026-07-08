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
const SEED_ORDER_SUBTOTAL = 15; // net sales per order (no discount/redemption)
const SEED_SUBTOTAL_SUM = SEED_ORDER_COUNT * SEED_ORDER_SUBTOTAL;

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

    // Capture the day's KPIs BEFORE seeding so TC-142 can assert the delta.
    baseline = await getDailyReportKpis(accessToken, restaurantId);

    // Seed N CONFIRMED orders with a known net-sales amount each. CONFIRMED is
    // an included status, so they count toward today's report immediately.
    for (let i = 0; i < SEED_ORDER_COUNT; i++) {
      await createSeededOrder(
        accessToken,
        restaurantId,
        { menuItemId, name: menuItemName, price: menuItemPrice },
        { subtotal: SEED_ORDER_SUBTOTAL, status: "CONFIRMED" }
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
        `${SEED_ORDER_COUNT} CONFIRMED orders worth $${SEED_ORDER_SUBTOTAL} net each, the current ` +
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
        SEED_SUBTOTAL_SUM - 0.01
      );
    });
  });
});
