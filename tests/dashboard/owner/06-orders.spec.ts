import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerOrdersPage } from "../../../pages/dashboard/owner/OwnerOrdersPage";
import * as fs from "fs";
import {
  readSharedState,
  generateRunId,
  generateSeedPhone,
  generateSeedSurname,
} from "../../../utils/testData";
import {
  apiLogin,
  createSeededOrder,
  getOrderStats,
  type SeededOrder,
} from "../../../utils/apiHelper";
import { parseCsv } from "../../../utils/csvHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

// Mirrors the dashboard's utils/formatCurrency.ts (Intl en-US USD, 2 dp).
const usd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

// The 32 CSV columns the export endpoint writes, in order
// (orderStatisticsController.ts exportOrders). "Order Number" carries the
// permanent receiptNumber, not the daily order number.
const EXPORT_CSV_HEADER = [
  "Order Number",
  "Customer Name",
  "Customer Email",
  "Customer Phone",
  "Status",
  "Order Type",
  "Payment Status",
  "Total Amount",
  "Subtotal",
  "Tax Amount",
  "Delivery Fee",
  "Tip Amount",
  "Discount Amount",
  "Item Count",
  "Order Items",
  "Order Date",
  "Scheduled For",
  "Completed At",
  "Delivery Address",
  "Delivery Notes",
  "Special Instructions",
  "Payment Method",
  "Payment Intent",
  "Stripe Payment ID",
  "Coupon Code",
  "Coupon Description",
  "Delivery Status",
  "Driver Name",
  "Tracking URL",
  "Is Reward Member",
  "Points Redeemed",
  "Redemption Value",
];

