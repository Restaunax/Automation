import { type Page, expect } from "@playwright/test";

const TEMPLATE_WIND_URL =
  process.env.TEMPLATE_WIND_URL ?? "https://qa.restaunax.com";

/**
 * The deal builder route (/deals/[dealId]) — template-wind auto-adds the deal
 * to the cart on first mount and renders DealProgress ("X of N items added" /
 * "Deal Complete!") above the per-slot DealItemCards. Clicking a slot card
 * opens the ItemModal in deal mode, whose confirm button reads "Add to Deal".
 */
export const createCustomerDealPage = (page: Page) => {
  // Same ?restaurantId= QA override as every other customer route.
  const gotoBuilder = async (restaurantId: string, dealId: string) => {
    await page.goto(
      `${TEMPLATE_WIND_URL}/deals/${dealId}?restaurantId=${restaurantId}`,
      { waitUntil: "domcontentloaded" }
    );
  };

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

  const addToDealButton = () =>
    page.getByRole("button", { name: /add to deal/i }).first();

  const clickAddToDeal = () => addToDealButton().click();

  return {
    gotoBuilder,
    assertProgress,
    assertDealComplete,
    openSlot,
    addToDealButton,
    clickAddToDeal,
  };
};
