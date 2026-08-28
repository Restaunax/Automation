/**
 * supply-shop.spec.ts — Admin → Cards & Codes → Supply Shop (TC-456..468).
 *
 * The admin side of "place now, charge at fulfilment": the design queue and
 * artwork preflight, the Fulfil dialog (the ONE place money moves — final
 * price, comp, vendor cost), placing an order on a restaurant's behalf, and
 * the physical-gift-card outcome of a fulfilment: a minted batch and its CSV.
 *
 * Own throwaway tenant (owner acts through the API only; the admin drives
 * the browser via the `adminPage` fixture). Two orders carry the file:
 * `orderC` walks the CHARGE path up to the hosted-payment fallback (a
 * throwaway tenant has no saved card, and hosted Checkout cannot be completed
 * on QA), `orderE` walks the COMP path all the way to IN_PRODUCTION — the
 * only route to a minted batch in E2E. The admin table is cross-tenant on
 * shared QA, so every row is found by order number.
 */
import * as fs from "fs";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  createAdminSupplyShopPage,
  type AdminSupplyShopPage,
} from "../../../pages/dashboard/admin/AdminSupplyShopPage";
import { generateRunId } from "../../../utils/testData";
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
  placeSupplyOrderViaApi,
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
  resolveGiftCardVariantId,
  type SupplyOrder,
} from "../../../utils/apiHelper";

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

  let orderC: SupplyOrder; // charge path
  let orderE: SupplyOrder; // comp path → minted batch
  const toCancel: string[] = [];
  let baseline = { compedCost: 0, liability: 0 };

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
    const cfg = await putGiftCardConfigAdminRaw(adminToken, restaurantId, {
      isEnabled: true,
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

    const finance = await getAdminFinanceRaw(adminToken);
    if (finance.ok) {
      baseline = {
        compedCost: finance.data.data.summary.supplyShop.compedCost,
        liability: finance.data.data.summary.giftCards.liability,
      };
    }

    orderC = await placeSupplyOrderViaApi(tenant.accessToken, restaurantId, {
      variantId,
      quantity: 100,
      message: `charge path ${runId}`,
    });
    toCancel.push(orderC.id);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    const token = await apiLogin(ownerEmail, ownerPassword)
      .then((l) => l.accessToken)
      .catch(() => "");
    if (token) {
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

  test("TC-456: a freshly placed order sits in the Design queue with its estimate, brief pack and an Upload artwork button", async () => {
    await admin.goto();
    await admin.openTab("Design queue");
    await expect(admin.row(orderC.orderNumber)).toBeVisible();
    await expect(admin.row(orderC.orderNumber)).toContainText(restaurantName);
    await expect(admin.row(orderC.orderNumber)).toContainText(
      `${ESTIMATE} est.`
    );
    await expect(
      admin.rowButton(orderC.orderNumber, "Brief pack")
    ).toBeVisible();
    await expect(
      admin.rowButton(orderC.orderNumber, "Upload artwork")
    ).toBeVisible();
    // Not yet in the fulfilment queue — there is no artwork to place.
    await admin.openTab("Fulfilment");
    await expect(admin.row(orderC.orderNumber)).toHaveCount(0);
  });

  test("TC-457: artwork at the wrong page size is BLOCKED by preflight and cannot be sent as a proof", async () => {
    await allure.description(
      "US Letter for a credit-card-size product: pageSize BLOCKs, the version still exists (the admin " +
        "needs the verdict), and send-proof answers 409 PREFLIGHT_BLOCKED."
    );
    const upload = await uploadSupplyArtworkRaw(
      adminToken,
      orderC.id,
      letterPdf(),
      "letter.pdf"
    );
    expect(upload.status, JSON.stringify(upload.data)).toBe(200);
    const report = upload.data.data!.preflight;
    expect(report.worstVerdict).toBe("BLOCK");
    expect(report.sendable).toBe(false);
    expect(report.checks).toContainEqual(
      expect.objectContaining({ key: "pageSize", verdict: "BLOCK" })
    );

    const sent = await sendSupplyProofRaw(
      adminToken,
      orderC.id,
      upload.data.data!.versionId
    );
    expect(sent.status, JSON.stringify(sent.data)).toBe(409);
    expect(sent.data.code).toBe("PREFLIGHT_BLOCKED");
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

  test("TC-459: the Fulfil dialog prefills the anchor price, shows the range the owner saw, and warns when the final price leaves it", async () => {
    await allure.description(
      "The proof is a look, not a gate — fulfil is offered from PROOF_READY. Final total recomputes live; " +
        "outside [$207.00, $258.75] a warning appears (warn-only, never blocked); the margin line reads " +
        "revenue − cost. Nothing is submitted."
    );
    await admin.goto();
    await admin.openTab("Fulfilment");
    await admin.openFulfil(orderC.orderNumber);

    await expect(admin.proofPendingBanner()).toBeVisible();
    await expect(admin.finalUnit()).toHaveValue("1.95");
    await expect(admin.finalShipping()).toHaveValue("12");
    await expect(admin.finalTotalLine()).toContainText("Final total $207.00");
    await expect(admin.finalTotalLine()).toContainText(ESTIMATE);
    await expect(admin.willChargeAlert()).toHaveText(
      "Will charge the card on file now."
    );
    await expect(admin.outsideEstimateWarning()).toHaveCount(0);

    await admin.finalUnit().fill("3");
    await expect(admin.outsideEstimateWarning()).toBeVisible();
    await admin.finalUnit().fill("2.40");
    await expect(admin.outsideEstimateWarning()).toHaveCount(0);
    await expect(admin.finalTotalLine()).toContainText("Final total $252.00");

    await admin.fillVendorSection({
      vendor: "Automation Vendor",
      unitCost: 1.1,
      shippingCost: 12,
    });
    await expect(admin.marginLine()).toContainText(
      "Revenue $252.00 − cost $122.00 = $130.00 margin"
    );
    await expect(admin.confirmButton()).toHaveText("Finalise & charge");
    await admin.cancelDialog();
  });

  test(
    "TC-460: 'Finalise & charge' with no saved card parks the inputs and emails a payment link — nothing is charged twice",
    { tag: ["@email"] },
    async () => {
      test.setTimeout(150_000);
      await admin.goto();
      await admin.openTab("Fulfilment");
      await admin.openFulfil(orderC.orderNumber);
      await admin.fillVendorSection({
        vendor: "Automation Vendor",
        unitCost: 1.1,
        shippingCost: 12,
        ref: `AUTO-${runId}`,
      });
      const outcome = await admin.submitFulfil();
      test.skip(
        outcome.data.settled,
        "this tenant has a saved card — the hosted-payment path was not exercised"
      );

      await expect(admin.paymentLinkNotice()).toBeVisible();
      await expect(
        admin.rowChip(orderC.orderNumber, "Awaiting owner payment")
      ).toBeVisible();
      const parked = await adminOrder(orderC.id);
      expect(parked.status).toBe("AWAITING_PAYMENT");
      expect(parked.awaitingOwnerPayment).toBe(true);
      expect(parked.hostedPaymentUrl).toBeTruthy();
      expect(parked.paidAt).toBeNull();
      expect(parked.priceFinalizedAt).toBeTruthy();
      expect(parked.total).toBe(207);

      test.skip(
        !MAILPIT,
        "MAILPIT_BASE_URL not set — email assertions skipped"
      );
      await waitForEmail(ownerEmail, {
        subjectPattern: /^One step left to print your /,
        timeoutMs: 60_000,
      });
    }
  );

  test("TC-461: 'Place order for a restaurant' (charge) creates the owner's order with an admin-named design and no leaked notes", async () => {
    await admin.goto();
    await admin.openPlaceDialog();
    await admin.pickRestaurant(restaurantName);
    await admin.pickProduct(PRODUCT_NAME);
    await admin.pickQuantity(100);
    await expect(admin.placeEstimate()).toContainText(ESTIMATE);
    await expect(admin.placeVendorCost()).toContainText("$122.00");
    await admin.placeMessage().fill(`Placed by admin ${runId}`);
    await admin.placeAdminNotes().fill(`SECRET-${runId}`);
    await admin.billingRadio("Charge them when it goes to print").check();
    await admin.termRadio("Card on file").check();
    const placed = await admin.submitPlace();
    toCancel.push(placed.data.id);

    const created = await adminOrder(placed.data.id);
    expect(created.status).toBe("IN_DESIGN");
    expect(created.paymentTerm).toBe("IMMEDIATE");
    expect(created.design?.name).toMatch(
      /^physical-gift-card — \d{4}-\d{2}-\d{2} \(admin\)$/
    );
    expect(created.adminNotes).toBe(`SECRET-${runId}`);

    const mine = await listSupplyOrdersOwnerRaw(await ownerApi(), restaurantId);
    const row = mine.data.data.find((o) => o.id === placed.data.id);
    expect(row, "owner sees the order").toBeTruthy();
    expect(row).not.toHaveProperty("adminNotes");
    expect(row).not.toHaveProperty("placedByAdminId");
  });

  test(
    "TC-462: a COMPED order goes to print with nothing charged — and minting the card batch is what fulfilment does",
    { tag: ["@email"] },
    async () => {
      await allure.description(
        "On-behalf COMP → proof → Fulfil (no price section, 'Comped — nothing is charged.', button reads " +
          "'Place with vendor') → IN_PRODUCTION with total 0 and paidAt set, a GiftCardBatch on the order, " +
          "the 'on us' email, and Finance's comped cost up by the vendor cost."
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
      await admin.openFulfil(orderE.orderNumber);
      await expect(admin.compSwitch()).toHaveAttribute("aria-checked", "true");
      await expect(admin.willChargeAlert()).toHaveText(
        "Comped — nothing is charged."
      );
      await expect(admin.finalUnit()).toHaveCount(0);
      await expect(admin.confirmButton()).toHaveText("Place with vendor");
      await admin.fillVendorSection({
        vendor: "Continental BizMag",
        unitCost: 1.1,
        shippingCost: 12,
        ref: `RUN-${runId}`,
      });
      const outcome = await admin.submitFulfil();
      expect(outcome.data.settled).toBe(true);
      expect(
        outcome.data.giftCardBatchId,
        "batch minted by the post-fulfilment hook"
      ).toBeTruthy();

      const done = await adminOrder(orderE.id);
      expect(done.status).toBe("IN_PRODUCTION");
      expect(done.total).toBe(0);
      expect(done.paidAt).toBeTruthy();
      expect(done.paymentTerm).toBe("COMP");
      expect(done.giftCardBatchId).toBe(outcome.data.giftCardBatchId);

      await admin.openTab("History");
      await expect(admin.row(orderE.orderNumber)).toBeVisible();
      await expect(
        admin.rowButton(orderE.orderNumber, "Card export")
      ).toBeVisible();

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

  test("TC-464: fulfil refuses to move money without a final price, to comp without a reason, and to invoice a tenant with no credit", async () => {
    const owner = await ownerApi();
    const orderF = await placeSupplyOrderViaApi(owner, restaurantId, {
      variantId,
      quantity: 100,
      message: `negatives ${runId}`,
    });
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
    expect((await adminOrder(orderF.id)).status).toBe("PROOF_READY");

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
      expect(invoice.status, JSON.stringify(invoice.data)).toBe(400);
    }
  });

  test("TC-465: an owner can never comp their own order, and cannot claim the free tier on a $207 run", async () => {
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
    expect(free.status, JSON.stringify(free.data)).toBe(400);
    const still = await listSupplyOrdersOwnerRaw(owner, restaurantId);
    expect(
      still.data.data.find((o) => o.id === draft.data.data.id)?.status
    ).toBe("DRAFT");
  });

  test("TC-466: fulfilling an order twice mints nothing twice — one batch per order", async () => {
    const again = await fulfilSupplyOrderRaw(adminToken, orderE.id, {
      route: "PRINT_ORDER",
      vendor: "Continental BizMag",
      unitCost: 1.1,
    });
    expect(again.ok, JSON.stringify(again.data)).toBe(false);

    const batches = await listGiftCardBatchesRaw(adminToken, restaurantId);
    const forE = batches.data.data.filter(
      (b) => b.supplyOrder?.orderNumber === orderE.orderNumber
    );
    expect(forE).toHaveLength(1);
  });

  test("TC-467: unsold stock is not a liability — Finance's gift-card liability is unchanged by a minted batch", async () => {
    const finance = await getAdminFinanceRaw(adminToken);
    expect(finance.status, JSON.stringify(finance.data)).toBe(200);
    expect(finance.data.data.summary.giftCards.liability).toBe(
      baseline.liability
    );
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
