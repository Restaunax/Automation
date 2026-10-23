import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaCheckoutPage } from "../../pages/lima/LimaCheckoutPage";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import {
  apiLogin,
  apiRequestRaw,
  getOrderByIdRaw,
} from "../../utils/apiHelper";
import { STRIPE_CARDS } from "../../utils/stripeCards";
import { fillStripePaymentElement } from "../../utils/stripeHelper";
import {
  LIMA_ORDERING_URL,
  generateRunId,
  generateSeedPhone,
  generateUserEmail,
  readRestaurantId,
  readRestaurantSlug,
  readSharedState,
} from "../../utils/testData";

/**
 * Table QR ordering — a guest scans a per-table card (`<ordering base>?table=<code>`),
 * lands on the ordering site in dine-in mode, orders and pays; the order is
 * DINE_IN / TABLE_QR with the card's table label. A retired card falls back to
 * the ordinary ordering page.
 *
 * Self-contained: the spec creates its own card (unique label per run — labels
 * are unique among a restaurant's non-retired cards) and retires it in teardown.
 * Run alone: `npx playwright test --project=table-qr --grep @table-qr`.
 */

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

interface CardView {
  id: string;
  code: string;
  label: string | null;
  url: string;
  retired: boolean;
}

test.describe.configure({ mode: "serial" });

test.describe("Table QR ordering @table-qr", () => {
  const restaurantSlug = readRestaurantSlug();
  test.skip(
    !restaurantSlug || !OWNER_EMAIL || !OWNER_PASSWORD,
    "Ordering slug or owner credentials not available"
  );

  // ≤12 chars: "E2E-" + 8-char run id.
  const label = `E2E-${generateRunId()}`;
  let token = "";
  let restaurantId = "";
  let card: CardView | undefined;
  let retired = false;

  const retireCard = async (): Promise<void> => {
    if (!card || retired) return;
    const res = await apiRequestRaw(
      "POST",
      `/restaurant/${restaurantId}/table-qr-cards/${card.id}/retire`,
      undefined,
      token
    );
    if (!res.ok) throw new Error(`retire card → ${res.status}`);
    retired = true;
  };

  test.beforeAll(async () => {
    token = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    restaurantId = readRestaurantId();
    const res = await apiRequestRaw<{ success: boolean; data: CardView[] }>(
      "POST",
      `/restaurant/${restaurantId}/table-qr-cards`,
      { numbered: [{ label }] },
      token
    );
    if (!res.ok || !res.data.data?.[0]) {
      throw new Error(
        `create card → ${res.status}: ${JSON.stringify(res.data)}`
      );
    }
    card = res.data.data[0];
  });

  test.afterAll(async () => {
    // Free the label even when a case failed part-way.
    await retireCard().catch((e) =>
      console.warn(`[table-qr] teardown retire failed: ${String(e)}`)
    );
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Table QR Ordering");
  });

  /** Card link → menu → one item → cart → checkout, customer form filled. */
  const reachCheckout = async (
    page: Parameters<typeof createLimaStorefrontPage>[0],
    url: string
  ) => {
    const lima = createLimaStorefrontPage(page);
    const checkout = createLimaCheckoutPage(page);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return { lima, checkout };
  };

  const addItemAndOpenCheckout = async (
    page: Parameters<typeof createLimaStorefrontPage>[0],
    lima: ReturnType<typeof createLimaStorefrontPage>,
    checkout: ReturnType<typeof createLimaCheckoutPage>
  ) => {
    const state = readSharedState();
    await lima.gotoMenu(restaurantSlug);
    await lima.assertOnMenu();
    await lima.openItemModal(state.menuItemName);
    await lima.clickAddToCart();
    await page.goto(`${lima.tenantRoot(restaurantSlug)}/cart`, {
      waitUntil: "domcontentloaded",
    });
    await expect(checkout.proceedToCheckoutButton()).toBeVisible({
      timeout: 20_000,
    });
    await checkout.goToCheckout();
  };

  test("a guest scanning the card orders dine-in and the order is TABLE_QR @table-qr", async ({
    page,
  }) => {
    expect(card, "card created in beforeAll").toBeTruthy();
    const url = card!.url;
    expect(url, "card has an ordering link").toContain("?table=");
    test.skip(
      !url.startsWith(LIMA_ORDERING_URL),
      `card link ${url} is not on the lima ordering host ${LIMA_ORDERING_URL}`
    );
    await allure.parameter("label", label);

    const { lima, checkout } = await reachCheckout(page, url);

    await expect(
      page.getByText(`Ordering for table ${label}`, { exact: true })
    ).toBeVisible({ timeout: 20_000 });

    await addItemAndOpenCheckout(page, lima, checkout);

    // Banner survives navigation; no pickup/delivery choice, static Dine-in.
    await expect(
      page.getByText(`Ordering for table ${label}`, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText("Dine-in", { exact: true }).first()
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page.getByRole("heading", { name: "Pickup Information" })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Delivery", exact: true })
    ).toHaveCount(0);

    await checkout.fillCustomerInfo({
      firstName: "Auto",
      lastName: "TableQr",
      email: generateUserEmail("tableqr"),
      phone: generateSeedPhone(),
    });
    await checkout.proceedToPayment();
    await fillStripePaymentElement(page, STRIPE_CARDS.VISA_SUCCESS);
    await checkout.placeOrderAndConfirm();

    const orderId =
      page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(orderId, `order id from ${page.url()}`).toBeTruthy();
    await allure.parameter("orderId", orderId);

    // Owner API: the order we just placed (by id — robust to parallel runs).
    const res = await getOrderByIdRaw(token, orderId);
    expect(res.status).toBe(200);
    const order = res.data as unknown as {
      orderType?: string;
      orderSource?: string;
      tableNumber?: string | null;
      tabOpenedAt?: string | null;
    };
    expect(order.orderType).toBe("DINE_IN");
    expect(order.orderSource).toBe("TABLE_QR");
    expect(order.tableNumber).toBe(label);
    expect(order.tabOpenedAt ?? null).toBeNull();
  });

  test("a retired card opens the normal ordering page @table-qr", async ({
    page,
  }) => {
    expect(card).toBeTruthy();
    await retireCard();

    const { lima, checkout } = await reachCheckout(page, card!.url);

    await expect(page.getByTestId("table-card-banner")).toHaveCount(0);
    await expect(
      page.getByText(`Ordering for table ${label}`, { exact: true })
    ).toHaveCount(0);

    await addItemAndOpenCheckout(page, lima, checkout);
    // The ordinary pickup/delivery choice is back; no dine-in line.
    await checkout.assertPickupSelected();
    await expect(page.getByText("Dine-in", { exact: true })).toHaveCount(0);
  });
});
