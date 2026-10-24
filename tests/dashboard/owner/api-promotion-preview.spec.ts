/**
 * api-promotion-preview.spec.ts — "Try it as a customer" at the API level on
 * QA (TC-872 → TC-881, TC-888, TC-889).
 *
 * Runs on its OWN throwaway tenant (createSecondOwner, alwaysFresh), never the
 * seed restaurant: the 5-live-preview cap and the create rate limiter are per
 * restaurant / per identity, so this file can never evict
 * 26-promotion-preview's previews or spend its limiter budget. The tenant gets
 * a tax rate (/quote refuses without one) and a per-run
 * "Automation Menu Preview <id>" category with three AUTO items.
 *
 * Every test ends its own preview(s) in `finally` (at most two live at once —
 * TC-878); afterAll ends anything left as a backstop, hard-deletes the items,
 * deletes the category and archives the tenant. A preview never takes a deal
 * slot; TC-873 holds ONE real deal slot on the tenant (its own cap) for the
 * length of the test, deleted in finally.
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
  createDealApi,
  createMenuItemFull,
  createSecondOwner,
  deleteDealApi,
  deleteTestMenuGroup,
  deleteTestRestaurant,
  ensureTaxRate,
  getActiveDealsCountRaw,
  permanentlyDeleteMenuItemApi,
} from "../../../utils/apiHelper";
import {
  createRestaurantPreviewRaw,
  endPreviewRaw,
  getPreviewRaw,
  previewHeader,
  type PreviewCreated,
} from "../../../utils/previewApi";
import { listPromotions } from "../../../utils/promotionsApi";
import {
  generateRunId,
  LIMA_ORDERING_URL,
  readRestaurantId,
  readSharedState,
} from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const DAY = 24 * 60 * 60 * 1000;
const TOKEN_IN_URL = /\/preview\/([A-Za-z0-9_-]{43})$/;
const UNAVAILABLE_REASON =
  "Previews are switched off on this backend (503 PROMOTION_PREVIEW_UNAVAILABLE): set ORDERING_BASE_URL on QA, then re-run";

test.describe("Owner — Promotion preview (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_* credentials not set in .env (admin mints the throwaway tenant)"
  );
  test.describe.configure({ mode: "serial" });

  const runId = generateRunId();
  let adminToken = "";
  let token = "";
  let restaurantId = "";
  let groupId = "";
  let previewsUnavailable = false;
  const items: { id: string; name: string; price: number }[] = [];
  /** Every token ever minted — afterAll's backstop (DELETE is idempotent). */
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
      // A combo needs at least 2 items (backend comboNeedsTwoItems, guided
      // deal types): two Burgers, the shape the error message itself offers.
      items: [
        {
          menuItemId: item(0).id,
          quantity: 2,
          itemName: item(0).name,
          itemPrice: item(0).price,
          role: "INCLUDED",
        },
      ],
      ...extra,
    },
  });
  const open = async (
    body: Record<string, unknown>
  ): Promise<PreviewCreated> => {
    const res = await createRestaurantPreviewRaw(token, restaurantId, body);
    if (res.data.data?.token) opened.push(res.data.data.token);
    expect(res.status, JSON.stringify(res.data)).toBe(201);
    return res.data.data!;
  };
  /** The preview's own deal id, from its payload. */
  const previewDealId = async (previewToken: string): Promise<string> => {
    const res = await getPreviewRaw(previewToken);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return (res.data.data!.promotion as { id: string }).id;
  };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    // alwaysFresh: never OWNER2's persistent restaurant — this file seeds
    // items and previews onto the tenant and archives it afterwards.
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId)
      throw new Error(
        "[api-promotion-preview] could not mint the throwaway tenant restaurant"
      );
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;

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

    // /quote refuses restaurants without a tax rate.
    await ensureTaxRate(adminToken, restaurantId);
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
    if (!token) return;
    // Backstop only — each test ends its previews in finally. Previews first:
    // they reference the per-run items.
    for (const t of opened) await endPreviewRaw(t).catch(() => {});
    for (const row of items)
      await permanentlyDeleteMenuItemApi(adminToken, row.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(token, groupId).catch(() => {});
    // Admin DELETE archives the throwaway restaurant (never a hard delete).
    if (restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    test.skip(previewsUnavailable, UNAVAILABLE_REASON);
    await allure.label("feature", "Promotions");
    await allure.label("severity", "critical");
  });

  test("TC-872: creating a preview returns a one-hour lima URL", async () => {
    const created = await open(comboBody(`AUTO Preview Combo ${runId}`));
    try {
      expect(
        created.previewUrl.startsWith(`${LIMA_ORDERING_URL}/preview/`)
      ).toBe(true);
      expect(TOKEN_IN_URL.exec(created.previewUrl)?.[1]).toBe(created.token);
      const ttl = Date.parse(created.expiresAt) - Date.now();
      expect(ttl).toBeGreaterThan(55 * 60 * 1000);
      expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000);
    } finally {
      await endPreviewRaw(created.token);
    }
  });

  test("TC-873: a preview is never listed or counted", async () => {
    // One real ACTIVE deal on the tenant (its own cap, never the seed's), so
    // the count/list parity below is non-vacuous: 1 slot held, preview not.
    const real = await createDealApi(
      token,
      restaurantId,
      `AUTO Preview Real Combo ${runId}`,
      14,
      [
        { id: item(0).id, name: item(0).name, price: item(0).price },
        { id: item(1).id, name: item(1).name, price: item(1).price },
      ],
      {
        status: "ACTIVE",
        startDate: new Date(Date.now() - DAY).toISOString(),
        endDate: new Date(Date.now() + 30 * DAY).toISOString(),
      }
    );
    const name = `AUTO Preview Hidden ${runId}`;
    let created: PreviewCreated | undefined;
    try {
      created = await open(comboBody(name));
      const dealId = await previewDealId(created.token);
      expect(
        (await listPromotions(token, restaurantId)).some((r) => r.id === dealId)
      ).toBe(false);
      // While the preview is live: the cap counts exactly the real deal, the
      // real deal's row says it holds a slot (a missing field fails), and the
      // count equals the list's slot-holding DEAL rows.
      await expect(async () => {
        const [count, rows] = await Promise.all([
          getActiveDealsCountRaw(token, restaurantId),
          listPromotions(token, restaurantId),
        ]);
        expect(count.data.activeDealsCount).toBe(1);
        expect(rows.find((r) => r.id === real.id)?.holdsDealSlot).toBe(true);
        expect(count.data.activeDealsCount).toBe(
          rows.filter((r) => r.source === "DEAL" && r.holdsDealSlot).length
        );
      }).toPass({ timeout: 30_000 });
      const plain = await apiRequestRaw<{ deals: { name: string }[] }>(
        "GET",
        `/api/deals/restaurant/${restaurantId}/active`,
        undefined,
        undefined,
        { "X-Promotions-Version": "2" }
      );
      expect(plain.data.deals.some((d) => d.name === name)).toBe(false);
    } finally {
      if (created) await endPreviewRaw(created.token);
      await deleteDealApi(token, real.id);
    }
  });

  test("TC-874: /quote prices the preview deal with its header and refuses it without", async () => {
    const created = await open(comboBody(`AUTO Preview Quote ${runId}`));
    try {
      const dealId = await previewDealId(created.token);
      const body = {
        orderType: "PICKUP",
        items: [],
        deals: [
          {
            dealId,
            quantity: 1,
            // One selection per combo unit (two Burgers — see comboBody).
            selections: [
              { menuItemId: item(0).id },
              { menuItemId: item(0).id },
            ],
          },
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
    } finally {
      await endPreviewRaw(created.token);
    }
  });

  test("TC-875: the public deal list shows the preview first, only to its own tab, never cached", async ({
    request,
  }) => {
    const name = `AUTO Preview List ${runId}`;
    const created = await open(comboBody(name));
    try {
      const res = await request.get(
        `${BACKEND_URL}/api/deals/restaurant/${restaurantId}/active`,
        {
          headers: {
            "X-Promotions-Version": "2",
            ...previewHeader(created.token),
          },
        }
      );
      expect(res.status(), await res.text()).toBe(200);
      const body = (await res.json()) as {
        deals: { name: string; isPreview?: boolean }[];
      };
      expect(body.deals[0]).toMatchObject({ name, isPreview: true });
      expect(res.headers()["cache-control"]).toContain("no-store");
      expect(res.headers()["vary"]).toMatch(/X-Promotion-Preview/i);
    } finally {
      await endPreviewRaw(created.token);
    }
  });

  test("TC-876: the preview payload carries the banner text, resolved", async () => {
    const created = await open(
      comboBody(`AUTO Preview Banner ${runId}`, {
        applyMode: "CODE",
        code: `PV${Date.now().toString(36).toUpperCase()}`,
      })
    );
    try {
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
    } finally {
      await endPreviewRaw(created.token);
    }
  });

  test("TC-877: a preview tab can't place an order", async () => {
    const created = await open(comboBody(`AUTO Preview Order ${runId}`));
    try {
      const dealId = await previewDealId(created.token);
      const orderBody = {
        orderType: "PICKUP",
        orderItems: [],
        orderDeals: [
          {
            dealId,
            quantity: 1,
            dealPrice: 9.5,
            items: [{ menuItemId: item(0).id }, { menuItemId: item(0).id }],
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
    } finally {
      await endPreviewRaw(created.token);
    }
  });

  test("TC-878: pressing again replaces the previous preview", async () => {
    const first = await open(comboBody(`AUTO Preview First ${runId}`));
    let second: PreviewCreated | undefined;
    try {
      second = await open({
        ...comboBody(`AUTO Preview Second ${runId}`),
        replaces: first.token,
      });
      const ended = await getPreviewRaw(first.token);
      expect(ended.status).toBe(404);
      expect(ended.data.errorCode).toBe("PROMOTION_PREVIEW_ENDED");
    } finally {
      await endPreviewRaw(first.token);
      if (second) await endPreviewRaw(second.token);
    }
  });

  test("TC-879: a plain request after a preview request never contains the preview (cache leak)", async ({
    request,
  }) => {
    const name = `AUTO Preview Leak ${runId}`;
    const created = await open(comboBody(name));
    try {
      const withHeader = await request.get(
        `${BACKEND_URL}/api/deals/restaurant/${restaurantId}/active`,
        {
          headers: {
            "X-Promotions-Version": "2",
            ...previewHeader(created.token),
          },
        }
      );
      expect(withHeader.status(), await withHeader.text()).toBe(200);
      const plain = await request.get(
        `${BACKEND_URL}/api/deals/restaurant/${restaurantId}/active`,
        {
          headers: { "X-Promotions-Version": "2" },
        }
      );
      expect(plain.status(), await plain.text()).toBe(200);
      const body = (await plain.json()) as { deals: { name: string }[] };
      expect(body.deals.some((d) => d.name === name)).toBe(false);
      expect(plain.headers()["vary"]).toMatch(/X-Promotion-Preview/i);
    } finally {
      await endPreviewRaw(created.token);
    }
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
    try {
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
    } finally {
      await endPreviewRaw(created.token);
    }

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
    // Should the refusal regress and a preview be minted, end it at once.
    const minted = moneyOff.data.data?.token;
    if (minted) {
      opened.push(minted);
      await endPreviewRaw(minted);
    }
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
    try {
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
        (
          await apiRequestRaw(
            "GET",
            `/api/public/site?preview=${created.token}`
          )
        ).status
      ).toBe(200);
      expect((await endPreviewRaw(created.token)).status).toBe(200);
      expect(
        (
          await apiRequestRaw(
            "GET",
            `/api/public/site?preview=${created.token}`
          )
        ).status
      ).toBe(404);
      expect((await getPreviewRaw(created.token)).status).toBe(404);
    } finally {
      // Idempotent: a no-op when the body already ended it.
      await endPreviewRaw(created.token);
    }
  });

  test("TC-888: a preview token does nothing on another restaurant (the seed's list, quote and site)", async ({
    request,
  }) => {
    const seedId = readRestaurantId();
    expect(seedId, "seed restaurant id").toBeTruthy();
    expect(seedId).not.toBe(restaurantId);
    const name = `AUTO Preview Cross ${runId}`;
    const created = await open(comboBody(name));
    try {
      const dealId = await previewDealId(created.token);

      // (a) The seed's public deal list: no preview deal, not marked preview,
      // not no-store.
      const list = await request.get(
        `${BACKEND_URL}/api/deals/restaurant/${seedId}/active`,
        {
          headers: {
            "X-Promotions-Version": "2",
            ...previewHeader(created.token),
          },
        }
      );
      expect(list.status(), await list.text()).toBe(200);
      const listBody = (await list.json()) as {
        deals: { id: string; name: string; isPreview?: boolean }[];
      };
      expect(listBody.deals.some((d) => d.name === name)).toBe(false);
      expect(listBody.deals.some((d) => d.id === dealId)).toBe(false);
      expect(listBody.deals.some((d) => d.isPreview)).toBe(false);
      expect(list.headers()["cache-control"] ?? "").not.toContain("no-store");

      // (b) /quote on the seed prices a normal cart exactly like a request
      // without the header: the token belongs to another restaurant.
      const { menuItemId: seedItemId } = readSharedState();
      const quoteBody = {
        orderType: "PICKUP",
        items: [{ menuItemId: seedItemId, quantity: 1 }],
        deals: [],
      };
      const withHeader = await apiRequestRaw<{ quote: unknown }>(
        "POST",
        `/api/order/${seedId}/quote`,
        quoteBody,
        undefined,
        previewHeader(created.token)
      );
      const plain = await apiRequestRaw<{ quote: unknown }>(
        "POST",
        `/api/order/${seedId}/quote`,
        quoteBody
      );
      expect(withHeader.status, JSON.stringify(withHeader.data)).toBe(200);
      expect(plain.status, JSON.stringify(plain.data)).toBe(200);
      expect(withHeader.data.quote).toEqual(plain.data.quote);

      // (c) The site resolver answers with the token's own restaurant only.
      const site = await apiRequestRaw<{
        data?: { restaurantId?: string };
      }>("GET", `/api/public/site?preview=${created.token}`);
      expect(site.status, JSON.stringify(site.data)).toBe(200);
      expect(site.data.data?.restaurantId).toBe(restaurantId);
      expect(site.data.data?.restaurantId).not.toBe(seedId);
    } finally {
      await endPreviewRaw(created.token);
    }
  });

  test("TC-889: a preview tab can't book a reservation or pay a balance", async () => {
    const created = await open(comboBody(`AUTO Preview Stand-alone ${runId}`));
    try {
      // Invalid payloads on purpose: nothing real is created even if a
      // refusal were missing. The refusal must come first, as a 403.
      const reservation = await apiRequestRaw(
        "POST",
        `/api/public/restaurants/${restaurantId}/reservations`,
        {},
        undefined,
        previewHeader(created.token)
      );
      expect(reservation.status, JSON.stringify(reservation.data)).toBe(403);
      expect((reservation.data as { errorCode?: string }).errorCode).toBe(
        "PROMOTION_PREVIEW_NOT_ORDERABLE"
      );
      const payBalance = await apiRequestRaw(
        "POST",
        `/api/pay-balance/AUTO-NO-SUCH-ORDER/AUTO-NO-SUCH-TOKEN/payment-intent`,
        {},
        undefined,
        previewHeader(created.token)
      );
      expect(payBalance.status, JSON.stringify(payBalance.data)).toBe(403);
      expect((payBalance.data as { errorCode?: string }).errorCode).toBe(
        "PROMOTION_PREVIEW_NOT_ORDERABLE"
      );
    } finally {
      await endPreviewRaw(created.token);
    }
  });
});
