/**
 * api-promotion-preview.spec.ts — "Try it as a customer" at the API level on
 * QA (TC-872 → TC-881). Own data on the seed restaurant: a per-run
 * "Automation Menu Preview <id>" category with three items; every preview is
 * ended in afterAll (they also expire within the hour) and the category is
 * deleted. A preview never takes a deal slot, so no cap wait is needed.
 *
 * The backend refuses to mint previews (503 PROMOTION_PREVIEW_UNAVAILABLE)
 * while its ORDERING_BASE_URL is unset; the whole file then skips with that
 * reason instead of failing — any other answer runs the tests as written.
 * Nightly lane (no @smoke).
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  apiLogin,
  apiRequestRaw,
  BACKEND_URL,
  createMenuGroupNamed,
  createMenuItemFull,
  deleteMenuGroupRaw,
  deleteMenuItemRaw,
  getActiveDealsCountRaw,
} from "../../../utils/apiHelper";
import {
  createRestaurantPreviewRaw,
  endPreviewRaw,
  getPreviewRaw,
  previewHeader,
} from "../../../utils/previewApi";
import { listPromotions } from "../../../utils/promotionsApi";
import {
  generateRunId,
  LIMA_ORDERING_URL,
  readSharedState,
} from "../../../utils/testData";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const DAY = 24 * 60 * 60 * 1000;
const TOKEN_IN_URL = /\/preview\/([A-Za-z0-9_-]{43})$/;
const UNAVAILABLE_REASON =
  "Previews are switched off on this backend (503 PROMOTION_PREVIEW_UNAVAILABLE): set ORDERING_BASE_URL on QA, then re-run";

test.describe("Owner — Promotion preview (API)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  let token = "";
  let restaurantId = "";
  let groupId = "";
  let previewsUnavailable = false;
  const items: { id: string; name: string; price: number }[] = [];
  const opened: string[] = [];
  /** The per-run item at `i` (Burger $12, Cookie $4, Soda $2); throws if beforeAll did not seed it. */
  const item = (i: number) => {
    const found = items[i];
    if (!found) throw new Error(`per-run menu item ${i} was not seeded`);
    return found;
  };

  const comboBody = (name: string, extra: Record<string, unknown> = {}) => ({
    source: "DEAL",
    body: {
      name,
      dealPrice: 9.5,
      items: [
        {
          menuItemId: item(0).id,
          quantity: 1,
          itemName: item(0).name,
          itemPrice: item(0).price,
          role: "INCLUDED",
        },
      ],
      ...extra,
    },
  });
  const open = async (body: Record<string, unknown>) => {
    const res = await createRestaurantPreviewRaw(token, restaurantId, body);
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    const created = res.data.data!;
    opened.push(created.token);
    return created;
  };

  test.beforeAll(async () => {
    ({ restaurantId } = readSharedState());
    ({ accessToken: token } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD));

    // Availability probe — an empty body. The backend answers 503 before it
    // validates anything when previews are off; otherwise it is a 400 and
    // nothing is created.
    const probe = await createRestaurantPreviewRaw(token, restaurantId, {});
    if (
      probe.status === 503 &&
      probe.data.errorCode === "PROMOTION_PREVIEW_UNAVAILABLE"
    ) {
      previewsUnavailable = true;
      return;
    }

    groupId = (
      await createMenuGroupNamed(token, `Automation Menu Preview ${runId}`, {
        restaurantId,
      })
    ).id;
    for (const [label, price] of [
      ["Burger", 12],
      ["Cookie", 4],
      ["Soda", 2],
    ] as const) {
      const name = `AUTO Preview ${label} ${runId}`;
      const seeded = await createMenuItemFull(token, groupId, name, price);
      items.push({ id: seeded.id, name, price });
    }
  });

  test.afterAll(async () => {
    // Previews first: they reference the per-run items.
    for (const t of opened) await endPreviewRaw(t);
    for (const row of items) await deleteMenuItemRaw(token, row.id);
    if (groupId) await deleteMenuGroupRaw(token, groupId);
  });

  test.beforeEach(async () => {
    test.skip(previewsUnavailable, UNAVAILABLE_REASON);
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
  });

  test("TC-872: creating a preview returns a one-hour lima URL", async () => {
    const created = await open(comboBody(`AUTO Preview Combo ${runId}`));
    expect(created.previewUrl.startsWith(`${LIMA_ORDERING_URL}/preview/`)).toBe(
      true
    );
    expect(TOKEN_IN_URL.exec(created.previewUrl)?.[1]).toBe(created.token);
    const ttl = Date.parse(created.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(55 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  test("TC-873: a preview is never listed or counted", async () => {
    const before = (await getActiveDealsCountRaw(token, restaurantId)).data
      .activeDealsCount;
    const name = `AUTO Preview Hidden ${runId}`;
    await open(comboBody(name));
    expect(
      (await listPromotions(token, restaurantId)).some((r) => r.name === name)
    ).toBe(false);
    expect(
      (await getActiveDealsCountRaw(token, restaurantId)).data.activeDealsCount
    ).toBe(before);
    const plain = await apiRequestRaw<{ deals: { name: string }[] }>(
      "GET",
      `/api/deals/restaurant/${restaurantId}/active`,
      undefined,
      undefined,
      { "X-Promotions-Version": "2" }
    );
    expect(plain.data.deals.some((d) => d.name === name)).toBe(false);
  });

  test("TC-874: /quote prices the preview deal with its header and refuses it without", async () => {
    const created = await open(comboBody(`AUTO Preview Quote ${runId}`));
    const preview = await getPreviewRaw(created.token);
    const dealId = (preview.data.data!.promotion as { id: string }).id;
    const body = {
      orderType: "PICKUP",
      items: [],
      deals: [
        { dealId, quantity: 1, selections: [{ menuItemId: item(0).id }] },
      ],
    };
    const withHeader = await apiRequestRaw<{
      quote: { deals: { dealId: string; dealPrice: number }[] };
    }>(
      "POST",
      `/api/order/${restaurantId}/quote`,
      body,
      undefined,
      previewHeader(created.token)
    );
    expect(withHeader.status, JSON.stringify(withHeader.data)).toBe(200);
    expect(withHeader.data.quote.deals[0]).toMatchObject({
      dealId,
      dealPrice: 9.5,
    });
    const without = await apiRequestRaw(
      "POST",
      `/api/order/${restaurantId}/quote`,
      body
    );
    expect(without.status).toBe(400);
  });

  test("TC-875: the public deal list shows the preview first, only to its own tab, never cached", async ({
    request,
  }) => {
    const name = `AUTO Preview List ${runId}`;
    const created = await open(comboBody(name));
    const res = await request.get(
      `${BACKEND_URL}/api/deals/restaurant/${restaurantId}/active`,
      {
        headers: {
          "X-Promotions-Version": "2",
          ...previewHeader(created.token),
        },
      }
    );
    const body = (await res.json()) as {
      deals: { name: string; isPreview?: boolean }[];
    };
    expect(body.deals[0]).toMatchObject({ name, isPreview: true });
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(res.headers()["vary"]).toMatch(/X-Promotion-Preview/i);
  });

  test("TC-876: the preview payload carries the banner text, resolved", async () => {
    const created = await open(
      comboBody(`AUTO Preview Banner ${runId}`, {
        applyMode: "CODE",
        code: `PV${Date.now().toString(36).toUpperCase()}`,
      })
    );
    const res = await getPreviewRaw(created.token);
    expect(res.status).toBe(200);
    const data = res.data.data as {
      kind: string;
      suspendedRules: string[];
      notes: string[];
      subtitle: string | null;
    };
    expect(data.kind).toBe("DEAL");
    expect(
      data.suspendedRules.some((r) =>
        r.startsWith("Customers will need the code")
      )
    ).toBe(true);
    expect(data.notes).toHaveLength(2);
    expect(data.subtitle).toBeNull();
  });

  test("TC-877: a preview tab can't place an order", async () => {
    const created = await open(comboBody(`AUTO Preview Order ${runId}`));
    const dealId = (
      (await getPreviewRaw(created.token)).data.data!.promotion as {
        id: string;
      }
    ).id;
    const orderBody = {
      orderType: "PICKUP",
      orderItems: [],
      orderDeals: [
        {
          dealId,
          quantity: 1,
          dealPrice: 9.5,
          items: [{ menuItemId: item(0).id }],
        },
      ],
    };
    const refused = await apiRequestRaw<{ errorCode?: string }>(
      "POST",
      `/api/order/new/restaurantId/${restaurantId}`,
      orderBody,
      undefined,
      previewHeader(created.token)
    );
    expect(refused.status).toBe(403);
    expect(refused.data.errorCode).toBe("PROMOTION_PREVIEW_NOT_ORDERABLE");
    const direct = await apiRequestRaw(
      "POST",
      `/api/order/new/restaurantId/${restaurantId}`,
      orderBody
    );
    expect(direct.ok, JSON.stringify(direct.data)).toBe(false);
  });

  test("TC-878: pressing again replaces the previous preview", async () => {
    const first = await open(comboBody(`AUTO Preview First ${runId}`));
    await open({
      ...comboBody(`AUTO Preview Second ${runId}`),
      replaces: first.token,
    });
    const ended = await getPreviewRaw(first.token);
    expect(ended.status).toBe(404);
    expect(ended.data.errorCode).toBe("PROMOTION_PREVIEW_ENDED");
  });

  test("TC-879: a plain request after a preview request never contains the preview (cache leak)", async ({
    request,
  }) => {
    const name = `AUTO Preview Leak ${runId}`;
    const created = await open(comboBody(name));
    await request.get(
      `${BACKEND_URL}/api/deals/restaurant/${restaurantId}/active`,
      {
        headers: {
          "X-Promotions-Version": "2",
          ...previewHeader(created.token),
        },
      }
    );
    const plain = await request.get(
      `${BACKEND_URL}/api/deals/restaurant/${restaurantId}/active`,
      {
        headers: { "X-Promotions-Version": "2" },
      }
    );
    const body = (await plain.json()) as { deals: { name: string }[] };
    expect(body.deals.some((d) => d.name === name)).toBe(false);
    expect(plain.headers()["vary"]).toMatch(/X-Promotion-Preview/i);
  });

  test("TC-880: an ITEM_SALE preview shows its sale price only with the header; money off is refused", async () => {
    const start = new Date(Date.now() - DAY).toISOString();
    const end = new Date(Date.now() + 30 * DAY).toISOString();
    const created = await open({
      source: "COUPON",
      body: {
        type: "ITEM_SALE",
        saleKind: "PERCENT_OFF",
        value: 50,
        applyMode: "AUTOMATIC",
        description: `AUTO Preview Sale ${runId}`,
        scopeItemIds: [item(0).id],
        startDate: start,
        endDate: end,
      },
    });
    const path = `/api/order/itemId/${item(0).id}?restaurantId=${restaurantId}`;
    const withHeader = await apiRequestRaw<{
      item: { promotion: { salePrice: number } | null };
    }>("GET", path, undefined, undefined, previewHeader(created.token));
    expect(withHeader.data.item.promotion?.salePrice).toBe(6);
    const plain = await apiRequestRaw<{ item: { promotion: unknown } }>(
      "GET",
      path
    );
    expect(plain.data.item.promotion).toBeNull();

    const moneyOff = await createRestaurantPreviewRaw(token, restaurantId, {
      source: "COUPON",
      body: {
        type: "PERCENTAGE",
        value: 10,
        applyMode: "AUTOMATIC",
        startDate: start,
        endDate: end,
      },
    });
    // Guard the cleanup in case the refusal regresses and a preview is minted.
    if (moneyOff.data.data?.token) opened.push(moneyOff.data.data.token);
    expect(moneyOff.status).toBe(400);
    expect(moneyOff.data.errorCode).toBe("PROMOTION_PREVIEW_UNSUPPORTED");
  });

  test("TC-881: a FREE_ITEM preview offers its gift at checkout; ending it ends the tenant too", async () => {
    const start = new Date(Date.now() - DAY).toISOString();
    const end = new Date(Date.now() + 30 * DAY).toISOString();
    const created = await open({
      source: "COUPON",
      body: {
        type: "FREE_ITEM",
        applyMode: "AUTOMATIC",
        description: `AUTO Preview Gift ${runId}`,
        giftMenuItemId: item(1).id,
        triggerKind: "BUY_ITEM",
        triggerMenuItemId: item(0).id,
        startDate: start,
        endDate: end,
      },
    });
    const quote = await apiRequestRaw<{
      quote: { freeItemOffer: { menuItemId: string } | null };
    }>(
      "POST",
      `/api/order/${restaurantId}/quote`,
      {
        orderType: "PICKUP",
        items: [{ menuItemId: item(0).id, quantity: 1 }],
        deals: [],
      },
      undefined,
      previewHeader(created.token)
    );
    expect(quote.data.quote.freeItemOffer?.menuItemId).toBe(item(1).id);

    expect(
      (await apiRequestRaw("GET", `/api/public/site?preview=${created.token}`))
        .status
    ).toBe(200);
    expect((await endPreviewRaw(created.token)).status).toBe(200);
    expect(
      (await apiRequestRaw("GET", `/api/public/site?preview=${created.token}`))
        .status
    ).toBe(404);
    expect((await getPreviewRaw(created.token)).status).toBe(404);
  });
});
