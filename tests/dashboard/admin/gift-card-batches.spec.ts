/**
 * gift-card-batches.spec.ts — Admin → Cards & Codes → Gift Cards →
 * "Physical card stock" (TC-469..476).
 *
 * Pre-printed physical cards minted by hand (for a printer the restaurant
 * already uses, or a run that did not go through the shop). A batch is codes,
 * not money: every card is INACTIVE with a zero balance until a register
 * loads it. These pin the panel (mint / export / freeze), the CSV contract
 * the printers read, what the PUBLIC gift-card endpoints say about stock, and
 * that no admin path can put balance on a card nobody paid for.
 *
 * Own throwaway tenant; the panel is scoped by the page's ScopePicker.
 */
import * as fs from "fs";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  createAdminGiftCardBatchesPage,
  type AdminGiftCardBatchesPage,
} from "../../../pages/dashboard/admin/AdminGiftCardBatchesPage";
import { generateRunId } from "../../../utils/testData";
import { csvToObjects } from "../../../utils/csvHelper";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  putGiftCardConfigAdminRaw,
  getGiftCardConfigAdminRaw,
  createGiftCardBatchRaw,
  listGiftCardBatchesRaw,
  freezeGiftCardBatchRaw,
  listGiftCardsAdminRaw,
  unfreezeGiftCardRaw,
  adjustGiftCardBalanceRaw,
  getGiftCardBalanceRaw,
  validateGiftCardPublicRaw,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{16}$/;

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