test.describe("Owner — Orders Tab", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  // ── Seed set (own data — see TEST_PLAN → Parallel Execution) ────────────
  // Four orders that share a run-unique SURNAME so `search=<surname>` returns
  // exactly this file's rows, each with a unique NANP-valid phone + email so
  // the search-by-field tests can target one row. All seeded via the public
  // create-order API at the item's real price (no Stripe) and bumped past
  // INITIALIZED. There is no order-delete API — they stay as QA residue, so
  // every assertion below is on OUR rows or on deltas, never absolute counts.
  //   A  PICKUP   PENDING    tip, special instructions      (search/detail/money)
  //   B  DELIVERY CONFIRMED  delivery fee + address + notes (type filter, Delivery Info)
  //   C  PICKUP   CANCELLED                                  (status filter negative)
  //   D  PICKUP   CONFIRMED  guest (no contact)              ("Guest" / "N/A" fallbacks)
  // Mutation tests (lifecycle, cancel) seed their own throwaway order inside
  // the test so nothing here is ever mutated.
  const runId = generateRunId();
  const surname = generateSeedSurname(runId);
  const seedEmail = (tag: string) =>
    `orders_${runId}_${tag}@restaunax-test.com`;
  const phoneA = generateSeedPhone();
  let orderA: SeededOrder;
  let orderB: SeededOrder;
  let orderC: SeededOrder;
  let orderD: SeededOrder;

  const ownerToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
  const seedItem = () => {
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    return { menuItemId, name: menuItemName, price: menuItemPrice };
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) return;
    const { restaurantId } = readSharedState();
    const token = await ownerToken();
    const item = seedItem();
    orderA = await createSeededOrder(token, restaurantId, item, {
      status: "PENDING",
      tip: 1.5,
      firstName: "Alpha",
      lastName: surname,
      customerEmail: seedEmail("a"),
      customerPhone: phoneA,
      specialInstructions: `AUTO ${runId} no onions`,
    });
    orderB = await createSeededOrder(token, restaurantId, item, {
      status: "CONFIRMED",
      orderType: "DELIVERY",
      deliveryFee: 2.5,
      firstName: "Bravo",
      lastName: surname,
      customerEmail: seedEmail("b"),
      customerPhone: generateSeedPhone(),
      deliveryAddress: {
        street: "123 Automation Ave",
        unit: "4B",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        deliveryNotes: `Ring bell ${runId}`,
      },
    });
    orderC = await createSeededOrder(token, restaurantId, item, {
      status: "CANCELLED",
      firstName: "Charlie",
      lastName: surname,
      customerEmail: seedEmail("c"),
      customerPhone: generateSeedPhone(),
    });
    orderD = await createSeededOrder(token, restaurantId, item, {
      status: "CONFIRMED",
      guest: true,
    });
  });

  // Every seeded row shares the surname except the guest (D).
  const surnameOrders = () => [orderA, orderB, orderC];
  // Throwaway orders created INSIDE a test (lifecycle, cancel, stats delta)
  // must NOT carry the shared surname — search is `contains`, and tests that
  // assert "exactly the seed set" (TC-232/234/235/248) run after some of
  // them. A different prefix keeps the two populations disjoint.
  const mutationSurname = `Mut${runId}`;

  const gotoOrders = async (ownerPage: import("@playwright/test").Page) => {
    const { restaurantId } = readSharedState();
    const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
    const ordersPage = createOwnerOrdersPage(ownerPage);
    await mgmtPage.goto(restaurantId);
    await ordersPage.navigateToOrdersTab();
    return ordersPage;
  };

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

  test("TC-224: owner advances an order's status via Mark as X", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The order-detail sheet's status control is a single forward-only 'Mark as {next status}' " +
        "button (OrderDetailsDialog.tsx's getNextStatus()), not a dropdown — clicking it PUTs " +
        "/api/order/orderId/:id/status and the button advances to the next status in the sequence."
    );

    const { restaurantId, menuItemId, menuItemName, menuItemPrice } =
      readSharedState();
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const ordersPage = createOwnerOrdersPage(ownerPage);
    let orderId = "";

    await allure.step("Seed a PENDING order via the API", async () => {
      const order = await createSeededOrder(
        accessToken,
        restaurantId,
        { menuItemId, name: menuItemName, price: menuItemPrice },
        { status: "PENDING" }
      );
      orderId = order.id;
      await allure.parameter("orderId", orderId);
    });

    await allure.step("Deep-link to the order's detail sheet", async () => {
      await ordersPage.gotoOrderDetail(restaurantId, orderId);
    });

    await allure.step(
      "Click Mark as Confirmed and verify the status PUT succeeds",
      async () => {
        const [response] = await Promise.all([
          ownerPage.waitForResponse(
            (r) =>
              /\/api\/order\/orderId\/.+\/status/.test(r.url()) &&
              r.request().method() === "PUT"
          ),
          ordersPage.clickMarkAsNext(),
        ]);
        expect(response.ok()).toBe(true);
        const body = await response.json();
        expect(body.status).toBe("CONFIRMED");
      }
    );

    await allure.step(
      "Verify the button advanced to the next status in the sequence",
      async () => {
        await expect(ordersPage.markAsNextButton()).toHaveText(
          /Mark as Preparing/,
          { timeout: 10_000 }
        );
      }
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Search — the owner's #1 daily action. Every test targets the seed rows
  // and asserts on the management RESPONSE (server truth) plus the row in the
  // grid, never on virtualised cells alone.
  // ══════════════════════════════════════════════════════════════════════════

  test("TC-231: searching by receipt number returns the seeded order", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Typing a receipt number into the search box sends it as ?search= (the backend strips a leading " +
        "'#', matches receiptNumber `contains` + exact orderNumber) and the seeded order's row is in the grid. " +
        "`contains` can legitimately return other receipts that embed the digits, so we assert our row is " +
        "present and every returned row matches — not totalCount===1."
    );
    const ordersPage = await gotoOrders(ownerPage);
    const term = orderA.receiptNumber;
    await allure.parameter("receiptNumber", term);

    const { query, json } = await allure.step(
      "Search by receipt # and capture the management response",
      () =>
        ordersPage.waitForManagementResponse(
          () => ordersPage.searchOrders(term),
          (q) => q.get("search") === term
        )
    );
    expect(query.get("search")).toBe(term);
    expect(json.orders.map((o) => o.id)).toContain(orderA.id);
    // The backend ORs the term over receipt (contains), exact daily order #,
    // and every contact field (customer.* AND the on-order snapshot) — a
    // digit string can legitimately hit a phone number, so "every row
    // matches" must consider all of them.
    for (const o of json.orders) {
      const hay = [
        o.receiptNumber,
        o.phone,
        o.email,
        o.firstName,
        o.lastName,
        o.customer?.phone,
        o.customer?.email,
        o.customer?.firstName,
        o.customer?.lastName,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join("\u0000");
      const matches =
        hay.includes(term.toLowerCase()) ||
        (Number.isFinite(Number(term)) && o.orderNumber === Number(term));
      expect(
        matches,
        `row ${o.id} (${o.receiptNumber}) should match "${term}" on some searchable field`
      ).toBe(true);
    }
    await allure.step("The seeded row is rendered in the grid", async () => {
      await expect(ordersPage.rowByReceipt(term)).toBeVisible({
        timeout: 15_000,
      });
    });
  });

  test("TC-232: searching by customer last name and email finds the seeded orders", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The search box is one field for name / email / phone (backend ORs over customer.* AND the " +
        "on-order contact snapshot). Surname: the run-unique last name returns exactly the three named " +
        "seed rows (the guest seed has no name). Email: the unique local part returns order A. " +
        "(Phone is TC-262 — currently a known backend bug.)"
    );
    const ordersPage = await gotoOrders(ownerPage);

    await allure.step(`Search by surname ${surname}`, async () => {
      const { json } = await ordersPage.waitForManagementResponse(
        () => ordersPage.searchOrders(surname),
        (q) => q.get("search") === surname
      );
      const ids = json.orders.map((o) => o.id).sort();
      expect(json.totalCount).toBe(surnameOrders().length);
      expect(ids).toEqual(
        surnameOrders()
          .map((o) => o.id)
          .sort()
      );
    });

    const emailLocal = seedEmail("a").split("@")[0] ?? "";
    await allure.step(`Search by email local part ${emailLocal}`, async () => {
      const { json } = await ordersPage.waitForManagementResponse(
        () => ordersPage.searchOrders(emailLocal),
        (q) => q.get("search") === emailLocal
      );
      expect(json.orders.map((o) => o.id)).toEqual([orderA.id]);
    });
  });

  test("TC-233: search mode shows the 'all orders' banner and Clear Search restores the date-range list", async ({
    ownerPage,
  }) => {
    await allure.description(
      "While a search term is set the date range is ignored server-side; the toolbar says so with an " +
        "info banner and a Clear Search action. Clearing re-queries WITHOUT ?search= and WITH the " +
        "startDate/endDate pair again, hides the banner and empties the input."
    );
    const ordersPage = await gotoOrders(ownerPage);

    await allure.step("Search → banner appears", async () => {
      await ordersPage.waitForManagementResponse(
        () => ordersPage.searchOrders(surname),
        (q) => q.get("search") === surname
      );
      await expect(ordersPage.searchModeBanner()).toBeVisible({
        timeout: 10_000,
      });
      await expect(ordersPage.searchModeBanner()).toContainText(
        /date range filter is ignored/i
      );
    });

    await allure.step(
      "Clear Search → date-range query, banner gone, input empty",
      async () => {
        const { query } = await ordersPage.waitForManagementResponse(
          () => ordersPage.clearSearchButton().click(),
          (q) => !q.get("search")
        );
        expect(query.get("search")).toBeFalsy();
        expect(query.get("startDate")).toBeTruthy();
        expect(query.get("endDate")).toBeTruthy();
        await expect(ordersPage.searchModeBanner()).toBeHidden({
          timeout: 10_000,
        });
        await expect(ordersPage.searchInput()).toHaveValue("");
      }
    );
  });

  test("TC-262: [known bug] searching by a customer phone number should find the seeded order", async ({
    ownerPage,
  }) => {
    // KNOWN BACKEND BUG (found 2026-08-15 by this test): getFilteredOrders
    // treats any all-digit search term as an orderNumber and hands
    // Number(term) to Prisma as an int4 — a 10-digit phone overflows Postgres
    // integer range and the endpoint 500s ("Value out of range for the type").
    // So "Search by … phone" (the placeholder's own promise) is broken for
    // essentially every real phone number. test.fail() keeps this test RED-
    // AS-EXPECTED: the moment the backend guards the orderNumber branch
    // (e.g. only when the term fits int4 / ≤ 9 digits) this flips to a
    // failure that says "unexpected pass" — remove the test.fail() then.
    test.fail(
      true,
      "Backend: phone search 500s — numeric term overflows int4 orderNumber match (orderStatisticsController.getFilteredOrders)"
    );
    await allure.description(
      "Typing the customer's 10-digit phone number into search returns their order (backend matches " +
        "customer.phone and the on-order phone snapshot with `contains`). Currently 500s — see test body."
    );
    const ordersPage = await gotoOrders(ownerPage);
    const { json } = await ordersPage.waitForManagementResponse(
      () => ordersPage.searchOrders(phoneA),
      (q) => q.get("search") === phoneA
    );
    expect(json.orders.map((o) => o.id)).toContain(orderA.id);
    for (const o of json.orders) {
      const phone = String(o.phone ?? o.customer?.phone ?? "");
      expect(phone).toContain(phoneA);
    }
    await expect(ordersPage.rowByReceipt(orderA.receiptNumber)).toBeVisible({
      timeout: 15_000,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Filters / sort / paging / refresh
  // ══════════════════════════════════════════════════════════════════════════

  test("TC-234: the Order Status filter returns only orders in that status", async ({
    ownerPage,
  }) => {
    await allure.description(
      "TC-132 proved the request fires; this proves the ROWS are right. Search by the seed surname " +
        "(so the result set is exactly our three rows) then filter Pending → the response carries " +
        "status=PENDING and contains only order A (PENDING) — B (CONFIRMED) and C (CANCELLED) are gone."
    );
    const ordersPage = await gotoOrders(ownerPage);
    await ordersPage.waitForManagementResponse(
      () => ordersPage.searchOrders(surname),
      (q) => q.get("search") === surname
    );
    await ordersPage.openFilters();
    await ordersPage.selectStatusFilter("Pending");
    const { query, json } = await ordersPage.waitForManagementResponse(
      () => ordersPage.applyFilters(),
      (q) => q.get("status") === "PENDING" && q.get("search") === surname
    );
    expect(query.get("status")).toBe("PENDING");
    expect(json.orders.map((o) => o.id)).toEqual([orderA.id]);
    for (const o of json.orders) expect(o.status).toBe("PENDING");
    await expect(ordersPage.rowByReceipt(orderA.receiptNumber)).toBeVisible();
    await expect(ordersPage.rowByReceipt(orderB.receiptNumber)).toHaveCount(0);
  });

  test("TC-235: the Order Type filter returns only orders of that type", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Filter Orders → Order Type = Delivery (scoped to the seed surname) sends orderType=DELIVERY and " +
        "returns only order B; the pickup seeds A and C are excluded."
    );
    const ordersPage = await gotoOrders(ownerPage);
    await ordersPage.waitForManagementResponse(
      () => ordersPage.searchOrders(surname),
      (q) => q.get("search") === surname
    );
    await ordersPage.openFilters();
    await ordersPage.selectTypeFilter("Delivery");
    const { query, json } = await ordersPage.waitForManagementResponse(
      () => ordersPage.applyFilters(),
      (q) => q.get("orderType") === "DELIVERY" && q.get("search") === surname
    );
    expect(query.get("orderType")).toBe("DELIVERY");
    expect(json.orders.map((o) => o.id)).toEqual([orderB.id]);
    await expect(ordersPage.rowByReceipt(orderB.receiptNumber)).toBeVisible();
    await expect(ordersPage.rowByReceipt(orderA.receiptNumber)).toHaveCount(0);
  });

  test("TC-236: the Filters button shows an active-filter count and Reset clears it", async ({
    ownerPage,
  }) => {
    await allure.description(
      "With status + type set the Filters button badge reads '2'; Reset returns to no badge; " +
        "setting only a status shows '1'."
    );
    const ordersPage = await gotoOrders(ownerPage);
    await ordersPage.openFilters();
    await ordersPage.selectStatusFilter("Pending");
    await ordersPage.selectTypeFilter("Pickup");
    await ordersPage.applyFilters();
    await expect(ordersPage.filterCountChip()).toHaveText("2");

    await ordersPage.openFilters();
    await ordersPage.resetFilters();
    await expect(ordersPage.filterCountChip()).toHaveCount(0);

    await ordersPage.openFilters();
    await ordersPage.selectStatusFilter("Confirmed");
    await ordersPage.applyFilters();
    await expect(ordersPage.filterCountChip()).toHaveText("1");
  });

  test("TC-237: sorting by amount re-queries with sortBy=total and orders the rows accordingly", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The Sort dropdown drives server-side ordering (per-column grid sorting is disabled). " +
        "'Highest Amount' → sortBy=total&sortDirection=desc and the returned totals are non-increasing; " +
        "'Lowest Amount' → asc and non-decreasing."
    );
    const ordersPage = await gotoOrders(ownerPage);
    // Scope to our surname so the sort set is small but non-trivial (3 rows).
    await ordersPage.waitForManagementResponse(
      () => ordersPage.searchOrders(surname),
      (q) => q.get("search") === surname
    );

    await allure.step("Highest Amount", async () => {
      const { query, json } = await ordersPage.waitForManagementResponse(
        () => ordersPage.selectSort("Highest Amount"),
        (q) => q.get("sortBy") === "total" && q.get("sortDirection") === "desc"
      );
      expect(query.get("sortBy")).toBe("total");
      const totals = json.orders.map((o) => Number(o.total));
      for (let i = 1; i < totals.length; i++)
        expect(totals[i]!).toBeLessThanOrEqual(totals[i - 1]!);
    });

    await allure.step("Lowest Amount", async () => {
      const { json } = await ordersPage.waitForManagementResponse(
        () => ordersPage.selectSort("Lowest Amount"),
        (q) => q.get("sortBy") === "total" && q.get("sortDirection") === "asc"
      );
      const totals = json.orders.map((o) => Number(o.total));
      for (let i = 1; i < totals.length; i++)
        expect(totals[i]!).toBeGreaterThanOrEqual(totals[i - 1]!);
    });
  });

  test("TC-238: page size and page navigation are sent to the server and size changes reset to page 1", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The grid paginates server-side. Choosing 25 rows/page re-queries with limit=25&page=1; on a " +
        "list with more than 10 rows, 'next page' at size 10 sends page=2 and switching size afterwards " +
        "snaps back to page=1. On a fresh QA with ≤10 orders in range the page-2 step is annotated and skipped."
    );
    const ordersPage = await gotoOrders(ownerPage);
    // Search mode ignores the date range → the widest possible list.
    const first = await ordersPage.waitForManagementResponse(
      () => ordersPage.searchOrders(surname.slice(0, 4)),
      (q) => q.get("search") === surname.slice(0, 4)
    );

    await allure.step("Rows per page → 25", async () => {
      const { query } = await ordersPage.waitForManagementResponse(
        () => ordersPage.selectPageSize(25),
        (q) => q.get("limit") === "25"
      );
      expect(query.get("page")).toBe("1");
    });

    if (first.json.totalCount > 10) {
      await allure.step("Back to 10, next page → page=2", async () => {
        await ordersPage.waitForManagementResponse(
          () => ordersPage.selectPageSize(10),
          (q) => q.get("limit") === "10"
        );
        const { query } = await ordersPage.waitForManagementResponse(
          () => ordersPage.nextPageButton().click(),
          (q) => q.get("page") === "2"
        );
        expect(query.get("limit")).toBe("10");
      });
      await allure.step("Size change resets to page 1", async () => {
        const { query } = await ordersPage.waitForManagementResponse(
          () => ordersPage.selectPageSize(25),
          (q) => q.get("limit") === "25"
        );
        expect(query.get("page")).toBe("1");
      });
    } else {
      test.info().annotations.push({
        type: "note",
        description: `Only ${first.json.totalCount} rows match — page-2 step skipped (fresh QA).`,
      });
    }
  });

  test("TC-239: the Refresh button re-fetches the orders list", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The toolbar's refresh icon re-issues the management GET (there is no auto-refresh on this tab)."
    );
    const ordersPage = await gotoOrders(ownerPage);
    const { json } = await ordersPage.waitForManagementResponse(() =>
      ordersPage.refreshButton().click()
    );
    expect(typeof json.totalCount).toBe("number");
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Detail sheet — amounts, items, customer, delivery
  // ══════════════════════════════════════════════════════════════════════════

  test("TC-240: the detail sheet's money rows equal what the backend recorded for the order", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Subtotal / Tax / Tip / 'Customer paid' in the Order Total block equal the seed RESPONSE values " +
        "(server-authoritative pricing: tax is recomputed by the backend, so we compare against what it " +
        "recorded, not what we sent). The delivery seed additionally shows its Delivery Fee row."
    );
    const { restaurantId } = readSharedState();
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step("Pickup order A", async () => {
      await ordersPage.gotoOrderDetail(restaurantId, orderA.id);
      await expect(ordersPage.sheetTitle()).toContainText(
        `Receipt #${orderA.receiptNumber}`
      );
      await expect(ordersPage.moneyRow("Subtotal:")).toHaveText(
        usd(orderA.subtotal)
      );
      await expect(ordersPage.moneyRow("Tax:")).toHaveText(usd(orderA.tax));
      await expect(ordersPage.moneyRow("Tip:")).toHaveText(usd(orderA.tip));
      await expect(ordersPage.moneyRow("Customer paid")).toHaveText(
        usd(orderA.total)
      );
      await allure.parameter("A.total", String(orderA.total));
    });

    await allure.step("Delivery order B", async () => {
      await ordersPage.gotoOrderDetail(restaurantId, orderB.id);
      await expect(ordersPage.moneyRow("Customer paid")).toHaveText(
        usd(orderB.total)
      );
      if (orderB.deliveryFeeApplied && orderB.deliveryFee > 0) {
        await expect(ordersPage.moneyRow("Delivery Fee:")).toHaveText(
          usd(orderB.deliveryFee)
        );
      } else {
        test.info().annotations.push({
          type: "note",
          description:
            "Delivery fee not applied by the backend for this restaurant (tax policy) — fee row skipped.",
        });
      }
    });
  });

  test("TC-241: the detail sheet lists the ordered item, quantity, price and special instructions", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The Order Items table shows the seeded menu item with quantity 1 at its recorded price, the " +
        "heading counts the items, and the customer's special instructions are shown under Order Information."
    );
    const { restaurantId } = readSharedState();
    const ordersPage = createOwnerOrdersPage(ownerPage);
    const item = seedItem();
    await ordersPage.gotoOrderDetail(restaurantId, orderA.id);
    await expect(ordersPage.itemsHeading()).toHaveText("Order Items (1)");
    const row = ordersPage.itemRow(item.name);
    await expect(row).toBeVisible();
    await expect(row).toContainText(item.name);
    await expect(row.locator("td").nth(1)).toHaveText("1");
    await expect(row.locator("td").nth(2)).toContainText(usd(orderA.subtotal));
    await expect(ordersPage.specialInstructionsValue()).toHaveText(
      `AUTO ${runId} no onions`
    );
  });

  test("TC-242: the Customer Info tab shows the order's contact snapshot, or Guest / N/A when absent", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Customer Info renders name, phone and email from the order's contact snapshot; a guest order " +
        "with no contact falls back to 'Guest' and 'N/A'."
    );
    const { restaurantId } = readSharedState();
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await allure.step("Named order A", async () => {
      await ordersPage.gotoOrderDetail(restaurantId, orderA.id);
      await ordersPage.openTab("Customer Info");
      await expect(ordersPage.customerInfoValue("Customer Name")).toHaveText(
        `Alpha ${surname}`
      );
      await expect(ordersPage.customerInfoValue("Phone Number")).toContainText(
        phoneA
      );
      await expect(ordersPage.customerInfoValue("Email Address")).toHaveText(
        seedEmail("a")
      );
    });

    await allure.step("Guest order D", async () => {
      await ordersPage.gotoOrderDetail(restaurantId, orderD.id);
      await ordersPage.openTab("Customer Info");
      await expect(ordersPage.customerInfoValue("Customer Name")).toHaveText(
        "Guest"
      );
      await expect(ordersPage.customerInfoValue("Phone Number")).toHaveText(
        "N/A"
      );
      await expect(ordersPage.customerInfoValue("Email Address")).toHaveText(
        "N/A"
      );
    });
  });

  test("TC-243: the Delivery Info tab shows the delivery address and notes; pickup orders have no such tab", async ({
    ownerPage,
  }) => {
    await allure.description(
      "For a DELIVERY order the sheet gains a Delivery Info tab with the street/unit, city/state/zip, " +
        "the customer's delivery notes and (no courier dispatched) 'Delivered by the restaurant'. " +
        "A PICKUP order has only Order Details + Customer Info."
    );
    const { restaurantId } = readSharedState();
    const ordersPage = createOwnerOrdersPage(ownerPage);

    await ordersPage.gotoOrderDetail(restaurantId, orderB.id);
    await ordersPage.openTab("Delivery Info");
    const lines = ordersPage.deliveryAddressLines();
    await expect(lines.nth(0)).toHaveText("123 Automation Ave, Unit 4B");
    await expect(lines.nth(1)).toHaveText("Austin, TX 78701");
    await expect(ordersPage.deliveryNotesValue()).toHaveText(
      `Ring bell ${runId}`
    );
    await expect(ordersPage.selfDeliveredNote()).toBeVisible();

    await ordersPage.gotoOrderDetail(restaurantId, orderA.id);
    await expect(ordersPage.tab("Customer Info")).toBeVisible();
    await expect(ordersPage.tab("Delivery Info")).toHaveCount(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Lifecycle + cancel (each seeds its own order — never mutates the seed set)
  // ══════════════════════════════════════════════════════════════════════════

  const driveLifecycle = async (
    ordersPage: ReturnType<typeof createOwnerOrdersPage>,
    steps: Array<{ button: string; status: string }>
  ) => {
    for (const step of steps) {
      await allure.step(`Mark as ${step.button}`, async () => {
        await expect(ordersPage.markAsNextButton()).toHaveText(
          `Mark as ${step.button}`
        );
        const body = await ordersPage.waitForStatusPut(() =>
          ordersPage.clickMarkAsNext()
        );
        expect(body.status).toBe(step.status);
      });
    }
  };

  test("TC-244: owner drives a pickup order through its whole lifecycle from the detail sheet", async ({
    ownerPage,
  }) => {
    await allure.description(
      "PENDING → Confirmed → Preparing → Ready → Picked Up via the single forward-only 'Mark as …' " +
        "button, each click confirmed by the status PUT. At the terminal status the button disappears, " +
        "the header chip reads 'Picked Up', all four prior steps are marked complete, and the sheet stays open."
    );
    const { restaurantId } = readSharedState();
    const token = await ownerToken();
    const order = await createSeededOrder(token, restaurantId, seedItem(), {
      status: "PENDING",
      lastName: mutationSurname,
      customerPhone: generateSeedPhone(),
    });
    await allure.parameter("orderId", order.id);
    const ordersPage = createOwnerOrdersPage(ownerPage);
    await ordersPage.gotoOrderDetail(restaurantId, order.id);

    await driveLifecycle(ordersPage, [
      { button: "Confirmed", status: "CONFIRMED" },
      { button: "Preparing", status: "PREPARING" },
      { button: "Ready", status: "READY" },
      { button: "Picked Up", status: "PICKED_UP" },
    ]);

    await allure.step("Terminal state", async () => {
      await expect(ordersPage.markAsNextButton()).toHaveCount(0);
      await expect(ordersPage.statusChip()).toHaveText("Picked Up");
      await expect(ordersPage.completedSteps()).toHaveCount(4);
      await expect(ordersPage.activeStepLabel()).toHaveText("Picked Up");
      await expect(ordersPage.detailSheet()).toBeVisible();
    });
  });

  test("TC-245: owner drives a delivery order through its whole lifecycle from the detail sheet", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Delivery orders have a longer path: PENDING → Confirmed → Preparing → Ready → Out for Delivery → " +
        "Delivered. Each step is confirmed by the status PUT; at Delivered the button is gone."
    );
    const { restaurantId } = readSharedState();
    const token = await ownerToken();
    const order = await createSeededOrder(token, restaurantId, seedItem(), {
      status: "PENDING",
      orderType: "DELIVERY",
      lastName: mutationSurname,
      customerPhone: generateSeedPhone(),
      deliveryAddress: {
        street: "9 Lifecycle Ln",
        city: "Austin",
        state: "TX",
        zipCode: "78702",
      },
    });
    await allure.parameter("orderId", order.id);
    const ordersPage = createOwnerOrdersPage(ownerPage);
    await ordersPage.gotoOrderDetail(restaurantId, order.id);

    await driveLifecycle(ordersPage, [
      { button: "Confirmed", status: "CONFIRMED" },
      { button: "Preparing", status: "PREPARING" },
      { button: "Ready", status: "READY" },
      { button: "Out for Delivery", status: "OUT_FOR_DELIVERY" },
      { button: "Delivered", status: "DELIVERED" },
    ]);
    await expect(ordersPage.markAsNextButton()).toHaveCount(0);
    await expect(ordersPage.statusChip()).toHaveText("Delivered");
    await expect(ordersPage.completedSteps()).toHaveCount(5);
  });

  test("TC-246: owner cancels an UNPAID order — no refund copy, order becomes Cancelled and loses its actions", async ({
    ownerPage,
  }) => {
    await allure.description(
      "The common (non-Stripe) cancel path that TC-225 does not cover. For an unpaid order the nested " +
        "dialog shows no 'will be refunded' copy and its confirm button reads 'Cancel Order' (not " +
        "'Cancel & Refund'). Confirming PUTs /api/order/statistics/cancel/:id → {success:true, " +
        "action:'CANCELLED'}, a success alert shows, the sheet auto-closes; re-opening shows the " +
        "Cancelled chip with no Cancel / Mark-as buttons and no Order Progress stepper."
    );
    const { restaurantId } = readSharedState();
    const token = await ownerToken();
    const order = await createSeededOrder(token, restaurantId, seedItem(), {
      status: "CONFIRMED",
      lastName: mutationSurname,
      customerPhone: generateSeedPhone(),
    });
    await allure.parameter("orderId", order.id);
    const ordersPage = createOwnerOrdersPage(ownerPage);
    await ordersPage.gotoOrderDetail(restaurantId, order.id);

    await allure.step("Open Cancel Order — unpaid copy", async () => {
      await ordersPage.openCancelDialog();
      await expect(ordersPage.cancelRefundDialog()).toBeVisible();
      await expect(ordersPage.cancelRefundDialog()).toContainText(
        `Cancel Order — Receipt #${order.receiptNumber}`
      );
      await expect(ordersPage.refundInfoAlert()).toHaveCount(0);
      await expect(ordersPage.confirmCancelAndRefundButton()).toHaveCount(0);
      await expect(ordersPage.confirmCancelUnpaidButton()).toBeVisible();
    });

    await allure.step("Confirm → CANCELLED", async () => {
      await ordersPage.cancelReasonInput().fill(`AUTO ${runId} unpaid cancel`);
      const body = await ordersPage.waitForCancelPut(() =>
        ordersPage.confirmCancelUnpaidButton().click()
      );
      expect(body.success).toBe(true);
      expect(body.action).toBe("CANCELLED");
      await expect(ordersPage.cancelSuccessAlert()).toBeVisible({
        timeout: 10_000,
      });
      // The sheet closes itself ~2 s after success.
      await expect(ordersPage.detailSheet()).toBeHidden({ timeout: 15_000 });
    });

    await allure.step("Re-open: terminal state", async () => {
      await ordersPage.gotoOrderDetail(restaurantId, order.id);
      await expect(ordersPage.statusChip()).toHaveText("Cancelled");
      await expect(ordersPage.cancelOrderButton()).toHaveCount(0);
      await expect(ordersPage.markAsNextButton()).toHaveCount(0);
      await expect(ordersPage.orderProgressHeading()).toHaveCount(0);
    });
  });

  test("TC-247: 'Keep Order' closes the cancel dialog without cancelling", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Backing out of the cancel dialog must be free of side effects: no cancel request is sent, the " +
        "nested dialog closes and the sheet still offers Cancel Order."
    );
    const { restaurantId } = readSharedState();
    const ordersPage = createOwnerOrdersPage(ownerPage);
    let cancelRequests = 0;
    ownerPage.on("request", (r) => {
      if (/\/api\/order\/statistics\/cancel\//.test(r.url())) cancelRequests++;
    });
    // orderB is CONFIRMED and never mutated — safe to open the dialog on.
    await ordersPage.gotoOrderDetail(restaurantId, orderB.id);
    await ordersPage.openCancelDialog();
    await expect(ordersPage.cancelRefundDialog()).toBeVisible();
    await ordersPage.keepOrderButton().click();
    await expect(ordersPage.cancelRefundDialog()).toBeHidden({
      timeout: 10_000,
    });
    await expect(ordersPage.cancelOrderButton()).toBeVisible();
    await expect(ordersPage.statusChip()).toHaveText("Confirmed");
    expect(cancelRequests).toBe(0);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Export
  // ══════════════════════════════════════════════════════════════════════════

  test("TC-248: Export → Current View downloads a CSV of exactly the filtered orders", async ({
    ownerPage,
  }) => {
    await allure.description(
      "With the grid narrowed to the seed surname, Export Orders → Current View POSTs " +
        "/api/order/statistics/export/:id with exportType=current + the search term and the browser " +
        "receives orders_<date>[…].csv. The file has the 32 documented columns and exactly the three " +
        "named seed rows (by receipt number). Adding the Pending status filter narrows the CSV to order A."
    );
    const ordersPage = await gotoOrders(ownerPage);
    await ordersPage.waitForManagementResponse(
      () => ordersPage.searchOrders(surname),
      (q) => q.get("search") === surname
    );

    const downloadCsv = async () => {
      const [download, request] = await Promise.all([
        ownerPage.waitForEvent("download", { timeout: 60_000 }),
        ownerPage.waitForRequest(
          (r) =>
            /\/api\/order\/statistics\/export\//.test(r.url()) &&
            r.method() === "POST"
        ),
        ordersPage.exportCurrentView(),
      ]);
      const body = request.postDataJSON() as Record<string, unknown>;
      const text = fs.readFileSync(await download.path(), "utf8");
      return {
        filename: download.suggestedFilename(),
        body,
        rows: parseCsv(text),
      };
    };

    await allure.step("Export the surname-filtered view", async () => {
      const { filename, body, rows } = await downloadCsv();
      await allure.parameter("filename", filename);
      expect(filename).toMatch(/^orders_\d{4}-\d{2}-\d{2}(_[a-z0-9_]+)*\.csv$/);
      expect(body.exportType).toBe("current");
      expect(body.search).toBe(surname);
      expect(rows[0]).toEqual(EXPORT_CSV_HEADER);
      const receipts = rows
        .slice(1)
        .map((r) => r[0])
        .sort();
      expect(receipts).toEqual(
        surnameOrders()
          .map((o) => o.receiptNumber)
          .sort()
      );
      const statusCol = EXPORT_CSV_HEADER.indexOf("Status");
      const statuses = new Set(rows.slice(1).map((r) => r[statusCol]));
      expect([...statuses].sort()).toEqual(
        ["PENDING", "CONFIRMED", "CANCELLED"].sort()
      );
    });

    await allure.step("Add status=Pending → CSV narrows to A", async () => {
      await ordersPage.openFilters();
      await ordersPage.selectStatusFilter("Pending");
      await ordersPage.waitForManagementResponse(
        () => ordersPage.applyFilters(),
        (q) => q.get("status") === "PENDING"
      );
      const { body, rows } = await downloadCsv();
      expect(body.status).toBe("PENDING");
      expect(rows.slice(1).map((r) => r[0])).toEqual([orderA.receiptNumber]);
    });
  });

  test("TC-249: Export is disabled when the current view has no orders", async ({
    ownerPage,
  }) => {
    await allure.description(
      "An export of nothing is a 400 on the backend, so the toolbar disables the Export button while " +
        "totalCount is 0 and re-enables it once rows are back."
    );
    const ordersPage = await gotoOrders(ownerPage);
    const none = `nonexistent-order-${runId}`;
    await ordersPage.waitForManagementResponse(
      () => ordersPage.searchOrders(none),
      (q) => q.get("search") === none
    );
    await expect(ordersPage.exportOrdersButton()).toBeDisabled();
    await ordersPage.waitForManagementResponse(
      () => ordersPage.searchOrders(surname),
      (q) => q.get("search") === surname
    );
    await expect(ordersPage.exportOrdersButton()).toBeEnabled();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Header stats + date range
  // ══════════════════════════════════════════════════════════════════════════

  test("TC-250: the header stat cards reflect the stats API and move when orders are seeded", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Two proofs. (1) API delta, timezone-proof: with a yesterday→tomorrow window, seeding two pickup " +
        "orders raises Total Orders and Pickup count by ≥2 and Net Sales by ≥ 2 × item price (≥ because " +
        "concurrent spec files also seed). (2) UI: the four cards render exactly the values the stats " +
        "endpoint returned, 'Update Stats' re-fires it, and picking the 'Today' preset re-fires it with " +
        "browser-local start=end=today."
    );
    const { restaurantId } = readSharedState();
    const token = await ownerToken();
    const item = seedItem();
    const day = (offset: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const range = { startDate: day(-1), endDate: day(1) };
    const pickupCount = (s: Awaited<ReturnType<typeof getOrderStats>>) =>
      s.ordersByType.find((t) => t.type === "PICKUP")?.count ?? 0;

    await allure.step("API delta after seeding two pickup orders", async () => {
      const before = await getOrderStats(token, restaurantId, range);
      for (let i = 0; i < 2; i++) {
        await createSeededOrder(token, restaurantId, item, {
          status: "CONFIRMED",
          lastName: mutationSurname,
          customerPhone: generateSeedPhone(),
        });
      }
      const after = await getOrderStats(token, restaurantId, range);
      expect(after.totalOrders - before.totalOrders).toBeGreaterThanOrEqual(2);
      expect(pickupCount(after) - pickupCount(before)).toBeGreaterThanOrEqual(
        2
      );
      expect(after.totalRevenue - before.totalRevenue).toBeGreaterThanOrEqual(
        2 * item.price - 0.01
      );
    });

    const ordersPage = createOwnerOrdersPage(ownerPage);
    await allure.step("Cards equal the stats response", async () => {
      const mgmtPage = createOwnerRestaurantManagementPage(ownerPage);
      const { json } = await ordersPage.waitForStatsResponse(async () => {
        await mgmtPage.goto(restaurantId);
        await ordersPage.navigateToOrdersTab();
      });
      const total = Number(json.totalOrders);
      const pct = (n: number) =>
        total > 0 ? Math.round((n / total) * 100) : 0;
      const byType =
        (json.ordersByType as Array<Record<string, unknown>>) ?? [];
      const count = (t: string) =>
        Number(byType.find((x) => x.type === t)?.count ?? 0);
      if (total === 0) {
        await expect(ordersPage.emptyRangeTitle()).toBeVisible();
        return;
      }
      await expect(ordersPage.statCardValue("Total Orders")).toHaveText(
        String(total)
      );
      await expect(ordersPage.statCardValue("Net Sales")).toHaveText(
        usd(Number(json.totalRevenue))
      );
      await expect(ordersPage.statCardValue("Delivery Orders")).toHaveText(
        `${count("DELIVERY")} (${pct(count("DELIVERY"))}%)`
      );
      await expect(ordersPage.statCardValue("Pickup Orders")).toHaveText(
        `${count("PICKUP")} (${pct(count("PICKUP"))}%)`
      );
    });

    await allure.step("Update Stats re-fires the request", async () => {
      await ordersPage.waitForStatsResponse(() =>
        ordersPage.updateStatsButton().click()
      );
    });

    await allure.step("Today preset → start=end=local today", async () => {
      const localToday = await ownerPage.evaluate(() => {
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      });
      await ordersPage.openDateRange();
      await ordersPage.datePreset("Today").click();
      const { query } = await ordersPage.waitForStatsResponse(() =>
        ordersPage.applyDateRange()
      );
      expect(query.get("startDate")).toBe(localToday);
      expect(query.get("endDate")).toBe(localToday);
    });
  });

  test("TC-251: a date range with no orders shows the empty state with a 'Change date range' CTA", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Choosing a custom range far in the past (before the restaurant existed) makes the stats " +
        "endpoint return 0 orders; the header swaps the cards for 'No orders in this date range' and " +
        "its CTA re-opens the date picker."
    );
    const ordersPage = await gotoOrders(ownerPage);
    await ordersPage.openDateRange();
    await ordersPage.typeDate("start", "01012020");
    await ordersPage.typeDate("end", "01022020");
    const { json, query } = await ordersPage.waitForStatsResponse(() =>
      ordersPage.applyDateRange()
    );
    await allure.parameter(
      "range",
      `${query.get("startDate")}..${query.get("endDate")}`
    );
    expect(query.get("startDate")).toBe("2020-01-01");
    expect(query.get("endDate")).toBe("2020-01-02");
    expect(json.totalOrders).toBe(0);
    await expect(ordersPage.emptyRangeTitle()).toBeVisible({ timeout: 10_000 });
    await ordersPage.changeDateRangeCta().click();
    await expect(ordersPage.dateRangePopover()).toBeVisible();
  });

  test("TC-252: deep-linking to an unknown order id does not break the tab", async ({
    ownerPage,
  }) => {
    await allure.description(
      "?detailOrderId=<garbage> triggers a lookup that 4xx's; the tab must still render the dashboard " +
        "and grid with no detail sheet and no uncaught page error."
    );
    const { restaurantId } = readSharedState();
    const errors: string[] = [];
    ownerPage.on("pageerror", (e) => errors.push(e.message));
    const bogus = `does-not-exist-${runId}`;
    const [lookup] = await Promise.all([
      ownerPage.waitForResponse(
        (r) => r.url().includes(`/api/order/${bogus}`),
        { timeout: 20_000 }
      ),
      ownerPage.goto(
        `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Orders&detailOrderId=${bogus}`,
        { waitUntil: "domcontentloaded" }
      ),
    ]);
    expect(lookup.status()).toBeGreaterThanOrEqual(400);
    const ordersPage = createOwnerOrdersPage(ownerPage);
    await ordersPage.assertOrdersTabLoaded();
    await expect(ordersPage.searchInput()).toBeVisible();
    // Give the failed lookup's handler a beat to (not) open a sheet.
    await expect
      .poll(async () => ordersPage.firstOrderRow().count(), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(0);
    await expect(ordersPage.detailSheet()).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});
