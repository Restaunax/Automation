/**
 * 13-member-points.spec.ts — a reward member on the restaurant website signs
 * in with a code, earns points on an order and spends them on the next one
 * (docs/COVERAGE_MAP.md G16) (TC-1086..1089).
 *
 * Browser on template-wind, the seed restaurant (its program: 1 point per
 * dollar, 100 points = $5 off, 100 to redeem). A fresh member is imported
 * with 90 points (admin bulk import, a new phone each run) and signs in at
 * checkout with the QA code 123456 (QA sends no texts). Two real Stripe
 * test-card orders.
 *
 *   TC-1086 Signed in: "Welcome back", 90 points, and "You need 10 more
 *           points to redeem" — nothing to redeem yet.
 *   TC-1087 The member orders and pays; the points earned are on the
 *           member's balance at once (90 + what the program says the order
 *           earns).
 *   TC-1088 The next order: 100 points redeemed for $5 off; the checkout
 *           total drops by $5.00 and the order is paid.
 *   TC-1089 After it, the balance is the old one less 100, plus what the
 *           second order earned. Points are earned on the food less coupons,
 *           NOT less points or gift cards (the documented rule, web and POS
 *           alike), so the order paid partly with points earns full points.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { createCustomerRewardSection } from "../../pages/customer/CustomerRewardSection";
import {
  apiLogin,
  apiRequestRaw,
  getOrderByIdRaw,
} from "../../utils/apiHelper";
import { seedRewardMember } from "../../utils/rewardsApi";
import {
  generateRunId,
  generateSeedPhone,
  generateUserEmail,
  readRestaurantId,
  readSharedState,
} from "../../utils/testData";
import { payWithTestCard } from "../../utils/windPayment";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

type Rec = Record<string, unknown>;

test.describe.configure({ mode: "serial" });

test.describe("Reward member on the website — earn, then spend", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !OWNER_EMAIL || !OWNER_PASSWORD,
    "ADMIN and OWNER credentials are needed (import a member, read orders)"
  );

  const runId = generateRunId();
  const phone = generateSeedPhone();
  const email = generateUserEmail("member-points");
  let restaurantId = "";
  let balance = 90;
  /** The program's own answer: points for a pre-tax amount. */
  const pointsFor = async (amount: number) => {
    const r = await apiRequestRaw<Rec>(
      "GET",
      `/api/rewards/restaurant/${restaurantId}/preview?orderTotal=${amount}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return Number(r.data.pointsToEarn);
  };
  const ownerToken = async () =>
    (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    restaurantId = readRestaurantId();
    const admin = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    await seedRewardMember(
      admin,
      restaurantId,
      phone,
      90,
      "",
      `AUTO Points Member ${runId}`
    );
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Website rewards");
    await allure.label("severity", "critical");
  });

  /** A cart of `quantity` seed items, the member's details, signed in. */
  const startCheckout = async (
    page: import("@playwright/test").Page,
    quantity: number
  ) => {
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkout = createCustomerCheckoutPage(page);
    const rewards = createCustomerRewardSection(page);
    await checkout.seedCartItems(restaurantId, [
      {
        menuItemId,
        name: menuItemName,
        price: menuItemPrice,
        quantity,
      },
    ]);
    await checkout.fillCustomerInfo("Points", "Member", email, phone);
    // Still signed in from an earlier order on this page: no sign-in again.
    // Wait for the rewards box to settle on one of its two faces first.
    const signIn = page.getByRole("button", {
      name: "Sign In to Existing Account",
    });
    const balanceShown = page.getByText(/\d+ points available/).first();
    await expect(signIn.or(balanceShown).first()).toBeVisible({
      timeout: 20_000,
    });
    if (!(await balanceShown.isVisible())) await rewards.signIn(phone);
    await checkout.selectPickup();
    return { checkout, rewards, subtotal: menuItemPrice * quantity };
  };

  test("TC-1086: signed in with 90 points — 10 more needed before anything can be redeemed", async ({
    page,
  }) => {
    await startCheckout(page, 1);
    await expect(page.getByText("90 points available").first()).toBeVisible();
    await expect(
      page.getByText(/You need 10 more points to redeem/).first()
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Redeem" })).toHaveCount(0);
  });

  test("TC-1087: the member orders and the points earned are on the balance at once", async ({
    page,
  }, testInfo) => {
    const { menuItemPrice } = readSharedState();
    // Enough food to pass the 100-point line.
    const quantity = Math.max(1, Math.ceil(12 / menuItemPrice));
    const { checkout, subtotal } = await startCheckout(page, quantity);
    const earned = await pointsFor(subtotal);
    expect(earned).toBeGreaterThanOrEqual(10);
    await checkout.clickProceedToPayment();
    await checkout.assertPaymentSectionVisible();
    await payWithTestCard(page, testInfo);
    const orderId =
      page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(orderId, page.url()).toBeTruthy();
    await allure.parameter("orderId", orderId);
    const order = await getOrderByIdRaw(await ownerToken(), orderId);
    expect(order.status, JSON.stringify(order.data)).toBe(200);
    expect((order.data as Rec).subtotal).toBe(subtotal);

    balance += earned;
    await startCheckout(page, 1);
    await expect(
      page.getByText(`${balance} points available`).first()
    ).toBeVisible({ timeout: 20_000 });
  });

  test("TC-1088: the next order spends 100 points for $5.00 off", async ({
    page,
  }, testInfo) => {
    const { checkout, rewards, subtotal } = await startCheckout(page, 1);
    await expect(
      page.getByText(`${balance} points available`).first()
    ).toBeVisible();
    await rewards.redeem(100);
    await expect(page.getByText("$5.00").first()).toBeVisible();
    await checkout.clickProceedToPayment();
    await checkout.assertPaymentSectionVisible();
    await payWithTestCard(page, testInfo);
    const orderId =
      page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
    const order = (await getOrderByIdRaw(await ownerToken(), orderId))
      .data as Rec;
    expect(order).toMatchObject({ pointsToRedeem: 100, redemptionValue: 5 });
    balance = balance - 100 + (await pointsFor(subtotal));
  });

  test("TC-1089: the balance is the old one less 100, plus what the second order earned", async ({
    page,
  }) => {
    await startCheckout(page, 1);
    await expect(
      page.getByText(`${balance} points available`).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});
