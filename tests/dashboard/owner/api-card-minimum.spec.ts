/**
 * api-card-minimum.spec.ts — Stripe refuses a card charge under $0.50. The
 * checkout quote says so first, as a blocking ERROR issue with resolved text
 * (EN and ES), and the PaymentIntent route refuses such an order before any
 * Stripe call (audit W0:SIM-7c, restaunax fix 2026-10-31). $0.50 exactly is
 * fine. Runs on a throwaway tenant (createSecondOwner), never the seed
 * restaurant.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "@playwright/test";
import {
  apiLogin,
  apiRequestRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  deleteTestRestaurant,
  placeOrderRaw,
  quoteOrderRaw,
  setRestaurantPublishedApi,
  updateRestaurantSettingsApi,
} from "../../../utils/apiHelper";
import { generateRunId } from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const EN =
  "Card payments must be at least $0.50. Add an item or remove a discount to continue.";
const ES =
  "Los pagos con tarjeta deben ser de al menos $0.50. Agrega un artículo o quita un descuento para continuar.";

interface Issue {
  code: string;
  severity: string;
  message: string;
}

test.describe("Card total minimum ($0.50) — quote and PaymentIntent (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_* credentials not set in .env (admin mints the throwaway tenant)"
  );

  let adminToken = "";
  let restaurantId = "";
  let cheapId = "";
  let fiftyId = "";

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, generateRunId(), {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId)
      throw new Error("throwaway tenant has no restaurant");
    restaurantId = tenant.restaurantId;
    // 0% tax keeps the totals exactly the menu prices.
    await updateRestaurantSettingsApi(tenant.accessToken, restaurantId, {
      acceptingOrders: true,
      tax: 0,
    });
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    const group = await createMenuGroupNamed(
      tenant.accessToken,
      "Automation Items",
      { restaurantId }
    );
    cheapId = (
      await createMenuItemFull(
        tenant.accessToken,
        group.id,
        "Automation Mint",
        0.25
      )
    ).id;
    fiftyId = (
      await createMenuItemFull(
        tenant.accessToken,
        group.id,
        "Automation Gum",
        0.5
      )
    ).id;
  });

  test.afterAll(async () => {
    if (restaurantId) {
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
        // Best-effort: the AUTO sweep in globalTeardown covers leftovers.
      });
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Checkout");
    await allure.label("severity", "critical");
  });

  const issuesOf = (data: unknown) =>
    ((data as { issues?: Issue[] })?.issues ?? []) as Issue[];

  test("a 25¢ cart is blocked at the quote with a translated sentence", async () => {
    const r = await quoteOrderRaw(restaurantId, {
      orderItems: [{ menuItemId: cheapId, quantity: 1 }],
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(issuesOf(r.data)[0]).toMatchObject({
      code: "card_total_below_minimum",
      severity: "ERROR",
      message: EN,
    });
    const es = await apiRequestRaw(
      "POST",
      `/api/order/${restaurantId}/quote`,
      {
        orderType: "PICKUP",
        orderItems: [{ menuItemId: cheapId, quantity: 1 }],
      },
      undefined,
      { "Accept-Language": "es" }
    );
    expect(issuesOf(es.data)[0]?.message).toBe(ES);
  });

  test("exactly $0.50 is not blocked", async () => {
    const r = await quoteOrderRaw(restaurantId, {
      orderItems: [{ menuItemId: fiftyId, quantity: 1 }],
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(
      issuesOf(r.data).map((i) => i.code),
      JSON.stringify(r.data)
    ).not.toContain("card_total_below_minimum");
  });

  test("the PaymentIntent route refuses a 25¢ order before calling Stripe", async () => {
    const placed = await placeOrderRaw(restaurantId, {
      orderType: "PICKUP",
      orderSource: "WEB",
      firstName: "Auto",
      lastName: "Minimum",
      customerEmail: `auto-minimum-${generateRunId()}@demomailtrap.co`,
      customerPhone: "2125550142",
      tip: 0,
      orderItems: [
        {
          menuItemId: cheapId,
          menuItemName: "Automation Mint",
          quantity: 1,
          price: 0.25,
          selectedModifiers: [],
        },
      ],
    });
    const orderId = placed.data.order?.id ?? placed.data.id;
    expect(orderId, JSON.stringify(placed.data)).toBeTruthy();
    const pi = await apiRequestRaw<{ message?: string; error?: string }>(
      "POST",
      "/api/stripe/payment-intent",
      { orderId }
    );
    expect(pi.status, JSON.stringify(pi.data)).toBe(400);
    expect(pi.data.error ?? pi.data.message).toBe(EN);
  });
});
