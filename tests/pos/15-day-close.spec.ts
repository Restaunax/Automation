/**
 * 15-day-close.spec.ts — closing and opening the business day from the POS
 * (docs/COVERAGE_MAP.md G9, the POS half) (TC-1051..1058, TC-1367/1368).
 *
 * No browser: the POS is played through its own API, as device-in-store's
 * Close Day and Open Day wizards call it. The web half (Daily Report → Close
 * Day) is the restaurant-week journey, TC-996..1000.
 *
 * A per-run throwaway restaurant (7% tax, a Stripe TEST account, a REGISTER
 * device): a close pauses ordering for the night, so never a shared one. The
 * owner is signed in on the register (holds the drawer, every capability);
 * Dee is a Staff-role server who is clocked in.
 *
 *   TC-1051 Dee (Staff role) may not look at or close the day: refused in
 *           words.
 *   TC-1052 A cash sale and a keyed card sale; the preview lists what is
 *           still open (the drawer, Dee on the clock) and the day's sales.
 *   TC-1053 The close is refused in words: a negative deposit, the drawer
 *           still open, Dee still on the clock — and the held card is NOT
 *           taken by a refused close.
 *   TC-1054 The close: the card held for a tip is charged, "Day closed.",
 *           and a second close says the day is already closed (and offers to
 *           close again).
 *   TC-1055 Closed for the night: the POS refuses a new ticket and an online
 *           guest is told the restaurant has closed, in words.
 *   TC-1056 The morning: the Open Day preview shows how last night ended;
 *           the owner opens with a $100 float, "Day opened.", and the POS
 *           takes orders again.
 *   TC-1057 Opening is refused in words: Dee may not open the day (until
 *           RestauNax #1114, on QA 2026-10-31, she was told she may not CLOSE
 *           it), and the day can't be opened twice.
 *   TC-1058 The store reopened the same night: a second close is offered,
 *           and it counts the whole day (three orders, both deposits).
 *   TC-1367 W0:J4-b the owner's Resume ordering lifts the overnight pause:
 *           the storefront takes orders again, and Recent changes says so.
 *   TC-1368 W0:J4-b a close with "pause online ordering" off
 *           (pauseOrdering: false) leaves online ordering open. Every other
 *           close here sends nothing: the default pauses (orderingPaused).
 *
 * The tenant is open every day 00:00–23:59 (setOpenAllDayHours), not 24
 * hours: for a 24-hour venue the post-close pause lifts at once, by design.
 * With these hours it lasts until tomorrow's opening, so TC-1055 sees the
 * night closed.
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
  setOpenAllDayHours,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  stripeConfigRaw,
  stripePublicRaw,
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
  getRestaurantDetailsPublicRaw,
  type LooseJson,
} from "../../utils/apiHelper";
import {
  orderingStatusRaw,
  settingChangesRaw,
} from "../../utils/backOfficeApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const msg = (data: unknown) => String((data as Rec | undefined)?.message ?? "");
const dataOf = (data: unknown) =>
  ((data as Rec | undefined)?.data ?? {}) as Rec;
/** The public storefront payload's `settings.acceptingOrders`. */
const storefrontAccepting = (data: unknown) =>
  (dataOf(data).settings as Rec | undefined)?.acceptingOrders;

test.describe.configure({ mode: "serial" });

