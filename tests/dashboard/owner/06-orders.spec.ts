import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerOrdersPage } from "../../../pages/dashboard/owner/OwnerOrdersPage";
import { readSharedState } from "../../../utils/testData";
import { apiLogin, createSeededOrder } from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Orders Tab", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  // Seed one order via the API (real total, no Stripe — the backend's pricing
  // guard rejects the old total:0 trick) so TC-90 has a guaranteed row to open.
  // Previously it depended on a prior run's residue lingering in QA —
  // non-deterministic coverage. Left as residue like TC-26 (there's no
  // order-delete API); doubles as extra Orders-tab seed data.
  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const { restaurantId, menuItemId, menuItemName, menuItemPrice } =
      readSharedState();
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    await createSeededOrder(accessToken, restaurantId, {
      menuItemId,
      name: menuItemName,
      price: menuItemPrice,
    });
  });

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
        "read-only assertions only; no status change/cancel/refund. An order is seeded via the API " +
        "in beforeAll so a row is always present (no longer dependent on QA residue)."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step("Navigate to Orders tab", async () => {
      await mgmtPage.goto(restaurantId);
      await ordersPage.navigateToOrdersTab();
    });

    // The beforeAll-seeded order guarantees at least one row.
    await expect(ordersPage.firstOrderRow().first()).toBeVisible({
      timeout: 15_000,
    });

    await allure.step("Open the first order's detail view", async () => {
      await ordersPage.openFirstOrderDetail();
      await ordersPage.assertOrderDetailVisible();
    });

    await allure.step("Close the detail view", async () => {
      await ordersPage.closeOrderDetail();
    });
  });

  test("TC-131: the orders grid shows the key column headers", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The Orders DataGrid renders a real column set (Status is in view, plus several more) — " +
        "not just a search bar (TC-29 only checked the search UI). Far-right columns (Payment, Subtotal) " +
        "are column-virtualized out of the DOM at the default viewport, so we assert the in-view Status " +
        "header plus a minimum header count rather than every label."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step("Navigate to Orders tab", async () => {
      await mgmtPage.goto(restaurantId);
      await ordersPage.navigateToOrdersTab();
    });

    await allure.step(
      "Verify the Status column header is visible",
      async () => {
        await ordersPage.assertTableColumnVisible("Status");
      }
    );

    await allure.step(
      "Verify the grid rendered a multi-column header set",
      async () => {
        expect(await ordersPage.columnHeaders().count()).toBeGreaterThanOrEqual(
          5
        );
      }
    );
  });

  test("TC-132: filtering by Order Status re-queries the orders grid", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Choosing a status in the Filters panel and applying it fires the management fetch with the " +
        "filter and closes the panel — exercising the filter end-to-end, beyond TC-89 which only opened it."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step("Navigate to Orders tab", async () => {
      await mgmtPage.goto(restaurantId);
      await ordersPage.navigateToOrdersTab();
    });

    await allure.step(
      "Open Filters and select the 'Pending' status",
      async () => {
        await ordersPage.openFilters();
        await ordersPage.assertFilterPanelVisible();
        await ordersPage.selectStatusFilter("Pending");
      }
    );

    await allure.step(
      "Apply the filter and confirm the grid re-query fires",
      async () => {
        const responsePromise = ownerPage.waitForResponse(
          (r) =>
            /\/api\/order\/statistics\/management\//.test(r.url()) &&
            r.request().method() === "GET",
          { timeout: 20_000 }
        );
        await ordersPage.applyFilters();
        const response = await responsePromise;
        expect(response.ok()).toBeTruthy();
      }
    );

    await allure.step("Grid is still present after filtering", async () => {
      await ordersPage.assertOrdersTabLoaded();
    });
  });

  test("TC-133: resetting the filters restores the default status", async ({
    ownerPage,
  }) => {
    await allure.description(
      "After narrowing the Order Status filter, the Reset button returns it to 'All Statuses' so the " +
        "owner can clear a filter without reloading the page."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step("Navigate to Orders tab and open Filters", async () => {
      await mgmtPage.goto(restaurantId);
      await ordersPage.navigateToOrdersTab();
      await ordersPage.openFilters();
      await ordersPage.assertFilterPanelVisible();
    });

    await allure.step("Narrow to 'Pending', then Reset", async () => {
      await ordersPage.selectStatusFilter("Pending");
      await ordersPage.assertStatusFilterValue("Pending");
      // Reset also closes the panel (handleResetFilters → handleFilterMenuClose).
      await ordersPage.resetFilters();
    });

    await allure.step(
      "Reopen Filters and verify the status is back to 'All Statuses'",
      async () => {
        await ordersPage.openFilters();
        await ordersPage.assertFilterPanelVisible();
        await ordersPage.assertStatusFilterValue("All Statuses");
      }
    );
  });

  test("TC-134: the order detail dialog shows line items and the order total", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Opening an order's detail dialog renders the line-items section and the money summary " +
        "(Order Details + Order Total), not just the header block TC-90 asserted. Uses the beforeAll-seeded order."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step("Navigate to Orders tab", async () => {
      await mgmtPage.goto(restaurantId);
      await ordersPage.navigateToOrdersTab();
    });

    await expect(ordersPage.firstOrderRow().first()).toBeVisible({
      timeout: 15_000,
    });

    await allure.step(
      "Open the first order and verify items + total",
      async () => {
        await ordersPage.openFirstOrderDetail();
        await ordersPage.assertOrderDetailVisible();
        await ordersPage.assertOrderDetailHasItemsAndTotal();
      }
    );

    await allure.step("Close the detail view", async () => {
      await ordersPage.closeOrderDetail();
    });
  });

  test("TC-135: the Orders toolbar exposes an Export control", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The Orders tab offers an Export action so owners can pull their orders out for reporting/accounting."
    );

    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step("Navigate to Orders tab", async () => {
      await mgmtPage.goto(restaurantId);
      await ordersPage.navigateToOrdersTab();
    });

    await allure.step("Verify the Export button is visible", async () => {
      await expect(ordersPage.exportButton().first()).toBeVisible({
        timeout: 10_000,
      });
    });
  });
});
