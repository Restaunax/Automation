/**
 * api-tax-depth.spec.ts — RestauNax back-office audit Stage 7, tax depth
 * (TC-1600..1611): scheduled rate changes and the rate check (W4:H2), the HQ
 * rate review, filing classes (M3), calendar-date periods (M5), exemption
 * certificates incl. the POS list (M4), the card-surcharge rule (M9) and the
 * DAVO feed through the partner API (H3). The year-end additions (L5) are
 * TC-767 / TC-1612 in api-books-taxes.
 *
 * restaunax docs/features/back-office/SALES_TAX.md (Rate changes, Filing
 * classes, Filing periods, Exemption certificates, Card surcharge) and
 * PARTNER_API.md → "Sales tax feed (DAVO)". The midnight switch-over itself
 * (first order after local midnight priced at the new rate) needs a clock QA
 * doesn't have: restaunax `taxDepth.int.test.ts` proves it.
 *
 * No browser. One throwaway restaurant (NY), default rate 8%. Gated by
 * `RELEASED_ON_QA.taxDepthStage7` until the change is on QA. Serial.
 * Tag: @tax-depth.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import {
  probeTaxDepthStage7,
  requireRelease,
} from "../../../utils/releaseGate";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  BACKEND_URL,
  createSecondOwner,
  createSeededOrder,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  deactivateTabletDevice,
  deleteTestRestaurant,
  partnerAccessRaw,
  partnerApiRaw,
  tabletLogin,
  taxRaw,
  updateRestaurantSettingsApi,
  type LooseJson,
} from "../../../utils/apiHelper";

const TZ = "America/New_York";
type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const localDay = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(Date.now() + offsetDays * 86_400_000)
  );
const lines = (body: unknown) =>
  String(body)
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
/** No API text may be an i18n key (CLAUDE.md: responses carry text). */
const notAKey = (s: unknown) => expect(String(s)).not.toMatch(/^(api|error):/);

test.describe.configure({ mode: "serial" });

