/**
 * api-books-taxes.spec.ts — Books & taxes B5 tax calendar and year-end
 * package, and the B2 card-deposit surface on a restaurant with no books
 * connection (TC-763..771), and the closed-period lock (W2:A3) on that
 * CSV-only tenant (TC-1300..1302), and the Stage 7 year-end additions (W4:L5:
 * fees paid to RestauNax, gift card liability at year end) (TC-1612).
 *
 * restaunax docs/features/back-office/BOOKS_B5_ACCOUNTANT_AND_YEAR_END.md and
 * ACCOUNTING_SYNC.md → B2 (#943). No browser. One throwaway restaurant; the
 * "Books & Taxes" add-on (ACCOUNTING_SYNC) is granted by admin override after
 * TC-763 proves every surface is closed without it. The package is read for
 * LAST year (a year that is over), so its files are final; a fresh tenant has
 * no sales, so the numbers are zeros — the shape, the files and the wording
 * are what's under test (the worksheet math is unit + integration tested in
 * restaunax, `worksheets.test.ts`, `booksAccountantYearEnd.int.test.ts`).
 * Serial.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { readZip, type ZipEntry } from "../../../utils/zipReader";
import { pdfText } from "../../../utils/pdfText";
import { settingChangesRaw } from "../../../utils/backOfficeApi";
import {
  probeTaxDepthStage7,
  requireRelease,
} from "../../../utils/releaseGate";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  getRestaurantFeaturesRaw,
  booksRaw,
  accountingRaw,
  downloadRaw,
  stripeTestOnboardingRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const DISCLAIMER = "worksheets for your accountant, not a tax filing";
const YEAR = new Date().getUTCFullYear() - 1;
/** A day that has surely ended in every US zone (W2:A3 lock tests). */
const LOCK_DAY = new Date(Date.now() - 3 * 86_400_000)
  .toISOString()
  .slice(0, 10);
const CSV_FILES = [
  "01-sales-by-month.csv",
  "02-sales-by-category.csv",
  "03-sales-tax-by-month.csv",
  "04-sales-tax-by-rate.csv",
  "05-tax-exempt-orders.csv",
  "06-card-deposits-and-fees.csv",
  "07-1099-k-tie-out.csv",
  "08-form-8846-fica-tip-credit-worksheet.csv",
  "09-form-8027-tip-report-worksheet.csv",
];
/** Spreadsheets later stages added, in package order: Stage 5 (W-2
 *  worksheet, 8027 by pay period) and Stage 7 (W4:L5). A stack without a
 *  stage simply lacks its files; TC-1612 proves the Stage 7 pair once
 *  released. */
const LATER_CSV_FILES = [
  "10-w2-qualified-tips-and-overtime.csv",
  "11-form-8027-allocation-by-pay-period.csv",
  "12-fees-paid-to-restaunax.csv",
  "13-gift-card-liability-at-year-end.csv",
];

test.describe.configure({ mode: "serial" });

