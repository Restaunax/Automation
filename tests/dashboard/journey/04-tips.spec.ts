/**
 * 04-tips.spec.ts — "a week in a restaurant", part 4: the owner sets how
 * tips are shared and checks who gets what, in the browser (TC-1008..1013).
 * docs/COVERAGE_MAP.md §3, phase 5.
 *
 * One throwaway restaurant at about 16:00 local, no tax, a Stripe TEST
 * account and Pay at the table on. Today, finished shifts:
 *   Dee (Server) 6 h · Ana (Server) 4 h · Ben (Busser) 5 h · Cy (Busser) 3 h
 * Dee's table pays $50 + a $30 cash tip at the register; Ana's table pays
 * its $50 + a $20 tip on a test card from the guest's phone (Pay at the
 * table), so the card tip is on her own check.
 *
 *   TC-1008 With no rules each server keeps her own tips: $30.00 and $20.00.
 *   TC-1009 The owner writes a rule by hand: servers give 20% of their tips
 *           to bussers, split by hours; and a fixed 3% card fee comes out of
 *           card tips. Saved, and still so after a reload.
 *   TC-1010 Tips: $50.00 collected, $49.40 to staff, $0.60 card fees; Dee
 *           $24.00, Ana $15.52, Ben $6.17, Cy $3.71, to the cent.
 *   TC-1011 "Where the tip-outs went" names who gave and who received.
 *   TC-1012 Declared cash tips: an empty form is refused in the dialog; Ben's
 *           $12.00 is reported, and his pay doesn't change.
 *   TC-1013 The CSV the owner downloads has the same numbers.
 */
import { readFileSync } from "fs";
import type { Locator, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import { csvToObjects } from "../../../utils/csvHelper";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  restaurantBasicInfoRaw,
  zoneAtMidday,
  updateRestaurantSettingsApi,
  ensureTaxRate,
  ensureBusinessHours,
  setRestaurantPublishedApi,
  stripeTestOnboardingRaw,
  stripeConfigRaw,
  stripePublicRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createStaffJobRaw,
  setMemberJobsRaw,
  payrollRaw,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  openRegisterSessionPos,
  createTabletOrderRaw,
  settleTabCashRaw,
  payAtTableSettingsRaw,
  ensureOrderingSlug,
  tabletReceiptQrsRaw,
  checkPayRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  activeDialog,
  DESKTOP,
  expectHumanText,
  expectSeenByUser,
} from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;

const minutesAgo = (m: number) =>
  new Date(Math.floor(Date.now() / 60_000) * 60_000 - m * 60_000).toISOString();

test.describe.configure({ mode: "serial" });

