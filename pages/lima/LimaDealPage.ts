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
 *   Identical fixed items next to each other in the same role are ONE step
 *   "{qty} × {name}" (spec §13 — the server stores "2 burgers" as two
 *   DealItem rows). When that item has options the step lists one row per
 *   unit instead of a step-level Customize: data-testid="deal-step-units"
 *   (ul) → "deal-step-unit" (li, data-unit-key="<dealItemId>:<i>") with
 *   "deal-step-unit-label" ("Burger 2"), "deal-step-unit-options" (option
 *   names; absent while unchanged or still needed), "deal-step-unit-price"
 *   ("+$1.50" / "Included") and "deal-step-unit-customize" (button
 *   "Customize" / "Choose options", accessible name "Customize Burger 2" /
 *   "Choose options for Burger 2"; disabled while the item is sold out). An
 *   item without options has no rows. An Add with a unit's required options
 *   missing says "Choose options for Burger 2" and focuses that unit's
 *   button.
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
   * Fixed-item steps for an item, by their heading: "<item>", or
   * "{qty} × <item>" for identical units grouped into one step (spec §13 —
   * the backend stores "2 of <item>" as two quantity-1 rows, and the page
   * shows them as ONE step "2 × <item>").
   */
  const fixedSteps = (itemName: string): Locator =>
    allFixedSteps().filter({
      has: page.getByRole("heading", {
        name: new RegExp(`^(\\d+ × )?${escapeRe(itemName)}$`),
      }),
    });
  /** A step's "Choose options" (the item needs options) / "Customize" button. */
  const customizeButton = (step: Locator): Locator =>
    step.getByTestId("deal-step-customize");
  /** Any options button on a step: the step's own, or a unit row's. */
  const anyCustomizeButton = (): Locator =>
    page.locator(
      '[data-testid="deal-step-customize"], [data-testid="deal-step-unit-customize"]'
    );

  // ── "{qty} × {name}" steps: one row per unit (spec §13) ────────────────
  /** A step (pick or fixed) by its exact heading, e.g. "2 × Burger". */
  const stepByHeading = (heading: string): Locator =>
    page
      .locator(
        '[data-testid="deal-choice-slot"], [data-testid="deal-fixed-step"]'
      )
      .and(page.getByRole("group", { name: heading, exact: true }));
  /** The role="alert" of a step after an incomplete Add ("Choose options for Burger 2"). */
  const stepAlert = (heading: string): Locator =>
    stepByHeading(heading).getByRole("alert");
  /** The unit rows of a "{qty} × {name}" step (none when the item has no options). */
  const unitRows = (stepHeading: string): Locator =>
    stepByHeading(stepHeading).getByTestId("deal-step-unit");
  /** Unit `unit` (1-based — the n of its "<item> n" label) of a step. */
  const unitRow = (stepHeading: string, unit: number): Locator =>
    unitRows(stepHeading).nth(unit - 1);
  /** A unit row by its data-unit-key ("<dealItemId>:<i>"). */
  const unitRowByKey = (unitKey: string): Locator =>
    page
      .getByTestId("deal-step-unit")
      .and(page.locator(`[data-unit-key="${unitKey}"]`));
  /** "<item> n". */
  const unitLabel = (stepHeading: string, unit: number): Locator =>
    unitRow(stepHeading, unit).getByTestId("deal-step-unit-label");
  /** The unit's option names (absent while unchanged, or while still needed). */
  const unitOptions = (stepHeading: string, unit: number): Locator =>
    unitRow(stepHeading, unit).getByTestId("deal-step-unit-options");
  /** "+$1.50", or "Included" while the unit's options add nothing. */
  const unitPrice = (stepHeading: string, unit: number): Locator =>
    unitRow(stepHeading, unit).getByTestId("deal-step-unit-price");
  /** The unit's "Customize" / "Choose options" button. */
  const unitCustomizeButton = (stepHeading: string, unit: number): Locator =>
    unitRow(stepHeading, unit).getByTestId("deal-step-unit-customize");
  /** The unit's option names, or null when the row shows none. */
  const readUnitOptions = async (
    stepHeading: string,
    unit: number
  ): Promise<string | null> => {
    const el = unitOptions(stepHeading, unit);
    return (await el.count()) > 0 ? (await el.innerText()).trim() : null;
  };
  /** The unit's price label ("Included" / "+$1.50"). */
  const readUnitPrice = async (
    stepHeading: string,
    unit: number
  ): Promise<string> => (await unitPrice(stepHeading, unit).innerText()).trim();

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
        .filter({ hasNot: anyCustomizeButton() })
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
    // Settles one way: the modal opens (the item needs options), or the step
    // reads "✓ Done" (it does not). The card's aria-checked is asserted at the
    // END: while the options modal is open MUI hides the page behind it from
    // the accessibility tree, so the radio cannot be found by role until the
    // modal closes (a check here raced the modal and failed when it won).
    const stepDone = step
      .getByTestId("deal-step-status")
      .filter({ hasText: /^✓ Done$/ });
    // Both can show at once (the step reads "✓ Done" while the modal animates
    // in): `.first()` keeps the wait from failing on strict mode.
    await expect(doneButton().or(stepDone).first()).toBeVisible({
      timeout: 15_000,
    });
    let opened = await doneButton().isVisible();
    // A pointer pick on an item with ANY options (optional add-ons included)
    // opens the item modal (lima guided deal page, 2026-10-17), and the step
    // already reads "✓ Done" as the modal animates in. With `customize` the
    // item has options, so give the modal its moment before falling back to
    // the step's Customize button (which the open modal would block).
    if (!opened && customize) {
      opened = await doneButton()
        .waitFor({ state: "visible", timeout: 5_000 })
        .then(
          () => true,
          () => false
        );
    }
    if (customize) {
      if (!opened) await customizeButton(step).click();
      await expect(doneButton()).toBeVisible({ timeout: 15_000 });
      await customize();
    }
    if (opened || customize) {
      modalExpected = true;
      await clickAddToDeal();
    }
    await expect(card).toHaveAttribute("aria-checked", "true");
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
    if ((await button.count()) === 0) {
      // A "{qty} × {name}" step with options has a button per unit, never
      // one for the step: say so rather than silently skip the options.
      if ((await step.getByTestId("deal-step-unit").count()) > 0)
        throw new Error(
          `"${itemName}" is a "{qty} × {name}" step with one row per unit — use customizeUnit(heading, n)`
        );
      return;
    }
    await button.click();
    modalExpected = true;
  };

  /**
   * Customise ONE unit of a "{qty} × {name}" step: its row's button opens the
   * item modal for that unit only. `customize` (tick an extra, pick a
   * required option, …) runs with the modal open, then Done; without it the
   * modal stays open for the caller (follow with clickAddToDeal).
   */
  const customizeUnit = async (
    stepHeading: string,
    unit: number,
    customize?: () => Promise<void>
  ) => {
    await waitForSteps();
    const button = unitCustomizeButton(stepHeading, unit);
    await expect(button).toBeEnabled({ timeout: 15_000 });
    await button.click();
    modalExpected = true;
    await expect(doneButton()).toBeVisible({ timeout: 15_000 });
    if (customize) {
      await customize();
      await clickAddToDeal();
    }
  };

  /**
   * Every fixed item (or unit of a "{qty} × {name}" step) that still needs
   * options: open it and confirm its defaults with Done.
   */
  const completeFixedSteps = async () => {
    await waitForSteps();
    const pending = allFixedSteps()
      .locator(anyCustomizeButton())
      .filter({ hasText: /^Choose options$/ });
    for (let guard = 0; guard < 10 && (await pending.count()) > 0; guard++) {
      await pending.first().click();
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
    allFixedSteps,
    fixedSteps,
    stepByHeading,
    stepAlert,
    unitRows,
    unitRow,
    unitRowByKey,
    unitLabel,
    unitOptions,
    unitPrice,
    unitCustomizeButton,
    readUnitOptions,
    readUnitPrice,
    customizeUnit,
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
