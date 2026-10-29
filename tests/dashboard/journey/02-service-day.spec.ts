/**
 * 02-service-day.spec.ts — "a week in a restaurant", part 2: one service day
 * on the register, then the owner reads the day and closes it in the browser
 * (TC-990..1000). docs/COVERAGE_MAP.md §3, phase 3.
 *
 * One throwaway restaurant, about 16:00 local (open 10:00–23:00), 7% sales
 * tax, table service, a Stripe TEST account and a REGISTER device. The
 * owner holds the drawer; Dee (a Server, hired the way part 1 does it in the
 * browser) rings the orders. The register is played through the POS API,
 * exactly as device-in-store calls it:
 *
 *   TC-990  Dee clocks in as a Server; the owner opens the drawer with $100.
 *   TC-991  Counter sale, burger + fries: the server prices it $17.12 (7%
 *           tax). Dee can't put cash in the owner's drawer; the owner takes
 *           $20 and the order is paid.
 *   TC-992  Table T1, 2 burgers + 2 beers ($38.52): the guests pay half each
 *           in cash, the second with a $5 tip; the check closes.
 *   TC-993  A guest orders a burger online with a $4 tip on a test card.
 *   TC-994  Table T2 ($10.70) stays open; Dee takes a meal break and comes
 *           back.
 *   TC-995  The owner's Daily Report adds up: net $74.00, tax $5.18, tips
 *           $9.00, gross $88.18, 4 orders, $10.70 uncollected, cash and card
 *           split, by employee.
 *   TC-996  Close Day: the checklist names what blocks it (the open drawer,
 *           T2's $10.70, Dee on the clock) and Next stays off.
 *   TC-997  T2 is paid and the drawer counted blind ($171.34, $0.00 over or
 *           short); the checklist is clear; Clock out selected clocks Dee
 *           out.
 *   TC-998  The summary shows the same figures as the report and the drawer.
 *   TC-999  Confirm: the deposit suggested is the cash taken ($71.34); a
 *           negative one is refused in the dialog; Close Day records it, and
 *           the report says so after a reload.
 *   TC-1000 After the close: Store status says "Closed for the night", a
 *           guest's order is refused in words, and Orders lists the day by
 *           Receipt # with its daily Order #.
 */
