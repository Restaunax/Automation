import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { readSharedState } from "../../../utils/testData";
import {
  apiLogin,
  createMenuItemRaw,
  createCouponRaw,
  createRestaurantRaw,
  submitDemoRequestRaw,
} from "../../../utils/apiHelper";
import { generateDemoFormData } from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("API — Negative cases", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "API Negative Cases");
    await allure.label("severity", "normal");
  });

  test("TC-65: creating a menu item with no name is rejected", async () => {
    await allure.description(
      "POST /menu/item/new without a name field is rejected with a 4xx status, bypassing the UI."
    );

    const { menuGroupId } = readSharedState();
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);

    const res = await createMenuItemRaw(accessToken, {
      price: 9.99,
      groupId: menuGroupId,
    });

    await allure.parameter("status", String(res.status));
    expect(res.ok).toBe(false);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("TC-66: creating a coupon with no code is rejected", async () => {
    await allure.description(
      "POST /api/coupons/restaurant/:id without the required `code` field is rejected with a 4xx status."
    );

    const { restaurantId } = readSharedState();
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);

    const res = await createCouponRaw(accessToken, restaurantId, {
      type: "PERCENTAGE",
      value: 10,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: "ACTIVE",
    });

    await allure.parameter("status", String(res.status));
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  test("TC-68: creating a coupon with a negative discount value is rejected", async () => {
    await allure.description(
      "POST /api/coupons/restaurant/:id with a negative `value` is rejected with a 4xx status."
    );

    const { restaurantId } = readSharedState();
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);

    const res = await createCouponRaw(accessToken, restaurantId, {
      code: `AUTONEG${Date.now()}`,
      type: "PERCENTAGE",
      value: -10,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      status: "ACTIVE",
    });

    await allure.parameter("status", String(res.status));
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  test("TC-79: a restaurant owner without CREATE_RESTAURANT permission cannot self-serve create one", async () => {
    await allure.description(
      "POST /restaurant/new with the seed OWNER's token is rejected — restaurant creation requires " +
        "a permission this account doesn't hold, confirming the API enforces it (not just the UI)."
    );

    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const res = await createRestaurantRaw(accessToken, {
      name: "Should Not Be Created",
      cuisineType: "American",
    });

    await allure.parameter("status", String(res.status));
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
  });

  test("TC-80: submitting a demo request with no email is rejected", async () => {
    await allure.description(
      "POST /api/demo-requests with the email field omitted entirely is rejected with a 4xx status, " +
        "bypassing the frontend's HTML5 required-field check."
    );

    const formData = generateDemoFormData();
    const { email: _email, ...withoutEmail } = formData;
    const res = await submitDemoRequestRaw({
      ...withoutEmail,
      planType: "restaurant",
    });

    await allure.parameter("status", String(res.status));
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
  });

  test("TC-69: an authenticated endpoint rejects a garbage Bearer token", async () => {
    await allure.description(
      "POST /menu/item/new with a made-up Bearer token is rejected with a 401 rather than a validation error."
    );

    const res = await createMenuItemRaw("this-is-not-a-real-token", {
      name: "Should Not Be Created",
      price: 1,
      groupId: "00000000-0000-0000-0000-000000000000",
    });

    await allure.parameter("status", String(res.status));
    expect(res.status).toBe(401);
  });
});
