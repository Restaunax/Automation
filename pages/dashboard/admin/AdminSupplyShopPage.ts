import {
  type Page,
  type Locator,
  type Request,
  expect,
} from "@playwright/test";

/**
 * Admin — Cards & Codes → Supply Shop (`/admin?tab=cards&section=supply-shop`).
 *
 * Three queues (Design queue / Fulfilment / History) over one table (a fourth
 * tab, Catalog, is go-live control), plus the dialogs that move an order
 * along: Upload artwork (design), the place-on-behalf dialog, and Finalise
 * (where the money moves). Since RestauNax #1075 a row's action cell is ONLY
 * a "More actions" (⋯) button: the next step (Upload artwork / Finalise &
 * charge / Place with vendor …) leads its menu, then Brief pack / Print file
 * / Card export. Finalise works on the whole basket (SupplyCheckout) the line
 * was placed in — one section per package, one SupplyCharge for the set —
 * and asks the owner to approve a total above what they agreed to. The admin
 * table is cross-tenant on shared QA, so every row lookup is by order number.
 */
export const createAdminSupplyShopPage = (page: Page) => {
  // SupplyShopAdmin's `load()` has no stale-response guard: switching tab while
  // an earlier list call (the initial design queue, or the refresh a dialog's
  // Done/onDone fires) is still in flight lets that LATE response overwrite the
  // new tab's rows — the Fulfilment tab then reads "Nothing waiting in this
  // state" for an order that is sitting in it. A user clicking fast hits the
  // same race; the POM sidesteps it by never switching tab mid-fetch.
  const isListCall = (url: string) =>
    /\/api\/admin\/supply-shop\/orders\?/.test(url);
  const inFlight = new Set<Request>();
  page.on("request", (r) => {
    if (isListCall(r.url())) inFlight.add(r);
  });
  page.on("requestfinished", (r) => inFlight.delete(r));
  page.on("requestfailed", (r) => inFlight.delete(r));
  const listCallsSettled = () =>
    expect.poll(() => inFlight.size, { timeout: 15_000 }).toBe(0);

  const goto = async () => {
    const initial = page.waitForResponse((r) => isListCall(r.url()));
    await page.goto("/admin?tab=cards&section=supply-shop", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("tab", { name: "Design queue" })).toBeVisible({
      timeout: 15_000,
    });
    await initial;
  };

  const TAB_QUERY: Record<"Design queue" | "Fulfilment" | "History", RegExp> = {
    "Design queue": /[?&]queue=design(&|$)/,
    Fulfilment: /[?&]queue=fulfilment(&|$)/,
    // History is the list call with no `queue`. It used to always send a
    // `status=`; since RestauNax #1115 it opens on "All statuses" and sends
    // none, so matching on the absence of `queue` works against both.
    History: /^(?!.*[?&]queue=)/,
  };

  const openTab = async (name: "Design queue" | "Fulfilment" | "History") => {
    const tab = page.getByRole("tab", { name });
    await listCallsSettled();
    if ((await tab.getAttribute("aria-selected")) !== "true") {
      const loaded = page.waitForResponse(
        (r) => isListCall(r.url()) && TAB_QUERY[name].test(r.url())
      );
      await tab.click();
      await loaded;
      await listCallsSettled();
    }
    await expect(tab).toHaveAttribute("aria-selected", "true");
  };

  /** History tab status filter (MUI Select) — options carry the owner-facing labels. */
  const selectHistoryStatus = async (optionLabel: string) => {
    await listCallsSettled();
    await page.locator('[role="combobox"]').first().click();
    const loaded = page.waitForResponse(
      (r) => isListCall(r.url()) && /[?&]status=/.test(r.url())
    );
    await page.getByRole("option", { name: optionLabel, exact: true }).click();
    await loaded;
    await listCallsSettled();
  };

  const row = (orderNumber: string): Locator =>
    page.getByRole("row").filter({ hasText: orderNumber });

  const rowChip = (orderNumber: string, label: string) =>
    row(orderNumber).locator(".MuiChip-label", { hasText: label });

  const dialog = () => page.getByRole("dialog");

  /** The ⋮ menu on a row — every row action, the next step first, lives there. */
  const openRowMenu = async (orderNumber: string) => {
    await row(orderNumber)
      .getByRole("button", { name: "More actions" })
      .click();
    await expect(page.getByRole("menu")).toBeVisible();
  };
  const menuItem = (name: string | RegExp) =>
    page.getByRole("menuitem", {
      name,
      exact: typeof name === "string" ? true : undefined,
    });
  /** The open menu's items, in order: the next step leads. */
  const menuItems = () => page.getByRole("menu").getByRole("menuitem");
  const closeRowMenu = async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
  };

  /** Run a row action from its ⋯ menu. */
  const rowAction = async (orderNumber: string, name: string | RegExp) => {
    await openRowMenu(orderNumber);
    await menuItem(name).click();
  };

  // ── Upload artwork (design queue) ──────────────────────────────────────────
  const openUploadArtwork = async (orderNumber: string) => {
    await rowAction(orderNumber, "Upload artwork");
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

  /**
   * Debounced server-search Autocomplete — needs real keystrokes. MUI's
   * Autocomplete replaces the TextField's `id="place-restaurant"` with its own
   * generated input id, so the input is found by role + its placeholder name.
   */
  const pickRestaurant = async (name: string) => {
    const input = dialog().getByRole("combobox", { name: "Search by name" });
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

  // ── Finalise ───────────────────────────────────────────────────────────────
  /**
   * Open Finalise from the row's ⋯ menu ("Finalise & charge", or "Place with
   * vendor" once settled) and wait for the draft. `reference` is what the
   * title names: the basket's SC number, or the order number of a line
   * placed without one.
   */
  const openFinalise = async (orderNumber: string, reference = orderNumber) => {
    const draft = page.waitForResponse((r) =>
      /\/api\/admin\/supply-shop\/finalise-draft\?/.test(r.url())
    );
    await rowAction(orderNumber, /^(Finalise & charge|Place with vendor)$/);
    const res = await draft;
    expect(res.ok(), `finalise-draft → ${res.status()}`).toBeTruthy();
    await expect(dialog()).toContainText(`Finalise ${reference} · `);
  };

  const proofPendingBanner = () =>
    dialog().getByText("the proof is a look, not a gate", { exact: false });
  /** Per-line comp toggle — offered only on a line that would be charged. */
  const compSwitch = () =>
    dialog().getByRole("switch", { name: "Comp this order (no charge)" });
  const noChargeChip = () => dialog().getByText("No charge", { exact: true });
  /**
   * Per-line and per-package fields. Ids are `finalise-<package index>-…`;
   * line fields add the order id. The suites finalise one-package sets.
   */
  const finalUnit = (orderId: string) =>
    dialog().locator(`[id="finalise-0-${orderId}-price"]`);
  const unitCost = (orderId: string) =>
    dialog().locator(`[id="finalise-0-${orderId}-cost"]`);
  const shippingCharged = () =>
    dialog().locator("#finalise-0-shipping-charged");
  // freeSolo Autocomplete: found by role + placeholder, not by id.
  const vendorInput = () =>
    dialog().getByRole("combobox", { name: "Who is producing this?" });
  const vendorShipping = () => dialog().locator("#finalise-0-vendor-shipping");
  const vendorTax = () => dialog().locator("#finalise-0-vendor-tax");
  const vendorRef = () => dialog().locator("#finalise-0-vendor-ref");
  /** "The restaurant agreed to up to $X. Final total: $Y." */
  const ceilingLine = () =>
    dialog().getByText(/^The restaurant agreed to up to \$/);
  const aboveCeilingWarning = () =>
    dialog().getByText("This is above what the owner agreed to", {
      exact: false,
    });
  const willChargeAlert = () =>
    dialog().getByText(
      /^(Will charge the card on file now\.|Will add it to their next RestauNax invoice\.|Comped — nothing is charged\.|Their free monthly item — nothing is charged\.)$/
    );
  const settledAlert = () =>
    dialog().getByText("Already paid or billed.", { exact: false });
  /** The set's "Revenue $A − cost $B = $C margin (P%)". */
  const marginLine = () =>
    dialog().getByText(/^Revenue \$[\d.,]+ − cost \$[\d.,]+ = /);
  const confirmButton = () =>
    dialog().getByRole("button", {
      name: /^(Finalise & charge|Send for approval|Place with suppliers)$/,
    });

  const fillVendorSection = async (opts: {
    vendor: string;
    vendorShipping: number;
    ref?: string;
  }) => {
    await vendorInput().fill(opts.vendor);
    await vendorShipping().fill(String(opts.vendorShipping));
    if (opts.ref) await vendorRef().fill(opts.ref);
  };

  /** Submit the dialog and return the finalise response body. */
  const submitFinalise = async () => {
    const finalised = page.waitForResponse(
      (r) =>
        /\/api\/admin\/supply-shop\/finalise$/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await confirmButton().click();
    const res = await finalised;
    expect(res.ok(), `finalise → ${res.status()}`).toBeTruthy();
    await expect(dialog()).toBeHidden();
    return (await res.json()) as {
      message?: string;
      data: {
        state: "PLACED" | "AWAITING_APPROVAL" | "AWAITING_PAYMENT";
        chargeId: string | null;
        total: number;
        ceiling: number | null;
        hostedPaymentUrl?: string | null;
        giftCardBatchIds: Record<string, string>;
      };
    };
  };

  const cancelDialog = async () => {
    await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog()).toBeHidden();
  };

  /** The page's success notice: after a finalise, the server's own summary. */
  const notice = (text: string) => page.getByText(text, { exact: true });

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
    /** Resolves once no queue/history list call is in flight (e.g. the refresh after a dialog's Done). */
    waitForList: listCallsSettled,
    selectHistoryStatus,
    row,
    rowChip,
    dialog,
    openRowMenu,
    menuItem,
    menuItems,
    closeRowMenu,
    rowAction,
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
    openFinalise,
    proofPendingBanner,
    compSwitch,
    noChargeChip,
    finalUnit,
    unitCost,
    shippingCharged,
    vendorInput,
    vendorShipping,
    vendorTax,
    vendorRef,
    ceilingLine,
    aboveCeilingWarning,
    willChargeAlert,
    settledAlert,
    marginLine,
    confirmButton,
    fillVendorSection,
    submitFinalise,
    cancelDialog,
    notice,
    downloadCardExport,
  };
};

export type AdminSupplyShopPage = ReturnType<typeof createAdminSupplyShopPage>;
