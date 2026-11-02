/**
 * 34-sales-tax-ui.spec.ts — Store Settings → Sales tax and the service fee,
 * the way an owner sets them up, and the sales tax report agreeing with a
 * real order (docs/COVERAGE_MAP.md G11) (TC-1074..1079).
 *
 * The server's tax rules are TC-619..624 (api-sales-tax-reports) and the
 * fee's are api-service-fee; the first rate and its rename are the journey,
 * TC-982..983. This is the browser.
 *
 * Browser. A per-run throwaway restaurant (published, taking orders, a
 * Stripe TEST account) with Food: Burger $10 and Drinks: Beer $8, Water $2.
 *
 *   TC-1074 The first rate (6%, the default) and straight after it a
 *           second, "Alcohol" 9%: Alcohol is NOT the default and Recent
 *           changes says who added it. Until RestauNax #1116 (on QA 2026-10-31)
 *           a rate added before the list reloaded silently became the
 *           default, moving the whole menu to 9%.
 *   TC-1075 Drinks are taxed at Alcohol and Water is tax-free, set by
 *           category and by item; they survive a reload.
 *   TC-1076 Changing a rate's percent asks first; Cancel keeps 9%.
 *   TC-1077 A 3% service fee called "Kitchen fee": the form shows what a
 *           $20.00 order pays, saves once, and survives a reload.
 *   TC-1078 An online order of 2 burgers, a beer and a water is priced by
 *           those settings: $30.00 food, $0.90 fee, $1.97 tax (a new service
 *           fee is taxable by default since Stage 3: 6% of $0.90 = $0.05).
 *   TC-1079 The sales tax report for today agrees with the order, line by
 *           line and rate by rate: gross receipts include the $0.90 fee
 *           (taxable), tax due sits next to tax collected (RestauNax audit
 *           W4:C1a / H6).
 */
