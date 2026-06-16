import { type Page } from "@playwright/test";
import { readRestaurantId } from "../../utils/testData";

/**
 * Template Wind — /menu (customer ordering).
 *
 * STUB POM: locators and method bodies are placeholders (`TODO`). Fill them in
 * when writing the real test. Convention: a factory function returning
 * { goto, ...actions }; see TEST_PLAN.md → "Conventions". Template Wind exposes
 * very few data-testid attributes, so prefer role/text selectors.
 */
export const createMenuPage = (page: Page) => {
  const floatingCartButton = page.getByRole("button", { name: /cart/i });
  const itemCards = page.getByRole("button", { name: /add/i }); // TODO: tighten selector

  // Append ?restaurantId so QA skips the location picker (Template Wind is
  // deployed per-restaurant). See readRestaurantId() in utils/testData.
  const goto = async (): Promise<void> => {
    await page.goto(`/menu?restaurantId=${readRestaurantId()}`, {
      waitUntil: "domcontentloaded",
    });
  };

  const openItemByName = async (name: string): Promise<void> => {
    // TODO: open the menu item card whose title matches `name`
    await page.getByText(name, { exact: false }).first().click();
  };

  const openCart = async (): Promise<void> => {
    // TODO: open the cart summary modal
    await floatingCartButton.click();
  };

  return { goto, openItemByName, openCart, itemCards };
};

export type MenuPage = ReturnType<typeof createMenuPage>;
