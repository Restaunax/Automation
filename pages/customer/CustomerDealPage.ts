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
 *   $X.XX"; "Modifiers/Upgrades +$X.XX"; the proceed button turns into
 *   "Complete Deals to Continue" while a deal is incomplete.
 */
export const createCustomerDealPage = (page: Page) => {
  // Same ?restaurantId= QA override as every other customer route.
  const gotoBuilder = async (restaurantId: string, dealId: string) => {
    await page.goto(
      `${TEMPLATE_WIND_URL}/deals/${dealId}?restaurantId=${restaurantId}`,
      { waitUntil: "domcontentloaded" }
    );
  };

  // ── /menu "Today's Deals" ──────────────────────────────────────────────────
  const dealsSectionHeading = () =>
    page.getByRole("heading", { name: "Today's Deals" });
  /**
   * The DealCard for a deal name — the innermost container that holds the
   * name AND the "Save X%" badge (the badge sits in the image header, above
   * the p-5 body, so the body div alone is too small). Do NOT also require the
   * "View Deal" button: a deal that is not available now shows its
   * availability label instead of the button, and requiring it widens the
   * match to the whole grid (every deal's label and button).
   */
  const dealCard = (dealName: string) =>
    page
      .locator("div")
      .filter({
        has: page.getByRole("heading", { name: dealName, exact: true }),
      })
      .filter({ hasText: /Save \d+%/ })
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

  // ── Checkout OrderSummary ──────────────────────────────────────────────────
  const partOfDealLabels = () =>
    page.getByText("Part of deal", { exact: true });
  const dealSummaryRow = (dealName: string) =>
    page.getByRole("heading", {
      name: new RegExp(`^\\d+x ${escapeRe(dealName)}$`),
    });
  const youAreSavingRow = () => page.getByText(/You're saving/).locator("..");
  const modifiersUpgradesRow = () =>
    page.getByText("Modifiers/Upgrades", { exact: true }).locator("..");
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
    partOfDealLabels,
    dealSummaryRow,
    youAreSavingRow,
    modifiersUpgradesRow,
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