import type { Locator, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsApi,
  ensureBusinessHours,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  stripeConfigRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  getOrderFullRaw,
  taxRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
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

test.describe.configure({ mode: "serial" });

test.describe("Sales tax and service fee (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let pk = "";
  let session: UiLoginSession | undefined;
  const items = {
    burger: { id: "", name: "Burger", price: 10 },
    beer: { id: "", name: "Beer", price: 8 },
    water: { id: "", name: "Water", price: 2 },
  };
  const food = `Food ${runId}`;
  const drinks = `Drinks ${runId}`;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const portal = (query: string) =>
    `/restaurant/restaurantId/${restaurantId}/restaurantManagement${query}`;
  const openSalesTax = async () => {
    await page().goto(portal("?tab=Store+Settings&settingsTab=sales-tax"), {
      waitUntil: "domcontentloaded",
    });
    await expect(page().getByRole("button", { name: "Add rate" })).toBeVisible({
      timeout: 25_000,
    });
  };
  const rateRow = (name: string) =>
    page().getByRole("row", { name: new RegExp(`^${name}\\b`) });
  /** The Save of "Tax by category and item". */
  const menuSave = () =>
    page()
      .getByRole("heading", { name: "Tax by category and item" })
      .locator("..")
      .getByRole("button", { name: "Save" });
  const pick = async (combo: Locator, option: string) => {
    await combo.click();
    await page().getByRole("option", { name: option, exact: true }).click();
  };
  /** One line of the report's totals table. */
  const reportLine = (label: string) =>
    page().getByRole("row", { name: new RegExp(`^${label} \\$`) });

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[sales-tax-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      acceptingOrders: true,
    });
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await ensureBusinessHours(ownerToken, restaurantId);
    const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
    if (onboard.status !== 200)
      throw new Error(`[sales-tax-ui] stripe: ${JSON.stringify(onboard.data)}`);
    pk = String((await stripeConfigRaw()).data.data?.publishableKey ?? "");
    const foodGroup = await createMenuGroupNamed(ownerToken, food, {
      restaurantId,
    });
    const drinkGroup = await createMenuGroupNamed(ownerToken, drinks, {
      restaurantId,
    });
    items.burger.id = (
      await createMenuItemFull(ownerToken, foodGroup.id, "Burger", 10)
    ).id;
    items.beer.id = (
      await createMenuItemFull(ownerToken, drinkGroup.id, "Beer", 8)
    ).id;
    items.water.id = (
      await createMenuItemFull(ownerToken, drinkGroup.id, "Water", 2)
    ).id;
    session = await loginViaUi(browser, tenant.email, tenant.password);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Sales tax and service fee");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  /** Add a rate through the dialog; it closes once saved. */
  const addRate = async (name: string | null, percent: string) => {
    await page().getByRole("button", { name: "Add rate" }).click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName("Add tax rate");
    if (name) await dialog.getByRole("textbox", { name: "Name" }).fill(name);
    await dialog.getByRole("spinbutton", { name: "Rate (%)" }).fill(percent);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
  };

  test("TC-1074: the first rate, then Alcohol 9% straight after — Alcohol is not made the default", async () => {
    await openSalesTax();
    await addRate(null, "6");
    // Straight away, as an owner setting up two rates does.
    await addRate("Alcohol", "9");
    await expectSeenByUser(
      page().getByText("Alcohol (9%) saved."),
      '"Alcohol (9%) saved."'
    );
    await expect(rateRow("Alcohol")).toContainText("9%");
    await expect(page().getByTestId("recent-changes")).toContainText(
      /added sales tax rate Alcohol \(9%\)/,
      { timeout: 15_000 }
    );
    await expect(rateRow("Sales tax")).toContainText("6%");
    await expect(rateRow("Sales tax")).toContainText("Default");
    await expect(rateRow("Alcohol")).not.toContainText("Default");
    // The default can't be removed; the extra rate can.
    await expect(
      rateRow("Sales tax").getByRole("button", { name: "Remove rate" })
    ).toHaveCount(0);
    await expect(
      rateRow("Alcohol").getByRole("button", { name: "Remove rate" })
    ).toBeVisible();
  });

  test("TC-1075: drinks taxed at Alcohol, water tax-free — by category and by item, kept after a reload", async () => {
    await openSalesTax();
    await expect(menuSave()).toBeDisabled();
    await pick(
      page().getByRole("combobox", { name: `Tax for ${drinks}` }),
      "Alcohol (9%)"
    );
    await page().getByRole("button", { name: drinks, exact: true }).click();
    await pick(
      page().getByRole("combobox", { name: "Tax for Water" }),
      "Tax-free"
    );
    await expect(menuSave()).toBeEnabled();
    await menuSave().click();
    await expectSeenByUser(
      page().getByText(/saved/i).first(),
      "the menu tax saved message"
    );

    await openSalesTax();
    await expect(
      page().getByRole("combobox", { name: `Tax for ${drinks}` })
    ).toHaveText("Alcohol (9%)");
    await expect(
      page().getByRole("combobox", { name: `Tax for ${food}` })
    ).toHaveText("Default (Sales tax)");
    await page().getByRole("button", { name: drinks, exact: true }).click();
    await expect(
      page().getByRole("combobox", { name: "Tax for Water" })
    ).toHaveText("Tax-free");
    await expect(
      page().getByRole("combobox", { name: "Tax for Beer" })
    ).toHaveText("Same as its category");
    await expect(page().getByText("Taxed at Alcohol").first()).toBeVisible();
    await expect(page().getByText("Not taxed").first()).toBeVisible();
  });

  test("TC-1076: changing a rate's percent asks first; Cancel keeps 9%", async () => {
    await openSalesTax();
    await rateRow("Alcohol").getByRole("button", { name: "Edit rate" }).click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName("Edit tax rate");
    await dialog.getByRole("spinbutton", { name: "Rate (%)" }).fill("10");
    await dialog.getByRole("button", { name: "Save" }).click();
    const confirm = activeDialog(page());
    await expect(confirm).toContainText("Alcohol");
    await expectHumanText(confirm, "the change-rate confirmation");
    await expect(confirm).toContainText("Change Alcohol?");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await openSalesTax();
    await expect(rateRow("Alcohol")).toContainText("9%");
  });

  test("TC-1077: a 3% 'Kitchen fee' — the form shows what $20 pays, saves once, and survives a reload", async () => {
    await page().goto(portal("?tab=Store+Settings&settingsTab=fees"), {
      waitUntil: "domcontentloaded",
    });
    const on = page().getByRole("switch", { name: /Add a service fee/ });
    await expect(on).toBeVisible({ timeout: 25_000 });
    await on.click();
    await page()
      .getByRole("spinbutton", { name: "Percent of the order" })
      .fill("3");
    await expect(page().getByText("A $20.00 order pays $0.60.")).toBeVisible();
    await page()
      .getByRole("textbox", { name: "Name on receipts and checkout" })
      .fill("Kitchen fee");
    await expect(page().getByText("Guests see “Kitchen fee”.")).toBeVisible();

    const saved = page().waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes(`/api/restaurantId/${restaurantId}/settings`)
    );
    await page().getByRole("button", { name: "Save service fee" }).click();
    const confirm = activeDialog(page());
    await expect(confirm).toContainText("Start charging a service fee?");
    await expect(confirm).toContainText(
      "Every qualifying order will include a 3% service fee from now on."
    );
    await confirm
      .getByRole("button", { name: "Turn on the service fee" })
      .click();
    expect((await saved).status()).toBe(200);
    await expectSeenByUser(
      page().getByText("Service fee saved").first(),
      "'Service fee saved'"
    );

    await page().reload({ waitUntil: "domcontentloaded" });
    await expect(
      page().getByRole("switch", { name: /Add a service fee/ })
    ).toBeChecked({ timeout: 25_000 });
    await expect(
      page().getByRole("spinbutton", { name: "Percent of the order" })
    ).toHaveValue("3");
    await expect(
      page().getByRole("textbox", { name: "Name on receipts and checkout" })
    ).toHaveValue("Kitchen fee");
  });

  test("TC-1078: an online order is priced by those settings — $30.00 food, $0.90 fee, $1.92 tax", async () => {
    const line = (key: keyof typeof items, quantity: number) => ({
      menuItemId: items[key].id,
      menuItemName: items[key].name,
      quantity,
      price: items[key].price,
    });
    const order = await placePaidOnlineOrder(pk, restaurantId, {
      orderType: "PICKUP",
      subtotal: 30,
      tax: 1.92,
      tip: 0,
      deliveryFee: 0,
      serviceFee: 0.9,
      total: 32.82,
      customerEmail: `auto-guest-${runId}@restaunax-test.com`,
      customerPhone: "5555550123",
      firstName: "Gia",
      lastName: "Guest",
      orderItems: [line("burger", 2), line("beer", 1), line("water", 1)],
    });
    const full = await getOrderFullRaw(ownerToken, order.id);
    expect(full.ok, JSON.stringify(full.data)).toBe(true);
    const o = full.data as Rec;
    // Burgers $20 × 6% = $1.20; the beer $8 × 9% = $0.72; water tax-free;
    // the fee (taxable by default since Stage 3) $0.90 × 6% = $0.05.
    expect(o).toMatchObject({
      subtotal: 30,
      serviceFee: 0.9,
      tax: 1.97,
      total: 32.87,
    });
  });

  test("TC-1079: the sales tax report for today agrees with the order, rate by rate", async () => {
    await openSalesTax();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
    }).format(new Date());
    const yesterday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
    }).format(new Date(Date.now() - 86_400_000));
    // One date at a time, each after its report has answered: the page
    // shows whichever report answers LAST, so two fills in a row could leave
    // the From-only report (an empty day) on screen.
    const reportFor = (start: string, end: string) =>
      page().waitForResponse(
        (r) =>
          r.url().includes(`/report?startDate=${start}&endDate=${end}`) &&
          r.request().method() === "GET"
      );
    const fromLoaded = reportFor(yesterday, "");
    await page().getByRole("textbox", { name: "From" }).fill(yesterday);
    await fromLoaded;
    const toLoaded = reportFor(yesterday, today);
    await page().getByRole("textbox", { name: "To" }).fill(today);
    await toLoaded;
    // Tax due (taxable × rate) comes first; "collected" is no longer
    // labelled "you owe this" (RestauNax audit W4:H6).
    await expect(
      reportLine("Tax due \\(taxable sales × rate\\)")
    ).toContainText("$1.97", { timeout: 20_000 });
    await expect(reportLine("Tax collected")).toContainText("$1.97");
    await expect(
      reportLine("Net tax collected \\(after refunds\\)")
    ).toContainText("$1.97");
    await expect(
      reportLine("Difference \\(collected minus due\\)")
    ).toContainText("$0.00");
    await expect(page().getByText("you owe this")).toHaveCount(0);
    await expect(
      page().getByText("Figures to help prepare your return", { exact: false })
    ).toBeVisible();
    // Gross receipts carry the $0.90 Kitchen fee as its own line, taxable
    // (RestauNax audit W4:C1a): before, the fee appeared nowhere.
    await expect(reportLine("Food and drink")).toContainText("$30.00");
    await expect(
      page().getByRole("row", {
        name: /^Service fees Taxable \$0\.90 · not taxable \$0\.00 \$0\.90$/,
      })
    ).toBeVisible();
    await expect(reportLine("Gross receipts")).toContainText("$30.90");
    await expect(reportLine("Net sales")).toContainText("$30.90");
    // net − non-taxable (water $2.00) − exempt = taxable (fee included).
    await expect(reportLine("Non-taxable sales")).toContainText("$2.00");
    await expect(reportLine("Taxable sales")).toContainText("$28.90");
    // By rate: taxable amount, tax, refunded, net, tax due, difference. The
    // fee is taxed at the default rate: $20.90 at 6%.
    await expect(
      page().getByRole("row", {
        name: /^Sales tax \(6%\) \$20\.90 \$1\.25 \$0\.00 \$1\.25 \$1\.25 \$0\.00$/,
      })
    ).toBeVisible();
    await expect(
      page().getByRole("row", {
        name: /^Alcohol \(9%\) \$8\.00 \$0\.72 \$0\.00 \$0\.72 \$0\.72 \$0\.00$/,
      })
    ).toBeVisible();

    // The same figures from the report API the page reads.
    const r = await taxRaw(
      ownerToken,
      restaurantId,
      "GET",
      `/report?startDate=${yesterday}&endDate=${today}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const t = (r.data.data as Rec).totals as unknown as {
      netSales: number;
      marketplaceSales: number;
      nonTaxableSales: number;
      exemptSales: number;
      taxableSales: number;
    };
    expect(t).toMatchObject({
      foodSales: 30,
      serviceFees: 0.9,
      taxableServiceFees: 0.9,
      grossSales: 30.9,
      netSales: 30.9,
      nonTaxableSales: 2,
      taxableSales: 28.9,
      taxDue: 1.97,
      taxCollected: 1.97,
    });
    expect(
      Math.round(
        (t.netSales - t.marketplaceSales - t.nonTaxableSales - t.exemptSales) *
          100
      )
    ).toBe(Math.round(t.taxableSales * 100));
  });
});