test.describe("Admin — Physical gift card batches", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  const label = `Auto batch ${runId}`;
  let adminToken = "";
  let restaurantId = "";
  let restaurantName = "";
  let batchId = "";
  let codes: string[] = [];
  let batches: AdminGiftCardBatchesPage;

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) {
      throw new Error(
        "[gift-card-batches] could not mint the throwaway tenant restaurant"
      );
    }
    restaurantId = tenant.restaurantId;
    restaurantName = `Automation Owner2 Store ${runId}`;
    const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
      isEnabled: true,
    });
    if (!cfg.ok)
      throw new Error(
        `[gift-card-batches] config write failed: ${msg(cfg.data)}`
      );
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    // Stock that never sold is frozen so the codes can never be loaded.
    if (batchId) {
      await freezeGiftCardBatchRaw(adminToken, batchId).catch(() => {
        /* already frozen by TC-473 — nothing to do */
      });
    }
    if (restaurantId && !process.env.OWNER2_EMAIL) {
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
        /* archive is best-effort; globalTeardown sweeps the user */
      });
    }
  });

  test.beforeEach(async ({ adminPage }) => {
    await allure.label("feature", "Gift cards — physical stock");
    await allure.label("severity", "critical");
    batches = createAdminGiftCardBatchesPage(adminPage);
  });

  test("TC-469: 'Mint a batch' creates INACTIVE stock — 5 cards, 5 in stock, none sold", async () => {
    await batches.goto(restaurantName);
    const minted = await batches.mintBatch({
      label,
      quantity: 5,
      vendorRef: `PO-${runId}`,
    });
    batchId = minted.data.id;
    await expect(batches.stockText(label, 5)).toBeVisible();

    const list = await listGiftCardBatchesRaw(adminToken, restaurantId);
    const row = list.data.data.find((b) => b.id === batchId);
    expect(row).toMatchObject({
      label,
      quantity: 5,
      status: "DRAFT",
      exportCount: 0,
      counts: { inactive: 5, active: 0, depleted: 0, frozen: 0 },
    });
  });

  test("TC-470: 'Card export' downloads the printer's data file for the batch", async () => {
    await batches.goto(restaurantName);
    const download = await batches.exportCsv(label);
    expect(download.suggestedFilename()).toMatch(/^gift-cards-.*\.csv$/);
    const text = fs.readFileSync(await download.path(), "utf8");
    const { header, rows } = csvToObjects(text);
    expect(header).toEqual([
      "sequence",
      "code",
      "code_display",
      "barcode_value",
      "card_last4",
      "batch_id",
      "batch_label",
      "scope_type",
      "scope_name",
    ]);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.code).toMatch(CODE_RE);
      expect(row.barcode_value).toBe(row.code);
      expect(row.batch_id).toBe(batchId);
      expect(row.scope_type).toBe("restaurant");
      expect(row.scope_name).toBe(restaurantName);
    }
    // Free text is always quoted — printers' importers are unforgiving of spaces.
    expect(text).toContain(`"${label}"`);
    expect(text).toContain(`"${restaurantName}"`);
    codes = rows.map((r) => r.code ?? "");

    const list = await listGiftCardBatchesRaw(adminToken, restaurantId);
    expect(list.data.data.find((b) => b.id === batchId)).toMatchObject({
      status: "EXPORTED",
      exportCount: 1,
    });
  });

  test("TC-471: to the public, a stock card is a real card with nothing on it — not an unknown code", async () => {
    await allure.description(
      "balance → 200 + INACTIVE (so 'minted but unloaded' is distinguishable from a 404 typo); validate → " +
        "valid:false with the not-activated wording; a random well-formed code → 404."
    );
    const code = codes[0] ?? "";
    const balance = await getGiftCardBalanceRaw(code);
    expect(balance.status, JSON.stringify(balance.data)).toBe(200);
    expect((balance.data as { data: unknown }).data).toMatchObject({
      currentBalance: 0,
      initialBalance: 0,
      status: "INACTIVE",
    });

    const validate = await validateGiftCardPublicRaw(code, restaurantId);
    expect(validate.status).toBe(200);
    expect(validate.data.data.valid).toBe(false);
    expect(validate.data.data.reason).toMatch(
      /not been activated|not activated/i
    );

    const unknown = await getGiftCardBalanceRaw("ZZZZYYYYXXXXWWWW");
    expect(unknown.status).toBe(404);
  });

  test("TC-472: an admin balance adjustment cannot fund stock — that would mint money nobody paid for", async () => {
    const cards = await listGiftCardsAdminRaw(adminToken, {
      restaurantId,
      batchId,
    });
    expect(cards.status, JSON.stringify(cards.data)).toBe(200);
    const card = cards.data.data.giftCards[0];
    expect(card, "a card from the batch").toBeTruthy();
    const adjust = await adjustGiftCardBalanceRaw(
      adminToken,
      card!.id,
      25,
      `automation ${runId}`
    );
    expect(adjust.status, JSON.stringify(adjust.data)).toBe(409);
    expect(adjust.data.code).toBe("NOT_ACTIVATABLE");
  });

  test("TC-473: 'Freeze stock' freezes every unsold card in the batch; freezing again finds nothing", async () => {
    await batches.goto(restaurantName);
    const frozen = await batches.freezeStock(label);
    expect(frozen.data.frozen).toBe(5);
    await expect(batches.frozenText(label, 5)).toBeVisible();

    const list = await listGiftCardBatchesRaw(adminToken, restaurantId);
    expect(list.data.data.find((b) => b.id === batchId)).toMatchObject({
      status: "FROZEN",
      counts: { inactive: 0, frozen: 5 },
    });
    const again = await freezeGiftCardBatchRaw(adminToken, batchId);
    expect(again.data.data?.frozen).toBe(0);
  });

  test("TC-474: unfreezing a stock card restores INACTIVE — never ACTIVE, which would make it redeemable with no balance", async () => {
    const frozenCards = await listGiftCardsAdminRaw(adminToken, {
      restaurantId,
      batchId,
      status: "FROZEN",
    });
    const card = frozenCards.data.data.giftCards[0];
    expect(card, "a frozen card").toBeTruthy();
    const thawed = await unfreezeGiftCardRaw(adminToken, card!.id);
    expect(thawed.status, JSON.stringify(thawed.data)).toBe(200);

    const inactive = await listGiftCardsAdminRaw(adminToken, {
      restaurantId,
      batchId,
      status: "INACTIVE",
    });
    expect(inactive.data.data.giftCards.map((c) => c.id)).toContain(card!.id);
  });

  test("TC-475: batch quantity is validated — 0 and 5,001 are refused before a single card is minted", async () => {
    const zero = await createGiftCardBatchRaw(adminToken, {
      restaurantId,
      quantity: 0,
      label: `zero ${runId}`,
    });
    expect(zero.status, JSON.stringify(zero.data)).toBe(400);
    expect(zero.data.code).toBe("INVALID_QUANTITY");
    // 5,000 is the cap; 5,001 is refused. (Never mint 5,000 on QA — cost and rate limits.)
    const huge = await createGiftCardBatchRaw(adminToken, {
      restaurantId,
      quantity: 5001,
      label: `huge ${runId}`,
    });
    expect(huge.status, JSON.stringify(huge.data)).toBe(400);
    expect(huge.data.code).toBe("BATCH_TOO_LARGE");

    const list = await listGiftCardBatchesRaw(adminToken, restaurantId);
    expect(list.data.data.filter((b) => b.label.includes(runId))).toHaveLength(
      1
    );
  });

  test("TC-476: the physical-card knobs round-trip through the config endpoint (cash off, custom cap)", async () => {
    await allure.description(
      "allowPhysicalActivation / allowCashFunding / maxCashFloatPerLocation are what the POS load path " +
        "reads. PUT stores them, GET returns them, and a negative cap is refused."
    );
    const put = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
      allowPhysicalActivation: true,
      allowCashFunding: false,
      maxCashFloatPerLocation: 750,
    });
    expect(put.status, JSON.stringify(put.data)).toBe(200);
    const get = await getGiftCardConfigAdminRaw(adminToken, restaurantId);
    expect(get.data.data).toMatchObject({
      isEnabled: true,
      allowPhysicalActivation: true,
      allowCashFunding: false,
      maxCashFloatPerLocation: 750,
    });
    const bad = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
      maxCashFloatPerLocation: -1,
    });
    expect(bad.status, JSON.stringify(bad.data)).toBe(400);
  });
});
