/**
 * 20-supply-shop.spec.ts — Owner → Print Shop (TC-446..455).
 *
 * The supply shop's "place now, charge at fulfilment" model from the OWNER's
 * side, on the physical-gift-card product: nothing is charged when the order
 * is placed (an estimate range is shown instead), the admin's later "Fulfil"
 * is the one place money moves, and the owner sees every state change in
 * "My orders" and by email.
 *
 * Own tenant + login, same shape as 19-reservations: a throwaway restaurant
 * minted via `createSecondOwner`, `SUPPLY_SHOP` granted and the gift-card
 * config written BEFORE first navigation (the card product is hidden from
 * the shop until gift cards are on), and a manual UI login in this file's own
 * context, reused serially across every test.
 *
 * Ordering is load-bearing: one order (`orderA`) threads through the whole
 * file — placed (448) → proof v1 + "I'd like changes" (450) → proof v2 +
 * stale approve 409 (451) → "Looks good" (452) → admin finalises (453) →
 * cancelled from AWAITING_PAYMENT (454). Stripe's hosted Checkout is NOT
 * completed on QA (Radar's hCaptcha — same reason TC-165/166/169 are fixme),
 * so the charge path is proven up to the payment link, never past it.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  createOwnerSupplyShopPage,
  type OwnerSupplyShopPage,
} from "../../../pages/dashboard/owner/OwnerSupplyShopPage";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import { waitForEmail } from "../../../utils/emailHelper";
import { giftCardPassingPdf } from "../../../utils/pdfFixture";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  putGiftCardConfigAdminRaw,
  getAdminSupplyCatalogRaw,
  getSupplyCatalogOwnerRaw,
  quoteSupplyOwnerRaw,
  listSupplyOrdersOwnerRaw,
  getSupplyProofOwnerRaw,
  approveSupplyProofOwnerRaw,
  cancelSupplyOrderOwnerRaw,
  createSupplyOrderOnBehalfRaw,
  uploadSupplyArtworkRaw,
  sendSupplyProofRaw,
  fulfilSupplyOrderRaw,
  resolveGiftCardVariantId,
  SUPPLY_GIFT_CARD_PRODUCT_SLUG,
  type SupplyOrder,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = process.env.MAILPIT_BASE_URL ?? "";

const PRODUCT_NAME = "Physical gift card";
// 100 cards at $1.95 + $12 shipping = $207.00; +25% spread = $258.75.
const ESTIMATE = "$207.00 – $258.75"; // EN DASH — the formatter's separator

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

/** Admin-side design step: upload a passing PDF and send it as the proof. */
const sendProofFor = async (adminToken: string, orderId: string) => {
  const upload = await uploadSupplyArtworkRaw(
    adminToken,
    orderId,
    giftCardPassingPdf()
  );
  if (!upload.ok || !upload.data.data) {
    throw new Error(
      `[supply-shop] artwork upload failed: ${JSON.stringify(upload.data)}`
    );
  }
  const { versionId, preflight } = upload.data.data;
  if (!preflight.sendable) {
    throw new Error(
      `[supply-shop] fixture PDF was BLOCKED by preflight: ${JSON.stringify(preflight.checks)}`
    );
  }
  const sent = await sendSupplyProofRaw(adminToken, orderId, versionId);
  if (!sent.ok)
    throw new Error(`[supply-shop] send-proof failed: ${msg(sent.data)}`);
  return versionId;
};

