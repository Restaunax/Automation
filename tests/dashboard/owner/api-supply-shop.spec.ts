/**
 * api-supply-shop.spec.ts — the owner supply-shop API contract (TC-478..483).
 *
 * No browser. A per-run throwaway tenant, the same shape as api-deals: quote
 * math per tier, the `X-Restaurant-Id` tenancy header (and that another
 * owner's restaurant behind it is refused), what the owner's order list
 * strips, and the state-machine refusals an owner can hit.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  putGiftCardConfigAdminRaw,
  getSupplyCatalogOwnerRaw,
  quoteSupplyOwnerRaw,
  placeSupplyOrderViaApi,
  listSupplyOrdersOwnerRaw,
  approveSupplyProofOwnerRaw,
  requestSupplyRevisionsOwnerRaw,
  cancelSupplyOrderOwnerRaw,
  resolveGiftCardVariantId,
  SUPPLY_GIFT_CARD_PRODUCT_SLUG,
  type SupplyOrder,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

test.describe("Owner — Supply shop API contract", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let variantId = "";
  let order: SupplyOrder;

  const ownerApi = async () => {
    ownerToken = (await apiLogin(ownerEmail, ownerPassword)).accessToken;
    return ownerToken;
  };

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error("[api-supply-shop] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;
    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SUPPLY_SHOP",
      true
    );
    if (!grant.ok)
      throw new Error(
        `[api-supply-shop] could not grant SUPPLY_SHOP: ${msg(grant.data)}`
      );
    variantId = await resolveGiftCardVariantId(adminToken);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    if (order) {
      await cancelSupplyOrderOwnerRaw(
        await ownerApi().catch(() => ownerToken),
        restaurantId,
        order.id
      ).catch(() => {
        /* already cancelled by TC-483 */
      });
    }
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SUPPLY_SHOP"
    ).catch(() => {
      /* override may already be gone */
    });
    if (restaurantId && !process.env.OWNER2_EMAIL) {
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
        /* archive is best-effort; globalTeardown sweeps the user */
      });
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Supply shop");
    await allure.label("severity", "normal");
  });

  test("TC-478: the quote is arithmetic on the tier — and the estimate is that arithmetic +25% on both subtotal and shipping", async () => {
    await allure.description(
      "100 → $1.95/$12 · 250 → $1.45/$15 · 500 → $1.10/$18; spread 25%; no free tier on a $207 run."
    );
    const cases = [
      { qty: 100, unit: 1.95, ship: 12 },
      { qty: 250, unit: 1.45, ship: 15 },
      { qty: 500, unit: 1.1, ship: 18 },
    ];
    for (const c of cases) {
      const res = await quoteSupplyOwnerRaw(ownerToken, restaurantId, {
        variantId,
        quantity: c.qty,
      });
      expect(res.status, `${c.qty}: ${JSON.stringify(res.data)}`).toBe(200);
      const q = res.data.data;
      const subtotal = Number((c.unit * c.qty).toFixed(2));
      expect(q).toMatchObject({
        unitPrice: c.unit,
        subtotal,
        shippingAmount: c.ship,
        total: subtotal + c.ship,
      });
      expect(q.estimate.spreadPct).toBe(25);
      expect(q.estimate.totalLow).toBe(subtotal + c.ship);
      expect(q.estimate.totalHigh).toBeCloseTo((subtotal + c.ship) * 1.25, 2);
      expect(q.freeTier.applies).toBe(false);
    }
    // Below the first tier: no price, and the message names the minimum.
    const tooFew = await quoteSupplyOwnerRaw(ownerToken, restaurantId, {
      variantId,
      quantity: 50,
    });
    // 409, not 400: the quantity is well-formed, it is the CATALOG that has no
    // tier for it (NO_PRICE_TIER) — the same status the pricing service uses
    // for every catalog-state refusal. Only a malformed quantity is a 400.
    expect(tooFew.status, JSON.stringify(tooFew.data)).toBe(409);
    expect((tooFew.data as { code?: string }).code).toBe("NO_PRICE_TIER");
  });

  test("TC-479: the restaurant comes from X-Restaurant-Id — missing is 400, another owner's restaurant is refused", async () => {
    test.skip(
      !OWNER_EMAIL || !OWNER_PASSWORD,
      "OWNER_EMAIL / OWNER_PASSWORD not set"
    );
    const seedOwner = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    // The seed owner asks for THIS tenant's catalog/orders: not theirs.
    const foreign = await listSupplyOrdersOwnerRaw(seedOwner, restaurantId);
    expect([403, 404], JSON.stringify(foreign.data)).toContain(foreign.status);
    const missing = await getSupplyCatalogOwnerRaw(ownerToken, "");
    expect([400, 403], JSON.stringify(missing.data)).toContain(missing.status);
  });

  test("TC-480: the shop's search finds the gift card whether or not gift cards are on", async () => {
    await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
      isEnabled: false,
    });
    const off = await getSupplyCatalogOwnerRaw(
      ownerToken,
      restaurantId,
      "gift"
    );
    expect(off.data.data.map((p) => p.slug)).toContain(
      SUPPLY_GIFT_CARD_PRODUCT_SLUG
    );
    await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
      isEnabled: true,
    });
    const on = await getSupplyCatalogOwnerRaw(ownerToken, restaurantId, "gift");
    expect(on.data.data.map((p) => p.slug)).toContain(
      SUPPLY_GIFT_CARD_PRODUCT_SLUG
    );
  });

  test("TC-481: the owner's order list carries the estimate and nothing internal", async () => {
    order = await placeSupplyOrderViaApi(ownerToken, restaurantId, {
      variantId,
      quantity: 100,
      message: `api contract ${runId}`,
    });
    expect(order.status).toBe("IN_DESIGN");
    const list = await listSupplyOrdersOwnerRaw(ownerToken, restaurantId);
    const row = list.data.data.find((o) => o.id === order.id)!;
    expect(row).toMatchObject({
      estimatedTotalLow: 207,
      estimatedTotalHigh: 258.75,
      paymentTerm: "IMMEDIATE",
      paidAt: null,
      priceFinalizedAt: null,
    });
    for (const key of [
      "unitVendorCostSnapshot",
      "expectedVendorCost",
      "vendorCostAllocated",
      "pendingFulfilment",
      "placedByAdminId",
      "adminNotes",
    ]) {
      expect(row, key).not.toHaveProperty(key);
    }
  });

  test("TC-482: proof actions on an order with no proof are refused — approve and request-changes alike", async () => {
    const approve = await approveSupplyProofOwnerRaw(
      await ownerApi(),
      restaurantId,
      order.id,
      "not-a-version"
    );
    expect(approve.ok, JSON.stringify(approve.data)).toBe(false);
    const revise = await requestSupplyRevisionsOwnerRaw(
      ownerToken,
      restaurantId,
      order.id,
      "too early"
    );
    expect(revise.ok, JSON.stringify(revise.data)).toBe(false);
    const blank = await requestSupplyRevisionsOwnerRaw(
      ownerToken,
      restaurantId,
      order.id,
      "   "
    );
    expect(blank.status).toBe(400);
  });

  test("TC-483: cancel from IN_DESIGN is free and final — a second cancel is refused", async () => {
    const first = await cancelSupplyOrderOwnerRaw(
      await ownerApi(),
      restaurantId,
      order.id
    );
    expect(first.status, JSON.stringify(first.data)).toBe(200);
    const list = await listSupplyOrdersOwnerRaw(ownerToken, restaurantId);
    expect(list.data.data.find((o) => o.id === order.id)?.status).toBe(
      "CANCELLED"
    );
    const second = await cancelSupplyOrderOwnerRaw(
      ownerToken,
      restaurantId,
      order.id
    );
    expect(second.ok, JSON.stringify(second.data)).toBe(false);
  });
});
