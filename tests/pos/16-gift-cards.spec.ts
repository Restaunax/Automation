/**
 * 16-gift-cards.spec.ts — gift cards at the register: sold, activated from
 * stock, voided, spent, and what the owner owes on them
 * (docs/COVERAGE_MAP.md G12) (TC-1059..1065).
 *
 * No browser: the POS is played through its own API, as device-in-store's
 * gift card sheets call it. A per-run throwaway restaurant (7% tax, table
 * service, a Stripe TEST account, gift cards on with cash and physical
 * activation, a REGISTER device) and a minted batch of two printed cards.
 * Every sale is cash: the drawer is the point (a card-tender sale needs a
 * reader). The owner holds the drawer; Dee is a Staff-role server.
 *
 *   TC-1059 A $25 card is sold for cash and printed: the full code comes back
 *           once, the card holds $25 and the owner owes $25 on 1 card.
 *   TC-1060 A sale is refused in words: no tender, an emailed card with no
 *           email, an amount the restaurant doesn't allow.
 *   TC-1061 A printed card from stock: the scan says it can be activated
 *           and has nothing on it; $40 cash activates it; the same tap again
 *           loads nothing more.
 *   TC-1062 A mistaken $30 sale is voided: the drawer's list names it SOLD;
 *           Dee may not void (it hands money back); the owner voids it, the
 *           card is dead, and voiding again is refused in words.
 *   TC-1063 A guest spends $12.84 of the $25 card online; $12.16 is left.
 *   TC-1064 The $40 card pays a $12.84 check at the register; $27.16 is
 *           left; its load can't be voided any more, in words.
 *   TC-1065 The drawer counts out to the cent (the $95 of gift card cash
 *           taken, less the $30 handed back) and the owner owes $39.32 on
 *           2 cards.
 */
import { randomUUID } from "crypto";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import { csvToObjects } from "../../utils/csvHelper";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsApi,
  ensureTaxRate,
  ensureBusinessHours,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  openRegisterSessionPos,
  closeRegisterSessionPosRaw,
  createTabletOrderRaw,
  apiRequestRaw,
  putGiftCardConfigAdminRaw,
  createGiftCardBatchRaw,
  exportGiftCardBatchCsvRaw,
  freezeGiftCardBatchRaw,
  getOwnerGiftCardSummaryRaw,
  getGiftCardBalanceRaw,
  type LooseJson,
} from "../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const err = (data: unknown) => {
  const d = data as Rec | undefined;
  return String(d?.error ?? d?.message ?? "");
};
const dataOf = (data: unknown) =>
  ((data as Rec | undefined)?.data ?? {}) as Rec;

test.describe.configure({ mode: "serial" });

