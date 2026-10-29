import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Owner — Print Shop tab (`?tab=supply-shop`): the catalog ("Browse"), the
 * brief form a product opens into, the cart ("Your cart") and "My orders"
 * with its proof dialog.
 *
 * Money never moves here. The brief form shows an ESTIMATE range (EN DASH)
 * and ends in "Add to cart"; the cart repeats the range, holds the payment
 * choice (card on file / next RestauNax bill) and "Place order", which makes
 * a basket (SupplyCheckout, SC-YYYY-NNNN) whose lines land in "We're designing
 * it" (RestauNax #1072). My orders groups lines by basket: each basket is a
 * collapsible card titled "Order SC-…" (an order with no basket is titled by
 * its own number), and each line inside carries its order number, a status
 * chip and a stepper. The brief form has no data-testids; ids on the MUI
 * fields are stable (`#supply-message`, `#supply-quantity`) and everything
 * else is by role/name.
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

  /** The brief form's notice ("…charge the accurate amount when it goes to print"). */
  const notChargedNowAlert = () =>
    page.getByText("You won't be charged now", { exact: false });

  const addToCartButton = () =>
    page.getByRole("button", { name: "Add to cart", exact: true });

  /** "Add to cart" and wait for the line to land in the cart. */
  const addToCart = async () => {
    const added = page.waitForResponse(
      (r) =>
        /\/api\/supply-shop\/cart\/items$/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await addToCartButton().click();
    const res = await added;
    expect(res.ok(), `add to cart → ${res.status()}`).toBeTruthy();
    await expect(
      page.getByText("Added to cart", { exact: true })
    ).toBeVisible();
  };

  // ── Cart ───────────────────────────────────────────────────────────────────
  /** The header's cart button: its accessible name carries the line count. */
  const cartButton = () =>
    page.getByRole("button", { name: /^Cart, \d+ items?$/ });

  const openCart = async () => {
    const loaded = page.waitForResponse(
      (r) =>
        /\/api\/supply-shop\/cart$/.test(r.url()) &&
        r.request().method() === "GET"
    );
    await cartButton().click();
    await expect(
      page.getByRole("heading", { name: "Your cart", exact: true })
    ).toBeVisible();
    await loaded;
  };

  /** One cart line (an outlined card) by its product name. */
  const cartLine = (productName: string) =>
    page
      .locator(".MuiCard-root")
      .filter({ hasText: productName })
      .filter({ has: page.getByRole("button", { name: "Remove" }) });

  /** The cart summary's "Estimated total" value. */
  const cartTotal = () =>
    page
      .getByText("Estimated total", { exact: true })
      .locator("xpath=following-sibling::*[1]");

  /** The cart's notice: "…one final invoice when we place your order." */
  const cartNotChargedAlert = () =>
    page.getByText("You'll get one final invoice when we place your order", {
      exact: false,
    });

  /** The payment choice lives on the cart page now, not the brief form. */
  const paymentRadio = (
    label: "Charge the card on file" | "Add it to my next RestauNax bill"
  ) => page.getByRole("radio", { name: label });

  const placeButton = () =>
    page.getByRole("button", { name: "Place order", exact: true });

  /**
   * Place order (checkout) and wait for the basket to come back. Lands on
   * My orders with the new basket open; returns the checkout answer.
   */
  const placeOrder = async () => {
    const checkout = page.waitForResponse(
      (r) =>
        /\/api\/supply-shop\/cart\/checkout$/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await placeButton().click();
    const res = await checkout;
    expect(res.ok(), `checkout → ${res.status()}`).toBeTruthy();
    await expect(ordersTab()).toHaveAttribute("aria-selected", "true");
    return (await res.json()) as {
      data: {
        checkout: { id: string; checkoutNumber: string } | null;
        placed: string[];
        failed: { orderId: string; code: string }[];
      };
    };
  };

  // ── My orders ──────────────────────────────────────────────────────────────
  /** Open My orders and wait for the list (it is fetched when the tab mounts). */
  const openOrders = async () => {
    if ((await ordersTab().getAttribute("aria-selected")) !== "true") {
      const loaded = page.waitForResponse(
        (r) =>
          /\/api\/supply-shop\/orders$/.test(r.url()) &&
          r.request().method() === "GET"
      );
      await ordersTab().click();
      await loaded;
    }
    await expect(ordersTab()).toHaveAttribute("aria-selected", "true");
  };

  /** A basket card by its title: "Order SC-…", or an unbasketed order's number. */
  const basket = (title: string): Locator =>
    page
      .locator(".MuiPaper-outlined")
      .filter({ has: page.getByText(title, { exact: true }) });

  /**
   * One line of a basket. The line is the innermost block holding both its
   * order number and its stepper; every ancestor holds them too and comes
   * earlier in document order, so `.last()` is the line itself.
   */
  const orderLine = (orderNumber: string): Locator =>
    page
      .locator("div")
      .filter({ hasText: orderNumber })
      .filter({ has: page.locator(".MuiStepper-root") })
      .last();

  /** The line's one status chip, in owner words ("We're designing it", "Ordered"…). */
  const statusChip = (orderNumber: string) =>
    orderLine(orderNumber).locator(".MuiChip-label");

  const reviewProof = async (orderNumber: string) => {
    await orderLine(orderNumber)
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

  /** The line's own pay button while it waits on the owner's card. */
  const payNowLink = (orderNumber: string) =>
    orderLine(orderNumber).getByRole("link", {
      name: /^Pay \$[\d.,]+ to print$/,
    });

  /** The basket's "Finish payment": the charge's hosted page, one per basket. */
  const finishPaymentLink = (basketTitle: string) =>
    basket(basketTitle).getByRole("link", { name: "Finish payment" });

  /** The ⋮ menu on a line — print file and cancel live there, not as buttons. */
  const openRowMenu = async (orderNumber: string) => {
    await orderLine(orderNumber)
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
    addToCartButton,
    addToCart,
    cartButton,
    openCart,
    cartLine,
    cartTotal,
    cartNotChargedAlert,
    paymentRadio,
    placeButton,
    placeOrder,
    openOrders,
    basket,
    orderLine,
    statusChip,
    reviewProof,
    dialog,
    approveProof,
    requestChanges,
    payNowLink,
    finishPaymentLink,
    openRowMenu,
    cancelOrder,
  };
};

export type OwnerSupplyShopPage = ReturnType<typeof createOwnerSupplyShopPage>;
