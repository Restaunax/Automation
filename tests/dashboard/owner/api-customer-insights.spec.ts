/**
 * api-customer-insights.spec.ts — the owner's customer numbers add up
 * (TC-1099..1102).
 *
 * Three bugs found while syncing the Owner app (restaunax 2026-10-31,
 * docs/user-stories/customer-management-user-story.md → "How the numbers are
 * counted"):
 *   - the customer profile carried no `id`, so "Discounts sent" and "Send to
 *     this customer" (both keyed by Customer.id) had nothing to key on;
 *   - the analytics counted the anonymous POS walk-in record as a customer,
 *     and a month's "returning" could go negative;
 *   - the Groups summary added up overlapping groups.
 *
 * A per-run throwaway restaurant (7% tax, Stripe TEST, published) with one
 * menu item. Two identified online customers — Ana orders twice, Ben once —
 * and two anonymous cash walk-ins on a REGISTER device.
 *
 *   TC-1099 The profile returns the customer's id, and the "Discounts sent"
 *           history answers for that id.
 *   TC-1100 Analytics summary: walk-ins are not customers (2 customers, not
 *           3), new + returning = customers, none negative, and the walk-in
 *           orders are reported beside them.
 *   TC-1101 Monthly trends: per month new + returning = active customers,
 *           none negative; the Analytics segments are a partition of all-time
 *           customers.
 *   TC-1102 Groups (/segments): a distinct totalCustomers (2, walk-ins
 *           excluded); no group and no healthyCustomers (VIP or Loyal,
 *           distinct) exceeds it. (The groups overlap AND leave gaps — a
 *           recent 1-order customer is in none — so the sum of group counts
 *           can be above or below the total; it is never the total.)
 *
 * NOTE: needs the restaunax backend fix (branch fix/customer-insights-numbers)
 * deployed to QA; before that, TC-1099/1100/1101/1102 fail on the missing
 * fields.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  createTabletDevice,
  createTabletOrderRaw,
  deactivateTabletDevice,
  deleteTestRestaurant,
  ensureBusinessHours,
  ensureOrderingSlug,
  ensureTaxRate,
  openRegisterSessionPos,
  setOwnerPosPin,
  setRestaurantPublishedApi,
  stripeConfigRaw,
  stripeTestOnboardingRaw,
  tabletLogin,
  tabletStaffSignIn,
  updateRestaurantSettingsApi,
} from "../../../utils/apiHelper";
import { placePaidOnlineOrder } from "../../../utils/comboFoodSurfaces";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

interface Summary {
  uniqueCustomers: number;
  newCustomers: number;
  returningCustomers?: number;
  totalOrders: number;
  walkInOrders?: number;
}
interface Month {
  month: string;
  newCustomers: number;
  returningCustomers: number;
  activeCustomers?: number;
}
interface Analytics {
  summary: Summary;
  monthlyTrends: Month[];
  segments: Record<string, { count: number }>;
  totalAllTimeCustomers: number;
}

test.describe.configure({ mode: "serial" });

test.describe("Customer insights numbers (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let deviceId = "";
  let pk = "";
  let burgerId = "";
  const anaEmail = `auto-ana-${runId}@restaunax-test.com`;
  const benEmail = `auto-ben-${runId}@restaunax-test.com`;

  const burger = () => [
    { menuItemId: burgerId, menuItemName: "Burger", quantity: 1, price: 12 },
  ];
  // Distinct phones too, so neither customer can be matched to the other.
  const orderOnline = (email: string, firstName: string, phone: string) =>
    placePaidOnlineOrder(pk, restaurantId, {
      orderType: "PICKUP",
      subtotal: 12,
      tax: 0.84,
      tip: 0,
      deliveryFee: 0,
      total: 12.84,
      customerEmail: email,
      customerPhone: phone,
      firstName,
      lastName: `Insights${runId}`,
      orderItems: burger(),
    });
  const analytics = async (): Promise<Analytics> => {
    const res = await apiRequestRaw<{ analytics?: Analytics }>(
      "GET",
      `/api/customers/restaurant/${restaurantId}/analytics`,
      undefined,
      ownerToken
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return res.data.analytics as Analytics;
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[customer-insights] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });
    await ensureTaxRate(ownerToken, restaurantId, 7);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await ensureBusinessHours(ownerToken, restaurantId);
    const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
    if (onboard.status !== 200)
      throw new Error(
        `[customer-insights] stripe: ${JSON.stringify(onboard.data)}`
      );
    pk = String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
    await ensureOrderingSlug(
      adminToken,
      "restaurant",
      restaurantId,
      `auto-ci-${runId}`
    );
    const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
      restaurantId,
    });
    burgerId = (await createMenuItemFull(ownerToken, food.id, "Burger", 12)).id;

    // Identified customers: Ana twice, Ben once.
    await orderOnline(anaEmail, "Ana", "5555550131");
    await orderOnline(anaEmail, "Ana", "5555550131");
    await orderOnline(benEmail, "Ben", "5555550132");

    // Two anonymous cash walk-ins on a register (no contact details).
    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-ci-${runId}`
    );
    deviceId = device.id;
    const tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(ownerToken, restaurantId, "5824");
    const session = await tabletStaffSignIn(tablet, ownerMember, "5824");
    await openRegisterSessionPos(tablet, session);
    for (let i = 0; i < 2; i++) {
      const sale = await createTabletOrderRaw(tablet, session, {
        restaurantId,
        orderSource: "IN_STORE",
        orderType: "PICKUP",
        paymentMethod: "CASH",
        subtotal: 12,
        tax: 0.84,
        tip: 0,
        processingFee: 0,
        total: 12.84,
        customerPhone: "",
        orderItems: burger(),
      });
      if (sale.status !== 201)
        throw new Error(
          `[customer-insights] walk-in: ${JSON.stringify(sale.data)}`
        );
    }
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
          () => {}
        );
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Customers — insights numbers");
    await allure.label("severity", "critical");
  });

  test("TC-1099: the customer profile returns the customer's id, and Discounts sent answers for it", async () => {
    const profile = await apiRequestRaw<{
      customer?: { id?: string; email?: string; totalOrders?: number };
    }>(
      "GET",
      `/api/customers/restaurant/${restaurantId}/${encodeURIComponent(anaEmail)}`,
      undefined,
      ownerToken
    );
    expect(profile.status, JSON.stringify(profile.data)).toBe(200);
    const customer = profile.data.customer ?? {};
    expect(customer.email).toBe(anaEmail);
    expect(customer.totalOrders).toBe(2);
    expect(typeof customer.id, JSON.stringify(customer)).toBe("string");
    expect(String(customer.id).length).toBeGreaterThan(0);

    const sent = await apiRequestRaw<{ success?: boolean; data?: unknown[] }>(
      "GET",
      `/api/coupons/personal-codes/customer/${customer.id}?restaurantId=${restaurantId}`,
      undefined,
      ownerToken
    );
    expect(sent.status, JSON.stringify(sent.data)).toBe(200);
    expect(Array.isArray(sent.data.data)).toBe(true);
  });

  test("TC-1100: analytics counts only identified customers; new + returning = customers, none negative; walk-ins reported beside", async () => {
    const { summary } = await analytics();
    // Ana + Ben. The walk-in record is not a third customer.
    expect(summary.uniqueCustomers, JSON.stringify(summary)).toBe(2);
    expect(summary.totalOrders).toBe(3);
    expect(summary.newCustomers).toBe(2);
    expect(summary.returningCustomers).toBe(0);
    expect(summary.newCustomers + (summary.returningCustomers ?? NaN)).toBe(
      summary.uniqueCustomers
    );
    expect(summary.walkInOrders).toBe(2);
  });

  test("TC-1101: monthly trends add up per month, never negative; Analytics segments partition all-time customers", async () => {
    const data = await analytics();
    expect(data.monthlyTrends.length).toBeGreaterThan(0);
    for (const m of data.monthlyTrends) {
      expect(m.newCustomers, JSON.stringify(m)).toBeGreaterThanOrEqual(0);
      expect(m.returningCustomers, JSON.stringify(m)).toBeGreaterThanOrEqual(0);
      expect(m.newCustomers + m.returningCustomers, JSON.stringify(m)).toBe(
        m.activeCustomers
      );
    }
    // All orders were placed this month: Ana (3 orders would once have made
    // "new" 3 and "returning" negative) counts once.
    const latest = data.monthlyTrends[data.monthlyTrends.length - 1];
    expect(latest).toMatchObject({
      newCustomers: 2,
      returningCustomers: 0,
      activeCustomers: 2,
    });

    expect(data.totalAllTimeCustomers).toBe(2);
    const segmentSum = Object.values(data.segments).reduce(
      (s, x) => s + x.count,
      0
    );
    expect(segmentSum, JSON.stringify(data.segments)).toBe(
      data.totalAllTimeCustomers
    );
  });

  test("TC-1102: Groups report a distinct customer total that no group or the healthy count exceeds", async () => {
    const res = await apiRequestRaw<{
      segments?: Record<string, { count: number }>;
      totalCustomers?: number;
      healthyCustomers?: number;
    }>(
      "GET",
      `/api/customers/restaurant/${restaurantId}/segments`,
      undefined,
      ownerToken
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const { segments = {}, totalCustomers, healthyCustomers } = res.data;
    expect(totalCustomers, JSON.stringify(res.data)).toBe(2);
    const total = totalCustomers as number;
    for (const [key, group] of Object.entries(segments))
      expect(group.count, key).toBeLessThanOrEqual(total);
    const vip = segments.vip?.count ?? 0;
    const loyal = segments.loyal?.count ?? 0;
    expect(typeof healthyCustomers).toBe("number");
    // Distinct customers in VIP or Loyal: at least the bigger group, at most
    // both added, never more than everyone.
    expect(healthyCustomers).toBeGreaterThanOrEqual(Math.max(vip, loyal));
    expect(healthyCustomers).toBeLessThanOrEqual(Math.min(vip + loyal, total));
  });
});
