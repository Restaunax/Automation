/**
 * api-partner-api.spec.ts — the partner data API, B3 (TC-754..762).
 *
 * restaunax docs/features/back-office/PARTNER_API.md (#943). No browser. Two
 * throwaway restaurants (A and B, each with its own owner); no add-on — the
 * partner API is free by decision (Neaj, 2026-10-10), so the spec also proves
 * nothing here is gated. Restaurant A has a menu item and one seeded order
 * with a full customer contact, so the day, tax and order endpoints have
 * something to say and the "no customer PII" rule can be checked.
 *
 * Webhooks: the suite has no request-capture service, and the brief says not
 * to add a third-party bin. The webhook points at an unrouted path on QA's own
 * API (https, public address, answers 404), and the test reads the DELIVERY
 * LOG through the API: the attempt, the receiver's status and body, the retry
 * schedule, the event type. The signature itself can't be checked without a
 * receiver that echoes request headers (documented in BACK_OFFICE_COVERAGE).
 *
 * Every webhook and key is revoked before the tenant is deleted, so nothing
 * keeps retrying against QA. Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import { generateRunId, generateSeedPhone } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsApi,
  createMenuGroupNamed,
  createMenuItemFull,
  setRestaurantPublishedApi,
  createSeededOrder,
  currentBusinessDay,
  getRestaurantFeaturesRaw,
  partnerApiRaw,
  partnerAccessRaw,
  closeDayWebRaw,
  taxRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
/** A public https address that answers 404 — QA's own API, unrouted path. */
const RECEIVER = `${(process.env.BACKEND_URL ?? "https://api.qa.restaunax.com").replace(/\/$/, "")}/automation-partner-webhook-receiver`;
const SCOPES = [
  "sales.daily:read",
  "tax.daily:read",
  "orders:read",
  "payments:read",
  "payouts:read",
  "labor:read",
  "menu:read",
  "webhooks:manage",
];

test.describe.configure({ mode: "serial" });

