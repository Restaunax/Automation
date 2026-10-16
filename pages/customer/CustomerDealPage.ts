import { type Page, expect } from "@playwright/test";

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
 * - `/deals/[dealId]` (the builder): auto-adds the deal to the cart on first
 *   mount; DealBuilderHeader (name, "Save X%", "You save $X.XX", "Available:
 *   <days>, <times>"); ONE DealItemCard per DealItem row (a qty-2 slot is two
 *   cards of the same item — "Need 1", footer "Click to customize & add" →
 *   "Added - Click to customize"); DealProgress ("X of N items added" /
 *   "Deal Complete!", "View Cart" → /checkout). Clicking a card opens the
 *   ItemModal in deal mode whose confirm reads "Add to Deal — $x" (same
 *   data-testid="add-to-cart"). An inactive / deleted / 86'd
 *   deal → "Deal not found" + "Return to Menu". Since deal scheduling (Plan 4) a
 *   deal that is off for now but on later today stays listed with
 *   deal-availability-label and disabled slots.
 * - `/checkout` OrderSummary: claimed items say "Part of deal"; deal rows read
 *   "<qty>x <deal name>" (expandable to "1x <item> (+$x.xx)"); "You're saving
 *   $X.XX"; an "Items / Upgrades +$X.XX / Subtotal" build-up when a deal
 *   carries upgrades (CustomerCheckoutPage summary*Row); the proceed button
 *   turns into "Complete Deals to Continue" while a deal is incomplete.
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

  const assertProgress = (completed: number, total: number) =>
    expect(page.getByText(`${completed} of ${total} items added`)).toBeVisible({
      timeout: 15_000,
    });

  const assertDealComplete = () =>
    expect(page.getByText("Deal Complete!")).toBeVisible({ timeout: 15_000 });

  // The whole DealItemCard is the click target; its item-name text is the
  // stable way in (names are the seed item's, unique on this page).
  const openSlot = (itemName: string) =>
    page.getByText(itemName, { exact: true }).first().click();

  /**
   * The next UNFILLED card for an item (a qty-2 slot renders two cards for the
   * same item; the filled one's footer flips to "Added - Click to customize").
   */
  // Card root = the DealItemCard's motion.div — the only element that carries
  // both the "Need N" badge and the click-hint footer, and the `cursor-pointer`
  // class (its ancestors are grid/section wrappers without it).
  const slotCardRoot = () =>
    page.locator("div.cursor-pointer").filter({ hasText: /^Need \d+/ });
  const slotCards = (itemName: string) =>
    slotCardRoot().filter({ has: page.getByText(itemName, { exact: true }) });
  const incompleteSlotCard = (itemName: string) =>
    slotCards(itemName).filter({ hasText: "Click to customize & add" }).first();
  const openIncompleteSlot = (itemName: string) =>
    incompleteSlotCard(itemName).click();

  const addToDealButton = () =>
    page
      .getByTestId("add-to-cart")
      .or(page.getByRole("button", { name: /add to deal/i }))
      .first();

  const clickAddToDeal = async () => {
    await expect(addToDealButton()).toContainText(/Add to Deal/i, {
      timeout: 10_000,
    });
    await addToDealButton().click();
    await expect(addToDealButton()).toBeHidden({ timeout: 10_000 });
  };

  const viewCartButton = () =>
    page.getByRole("button", { name: "View Cart", exact: true });

  // ── Pick slots ("one of these items" / category lines, promotions v2):
  // one data-testid="deal-choice-slot" per line, headed "Choose one", with a
  // data-testid="deal-slot-card" per option ("Choose this one" → "Your pick").
  const choiceSlots = () => page.getByTestId("deal-choice-slot");
  const choiceCard = (slotIndex: number, itemName: string) =>
    choiceSlots()
      .nth(slotIndex)
      .getByTestId("deal-slot-card")
      .filter({
        has: page.getByRole("heading", { name: itemName, exact: true }),
      });
  /**
   * Pick `itemName` for the slot and confirm the modal's "Add to Deal".
   * `customize` runs with the modal open, before "Add to Deal" (pick a size,
   * tick paid extras, …).
   */
  const pickChoice = async (
    slotIndex: number,
    itemName: string,
    customize?: () => Promise<void>
  ) => {
    await choiceCard(slotIndex, itemName).click();
    if (customize) {
      await expect(addToDealButton()).toBeVisible({ timeout: 10_000 });
      await customize();
    }
    await clickAddToDeal();
  };

  // ── DealProgress (sticky bar): Keep shopping (complete deals only) sits
  // in the same action group as the deal price and View Cart.
  const keepShoppingButton = () => page.getByTestId("deal-keep-shopping");
  /** The bar's deal price ("$14.99") — the bold primary price in the action group. */
  const progressDealPrice = () =>
    keepShoppingButton().locator("xpath=..").locator("p.text-xl");

  // ── Checkout OrderSummary ──────────────────────────────────────────────────
  const partOfDealLabels = () =>
    page.getByText("Part of deal", { exact: true });
  const dealSummaryRow = (dealName: string) =>
    page.getByRole("heading", {
      name: new RegExp(`^\\d+x ${escapeRe(dealName)}$`),
    });
  const youAreSavingRow = () => page.getByText(/You're saving/).locator("..");
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
  /** Builder slot cards by testid (aria-disabled="true" while the deal isn't available). */
  const slotCardHooks = () => page.getByTestId("deal-slot-card");

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
    assertProgress,
    assertDealComplete,
    openSlot,
    incompleteSlotCard,
    openIncompleteSlot,
    slotCards,
    addToDealButton,
    clickAddToDeal,
    viewCartButton,
    choiceSlots,
    choiceCard,
    pickChoice,
    keepShoppingButton,
    progressDealPrice,
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
