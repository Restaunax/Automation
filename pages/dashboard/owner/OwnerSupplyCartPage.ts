import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Owner — Print Shop, the parts the cart added (RestauNax #1072/#1075/#1100):
 * a not-yet-launched product's one-click "Request a quote" on its catalog
 * card, the Table QR cards builder (with its optional photo and follow-us
 * code, and no free print file since the print-builders release), and the
 * cart.
 *
 * Every name the cart shows arrives translated from the server; the builder
 * and catalog read the frontend's EN bundle. MUI cards carry no test ids, so
 * a product's card is found by its title (a MUI subtitle1, rendered as h6).
 */
export const createOwnerSupplyCartPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=supply-shop`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByRole("tab", { name: "Browse" })).toBeVisible({
      timeout: 20_000,
    });
  };

  // ── Catalog ────────────────────────────────────────────────────────────────
  /** The whole catalog card (picture, text and the quote button below it). */
  const catalogCard = (name: string): Locator =>
    page
      .locator(".MuiCard-root")
      .filter({ has: page.getByRole("heading", { name, exact: true }) })
      .first();

  const quoteButton = (name: string): Locator =>
    catalogCard(name).getByRole("button", {
      name: /^(Request a quote|Requested)$/,
    });

  /**
   * The quote button lies wholly inside its card. It used to be pushed past
   * the card's clipped bottom edge (RestauNax #1097).
   */
  const expectQuoteButtonInsideCard = async (name: string) => {
    const card = await catalogCard(name).boundingBox();
    const button = await quoteButton(name).boundingBox();
    expect(card, `${name}: card has a box`).not.toBeNull();
    expect(button, `${name}: quote button has a box`).not.toBeNull();
    const c = card!;
    const b = button!;
    expect(b.y, `${name}: button top inside the card`).toBeGreaterThanOrEqual(
      c.y
    );
    expect(
      b.y + b.height,
      `${name}: button bottom inside the card`
    ).toBeLessThanOrEqual(c.y + c.height + 0.5);
    expect(b.x + b.width).toBeLessThanOrEqual(c.x + c.width + 0.5);
  };

  const openProduct = async (name: string) => {
    await catalogCard(name).locator(".MuiCardActionArea-root").click();
  };

  // ── Table QR cards builder ─────────────────────────────────────────────────
  const sameCardMode = () =>
    page.getByRole("radio", { name: "Same card on every table" });
  const sameCount = () => page.locator("#tableqr-same-count");
  /** A format tile (role radio) by its name, e.g. "Card in a clear stand". */
  const formatTile = (name: string) =>
    page.getByRole("radio").filter({ hasText: name });
  const standsIncluded = () =>
    page
      .getByRole("alert")
      .filter({ hasText: "A clear stand comes with each card" });
  const standsQuestion = () => page.getByText("Need stands for these?");
  const addToCartButton = () =>
    page.getByRole("button", { name: "Add to cart", exact: true });

  /** "Same card on every table" × `count`, in `format`. */
  const chooseSameCards = async (count: number, format: string) => {
    await sameCardMode().check();
    await sameCount().fill(String(count));
    await sameCount().blur();
    await formatTile(format).click();
    await expect(formatTile(format)).toHaveAttribute("aria-checked", "true");
  };

  /** Add to cart, wait for the server, then open the cart from the snackbar. */
  const addToCartAndOpenCart = async () => {
    const added = page.waitForResponse(
      (r) =>
        /\/table-qr-cards\/cart$/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await addToCartButton().click();
    const res = await added;
    expect(res.ok(), `add to cart → ${res.status()}`).toBeTruthy();
    await page.getByRole("button", { name: "View cart" }).click();
    await expect(
      page.getByRole("heading", { name: "Your cart" })
    ).toBeVisible();
  };

  // ── Builder: proof only, ordered to print ──────────────────────────────────
  const actionsTitle = () =>
    page.getByText("Check and order your cards", { exact: true });
  const previewPdfButton = () =>
    page.getByRole("button", { name: "Preview PDF", exact: true });
  /** Gone since the print-builders release: owners order their cards. */
  const selfPrintButton = () =>
    page.getByRole("button", { name: "Download and print myself" });
  const orderToPrintNote = () =>
    page.getByText(
      "Table QR cards are printed by RestauNax: order them below and we'll ship them to you.",
      { exact: true }
    );

  // ── Builder: photo and follow code (optional) ──────────────────────────────
  const extrasTitle = () =>
    page.getByText("Photo and follow code (optional)", { exact: true });
  const addPhotoButton = () =>
    page.getByRole("button", { name: "Add a photo", exact: true });
  /** The photo picker side sheet's two sources. */
  const photoSourceTab = (name: "Your photos" | "Menu items") =>
    page.getByRole("tab", { name, exact: true });
  const menuSearch = () => page.getByLabel("Search your menu");
  const closePhotoPicker = () =>
    page.getByRole("button", { name: "Cancel", exact: true }).click();
  const followSwitch = () =>
    page.getByRole("switch", { name: "Add a follow-us code" });
  /** A platform toggle; its name carries the handle or "Not added yet". */
  const platformToggle = (platform: "Instagram" | "Facebook" | "TikTok") =>
    page.getByRole("button", { name: new RegExp(`^${platform}\\b`) });
  const followLinkInput = () => page.locator("#follow-link");
  const saveFollowLinkButton = () =>
    page.getByRole("button", { name: "Save", exact: true });

  // ── Cart ───────────────────────────────────────────────────────────────────
  /** One cart line's card, by the start of its name. */
  const cartLine = (namePrefix: string): Locator =>
    page
      .locator(".MuiCard-root")
      .filter({
        has: page.getByText(new RegExp(`^${namePrefix}`), { exact: false }),
      })
      .first();

  return {
    goto,
    catalogCard,
    quoteButton,
    expectQuoteButtonInsideCard,
    openProduct,
    sameCardMode,
    sameCount,
    formatTile,
    standsIncluded,
    standsQuestion,
    addToCartButton,
    chooseSameCards,
    addToCartAndOpenCart,
    actionsTitle,
    previewPdfButton,
    selfPrintButton,
    orderToPrintNote,
    extrasTitle,
    addPhotoButton,
    photoSourceTab,
    menuSearch,
    closePhotoPicker,
    followSwitch,
    platformToggle,
    followLinkInput,
    saveFollowLinkButton,
    cartLine,
  };
};

export type OwnerSupplyCartPage = ReturnType<typeof createOwnerSupplyCartPage>;
