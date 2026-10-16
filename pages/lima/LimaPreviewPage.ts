import type { Locator, Page } from "@playwright/test";

/**
 * Template Lima in "Try it as a customer" preview mode: <ordering host>/
 * preview/<token>/… (verified in template-lima source, feat/promotion-preview,
 * 2026-10-16):
 *
 * - PreviewBanner (data-testid="preview-banner", region "Preview"): "Preview —
 *   orders can't be placed", the server's subtitle/title · location, the
 *   optional hint, "N minutes left" (preview-minutes-left), "Details"
 *   (expands preview-details: suspended rules + notes) and "End preview"
 *   (DELETEs the preview, closes a script-opened tab, else shows the ended
 *   page).
 * - PreviewEnded (data-testid="preview-ended") when the preview was ended,
 *   replaced or expired — also on return to the tab (focus / visibility
 *   re-check). A reload of an ended preview gets the server's plain 404 page
 *   with the same sentence and no test id.
 * - Checkout: PreviewCheckoutNotice (preview-checkout-notice) replaces the
 *   payment section; Order Now is not rendered.
 * - DealCard: a "Preview" chip (deal-preview-chip) on the preview deal.
 */
export const ENDED_TEXT =
  "This preview has ended. Go back to your dashboard to open a new one.";

export const createLimaPreviewPage = (page: Page) => {
  const banner = (): Locator => page.getByTestId("preview-banner");

  /** The SPA's ended page, or the server's 404 page after a reload. */
  const endedMessage = (): Locator =>
    page
      .getByTestId("preview-ended")
      .or(page.getByText(ENDED_TEXT, { exact: true }))
      .first();

  const checkoutNotice = (): Locator =>
    page.getByTestId("preview-checkout-notice");

  const previewChip = (): Locator => page.getByTestId("deal-preview-chip");

  const minutesLeft = (): Locator =>
    banner().getByTestId("preview-minutes-left");

  const details = (): Locator => page.getByTestId("preview-details");

  const openDetails = () =>
    banner().getByRole("button", { name: "Details", exact: true }).click();

  const endPreviewButton = (): Locator =>
    banner().getByRole("button", { name: "End preview", exact: true });

  /** The token from the tab's URL ("" once the tab left the preview path). */
  const token = (): string =>
    /\/preview\/([A-Za-z0-9_-]{43})/.exec(page.url())?.[1] ?? "";

  /**
   * Fires the event a browser sends when the owner comes back to the tab;
   * lima re-checks the preview on it. Headless pages all count as focused,
   * so switching tabs alone sends nothing.
   */
  const returnToTab = async () => {
    await page.bringToFront();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  };

  return {
    banner,
    endedMessage,
    checkoutNotice,
    previewChip,
    minutesLeft,
    details,
    openDetails,
    endPreviewButton,
    token,
    returnToTab,
  };
};

export type LimaPreviewPage = ReturnType<typeof createLimaPreviewPage>;
