/**
 * 26-send-receipt.spec.ts — staff and owners send the receipt of any paid
 * order, download a clean customer PDF, and find a walk-in by card or amount
 * (TC-2058..TC-2065). The portal half is
 * tests/dashboard/owner/order-receipt-download.spec.ts (TC-2066).
 *
 * RestauNax feat/send-receipt (docs/features/RECEIPTS.md). No browser: the POS
 * is played through its own API. A per-run throwaway restaurant with a
 * REGISTER device (the owner signed in with a PIN, drawer open) and a KIOSK
 * device; a second restaurant's owner is the stranger.
 *
 * Local-stack only: backdating an order and setting its card last 4 go through
 * the local database (E2E_LOCAL_DATABASE_URL, localhost only), and the sent
 * email is read from the local Mailpit. Both are absent on QA, so the file
 * skips there. SMS is off locally (no Twilio), so it is asserted only where it
 * is refused (bad number); every success path uses email.
 *
 *   TC-2058 staff on a register email the receipt of a 30-day-old paid order; the history row is masked.
 *   TC-2059 a kiosk may send a fresh order but not one older than 24h; a register without a staff session gets 401.
 *   TC-2060 a refunded order still sends, and its /r/ page shows the refund.
 *   TC-2061 an open check is refused (400, notPaid).
 *   TC-2062 the 4th send of one receipt on one channel in an hour answers 429.
 *   TC-2063 another restaurant's owner gets 403 on send, history and PDF.
 *   TC-2064 the PDF is application/pdf and shows no Stripe fee or "Net to you".
 *   TC-2065 owner search by card last 4 and by amount finds the walk-in order.
 */
import { execFileSync } from "child_process";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import { localDbReady, localSql } from "../../utils/reservationPhase4Api";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  createTabletDevice,
  createTabletOrderRaw,
  deactivateTabletDevice,
  deleteTestRestaurant,
  ensureBusinessHours,
  getReceiptPdfOwnerRaw,
  getReceiptSendsOwnerRaw,
  listOrdersRaw,
  openRegisterSessionPos,
  sendReceiptOwnerRaw,
  sendReceiptTabletRaw,
  setOwnerPosPin,
  settleTabCashRaw,
  updateRestaurantSettingsApi,
  tabletLogin,
  tabletStaffSignIn,
  updateDeviceModeOwnerRaw,
  BACKEND_URL,
  type ApiMenuItem,
} from "../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";
const MAILPIT = process.env.MAILPIT_LOCAL_URL ?? "http://localhost:8025";

/** A price no other order in the throwaway tenant shares, so an amount search finds one. */
const PRICE = 13.37;
const PIN = "8462";

test.describe.configure({ mode: "serial" });

