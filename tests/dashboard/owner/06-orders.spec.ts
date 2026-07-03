import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerOrdersPage } from "../../../pages/dashboard/owner/OwnerOrdersPage";
import { readSharedState } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Orders Tab", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Orders");
    await allure.label("severity", "critical");
  });

  test("TC-29: owner can navigate to the Orders tab and see the orders search bar", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Clicking Orders in the portal sidebar loads the orders tab with a search bar and table column headers."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step(
      `Navigate to restaurant management (id: ${restaurantId})`,
      async () => {
        await mgmtPage.goto(restaurantId);
      }
    );

    await allure.step("Click Orders in the sidebar", async () => {
      await ordersPage.navigateToOrdersTab();
    });

    await allure.step(
      "Verify Orders tab loaded — search bar is visible",
      async () => {
        await ordersPage.assertOrdersTabLoaded();
        await allure.parameter("URL", ownerPage.url());
      }
    );

    await allure.step("Verify Filters button is visible", async () => {
      await expect(ordersPage.filtersButton()).toBeVisible({ timeout: 10_000 });
    });
  });

  test("TC-70: searching for a nonexistent order shows the empty state", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Searching orders for a query that matches nothing shows the 'No orders found' empty state " +
        "instead of an error or a stale table."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step(
      `Navigate to restaurant management (id: ${restaurantId})`,
      async () => {
        await mgmtPage.goto(restaurantId);
      }
    );

    await allure.step("Click Orders in the sidebar", async () => {
      await ordersPage.navigateToOrdersTab();
    });

    await allure.step("Search for an order id that cannot exist", async () => {
      await ordersPage.searchOrders("nonexistent-order-xyz-999999");
    });

    await allure.step("Verify the empty-state message appears", async () => {
      await expect(ordersPage.emptyStateMessage()).toBeVisible({
        timeout: 10_000,
      });
    });
  });

  test("TC-89: the Filters button opens the filter panel", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Clicking Filters actually opens the Filter Orders panel, not just a visible-but-inert button " +
        "(TC-29 only asserted visibility, never exercised the click)."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step("Navigate to Orders tab", async () => {
      await mgmtPage.goto(restaurantId);
      await ordersPage.navigateToOrdersTab();
    });

    await allure.step("Open Filters and verify the panel appears", async () => {
      await ordersPage.openFilters();
      await ordersPage.assertFilterPanelVisible();
    });
  });

  test("TC-90: opening an order shows its detail view", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Clicking a row in the orders grid opens a detail dialog with order info, items, and totals — " +
        "read-only assertions only; no status change/cancel/refund against this real, possibly " +
        "shared order. Skips if the QA restaurant currently has zero orders."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step("Navigate to Orders tab", async () => {
      await mgmtPage.goto(restaurantId);
      await ordersPage.navigateToOrdersTab();
    });

    const rowCount = await ordersPage.firstOrderRow().count();
    test.skip(
      rowCount === 0,
      "No orders exist on the seed restaurant right now"
    );

    await allure.step("Open the first order's detail view", async () => {
      await ordersPage.openFirstOrderDetail();
      await ordersPage.assertOrderDetailVisible();
    });

    await allure.step("Close the detail view", async () => {
      await ordersPage.closeOrderDetail();
    });
  });
});
