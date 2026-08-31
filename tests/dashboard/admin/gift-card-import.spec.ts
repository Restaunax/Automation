/**
 * gift-card-import.spec.ts — Admin → Cards & Codes → Gift Cards →
 * "Existing gift cards" (TC-499..TC-506).
 *
 * When a restaurant joins us having already sold gift cards, its customers are
 * still carrying live plastic. We adopt those numbers and balances so the cards
 * keep working — the money stays with the restaurant, which took it before we
 * existed, and we only track the balances.
 *
 * That makes an import LIVE MONEY created in one click, from a file nobody on
 * our side wrote. So these pin the three things that keep it safe: the preview
 * is a true dry run, the codes are adopted exactly as printed (15 digits, with
 * 0 and 1 — characters our own alphabet drops), and a mistake can be taken back
 * out. The last one matters more than it looks: GiftCard.code is unique across
 * the whole platform, so importing to the wrong restaurant burns those numbers
 * globally and the corrective import then fails every row.
 *
 * Own throwaway tenant; the panel is scoped by the page's ScopePicker.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  createAdminGiftCardImportPage,
  type AdminGiftCardImportPage,
} from "../../../pages/dashboard/admin/AdminGiftCardImportPage";
import { generateRunId } from "../../../utils/testData";
import { csvToObjects } from "../../../utils/csvHelper";
import {
  buildGiftCardCsv,
  giftCardCsvRows,
  giftCardCsvTotal,
  type GiftCardCsvRow,
} from "../../../utils/giftCardCsvFixture";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  putGiftCardConfigAdminRaw,
  previewGiftCardImportRaw,
  importGiftCardsRaw,
  listGiftCardImportsRaw,
  revertGiftCardImportRaw,
  exportGiftCardsCsvRaw,
  getGiftCardBalanceRaw,
  validateGiftCardPublicRaw,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

test.describe("Admin — Importing existing gift cards", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  const label = `Auto import ${runId}`;
  // Part-spent balances with cents, like a real handover file — these are what
  // is LEFT on each card, not what it was sold for.
  const rows: GiftCardCsvRow[] = giftCardCsvRows(runId, [30, 25.78, 1.8]);
  const total = giftCardCsvTotal(rows);
  const csv = buildGiftCardCsv(rows);

  let adminToken = "";
  let restaurantId = "";
  let restaurantName = "";
  let importId = "";
  let importPage: AdminGiftCardImportPage;

  const scope = () => ({ restaurantId });
  /** The fixture always has these rows; keeps the assertions free of `!`. */
  const row = (i: number): GiftCardCsvRow => rows[i] as GiftCardCsvRow;

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) {
      throw new Error(
        "[gift-card-import] could not mint the throwaway tenant restaurant"
      );
    }
    restaurantId = tenant.restaurantId;
    restaurantName = `Automation Owner2 Store ${runId}`;
    const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
      isEnabled: true,
    });
    if (!cfg.ok)
      throw new Error(
        `[gift-card-import] config write failed: ${msg(cfg.data)}`
      );
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    // Undo before archiving: an imported code is globally unique, so leaving
    // it behind would poison the number for any future run.
    if (importId) {
      await revertGiftCardImportRaw(adminToken, importId, scope()).catch(() => {
        /* already reverted by TC-505 */
      });
    }
    if (restaurantId && !process.env.OWNER2_EMAIL) {
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
        /* archive is best-effort; globalTeardown sweeps the user */
      });
    }
  });

  test.beforeEach(async ({ adminPage }) => {
    await allure.label("feature", "Gift cards — importing existing cards");
    await allure.label("severity", "critical");
    importPage = createAdminGiftCardImportPage(adminPage);
  });

  test("TC-499: the preview reports what would be created and writes nothing", async () => {
    await allure.description(
      "A dry run over the real handover shape: BOM, 'Card Number'/'Current " +
        "Balance' headers, 15-digit codes. Nothing may exist afterwards."
    );
    const preview = await previewGiftCardImportRaw(adminToken, scope(), csv);

    expect(preview.ok, `preview → ${preview.status}`).toBeTruthy();
    const plan = preview.data.data;
    expect(plan, "preview returned no plan").toBeTruthy();
    expect(plan).toMatchObject({
      willCreate: rows.length,
      willSkip: 0,
      totalValue: total,
    });
    // The columns were guessed, not configured.
    expect(plan?.mapping).toEqual({
      codeColumn: "Card Number",
      balanceColumn: "Current Balance",
    });
    expect(plan?.problems ?? []).toHaveLength(0);

    // A dry run that wrote something is not a dry run.
    const balance = await getGiftCardBalanceRaw(row(0).code);
    expect(balance.status, "preview must not create cards").toBe(404);
  });

  test("TC-500: importing through the panel creates spendable cards", async () => {
    await importPage.goto(restaurantName);
    await importPage.openImport();

    const preview = await importPage.chooseFile(csv, `${label}.csv`);
    expect(preview.data.willCreate).toBe(rows.length);

    // What the admin is shown before committing is what they are agreeing to.
    await expect(
      importPage.reviewChip(`${rows.length} cards to import`)
    ).toBeVisible();
    await expect(
      importPage.reviewChip(`$${total.toFixed(2)} in balances`)
    ).toBeVisible();

    const result = await importPage.confirmImport(rows.length);
    importId = result.data.importId;
    expect(result.data.created).toBe(rows.length);
    await importPage.closeWizard();

    // The point of the whole feature: their customer's card now works.
    const balance = await getGiftCardBalanceRaw(row(1).code);
    expect(balance.status, JSON.stringify(balance.data)).toBe(200);
    expect((balance.data as { data: unknown }).data).toMatchObject({
      currentBalance: row(1).balance,
      status: "ACTIVE",
    });
  });

  test("TC-501: an imported card is redeemable at the restaurant that imported it", async () => {
    const validated = await validateGiftCardPublicRaw(
      row(0).code,
      restaurantId
    );
    expect(validated.status, JSON.stringify(validated.data)).toBe(200);
    expect((validated.data as { data: unknown }).data).toMatchObject({
      valid: true,
    });
  });

  test("TC-502: re-uploading the same file changes nothing", async () => {
    await allure.description(
      "Idempotency is what makes a nervous admin able to retry. A second " +
        "import of the same codes must skip, never double a customer's balance."
    );
    const preview = await previewGiftCardImportRaw(adminToken, scope(), csv);

    expect(preview.data.data).toMatchObject({
      willCreate: 0,
      willSkip: rows.length,
    });

    const again = await importGiftCardsRaw(adminToken, scope(), csv);
    expect(again.ok).toBeTruthy();
    expect(again.data.data).toMatchObject({ created: 0, skipped: rows.length });

    const balance = await getGiftCardBalanceRaw(row(1).code);
    expect(
      (balance.data as { data: { currentBalance: number } }).data
        .currentBalance,
      "a re-import must not top the card up"
    ).toBe(row(1).balance);
  });

  test("TC-503: a bad row is reported and the good rows still import", async () => {
    const mixed = buildGiftCardCsv([
      { code: `${row(0).code.slice(0, 11)}9001`, balance: 12.5 },
      { code: "", balance: 5 },
    ]).replace("\r\n\r\n", "\r\n");
    const preview = await previewGiftCardImportRaw(adminToken, scope(), mixed);

    expect(preview.ok, "row problems belong inside a 200").toBeTruthy();
    const plan = preview.data.data;
    expect(plan?.willCreate).toBe(1);
    expect(plan?.problems ?? []).not.toHaveLength(0);
    // Row numbers are what the admin reads off their own spreadsheet, so the
    // header has to count as row 1.
    expect(plan?.problems?.[0]?.row ?? 0).toBeGreaterThan(1);
  });

  test("TC-504: the export hands back every imported balance", async () => {
    const csvOut = await exportGiftCardsCsvRaw(adminToken, scope());
    expect(csvOut.ok, `export → ${csvOut.status}`).toBeTruthy();

    const parsed = csvToObjects(
      String(csvOut.data).replace(/^\uFEFF/, "")
    ).rows;
    const mine = parsed.filter((r) => r.code === row(0).code);
    expect(mine, "the imported card must be in the file").toHaveLength(1);
    expect(mine[0]?.source).toBe("imported");
    // Shown exactly as printed: we do not know how the previous system grouped
    // it, so inventing `9532-3441-...` would misrepresent the card.
    expect(mine[0]?.code_display).toBe(row(0).code);

    const exportedTotal = parsed
      .filter((r) => r.source === "imported")
      .reduce((sum, r) => sum + Number(r.current_balance), 0);
    expect(Math.round(exportedTotal * 100) / 100).toBe(total);
  });

  test("TC-505: undoing an import frees the numbers for a corrective import", async () => {
    await allure.description(
      "GiftCard.code is unique platform-wide, so importing to the wrong " +
        "restaurant burns the numbers everywhere and the corrective import " +
        "fails every row. Undo is the only way out of that without SQL."
    );
    const before = await listGiftCardImportsRaw(adminToken, scope());
    expect(before.data.data?.find((i) => i.id === importId)).toMatchObject({
      usedCardCount: 0,
      revertable: true,
    });

    const reverted = await revertGiftCardImportRaw(
      adminToken,
      importId,
      scope()
    );
    expect(reverted.ok, `revert → ${reverted.status}`).toBeTruthy();
    expect(reverted.data.data?.deletedCards).toBe(rows.length);

    // The card is gone, and its number is available again.
    const balance = await getGiftCardBalanceRaw(row(0).code);
    expect(balance.status).toBe(404);
    const preview = await previewGiftCardImportRaw(adminToken, scope(), csv);
    expect(preview.data.data?.willCreate).toBe(rows.length);

    importId = "";
  });

  test("TC-506: an import cannot be reverted twice", async () => {
    // Re-import so this test owns its own row rather than depending on order.
    const fresh = await importGiftCardsRaw(adminToken, scope(), csv);
    expect(fresh.ok).toBeTruthy();
    const freshId = fresh.data.data?.importId ?? "";
    expect(freshId).not.toBe("");

    const first = await revertGiftCardImportRaw(adminToken, freshId, scope());
    expect(first.ok).toBeTruthy();

    const second = await revertGiftCardImportRaw(adminToken, freshId, scope());
    expect(second.ok, "a second revert has nothing to delete").toBeFalsy();
    expect(second.status).toBe(404);
  });
});
