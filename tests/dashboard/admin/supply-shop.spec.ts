/**
 * supply-shop.spec.ts — Admin → Cards & Codes → Supply Shop (TC-456..468, TC-1126).
 *
 * The admin side of "place now, charge at fulfilment": the design queue and
 * artwork preflight, the Finalise dialog (the ONE place money moves — final
 * price per line, shipping and the supplier's bill per package, one
 * SupplyCharge for the set, the owner's approval above what they agreed to;
 * RestauNax #1075; since the print-builders release it suggests each price
 * from a target markup on what the vendor charges), placing an order on a
 * restaurant's behalf (the API; the UI now opens the restaurant's own shop
 * full-screen as HQ — TC-1126), and the physical-gift-card outcome of a
 * finalisation: a minted batch and its CSV.
 *
 * Own throwaway tenant (owner acts through the API only; the admin drives
 * the browser via the `adminPage` fixture). Two orders carry the file:
 * `orderC`, placed the owner's way (cart → Place order, so it sits in a
 * SupplyCheckout basket), walks the CHARGE path up to the hosted-payment
 * fallback (a throwaway tenant has no saved card, and hosted Checkout cannot
 * be completed on QA); `orderE`, comped on the owner's behalf, walks the COMP
 * path all the way to IN_PRODUCTION — the only route to a minted batch in
 * E2E. Every row action lives in the row's ⋯ menu. The admin table is
 * cross-tenant on shared QA, so every row is found by order number.
 */
import * as fs from "fs";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  createAdminSupplyShopPage,
  type AdminSupplyShopPage,
} from "../../../pages/dashboard/admin/AdminSupplyShopPage";
import { generateRunId } from "../../../utils/testData";
import { probePrintBuilders, requireRelease } from "../../../utils/releaseGate";
import { waitForEmail } from "../../../utils/emailHelper";
import { csvToObjects } from "../../../utils/csvHelper";
import { giftCardPassingPdf, letterPdf } from "../../../utils/pdfFixture";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  putGiftCardConfigAdminRaw,
  getGiftCardConfigAdminRaw,
  createSupplyDesignOwnerRaw,
  createSupplyOrderOwnerRaw,
  commitSupplyOrderOwnerRaw,
  listSupplyOrdersOwnerRaw,
  cancelSupplyOrderOwnerRaw,
  createSupplyOrderOnBehalfRaw,
  listAdminSupplyOrdersRaw,
  getAdminSupplyOrderRaw,
  uploadSupplyArtworkRaw,
  sendSupplyProofRaw,
  fulfilSupplyOrderRaw,
  listGiftCardBatchesRaw,
  getAdminFinanceRaw,
  getOwnerGiftCardSummaryRaw,
  resolveGiftCardVariantId,
  SUPPLY_GIFT_CARD_PRODUCT_SLUG,
  type SupplyOrder,
} from "../../../utils/apiHelper";
import {
  addSupplyCartItemRaw,
  checkoutSupplyCartRaw,
  emptySupplyCart,
  ensureSupplyProductLaunched,
  finaliseBodyFromDraft,
  finaliseSupplyLinesRaw,
  getFinaliseDraftRaw,
  getSupplyCartRaw,
  placeSupplyOrderViaCart,
} from "../../../utils/supplyShopCartApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? "";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? "";
const MAILPIT = process.env.MAILPIT_BASE_URL ?? "";

const PRODUCT_NAME = "Physical gift card";
const ESTIMATE = "$207.00 – $258.75";
const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{16}$/;
const CSV_HEADER = [
  "sequence",
  "code",
  "code_display",
  "barcode_value",
  "qr_value", // RestauNax 19be0494c — the same identity as a QR beside the Code-128
  "card_last4",
  "batch_id",
  "batch_label",
  "scope_type",
  "scope_name",
];

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

