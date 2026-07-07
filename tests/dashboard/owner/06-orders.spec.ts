import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerOrdersPage } from "../../../pages/dashboard/owner/OwnerOrdersPage";
import { readSharedState, generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createZeroTotalOrder,
  updateOrderStatus,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Orders Tab", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  // Seed one order via the API (total:0 → paid, no Stripe) so TC-90 has a
  // guaranteed row to open. Previously it depended on a prior run's residue
  // lingering in QA — non-deterministic coverage. Left as residue like TC-26
  // (there's no order-delete API); doubles as extra Orders-tab seed data.
  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const { restaurantId, menuItemId, menuItemName, menuItemPrice } =
      readSharedState();
    await createZeroTotalOrder(restaurantId, {
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

  test("TC-127: a customer-placed order reaches the owner's Orders tab and is identifiable", async ({
    ownerPage,
  }) => {
    await allure.description(
      "End-to-end: a customer order placed through the public order API appears in the owner's Orders " +
        "tab, is findable by search, and its detail matches THAT order — not just 'some row exists' " +
        "(which TC-90 covers). Closes the 'customer order → owner sees it' journey gap. The seeded " +
        "order is cancelled afterward (no order-delete API) so it doesn't linger as an active order."
    );

    const { restaurantId, menuItemId, menuItemName, menuItemPrice } =
      readSharedState();
    // Unique customer name so the owner search resolves to THIS order, not
    // another run's residue (all generic seeds share the name "Auto Order").
    const runId = generateRunId();
    const uniqueLast = `E2E${runId}`;
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);

    const token = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    const order = await allure.step(
      "Customer places an order via the public API",
      async () => {
        const placed = await createZeroTotalOrder(
          restaurantId,
          { menuItemId, name: menuItemName, price: menuItemPrice },
          `autoorder_${runId}@restaunax-test.com`,
          "Auto",
          uniqueLast
        );
        expect(placed.status).toBe("PENDING");
        await allure.parameter("orderId", placed.id);
        await allure.parameter("customer", `Auto ${uniqueLast}`);
        return placed;
      }
    );

    try {
      await allure.step("Owner opens the Orders tab", async () => {
        await mgmtPage.goto(restaurantId);
        await ordersPage.navigateToOrdersTab();
      });

      await allure.step(
        "Owner searches for the order by customer name",
        async () => {
          await ordersPage.searchOrders(uniqueLast);
          await expect(ordersPage.firstOrderRow()).toBeVisible({
            timeout: 15_000,
          });
        }
      );

      await allure.step(
        "Open the matched order and confirm it is that customer's order",
        async () => {
          await ordersPage.openFirstOrderDetail();
          await ordersPage.assertOrderDetailVisible();
          // Identity proof: opening a row appends ?detailOrderId=<id>, which
          // must equal the order we seeded — so the owner opened THIS order,
          // not just "some row" (the customer name lives on a separate tab, so
          // the URL id is the reliable check).
          await expect(ownerPage).toHaveURL(new RegExp(order.id));
        }
      );
    } finally {
      // Only cleanup available (orders aren't deletable): cancel it so it drops
      // off the active feed. Owner token holds MODIFY_RESTAURANT. Best-effort.
      await updateOrderStatus(token, order.id, "CANCELLED").catch(() => {});
    }
  });
});
