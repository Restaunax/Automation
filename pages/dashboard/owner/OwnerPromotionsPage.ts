import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Owner — Promotions › All promotions
 * (/restaurant/restaurantId/:id/restaurantManagement?tab=promotions, chain
 * shell /chain/:groupId/restaurantManagement?tab=promotions).
 *
 * One list for coupons and deals (spec: restaunax docs/features/PROMOTIONS.md
 * → "Dashboard as built"). Copy comes from the dashboard's
 * public/locales/en/promotions.json: statuses read "Live" / "Scheduled" /
 * "Paused" / "Ended" (not "Active"), and the "How customers get it" chip reads
 * "Menu", "Code <CODE>", "Menu + code <CODE>" or "One-time codes".
 *
 * Locator strategy: the section ships no test ids. Rows are table rows found
 * by their title cell; the filters are found by their stable ids
 * (#promotions-status-filter); the row menu by its aria-label
 * "Actions for <title>". The list paginates at 10 rows, and other files add
 * promotions to the shared seed restaurant in parallel, so `goto` switches to
 * 50 rows per page before any row lookup.
 */

export type PromotionStatusFilter =
  | "All"
  | "Live"
  | "Scheduled"
  | "Paused"
  | "Ended";

export type PromotionRowAction =
  | "Edit"
  | "Send to customers"
  | "Duplicate"
  | "Pause"
  | "Turn on"
  | "Delete";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const createOwnerPromotionsPage = (page: Page) => {
  const heading = () =>
    page.getByRole("heading", { name: "Promotions", level: 1, exact: true });
  const table = () => page.getByRole("table", { name: "Promotions" });
  const emptyState = () => page.getByText("No promotions yet", { exact: true });
  const rowsPerPage = () =>
    page.getByRole("combobox", { name: /Rows per page/ });

  /** List finished loading: the table or the empty state is on screen. */
  const expectLoaded = async () => {
    await expect(heading()).toBeVisible({ timeout: 20_000 });
    await expect(table().or(emptyState())).toBeVisible({ timeout: 20_000 });
  };

  /** Show up to 50 rows so a row is never hidden on page 2. */
  const showAllRows = async () => {
    await expectLoaded();
    if (!(await table().isVisible())) return;
    const select = rowsPerPage();
    if ((await select.textContent())?.trim() === "50") return;
    await select.click();
    await page.getByRole("option", { name: "50", exact: true }).click();
    await expect(select).toHaveText("50");
  };

  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=promotions`,
      { waitUntil: "domcontentloaded" }
    );
    await expectLoaded();
    await showAllRows();
  };

  const gotoChain = async (groupId: string) => {
    await page.goto(`/chain/${groupId}/restaurantManagement?tab=promotions`, {
      waitUntil: "domcontentloaded",
    });
    await expectLoaded();
    await showAllRows();
  };

  /** The header's "Create promotion" button (the empty state repeats it as a link). */
  const clickCreate = () =>
    page
      .getByRole("button", { name: "Create promotion", exact: true })
      .first()
      .click();

  /** Opens an old bookmark (`?tab=coupons`, `?tab=ai-deals`, …) as-is. */
  const gotoLegacyTab = async (restaurantId: string, tab: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=${tab}`,
      { waitUntil: "domcontentloaded" }
    );
  };

  /** The table row whose title cell is exactly `name`. */
  const row = (name: string): Locator =>
    table()
      .getByRole("row")
      .filter({ has: page.getByText(name, { exact: true }) });

  /** Cells: 0 promotion · 1 type · 2 how customers get it · 3 status. */
  const cell = (name: string, index: number) =>
    row(name).getByRole("cell").nth(index);

  const filterStatus = async (status: PromotionStatusFilter) => {
    await page.locator("#promotions-status-filter").click();
    await page.getByRole("option", { name: status, exact: true }).click();
  };

  const openRowAction = async (name: string, action: PromotionRowAction) => {
    await row(name)
      .getByRole("button", { name: `Actions for ${name}`, exact: true })
      .click();
    // A disabled item carries its reason as secondary text, so match the
    // label at the start of the accessible name.
    await page
      .getByRole("menuitem", { name: new RegExp(`^${escapeRegex(action)}`) })
      .click();
  };

  /**
   * Confirms the open dialog (delete confirm, chain fan-out confirm). The
   * confirm button is the last action; pass `name` to pin its label.
   */
  const confirmDialog = async (name?: string) => {
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const button = name
      ? dialog.getByRole("button", { name, exact: true })
      : dialog.locator(".MuiDialogActions-root button").last();
    await button.click();
    await expect(dialog).toBeHidden();
  };

  /** Dismisses the open dialog with its Cancel button. */
  const cancelDialog = async () => {
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeHidden();
  };

  const expectRow = (name: string) => expect(row(name)).toBeVisible();
  const expectNoRow = (name: string) => expect(row(name)).toHaveCount(0);

  /** `status` is the chip copy: "Live", "Scheduled", "Paused" or "Ended". */
  const expectRowStatus = (name: string, status: string) =>
    expect(cell(name, 3)).toHaveText(status);

  /** null = the promotion shows no code ("Menu" — applies by itself). */
  const expectRowCode = async (name: string, code: string | null) => {
    if (code === null) {
      await expect(cell(name, 2)).toHaveText("Menu");
    } else {
      await expect(cell(name, 2)).toHaveText(
        new RegExp(`^(Menu \\+ code|Code) ${escapeRegex(code)}$`)
      );
    }
  };

  /** A chain member opened a centralized promotions tab. */
  const expectSectionDisabled = () =>
    expect(
      page.getByText("Managed at chain level", { exact: true }).first()
    ).toBeVisible({ timeout: 20_000 });

  return {
    heading,
    table,
    emptyState,
    goto,
    gotoChain,
    clickCreate,
    gotoLegacyTab,
    expectLoaded,
    showAllRows,
    row,
    filterStatus,
    openRowAction,
    confirmDialog,
    cancelDialog,
    expectRow,
    expectNoRow,
    expectRowStatus,
    expectRowCode,
    expectSectionDisabled,
  };
};

export type OwnerPromotionsPage = ReturnType<typeof createOwnerPromotionsPage>;
