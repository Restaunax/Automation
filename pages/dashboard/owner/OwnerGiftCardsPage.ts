import {
  type Download,
  type Locator,
  type Page,
  expect,
} from "@playwright/test";

/**
 * OwnerGiftCardsPage — the web Gift cards section (RestauNax
 * feat/owner-gift-cards, web plan C): `GiftCardsSection` in the restaurant
 * portal (`?tab=gift-cards`) and in the chain shell
 * (`/chain/:gid/restaurantManagement?tab=gift-cards`).
 *
 * URL state (all real, from the built web code):
 *   - section tabs: `?section=overview|reports|settings` (push; a manager has
 *     no `settings`, and `?section=settings` falls back to Overview);
 *   - the open card: `?card=<id>` (push) — the detail drawer;
 *   - Reports picker: `?report=activity|rollForward|stock|settlement` (push);
 *   - finder filters: `?q=`, `?status=`, `?heldHere=`, `?page=` (replace).
 *
 * Selectors are the web UI's own data-testids (GiftCards/**). Where the web
 * has no test id (sidebar item, figure value/hint, history rows, report
 * hints, the confirm dialog) the locator is structural and noted.
 */
export type GiftCardsSectionKey = "overview" | "reports" | "settings";
export type GiftCardsReportKey =
  | "activity"
  | "rollForward"
  | "stock"
  | "settlement";

/** Last 4 characters of a full code, ignoring separators, upper-cased
 * (the masked code shows them upper-case; matches `sanitizeCode`). */
export const last4Of = (code: string): string =>
  code
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(-4)
    .toUpperCase();