test.describe("Owner — Print Shop (supply shop)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let variantId = "";
  let session: UiLoginSession;
  let shop: OwnerSupplyShopPage;

  // The order that threads through the file, and the proof versions it grows.
  let orderA: SupplyOrder;
  let proofV1 = "";
  let hostedPaymentUrl: string | null = null;
  const placedOnBehalf: string[] = [];

  /** Raw owner tokens have no refresh path (~15 min) — re-login before late API calls. */
  const ownerApi = async () => {
    ownerToken = (await apiLogin(ownerEmail, ownerPassword)).accessToken;
    return ownerToken;
  };

  const findOrder = async (predicate: (o: SupplyOrder) => boolean) => {
    const res = await listSupplyOrdersOwnerRaw(await ownerApi(), restaurantId);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    const found = res.data.data.find(predicate);
    if (!found) throw new Error(`[supply-shop] order not found in owner list`);
    return found;
  };

  test.beforeAll(async ({ browser }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) {
      throw new Error(
        "[supply-shop] could not mint the throwaway tenant restaurant"
      );
    }
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

    // Grants BEFORE first navigation — the tab gates client-side at mount.
    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SUPPLY_SHOP",
      true
    );
    if (!grant.ok)
      throw new Error(
        `[supply-shop] could not grant SUPPLY_SHOP: ${msg(grant.data)}`
      );
    // Gift cards OFF to start: TC-446 proves the product is offered anyway.
    const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
      isEnabled: false,
    });
    if (!cfg.ok)
      throw new Error(
        `[supply-shop] could not write gift card config: ${msg(cfg.data)}`
      );

    variantId = await resolveGiftCardVariantId(adminToken);

    session = await loginViaUi(browser, ownerEmail, ownerPassword);
    shop = createOwnerSupplyShopPage(session.page);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    // Leave nothing fulfillable behind: cancel is allowed from every state a
    // test can leave an order in here (IN_DESIGN, PLACED, AWAITING_PAYMENT).
    const token = await apiLogin(ownerEmail, ownerPassword)
      .then((l) => l.accessToken)
      .catch(() => ownerToken); // the stale token may still work; cleanup is best-effort
    for (const id of [orderA?.id, ...placedOnBehalf].filter(
      Boolean
    ) as string[]) {
      await cancelSupplyOrderOwnerRaw(token, restaurantId, id).catch(() => {
        /* already terminal or gone — nothing to cancel */
      });
    }
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SUPPLY_SHOP"
    ).catch(() => {
      /* override may already be gone */
    });
    if (restaurantId && !process.env.OWNER2_EMAIL) {
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
        /* archive is best-effort; globalTeardown sweeps the user */
      });
    }
    if (session)
      await session.context.close().catch(() => {
        /* context may already be closed */
      });
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Supply shop");
    await allure.label("severity", "critical");
  });

  test("TC-446: the physical gift card is offered to every restaurant — gift cards on or not — and the admin catalog agrees", async () => {
    await allure.description(
      "Ordering a run of cards IS how an owner says they want to sell gift cards; the switch that makes them " +
        "loadable is flipped on our side when the run is fulfilled. So the product must be in the shop even " +
        "while this tenant's gift cards are OFF, with its picture, price and lead time."
    );

    await allure.step(
      "Gift cards OFF → the card is still in the shop and the owner API",
      async () => {
        await shop.goto(restaurantId);
        const card = shop.productCard(PRODUCT_NAME).first();
        await expect(card).toBeVisible();
        await expect(card).toContainText("from $1.10 each");
        await expect(card).toContainText(/~\d+ days/);
        await expect(card.locator("img")).toHaveAttribute("src", /.+/);
        const catalog = await getSupplyCatalogOwnerRaw(
          ownerToken,
          restaurantId
        );
        expect(catalog.status, JSON.stringify(catalog.data)).toBe(200);
        expect(catalog.data.data.map((p) => p.slug)).toContain(
          SUPPLY_GIFT_CARD_PRODUCT_SLUG
        );
      }
    );

    await allure.step("The admin catalog lists it too", async () => {
      const admin = await getAdminSupplyCatalogRaw(adminToken);
      expect(admin.data.data.map((p) => p.slug)).toContain(
        SUPPLY_GIFT_CARD_PRODUCT_SLUG
      );
    });

    await allure.step(
      "Switch gift cards on for the rest of the file (presets the amount picker will use)",
      async () => {
        const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
          isEnabled: true,
          presetDenominations: [25, 50],
          allowCustomAmount: true,
          minCustomAmount: 5,
          maxCustomAmount: 500,
          canCombineWithCoupons: true,
        });
        expect(cfg.status, JSON.stringify(cfg.data)).toBe(200);
      }
    );
  });

  test("TC-447: the brief form quotes a RANGE and says so — the invoice option only when credit is extended", async () => {
    await allure.description(
      "100 cards: $1.95 + $12 shipping = $207.00, +25% spread = $258.75. The estimate card, the " +
        "'You won't be charged now' notice and the place button all carry the range (EN DASH). " +
        "'Add it to my next RestauNax invoice' renders only when the quote says credit is eligible — a " +
        "throwaway tenant has no subscription, so the test branches on the API's answer."
    );

    const quote = await quoteSupplyOwnerRaw(ownerToken, restaurantId, {
      variantId,
      quantity: 100,
    });
    expect(quote.status, JSON.stringify(quote.data)).toBe(200);
    expect(quote.data.data.estimate).toMatchObject({
      totalLow: 207,
      totalHigh: 258.75,
    });

    await shop.openProduct(PRODUCT_NAME);
    await shop.selectQuantity(/^100 — /);
    await shop.messageInput().fill(`Automation gift card run ${runId}`);

    await expect(session.page.getByText(ESTIMATE).first()).toBeVisible();
    await expect(shop.notChargedNowAlert()).toBeVisible();
    await expect(shop.paymentRadio("Charge the card on file")).toBeChecked();
    const invoiceRadio = shop.paymentRadio(
      "Add it to my next RestauNax invoice"
    );
    if (quote.data.data.credit.eligible) {
      await expect(invoiceRadio).toBeVisible();
    } else {
      await expect(invoiceRadio).toHaveCount(0);
    }
    await expect(shop.placeButton()).toHaveText(
      `Place order — est. ${ESTIMATE}`
    );
  });

  test(
    "TC-448: placing the order charges nothing — it lands in 'We're designing it' with the estimate, and the owner is told so by email",
    { tag: ["@email"] },
    async () => {
      await allure.description(
        "Every catalog product needs artwork, so commit lands in IN_DESIGN (not PLACED). The row shows the " +
          "range as an estimate, paymentTerm is IMMEDIATE, and the 'designStarted' email names the order."
      );
      test.setTimeout(150_000);

      await shop.placeOrder();
      orderA = await findOrder(
        (o) => o.status === "IN_DESIGN" && o.quantity === 100
      );
      await allure.parameter("orderNumber", orderA.orderNumber);
      expect(orderA.paymentTerm).toBe("IMMEDIATE");
      expect(orderA.estimatedTotalLow).toBe(207);
      expect(orderA.estimatedTotalHigh).toBe(258.75);
      expect(orderA.paidAt).toBeNull();

      await shop.openOrders();
      await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
        "We're designing it"
      );
      await expect(shop.orderRow(orderA.orderNumber)).toContainText(
        `${ESTIMATE} est.`
      );

      test.skip(
        !MAILPIT,
        "MAILPIT_BASE_URL not set — email assertions skipped"
      );
      const mail = await waitForEmail(ownerEmail, {
        subjectPattern: /^We're designing your /,
        timeoutMs: 60_000,
      });
      expect(mail.html_body).toContain(`Order ${orderA.orderNumber}`);
      expect(mail.html_body).toContain("We're on it");
    }
  );

  test(
    "TC-449: the email's call to action opens the owner's Print Shop, not a dead route",
    { tag: ["@email"] },
    async () => {
      await allure.description(
        "The CTA used to link /supply-shop/orders/<id>, which was never a route (fixed in RestauNax #678). " +
          "It must open this restaurant's portal on the Print Shop tab."
      );
      test.skip(
        !MAILPIT,
        "MAILPIT_BASE_URL not set — email assertions skipped"
      );

      const mail = await waitForEmail(ownerEmail, {
        subjectPattern: /^We're designing your /,
        timeoutMs: 60_000,
      });
      const href =
        /href="([^"]*restaurantManagement\?tab=supply-shop[^"]*)"/.exec(
          mail.html_body
        )?.[1];
      expect(href, "CTA href pointing at the Print Shop tab").toBeTruthy();
      expect(href).toContain(`/restaurant/restaurantId/${restaurantId}/`);

      await session.page.goto(href!.replace(/&amp;/g, "&"), {
        waitUntil: "domcontentloaded",
      });
      await expect(
        session.page.getByRole("tab", { name: "My orders" })
      ).toBeVisible({ timeout: 20_000 });
    }
  );

  test(
    "TC-450: 'Your proof is ready' → 'I'd like changes' sends the note back and reopens the design",
    { tag: ["@email"] },
    async () => {
      await allure.description(
        "The admin uploads a print-ready PDF and sends it; the owner sees the proof, asks for a change, and " +
          "the 'revisionsReceived' email quotes their own words. The order returns to IN_DESIGN."
      );
      test.setTimeout(150_000);

      proofV1 = await sendProofFor(adminToken, orderA.id);
      await shop.goto(restaurantId);
      await shop.openOrders();
      await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
        "Your proof is ready"
      );

      const note = `Please make the logo bigger ${runId}`;
      await shop.reviewProof(orderA.orderNumber);
      await expect(shop.dialog()).toContainText(
        `Your proof — ${orderA.orderNumber}`
      );
      await shop.requestChanges(note);
      await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
        "We're designing it"
      );

      test.skip(
        !MAILPIT,
        "MAILPIT_BASE_URL not set — email assertions skipped"
      );
      const mail = await waitForEmail(ownerEmail, {
        subjectPattern: /^We're making those changes$/,
        timeoutMs: 60_000,
      });
      expect(mail.html_body).toContain("What you asked for");
      expect(mail.html_body).toContain(note);
    }
  );

  test("TC-451: approving a superseded proof is refused (409 PROOF_SUPERSEDED)", async () => {
    await allure.description(
      "Proof v2 goes out; an approve carrying v1's versionId must not approve v2 by accident."
    );
    await sendProofFor(adminToken, orderA.id);
    const stale = await approveSupplyProofOwnerRaw(
      await ownerApi(),
      restaurantId,
      orderA.id,
      proofV1
    );
    expect(stale.status, JSON.stringify(stale.data)).toBe(409);
    expect(stale.data.code).toBe("PROOF_SUPERSEDED");
    // The current proof is still the one the owner will see.
    const proof = await getSupplyProofOwnerRaw(
      ownerToken,
      restaurantId,
      orderA.id
    );
    expect(proof.data.data.versionId).not.toBe(proofV1);
  });

  test(
    "TC-452: 'Looks good' moves the order to 'Placed — price confirmed at print'",
    { tag: ["@email"] },
    async () => {
      test.setTimeout(150_000);
      await shop.goto(restaurantId);
      await shop.openOrders();
      await shop.reviewProof(orderA.orderNumber);
      await shop.approveProof();
      await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
        "Placed — price confirmed at print"
      );
      const placed = await findOrder((o) => o.id === orderA.id);
      expect(placed.status).toBe("PLACED");
      expect(placed.paidAt).toBeNull();

      test.skip(
        !MAILPIT,
        "MAILPIT_BASE_URL not set — email assertions skipped"
      );
      await waitForEmail(ownerEmail, {
        subjectPattern: /^Glad you like it — /,
        timeoutMs: 60_000,
      });
    }
  );

  test(
    "TC-453: the admin's Finalise on a tenant with no saved card becomes 'Awaiting payment' + a 'Pay $… to print' link — never a silent charge",
    { tag: ["@email"] },
    async () => {
      await allure.description(
        "IMMEDIATE with no card on file falls back to a hosted Checkout: the price is finalised ($207.00, " +
          "shown in place of the estimate), the row grows a Pay button pointing at Stripe, and the " +
          "'paymentNeeded' email carries the same link. Completing Checkout is out of reach on QA (Radar hCaptcha)."
      );
      test.setTimeout(150_000);

      const outcome = await fulfilSupplyOrderRaw(adminToken, orderA.id, {
        route: "PRINT_ORDER",
        vendor: "Automation Vendor",
        unitCost: 1.1,
        shippingCost: 12,
        taxCost: 0,
        vendorOrderRef: `AUTO-${runId}`,
        finalUnitPrice: 1.95,
        finalShippingAmount: 12,
        comp: false,
      });
      expect(outcome.status, JSON.stringify(outcome.data)).toBe(200);
      test.skip(
        outcome.data.data?.settled === true,
        "this tenant has a saved card — the hosted-payment path was not exercised"
      );
      hostedPaymentUrl = outcome.data.data?.hostedPaymentUrl ?? null;
      expect(hostedPaymentUrl, "hosted Checkout URL").toBeTruthy();

      await shop.goto(restaurantId);
      await shop.openOrders();
      await expect(shop.statusChip(orderA.orderNumber)).toHaveText(
        "Awaiting payment"
      );
      await expect(shop.orderRow(orderA.orderNumber)).toContainText("$207.00");
      await expect(shop.orderRow(orderA.orderNumber)).not.toContainText("est.");
      const pay = shop.payNowLink(orderA.orderNumber);
      await expect(pay).toHaveText("Pay $207.00 to print");
      await expect(pay).toHaveAttribute("href", hostedPaymentUrl!);
      expect(new URL(hostedPaymentUrl!).hostname).toContain("stripe.com");

      test.skip(
        !MAILPIT,
        "MAILPIT_BASE_URL not set — email assertions skipped"
      );
      const mail = await waitForEmail(ownerEmail, {
        subjectPattern: /^One step left to print your /,
        timeoutMs: 60_000,
      });
      expect(mail.html_body.replace(/&amp;/g, "&")).toContain(
        hostedPaymentUrl!
      );
    }
  );

  test("TC-454: cancelling from 'Awaiting payment' lands in Cancelled and nothing was ever charged", async () => {
    await shop.goto(restaurantId);
    await shop.openOrders();
    await shop.cancelOrder(orderA.orderNumber);
    await expect(shop.statusChip(orderA.orderNumber)).toHaveText("Cancelled");
    const cancelled = await findOrder((o) => o.id === orderA.id);
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.paidAt).toBeNull();
  });

  test("TC-455: an order the admin placed on the owner's behalf shows up in My orders without its internal notes", async () => {
    await allure.description(
      "adminNotes and placedByAdminId are internal. The owner's list and page must never carry them."
    );
    const secret = `SECRET-${runId}`;
    const placed = await createSupplyOrderOnBehalfRaw(adminToken, {
      restaurantId,
      variantId,
      quantity: 100,
      brief: { message: `On-behalf brief ${runId}` },
      adminNotes: secret,
      billing: "CHARGE",
      paymentTerm: "IMMEDIATE",
    });
    expect(placed.status, JSON.stringify(placed.data)).toBe(201);
    placedOnBehalf.push(placed.data.data.id);

    const mine = await findOrder((o) => o.id === placed.data.data.id);
    expect(mine.status).toBe("IN_DESIGN");
    for (const key of [
      "adminNotes",
      "placedByAdminId",
      "pendingFulfilment",
      "unitVendorCostSnapshot",
    ]) {
      expect(mine, key).not.toHaveProperty(key);
    }

    await shop.goto(restaurantId);
    await shop.openOrders();
    await expect(shop.orderRow(mine.orderNumber)).toBeVisible();
    await expect(session.page.getByText(secret)).toHaveCount(0);
  });
});
