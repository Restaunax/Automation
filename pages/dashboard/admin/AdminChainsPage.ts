import { type Page, expect } from "@playwright/test";

// Chain Management (/admin?tab=chains, ADMIN only — EMPLOYEE is redirected to
// /access-denied by the frontend's /admin route guard despite the backend
// technically allowing it). The list is an MUI DataGrid with no data-testid
// anywhere in this feature, so every locator here is role/text-based.
export const createAdminChainsPage = (page: Page) => {
  const goto = async () => {
    await page.goto("/admin?tab=chains", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Chain Management" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertPageLoaded = () =>
    expect(page.getByRole("heading", { name: "Chain Management" })).toBeVisible(
      { timeout: 15_000 }
    );

  const assertColumnVisible = (columnName: string) =>
    expect(page.getByRole("columnheader", { name: columnName })).toBeVisible({
      timeout: 10_000,
    });

  // List page's trigger button — "Create Chain" (title case), distinct from
  // the side sheet's own submit button, "Create chain" (sentence case).
  const createChainButton = () =>
    page.getByRole("button", { name: "Create Chain", exact: true });

  const openCreateChain = () => createChainButton().click();

  // Founding-store field is a debounced (300ms) server-search Autocomplete —
  // needs real keystrokes, not fill(), same pattern as an address-search
  // autocomplete elsewhere in this repo.
  const foundingStoreInput = () => page.getByPlaceholder("Search restaurants…");

  const selectFoundingStore = async (name: string) => {
    await foundingStoreInput().click();
    await foundingStoreInput().pressSequentially(name, { delay: 100 });
    await page.getByRole("option", { name }).waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await page.getByRole("option", { name }).click();
  };

  const chainNameInput = () => page.locator("#chain-name");

  // Side sheet's submit button — "Create chain" (sentence case), disabled
  // until a founding store is selected.
  const submitCreateChainButton = () =>
    page.getByRole("button", { name: "Create chain", exact: true });

  const submitCreateChain = () => submitCreateChainButton().click();

  const assertChainCreatedToast = () =>
    expect(page.getByText("Chain created")).toBeVisible({ timeout: 10_000 });

  // The panel header is an <h5> chain-name heading; each member row renders
  // the restaurant's own name as an <h6> — when the chain name defaults to
  // the founding restaurant's name (left blank at create time), both carry
  // identical text, so these must be disambiguated by heading level.
  const assertDetailPanelVisible = (chainName: string) =>
    expect(
      page.getByRole("heading", { level: 5, name: chainName, exact: true })
    ).toBeVisible({ timeout: 10_000 });

  const assertMemberRestaurantVisible = (restaurantName: string) =>
    expect(
      page.getByRole("heading", { level: 6, name: restaurantName, exact: true })
    ).toBeVisible({ timeout: 10_000 });

  const backToChainsButton = () =>
    page.getByRole("button", { name: "Back to chains" });

  const backToChains = () => backToChainsButton().click();

  const findRowByName = (name: string) =>
    page.getByRole("row", { name: new RegExp(name) });

  const assertChainRowVisible = (name: string) =>
    expect(findRowByName(name)).toBeVisible({ timeout: 10_000 });

  return {
    goto,
    assertPageLoaded,
    assertColumnVisible,
    createChainButton,
    openCreateChain,
    foundingStoreInput,
    selectFoundingStore,
    chainNameInput,
    submitCreateChainButton,
    submitCreateChain,
    assertChainCreatedToast,
    assertDetailPanelVisible,
    assertMemberRestaurantVisible,
    backToChainsButton,
    backToChains,
    findRowByName,
    assertChainRowVisible,
  };
};