test.describe("POS day close and day open (API)", () => {
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
  let owner = { id: "", session: "" };
  const dee = { id: "", pin: "4826", session: "" };
  const burger = { id: "", name: "Burger", price: 12 };
  /** The keyed card sale, held until the close charges it. */
  let held = { orderId: "", paymentIntentId: "", clientSecret: "" };

  /** A burger at 7% tax: $12.84. */
  const sale = (extra: Rec = {}) => ({
    restaurantId,
    orderType: "PICKUP",
    subtotal: 12,
    tax: 0.84,
    tip: 0,
    total: 12.84,
    customerPhone: "",
    orderItems: [
      {
        menuItemId: burger.id,
        menuItemName: burger.name,
        quantity: 1,
        price: 12,
      },
    ],
    ...extra,
  });
  /** A cash burger, $20 handed over. */
  const cashSale = async () => {
    const order = await createTabletOrderRaw(
      tablet,
      owner.session,
      sale({ paymentMethod: "CASH" })
    );
    expect(order.status, JSON.stringify(order.data)).toBe(201);
    const paid = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${order.data.id}/mark-paid`,
      { cashTendered: 20, cashChange: 7.16 },
      owner.session
    );
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    return String(order.data.id);
  };
  const intentStatus = async () => {
    const r = await stripePublicRaw(
      pk,
      "GET",
      `/payment_intents/${held.paymentIntentId}`,
      { client_secret: held.clientSecret }
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return String(r.data.status);
  };
  const preview = async (session: string) =>
    tabletRaw<Rec>(tablet, "GET", "/day-close/preview", undefined, session);
  const closeDay = async (session: string, body: Rec) =>
    tabletRaw<Rec>(tablet, "POST", "/day-close", body, session);

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[day-close] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });
    await ensureTaxRate(ownerToken, restaurantId, 7);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    // Not 24 hours: a close then pauses ordering until tomorrow's opening.
    await setOpenAllDayHours(ownerToken, restaurantId);
    const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
    if (onboard.status !== 200)
      throw new Error(`[day-close] stripe: ${JSON.stringify(onboard.data)}`);
    pk = String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
    if (!pk.startsWith("pk_test_"))
      throw new Error("[day-close] no Stripe TEST key");

    const food = await createMenuGroupNamed(ownerToken, `Food ${runId}`, {
      restaurantId,
    });
    burger.id = (
      await createMenuItemFull(ownerToken, food.id, burger.name, burger.price)
    ).id;

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-close-${runId}`
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
      throw new Error(`[day-close] staff: ${JSON.stringify(added.data)}`);
    dee.id = String((added.data.data as Rec).id);
    dee.session = await tabletStaffSignIn(tablet, dee.id, dee.pin);
    const clockIn = await tabletRaw<Rec>(tablet, "POST", "/staff/clock-in", {
      staffMemberId: dee.id,
      pin: dee.pin,
    });
    if (clockIn.status !== 200)
      throw new Error(`[day-close] clock-in: ${JSON.stringify(clockIn.data)}`);
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
    await allure.label("feature", "POS day close");
    await allure.label("severity", "critical");
  });

  test("TC-1051: a Staff-role server may not look at or close the day", async () => {
    const look = await preview(dee.session);
    expect(look.status).toBe(403);
    expect(msg(look.data)).toBe("You are not authorized to close the day.");
    const close = await closeDay(dee.session, { depositAmount: 0 });
    expect(close.status).toBe(403);
    expect(msg(close.data)).toBe("You are not authorized to close the day.");
  });

  test("TC-1052: the preview lists the open drawer, Dee on the clock and the day's two sales", async () => {
    await cashSale();
    // A keyed card: held for a tip until the day closes.
    const order = await createTabletOrderRaw(tablet, owner.session, sale());
    expect(order.status, JSON.stringify(order.data)).toBe(201);
    const pm = await stripePublicRaw(pk, "POST", "/payment_methods", {
      type: "card",
      "card[token]": "tok_visa",
    });
    const intent = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/terminal/create-payment-intent",
      {
        orderId: order.data.id,
        amount: 12.84,
        entry: "keyed",
        paymentMethodId: pm.data.id,
      },
      owner.session
    );
    expect(intent.status, JSON.stringify(intent.data)).toBe(200);
    const pi = (intent.data.data ?? intent.data) as Rec;
    const hold = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/terminal/capture-payment",
      { paymentIntentId: pi.paymentIntentId },
      owner.session
    );
    expect(hold.status, JSON.stringify(hold.data)).toBe(200);
    held = {
      orderId: String(order.data.id),
      paymentIntentId: String(pi.paymentIntentId),
      clientSecret: String(pi.clientSecret),
    };
    expect(await intentStatus()).toBe("requires_capture");

    const look = await preview(owner.session);
    expect(look.status, JSON.stringify(look.data)).toBe(200);
    const d = dataOf(look.data);
    expect(d.alreadyClosed).toBeNull();
    expect(d.outstanding).toMatchObject({
      openRegisters: [{ deviceName: `auto-close-${runId}` }],
      clockedInStaff: [{ staffMemberId: dee.id, name: "Dee Server" }],
      heldAwaitingTip: [{ id: held.orderId, cardLast4: "4242" }],
      unpaidOrders: [],
    });
    // Sales definitions 2 (W2:E2): gross = item sales (no tax, no tip);
    // what the two orders charged is total collected.
    expect(d.summary).toMatchObject({
      orderCount: 2,
      definitionVersion: 2,
      grossSales: 24,
      netSales: 24,
      totalCollected: 25.68,
      tax: 1.68,
    });
  });

  test("TC-1053: the close is refused in words while anything is open — and a refused close takes no card", async () => {
    const negative = await closeDay(owner.session, { depositAmount: -5 });
    expect(negative.status).toBe(400);
    expect(msg(negative.data)).toBe(
      "Enter a valid deposit amount (0 or more)."
    );
    const drawerOpen = await closeDay(owner.session, { depositAmount: 12.84 });
    expect(drawerOpen.status).toBe(400);
    expect(msg(drawerOpen.data)).toBe(
      "Close every register drawer first — each one needs a counted close."
    );

    // The drawer counts out to the cent: $100 float + $12.84 cash.
    const counted = await closeRegisterSessionPosRaw(tablet, owner.session, {
      countedCash: 112.84,
    });
    expect(counted.status, JSON.stringify(counted.data)).toBe(200);
    expect(counted.data.data?.overShort).toBe(0);

    const deeOn = await closeDay(owner.session, { depositAmount: 12.84 });
    expect(deeOn.status).toBe(400);
    expect(msg(deeOn.data)).toBe(
      "Clock out everyone still on shift first — the day can't close with hours still running."
    );
    // Nothing was taken by the refused closes.
    expect(await intentStatus()).toBe("requires_capture");

    const sweep = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/staff/clock-out-sweep",
      { staffMemberIds: [dee.id] },
      owner.session
    );
    expect(sweep.status, JSON.stringify(sweep.data)).toBe(200);
    expect(msg(sweep.data)).toBe("Clocked out 1 staff member(s).");
  });

  test("TC-1054: the close charges the held card and says so; a second close is refused but offered", async () => {
    const closed = await closeDay(owner.session, {
      depositAmount: 12.84,
      note: "Bag 1",
    });
    expect(closed.status, JSON.stringify(closed.data)).toBe(201);
    expect(msg(closed.data)).toBe("Day closed.");
    expect(dataOf(closed.data)).toMatchObject({
      orderCount: 2,
      grossSales: 24,
      netSales: 24,
      totalCollected: 25.68,
      salesDefinitionVersion: 2,
      tax: 1.68,
      openingFloatTotal: 100,
      countedCashTotal: 112.84,
      overShortTotal: 0,
      depositAmount: 12.84,
      cardCapture: { total: 1, captured: 1, failed: [] },
      // W0:J4-b: nothing sent = pause online ordering (old POS builds).
      orderingPaused: true,
    });
    expect(await intentStatus()).toBe("succeeded");

    const again = await closeDay(owner.session, { depositAmount: 0 });
    expect(again.status).toBe(409);
    expect(again.data).toMatchObject({
      errorCode: "DAY_ALREADY_CLOSED",
      message: "Today's business day has already been closed.",
      canReclose: true,
    });
  });

  test("TC-1055: closed for the night — the POS and an online guest are refused in words", async () => {
    const ticket = await createTabletOrderRaw(
      tablet,
      owner.session,
      sale({ paymentMethod: "CASH" })
    );
    expect(ticket.status).toBe(400);
    expect(msg(ticket.data)).toBe(
      "The business day is closed. Reopen the day before ringing new orders."
    );
    const online = await apiRequestRaw<Rec>(
      "POST",
      `/api/order/new/restaurantId/${restaurantId}`,
      sale({
        customerEmail: `auto-guest-${runId}@restaunax-test.com`,
        customerPhone: "5555550123",
        firstName: "Gia",
        lastName: "Guest",
      })
    );
    expect(online.status).toBe(400);
    expect(msg(online.data)).toBe(
      "This restaurant has closed for the night. Online ordering opens again in the morning."
    );
    // The owner's dashboard says so too.
    const status = await orderingStatusRaw(ownerToken, restaurantId);
    expect(status.data.data).toMatchObject({
      state: "CLOSED_FOR_NIGHT",
      closedForNight: true,
      detail:
        "You closed the day. Online ordering reopens by itself at your next opening time.",
    });
  });

  test("TC-1056: the morning — the preview shows last night; the owner opens and orders come back", async () => {
    const look = await tabletRaw<Rec>(
      tablet,
      "GET",
      "/day-open/preview",
      undefined,
      owner.session
    );
    expect(look.status, JSON.stringify(look.data)).toBe(200);
    expect(dataOf(look.data)).toMatchObject({
      alreadyOpened: null,
      orderingPaused: true,
      lastClose: { depositAmount: 12.84, overShortTotal: 0, note: "Bag 1" },
    });

    const opened = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/day-open",
      { openingFloatTotal: 100, note: "Morning float" },
      owner.session
    );
    expect(opened.status, JSON.stringify(opened.data)).toBe(201);
    expect(msg(opened.data)).toBe("Day opened.");
    const status = await orderingStatusRaw(ownerToken, restaurantId);
    expect(status.data.data).toMatchObject({ closedForNight: false });
    const ticket = await createTabletOrderRaw(
      tablet,
      owner.session,
      sale({ paymentMethod: "CASH" })
    );
    expect(ticket.status, JSON.stringify(ticket.data)).toBe(201);
    // Not part of the day's money: cancelled again before TC-1058 counts.
    const cancelled = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/cancel-order/${ticket.data.id}`,
      { reason: "Test ticket" },
      owner.session
    );
    expect(cancelled.status, JSON.stringify(cancelled.data)).toBe(200);
  });

  test("TC-1057: opening is refused in words — Dee may not open, and nobody opens twice", async () => {
    const again = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/day-open",
      { openingFloatTotal: 100 },
      owner.session
    );
    expect(again.status).toBe(409);
    expect(again.data).toMatchObject({
      errorCode: "DAY_ALREADY_OPENED",
      message: "Today has already been opened.",
    });
    const deeOpens = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/day-open",
      { openingFloatTotal: 100 },
      dee.session
    );
    expect(deeOpens.status).toBe(403);
    expect(msg(deeOpens.data)).toBe(
      "You are not allowed to open the day. Ask a shift lead or a manager."
    );
  });

  test("TC-1058: the store reopened the same night — a second close counts the whole day", async () => {
    await openRegisterSessionPos(tablet, owner.session, 100);
    await cashSale();
    const counted = await closeRegisterSessionPosRaw(tablet, owner.session, {
      countedCash: 112.84,
    });
    expect(counted.status, JSON.stringify(counted.data)).toBe(200);

    const plain = await closeDay(owner.session, { depositAmount: 12.84 });
    expect(plain.status).toBe(409);
    const reclosed = await closeDay(owner.session, {
      depositAmount: 12.84,
      reclose: true,
    });
    expect(reclosed.status, JSON.stringify(reclosed.data)).toBe(201);
    // The whole day: three paid burgers, two drawers, both bags.
    expect(dataOf(reclosed.data)).toMatchObject({
      orderCount: 3,
      grossSales: 36,
      netSales: 36,
      totalCollected: 38.52,
      tax: 2.52,
      openingFloatTotal: 200,
      countedCashTotal: 225.68,
      overShortTotal: 0,
      depositAmount: 25.68,
      orderingPaused: true,
    });
  });

  test("TC-1367: W0:J4-b the owner's Resume ordering lifts the overnight pause, and Recent changes records it", async () => {
    const closed = await orderingStatusRaw(ownerToken, restaurantId);
    expect(closed.data.data).toMatchObject({
      state: "CLOSED_FOR_NIGHT",
      closedForNight: true,
    });
    const before = await getRestaurantDetailsPublicRaw(restaurantId);
    expect(storefrontAccepting(before.data)).toBe(false);

    const resumed = await apiRequestRaw<Rec>(
      "POST",
      `/api/restaurantId/${restaurantId}/ordering/resume`,
      {},
      ownerToken
    );
    expect(resumed.status, JSON.stringify(resumed.data)).toBe(200);
    expect(dataOf(resumed.data).closedForNight).toBe(false);

    const status = await orderingStatusRaw(ownerToken, restaurantId);
    expect(status.data.data?.closedForNight).toBe(false);
    expect(status.data.data?.state).not.toBe("CLOSED_FOR_NIGHT");
    const after = await getRestaurantDetailsPublicRaw(restaurantId);
    expect(after.status, JSON.stringify(after.data)).toBe(200);
    expect(storefrontAccepting(after.data)).toBe(true);

    const history = await settingChangesRaw(ownerToken, restaurantId, {
      area: "ordering",
      limit: 20,
    });
    expect(history.status, JSON.stringify(history.data)).toBe(200);
    const lifted = (history.data.data?.items ?? []).find(
      (i) => i.field === "orderingPausedForDayClose"
    );
    expect(lifted, JSON.stringify(history.data.data?.items)).toBeTruthy();
    expect(lifted).toMatchObject({ area: "ordering", newValue: false });
    expect(lifted?.sentence).toBeTruthy();
    expect(String(lifted?.sentence)).not.toMatch(/^[a-z]+:[\w.]+$/);
  });

  test("TC-1368: W0:J4-b a close with the pause off leaves online ordering open", async () => {
    const reclosed = await closeDay(owner.session, {
      depositAmount: 0,
      reclose: true,
      pauseOrdering: false,
    });
    expect(reclosed.status, JSON.stringify(reclosed.data)).toBe(201);
    expect(dataOf(reclosed.data).orderingPaused).toBe(false);

    const status = await orderingStatusRaw(ownerToken, restaurantId);
    expect(status.data.data?.closedForNight).toBe(false);
    expect(status.data.data?.state).not.toBe("CLOSED_FOR_NIGHT");
    const details = await getRestaurantDetailsPublicRaw(restaurantId);
    expect(storefrontAccepting(details.data)).toBe(true);
  });
});
