/**
 * 14-money-paths.spec.ts — the register's money paths with no test until now
 * (docs/COVERAGE_MAP.md G8) (TC-1043..1050).
 *
 * No browser: the POS is played through its own API, as device-in-store
 * calls it. A per-run throwaway restaurant with table service, 7% tax, a
 * Stripe TEST account and a REGISTER device; the owner signed in on it (holds
 * the drawer, every capability) and Dee, a Staff-role server.
 *
 * Cards are KEYED (typed in): the PaymentMethod is made with Stripe's
 * publishable key from a test token and the server confirms it — the only
 * card path with no reader. A reader-held card's tip-after-close success
 * path needs hardware and stays out (POS_SYSTEM_REFERENCE / device tests).
 *
 *   TC-1043 A keyed card pays a counter sale: held, the order paid; a
 *           declined card is refused in words.
 *   TC-1044 A tip after the card was taken: refused in words on a keyed card
 *           (it can't capture more than it approved); a negative tip too.
 *   TC-1045 A pay link for an open check comes back as a link; the guest
 *           pays it from the phone with a tip and the check closes.
 *   TC-1046 Split a check by item: one item moves to its own check; each
 *           check is paid apart; a paid check can't be split.
 *   TC-1047 Adding to a paid order leaves a balance due; the keyed card pays
 *           the balance.
 *   TC-1048 Taking an item off a paid order needs a manager: Dee is refused
 *           in words; the owner's change gives the money back to the card.
 *   TC-1049 Cancelling a paid counter card sale: a reason is required; the
 *           preview says the card is released; the cancel releases it, so
 *           Day Close can't charge it (RestauNax #1112, on QA 2026-10-30).
 *   TC-1050 A cash order made smaller owes cash back; only the drawer's
 *           holder may hand it over, and then nothing is owed.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsApi,
  ensureTaxRate,
  ensureBusinessHours,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  stripeConfigRaw,
  stripePublicRaw,
  ensureOrderingSlug,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  openRegisterSessionPos,
  createTabletOrderRaw,
  settleTabCashRaw,
  checkPayRaw,
  getOrderFullRaw,
  type LooseJson,
} from "../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

type Rec = Record<string, LooseJson>;
const list = (v: unknown) => (Array.isArray(v) ? (v as Rec[]) : []);
const msg = (data: unknown) => String((data as Rec | undefined)?.message ?? "");

test.describe.configure({ mode: "serial" });

test.describe("POS money paths (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let restaurantId = "";
  let deviceId = "";
  let tablet = "";
  let pk = "";
  let ownerToken = "";
  /** The owner on the register: holds the drawer, may approve anything. */
  let owner = { id: "", session: "" };
  /** Dee: a server with the Staff role. */
  const dee = { id: "", pin: "4826", session: "" };
  const items: Record<
    "burger" | "fries" | "soda",
    { id: string; name: string; price: number }
  > = {
    burger: { id: "", name: "Burger", price: 12 },
    fries: { id: "", name: "Fries", price: 4 },
    soda: { id: "", name: "Soda", price: 3 },
  };

  const line = (key: keyof typeof items, quantity = 1) => ({
    menuItemId: items[key].id,
    menuItemName: items[key].name,
    quantity,
    price: items[key].price,
  });
  const money = (n: number) => Math.round(n * 100) / 100;
  /** A sale's body: the server prices it; 7% tax. */
  const sale = (lines: ReturnType<typeof line>[], extra: Rec = {}) => {
    const subtotal = money(lines.reduce((s, l) => s + l.price * l.quantity, 0));
    const tax = money(subtotal * 0.07);
    return {
      restaurantId,
      orderType: "PICKUP",
      subtotal,
      tax,
      tip: 0,
      total: money(subtotal + tax),
      customerPhone: "",
      orderItems: lines,
      ...extra,
    };
  };
  /** A keyed card's PaymentMethod, made the way Stripe's sheet does it. */
  const keyedCard = async (token = "tok_visa") => {
    const r = await stripePublicRaw(pk, "POST", "/payment_methods", {
      type: "card",
      "card[token]": token,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return String(r.data.id);
  };
  /** Ring up a counter order and pay it with a keyed card (held). */
  const keyedSale = async (lines: ReturnType<typeof line>[]) => {
    const order = await createTabletOrderRaw(
      tablet,
      owner.session,
      sale(lines)
    );
    expect(order.status, JSON.stringify(order.data)).toBe(201);
    const orderId = String(order.data.id);
    const intent = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/terminal/create-payment-intent",
      {
        orderId,
        amount: Number(order.data.total),
        entry: "keyed",
        paymentMethodId: await keyedCard(),
      },
      owner.session
    );
    expect(intent.status, JSON.stringify(intent.data)).toBe(200);
    const pi = (intent.data.data ?? intent.data) as Rec;
    expect(pi.status).toBe("requires_capture");
    const captured = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/terminal/capture-payment",
      { paymentIntentId: pi.paymentIntentId },
      owner.session
    );
    expect(captured.status, JSON.stringify(captured.data)).toBe(200);
    return {
      orderId,
      total: Number(order.data.total),
      paymentIntentId: String(pi.paymentIntentId),
      clientSecret: String(pi.clientSecret),
    };
  };
  /** The order as the owner's dashboard reads it. */
  const readOrder = async (orderId: string) => {
    const r = await getOrderFullRaw(ownerToken, orderId);
    expect(r.ok, JSON.stringify(r.data)).toBe(true);
    return r.data as Rec;
  };

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[money-paths] no tenant");
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
      throw new Error(`[money-paths] stripe: ${JSON.stringify(onboard.data)}`);
    pk = String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
    if (!pk.startsWith("pk_test_"))
      throw new Error("[money-paths] no Stripe TEST key");
    // A pay link points at the restaurant's ordering site.
    await ensureOrderingSlug(
      adminToken,
      "restaurant",
      restaurantId,
      `auto-pos-${runId}`
    );

    const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
      restaurantId,
    });
    for (const key of Object.keys(items) as (keyof typeof items)[]) {
      const made = await createMenuItemFull(
        ownerToken,
        food.id,
        items[key].name,
        items[key].price
      );
      items[key].id = made.id;
    }

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-pos-${runId}`
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
      throw new Error(`[money-paths] staff: ${JSON.stringify(added.data)}`);
    dee.id = String((added.data.data as Rec).id);
    dee.session = await tabletStaffSignIn(tablet, dee.id, dee.pin);
    await openRegisterSessionPos(tablet, owner.session, 100);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
          () => {}
        );
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS money paths");
    await allure.label("severity", "critical");
  });

  test("TC-1043: a keyed card pays a counter sale; a declined card is refused in words", async () => {
    const paid = await keyedSale([line("burger"), line("fries")]);
    expect(paid.total).toBe(17.12);
    const order = await readOrder(paid.orderId);
    expect(order.paymentStatus).toBe("COMPLETED");

    const order2 = await createTabletOrderRaw(
      tablet,
      owner.session,
      sale([line("soda")])
    );
    const declined = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/terminal/create-payment-intent",
      {
        orderId: order2.data.id,
        amount: Number(order2.data.total),
        entry: "keyed",
        paymentMethodId: await keyedCard("tok_chargeDeclined"),
      },
      owner.session
    );
    expect(declined.status).toBe(402);
    expect(msg(declined.data)).toBe(
      "The card was declined. Check the details with the customer or try another card."
    );
    const noCard = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/terminal/create-payment-intent",
      {
        orderId: order2.data.id,
        amount: Number(order2.data.total),
        entry: "keyed",
      },
      owner.session
    );
    expect(noCard.status).toBe(400);
    expect(msg(noCard.data)).toBe(
      "Enter the card details to key in a card payment."
    );
  });

  test("TC-1044: a tip after the card was taken is refused in words on a keyed card", async () => {
    const paid = await keyedSale([line("burger")]);
    const tip = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${paid.orderId}/tip`,
      { tip: 2 },
      owner.session
    );
    expect(tip.status).toBe(400);
    expect(msg(tip.data)).toBe(
      "This card won't accept more than the amount already approved, so a tip can't be added to it."
    );
    const negative = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${paid.orderId}/tip`,
      { tip: -1 },
      owner.session
    );
    expect(negative.status).toBe(400);
    expect(msg(negative.data)).toBe("Enter a tip amount of zero or more.");
  });

  test("TC-1045: a pay link for an open check; the guest pays it from the phone with a tip and the check closes", async () => {
    const check = await createTabletOrderRaw(
      tablet,
      dee.session,
      sale([line("burger"), line("soda")], {
        openCheck: true,
        tableName: "T4",
        guestCount: 1,
      })
    );
    expect(check.status, JSON.stringify(check.data)).toBe(201);
    const noContact = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${check.data.id}/send-pay-link`,
      {}
    );
    expect(noContact.status).toBe(400);
    expect(msg(noContact.data)).toBe(
      "Enter the customer's phone number or email address to send the payment link."
    );
    const sent = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${check.data.id}/send-pay-link`,
      {
        email: `auto-guest-${runId}@${DOMAIN}`,
      }
    );
    expect(sent.status, JSON.stringify(sent.data)).toBe(200);
    expect(sent.data.amount).toBe(16.05);
    const token =
      /\/pay\/([A-Za-z0-9_-]{22})$/.exec(String(sent.data.url))?.[1] ?? "";
    expect(token, String(sent.data.url)).not.toBe("");

    // The guest's phone: the bill, a card, a $2 tip.
    const bill = await checkPayRaw("GET", token);
    expect(bill.status, JSON.stringify(bill.data)).toBe(200);
    const intent = await checkPayRaw("POST", token, "/intent", {
      mode: "REST",
      tip: 2,
      idempotencyKey: `pos-${runId}-link`,
    });
    expect(intent.status, JSON.stringify(intent.data)).toBe(200);
    const pi = intent.data.data as Rec;
    const pm = await keyedCard();
    const fin = await checkPayRaw("POST", token, "/finalize-surcharge", {
      paymentIntentId: pi.paymentIntentId,
      paymentMethodId: pm,
    });
    expect(fin.status, JSON.stringify(fin.data)).toBe(200);
    const auth = await stripePublicRaw(
      pk,
      "POST",
      `/payment_intents/${pi.paymentIntentId}/confirm`,
      {
        client_secret: String(pi.clientSecret),
        payment_method: pm,
      }
    );
    expect(auth.status, JSON.stringify(auth.data)).toBe(200);
    const done = await checkPayRaw("POST", token, "/confirm", {
      paymentIntentId: pi.paymentIntentId,
    });
    expect(done.status, JSON.stringify(done.data)).toBe(200);
    expect(done.data.data).toMatchObject({ remaining: 0, closed: true });
    expect((done.data.data as Rec).leg).toMatchObject({
      amount: 18.05,
      tip: 2,
    });
    expect((await readOrder(String(check.data.id))).paymentStatus).toBe(
      "COMPLETED"
    );
  });

  test("TC-1046: split a check by item; each check is paid apart; a paid check can't be split", async () => {
    const check = await createTabletOrderRaw(
      tablet,
      dee.session,
      sale([line("burger"), line("fries"), line("soda")], {
        openCheck: true,
        tableName: "T5",
        guestCount: 2,
      })
    );
    expect(check.status, JSON.stringify(check.data)).toBe(201);
    const full = await readOrder(String(check.data.id));
    const soda = list(full.orderItems).find(
      (i) => i.menuItemId === items.soda.id
    );
    expect(soda, JSON.stringify(full.orderItems)).toBeTruthy();
    const split = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${check.data.id}/split`,
      {
        groups: [{ items: [{ orderItemId: soda?.id }] }],
        idempotencyKey: `pos-${runId}-split`,
      },
      dee.session
    );
    expect(split.status, JSON.stringify(split.data)).toBe(200);
    const data = (split.data.data ?? split.data) as Rec;
    const children = list(data.children);
    expect(children).toHaveLength(1);
    const child = children[0] as Rec;
    // The soda's check: $3.00 + $0.21. What stays: $16.00 + $1.12.
    expect(Number(child.total)).toBe(3.21);
    const parent = await readOrder(String(check.data.id));
    expect(Number(parent.total)).toBe(17.12);

    const childPaid = await settleTabCashRaw(
      tablet,
      owner.session,
      String(child.id),
      {
        amount: 3.21,
        cashTendered: 5,
        idempotencyKey: `pos-${runId}-child`,
      }
    );
    expect(childPaid.data).toMatchObject({ remaining: 0, closed: true });
    const half = await settleTabCashRaw(
      tablet,
      owner.session,
      String(check.data.id),
      {
        amount: 8,
        cashTendered: 8,
        idempotencyKey: `pos-${runId}-parent-a`,
      }
    );
    expect(half.status, JSON.stringify(half.data)).toBe(200);
    // A payment is on it now: it can't be split any more.
    const again = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${check.data.id}/split`,
      {
        groups: [{ items: [{ orderItemId: list(parent.orderItems)[0]?.id }] }],
        idempotencyKey: `pos-${runId}-split2`,
      },
      dee.session
    );
    expect(again.status).toBe(400);
    expect(msg(again.data)).toMatch(
      /^A payment has already been taken on this check, so it can't be split\./
    );
    const rest = await settleTabCashRaw(
      tablet,
      owner.session,
      String(check.data.id),
      {
        amount: 9.12,
        cashTendered: 10,
        idempotencyKey: `pos-${runId}-parent-b`,
      }
    );
    expect(rest.data).toMatchObject({ remaining: 0, closed: true });
  });

  test("TC-1047: adding to a paid order leaves a balance due; the keyed card pays it", async () => {
    const paid = await keyedSale([line("burger")]);
    const order = await readOrder(paid.orderId);
    const modified = await tabletRaw<Rec>(
      tablet,
      "PATCH",
      `/orders/${paid.orderId}/modify`,
      {
        orderItems: [
          ...list(order.orderItems).map((i) => ({
            id: i.id,
            menuItemId: i.menuItemId,
            menuItemName: i.menuItemName ?? items.burger.name,
            quantity: i.quantity,
            price: i.price,
          })),
          line("fries"),
        ],
      },
      owner.session
    );
    expect(modified.status, JSON.stringify(modified.data)).toBe(200);
    // Fries $4.00 + $0.28 tax; a keyed hold has no room above what it approved.
    expect(modified.data).toMatchObject({
      requiresAdditionalPayment: 4.28,
      balanceDue: 4.28,
    });

    const intent = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/terminal/create-balance-intent",
      {
        orderId: paid.orderId,
        entry: "keyed",
        paymentMethodId: await keyedCard(),
      },
      owner.session
    );
    expect(intent.status, JSON.stringify(intent.data)).toBe(200);
    const pi = (intent.data.data ?? intent.data) as Rec;
    const captured = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/terminal/capture-balance-intent",
      { paymentIntentId: pi.paymentIntentId },
      owner.session
    );
    expect(captured.status, JSON.stringify(captured.data)).toBe(200);
    const after = await readOrder(paid.orderId);
    expect(Number(after.balanceDueAmount ?? 0)).toBe(0);
    expect(Number(after.total)).toBe(17.12);
  });

  test("TC-1048: taking an item off a paid order needs a manager; the owner's change gives the money back", async () => {
    const paid = await keyedSale([line("burger"), line("fries")]);
    const order = await readOrder(paid.orderId);
    const burgerOnly = list(order.orderItems)
      .filter((i) => i.menuItemId === items.burger.id)
      .map((i) => ({
        id: i.id,
        menuItemId: i.menuItemId,
        menuItemName: items.burger.name,
        quantity: i.quantity,
        price: i.price,
      }));
    const asDee = await tabletRaw<Rec>(
      tablet,
      "PATCH",
      `/orders/${paid.orderId}/modify`,
      { orderItems: burgerOnly, voidReason: "Fries were cold" },
      dee.session
    );
    expect(asDee.status, JSON.stringify(asDee.data)).toBe(400);
    expect(msg(asDee.data)).toBe("A manager PIN is required.");

    const asOwner = await tabletRaw<Rec>(
      tablet,
      "PATCH",
      `/orders/${paid.orderId}/modify`,
      { orderItems: burgerOnly, voidReason: "Fries were cold" },
      owner.session
    );
    expect(asOwner.status, JSON.stringify(asOwner.data)).toBe(200);
    // $4.28 back: off the card's hold (not yet captured) or refunded to it.
    expect(asOwner.data.requiresRefund ?? false).toBeFalsy();
    const after = await readOrder(paid.orderId);
    expect(Number(after.total)).toBe(12.84);
  });

  test("TC-1049: cancelling a paid counter card sale releases the card — not charged at Day Close", async () => {
    // The card is HELD until Day Close. Until RestauNax #1112 the cancel
    // planned a plain void: the hold stayed and Day Close charged the card
    // for a cancelled order.
    const paid = await keyedSale([line("burger")]);
    const preview = await tabletRaw<Rec>(
      tablet,
      "GET",
      `/orders/${paid.orderId}/cancel-preview`,
      undefined,
      owner.session
    );
    expect(preview.status, JSON.stringify(preview.data)).toBe(200);
    expect(preview.data).toMatchObject({
      hasSettledPayments: true,
      requiredCapability: "APPROVE_REFUND",
      totals: expect.objectContaining({ card: 12.84, total: 12.84 }),
    });
    expect(msg(preview.data)).toContain("$12.84 released on the card");

    const noReason = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/cancel-order/${paid.orderId}`,
      { refundSettledPayments: true },
      owner.session
    );
    expect(noReason.status).toBe(400);
    const cancelled = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/cancel-order/${paid.orderId}`,
      { reason: "Guest left", refundSettledPayments: true },
      owner.session
    );
    expect(cancelled.status, JSON.stringify(cancelled.data)).toBe(200);
    const after = await readOrder(paid.orderId);
    // Money went back (the hold released), so it closes like any cancel that
    // gives money back: REFUNDED.
    expect(after.status).toBe("REFUNDED");
    expect(after.cardAuthorizedAt ?? null).toBeNull();
    // Stripe: the hold is released, so nothing can be captured later.
    const intent = await stripePublicRaw(
      pk,
      "GET",
      `/payment_intents/${paid.paymentIntentId}`,
      { client_secret: paid.clientSecret }
    );
    expect(intent.data.status).toBe("canceled");
  });

  test("TC-1050: a cash order made smaller owes cash back; only the drawer's holder hands it over", async () => {
    const order = await createTabletOrderRaw(
      tablet,
      owner.session,
      sale([line("burger"), line("soda")], { paymentMethod: "CASH" })
    );
    expect(order.status, JSON.stringify(order.data)).toBe(201);
    const paid = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${order.data.id}/mark-paid`,
      { cashTendered: 20, cashChange: 3.95 },
      owner.session
    );
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    const full = await readOrder(String(order.data.id));
    const burgerOnly = list(full.orderItems)
      .filter((i) => i.menuItemId === items.burger.id)
      .map((i) => ({
        id: i.id,
        menuItemId: i.menuItemId,
        menuItemName: items.burger.name,
        quantity: i.quantity,
        price: i.price,
      }));
    const smaller = await tabletRaw<Rec>(
      tablet,
      "PATCH",
      `/orders/${order.data.id}/modify`,
      { orderItems: burgerOnly, voidReason: "No soda left" },
      owner.session
    );
    expect(smaller.status, JSON.stringify(smaller.data)).toBe(200);
    expect(smaller.data.requiresRefund).toBeTruthy();

    const notHers = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${order.data.id}/record-cash-refund`,
      {},
      dee.session
    );
    expect(notHers.status).toBe(403);
    expect(msg(notHers.data)).toMatch(
      /^This drawer belongs to another cashier\./
    );
    const handed = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${order.data.id}/record-cash-refund`,
      {},
      owner.session
    );
    expect(handed.status, JSON.stringify(handed.data)).toBe(200);
    const after = await readOrder(String(order.data.id));
    expect(Number(after.refundDueAmount ?? 0)).toBe(0);
  });
});
