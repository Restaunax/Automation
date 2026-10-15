/**
 * api-promotions.spec.ts — Promotions API contract (Layer 1).
 * Spec: restaunax docs/features/PROMOTIONS.md. Runs on a throwaway tenant
 * (createSecondOwner), never the seed restaurant.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "@playwright/test";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
} from "../../../utils/apiHelper";
import { generateCouponCode, generateRunId } from "../../../utils/testData";
import {
  createCouponPromotion,
  redeemCode,
  listPromotions,
} from "../../../utils/promotionsApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Promotions — API contract", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_* credentials not set in .env (admin mints the throwaway tenant)"
  );

  let adminToken = "";
  let token = "";
  let restaurantId = "";
  let ownsEnvTenant = false;

  test.beforeAll(async () => {
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, generateRunId());
    if (!tenant.restaurantId)
      throw new Error("throwaway tenant has no restaurant");
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownsEnvTenant = Boolean(
      process.env.OWNER2_EMAIL && process.env.OWNER2_PASSWORD
    );
  });

  test.afterAll(async () => {
    if (restaurantId && !ownsEnvTenant) {
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
        // Best-effort: the AUTO sweep in globalTeardown covers leftovers.
      });
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
  });

  test("TC-713: an order code redeems as ORDER and appears in the promotions list", async () => {
    const code = generateCouponCode();
    const { id } = await createCouponPromotion(token, restaurantId, {
      name: `AUTO ${code}`,
      code,
      type: "PERCENTAGE",
      value: 15,
      minOrderAmount: 30,
      maxDiscount: 4.5,
      applyMode: "CODE",
    });
    const r = await redeemCode(restaurantId, code);
    expect(r.status).toBe(200);
    expect(r.body.data?.kind).toBe("ORDER");
    const list = await listPromotions(token, restaurantId);
    expect(list.find((p) => p.id === id)?.code).toBe(code);
  });

  test("TC-714: an unknown code is refused with a readable message", async () => {
    const r = await redeemCode(restaurantId, "AUTONOPE" + Date.now());
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.body.success).toBe(false);
    // Resolved text, never an i18n key.
    expect(r.body.message ?? "").not.toMatch(/^[a-z]+:[a-zA-Z.]+$/);
  });
});