test.describe("Sales tax depth — rates, classes, periods, certificates, DAVO feed (API) @tax-depth", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenant and reads the HQ rate review"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let defaultRateId = "";
  let beerRateId = "";
  let changeId = "";
  let certificateId = "";
  let orderId = "";
  let tabletId = "";
  const keyIds: string[] = [];
  const today = localDay(0);

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    adminToken = (
      await apiLogin(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)
    ).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[api-tax-depth] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });
    const rate = await taxRaw(ownerToken, restaurantId, "POST", "/rates", {
      name: "Sales tax",
      percent: 8,
      isDefault: true,
    });
    if (rate.status !== 201)
      throw new Error(`[api-tax-depth] rate: ${JSON.stringify(rate.data)}`);
    defaultRateId = String((rate.data.data as Rec).id);
    const group = await createMenuGroupNamed(ownerToken, `Depth ${runId}`, {
      restaurantId,
    });
    const item = await createMenuItemFull(
      ownerToken,
      group.id,
      `Depth Bowl ${runId}`,
      20
    );
    const order = await createSeededOrder(
      ownerToken,
      restaurantId,
      { menuItemId: item.id, name: item.name, price: 20 },
      { tax: 1.6 }
    );
    orderId = order.id;
  });

  test.afterAll(async () => {
    for (const k of keyIds)
      await partnerAccessRaw(
        ownerToken,
        restaurantId,
        "DELETE",
        `/api-keys/${k}`
      ).catch(() => {});
    if (tabletId)
      await deactivateTabletDevice(ownerToken, restaurantId, tabletId);
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Sales tax depth");
    await allure.label("severity", "critical");
    requireRelease(
      "taxDepthStage7",
      await probeTaxDepthStage7(ownerToken, restaurantId)
    );
  });

  test("TC-1600: the rate check — default rate, reference, review window and warnings as text; confirming records the date", async () => {
    const check = await taxRaw(ownerToken, restaurantId, "GET", "/rate-check");
    expect(check.status).toBe(200);
    const data = check.data.data as Rec;
    expect(data.defaultRate).toMatchObject({ percent: 8, confirmedAt: null });
    expect(data).toHaveProperty("reference");
    expect(data).toHaveProperty("review");
    for (const w of list(data.warnings)) {
      expect(typeof w.code).toBe("string");
      notAKey(w.text);
    }
    const confirm = await taxRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/rates/confirm"
    );
    expect(confirm.status).toBe(200);
    notAKey(confirm.data.message);
    const after = (confirm.data.data as Rec).check as Rec;
    expect((after.defaultRate as Rec).confirmedAt).toBeTruthy();
    expect((after.review as Rec).due).toBe(false);
  });

  test("TC-1601: schedule a rate for a later date — a past date or today is refused; the change is listed, not applied", async () => {
    for (const effectiveDate of [today, localDay(-3), "not-a-date"]) {
      const bad = await taxRaw(
        ownerToken,
        restaurantId,
        "POST",
        `/rates/${defaultRateId}/changes`,
        { percent: 8.5, effectiveDate }
      );
      expect(bad.status, effectiveDate).toBe(400);
      notAKey(bad.data.message ?? (bad.data as Rec).error);
    }
    const later = localDay(45);
    const res = await taxRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/rates/${defaultRateId}/changes`,
      { percent: 8.5, effectiveDate: later }
    );
    expect(res.status).toBe(201);
    expect(res.data.message).toContain("8.5");
    changeId = String((res.data.data as Rec).id);
    const changes = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/rate-changes"
    );
    expect(changes.status).toBe(200);
    const pending = list((changes.data.data as Rec).pending);
    expect(pending).toEqual([
      expect.objectContaining({
        id: changeId,
        percent: 8.5,
        effectiveDate: later,
        currentPercent: 8,
      }),
    ]);
    // Not in force yet: the rate still charges 8%.
    const rates = await taxRaw(ownerToken, restaurantId, "GET", "/rates");
    expect(
      list(rates.data.data).find((r) => r.id === defaultRateId)?.percent
    ).toBe(8);
  });

  test("TC-1602: cancel a scheduled change — gone from pending; cancelling it again is 404", async () => {
    const del = await taxRaw(
      ownerToken,
      restaurantId,
      "DELETE",
      `/rate-changes/${changeId}`
    );
    expect(del.status).toBe(200);
    notAKey(del.data.message);
    const changes = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/rate-changes"
    );
    expect(list((changes.data.data as Rec).pending)).toEqual([]);
    const again = await taxRaw(
      ownerToken,
      restaurantId,
      "DELETE",
      `/rate-changes/${changeId}`
    );
    expect(again.status).toBe(404);
  });

  test("TC-1603: filing classes — a rate takes a short class code (011 / 017), anything else is refused; the class list answers for every state", async () => {
    const beer = await taxRaw(ownerToken, restaurantId, "POST", "/rates", {
      name: "Packaged beer",
      percent: 8,
      filingClass: "017",
    });
    expect(beer.status).toBe(201);
    beerRateId = String((beer.data.data as Rec).id);
    expect((beer.data.data as Rec).filingClass).toBe("017");
    const set = await taxRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/rates/${defaultRateId}`,
      { filingClass: "011" }
    );
    expect(set.status).toBe(200);
    expect((set.data.data as Rec).filingClass).toBe("011");
    const bad = await taxRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/rates/${defaultRateId}`,
      { filingClass: "eleven point one" }
    );
    expect(bad.status).toBe(400);
    notAKey(bad.data.message ?? (bad.data as Rec).error);
    // NY files no classes: an empty list, never a 404.
    const classes = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/filing-classes"
    );
    expect(classes.status).toBe(200);
    const c = classes.data.data as Rec;
    expect(Array.isArray(c.classes)).toBe(true);
    notAKey(c.statusLabel);
  });

  test("TC-1604: the report says which days it covers — business days by default, calendar dates on request (JSON and CSV)", async () => {
    const q = `?startDate=${localDay(-1)}&endDate=${today}`;
    const business = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/report${q}`
    );
    expect(business.status).toBe(200);
    expect((business.data.data as Rec).period).toMatchObject({
      basis: "BUSINESS_DAY",
      cutoffHour: expect.any(Number),
    });
    const calendar = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/report${q}&basis=calendar`
    );
    expect(calendar.status).toBe(200);
    const period = (calendar.data.data as Rec).period as Rec;
    expect(period).toMatchObject({ basis: "CALENDAR", cutoffHour: null });
    expect(period.from).toBeTruthy();
    // The class split is a list (empty with no taxed class sales yet).
    expect(Array.isArray((calendar.data.data as Rec).byClass)).toBe(true);
    const csv = await apiRequestRaw(
      "GET",
      `/api/tax/${restaurantId}/report.csv${q}&basis=calendar`,
      undefined,
      ownerToken
    );
    expect(csv.status).toBe(200);
    expect(lines(csv.data)[1]).toContain("calendar days, midnight to midnight");
    const csvBusiness = await apiRequestRaw(
      "GET",
      `/api/tax/${restaurantId}/report.csv${q}`,
      undefined,
      ownerToken
    );
    expect(lines(csvBusiness.data)[1]).toContain("business days");
  });

  test("TC-1605: exemption certificates — create (state normalised), refuse a missing buyer, edit, warn when expired", async () => {
    const missing = await taxRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/certificates",
      { buyerName: "", reason: "GOVERNMENT", number: "GOV-1" }
    );
    expect(missing.status).toBe(400);
    notAKey(missing.data.message ?? (missing.data as Rec).error);
    const badReason = await taxRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/certificates",
      { buyerName: "Friends", reason: "FRIENDS", number: "F-123" }
    );
    expect(badReason.status).toBe(400);
    const created = await taxRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/certificates",
      {
        buyerName: `City Schools ${runId}`,
        reason: "GOVERNMENT",
        number: `GOV-${runId}`,
        state: "New York",
        expiresOn: localDay(-10),
      }
    );
    expect(created.status).toBe(201);
    const cert = created.data.data as Rec;
    certificateId = String(cert.id);
    expect(cert).toMatchObject({
      state: "NY",
      reason: "GOVERNMENT",
      hasImage: false,
      warnings: ["EXPIRED"],
    });
    const edit = await taxRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      `/certificates/${certificateId}`,
      { expiresOn: localDay(365), notes: "PO required" }
    );
    expect(edit.status).toBe(200);
    expect((edit.data.data as Rec).warnings).toEqual([]);
    const listed = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/certificates"
    );
    expect(list(listed.data.data).map((c) => c.id)).toContain(certificateId);
  });

  test("TC-1606: a certificate's image — a PDF is stored and served as a link; a text file is refused", async () => {
    const send = async (type: string, name: string, body: string) => {
      const form = new FormData();
      form.append("file", new Blob([body], { type }), name);
      const res = await fetch(
        `${BACKEND_URL}/api/tax/${restaurantId}/certificates/${certificateId}/image`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${ownerToken}` },
          body: form,
        }
      );
      return { status: res.status, json: (await res.json()) as Rec };
    };
    const txt = await send("text/plain", "cert.txt", "not a certificate");
    expect(txt.status).toBe(400);
    const pdf = await send(
      "application/pdf",
      "cert.pdf",
      "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"
    );
    expect(pdf.status).toBe(200);
    const data = pdf.json.data as Rec;
    expect(data.hasImage).toBe(true);
    expect(String(data.imageUrl)).toMatch(/^https:\/\//);
  });

  test("TC-1607: linking a certificate — only to a tax-exempt sale of this restaurant", async () => {
    const notExempt = await taxRaw(
      ownerToken,
      restaurantId,
      "PUT",
      `/orders/${orderId}/certificate`,
      { certificateId }
    );
    expect(notExempt.status).toBe(400);
    notAKey(notExempt.data.message ?? (notExempt.data as Rec).error);
    const unknown = await taxRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/orders/00000000-0000-4000-a000-000000000000/certificate",
      { certificateId }
    );
    expect(unknown.status).toBe(404);
  });

  test("TC-1608: the POS lists the certificates on file, reason and warnings as text in the device's language; no device, no list", async () => {
    const device = await createTabletDevice(
      ownerToken,
      restaurantId,
      `Depth POS ${runId}`
    );
    tabletId = device.id;
    const tablet = await tabletLogin(device.name, device.code);
    const res = await apiRequestRaw<{ data?: LooseJson }>(
      "GET",
      "/api/tablet/tax-exempt-certificates",
      undefined,
      tablet,
      { "Accept-Language": "es" }
    );
    expect(res.status).toBe(200);
    const row = list(res.data.data).find((c) => c.id === certificateId);
    expect(row).toMatchObject({
      number: `GOV-${runId}`,
      reasonLabel: "Gobierno",
      warnings: [],
    });
    const anon = await apiRequestRaw(
      "GET",
      "/api/tablet/tax-exempt-certificates"
    );
    expect(anon.status).toBe(401);
    // Archive: gone from the POS list, kept for past sales.
    const del = await taxRaw(
      ownerToken,
      restaurantId,
      "DELETE",
      `/certificates/${certificateId}`
    );
    expect(del.status).toBe(200);
    const after = await apiRequestRaw<{ data?: LooseJson }>(
      "GET",
      "/api/tablet/tax-exempt-certificates",
      undefined,
      tablet
    );
    expect(list(after.data.data).map((c) => c.id)).not.toContain(certificateId);
  });

  test("TC-1609: the card surcharge rule — dormant pass-through, the state's rule and a warning as text", async () => {
    const res = await taxRaw(ownerToken, restaurantId, "GET", "/surcharge");
    expect(res.status).toBe(200);
    const s = res.data.data as Rec;
    expect(s.passThroughOn).toBe(false);
    // NY's rule is DRAFT: priced as today (allowed), with the warning.
    expect(s).toMatchObject({
      allowPassThrough: true,
      taxable: null,
      warning: "UNCONFIRMED",
    });
    notAKey(s.warningText);
  });

  test("TC-1610: the DAVO feed — salesTax:read reads the day (JSON + CSV bridge), ties to the report; another scope is refused", async () => {
    const mint = await partnerAccessRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/api-keys",
      { name: `DAVO ${runId}`, scopes: ["salesTax:read"] }
    );
    expect(mint.status).toBe(201);
    const key = String((mint.data.data as Rec).key);
    keyIds.push(String((mint.data.data as Rec).id));
    const menu = await partnerAccessRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/api-keys",
      { name: `Menu ${runId}`, scopes: ["menu:read"] }
    );
    keyIds.push(String((menu.data.data as Rec).id));
    const path = `/locations/${restaurantId}/sales-tax?from=${localDay(-1)}&to=${today}`;
    const feed = await partnerApiRaw(key, "GET", path);
    expect(feed.status).toBe(200);
    const days = list(feed.data.data);
    expect(days.map((d) => d.businessDate)).toEqual([localDay(-1), today]);
    for (const d of days) {
      expect(d).toMatchObject({
        periodBasis: "BUSINESS_DAY",
        currency: "USD",
        totals: expect.any(Object),
        refunds: expect.any(Object),
        marketplace: expect.any(Object),
        exempt: expect.any(Object),
      });
      const net = list(d.jurisdictions).reduce(
        (s, j) => s + Number(j.netTax),
        0
      );
      expect(net).toBe((d.totals as Rec).netTaxCollected);
    }
    const report = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/report?startDate=${localDay(-1)}&endDate=${today}`
    );
    const reportNet = Math.round(
      Number(((report.data.data as Rec).totals as Rec).netTaxCollected) * 100
    );
    expect(
      days.reduce((s, d) => s + Number((d.totals as Rec).netTaxCollected), 0)
    ).toBe(reportNet);
    const calendar = await partnerApiRaw(key, "GET", `${path}&basis=calendar`);
    expect(list(calendar.data.data)[0]?.periodBasis).toBe("CALENDAR");
    const csv = await partnerApiRaw(
      key,
      "GET",
      `/locations/${restaurantId}/sales-tax.csv?from=${today}&to=${today}`
    );
    expect(csv.status).toBe(200);
    expect(lines(csv.data)[0]).toBe(
      "business_date,period_basis,status,jurisdiction_level,jurisdiction_name,jurisdiction_code,taxable_sales,tax_collected,tax_refunded,net_tax"
    );
    const refused = await partnerApiRaw(
      String((menu.data.data as Rec).key),
      "GET",
      path
    );
    expect(refused.status).toBe(403);
  });

  test("TC-1611: the HQ rate review — every restaurant's rate vs the reference, read-only; an owner is refused", async () => {
    const owner = await apiRequestRaw(
      "GET",
      "/api/admin/tax-rate-review",
      undefined,
      ownerToken
    );
    expect(owner.status).toBe(403);
    const res = await apiRequestRaw<{ data?: LooseJson }>(
      "GET",
      "/api/admin/tax-rate-review",
      undefined,
      adminToken
    );
    expect(res.status).toBe(200);
    const rows = list((res.data.data as Rec).rows);
    const mine = rows.find((r) => r.restaurantId === restaurantId);
    expect(mine).toMatchObject({ defaultPercent: 8, state: "NY" });
    expect(["MATCHES", "DIFFERENT", "NO_REFERENCE"]).toContain(mine?.verdict);
    notAKey(mine?.verdictLabel);
    // Worst first: no "Matches" row before a "Different" one.
    const order = rows.map((r) => String(r.verdict));
    const firstMatch = order.indexOf("MATCHES");
    if (firstMatch >= 0)
      expect(order.slice(firstMatch)).not.toContain("DIFFERENT");
    const csv = await apiRequestRaw(
      "GET",
      "/api/admin/tax-rate-review/csv",
      undefined,
      adminToken
    );
    expect(csv.status).toBe(200);
    expect(lines(csv.data)[0]).toMatch(/^Restaurant,State,City,Default rate/);
    expect(beerRateId).toBeTruthy();
  });
});
