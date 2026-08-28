import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Admin — Cards & Codes → Supply Shop (`/admin?tab=cards&section=supply-shop`).
 *
 * Three queues (Design queue / Fulfilment / History) over one table, plus the
 * three dialogs that move an order along: Upload artwork (design), the
 * place-on-behalf dialog, and Fulfil (where the money moves). The admin
 * table is cross-tenant on shared QA, so every row lookup is by order number.
 */
export const createAdminSupplyShopPage = (page: Page) => {
  const goto = async () => {
    await page.goto("/admin?tab=cards&section=supply-shop", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("tab", { name: "Design queue" })).toBeVisible({
      timeout: 15_000,
    });
  };

  const openTab = async (name: "Design queue" | "Fulfilment" | "History") => {
    await page.getByRole("tab", { name }).click();
    await expect(page.getByRole("tab", { name })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  };

  /** History tab status filter (MUI Select) — options carry the owner-facing labels. */
  const selectHistoryStatus = async (optionLabel: string) => {
    await page.locator('[role="combobox"]').first().click();
    await page.getByRole("option", { name: optionLabel, exact: true }).click();
  };

  const row = (orderNumber: string): Locator =>
    page.getByRole("row").filter({ hasText: orderNumber });

  const rowChip = (orderNumber: string, label: string) =>
    row(orderNumber).locator(".MuiChip-label", { hasText: label });

  const rowButton = (orderNumber: string, name: string | RegExp) =>
    row(orderNumber).getByRole("button", { name });

  const dialog = () => page.getByRole("dialog");

  // ── Upload artwork (design queue) ──────────────────────────────────────────
  const openUploadArtwork = async (orderNumber: string) => {
    await rowButton(orderNumber, "Upload artwork").click();
    await expect(dialog()).toContainText("Artwork —");
  };

  /** Feed a PDF buffer to the dialog's file input and wait for the preflight verdict. */
  const uploadArtwork = async (pdf: Buffer, filename = "artwork.pdf") => {
    const upload = page.waitForResponse(
      (r) =>
        /\/api\/admin\/supply-shop\/orders\/[^/]+\/artwork$/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await dialog().locator('input[type="file"]').setInputFiles({
      name: filename,
      mimeType: "application/pdf",
      buffer: pdf,
    });
    const res = await upload;
    expect(res.ok(), `artwork upload → ${res.status()}`).toBeTruthy();
  };

  const artworkPassed = () =>
    dialog().getByText(/looks good and is ready to send/);
  const artworkBlocked = () =>
    dialog().getByText("This file cannot go out", { exact: false });

  const sendProof = async () => {
    const send = page.waitForResponse(
      (r) => /\/send-proof$/.test(r.url()) && r.request().method() === "POST"
    );
    await dialog().getByRole("button", { name: "Send to restaurant" }).click();
    const res = await send;
    expect(res.ok(), `send-proof → ${res.status()}`).toBeTruthy();
    await expect(dialog().getByRole("button", { name: "Sent" })).toBeVisible();
    await dialog().getByRole("button", { name: "Done" }).click();
    await expect(dialog()).toBeHidden();
  };

  // ── Place order for a restaurant ───────────────────────────────────────────
  const openPlaceDialog = async () => {
    await page
      .getByRole("button", { name: "Place order for a restaurant" })
      .click();
    await expect(dialog()).toContainText("Place an order for a restaurant");
  };

  /** Debounced server-search Autocomplete — needs real keystrokes. */
  const pickRestaurant = async (name: string) => {
    const input = dialog().locator("#place-restaurant");
    await input.click();
    await input.pressSequentially(name, { delay: 100 });
    await page.getByRole("option", { name }).first().click();
  };

  const selectMui = async (
    selectLocator: Locator,
    optionName: string | RegExp
  ) => {
    await selectLocator.click();
    await page.getByRole("option", { name: optionName }).first().click();
  };

  const pickProduct = (name: string) =>
    selectMui(dialog().locator("#place-product"), name);
  const pickQuantity = (qty: number) =>
    selectMui(dialog().locator("#place-quantity"), new RegExp(`^${qty}$`));

  const placeEstimate = () =>
    dialog().getByText(/^Estimate the restaurant will see: /);
  const placeVendorCost = () => dialog().getByText(/^Our expected cost: /);
  const placeMessage = () => dialog().locator("#place-message");
  const placeAdminNotes = () => dialog().locator("#place-admin-notes");
  const placeCompReason = () => dialog().locator("#place-comp-reason");
  const billingRadio = (
    label: "Charge them when it goes to print" | "Comp — free of charge"
  ) => dialog().getByRole("radio", { name: label });
  const termRadio = (label: "Card on file" | "Next invoice") =>
    dialog().getByRole("radio", { name: label });

  const submitPlace = async () => {
    const create = page.waitForResponse(
      (r) =>
        /\/api\/admin\/supply-shop\/orders$/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await dialog()
      .getByRole("button", { name: "Place order", exact: true })
      .click();
    const res = await create;
    expect(res.ok(), `on-behalf → ${res.status()}`).toBeTruthy();
    await expect(dialog()).toBeHidden();
    await expect(
      page.getByText("Order placed for the restaurant.")
    ).toBeVisible();
    return (await res.json()) as { data: { id: string; orderNumber: string } };
  };

  // ── Fulfil ─────────────────────────────────────────────────────────────────
  const openFulfil = async (orderNumber: string) => {
    const draft = page.waitForResponse((r) =>
      /\/fulfilment-draft\?/.test(r.url())
    );
    await rowButton(
      orderNumber,
      /^(Finalise & charge|Place with vendor)$/
    ).click();
    await draft;
    await expect(dialog()).toContainText(`Fulfil ${orderNumber}`);
  };

  const proofPendingBanner = () =>
    dialog().getByText("the proof is a look, not a gate", { exact: false });
  const compSwitch = () => dialog().getByRole("switch");
  const compReason = () => dialog().locator("#fulfil-comp-reason");
  const finalUnit = () => dialog().locator("#fulfil-final-unit");
  const finalShipping = () => dialog().locator("#fulfil-final-shipping");
  const finalTotalLine = () => dialog().getByText(/^Final total \$/);
  const outsideEstimateWarning = () =>
    dialog().getByText("This final price is outside the estimate", {
      exact: false,
    });
  const willChargeAlert = () =>
    dialog().getByText(
      /^(Will charge the card on file now\.|Will add it to their next RestauNax invoice\.|Comped — nothing is charged\.|Their free monthly item — nothing is charged\.)$/
    );
  const alreadySettledAlert = () => dialog().getByText(/^Already settled: \$/);
  const routeSelect = () => dialog().locator("#fulfil-route");
  const vendorInput = () => dialog().locator("#fulfil-vendor");
  const unitCost = () => dialog().locator("#fulfil-unit");
  const shippingCost = () => dialog().locator("#fulfil-shipping");
  const vendorRef = () => dialog().locator("#fulfil-ref");
  const marginLine = () =>
    dialog().getByText(/^Revenue \$[\d.,]+ − cost \$[\d.,]+ = /);
  const confirmButton = () =>
    dialog().getByRole("button", {
      name: /^(Finalise & charge|Place with vendor)$/,
    });

  const fillVendorSection = async (opts: {
    vendor: string;
    unitCost: number;
    shippingCost: number;
    ref?: string;
  }) => {
    await vendorInput().fill(opts.vendor);
    await unitCost().fill(String(opts.unitCost));
    await shippingCost().fill(String(opts.shippingCost));
    if (opts.ref) await vendorRef().fill(opts.ref);
  };

  /** Submit the dialog and return the fulfil response body. */
  const submitFulfil = async () => {
    const fulfil = page.waitForResponse(
      (r) => /\/fulfil$/.test(r.url()) && r.request().method() === "POST"
    );
    await confirmButton().click();
    const res = await fulfil;
    expect(res.ok(), `fulfil → ${res.status()}`).toBeTruthy();
    await expect(dialog()).toBeHidden();
    return (await res.json()) as {
      data: {
        settled: boolean;
        hostedPaymentUrl: string | null;
        giftCardBatchId?: string | null;
      };
    };
  };

  const cancelDialog = async () => {
    await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog()).toBeHidden();
  };

  const paymentLinkNotice = () =>
    page.getByText("The restaurant has been emailed a payment link", {
      exact: false,
    });

  /** The ⋮ menu on a row — brief pack, print file and card export live there. */
  const openRowMenu = async (orderNumber: string) => {
    await rowButton(orderNumber, "More actions").click();
    await expect(page.getByRole("menu")).toBeVisible();
  };
  const menuItem = (name: string) =>
    page.getByRole("menuitem", { name, exact: true });
  const closeRowMenu = () => page.keyboard.press("Escape");

  /** "Card export" (in the ⋮ menu) downloads through apiService as a blob — a real download event. */
  const downloadCardExport = async (orderNumber: string) => {
    await openRowMenu(orderNumber);
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      menuItem("Card export").click(),
    ]);
    return download;
  };

  return {
    goto,
    openTab,
    selectHistoryStatus,
    row,
    rowChip,
    rowButton,
    dialog,
    openUploadArtwork,
    uploadArtwork,
    artworkPassed,
    artworkBlocked,
    sendProof,
    openPlaceDialog,
    pickRestaurant,
    pickProduct,
    pickQuantity,
    placeEstimate,
    placeVendorCost,
    placeMessage,
    placeAdminNotes,
    placeCompReason,
    billingRadio,
    termRadio,
    submitPlace,
    openFulfil,
    proofPendingBanner,
    compSwitch,
    compReason,
    finalUnit,
    finalShipping,
    finalTotalLine,
    outsideEstimateWarning,
    willChargeAlert,
    alreadySettledAlert,
    routeSelect,
    vendorInput,
    unitCost,
    shippingCost,
    vendorRef,
    marginLine,
    confirmButton,
    fillVendorSection,
    submitFulfil,
    cancelDialog,
    paymentLinkNotice,
    openRowMenu,
    menuItem,
    closeRowMenu,
    downloadCardExport,
  };
};

export type AdminSupplyShopPage = ReturnType<typeof createAdminSupplyShopPage>;
