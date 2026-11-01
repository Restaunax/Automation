/**
 * api-books-exports.spec.ts — Stage 4 books exports (TC-1330..1337).
 *
 * restaunax back-office audit W2:S1 (Simple six-account preset), W2:A11
 * (QuickBooks Online and Xero journal import files) and W2:A8 (the sales
 * summary that ties to the books; sales-by-day CSV on the shared sales
 * definitions). Spec: restaunax docs/features/back-office/ACCOUNTING_SYNC.md
 * → "Import files", "Simple accounts", "Sales summary".
 *
 * One throwaway restaurant. TC-1330 proves the new routes are closed without
 * the Books & Taxes add-on (ACCOUNTING_SYNC), then grants it by admin
 * override. A fresh tenant has no sales, so the closed day's journal is
 * empty: the file layouts, the routing and the wording are under test here;
 * the line math is unit (golden files) + integration tested in restaunax
 * (`importFormats.test.ts`, `booksExportsAndAccountantBooks.int.test.ts`).
 * Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { settingChangesRaw } from "../../../utils/backOfficeApi";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  accountingRaw,
  reportsRaw,
  closeDayWebRaw,
  downloadRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const rowsOf = (body: Buffer | string) =>
  String(body).split(/\r?\n/).filter(Boolean);

const QBO_HEADER =
  "Journal No.,Journal Date,Account Name,Journal/Description,Debits,Credits";
const XERO_HEADER =
  "*Narration,*Date,Description,*AccountCode,*TaxRate,*Amount,TrackingName1,TrackingOption1,TrackingName2,TrackingOption2";

test.describe.configure({ mode: "serial" });

test.describe("Books exports — Simple accounts, QuickBooks / Xero files, sales summary (API)", () => {
  // The add-on gate (TC-1330) must FAIL, not skip, without admin
  // credentials: without them nothing below can be trusted.
  test.beforeAll(() => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        "[api-books-exports] ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
      );
    }
  });

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let day = "";
  const range = () => `?startDate=${day}&endDate=${day}`;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-books-exports] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    // One closed business day (no sales): the day the files and the summary cover.
    const closed = await closeDayWebRaw(ownerToken, restaurantId);
    if (closed.status !== 201)
      throw new Error(
        `[api-books-exports] close: ${JSON.stringify(closed.data)}`
      );
    day = String((closed.data.data as Rec).businessDate).slice(0, 10);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Books & taxes — exports");
    await allure.label("severity", "critical");
  });

  test("TC-1330: without the add-on the import files, the sales summary and the preset are closed; with it they open", async () => {
    const calls = async () => ({
      qbo: (
        await downloadRaw(
          ownerToken,
          `/api/accounting/${restaurantId}/export.csv${range()}&format=quickbooks`
        )
      ).status,
      check: (
        await accountingRaw(
          ownerToken,
          restaurantId,
          "GET",
          `/export/check${range()}&format=xero`
        )
      ).status,
      summary: (
        await accountingRaw(
          ownerToken,
          restaurantId,
          "GET",
          `/sales-summary${range()}`
        )
      ).status,
      preset: (
        await accountingRaw(
          ownerToken,
          restaurantId,
          "POST",
          "/mapping/preset",
          {
            preset: "DETAILED",
          }
        )
      ).status,
    });
    expect(await calls()).toEqual({
      qbo: 403,
      check: 403,
      summary: 403,
      preset: 403,
    });
    const granted = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "ACCOUNTING_SYNC",
      true,
      `automation books exports ${runId}`
    );
    expect(granted.ok, JSON.stringify(granted.data)).toBe(true);
    expect(await calls()).toEqual({
      qbo: 200,
      check: 200,
      summary: 200,
      preset: 200,
    });
  });

  test("TC-1331: Simple accounts maps the sales entry to six accounts in one click; back to detailed; logged in Recent changes", async () => {
    const on = await accountingRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/mapping/preset",
      { preset: "SIMPLE" }
    );
    expect(on.status, JSON.stringify(on.data)).toBe(200);
    expect(on.data.message).toBe(
      "Simple accounts are on: your sales post to six accounts."
    );
    const data = on.data.data as Rec;
    expect(data.mappingPreset).toBe("SIMPLE");
    const mapping = data.mapping as Record<string, { name: string }>;
    const name = (key: string) => mapping[key]?.name;
    expect(name("sales:default")).toBe("Sales");
    expect(name("tax:default")).toBe("Sales tax payable");
    expect(name("tips")).toBe("Tips & service charges payable");
    expect(name("tender:card")).toBe("Card clearing");
    expect(name("tender:cash")).toBe("Cash on hand");
    expect(name("discounts")).toBe("Discounts & comps");
    expect(new Set(Object.values(mapping).map((a) => a.name)).size).toBe(6);
    const matching = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/matching"
    );
    expect((matching.data.data as Rec).preset).toBe("SIMPLE");

    const off = await accountingRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/mapping/preset",
      { preset: "DETAILED" }
    );
    expect(off.status).toBe(200);
    expect((off.data.data as Rec).mappingPreset).toBe("DETAILED");
    expect(
      ((off.data.data as Rec).mapping as Rec)["sales:default"]
    ).toBeUndefined();

    const bad = await accountingRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/mapping/preset",
      { preset: "FANCY" }
    );
    expect(bad.status).toBe(400);

    const changes = await settingChangesRaw(ownerToken, restaurantId, {
      area: "books",
    });
    const items = changes.data.data?.items ?? [];
    expect(
      items.find((i) => i.field === "accountingMappingPreset"),
      JSON.stringify(items)
    ).toMatchObject({ area: "books", newValue: expect.any(String) });
  });

  test("TC-1332: the QuickBooks Online file — the importer's exact headers, no BOM, MM/DD/YYYY; the day shows as exported", async () => {
    const file = await downloadRaw(
      ownerToken,
      `/api/accounting/${restaurantId}/export.csv${range()}&format=quickbooks`
    );
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toContain("text/csv");
    expect(file.headers.get("content-disposition")).toContain(
      `quickbooks-journal-${day}-to-${day}.csv`
    );
    expect(file.body[0]).not.toBe(0xef); // no UTF-8 BOM before "Journal No."
    const rows = rowsOf(file.body.toString("utf8"));
    expect(rows[0]).toBe(QBO_HEADER);
    const [y, m, d] = day.split("-");
    for (const r of rows.slice(1)) expect(r).toContain(`,${m}/${d}/${y},`);

    const days = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/days${range()}`
    );
    expect(list(days.data.data)).toEqual([
      expect.objectContaining({
        businessDate: day,
        closed: true,
        exportFormat: "QUICKBOOKS_ONLINE",
        exportedAt: expect.any(String),
      }),
    ]);
  });

  test("TC-1333: the Xero manual journal file — exact headers; the check lists nothing left out; an unknown format is refused", async () => {
    const file = await downloadRaw(
      ownerToken,
      `/api/accounting/${restaurantId}/export.csv${range()}&format=xero`
    );
    expect(file.status).toBe(200);
    expect(rowsOf(file.body.toString("utf8"))[0]).toBe(XERO_HEADER);

    const check = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/export/check${range()}&format=xero&source=days`
    );
    expect(check.status, JSON.stringify(check.data)).toBe(200);
    expect(check.data.data).toMatchObject({
      format: "XERO",
      source: "days",
      exported: 1,
      skipped: [],
    });

    const bad = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/export/check${range()}&format=sage`
    );
    expect(bad.status).toBe(400);
    const badFile = await downloadRaw(
      ownerToken,
      `/api/accounting/${restaurantId}/export.csv${range()}&format=sage`
    );
    expect(badFile.status).toBe(400);
  });

  test("TC-1334: the RestauNax CSV stays as it was; card deposits download in the QuickBooks layout too", async () => {
    const plain = await downloadRaw(
      ownerToken,
      `/api/accounting/${restaurantId}/export.csv${range()}`
    );
    expect(plain.status).toBe(200);
    expect(rowsOf(plain.body.toString("utf8").replace(/^\uFEFF/, ""))[0]).toBe(
      "Date,Journal no.,Account,Debit,Credit,Description,Location,Status"
    );
    const deposits = await downloadRaw(
      ownerToken,
      `/api/accounting/${restaurantId}/deposits/export.csv${range()}&format=quickbooks`
    );
    expect(deposits.status).toBe(200);
    expect(rowsOf(deposits.body.toString("utf8"))).toEqual([QBO_HEADER]);
  });

  test("TC-1335: the sales summary — per day and in total, and it ties to the books", async () => {
    const r = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/sales-summary${range()}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const s = r.data.data as Rec;
    expect(s).toMatchObject({
      startDate: day,
      endDate: day,
      ties: true,
      closedDays: 1,
      openDays: 0,
    });
    const totals = s.totals as Rec;
    expect(totals).toMatchObject({
      grossSalesCents: 0,
      netSalesCents: 0,
      taxCents: 0,
      tipsCents: 0,
    });
    expect((totals.check as Rec).ties).toBe(true);
    const only = list(s.days)[0] ?? {};
    expect(only).toMatchObject({ date: day, closed: true });
    expect(((only.figures as Rec).check as Rec).ties).toBe(true);

    const tooLong = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/sales-summary?startDate=2026-01-01&endDate=2026-10-01"
    );
    expect(tooLong.status).toBe(400);
  });

  test("TC-1336: the sales summary CSV — a row per day, a total row and the 'Ties to journal' column", async () => {
    const csv = await downloadRaw(
      ownerToken,
      `/api/accounting/${restaurantId}/sales-summary.csv${range()}`,
      { "Accept-Language": "en" }
    );
    expect(csv.status).toBe(200);
    const rows = rowsOf(csv.body.toString("utf8").replace(/^\uFEFF/, ""));
    const [header = "", first = "", total = ""] = rows;
    expect(
      header.startsWith(
        "Business date,Orders,Gross sales,Comps,Discounts,Refunds,Net sales,"
      )
    ).toBe(true);
    expect(header.endsWith(",Ties to journal")).toBe(true);
    expect(rows).toHaveLength(3);
    expect(first.startsWith(`${day},`)).toBe(true);
    expect(first.endsWith(",Yes")).toBe(true);
    expect(total.startsWith("Total,")).toBe(true);
  });

  test("TC-1337: the sales-by-day CSV — net sales after refunds, with refunds and the old figure beside it", async () => {
    const r = await reportsRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/sales-by-day.csv${range()}`
    );
    expect(r.status).toBe(200);
    const header = rowsOf(String(r.data).replace(/^\uFEFF/, ""))[0] ?? "";
    expect(header.split(",").slice(0, 7)).toEqual([
      "Business date",
      "Day",
      "Orders",
      "Net sales",
      "Refunds",
      "Net sales before refunds",
      "Source",
    ]);
  });
});
