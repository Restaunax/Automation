import { type Page, type Locator, expect } from "@playwright/test";

import { LIMA_ORDERING_URL } from "../../utils/testData";

/**
 * Template Lima — deal surfaces (verified in template-lima source, qa branch,
 * 2026-10-05):
 *
 * - /<slug>/menu → DealsSection "Today's Deals" (renders nothing when /active
 *   is empty). DealCard = MUI Card: h3 deal name, "Includes:" + "1x <item>"
 *   chips, struck original + deal price, "View Deal" → /<slug>/deal/<id>.
 * - Builder (DealBuilderPage): DealBuilderHeader h4 name; one DealItemCard per
 *   slot (h3 item name, "Need N", footer "Click to customize & add" →
 *   "Added - Click to add more"); clicking opens the item modal whose
 *   data-testid="add-to-cart" button reads "Add to Deal — $x"; DealProgress
 *   "X of N items added" / "Deal Complete!" + "View Cart" → /<slug>/cart.
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

  const slotCard = (itemName: string): Locator =>
    page
      .locator(".MuiCard-root")
      .filter({
        has: page.getByRole("heading", { name: itemName, exact: true }),
      })
      .filter({ hasText: /Need \d+/ });

  const openIncompleteSlot = (itemName: string) =>
    slotCard(itemName)
      .filter({ hasText: "Click to customize & add" })
      .first()
      .click();

  const addToDealButton = () =>
    page
      .getByTestId("add-to-cart")
      .or(page.getByRole("button", { name: /add to deal/i }))
      .first();

  const clickAddToDeal = async () => {
    await expect(addToDealButton()).toContainText(/Add to Deal/i);
    await addToDealButton().click();
    await expect(addToDealButton()).toBeHidden();
  };

  const assertProgress = (completed: number, total: number) =>
    expect(page.getByText(`${completed} of ${total} items added`)).toBeVisible({
      timeout: 15_000,
    });
  const assertDealComplete = () =>
    expect(page.getByText("Deal Complete!")).toBeVisible({ timeout: 15_000 });

  const viewCartButton = () =>
    page.getByRole("button", { name: "View Cart", exact: true });

  // ── "One of these items" slots (BOGO / pick deals) ────────────────────────
  // DealBuilderPage renders each pick slot as data-testid="deal-choice-slot"
  // (h5 title + one DealItemCard per option: "Pick N" chip, price, h3 name;
  // the picked option's chip reads "Your pick").

  const choiceSlots = (): Locator => page.getByTestId("deal-choice-slot");

  const choiceCard = (slot: number, itemName: string): Locator =>
    choiceSlots()
      .nth(slot)
      .locator(".MuiCard-root")
      .filter({
        has: page.getByRole("heading", { name: itemName, exact: true }),
      });

  /**
   * Click an option → its item modal → "Add to Deal". An option card ignores
   * clicks while its availability is still loading (aria-disabled="true"), so
   * wait for it to be enabled first — a click before that is silently lost.
   * `customize` runs with the modal open, before "Add to Deal" (pick a size,
   * tick paid extras, …).
   */
  const pickChoice = async (
    slot: number,
    itemName: string,
    customize?: () => Promise<void>
  ) => {
    const card = choiceCard(slot, itemName);
    await expect(card).toHaveAttribute("aria-disabled", "false", {
      timeout: 15_000,
    });
    await card.click();
    if (customize) {
      await expect(addToDealButton()).toBeVisible();
      await customize();
    }
    await clickAddToDeal();
  };

  /**
   * An option the customer can't pick (out of stock / off the menu): the card
   * is aria-disabled, tagged deal-option-unavailable and reads "Unavailable".
   */
  const expectChoiceUnavailable = async (slot: number, itemName: string) => {
    const card = choiceCard(slot, itemName);
    await expect(card).toHaveAttribute("aria-disabled", "true", {
      timeout: 15_000,
    });
    await expect(card).toHaveAttribute(
      "data-testid",
      "deal-option-unavailable"
    );
    await expect(card).toContainText("Unavailable");
  };

  /** "Keep shopping" — DealProgress renders it only once the deal is complete. */
  const keepShoppingButton = (): Locator =>
    page.getByTestId("deal-keep-shopping");

  /**
   * The deal price in the sticky progress bar (h6; "From $x" until every
   * pick slot is filled, then the price of exactly those picks).
   */
  const progressDealPrice = (): Locator =>
    page
      .locator(".MuiPaper-root")
      .filter({ has: viewCartButton() })
      .last()
      .getByRole("heading", { level: 6, name: /^(From )?\$[\d,]+\.\d{2}$/ });

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
    slotCard,
    openIncompleteSlot,
    addToDealButton,
    clickAddToDeal,
    assertProgress,
    assertDealComplete,
    viewCartButton,
    choiceSlots,
    choiceCard,
    pickChoice,
    expectChoiceUnavailable,
    keepShoppingButton,
    progressDealPrice,
    cardScheduleSummary,
    cardAvailabilityLabel,
  };
};

export type LimaDealPage = ReturnType<typeof createLimaDealPage>;