test.describe("Send any receipt (API)", { tag: ["@send-receipt"] }, () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !localDbReady(),
    "needs ADMIN_* and E2E_LOCAL_DATABASE_URL (local stack only)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let rid = "";
  let strangerToken = "";
  let strangerRid = "";
  let item: ApiMenuItem;
  let registerId = "";
  let kioskId = "";
  let register = "";
  let kiosk = "";
  let staffSession = "";
  let mailSeq = 0;

  const mail = () => `auto-receipt-${runId}-${++mailSeq}@${EMAIL_DOMAIN}`;
  const body = (extra: Record<string, unknown> = {}) => ({
    restaurantId: rid,
    orderType: "PICKUP",
    paymentMethod: "CASH",
    subtotal: PRICE,
    tax: 0,
    tip: 0,
    processingFee: 0,
    total: PRICE,
    customerPhone: "",
    orderItems: [
      {
        menuItemId: item.id,
        menuItemName: item.name,
        quantity: 1,
        price: PRICE,
      },
    ],
    ...extra,
  });
  let tableSeq = 0;
  /** A table check, open: nothing paid yet. */
  const openCheck = async () => {
    const r = await createTabletOrderRaw(
      register,
      staffSession,
      body({
        paymentMethod: undefined,
        openCheck: true,
        tableName: `R${runId}-${++tableSeq}`,
        guestCount: 2,
      })
    );
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    return r.data.id!;
  };
  /** An order paid in full in cash at the register. */
  const paidOrder = async () => {
    const id = await openCheck();
    const s = await settleTabCashRaw(register, staffSession, id, {
      amount: PRICE,
      cashTendered: 20,
      idempotencyKey: `rcpt-${runId}-${id}`,
    });
    expect(s.status, JSON.stringify(s.data)).toBe(200);
    return id;
  };
  /** Move an order's creation time back (local database only). */
  const age = (orderId: string, interval: string) =>
    localSql(
      `update "Order" set "createdAt" = now() - interval '${interval}' where id = '${orderId}'`
    );
  /** True once Mailpit holds a message to `to`. */
  const mailArrived = async (to: string) => {
    for (let i = 0; i < 15; i++) {
      const r = await fetch(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`
      );
      const j = (await r.json()) as { messages_count?: number };
      if ((j.messages_count ?? 0) > 0) return true;
      await new Promise((res) => setTimeout(res, 500));
    }
    return false;
  };
  const sends = async (orderId: string) => {
    const r = await getReceiptSendsOwnerRaw(ownerToken, orderId);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.sends as {
      channel: string;
      to: string;
      source: string;
      succeeded: boolean;
    }[];
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[receipt] no tenant");
    rid = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const other = await createSecondOwner(adminToken, `${runId}x`, {
      alwaysFresh: true,
    });
    strangerToken = other.accessToken;
    strangerRid = other.restaurantId ?? "";
    await ensureBusinessHours(ownerToken, rid);
    await updateRestaurantSettingsApi(ownerToken, rid, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });

    const group = await createMenuGroupNamed(ownerToken, `Receipt ${runId}`, {
      restaurantId: rid,
    });
    item = await createMenuItemFull(
      ownerToken,
      group.id,
      `Receipt Burger ${runId}`,
      PRICE
    );

    const reg = await createTabletDevice(adminToken, rid, `rcpt-reg-${runId}`);
    registerId = reg.id;
    expect(
      (await updateDeviceModeOwnerRaw(adminToken, rid, reg.id, "REGISTER")).ok
    ).toBe(true);
    register = await tabletLogin(reg.name, reg.code);
    const kio = await createTabletDevice(adminToken, rid, `rcpt-kio-${runId}`);
    kioskId = kio.id;
    expect(
      (await updateDeviceModeOwnerRaw(adminToken, rid, kio.id, "KIOSK")).ok
    ).toBe(true);
    kiosk = await tabletLogin(kio.name, kio.code);

    const member = await setOwnerPosPin(ownerToken, rid, PIN);
    staffSession = await tabletStaffSignIn(register, member, PIN);
    await openRegisterSessionPos(register, staffSession, 100);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    for (const id of [registerId, kioskId])
      if (id) await deactivateTabletDevice(adminToken, rid, id).catch(() => {});
    for (const id of [rid, strangerRid])
      if (id) await deleteTestRestaurant(adminToken, id).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Send any receipt");
    await allure.label("severity", "critical");
  });

  test("TC-2058: staff on a register email the receipt of a 30-day-old paid order; the history row is masked", async () => {
    const id = await paidOrder();
    age(id, "30 days");
    const to = mail();
    const r = await sendReceiptTabletRaw(register, staffSession, id, {
      channel: "email",
      to,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.send).toMatchObject({
      channel: "email",
      source: "POS",
      succeeded: true,
    });
    expect(r.data.send.to).not.toContain(to);
    expect(r.data.send.to).toMatch(/^a•••@/);
    expect(await mailArrived(to), "the email reached Mailpit").toBe(true);
    const rows = await sends(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "POS", succeeded: true });
    // SMS is off locally: the refusal path is still the real one.
    const bad = await sendReceiptTabletRaw(register, staffSession, id, {
      channel: "sms",
      to: "123",
    });
    expect(bad.status, JSON.stringify(bad.data)).toBe(400);
  });

  test("TC-2059: a kiosk may send a fresh order but not one older than 24h; a register without a staff session gets 401", async () => {
    const fresh = await paidOrder();
    const ok = await sendReceiptTabletRaw(kiosk, undefined, fresh, {
      channel: "email",
      to: mail(),
    });
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    expect(ok.data.send).toMatchObject({ source: "KIOSK", succeeded: true });

    const old = await paidOrder();
    age(old, "25 hours");
    const refused = await sendReceiptTabletRaw(kiosk, undefined, old, {
      channel: "email",
      to: mail(),
    });
    expect(refused.status, JSON.stringify(refused.data)).toBe(400);
    expect(refused.data.success).toBe(false);
    // The same order, from the register with a staff session, has no age limit.
    const staff = await sendReceiptTabletRaw(register, staffSession, old, {
      channel: "email",
      to: mail(),
    });
    expect(staff.status, JSON.stringify(staff.data)).toBe(200);

    const noSession = await sendReceiptTabletRaw(register, undefined, fresh, {
      channel: "email",
      to: mail(),
    });
    expect(noSession.status).toBe(401);
    expect(noSession.data.errorCode).toBe("sessionRequired");
  });

  test("TC-2060: a refunded order still sends, and its /r/ page shows the refund", async () => {
    const id = await paidOrder();
    // The owner refund route needs a Stripe payment (a cash order answers
    // PAYMENT_NOT_FOUND), and Stripe is not reachable locally, so the refund
    // is written the way the route leaves it: a SUCCEEDED Refund row and a
    // REFUNDED order. Local database only (localSql never deletes).
    localSql(
      `insert into "Refund" (id, "orderId", amount, reason, status, "updatedAt") values (gen_random_uuid()::text, '${id}', ${PRICE}, 'e2e', 'SUCCEEDED', now())`
    );
    localSql(
      `update "Order" set "paymentStatus" = 'REFUNDED' where id = '${id}'`
    );
    const to = mail();
    const r = await sendReceiptOwnerRaw(ownerToken, id, {
      channel: "email",
      to,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.send).toMatchObject({ source: "PORTAL", succeeded: true });
    const [link] = localSql<{ token: string }>(
      `select token from "OrderReceiptLink" where "orderId" = '${id}'`
    );
    expect(link, "a receipt link was minted").toBeTruthy();
    const page = await fetch(`${BACKEND_URL}/r/${link!.token}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/refund/i);
    // Control: the page of an order that was not refunded says nothing of it.
    const plain = await paidOrder();
    const sent = await sendReceiptOwnerRaw(ownerToken, plain, {
      channel: "email",
      to: mail(),
    });
    expect(sent.status, JSON.stringify(sent.data)).toBe(200);
    const [plainLink] = localSql<{ token: string }>(
      `select token from "OrderReceiptLink" where "orderId" = '${plain}'`
    );
    const plainPage = await fetch(`${BACKEND_URL}/r/${plainLink!.token}`);
    expect(await plainPage.text()).not.toMatch(/refund/i);
  });

  test("TC-2061: an open check is refused: a receipt needs money taken (400)", async () => {
    const id = await openCheck();
    const to = mail();
    const r = await sendReceiptTabletRaw(register, staffSession, id, {
      channel: "email",
      to,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(400);
    expect(r.data.message).toMatch(/paid order/i);
    const o = await sendReceiptOwnerRaw(ownerToken, id, {
      channel: "email",
      to,
    });
    expect(o.status).toBe(400);
    expect(await sends(id)).toHaveLength(0);
  });

  test("TC-2062: the 4th send of one receipt on one channel within an hour answers 429", async () => {
    const id = await paidOrder();
    for (let i = 0; i < 3; i++) {
      const r = await sendReceiptTabletRaw(register, staffSession, id, {
        channel: "email",
        to: mail(),
      });
      expect(r.status, `send ${i + 1}: ${JSON.stringify(r.data)}`).toBe(200);
    }
    const fourth = await sendReceiptOwnerRaw(ownerToken, id, {
      channel: "email",
      to: mail(),
    });
    expect(fourth.status, JSON.stringify(fourth.data)).toBe(429);
    expect(await sends(id)).toHaveLength(3);
  });

  test("TC-2063: another restaurant's owner gets 403 on send, history and PDF", async () => {
    const id = await paidOrder();
    const send = await sendReceiptOwnerRaw(strangerToken, id, {
      channel: "email",
      to: mail(),
    });
    expect(send.status, JSON.stringify(send.data)).toBe(403);
    const hist = await getReceiptSendsOwnerRaw(strangerToken, id);
    expect(hist.status).toBe(403);
    const pdf = await getReceiptPdfOwnerRaw(strangerToken, id);
    expect(pdf.status).toBe(403);
    expect(await sends(id)).toHaveLength(0);
  });

  test("TC-2064: the PDF is application/pdf and shows no Stripe fee or 'Net to you'", async () => {
    const id = await paidOrder();
    const pdf = await getReceiptPdfOwnerRaw(ownerToken, id);
    expect(pdf.status).toBe(200);
    expect(pdf.contentType).toContain("application/pdf");
    expect(pdf.disposition).toMatch(/attachment; filename="receipt-.+\.pdf"/);
    expect(pdf.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const text = execFileSync("pdftotext", ["-layout", "-", "-"], {
      input: pdf.bytes,
      encoding: "utf8",
    });
    expect(text).toContain(item.name);
    expect(text).toContain("13.37");
    expect(text).not.toMatch(/stripe/i);
    expect(text).not.toMatch(/net to you/i);
  });

  test("TC-2065: owner search by card last 4 and by amount finds the walk-in order", async () => {
    const id = await paidOrder();
    const last4 = String(1000 + (Date.now() % 8999));
    localSql(`update "Order" set "cardLast4" = '${last4}' where id = '${id}'`);
    const byCard = await listOrdersRaw(ownerToken, rid, { search: last4 });
    expect(byCard.status, JSON.stringify(byCard.data)).toBe(200);
    expect(byCard.data.orders.map((o) => o.id)).toContain(id);
    const byAmount = await listOrdersRaw(ownerToken, rid, {
      search: `$${PRICE}`,
    });
    expect(byAmount.status).toBe(200);
    expect(byAmount.data.orders.map((o) => o.id)).toContain(id);
    // A bare integer is a receipt/order number, never an amount.
    const bare = await listOrdersRaw(ownerToken, rid, { search: "13" });
    expect(bare.data.orders.map((o) => o.id)).not.toContain(id);
  });
});
