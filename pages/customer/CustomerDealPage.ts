import { type Page, type Locator, expect } from "@playwright/test";

// Single source of truth for the storefront host (defaults to the QA Template
// Wind storefront, wind.restaunax.com — NOT qa.restaunax.com, the marketing site).
import { TEMPLATE_WIND_URL } from "../../utils/testData";

/**
 * template-wind deal surfaces (verified in source + on QA 2026-08-18):
 *
 * - `/menu` → "Today's Deals" section (DealsSection.tsx; renders NOTHING when
 *   the public /active list is empty). Each DealCard: name, "Save X%" badge,
 *   "Includes:" chips "1x <item>", struck original + deal price, "View Deal"
 *   → /deals/<id>.
 * - `/deals/[dealId]` (the builder; guided deal choices, template-wind
 *   feat/deal-choice-ux, spec restaunax
 *   docs/superpowers/specs/2026-10-17-deal-choice-guidance-design.md):
 *   opening it adds NOTHING to the cart. DealBuilderHeader (h1 name, "Save
 *   X%", "You save $X.XX", "Available: <days>, <times>"); intro
 *   data-testid="deal-intro" ("Pick one option in each step, then add to
 *   cart." / "Everything below is included."); numbered steps in sortOrder
 *   (a BOGO groups them under h2 "You buy" / "You get …"). Every step root
 *   is role="group" named by its h2 heading. A pick step is
 *   data-testid="deal-choice-slot" holding a radiogroup named by the heading
 *   ("Pick 1: A or B", "Pick 1 from Gyros", "… (1 of 2)"); each option is
 *   role="radio" named "<item>, <Included | +$x | Sold out today>[,
 *   Selected]" with aria-checked and an explicit aria-disabled. A fixed item
 *   is data-testid="deal-fixed-step" (heading "<item>" / "2 × <item>").
 *   data-testid="deal-step-status": "Required" → "✓ Done" / "✓ Included".
 *   An item with options shows data-testid="deal-step-customize" ("Choose
 *   options" when required, else "Customize"); the ItemModal's
 *   data-testid="add-to-cart" reads "Done" and adds nothing to the cart.
 *   Identical fixed items next to each other in the same role are ONE step
 *   "{qty} × {name}" (spec §13 — the server stores "2 burgers" as two
 *   DealItem rows). When that item has options the step lists one row per
 *   unit instead of a step-level Customize: data-testid="deal-unit-rows"
 *   (ul) → "deal-unit-row" (li, data-unit-key="<dealItemId>:<i>") with
 *   "deal-unit-label" ("Burger 2"), "deal-unit-options" (option names;
 *   absent while unchanged or still needed), "deal-unit-price" ("+$1.50" /
 *   "Included") and "deal-unit-customize" (button "Customize" / "Choose
 *   options", accessible name "Customize Burger 2" / "Choose options for
 *   Burger 2"; not rendered while the item is sold out). An item without
 *   options has no rows. An Add with a unit's required options missing
 *   says "Choose options for Burger 2" (deal-step-error) and focuses that
 *   unit's button.
 *   Sticky bar (DealStepsBar): deal-progress ("{x} of {y} steps done" → "All
 *   set"), deal-bar-price, deal-add-to-cart ("Add deal to cart · $x") — the
 *   only way into the cart. An incomplete Add shows role="alert" "Pick one
 *   to continue." (data-testid="deal-step-error") in the first unfinished
 *   step. After the Add: deal-keep-shopping → /menu?dealAdded=<id> and
 *   "View Cart" → /checkout. An inactive / deleted / 86'd deal → "Deal not
 *   found" + "Return to Menu". Since deal scheduling (Plan 4) a deal that is
 *   off for now but on later today stays listed with deal-availability-label,
 *   inert step cards and a disabled Add.
 * - `/checkout` OrderSummary: claimed items say "Part of deal"; deal rows read
 *   "<qty>x <deal name>" (expandable to "1x <item> (+$x.xx)"); "You're saving
 *   $X.XX"; an "Items / Upgrades +$X.XX / Subtotal" build-up when a deal
 *   carries upgrades (CustomerCheckoutPage summary*Row); a complete deal
 *   has "Edit" (data-testid="cart-deal-edit", aria-label "Edit <deal
 *   name>"); the proceed button turns into "Complete Deals to Continue"
 *   while a (legacy, saved-cart) deal is incomplete.
 */