test.describe("Journey 4 — the owner shares the tips", () => {
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
  let session: UiLoginSession | undefined;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const portal = (query = "") =>
    `/restaurant/restaurantId/${restaurantId}/restaurantManagement${query}`;
  const snackbar = (text: string | RegExp) =>
    page().locator(".MuiSnackbar-root").filter({ hasText: text });
  /** A person's row on Tips: name and hours first, then the money. */
  const tipsRow = (name: string): Locator =>
    page().getByRole("row", { name: new RegExp(`^${name} \\d`) });
  const summary = (label: string): Locator =>
    page().getByText(label, { exact: true }).locator("xpath=..");
  const openTips = async () => {
    await page().goto(portal("?tab=staff&staffTab=tips"), {
      waitUntil: "domcontentloaded",
    });
    await expect(summary("Tips collected")).toBeVisible({ timeout: 25_000 });
  };
  const openPolicy = async () => {
    await page().goto(portal("?tab=staff&staffTab=tipPolicy"), {
      waitUntil: "domcontentloaded",
    });
    await expect(page().getByRole("heading", { name: "Tip-outs" })).toBeVisible(
      { timeout: 25_000 }
    );
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[journey-4] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerEmail = tenant.email;
    ownerPassword = tenant.password;
    const owner = tenant.accessToken;

    // About 16:00 local: a 6-hour shift that just ended began today.
    const zone = await restaurantBasicInfoRaw(adminToken, restaurantId, {
      timezone: zoneAtMidday(new Date(), 16),
    });
    if (zone.status !== 200)
      throw new Error(`[journey-4] zone: ${JSON.stringify(zone.data)}`);
    for (const feature of ["PAYROLL", "SCHEDULING", "TIP_MANAGEMENT"]) {
      const granted = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      if (!granted.ok)
        throw new Error(
          `[journey-4] ${feature}: ${JSON.stringify(granted.data)}`
        );
    }
    await updateRestaurantSettingsApi(owner, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    await ensureTaxRate(owner, restaurantId, 0);
    await setRestaurantPublishedApi(adminToken, restaurantId, true);
    await ensureBusinessHours(owner, restaurantId);
    const onboard = await stripeTestOnboardingRaw(owner, restaurantId);
    if (onboard.status !== 200)
      throw new Error(`[journey-4] stripe: ${JSON.stringify(onboard.data)}`);
    const pk = String(
      (await stripeConfigRaw()).data.data?.publishableKey ?? ""
    );
    if (!pk.startsWith("pk_test_"))
      throw new Error("[journey-4] QA must publish a Stripe TEST key");
    const pat = await payAtTableSettingsRaw(owner, restaurantId, "PUT", {
      settings: { enabled: true },
    });
    if (pat.status !== 200)
      throw new Error(`[journey-4] pay at table: ${JSON.stringify(pat.data)}`);
    // The check's QR links to a storefront: give the tenant an ordering path.
    await ensureOrderingSlug(
      adminToken,
      "restaurant",
      restaurantId,
      `auto-tips-${runId}`
    );

    const food = await createMenuGroupNamed(owner, `Food ${runId}`, {
      restaurantId,
    });
    const steak = await createMenuItemFull(owner, food.id, "Steak", 50);
    const job = async (name: string, cents: number) => {
      const r = await createStaffJobRaw(owner, restaurantId, {
        name,
        defaultHourlyRateCents: cents,
        isTipped: true,
      });
      if (r.status !== 201)
        throw new Error(`[journey-4] job: ${JSON.stringify(r.data)}`);
      return String(r.data.data?.id);
    };
    const server = await job("Server", 1200);
    const busser = await job("Busser", 1100);

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-tips-${runId}`
    );
    deviceId = device.id;
    const tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(owner, restaurantId, "8462");
    const ownerSession = await tabletStaffSignIn(tablet, ownerMember, "8462");
    const person = async (first: string, pin: string, jobId: string) => {
      const r = await tabletRaw<Rec>(
        tablet,
        "POST",
        "/staff/manage",
        { firstName: first, lastName: "Tips", pin },
        ownerSession
      );
      if (r.status !== 201)
        throw new Error(`[journey-4] staff: ${JSON.stringify(r.data)}`);
      const id = String((r.data.data as Rec).id);
      await setMemberJobsRaw(owner, restaurantId, id, [
        { jobId, isPrimary: true },
      ]);
      return { id, pin };
    };
    const dee = await person("Dee", "4826", server);
    const ana = await person("Ana", "3816", server);
    const ben = await person("Ben", "5207", busser);
    const cy = await person("Cy", "2648", busser);
    for (const [p, jobId, hours] of [
      [dee, server, 6],
      [ana, server, 4],
      [ben, busser, 5],
      [cy, busser, 3],
    ] as const) {
      const r = await payrollRaw(owner, restaurantId, "POST", "/shifts", {
        staffMemberId: p.id,
        clockInAt: minutesAgo(2 + hours * 60),
        clockOutAt: minutesAgo(2),
        jobId,
        reason: "Entered from the paper sheet",
      });
      if (r.status !== 201)
        throw new Error(`[journey-4] shift: ${JSON.stringify(r.data)}`);
    }

    const check = async (who: { id: string; pin: string }, table: string) => {
      const s = await tabletStaffSignIn(tablet, who.id, who.pin);
      const r = await createTabletOrderRaw(tablet, s, {
        restaurantId,
        orderType: "PICKUP",
        subtotal: 50,
        tax: 0,
        tip: 0,
        total: 50,
        customerPhone: "",
        orderItems: [
          {
            menuItemId: steak.id,
            menuItemName: "Steak",
            quantity: 1,
            price: 50,
          },
        ],
        openCheck: true,
        tableName: table,
        guestCount: 2,
      });
      if (r.status !== 201)
        throw new Error(`[journey-4] check: ${JSON.stringify(r.data)}`);
      return String(r.data.id);
    };
    const t1 = await check(dee, "T1");
    const t2 = await check(ana, "T2");

    // Dee's table: cash at the register, the owner holds the drawer.
    await openRegisterSessionPos(tablet, ownerSession, 100);
    const cash = await settleTabCashRaw(tablet, ownerSession, t1, {
      amount: 50,
      cashTendered: 80,
      tip: 30,
      idempotencyKey: `j4-${runId}-t1`,
    });
    if (!cash.ok)
      throw new Error(`[journey-4] cash: ${JSON.stringify(cash.data)}`);

    // Ana's table: the guest scans the check and pays on a test card.
    const qr = await tabletReceiptQrsRaw(tablet, t2, { receiptType: "CHECK" });
    const url = String(
      qr.data.data?.codes.find((c) => c.kind === "PAY_AT_TABLE")?.url
    );
    const token = /\/pay\/([A-Za-z0-9_-]{22})$/.exec(url)?.[1] ?? "";
    if (!token) throw new Error(`[journey-4] no pay QR: ${url}`);
    const intent = await checkPayRaw("POST", token, "/intent", {
      mode: "REST",
      tip: 20,
      idempotencyKey: `j4-${runId}-t2`,
    });
    if (intent.status !== 200)
      throw new Error(`[journey-4] intent: ${JSON.stringify(intent.data)}`);
    const pi = intent.data.data as Rec;
    const pm = await stripePublicRaw(pk, "POST", "/payment_methods", {
      type: "card",
      "card[token]": "tok_visa",
    });
    const fin = await checkPayRaw("POST", token, "/finalize-surcharge", {
      paymentIntentId: pi.paymentIntentId,
      paymentMethodId: pm.data.id,
    });
    if (fin.status !== 200)
      throw new Error(`[journey-4] finalize: ${JSON.stringify(fin.data)}`);
    const auth = await stripePublicRaw(
      pk,
      "POST",
      `/payment_intents/${pi.paymentIntentId}/confirm`,
      { client_secret: String(pi.clientSecret), payment_method: pm.data.id }
    );
    if (auth.status !== 200)
      throw new Error(`[journey-4] card: ${JSON.stringify(auth.data)}`);
    const paid = await checkPayRaw("POST", token, "/confirm", {
      paymentIntentId: pi.paymentIntentId,
    });
    if (paid.status !== 200)
      throw new Error(`[journey-4] confirm: ${JSON.stringify(paid.data)}`);

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
    await allure.label("feature", "Journey — tips");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  test("TC-1008: with no rules each server keeps her own tips", async () => {
    await openTips();
    await expect(summary("Tips collected")).toContainText("$50.00");
    await expect(summary("Net to staff")).toContainText("$50.00");
    await expect(summary("Card fees withheld")).toContainText("$0.00");
    // Paid is the sixth figure after the name: hours, own, gave, received,
    // card fee, paid.
    await expect(tipsRow("Dee Tips")).toHaveAccessibleName(
      /^Dee Tips 6\.00 .*Cash \$30\.00.* \$0\.00 \$0\.00 \$0\.00 \$30\.00 /
    );
    await expect(tipsRow("Ana Tips")).toHaveAccessibleName(
      /^Ana Tips 4\.00 Card \$20\.00.* \$0\.00 \$0\.00 \$0\.00 \$20\.00 /
    );
  });

  test("TC-1009: the owner writes the rule by hand and a fixed 3% card fee; saved, and still so after a reload", async () => {
    await openPolicy();
    await expect(
      page().getByText(
        "No tip-out rules: each person keeps their own tips (plus the pool below, if it's on)."
      )
    ).toBeVisible();
    await page().getByRole("button", { name: "Add a rule" }).click();
    const pick = async (combo: string, option: string) => {
      await page().getByRole("combobox", { name: combo }).click();
      await page().getByRole("option", { name: option, exact: true }).click();
    };
    await pick("Job that gives", "Server");
    await page()
      .getByRole("spinbutton", { name: "Percent", exact: true })
      .fill("20");
    await expect(
      page().getByRole("combobox", { name: "Contribution type" })
    ).toHaveText("their tips");
    await pick("Job that receives", "Busser");
    await expect(
      page().getByRole("combobox", { name: "Within a job, split" })
    ).toHaveText("by hours");
    await expect(
      page().getByText("They run in this order every day:")
    ).toBeVisible();
    await expect(
      page().getByText("20% of tips", { exact: true })
    ).toBeVisible();

    await page()
      .getByRole("switch", { name: "Take the card fee out of card tips" })
      .click();
    await page()
      .getByRole("radio", {
        name: "A fixed percent (never more than the actual fee)",
      })
      .check();
    await expect(
      page().getByRole("spinbutton", {
        name: "A fixed percent (never more than the actual fee)",
      })
    ).toHaveValue("3");

    await expectSeenByUser(
      page().getByText("You have unsaved changes to the tip policy."),
      "the unsaved-changes bar"
    );
    await page().getByRole("button", { name: "Save tip policy" }).click();
    await expectSeenByUser(snackbar("Tip policy saved"), '"Tip policy saved"');

    await openPolicy();
    await expect(
      page().getByRole("combobox", { name: "Job that gives" })
    ).toHaveText("Server");
    await expect(
      page().getByRole("spinbutton", { name: "Percent", exact: true })
    ).toHaveValue("20");
    await expect(
      page().getByRole("combobox", { name: "Job that receives" })
    ).toHaveText("Busser");
    await expect(
      page().getByRole("switch", { name: "Take the card fee out of card tips" })
    ).toBeChecked();
    await expect(
      page().getByRole("radio", {
        name: "A fixed percent (never more than the actual fee)",
      })
    ).toBeChecked();
    await expectHumanText(page().getByRole("main"), "the tip policy");
  });

  test("TC-1010: Tips shows who gets what, to the cent", async () => {
    await openTips();
    await expect(summary("Tips collected")).toContainText("$50.00");
    await expect(summary("Net to staff")).toContainText("$49.40");
    // 3% of the card tip, $20.00 — part from Ana, part from what she gave.
    await expect(summary("Card fees withheld")).toContainText("$0.60");
    // Own · gave · received · card fee · paid · paid from drawer · declared.
    await expect(tipsRow("Dee Tips")).toHaveAccessibleName(
      /^Dee Tips 6\.00 .* −\$6\.00 \$0\.00 \$0\.00 \$24\.00 \$0\.00 \$0\.00$/
    );
    await expect(tipsRow("Ana Tips")).toHaveAccessibleName(
      /^Ana Tips 4\.00 .* −\$4\.00 \$0\.00 −\$0\.48 \$15\.52 \$0\.00 \$0\.00$/
    );
    // $10.00 split 5 : 3 by hours; the fee on the card part, 8 + 4 cents.
    await expect(tipsRow("Ben Tips")).toHaveAccessibleName(
      /^Ben Tips 5\.00 .* \$0\.00 \+\$6\.25 −\$0\.08 \$6\.17 \$0\.00 \$0\.00$/
    );
    await expect(tipsRow("Cy Tips")).toHaveAccessibleName(
      /^Cy Tips 3\.00 .* \$0\.00 \+\$3\.75 −\$0\.04 \$3\.71 \$0\.00 \$0\.00$/
    );
    await expectHumanText(page().getByRole("main"), "the tips report");
  });

  test("TC-1011: Where the tip-outs went names who gave and who received", async () => {
    const day = page().getByRole("button", { name: /\$10\.00 tipped out$/ });
    await day.click();
    await expect(page().getByText("Server → Busser: $10.00")).toBeVisible();
    // Biggest amount first (RestauNax #1101), the same order every load.
    await expect(
      page().getByText("From: Dee Tips $6.00, Ana Tips $4.00")
    ).toBeVisible();
    await expect(
      page().getByText("To: Ben Tips $6.25, Cy Tips $3.75")
    ).toBeVisible();
  });

  test("TC-1012: declared cash tips — an empty form is refused in the dialog; Ben's $12.00 is reported, his pay unchanged", async () => {
    await page().getByRole("button", { name: "Enter cash tips" }).click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName("Enter declared cash tips");
    await expect(dialog).toContainText(
      "Cash guests handed to this person directly. It's reported for taxes and kept by the person."
    );
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expectSeenByUser(
      dialog.getByText("Choose a person and enter an amount of $0 or more."),
      "the empty-form message"
    );

    // Labelled "Staff member" (RestauNax #1101), people listed by name.
    const picker = dialog.getByRole("combobox", { name: /^Staff member/ });
    await picker.click();
    await expect(page().getByRole("option")).toHaveText([
      "Ana Tips",
      "Ben Tips",
      "Cy Tips",
      "Dee Tips",
    ]);
    await page().getByRole("option", { name: "Ben Tips", exact: true }).click();
    await dialog.getByRole("spinbutton", { name: "Cash tips" }).fill("12");
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(summary("Declared cash tips")).toContainText("$12.00");
    await expect(tipsRow("Ben Tips")).toHaveAccessibleName(
      /\$6\.17 \$0\.00 \$12\.00$/
    );
    await expect(summary("Net to staff")).toContainText("$49.40");
  });

  test("TC-1013: the CSV the owner downloads has the same numbers", async () => {
    const [download] = await Promise.all([
      page().waitForEvent("download"),
      page().getByRole("button", { name: "Download CSV" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const path = await download.path();
    const text = readFileSync(path, "utf8");
    // Excel's byte-order mark is allowed; the header is still "Name".
    const { header, rows } = csvToObjects(text.replace(/^\uFEFF/, ""));
    expect(header[0], JSON.stringify(text.slice(0, 40))).toBe("Name");
    const by = new Map(rows.map((r) => [r["Name"], r]));
    expect(by.get("Dee Tips")).toMatchObject({
      Hours: "6.00",
      "Cash tips": "30.00",
      "Tip-outs given": "6.00",
      "Net tips": "24.00",
    });
    expect(by.get("Ana Tips")).toMatchObject({
      "Card tips": "20.00",
      "Tip-outs given": "4.00",
      "Card fee withheld": "0.48",
      "Net tips": "15.52",
    });
    expect(by.get("Ben Tips")).toMatchObject({
      "Tip-outs received": "6.25",
      "Card fee withheld": "0.08",
      "Net tips": "6.17",
      "Declared cash tips": "12.00",
    });
    expect(by.get("Cy Tips")).toMatchObject({
      "Tip-outs received": "3.75",
      "Card fee withheld": "0.04",
      "Net tips": "3.71",
    });
    // Every cent is accounted for: what staff get plus the fees = $50.00.
    const cents = (k: string) =>
      rows.reduce((s, r) => s + Math.round(Number(r[k]) * 100), 0);
    expect(cents("Net tips") + cents("Card fee withheld")).toBe(5000);
  });
});
