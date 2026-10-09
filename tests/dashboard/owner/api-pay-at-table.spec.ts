/**
 * api-pay-at-table.spec.ts — Pay at the table on QA (restaunax #926,
 * docs/features/PAY_AT_TABLE.md) (TC-680..690).
 *
 * No browser. A per-run throwaway restaurant (Miami, FL) with table service
 * and Pay at the table on, a Stripe TEST Connect account from the QA-only
 * dummy onboarding, a REGISTER device with the owner signed in, and four
 * table checks opened through the tablet API:
 *   C0  4 × $25.00 dish, no tax, no fees        — the spec's $100 example
 *   C1  pizza $20 (shared) + 2 × salad $10, 8% tax, 3% service fee, 18%
 *       auto-gratuity (party of 4)              — the bill, quotes, refusals
 *   C2  4 × salad, tax + service fee             — the card fee, credit vs debit
 *   C3  1 × salad                                — first to pay wins
 *
 * A guest's phone is played by the test: the public check-pay API plus
 * Stripe's own API with the PUBLISHABLE key (create a card PaymentMethod from
 * a test token, confirm the PaymentIntent with its client secret) — exactly
 * what the storefront page does. Never a secret key.
 *
 * Serial; ~35 public writes, under the 60 / 15 min / IP write limit.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, generateUserEmail } from "../../../utils/testData";
import { waitForEmail } from "../../../utils/emailHelper";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  updateRestaurantSettingsApi,
  updateRestaurantSettingsRaw,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  createTabletOrderRaw,
  modifyTabletOrderRaw,
  getOrderFullRaw,
  getTabletTablesRaw,
  tabletRaw,
  checkPayRaw,
  checkPayCodeRaw,
  payAtTableSettingsRaw,
  receiptQrCodesRaw,
  tabletReceiptQrsRaw,
  stripeTestOnboardingRaw,
  stripeConfigRaw,
  stripePublicRaw,
  createRewardProgramRaw,
  type LooseJson,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;
const cents = (d: number) => Math.round(d * 100);
const ES = { "Accept-Language": "es" };

/** The online card fee on a share (cents), the backend's rule: 2.9% + $0.30,
 *  floored to the 3% network cap, never above the share. */
const cardFeeCents = (shareCents: number) => {
  const base = shareCents / 100;
  const raw = Math.round((base * 0.029 + 0.3) * 100) / 100;
  const ceiling = Math.floor(base * 0.03 * 100) / 100;
  return cents(Math.max(0, Math.min(raw, ceiling, base)));
};

/** The same order of default codes the backend returns (CUSTOM excluded). */
const DEFAULT_QR_KINDS = [
  "PAY_AT_TABLE",
  "REWARDS",
  "GOOGLE_REVIEW",
  "WEBSITE",
  "INSTAGRAM",
  "FACEBOOK",
  "TIKTOK",
  "YELP",
];

test.describe.configure({ mode: "serial" });

