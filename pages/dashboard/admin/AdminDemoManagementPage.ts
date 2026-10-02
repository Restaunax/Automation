import { type Page, type Locator, expect } from "@playwright/test";

export const createAdminDemoManagementPage = (page: Page) => {
  const searchInput = page.locator('input[placeholder*="Search by ID"]');
  const actionMenu = page.locator('[role="menu"]');
  const listbox = page.locator('[role="listbox"]');

  const goto = async () => {
    await page.goto("/admin?tab=operations&section=demo", {
      waitUntil: "domcontentloaded",
    });
    await searchInput.waitFor({ state: "visible", timeout: 15_000 });
  };

  const searchByEmail = async (email: string) => {
    // Register BEFORE fill so the promise is already listening when the
    // debounced (~800ms) search GET fires. networkidle is deliberately NOT
    // used anywhere in this suite — the dashboard has background polling that
    // never settles (see SignInPage.waitForDashboard). `q=` distinguishes the
    // search call from the initial page-load GET. Swallowing the timeout is
    // safe: the caller's row assertion is the real check.
    const responsePromise = page.waitForResponse(
      (r) => r.url().includes("/api/demo-requests") && r.url().includes("q="),
      { timeout: 10_000 }
    );
    await searchInput.clear();
    await searchInput.fill(email);
    await responsePromise.catch(() => {});
  };

  const findRowByEmail = (email: string): Locator =>
    page.locator("tbody tr").filter({ hasText: email });

  const assertRowExists = async (email: string): Promise<Locator> => {
    const row = findRowByEmail(email);
    await expect(row).toBeVisible({ timeout: 10_000 });
    return row;
  };

  const getStatusFromRow = async (row: Locator) =>
    (await row.locator('[role="combobox"] .MuiChip-label').textContent()) ?? "";

  const getCreatedAtFromRow = async (row: Locator) =>
    ((await row.locator("td").first().textContent()) ?? "").trim();

  const openActionMenu = async (email: string) => {
    await findRowByEmail(email).locator('button[aria-label="Actions"]').click();
    await actionMenu.waitFor({ state: "visible", timeout: 5_000 });
  };

  const menuActionItem = (label: string): Locator =>
    actionMenu.getByText(label, { exact: true });

  const clickMenuAction = async (label: string) =>
    menuActionItem(label).click();

  // The inline status Select renders its value as a Chip inside the combobox.
  const statusChip = (email: string): Locator =>
    findRowByEmail(email).locator('[role="combobox"] .MuiChip-label');

  const confirmDialog = (): Locator => page.locator('[role="dialog"]');

  const changeStatusInline = async (email: string, status: string) => {
    await findRowByEmail(email).locator('[role="combobox"]').click();
    await listbox.waitFor({ state: "visible", timeout: 5_000 });
    // Wait for the status PUT the option click fires (registered before the
    // click; networkidle never settles on this dashboard — see searchByEmail).
    // Swallowing the timeout is safe: callers assert the chip text after.
    const responsePromise = page.waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes("/api/demo-requests/"),
      { timeout: 10_000 }
    );
    await listbox.getByRole("option", { name: status, exact: true }).click();
    await responsePromise.catch(() => {});
  };

  // SideSheet = right-anchored MUI Drawer; Dialog = standard MUI modal.
  const assertSideSheetOpen = (text: string) =>
    expect(
      page.locator(".MuiDrawer-paper").filter({ hasText: text })
    ).toBeVisible({ timeout: 10_000 });

  const assertDialogOpen = (text: string) =>
    expect(
      page.locator('[role="dialog"]').filter({ hasText: text })
    ).toBeVisible({ timeout: 10_000 });

  const closeSideSheet = async () => {
    await page
      .locator(".MuiDrawer-paper")
      .getByRole("button", { name: "Close" })
      .click();
    await page
      .locator(".MuiDrawer-paper")
      .waitFor({ state: "hidden", timeout: 5_000 });
  };

  const closeDialog = async () => {
    await page
      .locator('[role="dialog"]')
      .getByRole("button", { name: /cancel|close/i })
      .first()
      .click();
    await page
      .locator('[role="dialog"]')
      .waitFor({ state: "hidden", timeout: 5_000 });
  };

  // ── View/Edit Details — notes field ─────────────────────────────────────
  // Saving PUTs /api/demo-requests/:id and the drawer auto-closes on success
  // (no visible toast) — waiting for the drawer to hide is the success signal.
  const drawer = () => page.locator(".MuiDrawer-paper");
  const notesInput = () => drawer().locator("#notes");

  const fillNotesAndSave = async (notes: string) => {
    await notesInput().fill(notes);
    await drawer().getByRole("button", { name: "Save Changes" }).click();
    await drawer().waitFor({ state: "hidden", timeout: 10_000 });
  };

  // ── Send Follow-up Email — a copy-to-clipboard composer, NOT a sender ─────
  // Since the follow-up redesign (restaunax cf531313a / 984573dcc /
  // 3917f6099) the platform sends nothing: the rep copies the pre-filled
  // draft and sends it from their own inbox. Copying records nothing; an
  // explicit "Mark as contacted" (with an editable send time) POSTs
  // /api/demo-requests/:id/record-followup-outreach, which logs the touch,
  // stops the SLA clock and promotes NEW → CONTACTED. The dialog is titled
  // "Follow-up email" (admin.json demoManagement.dialogs.email.title).
  const followupDialog = (): Locator =>
    page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "Follow-up email" }),
    });
  const followupSubjectInput = () => page.locator("#followup-subject");
  const followupBodyInput = () => page.locator("#followup-body");

  // Opens the "Did you send it?" prompt (no copy needed — copying would only
  // open the same prompt), confirms, and resolves with the outreach response.
  const markFollowupContacted = async () => {
    const dialog = followupDialog();
    await dialog
      .getByRole("button", { name: "Mark as contacted", exact: true })
      .click();
    const prompt = dialog
      .getByRole("alert")
      .filter({ hasText: "Did you send it?" });
    await expect(prompt).toBeVisible();
    await expect(dialog.locator("#followup-sent-at")).toBeVisible();
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          /\/api\/demo-requests\/[^/]+\/record-followup-outreach$/.test(
            r.url()
          ),
        { timeout: 10_000 }
      ),
      prompt
        .getByRole("button", { name: "Mark as contacted", exact: true })
        .click(),
    ]);
    return response;
  };

  const closeFollowupDialog = async () => {
    const dialog = followupDialog();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  };

  // ── Assign Request — autocomplete search + select ───────────────────────
  const assignToUser = async (searchTerm: string, optionPattern: RegExp) => {
    const dialog = page.locator('[role="dialog"]');
    const combo = dialog.getByRole("combobox");
    await combo.click();
    await combo.pressSequentially(searchTerm, { delay: 80 });
    await page
      .getByRole("option", { name: optionPattern })
      .waitFor({ state: "visible", timeout: 10_000 });
    await page.getByRole("option", { name: optionPattern }).click();
    await dialog.getByRole("button", { name: "Assign", exact: true }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  };

  // ── Schedule Demo — masked MM/DD/YYYY hh:mm aa datetime field ───────────
  // The visible widget is a MUI X DatePicker section list, not a plain text
  // input — clicking the (hidden) proxy input doesn't work; click the
  // sections container and type through the keyboard instead.
  const scheduleDemo = async (mmddyyyy: string, hhmmaa: string) => {
    const dialog = page.locator('[role="dialog"]');
    await dialog.locator(".MuiPickersSectionList-root").click();
    await page.keyboard.type(mmddyyyy, { delay: 60 });
    await page.keyboard.type(hhmmaa, { delay: 60 });
    await dialog
      .getByRole("button", { name: "Schedule Demo", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  };

  // ── Delete — real confirm (distinct from the existing Cancel-only path) ─
  const confirmDelete = async () => {
    const dialog = page.locator('[role="dialog"]');
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  };

  return {
    searchInput,
    goto,
    searchByEmail,
    findRowByEmail,
    assertRowExists,
    getStatusFromRow,
    getCreatedAtFromRow,
    openActionMenu,
    menuActionItem,
    clickMenuAction,
    statusChip,
    confirmDialog,
    changeStatusInline,
    assertSideSheetOpen,
    assertDialogOpen,
    closeSideSheet,
    closeDialog,
    notesInput,
    fillNotesAndSave,
    followupSubjectInput,
    followupBodyInput,
    followupDialog,
    markFollowupContacted,
    closeFollowupDialog,
    assignToUser,
    scheduleDemo,
    confirmDelete,
  };
};

export type AdminDemoManagementPage = ReturnType<
  typeof createAdminDemoManagementPage
>;
