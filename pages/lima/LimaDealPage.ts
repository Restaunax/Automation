import { type Page, type Locator, expect } from "@playwright/test";

import { LIMA_ORDERING_URL } from "../../utils/testData";

/**
 * Template Lima — deal surfaces (guided deal choices, template-lima
 * feat/deal-choice-ux; spec restaunax
 * docs/superpowers/specs/2026-10-17-deal-choice-guidance-design.md):
 *
 * - /<slug>/menu → DealsSection "Today's Deals" (renders nothing when /active
 *   is empty). DealCard = MUI Card: h3 deal name, "Includes:" chips, "View
 *   Deal" → /<slug>/deal/<id>.
 * - Builder (DealBuilderPage): DealBuilderHeader h4 name; intro
 *   data-testid="deal-intro" ("Pick one option in each step, then add to
 *   cart." / "Everything below is included."); numbered steps in sortOrder
 *   (a BOGO groups them under "You buy" / "You get …"). Every step root is
 *   role="group" named by its h2 heading. A pick step is
 *   data-testid="deal-choice-slot" holding a radiogroup named by the heading
 *   ("Pick 1: A or B", "Pick 1 from Gyros", "… (1 of 2)"); each option is
 *   role="radio" named "<item>, <Included | +$x | Sold out today>" with
 *   aria-checked and an explicit aria-disabled. A fixed item is
 *   data-testid="deal-fixed-step" (heading "<item>" / "2 × <item>").
 *   data-testid="deal-step-status": "Required" → "✓ Done" / "✓ Included".
 *   An item with options shows data-testid="deal-step-customize" ("Choose
 *   options" when required, else "Customize"); its item modal's
 *   data-testid="add-to-cart" reads "Done" and adds nothing to the cart.
 * - Sticky bar (DealStepsBar): deal-progress ("{x} of {y} steps done" →
 *   "All set"), deal-bar-price, deal-add-to-cart ("Add deal to cart · $x").
 *   Opening the deal adds NOTHING; the deal reaches the cart only on that
 *   Add. An incomplete Add shows role="alert" "Pick one to continue." in the
 *   first unfinished step (focused). After the Add: deal-keep-shopping
 *   ("Keep shopping" → /menu) and "View Cart" → /<slug>/cart.
 * - Cart / checkout summary: a complete deal's "Edit" (data-testid
 *   "cart-deal-edit", aria-label "Edit <deal name>") reopens the builder.
 * - Plan 4 hooks (deal scheduling): data-testid deal-schedule-summary and
 *   deal-availability-label inside the card.
 */