export const createOwnerGiftCardsPage = (page: Page) => {
  const section = () => page.getByTestId("gift-cards-section");
  const query = (s?: GiftCardsSectionKey) =>
    `tab=gift-cards${s ? `&section=${s}` : ""}`;

  /** The restaurant portal's Gift cards section. */
  const goto = async (restaurantId: string, s?: GiftCardsSectionKey) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?${query(s)}`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(section()).toBeVisible({ timeout: 30_000 });
  };

  /** The chain shell's Gift cards section. */
  const gotoChain = async (groupId: string, s?: GiftCardsSectionKey) => {
    await page.goto(`/chain/${groupId}/restaurantManagement?${query(s)}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(section()).toBeVisible({ timeout: 30_000 });
  };

  // ── Sidebar ────────────────────────────────────────────────────────────
  // Restaurant portal: the NavItem carries data-tour="tab-gift-cards" (the
  // Demo Mode tour anchor; there is no data-testid). Mobile + desktop drawers
  // can both render it, so only the visible one counts.
  const sidebarItem = (): Locator =>
    page.locator('[data-tour="tab-gift-cards"]').filter({ visible: true });

  /**
   * The portal sidebar's top-level entries in screen order, as their
   * data-tour anchors (`tab-*` items and `section-*` flyout headers), so a
   * spec can check Gift cards sits next to `section-promotions`.
   */
  const sidebarOrder = async (): Promise<string[]> =>
    page
      .locator(
        '.MuiDrawer-paper [data-tour^="tab-"], .MuiDrawer-paper [data-tour^="section-"]'
      )
      .filter({ visible: true })
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-tour") ?? ""));

  // Chain shell: its NavItem has no data-tour or test id; found by its label.
  const chainSidebarItem = (label = "Gift cards"): Locator =>
    page
      .locator(".MuiDrawer-paper")
      .getByRole("button", { name: label, exact: true })
      .filter({ visible: true });

  // ── Section tabs ───────────────────────────────────────────────────────
  const sectionTab = (s: GiftCardsSectionKey): Locator =>
    page.getByTestId(`gift-cards-tab-${s}`);
  const openSection = async (s: GiftCardsSectionKey) => {
    await sectionTab(s).click();
    await expect(page.getByTestId(`gift-cards-section-${s}`)).toBeVisible({
      timeout: 15_000,
    });
  };
  const sectionPanel = (s: GiftCardsSectionKey): Locator =>
    page.getByTestId(`gift-cards-section-${s}`);

  // ── Overview: what is owed ─────────────────────────────────────────────
  /** The "Owed on cards" figure block (StatCard + card count + hint). */
  const owedBlock = (): Locator => page.getByTestId("gift-cards-summary-owed");
  /** The owed amount: StatCard's h6 value (no test id on the value). */
  const owedFigure = (): Locator => owedBlock().locator(".MuiTypography-h6");
  /** The owed hint: the block's own caption (a direct child of the block). */
  const owedHint = (): Locator =>
    owedBlock().locator(":scope > .MuiTypography-caption");
  /** Chain: the "By location" table's body rows (no per-row test id). */
  const byLocationRows = (): Locator =>
    page.getByTestId("gift-cards-summary-by-location").locator("tbody tr");
  /** Chain: one location's row, by restaurant name. */
  const byLocationRow = (name: string): Locator =>
    byLocationRows().filter({ hasText: name });
  /** Chain by-location row → the Owed cell (2nd column). */
  const byLocationOwed = (name: string): Locator =>
    byLocationRow(name).locator("td").nth(1);

  // ── Finder ─────────────────────────────────────────────────────────────
  const searchInput = (): Locator => page.getByTestId("gift-cards-search");
  /** Types a search; waits for the debounced `?q=` and the list to settle. */
  const search = async (text: string) => {
    await searchInput().fill(text);
    await expect(page).toHaveURL(
      new RegExp(`[?&]q=${encodeURIComponent(text)}(&|$)`),
      { timeout: 10_000 }
    );
  };
  const rows = (): Locator => page.locator('[data-testid^="gift-card-row-"]');
  const rowById = (id: string): Locator =>
    page.getByTestId(`gift-card-row-${id}`);
  const row = (last4: string): Locator => rows().filter({ hasText: last4 });
  /** A row's status chip (the finder shows the server's statusText). */
  const rowStatus = (r: Locator): Locator => r.locator(".MuiChip-label");
  /**
   * Searches by last 4 and opens the card. With `id`, opens that card's row
   * (another card may share the last 4); without, exactly one row must match.
   */
  const openCard = async (last4: string, id?: string) => {
    await search(last4);
    if (id) {
      await page.getByTestId(`gift-card-open-${id}`).click();
    } else {
      await expect(row(last4)).toHaveCount(1, { timeout: 15_000 });
      await row(last4).locator('[data-testid^="gift-card-open-"]').click();
    }
    await expect(drawer()).toBeVisible({ timeout: 15_000 });
    await expect(drawerCode()).toContainText(last4, { timeout: 15_000 });
  };

  // ── Card drawer ────────────────────────────────────────────────────────
  const drawer = (): Locator => page.getByTestId("gift-card-drawer");
  const drawerCode = (): Locator => page.getByTestId("gift-card-drawer-code");
  /** The status chip right after the masked code in the drawer header. */
  const drawerStatus = (): Locator =>
    drawerCode().locator(
      "xpath=following-sibling::*[contains(@class,'MuiChip-root')][1]"
    );
  const closeCard = async () => {
    await page.getByTestId("gift-card-drawer-close").click();
    await expect(drawer()).toBeHidden({ timeout: 10_000 });
  };
  /** History: the label of every row, in order (no per-row test id). */
  const historyLabels = async (): Promise<string[]> => {
    const body = page.getByTestId("gift-card-history").locator("tbody tr");
    await expect(body.first()).toBeVisible({ timeout: 15_000 });
    return body.evaluateAll((trs) =>
      trs.map(
        (tr) =>
          tr
            .querySelectorAll("td")[1]
            ?.querySelector(".MuiTypography-body2")
            ?.textContent?.trim() ?? ""
      )
    );
  };
  /** The red freeze banner (reasonText + when). */
  const freezeBanner = (): Locator => page.getByTestId("gift-card-freeze");
  const freezeButton = (): Locator =>
    page.getByTestId("gift-card-freeze-action");
  const freeze = async (reason: string) => {
    await freezeButton().click();
    await page.getByTestId("gift-card-freeze-reason").fill(reason);
    await page.getByTestId("gift-card-freeze-confirm").click();
    await expect(freezeBanner()).toBeVisible({ timeout: 15_000 });
  };
  const unfreezeButton = (): Locator => page.getByTestId("gift-card-unfreeze");
  /** Why there is no Unfreeze (RestauNax's freeze, a funding hold, …). */
  const unfreezeBlocked = (): Locator =>
    page.getByTestId("gift-card-unfreeze-blocked");

  // The shared ConfirmProvider dialog (no test ids): the one dialog labelled
  // by #confirm-dialog-title; its confirm button is the last action.
  const confirmDialog = (): Locator =>
    page
      .getByRole("dialog")
      .filter({ has: page.locator("#confirm-dialog-title") });
  const confirmButton = (): Locator =>
    confirmDialog().locator(".MuiDialogActions-root button").last();

  const unfreeze = async () => {
    await unfreezeButton().click();
    await expect(confirmDialog()).toBeVisible({ timeout: 10_000 });
    await confirmButton().click();
    await expect(freezeBanner()).toBeHidden({ timeout: 15_000 });
  };

  // ── Settings ───────────────────────────────────────────────────────────
  const settingsPanel = (): Locator => page.getByTestId("gift-cards-settings");
  /** The preset chips (each an amount like "$25.00"). */
  const settingsPresets = (): Locator =>
    page.getByTestId("gift-cards-settings-presets").locator(".MuiChip-root");
  const presetInput = (): Locator => page.locator("#gift-card-preset-input");
  const addPreset = async (amount: number) => {
    await presetInput().fill(String(amount));
    await page.getByTestId("gift-cards-settings-add-preset").click();
  };
  const removeAllPresets = async () => {
    const chips = settingsPresets();
    for (let n = await chips.count(); n > 0; n -= 1) {
      await chips.first().locator(".MuiChip-deleteIcon").click();
      await expect(chips).toHaveCount(n - 1);
    }
  };
  const removeLastPreset = async () =>
    settingsPresets().last().locator(".MuiChip-deleteIcon").click();
  /**
   * A settings switch by its key (selling | custom | cash | physical). The
   * test id lands on the MUI Switch root span: click the input inside it,
   * never the label (CLAUDE.md "Toggling a switch").
   */
  const settingsSwitch = (
    key: "selling" | "custom" | "cash" | "physical"
  ): Locator => page.getByTestId(`gift-cards-settings-${key}`).locator("input");
  /** The validation message under the presets (FormHelperText). */
  const presetsError = (): Locator =>
    page
      .getByTestId("gift-cards-settings-presets")
      .locator("xpath=ancestor::div[contains(@class,'MuiFormControl-root')][1]")
      .locator(".MuiFormHelperText-root");
  /** Save lives in the shared UnsavedChangesBar. */
  const saveButton = (): Locator => page.getByTestId("unsaved-changes-save");
  /**
   * Throws away an unsaved draft: clicks the bar's Discard (the text button
   * just before Save; no test id) when the bar is showing. A no-op otherwise.
   */
  const discardChanges = async () => {
    if (
      !(await saveButton()
        .isVisible()
        .catch(() => false))
    )
      return;
    await saveButton().locator("xpath=preceding-sibling::button[1]").click();
    await expect(saveButton()).toBeHidden({ timeout: 10_000 });
  };
  const saveSettings = async () => {
    await saveButton().click();
    await expect(saveButton()).toBeHidden({ timeout: 15_000 });
  };
  /** A chain member's read-only notice, and its link to the chain page. */
  const chainLevelNotice = (): Locator =>
    page.getByTestId("gift-cards-settings-chain-level");
  const openChainSettings = (): Locator =>
    page.getByTestId("gift-cards-settings-open-chain");

  // ── Reports ────────────────────────────────────────────────────────────
  const reportTab = (r: GiftCardsReportKey): Locator =>
    page.getByTestId(`gift-cards-report-tab-${r}`);
  const openReport = async (r: GiftCardsReportKey) => {
    await reportTab(r).click();
    await expect(page).toHaveURL(new RegExp(`[?&]report=${r}(&|$)`));
  };
  /**
   * The picked report's hint (the body2 line under its h2 title). Only the
   * picked report renders one; there is no per-report hint test id.
   */
  const reportHint = (): Locator =>
    page
      .getByTestId("gift-cards-reports")
      .locator("h2 + .MuiTypography-body2")
      .first();
  /** Activity → Sold → "Total sold" row's Amount cell (3rd column). */
  const soldTotalAmount = (): Locator =>
    page.getByTestId("gift-cards-activity-sold-total").locator("td").nth(2);
  /** Roll-forward tie check: "Ties to the live balance." (success alert). */
  const rollForwardTies = (): Locator =>
    page.getByTestId("gift-cards-roll-forward-ties");
  /** Roll-forward off-by alert (shown instead of the tie when it doesn't). */
  const rollForwardOff = (): Locator =>
    page.getByTestId("gift-cards-roll-forward-off");
  const exportButton = (): Locator => page.getByTestId("gift-cards-export");
  /**
   * "Download every card": opens the confirm warning, checks it with
   * `onWarning`, confirms, and returns the download.
   */
  const exportCsv = async (
    onWarning?: (dialog: Locator) => Promise<void>
  ): Promise<Download> => {
    await exportButton().click();
    await expect(confirmDialog()).toBeVisible({ timeout: 10_000 });
    if (onWarning) await onWarning(confirmDialog());
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      confirmButton().click(),
    ]);
    return download;
  };

  // ── Disputes (Billing → Chargebacks) ───────────────────────────────────
  // Each dispute is an outlined Paper (DisputeCard): no rows, no dialog, no
  // test id. A gift card dispute carries the line "Gift card <maskedCode>"
  // and, inside the portal, an "Open card" button that pushes
  // `?tab=gift-cards&card=<id>`.
  const gotoDisputes = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Billing&section=disputes`,
      { waitUntil: "domcontentloaded" }
    );
  };
  // The innermost outlined Paper holding the line: an outer outlined wrapper
  // holding the same text is excluded, so the locator never matches two
  // elements (strict mode).
  const disputeCard = (maskedCode: string): Locator => {
    const line = `Gift card ${maskedCode}`;
    return page
      .locator(".MuiPaper-outlined")
      .filter({ hasText: line })
      .filter({
        hasNot: page.locator(".MuiPaper-outlined", { hasText: line }),
      });
  };
  const disputeOpenCard = (maskedCode: string): Locator =>
    disputeCard(maskedCode).getByRole("button", { name: "Open card" });

  return {
    goto,
    gotoChain,
    section,
    sidebarItem,
    sidebarOrder,
    chainSidebarItem,
    sectionTab,
    sectionPanel,
    openSection,
    owedBlock,
    owedFigure,
    owedHint,
    byLocationRows,
    byLocationRow,
    byLocationOwed,
    searchInput,
    search,
    rows,
    rowById,
    row,
    rowStatus,
    openCard,
    drawer,
    drawerCode,
    drawerStatus,
    closeCard,
    historyLabels,
    freezeBanner,
    freezeButton,
    freeze,
    unfreezeButton,
    unfreezeBlocked,
    unfreeze,
    confirmDialog,
    confirmButton,
    settingsPanel,
    settingsPresets,
    presetInput,
    addPreset,
    removeAllPresets,
    removeLastPreset,
    settingsSwitch,
    presetsError,
    saveButton,
    saveSettings,
    discardChanges,
    chainLevelNotice,
    openChainSettings,
    reportTab,
    openReport,
    reportHint,
    soldTotalAmount,
    rollForwardTies,
    rollForwardOff,
    exportButton,
    exportCsv,
    gotoDisputes,
    disputeCard,
    disputeOpenCard,
  };
};