export const createCustomerDealPage = (page: Page) => {
  // Same ?restaurantId= QA override as every other customer route.
  // `code`: a CODE-only deal loads only with its code (?code=), the way the
  // redeem-code BUNDLE result opens it.
  const gotoBuilder = async (
    restaurantId: string,
    dealId: string,
    code?: string
  ) => {
    const q = new URLSearchParams({ restaurantId, ...(code ? { code } : {}) });
    await page.goto(`${TEMPLATE_WIND_URL}/deals/${dealId}?${q.toString()}`, {
      waitUntil: "domcontentloaded",
    });
  };

  // ── /menu "Today's Deals" ──────────────────────────────────────────────────
  const dealsSectionHeading = () =>
    page.getByRole("heading", { name: "Today's Deals" });
  /**
   * The DealCard for a deal name — its clickable root (DealCard.tsx: the
   * `rounded-xl cursor-pointer` div that holds the badge, the name and the
   * footer). Keyed on the root, not on the badge text: a BOGO / free-item
   * deal's badge is its offer label ("2nd for $1.99"), not "Save X%", and a
   * text filter that misses the card widens the match to the whole grid. Do
   * NOT require the "View Deal" button either: a deal that is not available
   * now shows its availability label instead.
   */
  const dealCard = (dealName: string) =>
    page
      .locator("div.cursor-pointer.rounded-xl")
      .filter({
        has: page.getByRole("heading", { name: dealName, exact: true }),
      })
      .last();
  /** Open the deal: its "View Deal" button, or — when the deal is not orderable now and has no button — the card itself. */
  const viewDeal = async (dealName: string) => {
    const button = dealCard(dealName).getByRole("button", {
      name: "View Deal",
    });
    if ((await button.count()) > 0) await button.click();
    else
      await dealCard(dealName)
        .getByRole("heading", { name: dealName, exact: true })
        .click();
  };

  // ── Builder ────────────────────────────────────────────────────────────────
  const builderHeading = (dealName: string) =>
    page.getByRole("heading", { name: dealName, exact: true, level: 1 });
  const saveBadge = () => page.getByText(/^Save \d+%$/).first();
  const youSaveChip = () => page.getByText(/^You save \$\d+\.\d{2}$/);
  const availabilityLine = () => page.getByText(/^Available: /);
  const dealNotFound = () => page.getByText("Deal not found", { exact: true });
  const returnToMenuButton = () =>
    page.getByRole("button", { name: "Return to Menu" });

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
      '[data-testid="deal-step-customize"], [data-testid="deal-unit-customize"]'
    );

  // ── "{qty} × {name}" steps: one row per unit (spec §13) ────────────────
  /** A step (pick or fixed) by its exact heading, e.g. "2 × Burger". */
  const stepByHeading = (heading: string): Locator =>
    slotCardHooks().and(
      page.getByRole("group", { name: heading, exact: true })
    );
  /** The role="alert" of a step after an incomplete Add ("Choose options for Burger 2"). */
  const stepAlert = (heading: string): Locator =>
    stepByHeading(heading).getByRole("alert");
  /** The unit rows of a "{qty} × {name}" step (none when the item has no options). */
  const unitRows = (stepHeading: string): Locator =>
    stepByHeading(stepHeading).getByTestId("deal-unit-row");
  /** Unit `unit` (1-based — the n of its "<item> n" label) of a step. */
  const unitRow = (stepHeading: string, unit: number): Locator =>
    unitRows(stepHeading).nth(unit - 1);
  /** A unit row by its data-unit-key ("<dealItemId>:<i>"). */
  const unitRowByKey = (unitKey: string): Locator =>
    page
      .getByTestId("deal-unit-row")
      .and(page.locator(`[data-unit-key="${unitKey}"]`));
  /** "<item> n". */
  const unitLabel = (stepHeading: string, unit: number): Locator =>
    unitRow(stepHeading, unit).getByTestId("deal-unit-label");
  /** The unit's option names (absent while unchanged, or while still needed). */
  const unitOptions = (stepHeading: string, unit: number): Locator =>
    unitRow(stepHeading, unit).getByTestId("deal-unit-options");
  /** "+$1.50", or "Included" while the unit's options add nothing. */
  const unitPrice = (stepHeading: string, unit: number): Locator =>
    unitRow(stepHeading, unit).getByTestId("deal-unit-price");
  /** The unit's "Customize" / "Choose options" button. */
  const unitCustomizeButton = (stepHeading: string, unit: number): Locator =>
    unitRow(stepHeading, unit).getByTestId("deal-unit-customize");
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
    await expect(card).toHaveAttribute("aria-checked", "true");
    // Settles one way: the modal opens (the item needs options), or the step
    // reads "✓ Done" (it does not).
    const stepDone = step
      .getByTestId("deal-step-status")
      .filter({ hasText: /^✓ Done$/ });
    // Both can show at once (the step reads "✓ Done" while the modal animates
    // in): `.first()` keeps the wait from failing on strict mode.
    await expect(doneButton().or(stepDone).first()).toBeVisible({
      timeout: 15_000,
    });
    let opened = await doneButton().isVisible();
    // A pick on an item with ANY options opens the item modal, and the step
    // can already read "✓ Done" while the modal animates in. With `customize`
    // the item has options, so give the modal its moment before falling back
    // to the step's Customize button (which the open modal's overlay blocks).
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
      if ((await step.getByTestId("deal-unit-row").count()) > 0)
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

  // ── Checkout OrderSummary ──────────────────────────────────────────────────
  const partOfDealLabels = () =>
    page.getByText("Part of deal", { exact: true });
  const dealSummaryRow = (dealName: string) =>
    page.getByRole("heading", {
      name: new RegExp(`^\\d+x ${escapeRe(dealName)}$`),
    });
  // The breakdown summary (wind #135, 2026-10-19) shows the server's info
  // line "You saved $X with <deal>" (backend api:…dealSavings) under the
  // total; the pre-breakdown summary's "You're saving | $X" row only renders
  // when the quote carries no breakdown. Either way the row holds the amount.
  const youAreSavingRow = () =>
    page.getByText(/You're saving|You saved \$\d+\.\d{2} with /).locator("..");
  const dealItemUpchargeLine = (itemName: string) =>
    page.getByText(
      new RegExp(`^1x ${escapeRe(itemName)} \\(\\+\\$\\d+\\.\\d{2}\\)$`)
    );
  const completeDealsToContinueButton = () =>
    page.getByRole("button", { name: "Complete Deals to Continue" });

  // ── Deal scheduling (Plan 4 hooks) ─────────────────────────────────────────
  const cardScheduleSummary = (dealName: string) =>
    dealCard(dealName).getByTestId("deal-schedule-summary");
  const cardAvailabilityLabel = (dealName: string) =>
    dealCard(dealName).getByTestId("deal-availability-label");
  const builderAvailabilityLabel = () =>
    page.getByTestId("deal-availability-label").first();
  /**
   * Every builder step root (pick + fixed). They carry no aria-disabled: while
   * the deal isn't available it is the option radios (aria-disabled="true")
   * and the disabled Add that lock the deal.
   */
  const slotCardHooks = () =>
    page.locator(
      '[data-testid="deal-choice-slot"], [data-testid="deal-fixed-step"]'
    );

  // ── DealsGridBlock (block type "deals_grid", placed on a restaurant page) ───
  /** /catering renders brandingConfig.restaurantPages.catering.blocks whether or not the nav links it. */
  const gotoCateringPage = async (restaurantId: string) => {
    await page.goto(
      `${TEMPLATE_WIND_URL}/catering?restaurantId=${restaurantId}`,
      { waitUntil: "domcontentloaded" }
    );
  };
  const dealsGridHeading = (title: string) =>
    page.getByRole("heading", { name: title, exact: true, level: 2 });
  /** One grid card: testid first (Plan 4), else the card div holding the deal's h3 inside the block's section. */
  const dealsGridCard = (title: string, dealName: string) => {
    const nameH3 = page.getByRole("heading", {
      name: dealName,
      exact: true,
      level: 3,
    });
    return page
      .getByTestId("deals-grid-card")
      .filter({ has: nameH3 })
      .or(
        page
          .locator("section")
          .filter({ has: dealsGridHeading(title) })
          .locator("div.rounded-xl")
          .filter({ has: nameH3 })
      )
      .first();
  };

  return {
    gotoBuilder,
    dealsSectionHeading,
    dealCard,
    viewDeal,
    builderHeading,
    saveBadge,
    youSaveChip,
    availabilityLine,
    dealNotFound,
    returnToMenuButton,
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
    partOfDealLabels,
    dealSummaryRow,
    youAreSavingRow,
    dealItemUpchargeLine,
    completeDealsToContinueButton,
    cardScheduleSummary,
    cardAvailabilityLabel,
    builderAvailabilityLabel,
    slotCardHooks,
    gotoCateringPage,
    dealsGridHeading,
    dealsGridCard,
  };
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type CustomerDealPage = ReturnType<typeof createCustomerDealPage>;
