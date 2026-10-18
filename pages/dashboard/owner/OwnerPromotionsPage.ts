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
 * Cells: 0 promotion · 1 type · 2 how customers get it · 3 status · 4 uses ·
 * 5 savings given · 6 actions.
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
   * Pause / Turn on from the row menu; resolves with the status write's
   * response (deal: PATCH /api/deals/:id/status, coupon: PUT /api/coupons/:id).
   * A deal refused at the 10-active cap answers 400 MAX_ACTIVE_DEALS_REACHED
   * and opens the "Too many promotions on" dialog (close it with
   * `confirmDialog("OK")`).
   */
  const setStatusFromMenu = async (
    name: string,
    action: "Pause" | "Turn on"
  ): Promise<{ status: number; body: { error?: string } | null }> => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/api\/(deals\/[^/]+\/status|coupons\/[^/]+)$/.test(
            new URL(r.url()).pathname
          ) && ["PATCH", "PUT"].includes(r.request().method())
      ),
      openRowAction(name, action),
    ]);
    return {
      status: res.status(),
      // A non-JSON error body leaves only the status to assert on.
      body: (await res.json().catch(() => null)) as { error?: string } | null,
    };
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

  /** Cells 4 and 5: "Uses" (a plain count) and "Savings given" ("$5.50"). */
  const expectRowUses = (name: string, uses: number) =>
    expect(cell(name, 4)).toHaveText(String(uses));
  const expectRowSavings = (name: string, savings: string) =>
    expect(cell(name, 5)).toHaveText(savings);

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

  /**
   * The "Send a promotion" dialog (row action "Send to customers" on a
   * restaurant list). Opened from a row it starts on that promotion in
   * "One of your promotions" mode; with no customer it asks for the
   * recipient's email. Resolves with the send's response
   * (POST …/send-to-contact).
   */
  const sendDialog = () =>
    page.getByRole("dialog").filter({ hasText: "Send a promotion" });

  const sendToEmail = async (
    name: string,
    email: string
  ): Promise<{ status: number }> => {
    await openRowAction(name, "Send to customers");
    const dialog = sendDialog();
    await expect(dialog).toBeVisible();
    // The picker starts on the row's promotion.
    await expect(dialog.locator("#send-promotion-picker")).toHaveText(name);
    await dialog.getByRole("radio", { name: "Email", exact: true }).check();
    await dialog.getByLabel("Their email", { exact: true }).fill(email);
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/send-to-contact$/.test(new URL(r.url()).pathname) &&
          r.request().method() === "POST"
      ),
      dialog.getByRole("button", { name: "Send", exact: true }).click(),
    ]);
    await expect(dialog).toBeHidden();
    return { status: res.status() };
  };

  /** The dialog's success toast ("Promotion sent."). */
  const sentToast = () => page.getByText("Promotion sent.", { exact: true });

  /**
   * Promotions › Send & campaigns, opened on one promotion (the list's
   * chain Send uses the same `promotion=` link). A coupon shows its
   * "Send history" panel under the send form.
   */
  const gotoCampaigns = async (restaurantId: string, promotionId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=promotion-campaigns&promotion=${promotionId}`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(
      page.getByRole("heading", { name: "Send history", exact: true })
    ).toBeVisible({ timeout: 20_000 });
  };

  /** One card of the Send history panel, found by its label. */
  const sendHistoryEvent = (label: string | RegExp) =>
    page
      .locator(".MuiCard-root")
      .filter({ has: page.getByText(label, { exact: true }) });

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
    setStatusFromMenu,
    confirmDialog,
    cancelDialog,
    expectRow,
    expectNoRow,
    expectRowStatus,
    expectRowUses,
    expectRowSavings,
    expectRowCode,
    expectSectionDisabled,
    sendDialog,
    sendToEmail,
    sentToast,
    gotoCampaigns,
    sendHistoryEvent,
  };
};

export type OwnerPromotionsPage = ReturnType<typeof createOwnerPromotionsPage>;