test.describe("Partner data API — keys, location scope, webhooks (B3, API)", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenants"
  );

  const runId = generateRunId();
  let adminToken = "";
  const a = { owner: "", id: "", key: "", keyId: "", today: "" };
  const b = { owner: "", id: "", key: "", keyId: "" };
  let narrowKey = "";
  let narrowKeyId = "";
  let webhookId = "";
  const customer = {
    firstName: "Paloma",
    lastName: `Partner${runId.slice(-4)}`,
    email: `auto-partner-cust-${runId}@${DOMAIN}`,
    phone: generateSeedPhone(),
  };
  let receiptNumber = "";

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const ta = await createSecondOwner(adminToken, `${runId}a`);
    const tb = await createSecondOwner(adminToken, `${runId}b`);
    if (!ta.restaurantId || !tb.restaurantId)
      throw new Error("[api-partner-api] no tenant");
    a.owner = ta.accessToken;
    a.id = ta.restaurantId;
    b.owner = tb.accessToken;
    b.id = tb.restaurantId;

    await updateRestaurantSettingsApi(a.owner, a.id, { acceptingOrders: true });
    const rate = await taxRaw(a.owner, a.id, "POST", "/rates", {
      name: "State",
      percent: 8,
      isDefault: true,
    });
    if (rate.status !== 201)
      throw new Error(
        `[api-partner-api] tax rate: ${JSON.stringify(rate.data)}`
      );
    const group = await createMenuGroupNamed(a.owner, `Partner ${runId}`, {
      restaurantId: a.id,
    });
    const item = await createMenuItemFull(
      a.owner,
      group.id,
      `Partner Bowl ${runId}`,
      12
    );
    await setRestaurantPublishedApi(adminToken, a.id, true);
    const order = await createSeededOrder(
      a.owner,
      a.id,
      { menuItemId: item.id, name: item.name, price: 12 },
      {
        firstName: customer.firstName,
        lastName: customer.lastName,
        customerEmail: customer.email,
        customerPhone: customer.phone,
      }
    );
    receiptNumber = order.receiptNumber;
  });

  test.afterAll(async () => {
    for (const [t, id, keys] of [
      [a.owner, a.id, [a.keyId, narrowKeyId]],
      [b.owner, b.id, [b.keyId]],
    ] as const) {
      for (const k of keys) {
        if (t && id && k)
          // Best-effort: a key revoked by a test answers 404 here.
          await partnerAccessRaw(t, id, "DELETE", `/api-keys/${k}`).catch(
            () => {}
          );
      }
    }
    for (const id of [a.id, b.id]) {
      if (adminToken && id)
        await deleteTestRestaurant(adminToken, id).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Partner data API");
    await allure.label("severity", "critical");
  });

  test("TC-754: Connected apps loads with no add-on; its catalogue is resolved text; bad keys are refused", async () => {
    const features = await getRestaurantFeaturesRaw(a.owner, a.id);
    expect(features.data.data?.features ?? []).not.toContain("ACCOUNTING_SYNC");
    const access = await partnerAccessRaw(a.owner, a.id, "GET", "");
    expect(access.status, JSON.stringify(access.data)).toBe(200);
    const data = access.data.data as Rec;
    expect(data.partners).toEqual([]);
    expect(data.apiKeys).toEqual([]);
    expect(list(data.scopes).map((s) => s.scope)).toEqual(SCOPES);
    for (const s of list(data.scopes)) {
      // An API answers text, never an i18n key.
      expect(String(s.label)).not.toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
      expect(String(s.description).length).toBeGreaterThan(10);
    }
    expect(list(data.events).map((e) => e.event)).toEqual([
      "day.closed",
      "day.changed",
      "payout.paid",
    ]);
    expect(list(data.events)[0]?.label).toBe("A day is closed");

    const noName = await partnerAccessRaw(a.owner, a.id, "POST", "/api-keys", {
      name: " ",
      scopes: ["menu:read"],
    });
    expect(noName.status).toBe(400);
    expect(noName.data).toMatchObject({ error: "INVALID_REQUEST" });
    const badScope = await partnerAccessRaw(
      a.owner,
      a.id,
      "POST",
      "/api-keys",
      { name: "Bad", scopes: ["menu:read", "everything:write"] }
    );
    expect(badScope.status).toBe(400);
    expect(badScope.data).toMatchObject({ error: "INVALID_SCOPE" });
  });

  test("TC-755: the owner creates an API key — the key is shown once, never listed again", async () => {
    const created = await partnerAccessRaw(a.owner, a.id, "POST", "/api-keys", {
      name: `Zapier ${runId}`,
      scopes: SCOPES,
    });
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    const key = created.data.data as Rec;
    a.key = String(key.key);
    a.keyId = String(key.id);
    expect(a.key).toMatch(/^rnx_key_/);
    expect(String(key.keyPrefix)).toBe(`${a.key.slice(0, 12)}…`);
    expect(created.data.message).toMatch(/won't be shown again/i);

    const overview = await partnerAccessRaw(a.owner, a.id, "GET", "");
    const keys = list((overview.data.data as Rec).apiKeys);
    expect(keys.map((k) => k.id)).toEqual([a.keyId]);
    expect(JSON.stringify(overview.data)).not.toContain(a.key);

    // A narrower key (daily sales only) for the permission checks, and B's own.
    const narrow = await partnerAccessRaw(a.owner, a.id, "POST", "/api-keys", {
      name: `Sales only ${runId}`,
      scopes: ["sales.daily:read"],
    });
    expect(narrow.status).toBe(201);
    narrowKey = String((narrow.data.data as Rec).key);
    narrowKeyId = String((narrow.data.data as Rec).id);
    const other = await partnerAccessRaw(b.owner, b.id, "POST", "/api-keys", {
      name: `B ${runId}`,
      scopes: SCOPES,
    });
    expect(other.status).toBe(201);
    b.key = String((other.data.data as Rec).key);
    b.keyId = String((other.data.data as Rec).id);
  });

  test("TC-756: the key reads /me, its one location, the day, tax and orders — cents, no customer PII", async () => {
    const me = await partnerApiRaw(a.key, "GET", "/me");
    expect(me.status, JSON.stringify(me.data)).toBe(200);
    expect(me.data.data).toEqual({
      credential: "api_key",
      name: `Zapier ${runId}`,
      locationId: a.id,
      scopes: SCOPES,
      rateLimitPerMinute: 120,
    });

    const locations = await partnerApiRaw(a.key, "GET", "/locations");
    expect(list(locations.data.data).map((l) => l.id)).toEqual([a.id]);
    const loc = (await partnerApiRaw(a.key, "GET", `/locations/${a.id}`)).data
      .data as Rec;
    expect(loc).toMatchObject({ id: a.id, currency: "USD" });
    a.today = currentBusinessDay(
      String(loc.timezone),
      Number(loc.businessDayCutoffHour)
    );

    const days = await partnerApiRaw(
      a.key,
      "GET",
      `/locations/${a.id}/days?from=${a.today}&to=${a.today}`
    );
    expect(days.status, JSON.stringify(days.data)).toBe(200);
    const day = list(days.data.data)[0]!;
    expect(day).toMatchObject({
      locationId: a.id,
      businessDate: a.today,
      status: "OPEN",
      version: 0,
      currency: "USD",
      orderCount: 1,
    });
    // Cents everywhere: the $12.00 bowl is 1200.
    expect((day.sales as Rec).grossSales).toBe(1200);
    expect((day.journal as Rec).balanced).toBe(true);
    const one = await partnerApiRaw(
      a.key,
      "GET",
      `/locations/${a.id}/days/${a.today}`
    );
    expect(one.status).toBe(200);
    expect((one.data.data as Rec).orderCount).toBe(1);

    const tooLong = await partnerApiRaw(
      a.key,
      "GET",
      `/locations/${a.id}/days?from=2026-01-01&to=2026-03-01`
    );
    expect(tooLong.status).toBe(400);
    expect(tooLong.data).toMatchObject({ error: "INVALID_RANGE" });

    const tax = await partnerApiRaw(
      a.key,
      "GET",
      `/locations/${a.id}/tax?from=${a.today}&to=${a.today}`
    );
    expect(tax.status, JSON.stringify(tax.data)).toBe(200);

    const orders = await partnerApiRaw(
      a.key,
      "GET",
      `/locations/${a.id}/orders?from=${a.today}&to=${a.today}`
    );
    expect(orders.status, JSON.stringify(orders.data)).toBe(200);
    const rows = list(orders.data.data);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      receiptNumber,
      businessDate: a.today,
      subtotal: 1200,
      currency: "USD",
    });
    // No customer names, phones, emails, addresses or customer ids.
    const raw = JSON.stringify(rows);
    for (const pii of [
      customer.firstName,
      customer.lastName,
      customer.email,
      customer.phone,
    ]) {
      expect(raw, `partner order leaks ${pii}`).not.toContain(pii);
    }
    expect(Object.keys(rows[0]!)).not.toEqual(
      expect.arrayContaining(["customerId"])
    );
    const byId = await partnerApiRaw(
      a.key,
      "GET",
      `/locations/${a.id}/orders/${rows[0]!.id}`
    );
    expect(byId.status).toBe(200);
    expect((byId.data.data as Rec).receiptNumber).toBe(receiptNumber);

    for (const path of ["payments", "payouts", "labor"]) {
      const r = await partnerApiRaw(
        a.key,
        "GET",
        `/locations/${a.id}/${path}?from=${a.today}&to=${a.today}`
      );
      expect(r.status, `${path}: ${JSON.stringify(r.data)}`).toBe(200);
    }
    const menu = await partnerApiRaw(a.key, "GET", `/locations/${a.id}/menu`);
    expect(menu.status).toBe(200);
    expect(JSON.stringify(menu.data)).toContain(`Partner Bowl ${runId}`);
  });

  test("TC-757: another location's id answers 404 — on every endpoint, both ways", async () => {
    const paths = (id: string, date: string) => [
      `/locations/${id}`,
      `/locations/${id}/days?from=${date}&to=${date}`,
      `/locations/${id}/days/${date}`,
      `/locations/${id}/tax?from=${date}&to=${date}`,
      `/locations/${id}/orders?from=${date}&to=${date}`,
      `/locations/${id}/payments?from=${date}&to=${date}`,
      `/locations/${id}/payouts?from=${date}&to=${date}`,
      `/locations/${id}/labor?from=${date}&to=${date}`,
      `/locations/${id}/menu`,
    ];
    for (const [key, other] of [
      [a.key, b.id],
      [b.key, a.id],
    ] as const) {
      for (const p of paths(other, a.today)) {
        const r = await partnerApiRaw(key, "GET", p);
        expect(r.status, `${p} → ${JSON.stringify(r.data)}`).toBe(404);
        expect(r.data).toMatchObject({ error: "NOT_FOUND" });
      }
    }
    // 404, never 403: a made-up id reads exactly like a real one.
    const madeUp = await partnerApiRaw(
      a.key,
      "GET",
      "/locations/00000000-0000-4000-8000-000000000000"
    );
    expect(madeUp.status).toBe(404);
    expect(madeUp.data).toEqual(
      (await partnerApiRaw(a.key, "GET", `/locations/${b.id}`)).data
    );
  });

  test("TC-758: a permission the key wasn't given answers 403 with the scope in words", async () => {
    const ok = await partnerApiRaw(
      narrowKey,
      "GET",
      `/locations/${a.id}/days?from=${a.today}&to=${a.today}`
    );
    expect(ok.status).toBe(200);
    for (const [path, scope] of [
      [`tax?from=${a.today}&to=${a.today}`, "tax.daily:read"],
      [`orders?from=${a.today}&to=${a.today}`, "orders:read"],
      [`payments?from=${a.today}&to=${a.today}`, "payments:read"],
      [`payouts?from=${a.today}&to=${a.today}`, "payouts:read"],
      [`labor?from=${a.today}&to=${a.today}`, "labor:read"],
      ["menu", "menu:read"],
    ]) {
      const r = await partnerApiRaw(
        narrowKey,
        "GET",
        `/locations/${a.id}/${path}`
      );
      expect(r.status, path).toBe(403);
      expect(r.data).toMatchObject({ error: "INSUFFICIENT_SCOPE" });
      expect(String((r.data as Rec)?.message)).toContain(scope);
    }
    const hooks = await partnerApiRaw(narrowKey, "GET", "/webhooks");
    expect(hooks.status).toBe(403);
    // A missing scope is not an authentication failure: the key still works.
    expect((await partnerApiRaw(narrowKey, "GET", "/me")).status).toBe(200);
  });

  test("TC-759: register a webhook — https and public only, events need their scope, secret shown once", async () => {
    for (const url of [
      "http://example.com/hook",
      "https://127.0.0.1/hook",
      "https://user:pass@example.com/hook",
      "not a url",
    ]) {
      const r = await partnerApiRaw(a.key, "POST", "/webhooks", {
        url,
        events: ["day.closed"],
      });
      expect(r.status, url).toBe(400);
      expect(r.data).toMatchObject({ error: "INVALID_URL" });
    }
    const badEvent = await partnerApiRaw(a.key, "POST", "/webhooks", {
      url: RECEIVER,
      events: ["order.created"],
    });
    expect(badEvent.status).toBe(400);
    expect(badEvent.data).toMatchObject({ error: "INVALID_EVENTS" });
    // A sales-only key can't subscribe to deposits (needs payouts:read).
    const owner = await partnerAccessRaw(a.owner, a.id, "POST", "/webhooks", {
      apiKeyId: narrowKeyId,
      url: RECEIVER,
      events: ["payout.paid"],
    });
    expect(owner.status).toBe(403);
    expect(owner.data).toMatchObject({ error: "INSUFFICIENT_SCOPE" });

    const created = await partnerApiRaw(a.key, "POST", "/webhooks", {
      url: RECEIVER,
      events: ["day.closed", "day.changed"],
    });
    expect(created.status, JSON.stringify(created.data)).toBe(201);
    const hook = created.data.data as Rec;
    webhookId = String(hook.id);
    expect(String(hook.secret)).toMatch(/^whsec_/);
    expect(hook).toMatchObject({
      url: RECEIVER,
      events: ["day.closed", "day.changed"],
      status: "ACTIVE",
      apiKeyId: a.keyId,
    });
    const listed = await partnerApiRaw(a.key, "GET", "/webhooks");
    expect(list(listed.data.data).map((w) => w.id)).toEqual([webhookId]);
    expect(JSON.stringify(listed.data)).not.toContain(String(hook.secret));
    // The owner sees it under the key, without the secret.
    const overview = await partnerAccessRaw(a.owner, a.id, "GET", "");
    const k = list((overview.data.data as Rec).apiKeys).find(
      (x) => x.id === a.keyId
    );
    expect(list(k?.webhooks).map((w) => w.id)).toEqual([webhookId]);
    expect(JSON.stringify(overview.data)).not.toContain(String(hook.secret));
  });

  test("TC-760: deliveries — a test event and a closed day reach the receiver; the log shows each attempt and the retry", async () => {
    test.setTimeout(150_000);
    const sent = await partnerApiRaw(
      a.key,
      "POST",
      `/webhooks/${webhookId}/test`
    );
    expect(sent.status, JSON.stringify(sent.data)).toBe(202);
    const deliveries = async (): Promise<Rec[]> =>
      list(
        (await partnerApiRaw(a.key, "GET", `/webhooks/${webhookId}/deliveries`))
          .data.data
      );
    await expect
      .poll(
        async () =>
          (await deliveries()).find((d) => d.eventType === "webhook.test")
            ?.attempts,
        { timeout: 60_000 }
      )
      .toBeGreaterThanOrEqual(1);
    const test1 = (await deliveries()).find(
      (d) => d.eventType === "webhook.test"
    )!;
    // The receiver's answer is logged; a non-2xx is retried after 1 minute.
    expect(test1).toMatchObject({ status: "PENDING", responseStatus: 404 });
    expect(String(test1.responseBody)).toContain(
      "automation-partner-webhook-receiver"
    );
    const gap =
      Date.parse(String(test1.nextAttemptAt)) -
      Date.parse(String(test1.lastAttemptAt));
    expect(gap).toBeGreaterThanOrEqual(55_000);
    expect(gap).toBeLessThanOrEqual(65_000);

    // Closing the day emits day.closed; the partner API shows it CLOSED v1.
    const closed = await closeDayWebRaw(a.owner, a.id);
    expect(closed.status, JSON.stringify(closed.data)).toBe(201);
    await expect
      .poll(
        async () =>
          (await deliveries()).find((d) => d.eventType === "day.closed")
            ?.attempts ?? 0,
        { timeout: 60_000 }
      )
      .toBeGreaterThanOrEqual(1);
    const day = await partnerApiRaw(
      a.key,
      "GET",
      `/locations/${a.id}/days/${a.today}`
    );
    expect(day.data.data).toMatchObject({ status: "CLOSED", version: 1 });

    // The owner's view of the same log.
    const ownerLog = await partnerAccessRaw(
      a.owner,
      a.id,
      "GET",
      `/webhooks/${webhookId}/deliveries`
    );
    expect(ownerLog.status).toBe(200);
    expect(
      list(ownerLog.data.data)
        .map((d) => d.eventType)
        .sort()
    ).toEqual(["day.closed", "webhook.test"]);

    // The audit log names route patterns, never ids or the key.
    const audit = await partnerAccessRaw(
      a.owner,
      a.id,
      "GET",
      `/audit?apiKeyId=${a.keyId}`
    );
    expect(audit.status).toBe(200);
    const entries = list(audit.data.data);
    expect(entries.map((e) => e.action)).toEqual(
      expect.arrayContaining(["API_CALL", "WEBHOOK_CREATED", "KEY_CREATED"])
    );
    expect(entries.map((e) => e.route)).toContain(
      "/partner/v1/locations/:locationId/days"
    );
    const auditRaw = JSON.stringify(entries);
    expect(auditRaw).not.toContain(a.key);
    expect(auditRaw).not.toContain(b.id);
  });

  test("TC-761: platform staff can view and revoke but never mint a key; another owner can't even look", async () => {
    const view = await partnerAccessRaw(adminToken, a.id, "GET", "");
    expect(view.status).toBe(200);
    const mint = await partnerAccessRaw(adminToken, a.id, "POST", "/api-keys", {
      name: "HQ",
      scopes: ["menu:read"],
    });
    expect(mint.status).toBe(403);
    expect(mint.data).toMatchObject({ error: "NOT_ALLOWED" });
    const stranger = await partnerAccessRaw(b.owner, a.id, "GET", "");
    expect(stranger.status).toBe(403);
    const strangerKey = await partnerAccessRaw(
      b.owner,
      a.id,
      "POST",
      "/api-keys",
      { name: "Steal", scopes: ["orders:read"] }
    );
    expect(strangerKey.status).toBe(403);
    // Staff revoke the narrow key: it stops at once.
    const revoked = await partnerAccessRaw(
      adminToken,
      a.id,
      "DELETE",
      `/api-keys/${narrowKeyId}`
    );
    expect(revoked.status).toBe(200);
    expect((await partnerApiRaw(narrowKey, "GET", "/me")).status).toBe(401);
    narrowKeyId = "";
  });

  test("TC-762: the owner revokes a key — 401 on the next call, its webhook and waiting deliveries stop", async () => {
    const revoked = await partnerAccessRaw(
      a.owner,
      a.id,
      "DELETE",
      `/api-keys/${a.keyId}`
    );
    expect(revoked.status, JSON.stringify(revoked.data)).toBe(200);
    expect(revoked.data.message).toMatch(/stopped working right away/i);
    for (const path of ["/me", `/locations/${a.id}/menu`, "/webhooks"]) {
      const r = await partnerApiRaw(a.key, "GET", path);
      expect(r.status, path).toBe(401);
      expect(r.data).toMatchObject({ error: "UNAUTHENTICATED" });
    }
    const overview = await partnerAccessRaw(a.owner, a.id, "GET", "");
    expect(list((overview.data.data as Rec).apiKeys)).toEqual([]);
    // Its webhook went with it; nothing waits to be sent.
    const log = await partnerAccessRaw(
      a.owner,
      a.id,
      "GET",
      `/webhooks/${webhookId}/deliveries`
    );
    if (log.status === 200) {
      expect(list(log.data.data).filter((d) => d.status === "PENDING")).toEqual(
        []
      );
    } else {
      expect(log.status).toBe(404);
    }
    // Revoking again: the key is gone.
    const again = await partnerAccessRaw(
      a.owner,
      a.id,
      "DELETE",
      `/api-keys/${a.keyId}`
    );
    expect(again.status).toBe(404);
    a.keyId = "";
  });
});
