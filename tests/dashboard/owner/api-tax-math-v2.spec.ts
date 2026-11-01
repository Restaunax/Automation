/**
 * api-tax-math-v2.spec.ts — tax math v2 (RestauNax back-office audit W4:M2 +
 * H5, SALES_TAX.md → "Tax math v2"): combos taxed per component, "price
 * includes tax" items backed out, and the owner's switch that keeps every
 * customer charge unchanged until it is turned on (TC-1630..1636).
 *
 * No browser. A per-run throwaway restaurant (always fresh: this file flips
 * the restaurant's tax math), published and taking orders, with rates
 *   State    8.35% (default)
 *   Alcohol 10%
 * and items
 *   Pint   $7.00 — State, "price includes tax"
 *   Burger $9.00 — State
 *   Side   $3.00 — tax-free
 *   Beer   $6.00 — Alcohol
 *   Combo  $12.00 = Burger + Side + Beer
 * The numbers are the backend's shared server/POS parity fixtures
 * (restaunax-backend src/Service/pricing/__tests__/fixtures/
 * taxMathV2.fixtures.json): the pint is $7.00 with $0.54 tax inside
 * (off: $0.58 on top); the combo is $0.50 + $0.40 = $0.90 (off: $1.00 at the
 * default rate).
 *
 * Gating: fails (never skips) when ADMIN_EMAIL / ADMIN_PASSWORD are missing.
 * Serial; the switch is always put back off in afterAll.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsApi,
  createMenuGroupNamed,
  createMenuItemFull,
  setRestaurantPublishedApi,
  quoteOrderRaw,
  taxRaw,
  createDealApi,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  type LooseJson,
  type TabletDevice,
} from "../../../utils/apiHelper";
import { tabletPricePreview } from "../../../utils/promotionsApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);

test.describe.configure({ mode: "serial" });

test.describe("Tax math v2 — combos per component, tax-included prices (API)", () => {
  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let device: TabletDevice | undefined;
  let tabletToken = "";
  type Item = { id: string; name: string; price: number };
  const blank = (): Item => ({ id: "", name: "", price: 0 });
  const items = {
    Pint: blank(),
    Burger: blank(),
    Side: blank(),
    Beer: blank(),
  };
  let deal: { id: string; items: { id: string; menuItemId: string }[] } = {
    id: "",
    items: [],
  };

  const setTaxMath = (enabled: unknown) =>
    taxRaw<{ data?: Rec; message?: string }>(
      ownerToken,
      restaurantId,
      "PUT",
      "/tax-math",
      { enabled }
    );
  const menuItems = async () => {
    const menu = await taxRaw(ownerToken, restaurantId, "GET", "/menu");
    expect(menu.status, JSON.stringify(menu.data)).toBe(200);
    return list(menu.data.data).flatMap((m) =>
      list(m.groups).flatMap((g) => list(g.items))
    );
  };
  const comboQuote = () =>
    quoteOrderRaw(restaurantId, {
      orderDeals: [
        {
          dealId: deal.id,
          quantity: 1,
          items: deal.items.map((d) => ({
            dealItemId: d.id,
            menuItemId: d.menuItemId,
          })),
        },
      ],
    });

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    // Gating: a missing admin login is a failure, never a skip.
    expect(
      ADMIN_EMAIL && ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD must be set (the file mints its own tenant)"
    ).toBeTruthy();
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[api-tax-math-v2] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });

    const state = await taxRaw(ownerToken, restaurantId, "POST", "/rates", {
      name: "State",
      percent: 8.35,
      isDefault: true,
    });
    expect(state.status, JSON.stringify(state.data)).toBe(201);
    const alcohol = await taxRaw(ownerToken, restaurantId, "POST", "/rates", {
      name: "Alcohol",
      percent: 10,
    });
    expect(alcohol.status, JSON.stringify(alcohol.data)).toBe(201);
    const alcoholCode = String((alcohol.data.data as Rec).code);

    const groupId = (
      await createMenuGroupNamed(ownerToken, `Taproom ${runId}`, {
        restaurantId,
      })
    ).id;
    for (const [key, price] of [
      ["Pint", 7],
      ["Burger", 9],
      ["Side", 3],
      ["Beer", 6],
    ] as const) {
      const item = await createMenuItemFull(
        ownerToken,
        groupId,
        `${key} ${runId}`,
        price
      );
      items[key] = { id: item.id, name: item.name, price };
    }
    const assign = await taxRaw(ownerToken, restaurantId, "PUT", "/menu", {
      items: [
        { id: items.Pint.id, taxIncluded: true },
        { id: items.Side.id, taxExempt: true },
        { id: items.Beer.id, taxCode: alcoholCode },
      ],
    });
    expect(assign.status, JSON.stringify(assign.data)).toBe(200);

    const created = await createDealApi(
      ownerToken,
      restaurantId,
      `AUTO Taproom Combo ${runId}`,
      12,
      [items.Burger, items.Side, items.Beer]
    );
    deal = {
      id: created.id,
      items: (created.items ?? []).map((d) => ({
        id: d.id,
        menuItemId: String(d.menuItemId),
      })),
    };
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
  });

  test.afterAll(async () => {
    if (ownerToken && restaurantId) {
      // Always back off, whatever a test left behind.
      await setTaxMath(false).catch(() => {});
      if (device)
        await deactivateTabletDevice(ownerToken, restaurantId, device.id).catch(
          () => {}
        );
    }
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Sales tax & reports");
    await allure.label("severity", "critical");
  });

  test("TC-1630: the tax math switch — off by default, validated, and it turns back off", async () => {
    const get = await taxRaw<{ data?: Rec }>(
      ownerToken,
      restaurantId,
      "GET",
      "/tax-math"
    );
    expect(get.status, JSON.stringify(get.data)).toBe(200);
    const view = get.data.data as Rec;
    expect(view.enabled).toBe(false);
    expect(Array.isArray(view.devicesWithoutTaxMathV2)).toBe(true);
    expect(view.taxIncludedItems).toBe(1);
    expect("disclosure" in view).toBe(true);

    const bad = await setTaxMath("yes");
    expect(bad.status).toBe(400);

    try {
      const on = await setTaxMath(true);
      expect(on.status, JSON.stringify(on.data)).toBe(200);
      expect(on.data.data?.enabled).toBe(true);
    } finally {
      const off = await setTaxMath(false);
      expect(off.status).toBe(200);
      expect(off.data.data?.enabled).toBe(false);
    }
  });

  test('TC-1631: "price includes tax" round-trips on the menu; a save without it leaves it alone', async () => {
    const pint = () =>
      menuItems().then((m) => m.find((i) => i.id === items.Pint.id));
    expect((await pint())?.taxIncluded).toBe(true);

    // An older client's save (no taxIncluded) must not clear it.
    const older = await taxRaw(ownerToken, restaurantId, "PUT", "/menu", {
      items: [{ id: items.Pint.id, taxCode: null }],
    });
    expect(older.status, JSON.stringify(older.data)).toBe(200);
    expect((await pint())?.taxIncluded).toBe(true);

    try {
      const off = await taxRaw(ownerToken, restaurantId, "PUT", "/menu", {
        items: [{ id: items.Pint.id, taxIncluded: false }],
      });
      expect(off.status).toBe(200);
      expect((await pint())?.taxIncluded).toBe(false);
    } finally {
      await taxRaw(ownerToken, restaurantId, "PUT", "/menu", {
        items: [{ id: items.Pint.id, taxIncluded: true }],
      });
    }
    expect((await pint())?.taxIncluded).toBe(true);
  });

  test("TC-1632: switch off — the tax-included pint is still taxed on top ($7.00 + $0.58)", async () => {
    const q = await quoteOrderRaw(restaurantId, {
      orderItems: [{ menuItemId: items.Pint.id, quantity: 1 }],
    });
    expect(q.status, JSON.stringify(q.data)).toBe(200);
    expect(q.data.quote?.subtotal).toBe(7);
    expect(q.data.quote?.tax).toBe(0.58);
    expect(q.data.quote?.grandTotal).toBe(7.58);
    expect(
      (q.data.quote?.breakdown?.info ?? []).some(
        (l) => l.kind === "TAX_INCLUDED"
      )
    ).toBe(false);
  });

  test("TC-1633: switch off — the combo rides at the default rate ($1.00)", async () => {
    const q = await comboQuote();
    expect(q.status, JSON.stringify(q.data)).toBe(200);
    expect(q.data.quote?.subtotal).toBe(12);
    expect(q.data.quote?.tax).toBe(1);
  });

  test("TC-1634: switch on — the pint is $7.00 flat with $0.54 tax inside, disclosed", async () => {
    try {
      expect((await setTaxMath(true)).status).toBe(200);
      const q = await quoteOrderRaw(restaurantId, {
        orderItems: [{ menuItemId: items.Pint.id, quantity: 1 }],
      });
      expect(q.status, JSON.stringify(q.data)).toBe(200);
      expect(q.data.quote?.subtotal).toBe(7);
      expect(q.data.quote?.tax).toBe(0);
      expect(q.data.quote?.grandTotal).toBe(7);
      const info = (q.data.quote?.breakdown?.info ?? []).find(
        (l) => l.kind === "TAX_INCLUDED"
      );
      expect(info?.amount).toBe(0.54);
      const totals = q.data.quote?.breakdown?.totals ?? [];
      expect(totals.find((l) => l.kind === "TAX")).toBeUndefined();
      expect(totals.find((l) => l.kind === "TOTAL")?.amount).toBe(7);
    } finally {
      await setTaxMath(false);
    }
  });

  test("TC-1635: switch on — each combo component at its own rate ($0.50 + $0.40)", async () => {
    try {
      expect((await setTaxMath(true)).status).toBe(200);
      const q = await comboQuote();
      expect(q.status, JSON.stringify(q.data)).toBe(200);
      expect(q.data.quote?.subtotal).toBe(12);
      // $12 split 9:3:6 → State $6 (0.50), Side $2 tax-free, Beer $4 (0.40).
      expect(q.data.quote?.tax).toBe(0.9);
      expect(q.data.quote?.grandTotal).toBe(12.9);
    } finally {
      await setTaxMath(false);
    }
  });

  test("TC-1636: POS price preview — v2 numbers only for a build that sends supportsTaxMathV2", async () => {
    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Tax Math POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);
    const cart = { orderItems: [{ menuItemId: items.Pint.id, quantity: 1 }] };
    type Preview = { quote?: { subtotal?: number; tax?: number } };
    try {
      expect((await setTaxMath(true)).status).toBe(200);
      const older = await tabletPricePreview(tabletToken, null, cart);
      expect(older.status, JSON.stringify(older.body)).toBe(200);
      // An older build is previewed with the v1 rule it charges.
      expect((older.body as Preview).quote?.tax).toBe(0.58);

      const v2 = await tabletPricePreview(tabletToken, null, {
        ...cart,
        supportsTaxMathV2: true,
      });
      expect(v2.status, JSON.stringify(v2.body)).toBe(200);
      expect((v2.body as Preview).quote?.tax).toBe(0);
      expect((v2.body as Preview).quote?.subtotal).toBe(7);

      // The register shows up as still on a build without v2 until it sells
      // with supportsTaxMathV2 (the owner's rollout list).
      const view = await taxRaw<{ data?: Rec }>(
        ownerToken,
        restaurantId,
        "GET",
        "/tax-math"
      );
      expect(
        list(view.data.data?.devicesWithoutTaxMathV2).map((d) => d.id)
      ).toContain(device.id);
    } finally {
      await setTaxMath(false);
    }
  });
});