test.describe("Admin — Supply shop", () => {
  // Cases share orders minted in earlier cases. Without serial mode one
  // failure restarts the worker, beforeAll re-mints a fresh tenant, and every
  // later case fails on undefined state — a misleading cascade (nightly
  // 2026-10-01). Serial: a failure stops the chain honestly.
  test.describe.configure({ mode: "serial" });
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let restaurantName = "";
  let variantId = "";
  let admin: AdminSupplyShopPage;

  let orderC: SupplyOrder; // charge path, placed from the cart
  let checkoutC = ""; // orderC's basket, SC-YYYY-NNNN
  let orderE: SupplyOrder; // comp path → minted batch
  const toCancel: string[] = [];
  let baseline = { compedCost: 0 };
  /** The print-builders release (new Finalise dialog, HQ shop) is on this stack. */
  let printBuilders = false;

  const ownerApi = async () =>
    (await apiLogin(ownerEmail, ownerPassword)).accessToken;

  const adminOrder = async (orderId: string) => {
    const res = await getAdminSupplyOrderRaw(adminToken, orderId);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return res.data.data;
  };

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    // Owners can only order launched products; QA doesn't keep the gift card
    // launched, so the run launches it (globalTeardown pauses it again).
    await ensureSupplyProductLaunched(
      adminToken,
      SUPPLY_GIFT_CARD_PRODUCT_SLUG
    );
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) {
      throw new Error(
        "[supply-shop] could not mint the throwaway tenant restaurant"
      );
    }
    restaurantId = tenant.restaurantId;
    restaurantName = `Automation Owner2 Store ${runId}`;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

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
    // OFF on purpose: TC-462 proves fulfilment of a card run turns it on.
    const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
      isEnabled: false,
      presetDenominations: [25, 50],
      allowCustomAmount: true,
      minCustomAmount: 5,
      maxCustomAmount: 500,
      canCombineWithCoupons: true,
    });
    if (!cfg.ok)
      throw new Error(
        `[supply-shop] could not write gift card config: ${msg(cfg.data)}`
      );
    variantId = await resolveGiftCardVariantId(adminToken);
    printBuilders = await probePrintBuilders(adminToken, restaurantId);

    const finance = await getAdminFinanceRaw(adminToken);
    if (finance.ok) {
      baseline = {
        compedCost: finance.data.data.summary.supplyShop.compedCost,
      };
    }

    const placedC = await placeSupplyOrderViaCart(
      tenant.accessToken,
      restaurantId,
      { variantId, quantity: 100, message: `charge path ${runId}` }
    );
    orderC = placedC.order;
    checkoutC = placedC.checkout.checkoutNumber;
    toCancel.push(orderC.id);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    const token = await apiLogin(ownerEmail, ownerPassword)
      .then((l) => l.accessToken)
      .catch(() => "");
    if (token) {
      // TC-465 leaves a line in the cart if it fails midway.
      await emptySupplyCart(token, restaurantId).catch(() => {
        /* cart already empty */
      });
      for (const id of toCancel) {
        await cancelSupplyOrderOwnerRaw(token, restaurantId, id).catch(() => {
          /* terminal already (IN_PRODUCTION cannot be cancelled) — fine */
        });
      }
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
  });

  test.beforeEach(async ({ adminPage }) => {
    await allure.label("feature", "Supply shop");
    await allure.label("severity", "critical");
    admin = createAdminSupplyShopPage(adminPage);
  });

  test("TC-456: a freshly placed basket line sits in the Design queue with its estimate and basket, and its ⋯ menu leads with Upload artwork", async () => {
    await allure.description(
      "Placed from the cart, the line carries its basket ('SC-… · 1 of 1') and the range the owner saw. The " +
        "row's action cell is only the ⋯ button (RestauNax #1075): its menu leads with the next step, Upload " +
        "artwork, then Brief pack. Not in Fulfilment yet — there is no artwork to place."
    );
    await admin.goto();
    await admin.openTab("Design queue");
    await expect(admin.row(orderC.orderNumber)).toBeVisible();
    await expect(admin.row(orderC.orderNumber)).toContainText(restaurantName);
    await expect(admin.row(orderC.orderNumber)).toContainText(
      `${ESTIMATE} est.`
    );
    await expect(admin.row(orderC.orderNumber)).toContainText(
      `${checkoutC} · 1 of 1`
    );
    await expect(
      admin.row(orderC.orderNumber).getByRole("button")
    ).toHaveAccessibleName("More actions");
    await admin.openRowMenu(orderC.orderNumber);
    await expect(admin.menuItems()).toHaveText([
      "Upload artwork",
      "Brief pack",
    ]);
    await admin.closeRowMenu();
    // Not yet in the fulfilment queue — there is no artwork to place.
    await admin.openTab("Fulfilment");
    await expect(admin.row(orderC.orderNumber)).toHaveCount(0);
  });

  test("TC-457: artwork at the wrong page size is measured and WARNED about — never blocked; size is the printer's call", async () => {
    await allure.description(
      "US Letter for a credit-card-size product: pageSize WARNs with both sizes in the detail, the report " +
        "stays sendable (the vendor's preflight is the authority on size — Neaj, 2026-08-28), and the " +
        "version exists for the admin to judge. Nothing is sent here; TC-458 sends the passing file."
    );
    const upload = await uploadSupplyArtworkRaw(
      adminToken,
      orderC.id,
      letterPdf(),
      "letter.pdf"
    );
    expect(upload.status, JSON.stringify(upload.data)).toBe(200);
    const report = upload.data.data!.preflight;
    expect(report.worstVerdict).toBe("WARN");
    expect(report.sendable).toBe(true);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        key: "pageSize",
        verdict: "WARN",
        detail: expect.objectContaining({
          actualIn: "8.5 x 11",
          expectedIn: "3.625 x 2.375",
        }),
      })
    );
    expect((await adminOrder(orderC.id)).status).toBe("IN_DESIGN");
  });

  test(
    "TC-458: Upload artwork → preflight passes → 'Send to restaurant' → PROOF_READY, 'With owner' in Fulfilment",
    { tag: ["@email"] },
    async () => {
      test.setTimeout(150_000);
      await admin.goto();
      await admin.openTab("Design queue");
      await admin.openUploadArtwork(orderC.orderNumber);
      await admin.uploadArtwork(giftCardPassingPdf());
      await expect(admin.artworkPassed()).toBeVisible({ timeout: 30_000 });
      await admin.sendProof();

      expect((await adminOrder(orderC.id)).status).toBe("PROOF_READY");
      await admin.openTab("Fulfilment");
      await expect(
        admin.rowChip(orderC.orderNumber, "With owner")
      ).toBeVisible();

      test.skip(
        !MAILPIT,
        "MAILPIT_BASE_URL not set — email assertions skipped"
      );
      await waitForEmail(ownerEmail, {
        subjectPattern: /^Your design is ready — /,
        timeoutMs: 60_000,
      });
    }
  );

  test("TC-459: the Finalise dialog drafts the basket — a price suggested from the target markup, the quote beside it, the ceiling the owner agreed to — and a total above it becomes 'Send for approval'", async () => {
    await allure.description(
      "The proof is a look, not a gate — Finalise is offered from PROOF_READY. The dialog drafts orderC's " +
        "whole basket: what the vendor charges ($1.10 each), the target markup (the 20% default) and the price " +
        "it suggests ($1.32), with the quote beside it ('Quoted $1.95 each · estimate …'), the package's " +
        "shipping and the supplier's bill. The owner agreed to the basket's high estimate ($258.75): the " +
        "ceiling line recomputes live, a final total above it shows the approval warning and turns the " +
        "button into 'Send for approval'. Editing the price recomputes the markup, 'Use 20%' puts the target " +
        "back, a price under it is flagged (allowed — a special price), and the summary reads 'Our margin: " +
        "$C (P% markup)'. Nothing is submitted."
    );
    requireRelease("printBuilders", printBuilders);
    await admin.goto();
    await admin.openTab("Fulfilment");
    await admin.openFinalise(orderC.orderNumber, checkoutC);
    await expect(admin.dialog()).toContainText(
      `Finalise ${checkoutC} · ${restaurantName}`
    );

    await expect(admin.proofPendingBanner()).toBeVisible();
    await expect(admin.willChargeAlert()).toHaveText(
      "Will charge the card on file now."
    );
    await expect(admin.dialog()).toContainText(
      `${orderC.orderNumber} · 100 units`
    );
    await expect(admin.quotedLine()).toHaveText(
      `Quoted $1.95 each · estimate ${ESTIMATE}`
    );
    // $1.10 at the 20% default target = $1.32 each.
    await expect(admin.unitCost(orderC.id)).toHaveValue("1.1");
    await expect(admin.unitMarkup(orderC.id)).toHaveValue("20");
    await expect(admin.finalUnit(orderC.id)).toHaveValue("1.32");
    await expect(admin.targetNote()).toHaveText("Target 20% markup");
    await expect(admin.useTargetButton()).toHaveCount(0);
    await expect(admin.shippingCharged()).toHaveValue("12");
    await expect(admin.dialog()).toContainText(
      "The restaurant was quoted $12.00 for shipping."
    );
    // $1.32 × 100 + $12 shipping.
    await expect(admin.ceilingLine()).toHaveText(
      "The restaurant agreed to up to $258.75. Final total: $144.00."
    );
    await expect(admin.aboveCeilingWarning()).toHaveCount(0);
    await expect(admin.confirmButton()).toHaveText("Finalise & charge");

    // $3 × 100 + $12 = $312.00 > $258.75: the owner is asked first.
    await admin.finalUnit(orderC.id).fill("3");
    await expect(admin.unitMarkup(orderC.id)).toHaveValue("172.73");
    await expect(admin.ceilingLine()).toContainText("Final total: $312.00.");
    await expect(admin.aboveCeilingWarning()).toBeVisible();
    await expect(admin.confirmButton()).toHaveText("Send for approval");

    // "Use 20%" puts the suggested price back.
    await admin.useTargetButton().click();
    await expect(admin.finalUnit(orderC.id)).toHaveValue("1.32");
    await expect(admin.aboveCeilingWarning()).toHaveCount(0);

    // Under the target is allowed, only flagged.
    await admin.finalUnit(orderC.id).fill("1.20");
    await expect(admin.targetNote()).toHaveText(
      "Below the usual 20% markup. Fine for a special price."
    );
    await expect(admin.underTargetSummary()).toBeVisible();
    await expect(admin.confirmButton()).toHaveText("Finalise & charge");

    await admin.finalUnit(orderC.id).fill("2.40");
    await expect(admin.underTargetSummary()).toHaveCount(0);
    await expect(admin.ceilingLine()).toContainText("Final total: $252.00.");
    await expect(admin.confirmButton()).toHaveText("Finalise & charge");

    await admin.fillVendorSection({
      vendor: "Automation Vendor",
      vendorShipping: 12,
    });
    // Revenue $240 + $12 shipping − cost $110 + $12 = $130, on $122 = 106.6%.
    await expect(admin.marginLine()).toHaveText(
      "Our margin: $130.00 (106.6% markup)"
    );
    await admin.cancelDialog();
    expect((await adminOrder(orderC.id)).priceFinalizedAt ?? null).toBeNull();
  });

  test(
    "TC-460: 'Finalise & charge' with no saved card opens one charge with a payment link, parks the inputs, and refuses a second finalise — nothing is charged twice",
    { tag: ["@email"] },
    async () => {
      await allure.description(
        "One SupplyCharge for the basket at $207.00 (within the $258.75 ceiling), collected through the " +
          "charge's hosted Checkout because the tenant has no saved card. The line stays in the Fulfilment " +
          "worklist (AWAITING_PAYMENT is still HQ's worklist since RestauNax #1075) with the status 'Waiting " +
          "on owner payment', with no next step in its menu; History's 'Awaiting payment' filter finds it at the FINAL " +
          "price. The inputs are parked for the post-payment click, and a second finalise (the old per-line " +
          "/fulfil route, which now delegates to finalise) is refused AWAITING_OWNER_PAYMENT."
      );
      test.setTimeout(150_000);
      await admin.goto();
      await admin.openTab("Fulfilment");
      await admin.openFinalise(orderC.orderNumber, checkoutC);
      // The list price, typed: since the print-builders release the dialog
      // suggests a price from the target markup instead ($1.32 here).
      await admin.finalUnit(orderC.id).fill("1.95");
      await admin.fillVendorSection({
        vendor: "Automation Vendor",
        vendorShipping: 12,
        ref: `AUTO-${runId}`,
      });
      await expect(admin.confirmButton()).toHaveText("Finalise & charge");
      const outcome = await admin.submitFinalise();
      test.skip(
        outcome.data.state === "PLACED",
        "this tenant has a saved card — the hosted-payment path was not exercised"
      );
      expect(outcome.data).toMatchObject({
        state: "AWAITING_PAYMENT",
        total: 207,
        ceiling: 258.75,
      });
      expect(outcome.data.chargeId, "one charge for the set").toBeTruthy();
      expect(outcome.data.hostedPaymentUrl).toBeTruthy();
      await expect(
        admin.notice(
          "The owner needs to finish payment. We've emailed them a link."
        )
      ).toBeVisible();

      await admin.waitForList();
      // The Fulfilment queue's status column (print-builders release) says
      // "Waiting on owner payment"; older builds flag "Awaiting owner payment".
      await expect(
        admin.rowChip(
          orderC.orderNumber,
          /^(Waiting on|Awaiting) owner payment$/
        )
      ).toBeVisible();
      await expect(admin.row(orderC.orderNumber)).toContainText("$207.00");
      await expect(admin.row(orderC.orderNumber)).not.toContainText("est.");
      // Waiting on the owner: no Finalise to click again, only the file.
      await admin.openRowMenu(orderC.orderNumber);
      await expect(admin.menuItems()).toHaveText(["Print file"]);
      await admin.closeRowMenu();

      await admin.openTab("History");
      await admin.selectHistoryStatus("Awaiting payment");
      await expect(
        admin.rowChip(orderC.orderNumber, "Awaiting payment")
      ).toBeVisible();
      await expect(admin.row(orderC.orderNumber)).toContainText("$207.00");

      const parked = await adminOrder(orderC.id);
      expect(parked.status).toBe("AWAITING_PAYMENT");
      expect(parked.chargeId).toBe(outcome.data.chargeId);
      // The admin's inputs are parked on the line so the post-payment click
      // places it without re-charging. `awaitingOwnerPayment` is derived by
      // the LIST endpoint only; the single-order GET returns the raw row.
      expect(parked.pendingFulfilment).toBeTruthy();
      const listed = await listAdminSupplyOrdersRaw(adminToken, {
        status: "AWAITING_PAYMENT",
        restaurantId,
      });
      expect(listed.status, JSON.stringify(listed.data)).toBe(200);
      expect(
        listed.data.data.find((o) => o.id === orderC.id)?.awaitingOwnerPayment
      ).toBe(true);
      expect(parked.hostedPaymentUrl).toBe(outcome.data.hostedPaymentUrl);
      expect(parked.paidAt).toBeNull();
      expect(parked.priceFinalizedAt).toBeTruthy();
      expect(parked.total).toBe(207);

      // A second click while the owner holds a link charges nothing.
      const again = await fulfilSupplyOrderRaw(adminToken, orderC.id, {
        route: "PRINT_ORDER",
        vendor: "Automation Vendor",
        unitCost: 1.1,
        finalUnitPrice: 1.95,
      });
      expect(again.status, JSON.stringify(again.data)).toBe(409);
      expect(again.data.code).toBe("AWAITING_OWNER_PAYMENT");
      expect((await adminOrder(orderC.id)).chargeId).toBe(
        outcome.data.chargeId
      );

      test.skip(
        !MAILPIT,
        "MAILPIT_BASE_URL not set — email assertions skipped"
      );
      const mail = await waitForEmail(ownerEmail, {
        subjectPattern: new RegExp(
          `^One step left to place order ${checkoutC}$`
        ),
        timeoutMs: 60_000,
      });
      expect(mail.html_body).toContain(outcome.data.hostedPaymentUrl!);
    }
  );

  test("TC-461: an order HQ places on the restaurant's behalf (charge) is the owner's order, with an admin-named design and no leaked notes", async () => {
    await allure.description(
      "POST /api/admin/supply-shop/orders — the on-behalf path HQ's tools use (the old 'Place order for a " +
        "restaurant' form is gone; the button now opens the restaurant's own shop, TC-1126). The order is " +
        "IN_DESIGN on the card on file, the design is named for the product and date with '(admin)', HQ's " +
        "internal notes stay on HQ's side, and the owner's list carries neither the notes nor who placed it."
    );
    const placed = await createSupplyOrderOnBehalfRaw(adminToken, {
      restaurantId,
      variantId,
      quantity: 100,
      brief: { message: `Placed by admin ${runId}` },
      adminNotes: `SECRET-${runId}`,
      billing: "CHARGE",
      paymentTerm: "IMMEDIATE",
    });
    expect(placed.status, JSON.stringify(placed.data)).toBe(201);
    toCancel.push(placed.data.data.id);

    const created = await adminOrder(placed.data.data.id);
    expect(created.status).toBe("IN_DESIGN");
    expect(created.paymentTerm).toBe("IMMEDIATE");
    expect(created.design?.name).toMatch(
      /^physical-gift-card — \d{4}-\d{2}-\d{2} \(admin\)$/
    );
    expect(created.adminNotes).toBe(`SECRET-${runId}`);

    const mine = await listSupplyOrdersOwnerRaw(await ownerApi(), restaurantId);
    const row = mine.data.data.find((o) => o.id === placed.data.data.id);
    expect(row, "owner sees the order").toBeTruthy();
    expect(row).not.toHaveProperty("adminNotes");
    expect(row).not.toHaveProperty("placedByAdminId");
  });

  test("TC-1126: 'Place order for a restaurant' opens that restaurant's own Print Shop full-screen, as HQ", async ({
    adminPage,
  }) => {
    await allure.description(
      "HQ picks the restaurant ('Open their shop' waits for one), and the restaurant's own shop opens " +
        "full-screen — the owner's Browse / My orders screens and its catalog — under 'Ordering for <name> " +
        "as RestauNax HQ'. Exit closes it back to the queues. Nothing is ordered."
    );
    requireRelease("printBuilders", printBuilders);
    await admin.goto();
    await admin.openShopForRestaurant();
    await expect(admin.openTheirShopButton()).toBeDisabled();
    await admin.pickRestaurant(restaurantName);
    await expect(admin.openTheirShopButton()).toBeEnabled();
    await admin.openTheirShopButton().click();

    await expect(admin.shopForBanner(restaurantName)).toBeVisible({
      timeout: 15_000,
    });
    const shop = admin.dialog();
    await expect(shop.getByRole("tab", { name: "Browse" })).toBeVisible();
    await expect(shop.getByRole("tab", { name: "My orders" })).toBeVisible();
    // The gift card is launched for this run (beforeAll): the owner's catalog.
    await expect(
      shop.getByRole("heading", { name: PRODUCT_NAME, exact: true }).first()
    ).toBeVisible({ timeout: 15_000 });

    await admin.exitShopFor();
    await expect(admin.shopForBanner(restaurantName)).toHaveCount(0);
    await expect(
      adminPage.getByRole("tab", { name: "Design queue" })
    ).toBeVisible();
  });

  test(
    "TC-462: a COMPED order goes to print with nothing charged — and minting the card batch is what fulfilment does",
    { tag: ["@email"] },
    async () => {
      await allure.description(
        "On-behalf COMP → proof → Finalise (the line reads 'No charge', no price field, no comp switch, " +
          "'Comped — nothing is charged.', never 'Send for approval') → IN_PRODUCTION with total 0, paidAt " +
          "set and no charge opened, a GiftCardBatch on the order, the 'on us' email, and Finance's comped " +
          "cost up by the vendor cost."
      );
      test.setTimeout(180_000);

      const placed = await createSupplyOrderOnBehalfRaw(adminToken, {
        restaurantId,
        variantId,
        quantity: 100,
        brief: { message: `comp path ${runId}` },
        billing: "COMP",
        compReason: `Automation comp ${runId}`,
      });
      expect(placed.status, JSON.stringify(placed.data)).toBe(201);
      orderE = placed.data.data;
      const upload = await uploadSupplyArtworkRaw(
        adminToken,
        orderE.id,
        giftCardPassingPdf()
      );
      expect(upload.ok, JSON.stringify(upload.data)).toBeTruthy();
      const sent = await sendSupplyProofRaw(
        adminToken,
        orderE.id,
        upload.data.data!.versionId
      );
      expect(sent.status, JSON.stringify(sent.data)).toBe(200);

      await admin.goto();
      await admin.openTab("Fulfilment");
      await expect(admin.rowChip(orderE.orderNumber, "Comped")).toBeVisible();
      // Placed on behalf without a basket: the dialog is titled by the order.
      await admin.openFinalise(orderE.orderNumber);
      // Comp was decided when it was placed: the "Comp this order" toggle is
      // only offered for lines that would otherwise be charged, so a COMP
      // line shows the outcome, not a switch that could un-comp it.
      await expect(admin.compSwitch()).toHaveCount(0);
      await expect(admin.noChargeChip()).toBeVisible();
      await expect(admin.willChargeAlert()).toHaveText(
        "Comped — nothing is charged."
      );
      await expect(admin.finalUnit(orderE.id)).toHaveCount(0);
      await expect(admin.confirmButton()).not.toHaveText("Send for approval");
      await admin.fillVendorSection({
        vendor: "Continental BizMag",
        vendorShipping: 12,
        ref: `RUN-${runId}`,
      });
      const outcome = await admin.submitFinalise();
      expect(outcome.data).toMatchObject({
        state: "PLACED",
        chargeId: null,
        total: 0,
      });
      const batchId = outcome.data.giftCardBatchIds[orderE.id];
      expect(batchId, "batch minted by the post-fulfilment hook").toBeTruthy();

      const done = await adminOrder(orderE.id);
      expect(done.status).toBe("IN_PRODUCTION");
      expect(done.total).toBe(0);
      expect(done.paidAt).toBeTruthy();
      expect(done.paymentTerm).toBe("COMP");
      expect(done.giftCardBatchId).toBe(batchId);
      expect(done.chargeId ?? null).toBeNull();
      // Fulfilling a card run switches gift cards ON for the scope — the owner
      // can't flip that switch themselves, and cards nobody can load are plastic.
      const cfg = await getGiftCardConfigAdminRaw(adminToken, restaurantId);
      expect(cfg.data.data.isEnabled).toBe(true);

      await admin.openTab("History");
      await expect(admin.row(orderE.orderNumber)).toBeVisible();
      await admin.openRowMenu(orderE.orderNumber);
      await expect(admin.menuItem("Card export")).toBeVisible();
      await admin.closeRowMenu();

      await expect
        .poll(
          async () => {
            const finance = await getAdminFinanceRaw(adminToken);
            return finance.ok
              ? finance.data.data.summary.supplyShop.compedCost
              : -1;
          },
          { timeout: 30_000, intervals: [3_000] }
        )
        .toBeGreaterThan(baseline.compedCost);

      test.skip(
        !MAILPIT,
        "MAILPIT_BASE_URL not set — email assertions skipped"
      );
      const mail = await waitForEmail(ownerEmail, {
        subjectPattern: / is on its way to print$/,
        timeoutMs: 60_000,
      });
      expect(mail.html_body).toContain("on us");
    }
  );

  test("TC-463: 'Card export' downloads the batch as the printer's data file — one row per card, the barcode value IS the code", async () => {
    await allure.description(
      "Filename is the order number; header and quoting are the contract the printers read; every code is " +
        "16 characters from the no-look-alike alphabet; exporting stamps the batch EXPORTED and counts the export."
    );
    await admin.goto();
    await admin.openTab("History");
    const download = await admin.downloadCardExport(orderE.orderNumber);
    expect(download.suggestedFilename()).toBe(
      `${orderE.orderNumber}-gift-cards.csv`
    );
    const text = fs.readFileSync(await download.path(), "utf8");

    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toContain("\r\n");
    const { header, rows } = csvToObjects(text);
    expect(header).toEqual(CSV_HEADER);
    expect(rows).toHaveLength(100);
    for (const row of rows) {
      const code = row.code ?? "";
      expect(code).toMatch(CODE_RE);
      expect(row.barcode_value).toBe(code);
      expect(row.qr_value).toBe(code);
      expect(row.code_display).toBe(code.replace(/(.{4})(?=.)/g, "$1-"));
      expect(row.card_last4).toBe(code.slice(-4));
      expect(row.batch_label).toBe(`Print run ${orderE.orderNumber}`);
      expect(row.scope_type).toBe("restaurant");
      expect(row.scope_name).toBe(restaurantName);
    }
    expect(new Set(rows.map((r) => r.code)).size).toBe(100);
    expect(rows.map((r) => Number(r.sequence))).toEqual(
      rows.map((_, i) => i + 1)
    );

    const batches = await listGiftCardBatchesRaw(adminToken, restaurantId);
    const batch = batches.data.data.find(
      (b) => b.supplyOrder?.orderNumber === orderE.orderNumber
    );
    expect(batch, "batch linked to the order").toBeTruthy();
    expect(batch!.status).toBe("EXPORTED");
    expect(batch!.exportCount).toBeGreaterThanOrEqual(1);
    expect(batch!.counts).toMatchObject({ inactive: 100, active: 0 });
  });

  test("TC-464: finalise refuses to move money without a final price, to comp without a reason, with a line in no package, and to invoice a tenant with no credit", async () => {
    await allure.description(
      "Both doors HQ has — POST /finalise (the dialog's) and the old per-line /fulfil, which now delegates " +
        "to finalise — refuse a charged line with no final price (400 FINAL_PRICE_REQUIRED) and a comp with no " +
        "reason (400 COMP_REASON_REQUIRED); finalise also refuses a set whose packages do not hold every line " +
        "exactly once (400 PACKAGE_MISMATCH). Nothing moves: the line stays PROOF_READY with no charge. " +
        "Invoicing a tenant with no credit is refused at placement (409 TERM_UNAVAILABLE)."
    );
    const owner = await ownerApi();
    const { order: orderF, checkout } = await placeSupplyOrderViaCart(
      owner,
      restaurantId,
      { variantId, quantity: 100, message: `negatives ${runId}` }
    );
    toCancel.push(orderF.id);
    const upload = await uploadSupplyArtworkRaw(
      adminToken,
      orderF.id,
      giftCardPassingPdf()
    );
    await sendSupplyProofRaw(
      adminToken,
      orderF.id,
      upload.data.data!.versionId
    );

    const draft = await getFinaliseDraftRaw(adminToken, {
      checkoutId: checkout.id,
    });
    expect(draft.status, JSON.stringify(draft.data)).toBe(200);
    const good = finaliseBodyFromDraft(draft.data.data, {
      unitPrice: 1.95,
      unitCost: 1.1,
      vendor: "Automation Vendor",
      vendorShipping: 12,
    });

    await allure.step("POST /finalise", async () => {
      const noPrice = await finaliseSupplyLinesRaw(adminToken, {
        ...good,
        lines: good.lines.map((l) => ({ ...l, unitPrice: null })),
      });
      expect(noPrice.status, JSON.stringify(noPrice.data)).toBe(400);
      expect(noPrice.data.code).toBe("FINAL_PRICE_REQUIRED");

      const noReason = await finaliseSupplyLinesRaw(adminToken, {
        ...good,
        lines: good.lines.map((l) => ({ ...l, comp: { reason: " " } })),
      });
      expect(noReason.status, JSON.stringify(noReason.data)).toBe(400);
      expect(noReason.data.code).toBe("COMP_REASON_REQUIRED");

      const strayLine = await finaliseSupplyLinesRaw(adminToken, {
        ...good,
        packages: good.packages.map((p) => ({ ...p, orderIds: [] })),
      });
      expect(strayLine.status, JSON.stringify(strayLine.data)).toBe(400);
      expect(strayLine.data.code).toBe("PACKAGE_MISMATCH");
    });

    await allure.step("The old per-line /fulfil", async () => {
      const noPrice = await fulfilSupplyOrderRaw(adminToken, orderF.id, {
        route: "PRINT_ORDER",
        vendor: "Automation Vendor",
        unitCost: 1.1,
      });
      expect(noPrice.status, JSON.stringify(noPrice.data)).toBe(400);
      expect(noPrice.data.code).toBe("FINAL_PRICE_REQUIRED");

      const noReason = await fulfilSupplyOrderRaw(adminToken, orderF.id, {
        route: "PRINT_ORDER",
        vendor: "Automation Vendor",
        unitCost: 1.1,
        comp: true,
      });
      expect(noReason.status, JSON.stringify(noReason.data)).toBe(400);
      expect(noReason.data.code).toBe("COMP_REASON_REQUIRED");
    });

    const untouched = await adminOrder(orderF.id);
    expect(untouched.status).toBe("PROOF_READY");
    expect(untouched.chargeId ?? null).toBeNull();
    expect(untouched.priceFinalizedAt ?? null).toBeNull();

    const invoice = await createSupplyOrderOnBehalfRaw(adminToken, {
      restaurantId,
      variantId,
      quantity: 100,
      brief: { message: `invoice ${runId}` },
      billing: "CHARGE",
      paymentTerm: "NEXT_INVOICE",
    });
    if (invoice.ok) {
      // QA gave this tenant credit (a subscribed OWNER2) — that is a valid world too.
      toCancel.push(invoice.data.data.id);
      expect(invoice.data.data.paymentTerm).toBe("NEXT_INVOICE");
    } else {
      // Not the caller's mistake but the tenant's state (no credit extended),
      // so the admin controller answers 409, not 400 (BAD_REQUEST_CODES).
      expect(invoice.status, JSON.stringify(invoice.data)).toBe(409);
      expect(invoice.data.code).toBe("TERM_UNAVAILABLE");
    }
  });

  test("TC-465: an owner can never comp their own order, and cannot claim the free tier on a $207 run — neither at the cart's checkout nor through the old commit", async () => {
    const owner = await ownerApi();
    const design = await createSupplyDesignOwnerRaw(owner, restaurantId, {
      variantId,
      name: `terms ${runId}`,
      brief: { message: `terms ${runId}` },
    });
    const draft = await createSupplyOrderOwnerRaw(owner, restaurantId, {
      variantId,
      quantity: 100,
      designId: design.data.data.id,
    });
    expect(draft.status, JSON.stringify(draft.data)).toBe(201);
    toCancel.push(draft.data.data.id);

    const comp = await commitSupplyOrderOwnerRaw(
      owner,
      restaurantId,
      draft.data.data.id,
      "COMP"
    );
    expect(comp.status, JSON.stringify(comp.data)).toBe(400);
    const free = await commitSupplyOrderOwnerRaw(
      owner,
      restaurantId,
      draft.data.data.id,
      "FREE_TIER"
    );
    // COMP is refused up front as a bad request (400); FREE_TIER reaches the
    // service, which refuses a $207 run as a state conflict (409).
    expect(free.status, JSON.stringify(free.data)).toBe(409);
    expect((free.data as { code?: string }).code).toBe("FREE_TIER_UNAVAILABLE");
    const still = await listSupplyOrdersOwnerRaw(owner, restaurantId);
    expect(
      still.data.data.find((o) => o.id === draft.data.data.id)?.status
    ).toBe("DRAFT");

    await allure.step(
      "The cart's Place order takes only IMMEDIATE or NEXT_INVOICE",
      async () => {
        const added = await addSupplyCartItemRaw(owner, restaurantId, {
          variantId,
          quantity: 100,
          designId: design.data.data.id,
        });
        expect(added.ok, JSON.stringify(added.data)).toBeTruthy();
        for (const term of ["COMP", "FREE_TIER"] as const) {
          const refused = await checkoutSupplyCartRaw(
            owner,
            restaurantId,
            term
          );
          expect(
            refused.status,
            `${term}: ${JSON.stringify(refused.data)}`
          ).toBe(400);
        }
        // Nothing was placed: the line is still in the cart.
        const cart = await getSupplyCartRaw(owner, restaurantId);
        expect(cart.data.data.lines).toHaveLength(1);
        await emptySupplyCart(owner, restaurantId);
      }
    );
  });

  test("TC-466: finalising an order twice mints nothing twice — one batch per order, by either door", async () => {
    const draft = await getFinaliseDraftRaw(adminToken, { orderId: orderE.id });
    const viaFinalise = draft.ok
      ? await finaliseSupplyLinesRaw(
          adminToken,
          finaliseBodyFromDraft(draft.data.data, {
            unitPrice: 1.95,
            unitCost: 1.1,
            vendor: "Continental BizMag",
            vendorShipping: 12,
          })
        )
      : draft;
    expect(viaFinalise.ok, JSON.stringify(viaFinalise.data)).toBe(false);
    const viaFulfil = await fulfilSupplyOrderRaw(adminToken, orderE.id, {
      route: "PRINT_ORDER",
      vendor: "Continental BizMag",
      unitCost: 1.1,
    });
    expect(viaFulfil.status, JSON.stringify(viaFulfil.data)).toBe(409);
    expect(viaFulfil.data.code).toBe("ALREADY_FULFILLED");

    const batches = await listGiftCardBatchesRaw(adminToken, restaurantId);
    const forE = batches.data.data.filter(
      (b) => b.supplyOrder?.orderNumber === orderE.orderNumber
    );
    expect(forE).toHaveLength(1);
  });

  test("TC-467: unsold stock is not a liability — Finance's gift-card liability is unchanged by a minted batch", async () => {
    await allure.description(
      "Measured on THIS tenant, which now holds a minted batch of 100 INACTIVE cards: its outstanding " +
        "gift-card liability is still $0 across 0 cards. (Finance's platform-wide total used to be compared " +
        "to a beforeAll baseline, but on shared QA other runs sell gift cards meanwhile and move it.)"
    );
    const batches = await listGiftCardBatchesRaw(adminToken, restaurantId);
    expect(
      batches.data.data.find(
        (b) => b.supplyOrder?.orderNumber === orderE.orderNumber
      )?.counts,
      "the minted stock this check is about"
    ).toMatchObject({ inactive: 100, active: 0 });

    const mine = await getOwnerGiftCardSummaryRaw(
      await ownerApi(),
      restaurantId
    );
    expect(mine.status, JSON.stringify(mine.data)).toBe(200);
    expect(mine.data.data).toMatchObject({
      outstandingBalance: 0,
      cardCount: 0,
    });

    const finance = await getAdminFinanceRaw(adminToken);
    expect(finance.status, JSON.stringify(finance.data)).toBe(200);
    expect(typeof finance.data.data.summary.giftCards.liability).toBe("number");
  });

  test("TC-468: the supply-shop admin API is gated by ROLE — an employee gets 403 whatever the sidebar shows", async () => {
    test.skip(
      !EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD,
      "EMPLOYEE_EMAIL / EMPLOYEE_PASSWORD not set"
    );
    const employee = (await apiLogin(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD))
      .accessToken;
    const res = await listAdminSupplyOrdersRaw(employee, {
      queue: "fulfilment",
    });
    expect(res.status, JSON.stringify(res.data)).toBe(403);
  });
});