import type { Locator, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  restaurantBasicInfoRaw,
  zoneAtMidday,
  updateRestaurantSettingsApi,
  ensureTaxRate,
  setBusinessHoursApi,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  stripeConfigRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createStaffJobRaw,
  setMemberJobsRaw,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  openRegisterSessionPos,
  closeRegisterSessionPosRaw,
  createTabletOrderRaw,
  settleTabCashRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import { tabletPricePreview } from "../../../utils/promotionsApi";
import { placePaidOnlineOrder } from "../../../utils/comboFoodSurfaces";
import {
  activeDialog,
  DESKTOP,
  expectHumanText,
  expectSeenByUser,
} from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;

type Item = { id: string; name: string };

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

test.describe.configure({ mode: "serial" });

test.describe("Journey 2 — a service day, closed by the owner", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let deviceId = "";
  let tablet = "";
  /** The owner on the POS: holds the drawer. */
  let ownerSession = "";
  let pk = "";
  const dee = { id: "", pin: "4826", session: "" };
  let serverJob = "";
  const menu: Record<"burger" | "fries" | "beer", Item> = {
    burger: { id: "", name: "Burger" },
    fries: { id: "", name: "Fries" },
    beer: { id: "", name: "Beer" },
  };
  const t2 = { id: "", total: 0 };
  let session: UiLoginSession | undefined;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const portal = (query = "") =>
    `/restaurant/restaurantId/${restaurantId}/restaurantManagement${query}`;
  const line = (item: Item, quantity: number, price: number) => ({
    menuItemId: item.id,
    menuItemName: item.name,
    quantity,
    price,
  });
  const clockFor = async (staffMemberId: string) => {
    const r = await tabletRaw<Rec>(tablet, "GET", "/staff/time-clock");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return ((r.data.data as Rec[]) ?? []).find((s) => s.id === staffMemberId);
  };
  /** A report card: its caption and its figure. */
  const stat = (label: string): Locator =>
    page()
      .locator(".MuiCard-root")
      .filter({ has: page().getByText(label, { exact: true }) })
      .first();
  /** A wizard summary line: label left, figure right. */
  const summaryRow = (label: string): Locator =>
    activeDialog(page()).getByText(label, { exact: true }).locator("xpath=..");
  const openReport = async () => {
    await page().goto(portal("?tab=store-daily-close"), {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page().getByRole("heading", { name: "Daily Report", level: 1 })
    ).toBeVisible({ timeout: 25_000 });
    await expect(stat("Net sales")).toBeVisible({ timeout: 25_000 });
  };
  const openWizard = async () => {
    await page().getByRole("button", { name: "Close Day" }).click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName("Close Day");
    await expect(dialog.getByText(/^Business day: /)).toBeVisible();
    return dialog;
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[journey-2] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerEmail = tenant.email;
    ownerPassword = tenant.password;
    const owner = tenant.accessToken;

    // About 16:00 local, so the whole day fits inside one business day.
    const zone = await restaurantBasicInfoRaw(adminToken, restaurantId, {
      timezone: zoneAtMidday(new Date(), 16),
    });
    if (zone.status !== 200)
      throw new Error(`[journey-2] zone: ${JSON.stringify(zone.data)}`);
    for (const feature of ["PAYROLL", "SCHEDULING", "TIP_MANAGEMENT"]) {
      const granted = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      if (!granted.ok)
        throw new Error(
          `[journey-2] ${feature}: ${JSON.stringify(granted.data)}`
        );
    }
    await updateRestaurantSettingsApi(owner, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    await ensureTaxRate(owner, restaurantId, 7);
    await setBusinessHoursApi(
      owner,
      restaurantId,
      DAYS.map((day) => ({
        day,
        openingTime: "10:00:00",
        closingTime: "23:00:00",
        isClosed: false,
        is24Hours: false,
      }))
    );
    // An unpublished (preview) restaurant refuses every public order.
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    const onboard = await stripeTestOnboardingRaw(owner, restaurantId);
    if (onboard.status !== 200)
      throw new Error(`[journey-2] stripe: ${JSON.stringify(onboard.data)}`);
    pk = String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
    if (!pk.startsWith("pk_test_"))
      throw new Error("[journey-2] QA must publish a Stripe TEST key");

    const food = await createMenuGroupNamed(owner, `Food ${runId}`, {
      restaurantId,
    });
    const bar = await createMenuGroupNamed(owner, `Bar ${runId}`, {
      restaurantId,
    });
    menu.burger.id = (
      await createMenuItemFull(owner, food.id, "Burger", 12)
    ).id;
    menu.fries.id = (await createMenuItemFull(owner, food.id, "Fries", 4)).id;
    menu.beer.id = (await createMenuItemFull(owner, bar.id, "Beer", 6)).id;

    const job = await createStaffJobRaw(owner, restaurantId, {
      name: "Server",
      defaultHourlyRateCents: 1200,
      isTipped: true,
    });
    if (job.status !== 201)
      throw new Error(`[journey-2] job: ${JSON.stringify(job.data)}`);
    serverJob = String(job.data.data?.id);

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-day-${runId}`
    );
    deviceId = device.id;
    tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(owner, restaurantId, "8462");
    ownerSession = await tabletStaffSignIn(tablet, ownerMember, "8462");
    const added = await tabletRaw<Rec>(
      tablet,
      "POST",
      "/staff/manage",
      { firstName: "Dee", lastName: "Server", pin: dee.pin },
      ownerSession
    );
    if (added.status !== 201)
      throw new Error(`[journey-2] staff: ${JSON.stringify(added.data)}`);
    dee.id = String((added.data.data as Rec).id);
    await setMemberJobsRaw(owner, restaurantId, dee.id, [
      { jobId: serverJob, isPrimary: true },
    ]);
    dee.session = await tabletStaffSignIn(tablet, dee.id, dee.pin);

    session = await loginViaUi(browser, ownerEmail, ownerPassword);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
          () => {}
        );
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Journey — service day and day close");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  test("TC-990: Dee clocks in as a Server; the owner opens the drawer with $100", async () => {
    const inn = await tabletRaw<Rec>(tablet, "POST", "/staff/clock-in", {
      staffMemberId: dee.id,
      pin: dee.pin,
      jobId: serverJob,
    });
    expect(inn.status, JSON.stringify(inn.data)).toBe(200);
    expect((inn.data.data as Rec).shift).toMatchObject({
      jobId: serverJob,
      clockOutAt: null,
    });
    expect((await clockFor(dee.id))?.activeShift).toMatchObject({
      jobName: "Server",
    });

    await openRegisterSessionPos(tablet, ownerSession, 100);
  });

  test("TC-991: a counter sale is priced by the server; only the drawer's holder takes the cash", async () => {
    const items = [line(menu.burger, 1, 12), line(menu.fries, 1, 4)];
    const preview = await tabletPricePreview(tablet, dee.session, {
      restaurantId,
      orderType: "PICKUP",
      orderItems: items,
    });
    expect(preview.status).toBe(200);
    expect((preview.body as Rec).quote).toMatchObject({
      subtotal: 16,
      taxRatePct: 7,
      tax: 1.12,
    });

    const order = await createTabletOrderRaw(tablet, dee.session, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: 16,
      tax: 1.12,
      tip: 0,
      total: 17.12,
      customerPhone: "",
      paymentMethod: "CASH",
      orderItems: items,
    });
    expect(order.status, JSON.stringify(order.data)).toBe(201);
    expect(order.data.total).toBe(17.12);
    expect(order.data.dailyOrderNumber).toBe(1);

    // The drawer is the owner's: Dee's cash would be counted against them.
    const notHers = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${order.data.id}/mark-paid`,
      { cashTendered: 20, cashChange: 2.88 },
      dee.session
    );
    expect(notHers.status).toBe(403);
    expect(String(notHers.data.message)).toMatch(
      /^This drawer belongs to another cashier\./
    );

    const paid = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${order.data.id}/mark-paid`,
      { cashTendered: 20, cashChange: 2.88 },
      ownerSession
    );
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    expect(paid.data.paymentStatus).toBe("COMPLETED");
  });

  test("TC-992: table T1 pays half each in cash, the second guest tips $5, and the check closes", async () => {
    const t1 = await createTabletOrderRaw(tablet, dee.session, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: 36,
      tax: 2.52,
      tip: 0,
      total: 38.52,
      customerPhone: "",
      orderItems: [line(menu.burger, 2, 12), line(menu.beer, 2, 6)],
      openCheck: true,
      tableName: "T1",
      guestCount: 2,
    });
    expect(t1.status, JSON.stringify(t1.data)).toBe(201);
    expect(t1.data.total).toBe(38.52);

    const first = await settleTabCashRaw(
      tablet,
      ownerSession,
      String(t1.data.id),
      {
        amount: 19.26,
        cashTendered: 20,
        idempotencyKey: `j2-${runId}-t1a`,
      }
    );
    expect(first.status, JSON.stringify(first.data)).toBe(200);
    expect(first.data).toMatchObject({ remaining: 19.26, closed: false });
    expect(first.data.leg).toMatchObject({ cashChange: 0.74 });

    const second = await settleTabCashRaw(
      tablet,
      ownerSession,
      String(t1.data.id),
      {
        amount: 19.26,
        cashTendered: 24.26,
        tip: 5,
        idempotencyKey: `j2-${runId}-t1b`,
      }
    );
    expect(second.status, JSON.stringify(second.data)).toBe(200);
    expect(second.data).toMatchObject({ remaining: 0, closed: true });
    expect(second.data.leg).toMatchObject({ tipAmount: 5, amount: 24.26 });
  });

  test("TC-993: a guest orders a burger online and tips $4 on a test card", async () => {
    const web = await placePaidOnlineOrder(pk, restaurantId, {
      orderType: "PICKUP",
      subtotal: 12,
      tax: 0.84,
      tip: 4,
      deliveryFee: 0,
      total: 16.84,
      customerEmail: `auto-guest-${runId}@restaunax-test.com`,
      customerPhone: "5555550123",
      firstName: "Gia",
      lastName: "Guest",
      orderItems: [line(menu.burger, 1, 12)],
    });
    expect(web.total).toBe(16.84);
  });

  test("TC-994: table T2 stays open; Dee takes a meal break and comes back", async () => {
    const check = await createTabletOrderRaw(tablet, dee.session, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: 10,
      tax: 0.7,
      tip: 0,
      total: 10.7,
      customerPhone: "",
      orderItems: [line(menu.fries, 1, 4), line(menu.beer, 1, 6)],
      openCheck: true,
      tableName: "T2",
      guestCount: 1,
    });
    expect(check.status, JSON.stringify(check.data)).toBe(201);
    t2.id = String(check.data.id);
    t2.total = Number(check.data.total);
    expect(t2.total).toBe(10.7);

    const who = { staffMemberId: dee.id, pin: dee.pin };
    const start = await tabletRaw(tablet, "POST", "/staff/break/start", {
      ...who,
      breakTypeId: "meal",
    });
    expect(start.status, JSON.stringify(start.data)).toBe(200);
    expect((await clockFor(dee.id))?.activeBreak).toMatchObject({
      breakTypeName: "Meal break",
    });
    const end = await tabletRaw(tablet, "POST", "/staff/break/end", who);
    expect(end.status, JSON.stringify(end.data)).toBe(200);
    const back = await clockFor(dee.id);
    expect(back?.activeBreak).toBeNull();
    expect(back?.activeShift).toBeTruthy();
  });

  test("TC-995: the Daily Report adds up to the cent", async () => {
    await openReport();
    await expect(
      page().getByText(
        "This day has not been formally closed — figures are live and may still change."
      )
    ).toBeVisible();
    // Net = food before tax (74 = 16 + 36 + 12 + 10, T2 included);
    // gross adds tax and tips.
    await expect(stat("Net sales")).toContainText("$74.00");
    await expect(stat("Tax")).toContainText("$5.18");
    await expect(stat("Tips")).toContainText("$9.00");
    await expect(stat("Gross sales")).toContainText("$88.18");
    await expect(stat("Orders")).toContainText("4");
    await expect(stat("Uncollected (1)")).toContainText("$10.70");

    const methods = page()
      .getByRole("table")
      .filter({ has: page().getByRole("columnheader", { name: "Method" }) });
    await expect(
      methods.getByRole("row", { name: "Cash 3 $60.64" })
    ).toBeVisible();
    await expect(
      methods.getByRole("row", { name: "Card 1 $16.84" })
    ).toBeVisible();
    await expect(
      page().getByRole("heading", {
        name: "Cash drawer — 1 register still open",
      })
    ).toBeVisible();

    const staff = page()
      .getByRole("table")
      .filter({ has: page().getByRole("columnheader", { name: "Staff" }) });
    await expect(
      staff.getByRole("row", { name: "Dee Server 3 $71.34" })
    ).toBeVisible();
    await expect(
      staff.getByRole("row", { name: "Unattributed (kiosk / online) 1 $16.84" })
    ).toBeVisible();
    await expectHumanText(page().getByRole("main"), "the daily report");
  });

  test("TC-996: Close Day names what blocks it, and Next stays off", async () => {
    const dialog = await openWizard();
    await expectSeenByUser(
      dialog.getByText(/^1 drawer is still open\./),
      "the open drawer"
    );
    // Said once (RestauNax #1098): it used to have a second box of its own.
    await expect(dialog.getByText(/still open/)).toHaveCount(1);
    await expect(dialog.getByText(/^1 check still owes money\./)).toBeVisible();
    await expect(dialog.getByText("Table T2 — $10.70")).toBeVisible();
    await expect(dialog.getByText("Dee S.", { exact: true })).toBeVisible();
    // A warning, not a blocker: the online order nobody accepted.
    await expect(
      dialog.getByText(/^1 order has not been accepted yet\./)
    ).toBeVisible();
    await expect(
      dialog.getByText("1 person is still clocked in.")
    ).toBeVisible();
    await expect(
      dialog.getByRole("checkbox", { name: /^Dee Server — / })
    ).toBeChecked();
    await expect(dialog.getByRole("button", { name: "Next" })).toBeDisabled();
    await expectHumanText(dialog, "the close-day checklist");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test("TC-997: T2 is paid, the drawer counts out to the cent, and Clock out selected clocks Dee out", async () => {
    const paid = await settleTabCashRaw(tablet, ownerSession, t2.id, {
      amount: t2.total,
      cashTendered: 20,
      idempotencyKey: `j2-${runId}-t2`,
    });
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    expect(paid.data).toMatchObject({ remaining: 0, closed: true });

    // $100 float + 17.12 + 19.26 + 24.26 (with the $5 tip) + 10.70.
    const counted = await closeRegisterSessionPosRaw(tablet, ownerSession, {
      countedCash: 171.34,
    });
    expect(counted.status, JSON.stringify(counted.data)).toBe(200);
    expect(counted.data.data).toMatchObject({
      expectedCash: 171.34,
      countedCash: 171.34,
      overShort: 0,
    });

    await openReport();
    const dialog = await openWizard();
    await expect(
      dialog.getByText("Nothing outstanding — the day is ready to close.")
    ).toBeVisible();
    await expect(dialog.getByText(/still owes? money/)).toHaveCount(0);
    await expect(dialog.getByText(/still open/)).toHaveCount(0);

    await dialog.getByRole("button", { name: "Clock out selected" }).click();
    await expect(
      dialog.getByText("1 person is still clocked in.")
    ).toBeHidden();
    await expect(dialog.getByRole("button", { name: "Next" })).toBeEnabled();
    expect((await clockFor(dee.id))?.activeShift).toBeNull();
  });

  test("TC-998: the summary shows the report's figures and the drawer's count", async () => {
    const dialog = activeDialog(page());
    await dialog.getByRole("button", { name: "Next" }).click();
    await expect(
      dialog.getByText("Today's figures to be snapshotted")
    ).toBeVisible();
    const expected: [string, string][] = [
      ["Orders", "4"],
      ["Gross sales", "$88.18"],
      ["Net sales", "$74.00"],
      ["Tax", "$5.18"],
      ["Tips", "$9.00"],
      ["Comps / voids / refunds", "0 / 0 / 0"],
      ["Cash", "$71.34"],
      ["Card", "$16.84"],
      ["Opening floats", "$100.00"],
      ["Expected", "$171.34"],
      ["Counted", "$171.34"],
      ["Over / short", "$0.00"],
    ];
    for (const [label, value] of expected)
      await expect(summaryRow(label), label).toHaveText(`${label}${value}`);
  });

  test("TC-999: the deposit is the cash taken; a negative one is refused in the dialog; Close Day records it", async () => {
    const dialog = activeDialog(page());
    await dialog.getByRole("button", { name: "Next" }).click();
    const deposit = dialog.getByRole("spinbutton", {
      name: "Deposit (cash to bank)",
    });
    await expect(deposit).toHaveValue("71.34");
    await expect(dialog.getByText("Suggested: $71.34")).toBeVisible();
    await expect(
      dialog.getByText(
        "Closing the day creates a permanent record. It cannot be edited afterwards."
      )
    ).toBeVisible();

    const close = dialog.getByRole("button", { name: "Close Day" });
    await deposit.fill("-5");
    await close.click();
    await expectSeenByUser(
      dialog.getByText("Enter a valid deposit amount (0 or more)."),
      "the deposit error"
    );
    await expect(dialog).toBeVisible();

    await deposit.fill("71.34");
    await dialog
      .getByRole("textbox", { name: "Note (optional)" })
      .fill("Journey day 2");
    await close.click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    // Who closed it, the deposit and the owner's note.
    const banner = page().getByText(
      /^Day closed by .+ · Deposit \$71\.34 · "Journey day 2"$/
    );
    await expectSeenByUser(banner, "the day-closed banner");

    await page().reload({ waitUntil: "domcontentloaded" });
    await expect(banner).toBeVisible({ timeout: 25_000 });
    await expect(stat("Net sales")).toContainText("$74.00");
    await expect(stat("Over / short")).toContainText("$0.00");
  });

  test("TC-1000: after the close, ordering is closed for the night and Orders lists the day by Receipt #", async () => {
    await page().goto(portal("?tab=store-status"), {
      waitUntil: "domcontentloaded",
    });
    await expect(
      // Tomorrow's opening, named by its day: "reopens Fri 10:00 AM".
      page().getByRole("heading", {
        name: /^Closed for the night · reopens [A-Z][a-z]{2} 10:00 AM$/,
      })
    ).toBeVisible({ timeout: 25_000 });
    await expect(
      page().getByText(
        "You closed the day. Online ordering reopens by itself at your next opening time."
      )
    ).toBeVisible();

    const late = await apiRequestRaw<Rec>(
      "POST",
      `/api/order/new/restaurantId/${restaurantId}`,
      {
        orderType: "PICKUP",
        subtotal: 12,
        tax: 0.84,
        tip: 0,
        deliveryFee: 0,
        total: 12.84,
        customerEmail: `auto-late-${runId}@restaunax-test.com`,
        customerPhone: "5555550124",
        firstName: "Late",
        lastName: "Guest",
        orderItems: [line(menu.burger, 1, 12)],
      }
    );
    expect(late.status).toBe(400);
    expect(String(late.data.message)).toBe(
      "This restaurant has closed for the night. Online ordering opens again in the morning."
    );

    await page().goto(portal("?tab=Orders"), { waitUntil: "domcontentloaded" });
    const orders = page()
      .getByRole("grid")
      .filter({ has: page().getByRole("columnheader", { name: "Receipt #" }) });
    await expect(orders).toBeVisible({ timeout: 25_000 });
    // Receipt # is permanent; the daily Order # rides beside it.
    for (const [receipt, daily, rest] of [
      ["#1000", 1, /Pickup In-Store .* \$17\.12/],
      ["#1001", 2, /SPLIT .*Dine-in In-Store .* \$43\.52/],
      ["#1002", 3, /Gia Guest .*Pickup Web .* \$16\.84/],
      ["#1003", 4, /Dine-in In-Store .* \$10\.70/],
    ] as const) {
      const row = orders.getByRole("row", {
        name: new RegExp(`^${receipt} Order #${daily} `),
      });
      await expect(row).toBeVisible();
      await expect(row).toHaveAccessibleName(rest);
    }
  });
});