export const createLimaDealPage = (page: Page) => {
  /**
   * Open a deal's builder directly: /<slug>/deal/<id>, with ?code= for a
   * CODE-only deal (the builder cannot load one without its code).
   */
  const gotoBuilder = async (slug: string, dealId: string, code?: string) => {
    const query = code ? `?code=${encodeURIComponent(code)}` : "";
    await page.goto(`${LIMA_ORDERING_URL}/${slug}/deal/${dealId}${query}`, {
      waitUntil: "domcontentloaded",
    });
  };

  const todaysDealsHeading = () =>
    page.getByRole("heading", { name: "Today's Deals" });

  const dealCard = (dealName: string): Locator =>
    page
      .locator(".MuiCard-root")
      .filter({
        has: page.getByRole("heading", { name: dealName, exact: true }),
      })
      .filter({ has: page.getByRole("button", { name: "View Deal" }) })
      .first();

  const viewDeal = (dealName: string) =>
    dealCard(dealName).getByRole("button", { name: "View Deal" }).click();

  const builderHeading = (dealName: string) =>
    page.getByRole("heading", { name: dealName, exact: true }).first();

  // ── Steps ──────────────────────────────────────────────────────────────
  /** Pick steps only, in display order (each repeated unit is its own step). */
  const choiceSlots = (): Locator => page.getByTestId("deal-choice-slot");
  /**
   * A pick step's option radio by item name (its accessible name is
   * "<item>, <Included | +$x | Sold out today>", wind appends ", Selected").
   */
  const choiceCard = (slot: number, itemName: string): Locator =>
    choiceSlots()
      .nth(slot)
      .getByRole("radio", { name: new RegExp(`^${escapeRe(itemName)}, `) });
  /** "Required" → "✓ Done" on a pick step. */
  const stepStatus = (slot: number): Locator =>
    choiceSlots().nth(slot).getByTestId("deal-step-status");
  /** "Pick one to continue." after an incomplete Add, in the first unfinished step. */
  const stepError = (slot: number): Locator =>
    choiceSlots().nth(slot).getByRole("alert");
  const allFixedSteps = (): Locator => page.getByTestId("deal-fixed-step");
  /**
   * Fixed-item steps for an item (a fixed line of 2 is ONE step headed
   * "2 × <item>"; the same item on two lines is two steps).
   */
  const fixedSteps = (itemName: string): Locator =>
    allFixedSteps().filter({
      has: page.getByText(itemName, { exact: true }),
    });
  /** A step's "Choose options" (the item needs options) / "Customize" button. */
  const customizeButton = (step: Locator): Locator =>
    step.getByTestId("deal-step-customize");

  /**
   * The steps are rendered and the menus are in: every fixed item has its
   * default pick ("✓ Included", or "Required" with "Choose options"). Before
   * the menus load a fixed step reads "Required" with no button.
   */
  const waitForSteps = async () => {
    await expect(choiceSlots().or(allFixedSteps()).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      allFixedSteps()
        .filter({
          has: page.getByTestId("deal-step-status").getByText("Required"),
        })
        .filter({ hasNot: page.getByTestId("deal-step-customize") })
    ).toHaveCount(0, { timeout: 15_000 });
  };

  // ── Item modal (deal mode) ────────────────────────────────────────────
  /** The item modal's confirm (data-testid="add-to-cart") — reads "Done" in deal mode and adds nothing to the cart. */
  const doneButton = (): Locator =>
    page.getByTestId("add-to-cart").filter({ hasText: /^Done$/ });
  let modalExpected = false;
  /** Press the item modal's Done — a no-op when no modal was opened. */
  const clickAddToDeal = async () => {
    if (!modalExpected && !(await doneButton().isVisible())) return;
    modalExpected = false;
    await expect(doneButton()).toBeVisible({ timeout: 15_000 });
    await doneButton().click();
    await expect(doneButton()).toBeHidden({ timeout: 10_000 });
  };

  /**
   * Pick `itemName` in pick step `slot` (0-based, display order). Clicking an
   * item that needs options opens its modal by itself; it is confirmed with
   * Done. `customize` (pick a size, tick paid extras, …) runs with the modal
   * open — opened through the step's "Customize" when the click did not open
   * it — then Done.
   */
  const pickChoice = async (
    slot: number,
    itemName: string,
    customize?: () => Promise<void>
  ) => {
    const step = choiceSlots().nth(slot);
    const card = choiceCard(slot, itemName);
    await expect(card).toHaveAttribute("aria-disabled", "false", {
      timeout: 15_000,
    });
    await card.click();
    await expect(card).toHaveAttribute("aria-checked", "true");
    // Settles one way: the modal opens (the item needs options), or the step
    // reads "✓ Done" (it does not).
    const stepDone = step
      .getByTestId("deal-step-status")
      .filter({ hasText: /^✓ Done$/ });
    await expect(doneButton().or(stepDone)).toBeVisible({ timeout: 15_000 });
    const opened = await doneButton().isVisible();
    if (customize) {
      if (!opened) await customizeButton(step).click();
      await expect(doneButton()).toBeVisible({ timeout: 15_000 });
      await customize();
    }
    if (opened || customize) {
      modalExpected = true;
      await clickAddToDeal();
    }
  };

  /**
   * A fixed item's options: its "Choose options" / "Customize" opens the
   * modal (follow with clickAddToDeal). The item itself is already included,
   * so for an item without options this is a no-op (and so is the
   * clickAddToDeal after it).
   */
  const openIncompleteSlot = async (itemName: string) => {
    await waitForSteps();
    const step = fixedSteps(itemName).first();
    await expect(step).toBeVisible({ timeout: 15_000 });
    const button = customizeButton(step);
    if ((await button.count()) === 0) return;
    await button.click();
    modalExpected = true;
  };

  /** Every fixed item that still needs options: open it and confirm its defaults with Done. */
  const completeFixedSteps = async () => {
    await waitForSteps();
    const pending = allFixedSteps().filter({
      has: page.getByTestId("deal-step-customize").filter({
        hasText: /^Choose options$/,
      }),
    });
    for (let guard = 0; guard < 10 && (await pending.count()) > 0; guard++) {
      await customizeButton(pending.first()).click();
      modalExpected = true;
      await clickAddToDeal();
    }
    await expect(pending).toHaveCount(0);
  };

  // ── Bar ────────────────────────────────────────────────────────────────
  const progress = (): Locator => page.getByTestId("deal-progress");
  /**
   * "{done} of {total} steps done", or "All set" once done = total. Only
   * steps that ask for something count: every pick step, and a fixed item
   * that needs options.
   */
  const assertProgress = (done: number, total: number) =>
    expect(progress()).toHaveText(
      done >= total ? "All set" : `${done} of ${total} steps done`,
      { timeout: 15_000 }
    );
  const assertDealComplete = () =>
    expect(progress()).toHaveText("All set", { timeout: 15_000 });
  /** "Add deal to cart · $x" — the only control that puts the deal in the cart. */
  const addDealToCartButton = (): Locator =>
    page.getByTestId("deal-add-to-cart");
  /** After the Add: "Keep shopping" (absent until the deal is added). */
  const keepShoppingButton = (): Locator =>
    page.getByTestId("deal-keep-shopping");
  /** After the Add: "View Cart" (no test id). */
  const viewCartButton = (): Locator =>
    page.getByRole("button", { name: "View Cart", exact: true });
  /** The ONE Add of a complete deal: the deal goes to the cart; Keep shopping / View Cart appear. */
  const addDealToCart = async () => {
    await expect(addDealToCartButton()).toHaveText(/^Add deal to cart · \$/, {
      timeout: 15_000,
    });
    await addDealToCartButton().click();
    await expect(keepShoppingButton()).toBeVisible({ timeout: 15_000 });
  };
  /** The bar's price ("$14.98"): one bundle of the current picks. */
  const progressDealPrice = (): Locator => page.getByTestId("deal-bar-price");

  /** A complete deal's "Edit" in the cart / checkout summary (back to its builder, pre-filled). */
  const cartDealEditButton = (dealName: string): Locator =>
    page
      .getByTestId("cart-deal-edit")
      .and(page.getByLabel(`Edit ${dealName}`, { exact: true }));

  const cardScheduleSummary = (dealName: string) =>
    dealCard(dealName).getByTestId("deal-schedule-summary");
  const cardAvailabilityLabel = (dealName: string) =>
    dealCard(dealName).getByTestId("deal-availability-label");

  return {
    gotoBuilder,
    todaysDealsHeading,
    dealCard,
    viewDeal,
    builderHeading,
    choiceSlots,
    choiceCard,
    stepStatus,
    stepError,
    fixedSteps,
    doneButton,
    addToDealButton: doneButton,
    clickAddToDeal,
    pickChoice,
    openIncompleteSlot,
    completeFixedSteps,
    assertProgress,
    assertStepsDone: assertProgress,
    assertDealComplete,
    addDealToCartButton,
    addDealToCart,
    keepShoppingButton,
    viewCartButton,
    progressDealPrice,
    cartDealEditButton,
    cardScheduleSummary,
    cardAvailabilityLabel,
  };
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type LimaDealPage = ReturnType<typeof createLimaDealPage>;
