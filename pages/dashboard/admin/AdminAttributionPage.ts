import { type Page, expect } from "@playwright/test";

import { createAdminRestaurantsPage } from "./AdminRestaurantsPage";

// Restaurant attribution ("Brought in by") across its three HQ surfaces:
//   • People → Affiliates → View Details → "Sales" tab (funnel tiles, "Link a
//     restaurant", attributed restaurants table);
//   • People → Business cards → Cards / Leaderboard toggle;
//   • Restaurant → Restaurants → row kebab → View Details → General tab →
//     "Brought in by" row (Set source / Change / Remove, or the lock text).
// No data-testids anywhere in this feature; every locator is role/text-based.
export const createAdminAttributionPage = (page: Page) => {
  const restaurants = createAdminRestaurantsPage(page);

  // ── Affiliate details → Sales tab ─────────────────────────────────────────
  const gotoAffiliates = async () => {
    await page.goto("/admin?tab=affiliate", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Affiliate Management" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const openAffiliateSalesTab = async (referralTag: string) => {
    await gotoAffiliates();
    await page
      .getByPlaceholder("Search by name, email, or tag...")
      .fill(referralTag);
    const row = page.getByRole("row").filter({ hasText: referralTag }).first();
    await row.waitFor({ state: "visible", timeout: 15_000 });
    await row.getByRole("button", { name: "View Details" }).click();
    await page.getByRole("tab", { name: "Sales" }).click();
    await expect(
      page.getByRole("button", { name: "Link a restaurant" })
    ).toBeVisible({ timeout: 10_000 });
  };

  // ── Link a restaurant dialog (shared by Sales tab and card rows) ──────────
  const linkDialog = () =>
    page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: /^Link a restaurant to / }),
    });

  const linkSubmitButton = () =>
    linkDialog().getByRole("button", { name: "Link restaurant", exact: true });

  /** Opens the dialog, picks the restaurant and types the reason (no submit). */
  const fillLinkDialog = async (restaurantName: string, reason: string) => {
    await page.getByRole("button", { name: "Link a restaurant" }).click();
    const search = linkDialog().getByRole("combobox", {
      name: "Search by restaurant name",
    });
    // Debounced server-side search: real keystrokes, then wait for the option.
    await search.click();
    await search.pressSequentially(restaurantName, { delay: 40 });
    const option = page
      .getByRole("option")
      .filter({ hasText: restaurantName })
      .first();
    await option.waitFor({ state: "visible", timeout: 15_000 });
    await option.click();
    await linkDialog().getByRole("textbox", { name: "Reason" }).fill(reason);
  };

  const submitLink = () => linkSubmitButton().click();

  const assertLinkedToast = () =>
    expect(page.getByText("Restaurant linked")).toBeVisible({
      timeout: 10_000,
    });

  const assertLinkRefused = (message: RegExp) =>
    expect(linkDialog().getByRole("alert")).toContainText(message, {
      timeout: 10_000,
    });

  // ── Business cards → Leaderboard ──────────────────────────────────────────
  const gotoBusinessCards = async () => {
    await page.goto("/admin?tab=businessCards", {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", { name: "Business cards", level: 1 })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const showLeaderboard = async () => {
    await page
      .getByRole("button", { name: "Leaderboard", exact: true })
      .click();
    await expect(page.getByRole("columnheader", { name: "Rank" })).toBeVisible({
      timeout: 10_000,
    });
  };

  const leaderboardRow = (personName: string) =>
    page.getByRole("row").filter({ hasText: personName });

  // ── Restaurant details → Brought in by ────────────────────────────────────
  const openRestaurantDetails = async (restaurantName: string) => {
    await restaurants.goto();
    await restaurants.openRowActionMenu(restaurantName);
    await page.getByRole("menuitem", { name: "View Details" }).click();
    await expect(broughtInBy()).toBeVisible({ timeout: 15_000 });
  };

  /** The row's own block: its heading plus everything under it. */
  const broughtInBy = () =>
    page
      .getByRole("dialog")
      .locator("div")
      .filter({
        has: page.getByRole("heading", { name: "Brought in by", exact: true }),
      })
      .last();

  const assertSource = async (payeeName: string, via: string | RegExp) => {
    await expect(broughtInBy()).toContainText(payeeName, { timeout: 10_000 });
    await expect(broughtInBy()).toContainText(via);
  };

  const assertNoSource = () =>
    expect(broughtInBy()).toContainText("No source", { timeout: 10_000 });

  const removeDialog = () =>
    page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Remove source" }),
    });

  const removeSubmitButton = () =>
    removeDialog().getByRole("button", { name: "Remove source", exact: true });

  const openRemove = () =>
    broughtInBy().getByRole("button", { name: "Remove", exact: true }).click();

  const typeRemoveReason = (reason: string) =>
    removeDialog().getByRole("textbox", { name: "Reason" }).fill(reason);

  return {
    openAffiliateSalesTab,
    fillLinkDialog,
    linkSubmitButton,
    submitLink,
    assertLinkedToast,
    assertLinkRefused,
    gotoBusinessCards,
    showLeaderboard,
    leaderboardRow,
    openRestaurantDetails,
    broughtInBy,
    assertSource,
    assertNoSource,
    openRemove,
    typeRemoveReason,
    removeSubmitButton,
  };
};
