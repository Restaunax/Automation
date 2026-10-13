import { type Page, type Locator, expect } from "@playwright/test";

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

  const cardScheduleSummary = (dealName: string) =>
    dealCard(dealName).getByTestId("deal-schedule-summary");
  const cardAvailabilityLabel = (dealName: string) =>
    dealCard(dealName).getByTestId("deal-availability-label");

  return {
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
    cardScheduleSummary,
    cardAvailabilityLabel,
  };
};

export type LimaDealPage = ReturnType<typeof createLimaDealPage>;