test.describe("POS gift cards (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tablet = "";
  let ownerToken = "";
  let batchId = "";
  let sessionId = "";
  let owner = { id: "", session: "" };
  const dee = { id: "", pin: "4826", session: "" };
  const burger = { id: "", name: "Burger", price: 12 };
  /** The $25 card sold in TC-1059 (full code). */
  let sold = { id: "", code: "" };
  /** The printed stock card activated in TC-1061. */
  const printed = { code: "", transactionId: "" };
  /** The second printed card, never sold. */
  let spareCode = "";

  const pos = (method: "GET" | "POST", path: string, body?: Rec) =>
    tabletRaw<Rec>(tablet, method, path, body, owner.session);
  const sell = (body: Rec) => pos("POST", "/gift-cards/sell", body);
  /** A burger at 7% tax: $12.84. */
  const burgerLine = {
    menuItemId: "",
    menuItemName: burger.name,
    quantity: 1,
    price: 12,
  };
  const liability = async () => {
    const r = await getOwnerGiftCardSummaryRaw(ownerToken, restaurantId);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data;
  };
  const balanceOf = async (code: string) => {
    const r = await getGiftCardBalanceRaw(code);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return Number(((r.data as Rec).data as Rec).currentBalance);
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[gift-cards] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    await ensureTaxRate(ownerToken, restaurantId, 7);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await ensureBusinessHours(ownerToken, restaurantId);
    const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
    if (onboard.status !== 200)
      throw new Error(`[gift-cards] stripe: ${JSON.stringify(onboard.data)}`);
    const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
      isEnabled: true,
      allowPhysicalActivation: true,
      allowCashFunding: true,
    });
    if (!cfg.ok)
      throw new Error(`[gift-cards] config: ${JSON.stringify(cfg.data)}`);
    const batch = await createGiftCardBatchRaw(adminToken, {
      restaurantId,
      quantity: 2,
      label: `Auto POS stock ${runId}`,
    });
    if (!batch.ok || !batch.data.data)
      throw new Error(`[gift-cards] batch: ${JSON.stringify(batch.data)}`);
    batchId = batch.data.data.id;
    const csv = await exportGiftCardBatchCsvRaw(adminToken, batchId);
    const codes = csvToObjects(String(csv.data)).rows.map((r) => r.code ?? "");
    if (codes.length !== 2)
      throw new Error(`[gift-cards] export: ${String(csv.data)}`);
    printed.code = codes[0] ?? "";
    spareCode = codes[1] ?? "";

    const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
      restaurantId,
    });
    burger.id = (
      await createMenuItemFull(ownerToken, food.id, burger.name, burger.price)
    ).id;
    burgerLine.menuItemId = burger.id;

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-gift-${runId}`
    );
    deviceId = device.id;
    tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(ownerToken, restaurantId, "8462");
    owner = {
      id: ownerMember,
      session: await tabletStaffSignIn(tablet, ownerMember, "8462"),
    };
    const added = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/staff/manage",
      { firstName: "Dee", lastName: "Server", pin: dee.pin },
      owner.session
    );
    if (added.status !== 201)
      throw new Error(`[gift-cards] staff: ${JSON.stringify(added.data)}`);
    dee.id = String((added.data.data as Rec).id);
    dee.session = await tabletStaffSignIn(tablet, dee.id, dee.pin);
    sessionId = await openRegisterSessionPos(tablet, owner.session, 100);
  });

  test.afterAll(async () => {
    if (adminToken && batchId)
      await freezeGiftCardBatchRaw(adminToken, batchId).catch(() => {});
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
          () => {}
        );
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS gift cards");
    await allure.label("severity", "critical");
  });

  test("TC-1059: a $25 card sold for cash — the code comes back once, and the owner owes $25", async () => {
    const r = await sell({
      amount: 25,
      tender: "CASH",
      deliveryMethod: "PHYSICAL",
      idempotencyKey: `gift-${runId}-sell-25`,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    const d = dataOf(r.data);
    expect(String(d.code)).toMatch(/^[A-Z0-9]{16}$/);
    expect(d).toMatchObject({ balance: 25, alreadyExisted: false });
    sold = { id: String(d.giftCardId), code: String(d.code) };
    // What the receipt shows: only the last four.
    expect(d.displayCode).toBe(`****-****-****-${sold.code.slice(-4)}`);

    expect(await balanceOf(sold.code)).toBe(25);
    expect(await liability()).toMatchObject({
      outstandingBalance: 25,
      cardCount: 1,
    });
  });

  test("TC-1060: a sale is refused in words — no tender, an emailed card with no email, an amount not allowed", async () => {
    const noTender = await sell({ amount: 25, deliveryMethod: "PHYSICAL" });
    expect(noTender.status).toBe(400);
    expect(err(noTender.data)).toBe("Choose card or cash for this load.");

    const noEmail = await sell({
      amount: 25,
      tender: "CASH",
      deliveryMethod: "EMAIL",
      idempotencyKey: `gift-${runId}-no-email`,
    });
    expect(noEmail.status).toBe(400);
    expect(err(noEmail.data)).toBe(
      "Enter the customer's email, or sell the card as a printed receipt."
    );

    const tooMuch = await sell({
      amount: 100000,
      tender: "CASH",
      deliveryMethod: "PHYSICAL",
      idempotencyKey: `gift-${runId}-too-much`,
    });
    expect(tooMuch.status).toBe(400);
    expect(err(tooMuch.data)).toBe(
      "That amount is outside what this restaurant allows."
    );
    // Nothing was sold by any of them.
    expect((await liability()).cardCount).toBe(1);
  });

  test("TC-1061: a printed card from stock is scanned, activated with $40 cash, and the same tap again loads nothing more", async () => {
    const scan = await pos("POST", "/gift-cards/lookup", {
      code: printed.code,
    });
    expect(scan.status, JSON.stringify(scan.data)).toBe(200);
    expect(dataOf(scan.data)).toMatchObject({
      status: "INACTIVE",
      currentBalance: 0,
      usableHere: true,
      activatable: true,
      displayCode: `****-****-****-${printed.code.slice(-4)}`,
    });
    // The response never repeats the full code (it's a bearer credential).
    expect(JSON.stringify(scan.data)).not.toContain(printed.code);

    const key = `gift-${runId}-activate-40`;
    const activated = await pos("POST", "/gift-cards/activate", {
      code: printed.code,
      amount: 40,
      tender: "CASH",
      idempotencyKey: key,
    });
    expect(activated.status, JSON.stringify(activated.data)).toBe(201);
    expect(dataOf(activated.data)).toMatchObject({
      kind: "ACTIVATED",
      balance: 40,
    });
    printed.transactionId = String(dataOf(activated.data).transactionId);

    const again = await pos("POST", "/gift-cards/activate", {
      code: printed.code,
      amount: 40,
      tender: "CASH",
      idempotencyKey: key,
    });
    expect(again.status, JSON.stringify(again.data)).toBe(200);
    expect(dataOf(again.data)).toMatchObject({ balance: 40 });
    expect(await balanceOf(printed.code)).toBe(40);
  });

  test("TC-1062: a mistaken $30 sale is voided by the owner — Dee may not, and nobody voids twice", async () => {
    const mistake = await sell({
      amount: 30,
      tender: "CASH",
      deliveryMethod: "PHYSICAL",
      idempotencyKey: `gift-${runId}-sell-30`,
    });
    expect(mistake.status, JSON.stringify(mistake.data)).toBe(201);
    const card = dataOf(mistake.data);

    const loads = await pos("GET", `/gift-cards/loads?sessionId=${sessionId}`);
    expect(loads.status, JSON.stringify(loads.data)).toBe(200);
    const rows = (loads.data.data ?? []) as Rec[];
    const kinds = rows.map((r) => `${r.kind} ${r.amount}`).sort();
    expect(kinds).toEqual(["ACTIVATED 40", "SOLD 25", "SOLD 30"]);

    const voidPath = `/gift-cards/loads/${card.transactionId}/void`;
    const byDee = await tabletRaw<Rec>(
      tablet,
      "POST",
      voidPath,
      { idempotencyKey: randomUUID() },
      dee.session
    );
    expect(byDee.status).toBe(400);
    expect(err(byDee.data)).toBe("A manager PIN is required.");

    const voided = await pos("POST", voidPath, {
      idempotencyKey: `gift-${runId}-void-30`,
    });
    expect(voided.status, JSON.stringify(voided.data)).toBe(200);
    expect(dataOf(voided.data)).toMatchObject({
      newStatus: "INACTIVE",
      balance: 0,
      refundedToCard: false,
    });
    const twice = await pos("POST", voidPath, {
      idempotencyKey: `gift-${runId}-void-30-again`,
    });
    expect(twice.status).toBe(409);
    expect(err(twice.data)).toBe("That load was already voided.");
  });

  test("TC-1063: a guest spends $12.84 of the $25 card online; $12.16 is left", async () => {
    const order = await apiRequestRaw<Rec>(
      "POST",
      `/api/order/new/restaurantId/${restaurantId}`,
      {
        restaurantId,
        orderType: "PICKUP",
        subtotal: 12,
        tax: 0.84,
        tip: 0,
        total: 12.84,
        customerEmail: `auto-guest-${runId}@restaunax-test.com`,
        customerPhone: "5555550123",
        firstName: "Gia",
        lastName: "Guest",
        giftCardCode: sold.code,
        giftCardAmountUsed: 12.84,
        orderItems: [burgerLine],
      }
    );
    expect(order.status, JSON.stringify(order.data)).toBe(201);
    // Fully covered: nothing left to pay, so the order is paid at once.
    expect(order.data).toMatchObject({
      paymentStatus: "COMPLETED",
      giftCardAmountUsed: 12.84,
      total: 0,
    });
    // The card is debited right after the order is placed (in the background).
    await expect
      .poll(() => balanceOf(sold.code), { timeout: 20_000 })
      .toBe(12.16);
  });

  test("TC-1064: the $40 card pays a $12.84 check at the register; its load can't be voided any more", async () => {
    const check = await createTabletOrderRaw(tablet, owner.session, {
      restaurantId,
      orderType: "DINE_IN",
      subtotal: 12,
      tax: 0.84,
      tip: 0,
      total: 12.84,
      customerPhone: "",
      orderItems: [burgerLine],
      openCheck: true,
      tableName: "T3",
      guestCount: 1,
    });
    expect(check.status, JSON.stringify(check.data)).toBe(201);
    const paid = await pos(
      "POST",
      `/orders/${check.data.id}/tab/settle-gift-card`,
      {
        code: printed.code,
        amount: 12.84,
        idempotencyKey: `gift-${runId}-tab`,
      }
    );
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    expect(paid.data).toMatchObject({ closed: true, cardBalance: 27.16 });

    const voidSpent = await pos(
      "POST",
      `/gift-cards/loads/${printed.transactionId}/void`,
      { idempotencyKey: `gift-${runId}-void-40` }
    );
    expect(voidSpent.status).toBe(409);
    expect(err(voidSpent.data)).toBe(
      "Some of that balance has already been spent, so the load cannot be voided."
    );
  });

  test("TC-1065: the drawer counts out to the cent, and the owner owes $39.32 on 2 cards", async () => {
    // $100 float + $25 + $40 + $30 of gift card cash − $30 handed back.
    const counted = await closeRegisterSessionPosRaw(tablet, owner.session, {
      countedCash: 165,
    });
    expect(counted.status, JSON.stringify(counted.data)).toBe(200);
    expect(counted.data.data).toMatchObject({
      expectedCash: 165,
      overShort: 0,
    });
    expect(await liability()).toMatchObject({
      outstandingBalance: 39.32,
      cardCount: 2,
    });
    // The unsold stock card still holds nothing.
    expect(await balanceOf(spareCode)).toBe(0);
  });
});
