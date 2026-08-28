import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Owner — Print Shop tab (`?tab=supply-shop`): the catalog ("Browse"), the
 * brief form a product opens into, and "My orders" with its proof dialog.
 *
 * Money never moves here: the place button reads an ESTIMATE ("Place order —
 * est. $A – $B", EN DASH) and the order lands in "We're designing it". The
 * brief form has no data-testids; ids on the MUI fields are stable
 * (`#supply-message`, `#supply-quantity`) and everything else is by role/name.
 */
export const createOwnerSupplyShopPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=supply-shop`,
      { waitUntil: "domcontentloaded" }
    );
    await drawer().waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.getByRole("tab", { name: "Browse" })).toBeVisible();
  };

  const browseTab = () => page.getByRole("tab", { name: "Browse" });
  const ordersTab = () => page.getByRole("tab", { name: "My orders" });

  // ── Browse ─────────────────────────────────────────────────────────────────
  /** The clickable product card (a MUI CardActionArea) titled `name`. */
  const productCard = (name: string) =>
    page
      .locator(".MuiCardActionArea-root")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });

  const openProduct = async (name: string) => {
    await browseTab().click();
    await productCard(name).first().click();
    await expect(
      page.getByRole("heading", { name, exact: true })
    ).toBeVisible();
    await expect(messageInput()).toBeVisible();
  };

  // ── Brief form ─────────────────────────────────────────────────────────────
  const messageInput = () => page.locator("#supply-message");
  const quantitySelect = () => page.locator("#supply-quantity");

  /** Pick a quantity by the START of its option label, e.g. /^100 — /. */
  const selectQuantity = async (optionLabel: RegExp) => {
    await quantitySelect().click();
    await page.getByRole("option", { name: optionLabel }).click();
  };

  /** "Subtotal" / "Shipping" / "Estimated total" value cell on the estimate card. */
  const estimateValue = (label: "Subtotal" | "Shipping" | "Estimated total") =>
    page
      .locator("div, p, span")
      .filter({ hasText: new RegExp(`^${label}$`) })
      .first()
      .locator("xpath=following-sibling::*[1]");

  const notChargedNowAlert = () =>
    page.getByText("You won't be charged now", { exact: false });

  const paymentRadio = (
    label: "Charge the card on file" | "Add it to my next RestauNax invoice"
  ) => page.getByRole("radio", { name: label });

  const placeButton = () =>
    page.getByRole("button", { name: /^Place (order — est\. |my order)/ });

  /** Click Place order and wait for the commit call to land. */
  const placeOrder = async () => {
    const commit = page.waitForResponse(
      (r) =>
        /\/api\/supply-shop\/orders\/[^/]+\/commit$/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await placeButton().click();
    const res = await commit;
    expect(res.ok(), `commit → ${res.status()}`).toBeTruthy();
    await expect(ordersTab()).toHaveAttribute("aria-selected", "true");
  };

  // ── My orders ──────────────────────────────────────────────────────────────
  const openOrders = async () => {
    await ordersTab().click();
    await expect(
      page.getByRole("columnheader", { name: "Order" })
    ).toBeVisible();
  };

  const orderRow = (orderNumber: string): Locator =>
    page.getByRole("row").filter({ hasText: orderNumber });

  const statusChip = (orderNumber: string) =>
    orderRow(orderNumber).locator(".MuiChip-label");

  const reviewProof = async (orderNumber: string) => {
    await orderRow(orderNumber)
      .getByRole("button", { name: "Review proof" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    // Buttons enable once the proof GET returns.
    await expect(
      dialog().getByRole("button", { name: "Looks good" })
    ).toBeEnabled();
  };

  const dialog = () => page.getByRole("dialog");

  const approveProof = async () => {
    await dialog().getByRole("button", { name: "Looks good" }).click();
    await expect(dialog()).toBeHidden();
  };

  const requestChanges = async (note: string) => {
    await dialog().getByRole("button", { name: "I'd like changes" }).click();
    await dialog().locator("#supply-revision-note").fill(note);
    await dialog()
      .getByRole("button", { name: "Send to our designer" })
      .click();
    await expect(dialog()).toBeHidden();
  };

  const payNowLink = (orderNumber: string) =>
    orderRow(orderNumber).getByRole("link", {
      name: /^Pay \$[\d.,]+ to print$/,
    });

  /** The ⋮ menu on a row — print file and cancel live there, not as buttons. */
  const openRowMenu = async (orderNumber: string) => {
    await orderRow(orderNumber)
      .getByRole("button", { name: "More actions" })
      .click();
    await expect(page.getByRole("menu")).toBeVisible();
  };

  const cancelOrder = async (orderNumber: string) => {
    await openRowMenu(orderNumber);
    await page.getByRole("menuitem", { name: "Cancel", exact: true }).click();
    await expect(dialog()).toContainText("Cancel this order?");
    // The confirm dialog's affirmative button — the destructive one.
    await dialog()
      .getByRole("button", { name: /^(Cancel order|Yes|Confirm)/ })
      .or(dialog().getByRole("button").last())
      .first()
      .click();
    await expect(dialog()).toBeHidden();
  };

  return {
    goto,
    browseTab,
    ordersTab,
    productCard,
    openProduct,
    messageInput,
    quantitySelect,
    selectQuantity,
    estimateValue,
    notChargedNowAlert,
    paymentRadio,
    placeButton,
    placeOrder,
    openOrders,
    orderRow,
    statusChip,
    reviewProof,
    dialog,
    approveProof,
    requestChanges,
    payNowLink,
    openRowMenu,
    cancelOrder,
  };
};

export type OwnerSupplyShopPage = ReturnType<typeof createOwnerSupplyShopPage>;