test.describe("Pay at the table — the guest's phone, on QA (API)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  const keyBase = `pat${runId}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  let seq = 0;
  const newKey = () => `${keyBase}_${String(++seq).padStart(3, "0")}`;

  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let restaurantName = "";
  let deviceId = "";
  let tablet = "";
  let session = "";
  let pk = "";
  type CheckName = "C0" | "C1" | "C2" | "C3";
  type ItemName = "dish" | "pizza" | "salad";
  const blank = { id: "", name: "" };
  const items: Record<ItemName, { id: string; name: string }> = {
    dish: blank,
    pizza: blank,
    salad: blank,
  };
  const checks: Record<CheckName, string> = { C0: "", C1: "", C2: "", C3: "" };
  const tokens: Record<CheckName, string> = { C0: "", C1: "", C2: "", C3: "" };
  const displayCodes: Record<CheckName, string> = {
    C0: "",
    C1: "",
    C2: "",
    C3: "",
  };
  /** Legs paid on C0, in order (Ana, Ben, Cal, Dee). */
  const c0Legs: string[] = [];
  const c0Leg = (i: number): string => {
    const id = c0Legs[i];
    if (!id) throw new Error(`C0 leg ${i} was never paid`);
    return id;
  };
  let c3WinnerLeg = "";

  // ── the phone ─────────────────────────────────────────────────────────────

  const bill = async (token: string): Promise<Rec> => {
    const r = await checkPayRaw("GET", token);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };
  const quote = (token: string, body: Rec, headers?: Record<string, string>) =>
    checkPayRaw("POST", token, "/quote", body, headers);
  const okQuote = async (token: string, body: Rec): Promise<Rec> => {
    const r = await quote(token, body);
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return r.data.data as Rec;
  };
  const cardPm = async (tok: "tok_visa" | "tok_visa_debit") => {
    const r = await stripePublicRaw(pk, "POST", "/payment_methods", {
      type: "card",
      "card[token]": tok,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return String(r.data.id);
  };
  const intent = async (token: string, body: Rec): Promise<Rec> => {
    const r = await checkPayRaw("POST", token, "/intent", {
      ...body,
      idempotencyKey: newKey(),
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const d = r.data.data as Rec;
    expect(String(d.clientSecret)).toMatch(/^pi_.+_secret_/);
    return d;
  };
  /** Stripe authorizes (manual capture → requires_capture). */
  const authorize = async (pi: Rec, pm: string) => {
    const r = await stripePublicRaw(
      pk,
      "POST",
      `/payment_intents/${pi.paymentIntentId}/confirm`,
      { client_secret: String(pi.clientSecret), payment_method: pm }
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.status).toBe("requires_capture");
  };
  const piStatus = async (pi: Rec) => {
    const r = await stripePublicRaw(
      pk,
      "GET",
      `/payment_intents/${pi.paymentIntentId}`,
      { client_secret: String(pi.clientSecret) }
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return { status: String(r.data.status), amount: Number(r.data.amount) };
  };
  const confirm = (token: string, pi: Rec) =>
    checkPayRaw("POST", token, "/confirm", {
      paymentIntentId: pi.paymentIntentId,
    });
  /** The whole phone flow: intent → card → finalize fee → authorize → apply. */
  const pay = async (
    token: string,
    body: Rec,
    card: "tok_visa" | "tok_visa_debit" = "tok_visa"
  ) => {
    const pi = await intent(token, body);
    const pm = await cardPm(card);
    const fin = await checkPayRaw("POST", token, "/finalize-surcharge", {
      paymentIntentId: pi.paymentIntentId,
      paymentMethodId: pm,
    });
    expect(fin.status, JSON.stringify(fin.data)).toBe(200);
    await authorize(pi, pm);
    const c = await confirm(token, pi);
    expect(c.status, JSON.stringify(c.data)).toBe(200);
    return {
      pi,
      finalize: fin.data.data as Rec,
      done: c.data.data as Rec,
    };
  };

  // ── the POS ───────────────────────────────────────────────────────────────

  const openCheck = async (
    table: string,
    lines: { item: ItemName; qty: number; price: number }[],
    opts: { foodTax?: number; guests?: number; phone?: string } = {}
  ) => {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.price, 0);
    const tax = opts.foodTax ?? 0;
    const r = await createTabletOrderRaw(tablet, session, {
      restaurantId,
      orderType: "PICKUP",
      subtotal,
      tax,
      tip: 0,
      total: Math.round((subtotal + tax) * 100) / 100,
      customerPhone: opts.phone ?? "",
      orderItems: lines.map((l) => ({
        menuItemId: items[l.item].id,
        menuItemName: items[l.item].name,
        quantity: l.qty,
        price: l.price,
      })),
      openCheck: true,
      tableName: table,
      guestCount: opts.guests ?? 2,
    });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    return String(r.data.id);
  };
  /** The check's QR, as the POS prints it: the token is the URL's last part. */
  const mintToken = async (name: CheckName) => {
    const r = await tabletReceiptQrsRaw(tablet, checks[name], {
      receiptType: "CHECK",
    });
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    const qr = r.data.data?.codes.find((c) => c.kind === "PAY_AT_TABLE");
    expect(qr, JSON.stringify(r.data)).toBeTruthy();
    const m = /\/pay\/([A-Za-z0-9_-]{22})$/.exec(String(qr?.url));
    expect(m, String(qr?.url)).toBeTruthy();
    tokens[name] = m?.[1] ?? "";
    displayCodes[name] = String(qr?.displayCode);
  };
  const line = (b: Rec, name: string) =>
    (b.lines as Rec[]).find((l) => String(l.name).startsWith(name)) as Rec;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[pay-at-table] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    restaurantName = `Automation Owner2 Store ${runId}`;
    await updateRestaurantSettingsApi(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
      tax: 0,
    });
    const onboard = await stripeTestOnboardingRaw(ownerToken, restaurantId);
    expect(onboard.status, JSON.stringify(onboard.data)).toBe(200);
    expect(String(onboard.data.stripeAccountId)).toMatch(/^acct_/);
    const cfg = await stripeConfigRaw();
    pk = String(cfg.data.data?.publishableKey ?? "");
    expect(pk, "QA must publish a Stripe TEST key").toMatch(/^pk_test_/);

    const group = (
      await createMenuGroupNamed(ownerToken, `Dinner ${runId}`, {
        restaurantId,
      })
    ).id;
    items.dish = await createMenuItemFull(
      ownerToken,
      group,
      `Dish ${runId}`,
      25
    );
    items.pizza = await createMenuItemFull(
      ownerToken,
      group,
      `Pizza ${runId}`,
      20
    );
    items.salad = await createMenuItemFull(
      ownerToken,
      group,
      `Salad ${runId}`,
      10
    );

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-pat-${runId}`
    );
    deviceId = device.id;
    tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(ownerToken, restaurantId, "5274");
    session = await tabletStaffSignIn(tablet, ownerMember, "5274");

    const pat = await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: true },
    });
    expect(pat.status, JSON.stringify(pat.data)).toBe(200);

    // C0 before any tax or fee rule: four $25.00 dishes = $100.00 exactly.
    checks.C0 = await openCheck("T0", [{ item: "dish", qty: 4, price: 25 }], {
      guests: 4,
    });

    // Then the rules C1..C3 are opened under.
    const rules = await updateRestaurantSettingsRaw(ownerToken, restaurantId, {
      tax: 8,
      serviceFee: {
        enabled: true,
        percent: 3,
        label: "Service fee",
        taxable: false,
        distribution: "HOUSE",
        orderTypes: ["DINE_IN", "PICKUP", "DELIVERY"],
        channels: ["POS", "ONLINE", "KIOSK", "VOICE"],
        minimumSubtotal: null,
        notice: null,
      },
      autoGratuity: {
        enabled: true,
        minGuests: 4,
        percent: 18,
        label: "Gratuity",
        taxable: false,
        distribution: "HOUSE",
      },
    });
    expect(rules.status, JSON.stringify(rules.data)).toBe(200);
    checks.C1 = await openCheck(
      "T1",
      [
        { item: "pizza", qty: 1, price: 20 },
        { item: "salad", qty: 2, price: 10 },
      ],
      { foodTax: 3.2, guests: 4, phone: "3055550142" }
    );
    checks.C2 = await openCheck("T2", [{ item: "salad", qty: 4, price: 10 }], {
      foodTax: 3.2,
    });
    checks.C3 = await openCheck("T3", [{ item: "salad", qty: 1, price: 10 }], {
      foodTax: 0.8,
    });
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId);
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Pay at the table");
    await allure.label("severity", "critical");
  });

  test("TC-680: owner settings — pay at the table is normalized and says when it can print", async () => {
    const got = await payAtTableSettingsRaw(ownerToken, restaurantId, "GET");
    expect(got.status, JSON.stringify(got.data)).toBe(200);
    const d = got.data.data as Rec;
    expect(d.settings).toEqual({
      enabled: true,
      splitEvenly: true,
      byItem: true,
      shareItems: true,
      customAmount: true,
      minimumAmount: 1,
      collectReceiptEmail: true,
      offerRewards: true,
    });
    const avail = d.availability as Rec;
    expect(avail.tableServiceEnabled).toBe(true);
    expect(String(avail.storefrontUrl)).toMatch(/^https?:\/\//);
    expect(avail.available).toBe(true);

    // The minimum is clamped to $0.50..$100; sharing needs by-item.
    const low = await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: {
        enabled: true,
        minimumAmount: 0.1,
        byItem: false,
        shareItems: true,
      },
    });
    expect(low.status).toBe(200);
    const lowS = (low.data.data as Rec).settings as Rec;
    expect(lowS.minimumAmount).toBe(0.5);
    expect(lowS.byItem).toBe(false);
    expect(lowS.shareItems).toBe(false);
    const high = await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: true, minimumAmount: 500 },
    });
    expect(((high.data.data as Rec).settings as Rec).minimumAmount).toBe(100);

    // Another owner can't read or write it.
    const other = await payAtTableSettingsRaw(
      adminToken,
      "not-a-restaurant",
      "GET"
    );
    expect([403, 404]).toContain(other.status);

    const back = await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: true },
    });
    expect(((back.data.data as Rec).settings as Rec).minimumAmount).toBe(1);
  });

  test("TC-681: receipt QR codes — at most 3 per slip, https links, Google review hosts (EN + ES)", async () => {
    const got = await receiptQrCodesRaw(ownerToken, restaurantId, "GET");
    expect(got.status, JSON.stringify(got.data)).toBe(200);
    const d = got.data.data as Rec;
    const codes = d.codes as Rec[];
    expect(codes.map((c) => c.kind)).toEqual(DEFAULT_QR_KINDS);
    const payCode = codes.find((c) => c.kind === "PAY_AT_TABLE") as Rec;
    expect(payCode.enabled).toBe(true);
    expect(payCode.printOn).toEqual(["CHECK"]);
    expect(payCode.allowedSlips).toEqual(["CHECK"]);
    expect(payCode.dynamic).toBe(true);
    expect((d.limits as Rec).maxPerSlip).toBe(3);
    expect(((d.dynamicStatus as Rec).payAtTable as Rec).enabled).toBe(true);

    const code = (kind: string, printOn: string[], extra: Rec = {}) => ({
      kind,
      enabled: true,
      label: null,
      printOn,
      url: null,
      ...extra,
    });
    // Four codes on the customer copy.
    const tooMany = [
      code("REWARDS", ["CUSTOMER"]),
      code("WEBSITE", ["CUSTOMER"]),
      code("CUSTOM", ["CUSTOMER"], { url: "https://example.com/a" }),
      code("CUSTOM", ["CUSTOMER"], { url: "https://example.com/b" }),
    ];
    const en = await receiptQrCodesRaw(ownerToken, restaurantId, "PUT", {
      codes: tooMany,
    });
    expect(en.status).toBe(400);
    expect(en.data.code).toBe("TOO_MANY_ON_SLIP");
    expect((en.data.details as Rec).slip).toBe("CUSTOMER");
    expect((en.data.details as Rec).count).toBe(4);
    expect(String(en.data.error)).toMatch(/^At most 3 QR codes fit on one /);
    const es = await receiptQrCodesRaw(
      ownerToken,
      restaurantId,
      "PUT",
      { codes: tooMany },
      ES
    );
    expect(es.status).toBe(400);
    expect(String(es.data.error)).toMatch(/^Caben como máximo 3 códigos QR/);

    // A third CUSTOM is dropped by the normalizer (max 2), so 3 on a slip is fine.
    const http = await receiptQrCodesRaw(ownerToken, restaurantId, "PUT", {
      codes: [code("CUSTOM", ["CHECK"], { url: "http://example.com/menu" })],
    });
    expect(http.status).toBe(400);
    expect(http.data.code).toBe("URL_NOT_HTTPS");
    const notGoogle = await receiptQrCodesRaw(ownerToken, restaurantId, "PUT", {
      codes: [
        code("GOOGLE_REVIEW", ["CUSTOMER"], {
          url: "https://example.com/review",
        }),
      ],
    });
    expect(notGoogle.status).toBe(400);
    expect(notGoogle.data.code).toBe("URL_NOT_GOOGLE");
    const social = await receiptQrCodesRaw(ownerToken, restaurantId, "PUT", {
      codes: [],
      links: { instagramUrl: "instagram.com/x" },
    });
    expect(social.status).toBe(400);
    expect(social.data.code).toBe("SOCIAL_URL_INVALID");

    // A valid list in the owner's order: a custom link first on the check.
    const ok = await receiptQrCodesRaw(ownerToken, restaurantId, "PUT", {
      codes: [
        code("CUSTOM", ["CHECK", "CUSTOMER"], {
          url: "https://example.com/menu",
          label: "Our menu",
        }),
        code("PAY_AT_TABLE", ["CHECK", "CUSTOMER"]),
        code("REWARDS", ["CUSTOMER", "GUEST_PAYMENT"]),
      ],
      links: { instagramUrl: "https://instagram.com/automation" },
    });
    expect(ok.status, JSON.stringify(ok.data)).toBe(200);
    const saved = (ok.data.data as Rec).codes as Rec[];
    expect(saved.slice(0, 3).map((c) => c.kind)).toEqual([
      "CUSTOM",
      "PAY_AT_TABLE",
      "REWARDS",
    ]);
    // A slip the kind may not print on is filtered out.
    expect(saved[1]?.printOn).toEqual(["CHECK"]);
    expect(((ok.data.data as Rec).links as Rec).instagramUrl).toBe(
      "https://instagram.com/automation"
    );
  });

  test("TC-682: the POS print — receipt-qrs returns the owner's order, the pay link only on an open check", async () => {
    const check = await tabletReceiptQrsRaw(tablet, checks.C1, {
      receiptType: "CHECK",
    });
    expect(check.status, JSON.stringify(check.data)).toBe(200);
    const codes = check.data.data!.codes;
    expect(codes.map((c) => c.kind)).toEqual(["CUSTOM", "PAY_AT_TABLE"]);
    expect(codes[0]).toMatchObject({
      label: "Our menu",
      url: "https://example.com/menu",
      displayCode: null,
    });
    expect(codes[1]?.url).toMatch(/\/pay\/[A-Za-z0-9_-]{22}$/);
    expect(codes[1]?.displayCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    // The same check prints the same token again.
    const again = await tabletReceiptQrsRaw(tablet, checks.C1, {
      receiptType: "CHECK",
    });
    expect(again.data.data?.codes[1]?.url).toBe(codes[1]?.url);

    // Customer copy of an unpaid check: no pay link, no rewards (not paid).
    const customer = await tabletReceiptQrsRaw(tablet, checks.C1, {
      receiptType: "CUSTOMER",
    });
    expect(customer.status).toBe(200);
    expect(customer.data.data!.codes.map((c) => c.kind)).toEqual(["CUSTOM"]);

    const bad = await tabletReceiptQrsRaw(tablet, checks.C1, {
      receiptType: "MENU",
    });
    expect(bad.status).toBe(400);
    expect(bad.data.code).toBe("RECEIPT_TYPE_INVALID");

    // Back to the defaults for the rest of the file.
    const reset = await receiptQrCodesRaw(ownerToken, restaurantId, "PUT", {
      codes: DEFAULT_QR_KINDS.map((kind) => ({
        kind,
        enabled: kind === "PAY_AT_TABLE" || kind === "REWARDS",
        printOn:
          kind === "PAY_AT_TABLE"
            ? ["CHECK"]
            : kind === "REWARDS"
              ? ["CUSTOMER", "GUEST_PAYMENT"]
              : ["CUSTOMER"],
      })),
    });
    expect(reset.status, JSON.stringify(reset.data)).toBe(200);
    for (const name of ["C0", "C1", "C2", "C3"] as const) await mintToken(name);
  });

  test("TC-683: the bill — no PII, typed-code lookup, 404 / 410 DISABLED", async () => {
    const b = await bill(tokens.C1);
    const order = (await getOrderFullRaw(ownerToken, checks.C1)).data as Rec;
    expect(b.status).toBe("OPEN");
    expect(b.table).toBe("T1");
    expect(b.restaurant).toMatchObject({ name: restaurantName });
    expect(String(b.receiptNumber)).toBe(String(order.receiptNumber));
    const totals = b.totals as Rec;
    expect(totals.food).toBe(40);
    expect(totals.tax).toBe(Number(order.tax));
    expect((totals.serviceFee as Rec).amount).toBe(1.2);
    expect((totals.serviceFee as Rec).percent).toBe(3);
    expect((totals.autoGratuity as Rec).amount).toBe(7.2);
    expect((totals.autoGratuity as Rec).percent).toBe(18);
    // The meal the table owes = the order total (no tip, no card fee yet).
    expect(totals.checkTotal).toBe(Number(order.total));
    expect(b.remaining).toBe(totals.checkTotal);
    expect(b.paidSoFar).toBe(0);
    expect(b.guestCount).toBe(4);
    expect(b.tip).toMatchObject({ presets: [3, 5, 7], additional: true });
    expect(b.cardFee).toEqual({ passThrough: false });
    expect(b.options).toMatchObject({
      everything: true,
      splitEvenly: true,
      byItem: true,
      shareItems: true,
      customAmount: true,
      minimumAmount: 1,
      maxShareParts: 10,
    });
    const salad = line(b, "Salad");
    expect(salad.quantity).toBe(2);
    expect((salad.units as Rec[]).length).toBe(2);
    expect(salad.state).toBe("UNPAID");
    // Each line's units add up to the check (the cent fix lands on the last).
    const unitSum = (b.lines as Rec[]).reduce(
      (s, l) => s + cents(Number(l.unitValue)) * Number(l.quantity),
      0
    );
    expect(
      Math.abs(unitSum - cents(Number(totals.checkTotal)))
    ).toBeLessThanOrEqual(2);

    // No PII and no payment ids, ever.
    const raw = JSON.stringify(b);
    expect(raw).not.toContain("3055550142");
    expect(raw).not.toContain("5550142");
    expect(raw).not.toMatch(/pi_|acct_|cus_|@/);
    expect(raw).not.toContain(checks.C1);

    // The typed code: case, dash and look-alike letters forgiven.
    const typed = displayCodes.C1.replace("-", "").toLowerCase();
    const looked = await checkPayCodeRaw(typed);
    expect(looked.status, JSON.stringify(looked.data)).toBe(200);
    expect(looked.data.data?.displayCode).toBe(displayCodes.C1);
    const viaCode = await bill(String(looked.data.data?.token));
    expect(viaCode.receiptNumber).toBe(b.receiptNumber);
    expect((await checkPayCodeRaw("0000-0000")).status).toBe(404);

    expect((await checkPayRaw("GET", "A".repeat(22))).status).toBe(404);
    const unknown = await checkPayRaw("GET", "nope");
    expect(unknown.status).toBe(404);
    expect(unknown.data.code).toBe("NOT_FOUND");

    // Switched off → 410 DISABLED; back on → readable again.
    await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: false },
    });
    const off = await checkPayRaw("GET", tokens.C1);
    expect(off.status).toBe(410);
    expect(off.data.code).toBe("DISABLED");
    await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: true },
    });
    await bill(tokens.C1);
  });

  test("TC-684: quotes — everything, even split, by item, a shared part, an amount; tip and refusal rules (EN + ES)", async () => {
    const b = await bill(tokens.C1);
    const R = cents(Number(b.remaining));

    const rest = await okQuote(tokens.C1, { mode: "REST" });
    expect(cents(Number(rest.share))).toBe(R);
    expect(rest.fee).toBe(0);
    expect(rest.total).toBe(rest.share);
    expect(rest.remainingAfter).toBe(0);
    const bd = rest.breakdown as Rec;
    expect(
      cents(Number(bd.food)) -
        cents(Number(bd.discounts)) +
        cents(Number(bd.serviceFee)) +
        cents(Number(bd.autoGratuity)) +
        cents(Number(bd.tax))
    ).toBe(R);
    // A gratuity is on the check: the presets are "additional" 3 / 5 / 7 %.
    expect(rest.additionalTip).toBe(true);
    const tipBase = cents(Number(rest.tipBase));
    expect(rest.tipOptions).toEqual(
      [3, 5, 7].map((p) => ({
        percent: p,
        amount: Math.round((tipBase * p) / 100) / 100,
      }))
    );

    // Even: 3 ways, the shares cover the check to the cent.
    const shares = [];
    for (const mine of [1, 2, 3]) {
      const q = await okQuote(tokens.C1, {
        mode: "EVEN",
        splitWays: 3,
        myShares: mine,
      });
      expect(q.split).toEqual({ ways: 3, myShares: mine });
      shares.push(cents(Number(q.share)));
    }
    expect(shares[2]).toBe(R);
    const one = shares[0];
    expect([Math.floor(R / 3), Math.ceil(R / 3)]).toContain(one);

    // By item: one salad = its unit value (nothing paid yet, so no credit).
    const salad = line(b, "Salad");
    const saladQ = await okQuote(tokens.C1, {
      mode: "ITEMS",
      items: [{ lineKind: salad.kind, lineId: salad.id, unitIndex: 0 }],
    });
    expect(saladQ.share).toBe(salad.unitValue);
    expect((saladQ.breakdown as Rec).tableCredit).toBe(0);
    // A third of the pizza, then all three thirds = the whole pizza.
    const pizza = line(b, "Pizza");
    const third = await okQuote(tokens.C1, {
      mode: "ITEMS",
      items: [
        { lineKind: pizza.kind, lineId: pizza.id, unitIndex: 0, parts: 3 },
      ],
    });
    const pizzaC = cents(Number(pizza.unitValue));
    expect(
      Math.abs(cents(Number(third.share)) - pizzaC / 3)
    ).toBeLessThanOrEqual(1);
    const all3 = await okQuote(tokens.C1, {
      mode: "ITEMS",
      items: [
        {
          lineKind: pizza.kind,
          lineId: pizza.id,
          unitIndex: 0,
          parts: 3,
          partCount: 3,
        },
      ],
    });
    expect(cents(Number(all3.share))).toBe(pizzaC);

    // A custom amount, with a tip.
    const amt = await okQuote(tokens.C1, {
      mode: "AMOUNT",
      amount: 10,
      tip: 2,
    });
    expect(amt).toMatchObject({ share: 10, tip: 2, fee: 0, total: 12 });

    // Refusals.
    const small = await quote(tokens.C1, { mode: "AMOUNT", amount: 0.5 });
    expect(small.status).toBe(400);
    expect(small.data.code).toBe("AMOUNT_TOO_SMALL");
    expect(small.data.error).toBe("The smallest amount you can pay is $1.00.");
    const over = await quote(tokens.C1, {
      mode: "AMOUNT",
      amount: R / 100 + 1,
    });
    expect(over.status).toBe(409);
    expect(over.data.code).toBe("AMOUNT_EXCEEDS_REMAINING");
    expect((over.data.bill as Rec).remaining).toBe(b.remaining);
    const bigTip = await quote(tokens.C1, {
      mode: "AMOUNT",
      amount: 10,
      tip: 11,
    });
    expect(bigTip.status).toBe(400);
    expect(bigTip.data.code).toBe("TIP_TOO_LARGE");
    expect(bigTip.data.error).toBe(
      "The tip can't be more than the amount you're paying."
    );
    const bigTipEs = await quote(
      tokens.C1,
      { mode: "AMOUNT", amount: 10, tip: 11 },
      ES
    );
    expect(bigTipEs.data.error).toBe(
      "La propina no puede ser mayor que el monto que pagas."
    );
    const halfTip = await quote(tokens.C1, {
      mode: "AMOUNT",
      amount: 10,
      tip: 6,
    });
    expect(halfTip.status).toBe(400);
    expect(halfTip.data.code).toBe("TIP_NEEDS_CONFIRMATION");
    await okQuote(tokens.C1, {
      mode: "AMOUNT",
      amount: 10,
      tip: 6,
      confirmLargeTip: true,
    });
    const parts = await quote(tokens.C1, {
      mode: "ITEMS",
      items: [
        { lineKind: pizza.kind, lineId: pizza.id, unitIndex: 0, parts: 11 },
      ],
    });
    expect(parts.status).toBe(400);
    expect(parts.data.code).toBe("BAD_PARTS");
    expect((await quote(tokens.C1, { mode: "ALL" })).data.code).toBe(
      "BAD_REQUEST"
    );

    // An option the owner turned off.
    await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: true, splitEvenly: false },
    });
    const even = await quote(tokens.C1, { mode: "EVEN", splitWays: 2 });
    expect(even.status).toBe(400);
    expect(even.data.code).toBe("MODE_NOT_ALLOWED");
    const evenEs = await quote(tokens.C1, { mode: "EVEN", splitWays: 2 }, ES);
    expect(evenEs.data.error).toBe(
      "Este restaurante no ofrece esa forma de pago."
    );
    await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: true },
    });
  });

  test("TC-685: the spec's $100 example to the cent — $30, a dish at $17.50, the rest split two ways", async () => {
    const b0 = await bill(tokens.C0);
    expect((b0.totals as Rec).checkTotal).toBe(100);
    expect(b0.remaining).toBe(100);
    const dish = line(b0, "Dish");
    expect(dish.unitValue).toBe(25);

    // Ana: a custom $30.00 (+ a $4.50 tip, which is never the check's).
    const ana = await pay(tokens.C0, { mode: "AMOUNT", amount: 30, tip: 4.5 });
    expect(ana.pi.total).toBe(34.5);
    expect(ana.done.remaining).toBe(70);
    expect(ana.done.closed).toBe(false);
    expect(ana.done.leg).toMatchObject({
      amount: 34.5,
      tip: 4.5,
      cardLast4: "4242",
    });
    c0Legs.push(String((ana.done.leg as Rec).id));

    // Each of the 4 unpaid dishes now costs $17.50 (table credit $7.50).
    const benQ = await okQuote(tokens.C0, {
      mode: "ITEMS",
      items: [{ lineKind: dish.kind, lineId: dish.id, unitIndex: 1 }],
    });
    expect(benQ.share).toBe(17.5);
    expect((benQ.breakdown as Rec).itemsValue).toBe(25);
    expect((benQ.breakdown as Rec).tableCredit).toBe(7.5);
    const ben = await pay(tokens.C0, {
      mode: "ITEMS",
      items: [{ lineKind: dish.kind, lineId: dish.id, unitIndex: 1 }],
    });
    expect(ben.done.remaining).toBe(52.5);
    c0Legs.push(String((ben.done.leg as Rec).id));
    const afterBen = ben.done.bill as Rec;
    expect(line(afterBen, "Dish").state).toBe("PARTIAL");
    expect(afterBen.unpaidValue).toBe(75);

    // Ben's dish can't be paid twice.
    const twice = await quote(tokens.C0, {
      mode: "ITEMS",
      items: [{ lineKind: dish.kind, lineId: dish.id, unitIndex: 1 }],
    });
    expect(twice.status).toBe(409);
    expect(twice.data.code).toBe("ITEM_ALREADY_PAID");

    // Cal: split what's left evenly between 2 → $26.25.
    const cal = await pay(tokens.C0, {
      mode: "EVEN",
      splitWays: 2,
      myShares: 1,
    });
    expect(cal.pi.total).toBe(26.25);
    expect(cal.done.remaining).toBe(26.25);
    c0Legs.push(String((cal.done.leg as Rec).id));

    // Dee: the rest → $26.25, and the check closes at exactly $100.00.
    const dee = await pay(tokens.C0, { mode: "REST" });
    expect(dee.pi.total).toBe(26.25);
    expect(dee.done.remaining).toBe(0);
    expect(dee.done.closed).toBe(true);
    c0Legs.push(String((dee.done.leg as Rec).id));

    const closed = await bill(tokens.C0);
    expect(closed.status).toBe("CLOSED");
    expect(closed.paidSoFar).toBe(100);
    expect(closed.remaining).toBe(0);
    const legs = closed.payments as Rec[];
    expect(legs.map((p) => p.amount)).toEqual([30, 17.5, 26.25, 26.25]);
    expect(legs.every((p) => p.byPhone === true && p.method === "CARD")).toBe(
      true
    );
    expect((closed.totals as Rec).tipsSoFar).toBe(4.5);
    // Dee's PaymentIntent captured exactly what was asked.
    expect(await piStatus(dee.pi)).toEqual({
      status: "succeeded",
      amount: 2625,
    });

    // The order is paid in full; the table is free.
    const order = (await getOrderFullRaw(ownerToken, checks.C0)).data as Rec;
    expect(order.paymentStatus).toBe("COMPLETED");
    const tables = await getTabletTablesRaw(tablet);
    const t0 = tables.data.tables?.find((t) => t.name === "T0");
    expect(t0?.openChecks ?? []).toHaveLength(0);
  });

  test("TC-686: the card fee — credit carries it per the restaurant setting, debit pays none", async () => {
    const on = await updateRestaurantSettingsRaw(adminToken, restaurantId, {
      passProcessingFeeToCustomer: true,
    });
    expect(on.status, JSON.stringify(on.data)).toBe(200);
    const b = await bill(tokens.C2);
    expect(b.cardFee).toEqual({
      passThrough: true,
      percent: 2.9,
      fixed: 0.3,
      creditOnly: true,
    });

    // Credit: $20.00 → fee on the share only, never on the tip.
    const q = await okQuote(tokens.C2, { mode: "AMOUNT", amount: 20, tip: 3 });
    const fee = cardFeeCents(2000);
    expect(cents(Number(q.fee))).toBe(fee);
    expect(cents(Number(q.total))).toBe(2000 + 300 + fee);
    const credit = await pay(tokens.C2, { mode: "AMOUNT", amount: 20, tip: 3 });
    expect(credit.finalize).toMatchObject({
      removed: false,
      funding: "credit",
    });
    expect(cents(Number((credit.done.leg as Rec).amount))).toBe(
      2000 + 300 + fee
    );
    expect(await piStatus(credit.pi)).toEqual({
      status: "succeeded",
      amount: 2000 + 300 + fee,
    });
    // The check counts $20.00 toward the meal; the fee isn't the table's debt.
    const R = cents(Number(b.remaining)) - 2000;
    expect(cents(Number(credit.done.remaining))).toBe(R);

    // Debit: the quote shows the fee, the card drops it before authorizing.
    const restQ = await okQuote(tokens.C2, { mode: "REST" });
    expect(cents(Number(restQ.fee))).toBe(cardFeeCents(R));
    const debit = await pay(tokens.C2, { mode: "REST" }, "tok_visa_debit");
    expect(debit.finalize).toMatchObject({
      removed: true,
      funding: "debit",
      fee: 0,
    });
    expect(cents(Number(debit.finalize.total))).toBe(R);
    expect(cents(Number((debit.done.leg as Rec).amount))).toBe(R);
    expect(await piStatus(debit.pi)).toEqual({
      status: "succeeded",
      amount: R,
    });
    expect(debit.done.closed).toBe(true);

    const off = await updateRestaurantSettingsRaw(adminToken, restaurantId, {
      passProcessingFeeToCustomer: false,
    });
    expect(off.status).toBe(200);
  });

  test('TC-687: first to pay wins — two phones on "everything left": one captured, the other released', async () => {
    const a = await intent(tokens.C3, { mode: "REST" });
    const b = await intent(tokens.C3, { mode: "REST" });
    expect(a.paymentIntentId).not.toBe(b.paymentIntentId);
    // A PENDING phone payment reserves nothing: both could be created.
    await authorize(a, await cardPm("tok_visa"));
    await authorize(b, await cardPm("tok_visa"));

    const first = await confirm(tokens.C3, a);
    expect(first.status, JSON.stringify(first.data)).toBe(200);
    expect((first.data.data as Rec).closed).toBe(true);
    c3WinnerLeg = String(((first.data.data as Rec).leg as Rec).id);

    const second = await confirm(tokens.C3, b);
    // Refused either way: if closing the check already released the loser's
    // authorization it answers NOT_READY (the intent is cancelled); if not,
    // the apply cancels it now and says so.
    expect(second.status, JSON.stringify(second.data)).toBe(409);
    if (second.data.code === "NOT_READY") {
      expect(JSON.stringify(second.data)).toContain("canceled");
    } else {
      expect(second.data.released).toBe("CANCELLED");
      expect((second.data.bill as Rec).status).toBe("CLOSED");
    }
    expect((await piStatus(a)).status).toBe("succeeded");
    expect((await piStatus(b)).status).toBe("canceled");

    // A paid check takes no more money; its table is free.
    const late = await checkPayRaw("POST", tokens.C3, "/intent", {
      mode: "REST",
      idempotencyKey: newKey(),
    });
    expect(late.status).toBe(409);
    expect(late.data.code).toBe("CHECK_CLOSED");
    const closed = await bill(tokens.C3);
    expect(closed.status).toBe("CLOSED");
    expect((closed.payments as Rec[]).length).toBe(1);
    const tables = await getTabletTablesRaw(tablet);
    const t3 = tables.data.tables?.find((t) => t.name === "T3");
    expect(t3?.openChecks ?? []).toHaveLength(0);
  });

  test("TC-688: the receipt email — once per payment, English and Spanish @email", async () => {
    const enTo = generateUserEmail("pat-en");
    const en = await checkPayRaw("POST", tokens.C0, "/receipt", {
      legId: c0Leg(0),
      email: enTo,
    });
    expect(en.status, JSON.stringify(en.data)).toBe(200);
    expect(en.data.message).toBe(`Receipt sent to ${enTo}.`);
    const enMail = await waitForEmail(enTo, {
      subjectPattern: /^Your receipt from /,
      timeoutMs: 60_000,
    });
    expect(enMail.subject).toBe(`Your receipt from ${restaurantName}`);
    expect(enMail.html_body).toContain("$34.50");

    const again = await checkPayRaw("POST", tokens.C0, "/receipt", {
      legId: c0Leg(0),
      email: generateUserEmail("pat-en2"),
    });
    expect(again.status).toBe(409);
    expect(again.data.code).toBe("RECEIPT_ALREADY_SENT");

    const esTo = generateUserEmail("pat-es");
    const es = await checkPayRaw(
      "POST",
      tokens.C0,
      "/receipt",
      { legId: c0Leg(1), email: esTo },
      ES
    );
    expect(es.status, JSON.stringify(es.data)).toBe(200);
    expect(es.data.message).toBe(`Recibo enviado a ${esTo}.`);
    const esMail = await waitForEmail(esTo, {
      subjectPattern: /^Tu recibo de /,
      timeoutMs: 60_000,
    });
    expect(esMail.subject).toBe(`Tu recibo de ${restaurantName}`);
    expect(esMail.html_body).toContain("$17.50");

    const badEmail = await checkPayRaw("POST", tokens.C0, "/receipt", {
      legId: c0Leg(2),
      email: "not-an-email",
    });
    expect(badEmail.status).toBe(400);
    expect(badEmail.data.code).toBe("EMAIL_INVALID");
    const noLeg = await checkPayRaw("POST", tokens.C0, "/receipt", {
      legId: c0Leg(0).replace(/.$/, "0"),
      email: generateUserEmail("pat-x"),
    });
    expect(noLeg.status).toBe(404);

    await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: true, collectReceiptEmail: false },
    });
    const off = await checkPayRaw("POST", tokens.C0, "/receipt", {
      legId: c0Leg(2),
      email: generateUserEmail("pat-off"),
    });
    expect(off.status).toBe(400);
    expect(off.data.code).toBe("RECEIPTS_OFF");
    await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: true },
    });
  });

  test("TC-689: earn points — a reward code for this payment (split) or the whole check (one payer)", async () => {
    const before = await checkPayRaw("POST", tokens.C0, "/reward-claim", {
      legId: c0Leg(2),
    });
    expect(before.status).toBe(200);
    expect((before.data.data as Rec).eligible).toBe(false);
    expect((before.data.data as Rec).reason).toBe("NO_PROGRAM");

    const program = await createRewardProgramRaw(adminToken, {
      pointsPerDollar: 1,
      pointsPerRedemption: 100,
      redemptionValue: 5,
      isActive: true,
      participatingRestaurants: [{ restaurantId }],
      receiptClaimEnabled: true,
    });
    expect([200, 201]).toContain(program.status);

    // A split check: Cal's own payment gets its own code.
    const cal = await checkPayRaw("POST", tokens.C0, "/reward-claim", {
      legId: c0Leg(2),
    });
    expect(cal.status, JSON.stringify(cal.data)).toBe(200);
    const calD = cal.data.data as Rec;
    expect(calD.eligible).toBe(true);
    expect(String(calD.url)).toContain(`/claim?code=${calD.code}`);
    // Asking again gives the same code (a reprint), never a second one.
    const calAgain = await checkPayRaw("POST", tokens.C0, "/reward-claim", {
      legId: c0Leg(2),
    });
    expect((calAgain.data.data as Rec).code).toBe(calD.code);
    const dee = await checkPayRaw("POST", tokens.C0, "/reward-claim", {
      legId: c0Leg(3),
    });
    expect((dee.data.data as Rec).code).not.toBe(calD.code);

    // One phone paid all of C3: the whole check's code.
    const one = await checkPayRaw("POST", tokens.C3, "/reward-claim", {
      legId: c3WinnerLeg,
    });
    expect(one.status, JSON.stringify(one.data)).toBe(200);
    expect((one.data.data as Rec).eligible).toBe(true);

    await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: true, offerRewards: false },
    });
    const off = await checkPayRaw("POST", tokens.C0, "/reward-claim", {
      legId: c0Leg(0),
    });
    expect(off.status).toBe(400);
    expect(off.data.code).toBe("REWARDS_OFF");
    await payAtTableSettingsRaw(ownerToken, restaurantId, "PUT", {
      settings: { enabled: true },
    });
  });

  test("TC-690: after a phone pays for items the POS can't remove them or change the discount; the check still closes", async () => {
    const b = await bill(tokens.C1);
    const salad = line(b, "Salad");
    const pizza = line(b, "Pizza");

    // One salad, and one third of the pizza, paid by phone.
    const s = await pay(tokens.C1, {
      mode: "ITEMS",
      items: [{ lineKind: salad.kind, lineId: salad.id, unitIndex: 0 }],
    });
    expect(s.done.closed).toBe(false);
    const p = await pay(tokens.C1, {
      mode: "ITEMS",
      items: [
        { lineKind: pizza.kind, lineId: pizza.id, unitIndex: 0, parts: 3 },
      ],
    });
    const mid = p.done.bill as Rec;
    const pizzaUnit = (line(mid, "Pizza").units as Rec[])[0];
    expect(pizzaUnit).toMatchObject({ parts: 3, paidParts: 1, unpaidParts: 2 });

    // The pizza is already split in thirds: halves are refused.
    const halves = await quote(tokens.C1, {
      mode: "ITEMS",
      items: [
        { lineKind: pizza.kind, lineId: pizza.id, unitIndex: 0, parts: 2 },
      ],
    });
    expect(halves.status).toBe(409);
    expect(halves.data.code).toBe("SHARE_CHANGED");

    // POS: removing the paid salad is refused (EN message).
    const remove = await modifyTabletOrderRaw(tablet, session, checks.C1, {
      orderItems: [
        {
          menuItemId: items.pizza.id,
          menuItemName: items.pizza.name,
          quantity: 1,
          price: 20,
        },
      ],
    });
    expect(remove.status).toBe(409);
    expect(remove.data.message ?? JSON.stringify(remove.data)).toContain(
      "Paid by phone. Remove that payment first."
    );
    // …and so is a coupon.
    const coupon = await tabletRaw<Rec>(
      tablet,
      "POST",
      `/orders/${checks.C1}/apply-coupon`,
      { code: "ANYCODE10" },
      session
    );
    expect(coupon.status).toBe(409);
    expect(JSON.stringify(coupon.data)).toContain(
      "A guest already paid for items on this check by phone"
    );

    // Adding a salad keeps the paid one paid (the claim follows the line).
    const add = await modifyTabletOrderRaw(tablet, session, checks.C1, {
      orderItems: [
        {
          menuItemId: items.pizza.id,
          menuItemName: items.pizza.name,
          quantity: 1,
          price: 20,
        },
        {
          menuItemId: items.salad.id,
          menuItemName: items.salad.name,
          quantity: 3,
          price: 10,
        },
      ],
    });
    expect(add.status, JSON.stringify(add.data)).toBe(200);
    const after = await bill(tokens.C1);
    const salad3 = line(after, "Salad");
    expect(salad3.quantity).toBe(3);
    expect(
      (salad3.units as Rec[]).filter((u) => u.state === "PAID").length
    ).toBe(1);
    expect(salad3.state).toBe("PARTIAL");

    // The rest closes the check exactly; the table frees.
    const rest = await pay(tokens.C1, { mode: "REST" });
    expect(rest.done.closed).toBe(true);
    const closed = await bill(tokens.C1);
    expect(closed.status).toBe("CLOSED");
    expect(closed.remaining).toBe(0);
    expect(closed.paidSoFar).toBe((closed.totals as Rec).checkTotal);
    const order = (await getOrderFullRaw(ownerToken, checks.C1)).data as Rec;
    expect(order.paymentStatus).toBe("COMPLETED");
    const tables = await getTabletTablesRaw(tablet);
    const t1 = tables.data.tables?.find((t) => t.name === "T1");
    expect(t1?.openChecks ?? []).toHaveLength(0);
  });
});