test.describe("Books & taxes — tax calendar, year-end package, card deposits (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let zip: ZipEntry[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[api-books-taxes] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Books & taxes");
    await allure.label("severity", "critical");
  });

  test("TC-763: without the Books & Taxes add-on every books route refuses; with it every screen load answers 200", async () => {
    const features = await getRestaurantFeaturesRaw(ownerToken, restaurantId);
    expect(features.data.data?.features ?? []).not.toContain("ACCOUNTING_SYNC");
    const loads = async () => ({
      calendar: (
        await booksRaw(ownerToken, restaurantId, "GET", "/tax-calendar")
      ).status,
      yearEnd: (
        await booksRaw(
          ownerToken,
          restaurantId,
          "GET",
          `/year-end?year=${YEAR}`
        )
      ).status,
      accountants: (
        await booksRaw(ownerToken, restaurantId, "GET", "/accountants")
      ).status,
      books: (await accountingRaw(ownerToken, restaurantId, "GET", "/overview"))
        .status,
      deposits: (
        await accountingRaw(ownerToken, restaurantId, "GET", "/deposits")
      ).status,
    });
    expect(await loads()).toEqual({
      calendar: 403,
      yearEnd: 403,
      accountants: 403,
      books: 403,
      deposits: 403,
    });
    const refused = await booksRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/tax-calendar"
    );
    expect(refused.data).toMatchObject({
      error: "FEATURE_NOT_ENTITLED",
      feature: "ACCOUNTING_SYNC",
    });
    // Writes are closed too.
    const write = await booksRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      "/tax-calendar/settings",
      { salesTaxFrequency: "MONTHLY" }
    );
    expect(write.status).toBe(403);
    const file = await downloadRaw(
      ownerToken,
      `/api/books/${restaurantId}/year-end/${YEAR}/package.zip`
    );
    expect(file.status).toBe(403);

    const granted = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "ACCOUNTING_SYNC",
      true,
      `automation books ${runId}`
    );
    expect(granted.ok, JSON.stringify(granted.data)).toBe(true);
    expect(await loads()).toEqual({
      calendar: 200,
      yearEnd: 200,
      accountants: 200,
      books: 200,
      deposits: 200,
    });
  });

  test("TC-764: the tax calendar lists what's due, in date order, who handles each, in words", async () => {
    const r = await booksRaw(ownerToken, restaurantId, "GET", "/tax-calendar");
    expect(r.status).toBe(200);
    const cal = r.data.data as Rec;
    expect(cal.settings).toEqual({
      salesTaxFrequency: null,
      salesTaxDueDay: 20,
      estimatedTaxReminders: true,
      estimatedTaxFiler: "INDIVIDUAL",
      remindersEnabled: true,
    });
    // One question to answer before sales tax dates can appear.
    expect(cal.needsFrequency).toBe(true);
    const items = list(cal.items);
    expect(items.length).toBeGreaterThan(3);
    expect(items.filter((i) => i.kind === "SALES_TAX")).toEqual([]);
    const dates = items.map((i) => String(i.dueDate));
    expect(dates).toEqual([...dates].sort());
    const kinds = items.map((i) => i.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "YEAR_END_PACKAGE",
        "FORM_1099_K",
        "ESTIMATED_TAX",
      ])
    );
    const yearEnd = items.find((i) => i.kind === "YEAR_END_PACKAGE")!;
    expect(yearEnd).toMatchObject({
      handledBy: "RESTAUNAX",
      handledByLabel: "RestauNax",
      remind: false,
    });
    expect(String(yearEnd.title)).toMatch(
      /^Year-end package for \d{4} is ready$/
    );
    const k1099 = items.find((i) => i.kind === "FORM_1099_K")!;
    expect(k1099.handledBy).toBe("RESTAUNAX");
    const estimated = items.find((i) => i.kind === "ESTIMATED_TAX")!;
    expect(estimated).toMatchObject({ handledBy: "YOU", remind: true });
    for (const i of items) {
      expect(String(i.title)).not.toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
      expect(typeof i.daysAway).toBe("number");
    }
  });

  test("TC-765: answering 'quarterly' adds every sales tax return on the 20th; bad answers are refused; Spanish on request", async () => {
    const r = await booksRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      "/tax-calendar/settings",
      { salesTaxFrequency: "QUARTERLY" }
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.message).toBe("Tax calendar saved.");
    const cal = r.data.data as Rec;
    expect(cal.needsFrequency).toBe(false);
    const sales = list(cal.items).filter((i) => i.kind === "SALES_TAX");
    expect(sales.length).toBeGreaterThanOrEqual(3);
    for (const s of sales) {
      expect(String(s.period)).toMatch(/^\d{4}-Q[1-4]$/);
      // The 20th, moved to Monday when it falls on a weekend.
      const due = new Date(`${s.dueDate}T00:00:00Z`);
      const day = due.getUTCDate();
      expect(day >= 20 && day <= 22, String(s.dueDate)).toBe(true);
      expect([0, 6]).not.toContain(due.getUTCDay());
      expect(String(s.title)).toBe(
        `Sales tax return for ${String(s.period).split("-").reverse().join(" ")}`
      );
    }

    const off = await booksRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      "/tax-calendar/settings",
      { estimatedTaxReminders: false }
    );
    expect(off.status).toBe(200);
    // Estimated-tax dates are reminders only: turned off, they leave the list.
    expect(
      list((off.data.data as Rec).items).filter(
        (i) => i.kind === "ESTIMATED_TAX"
      )
    ).toEqual([]);

    for (const body of [
      { salesTaxFrequency: "WEEKLY" },
      { salesTaxDueDay: 40 },
      { estimatedTaxFiler: "PARTNERSHIP" },
      { remindersEnabled: "yes" },
    ]) {
      const bad = await booksRaw(
        ownerToken,
        restaurantId,
        "PATCH",
        "/tax-calendar/settings",
        body
      );
      expect(bad.status, JSON.stringify(body)).toBe(400);
      expect(bad.data.message).toBe(
        "Check the tax calendar answers and try again."
      );
    }

    const es = await booksRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/tax-calendar",
      undefined,
      { "Accept-Language": "es" }
    );
    const esItems = list((es.data.data as Rec).items);
    expect(String(esItems.find((i) => i.kind === "SALES_TAX")?.title)).toMatch(
      /^Declaración del impuesto sobre las ventas de /
    );
    expect(
      String(esItems.find((i) => i.kind === "YEAR_END_PACKAGE")?.title)
    ).toMatch(/^El paquete de fin de año de \d{4} está listo$/);
  });

  test("TC-766: the year-end screen — the years to pick, the package's numbers; a year outside them is refused", async () => {
    const r = await booksRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/year-end?year=${YEAR}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const data = r.data.data as Rec;
    expect(data.years).toContain(YEAR + 1);
    const pkg = data.package as Rec;
    expect(pkg).toMatchObject({
      year: YEAR,
      partial: false,
      throughDate: `${YEAR}-12-31`,
    });
    expect(list(pkg.sales)).toHaveLength(12);
    expect(list(pkg.sales)[0]).toMatchObject({
      month: `${YEAR}-01`,
      orders: 0,
      salesCents: 0,
    });
    for (const bad of ["2019", String(YEAR + 2), "twenty"]) {
      const refused = await booksRaw(
        ownerToken,
        restaurantId,
        "GET",
        `/year-end?year=${bad}`
      );
      expect(refused.status, bad).toBe(400);
      expect(refused.data.message).toBe("Pick a year from the list.");
    }
  });

  test("TC-767: the year-end ZIP — README, the PDF and the spreadsheets (9, plus later stages' in order); README and PDF say 'worksheets, not a tax filing'", async () => {
    const res = await downloadRaw(
      ownerToken,
      `/api/books/${restaurantId}/year-end/${YEAR}/package.zip`
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/zip");
    expect(res.headers.get("content-disposition")).toMatch(
      new RegExp(`attachment; filename="year-end-${YEAR}-.+\\.zip"`)
    );
    zip = readZip(res.body);
    const names = zip.map((e) => e.name);
    expect(names.slice(0, 2 + CSV_FILES.length)).toEqual([
      "README.txt",
      `year-end-${YEAR}.pdf`,
      ...CSV_FILES,
    ]);
    const later = names.slice(2 + CSV_FILES.length);
    expect(later).toEqual(LATER_CSV_FILES.filter((f) => later.includes(f)));

    const readme = zip[0]!.data.toString("utf8");
    expect(readme).toContain(`Year-end package ${YEAR}`);
    expect(readme).toContain(DISCLAIMER);
    expect(readme).toContain("RestauNax does not file tax returns");
    // README lists every file in the package.
    for (const f of CSV_FILES) expect(readme).toContain(f);

    const pdf = zip[1]!.data;
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const text = pdfText(pdf);
    expect(text).toContain(DISCLAIMER);
    // The footer on every page.
    expect(text).toContain("Worksheets for your accountant, not a tax filing");
    expect(text).toContain("FICA tip credit worksheet (Form 8846)");
    expect(text).toContain("Tip report and allocation worksheet (Form 8027)");

    const csv = (name: string) =>
      zip.find((e) => e.name === name)!.data.toString("utf8");
    expect(csv("01-sales-by-month.csv").split(/\r?\n/)[0]).toMatch(
      /^Month,Orders,Sales,/
    );
    expect(csv("07-1099-k-tie-out.csv")).toMatch(
      /Left unexplained \(should be 0\.00\),0\.00/
    );
    expect(csv("08-form-8846-fica-tip-credit-worksheet.csv")).toContain(
      "Line 4: estimated credit"
    );
    expect(csv("09-form-8027-tip-report-worksheet.csv")).toContain(
      "Line 7: tips to allocate"
    );
  });

  // Doc: "Every file says it is a worksheet, not a filing." The nine CSVs
  // gained the note in RestauNax 6999b5133 ("year-end CSVs say 'not a tax
  // filing'"), so this is a plain pass now (it used to be test.fail).
  test("TC-768: every spreadsheet in the package says it is a worksheet, not a tax filing", async () => {
    for (const name of CSV_FILES) {
      const body =
        zip.find((e) => e.name === name)?.data.toString("utf8") ?? "";
      expect(body.toLowerCase(), name).toContain("not a tax filing");
    }
  });

  test("TC-769: one file at a time — the PDF and a worksheet CSV download alone; an unknown part is refused", async () => {
    const pdf = await downloadRaw(
      ownerToken,
      `/api/books/${restaurantId}/year-end/${YEAR}/package.pdf`
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(pdfText(pdf.body)).toContain(DISCLAIMER);

    const csv = await downloadRaw(
      ownerToken,
      `/api/books/${restaurantId}/year-end/${YEAR}/form-8846.csv`
    );
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toContain(
      "08-form-8846-fica-tip-credit-worksheet.csv"
    );
    // Same content as the ZIP's copy (plus the BOM Excel needs).
    expect(csv.body.toString("utf8").replace(/^\uFEFF/, "")).toBe(
      zip
        .find((e) => e.name === "08-form-8846-fica-tip-credit-worksheet.csv")!
        .data.toString("utf8")
    );

    const bad = await downloadRaw(
      ownerToken,
      `/api/books/${restaurantId}/year-end/${YEAR}/payroll.csv`
    );
    expect(bad.status).toBe(400);
    expect(JSON.parse(bad.body.toString()).message).toBe(
      "That part of the package doesn't exist."
    );
  });

  test("TC-1612: the year-end package adds fees paid to RestauNax and the gift card balances at year end (W4:L5) @tax-depth", async () => {
    requireRelease(
      "taxDepthStage7",
      await probeTaxDepthStage7(ownerToken, restaurantId)
    );
    const names = zip.map((e) => e.name);
    expect(names).toContain("12-fees-paid-to-restaunax.csv");
    expect(names).toContain("13-gift-card-liability-at-year-end.csv");
    const fees = await downloadRaw(
      ownerToken,
      `/api/books/${restaurantId}/year-end/${YEAR}/restaunax-fees.csv`
    );
    expect(fees.status).toBe(200);
    expect(fees.headers.get("content-disposition")).toContain(
      "12-fees-paid-to-restaunax.csv"
    );
    const feeRows = fees.body
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/);
    expect(feeRows[0]).toBe("Fee,Amount");
    // A fresh tenant paid nothing last year: every line is 0.00, total too.
    for (const label of [
      "Subscription",
      "Add-ons",
      "Hardware",
      "Supply shop",
      "Total",
    ]) {
      expect(feeRows).toContain(`${label},0.00`);
    }
    expect(fees.body.toString("utf8").toLowerCase()).toContain(
      "not a tax filing"
    );
    const cards = await downloadRaw(
      ownerToken,
      `/api/books/${restaurantId}/year-end/${YEAR}/gift-card-liability.csv`
    );
    expect(cards.status).toBe(200);
    const cardText = cards.body.toString("utf8");
    expect(cardText).toContain("This restaurant's gift cards,0,0.00");
    expect(cardText).toContain(
      `Unredeemed balances at the end of ${YEAR}-12-31`
    );
  });

  test("TC-770: card deposits with no books connection and no Stripe account — an empty list, 'up to date', a header-only CSV", async () => {
    const r = await accountingRaw(ownerToken, restaurantId, "GET", "/deposits");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.data).toMatchObject({ takesCards: false, deposits: [] });
    const sync = await accountingRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/deposits/sync"
    );
    expect(sync.status).toBe(200);
    expect(sync.data).toMatchObject({
      data: { changed: 0 },
      message: "Your deposits are up to date.",
    });
    const csv = await downloadRaw(
      ownerToken,
      `/api/accounting/${restaurantId}/deposits/export.csv`
    );
    expect(csv.status).toBe(200);
    expect(
      csv.body
        .toString("utf8")
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter(Boolean)
    ).toEqual([
      "Date,Journal no.,Account,Debit,Credit,Description,Location,Status",
    ]);
    const unknown = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/deposits/00000000-0000-4000-8000-000000000000"
    );
    expect(unknown.status).toBe(400);
    const tooLong = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/deposits?startDate=2026-01-01&endDate=2026-10-01"
    );
    expect(tooLong.status).toBe(400);
    // No card account: the overview's deposits card is off, not an error.
    const overview = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/overview"
    );
    expect(overview.status).toBe(200);
    expect((overview.data.data as Rec).deposits).toMatchObject({
      state: "OFF",
    });
  });

  test("TC-771: with a (test-mode) Stripe account the screen says it takes cards; checking for deposits finds none yet", async () => {
    const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
    expect(onboard.status, JSON.stringify(onboard.data)).toBe(200);
    const r = await accountingRaw(ownerToken, restaurantId, "GET", "/deposits");
    expect(r.data.data).toMatchObject({ takesCards: true, deposits: [] });
    const sync = await accountingRaw(
      ownerToken,
      restaurantId,
      "POST",
      "/deposits/sync"
    );
    expect(sync.status, JSON.stringify(sync.data)).toBe(200);
    expect(sync.data.data).toEqual({ changed: 0 });
    // Taking cards, the deposits card waits for the books to be set up.
    const overview = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/overview"
    );
    expect((overview.data.data as Rec).deposits).toMatchObject({
      state: "SETTING_UP",
    });
  });

  // W2:A7 — a wider tolerance only turned red days green: at most $5.00 a
  // day now, and books settings and account mapping changes are in the
  // settings change history (who, from what, to what).
  test("TC-1154: the rounding tolerance is capped at $5.00; tolerance and mapping changes are in Recent changes", async () => {
    const tooHigh = await accountingRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      "/settings",
      { toleranceCents: 501 }
    );
    expect(tooHigh.status).toBe(400);
    expect(String(tooHigh.data.message)).toBe(
      "The rounding tolerance can be at most $5.00 a day."
    );
    const ok = await accountingRaw(
      ownerToken,
      restaurantId,
      "PATCH",
      "/settings",
      {
        toleranceCents: 300,
      }
    );
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    const mapped = await accountingRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/mapping",
      { mapping: { tips: { name: "Tips Payable", code: "2150" } } }
    );
    expect(mapped.status, JSON.stringify(mapped.data)).toBe(200);

    const r = await settingChangesRaw(ownerToken, restaurantId, {
      area: "books",
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const items = r.data.data?.items ?? [];
    expect(
      items.find((i) => i.field === "accountingToleranceCents"),
      JSON.stringify(items)
    ).toMatchObject({ area: "books", actorType: "OWNER", newValue: 300 });
    expect(
      items.find((i) => i.field === "accountMapping"),
      JSON.stringify(items)
    ).toMatchObject({ area: "books", newValue: "2150 Tips Payable" });
  });

  // W2:A3 — "books closed through": after it, a change to a day never edits
  // the entry already in the books; it goes in as an adjusting entry on the
  // first open day. Set, moved and cleared by the owner; logged.
  test("TC-1300: books closed through — refused on a day that hasn't ended, saved for yesterday, logged, then reopened", async () => {
    const empty = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/books-closed"
    );
    expect(empty.status, JSON.stringify(empty.data)).toBe(200);
    expect(empty.data.data).toMatchObject({
      booksClosedThrough: null,
      providerClosedThrough: null,
      effectiveClosedThrough: null,
    });
    const tomorrow = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const future = await accountingRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/books-closed",
      { closedThrough: tomorrow }
    );
    expect(future.status).toBe(400);
    expect(String(future.data.message)).toBe(
      "Books can only be closed through a day that has ended."
    );
    const bad = await accountingRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/books-closed",
      { closedThrough: "last week" }
    );
    expect(bad.status).toBe(400);

    const saved = await accountingRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/books-closed",
      { closedThrough: LOCK_DAY }
    );
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    expect(saved.data.data).toMatchObject({
      booksClosedThrough: LOCK_DAY,
      effectiveClosedThrough: LOCK_DAY,
    });
    const overview = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      "/overview"
    );
    expect(overview.data.data?.setup?.booksClosedThrough).toBe(LOCK_DAY);
    expect(overview.data.data?.week).toMatchObject({
      provisional: 0,
      adjustments: 0,
    });
    const r = await settingChangesRaw(ownerToken, restaurantId, {
      area: "books",
    });
    expect(
      (r.data.data?.items ?? []).find((i) => i.field === "booksClosedThrough"),
      JSON.stringify(r.data)
    ).toMatchObject({ area: "books", actorType: "OWNER", newValue: LOCK_DAY });
  });

  test("TC-1301: a day the books are closed through — Re-send is refused (an adjustment instead); its history says locked", async () => {
    const resend = await accountingRaw(
      ownerToken,
      restaurantId,
      "POST",
      `/days/${LOCK_DAY}/resend`
    );
    expect(resend.status).toBe(400);
    expect(String(resend.data.message)).toContain("adjusting entry");
    const history = await accountingRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/days/${LOCK_DAY}/history`
    );
    expect(history.status, JSON.stringify(history.data)).toBe(200);
    expect(history.data.data).toMatchObject({
      businessDate: LOCK_DAY,
      locked: true,
    });
    expect(Array.isArray(history.data.data?.versions)).toBe(true);
    expect(Array.isArray(history.data.data?.adjustments)).toBe(true);

    const reopened = await accountingRaw(
      ownerToken,
      restaurantId,
      "PUT",
      "/books-closed",
      { closedThrough: null }
    );
    expect(reopened.status, JSON.stringify(reopened.data)).toBe(200);
    expect(reopened.data.data?.booksClosedThrough).toBeNull();
  });

  // W2:A1, A2a, A4a, A5 — the new journal lines are mappable, in words.
  test("TC-1302: the accounts list has the Stage 4 lines (cash paid out, tips paid in cash, comps…) in words", async () => {
    const r = await accountingRaw(ownerToken, restaurantId, "GET", "/lines");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const byKey = new Map(
      list(r.data.data).map((l) => [String(l.key), String(l.label)])
    );
    expect(byKey.get("paid_out")).toBe("Cash paid out");
    expect(byKey.get("paid_in")).toBe("Cash paid in");
    expect(byKey.get("tips_paid_cash")).toBe("Tips paid out in cash");
    expect(byKey.get("tips_card_fee")).toBe("Card fee withheld from tips");
    expect(byKey.get("comps")).toBe("Comps");
    expect(byKey.get("unpaid_collected")).toBe("Unpaid orders collected");
  });
});
