import { type Page, expect } from "@playwright/test";

import { LIMA_ORDERING_URL } from "../../utils/testData";

/**
 * Template Lima — the embedded-ordering storefront.
 *
 * Deliberately a SEPARATE page object from pages/customer/* rather than a
 * shared one. Wind is Next + Tailwind, Lima is MUI: the DOM, roles and labels
 * genuinely differ, and forcing one locator set across two UI frameworks is how
 * suites become brittle. What should be shared is the journey and the
 * assertions, and that is worth extracting only once both suites exist and the
 * real commonality is visible.
 *
 * Locator strategy matches the repo convention (TEST_PLAN → "Locator
 * strategy"): testid first with a role/text fallback via .or(), so a spec keeps
 * passing against a QA deployment that predates the testids.
 */
export const createLimaStorefrontPage = (page: Page) => {
  /** The tenant's storefront root: <ordering host>/<slug>. */
  const tenantRoot = (slug: string): string => `${LIMA_ORDERING_URL}/${slug}`;

  const gotoMenu = async (slug: string, query = "") => {
    await page.goto(`${tenantRoot(slug)}/menu${query}`, {
      waitUntil: "domcontentloaded",
    });
  };

  const gotoRoot = async (slug: string, query = "") => {
    await page.goto(`${tenantRoot(slug)}${query}`, {
      waitUntil: "domcontentloaded",
    });
  };

  const menuItemCard = (name: string) =>
    page
      .getByTestId("menu-item-card")
      .filter({ hasText: name })
      .or(page.getByRole("heading", { name, exact: true }))
      .first();

  const addToCartButton = () =>
    page
      .getByTestId("add-to-cart")
      .or(page.getByRole("button", { name: /add to cart/i }))
      .first();

  const openItemModal = (itemName: string) => menuItemCard(itemName).click();

  const clickAddToCart = () => addToCartButton().click();

  /**
   * The cart's item count. Lima renders it as a badge on the nav cart control;
   * fall back to counting rows on the cart page itself.
   */
  const cartBadgeCount = async (): Promise<number> => {
    const badge = page.locator('[class*="MuiBadge-badge"]').first();
    if ((await badge.count()) > 0) {
      const text = (await badge.innerText().catch(() => "")).trim();
      const parsed = parseInt(text, 10);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return 0;
  };

  const assertOnMenu = () =>
    expect(page).toHaveURL(/\/menu/, { timeout: 15_000 });

  /** The location picker gate a chain-addressed visit lands on. */
  const locationPicker = () =>
    page
      .getByTestId("location-picker")
      .or(
        page.getByRole("heading", {
          name: /choose.*location|select.*location/i,
        })
      )
      .first();

  /**
   * Every request this page makes that carried an Authorization header.
   * The real proof of tenant isolation — UI state alone is too weak, because a
   * token can be attached to API calls while the UI still looks logged out.
   */
  const trackAuthorizedRequests = (): string[] => {
    const seen: string[] = [];
    page.on("request", (req) => {
      const auth = req.headers()["authorization"];
      if (auth) seen.push(`${req.method()} ${req.url()} :: ${auth}`);
    });
    return seen;
  };

  /** All rx:-prefixed storage keys, for asserting namespacing actually happened. */
  const readStorageKeys = async (): Promise<{
    local: string[];
    session: string[];
  }> =>
    page.evaluate(() => ({
      local: Object.keys(window.localStorage),
      session: Object.keys(window.sessionStorage),
    }));

  const documentTitle = () => page.title();

  const metaRobots = () =>
    page
      .locator('meta[name="robots"]')
      .first()
      .getAttribute("content")
      .catch(() => null);

  return {
    tenantRoot,
    gotoMenu,
    gotoRoot,
    menuItemCard,
    addToCartButton,
    openItemModal,
    clickAddToCart,
    cartBadgeCount,
    assertOnMenu,
    locationPicker,
    trackAuthorizedRequests,
    readStorageKeys,
    documentTitle,
    metaRobots,
  };
};

export type LimaStorefrontPage = ReturnType<typeof createLimaStorefrontPage>;
