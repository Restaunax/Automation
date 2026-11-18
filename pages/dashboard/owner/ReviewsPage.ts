import { type Locator, type Page, expect } from "@playwright/test";

export type ReviewsFilter = "unreplied" | "all" | "replied";

/**
 * The owner dashboard's "Google reviews" tab
 * (`/restaurant/restaurantId/<id>/restaurantManagement?tab=reviews`) and its
 * chain twin. Selectors are the data-testids the tab ships (RestauNax
 * feat/google-review-replies); visible copy comes from locales/en/reviews.json.
 */
export const createReviewsPage = (page: Page) => {
  const tid = (id: string) => page.getByTestId(id);

  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=reviews`,
      { waitUntil: "domcontentloaded" }
    );
  };

  const gotoChain = async (groupId: string) => {
    await page.goto(`/chain/${groupId}/restaurantManagement?tab=Reviews`, {
      waitUntil: "domcontentloaded",
    });
  };

  const connectButton = () => tid("reviews-connect-button");
  const chooseListingButton = () => tid("reviews-choose-listing-button");
  const reconnectBanner = () => tid("reviews-reconnect-banner");
  const filterChip = (f: ReviewsFilter) => tid(`reviews-filter-${f}`);
  const cards = () => tid("review-card");

  /** The review card for one reviewer (the fake seeds distinct names). */
  const cardFor = (reviewerName: string): Locator =>
    cards().filter({ hasText: reviewerName });

  const selectFilter = async (f: ReviewsFilter) => {
    await filterChip(f).click();
    await expect(filterChip(f)).toHaveClass(/MuiChip-colorPrimary/);
  };

  const assertFilterSelected = (f: ReviewsFilter) =>
    expect(filterChip(f)).toHaveClass(/MuiChip-colorPrimary/);

  /** Open the reply editor on a card (Reply or Edit, whichever it shows). */
  const openEditor = async (card: Locator) => {
    await card
      .getByTestId("review-reply-button")
      .or(card.getByTestId("review-edit-button"))
      .click();
    await expect(card.getByTestId("reply-input")).toBeVisible();
  };

  const replyInput = (card: Locator) => card.getByTestId("reply-input");

  const replaceText = async (card: Locator, text: string) => {
    const input = replyInput(card);
    await input.fill(text);
    await expect(input).toHaveValue(text);
  };

  /** Press Post and wait for the editor to close (the reply was accepted). */
  const post = async (card: Locator) => {
    await card.getByTestId("reply-post").click();
    await expect(card.getByTestId("reply-input")).toHaveCount(0, {
      timeout: 30_000,
    });
  };

  const confirmDelete = async (card: Locator) => {
    await card.getByTestId("review-delete-button").click();
    await tid("review-delete-confirm").click();
  };

  // Reply settings dialog
  const openSettings = async () => {
    await tid("reply-settings-open").click();
    await expect(tid("reply-settings-save")).toBeVisible();
  };
  const settingsField = (name: "signoff" | "contact" | "guidance") =>
    tid(`reply-settings-${name}`);
  const pickTone = async (label: string) => {
    await tid("reply-settings-tone").click();
    await page.getByRole("option", { name: label }).click();
  };
  const saveSettings = async () => {
    await tid("reply-settings-save").click();
    await expect(tid("reply-settings-save")).toHaveCount(0, {
      timeout: 15_000,
    });
  };

  return {
    goto,
    gotoChain,
    connectButton,
    chooseListingButton,
    reconnectBanner,
    filterChip,
    cards,
    cardFor,
    selectFilter,
    assertFilterSelected,
    openEditor,
    replyInput,
    replaceText,
    post,
    confirmDelete,
    openSettings,
    settingsField,
    pickTone,
    saveSettings,
    toggleTranslation: (card: Locator) =>
      card.getByTestId("reviews-translation-toggle"),
    aiButton: (card: Locator) => card.getByTestId("reply-ai-button"),
    aiUndo: (card: Locator) => card.getByTestId("reply-ai-undo"),
    draftLabel: (card: Locator) => card.getByTestId("reply-draft-label"),
    byteCounter: (card: Locator) => card.getByTestId("reply-byte-counter"),
    replyState: (card: Locator) => card.getByTestId("review-reply-state"),
    chainRows: () => tid("chain-reviews-row"),
  };
};

export type ReviewsPage = ReturnType<typeof createReviewsPage>;
