import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Admin — Cards & Codes → Gift Cards (`/admin?tab=cards&section=gift-cards`),
 * the "Existing gift cards" panel: adopt the cards a restaurant sold before it
 * joined us, download the scope's whole liability, and undo an import that went
 * to the wrong place.
 *
 * Same page as AdminGiftCardBatchesPage and scoped the same way, by the
 * ScopePicker autocomplete — but it waits on this panel's own heading, so a
 * failure says which panel never appeared.
 *
 * The import dialog stacks TWO MUI dialogs: BaseDialog stays mounted while the
 * confirm from ConfirmProvider opens on top. A bare `getByRole("dialog")` is
 * therefore ambiguous once confirming, which is why the confirm helpers below
 * reach for `.last()`.
 */
export const createAdminGiftCardImportPage = (page: Page) => {
  const goto = async (restaurantName: string) => {
    await page.goto("/admin?tab=cards&section=gift-cards", {
      waitUntil: "domcontentloaded",
    });
    const scope = page.locator("#scope-picker-input");
    await scope.waitFor({ state: "visible", timeout: 15_000 });
    await scope.click();
    await scope.pressSequentially(restaurantName, { delay: 100 });
    await page.getByRole("option", { name: restaurantName }).first().click();
    await expect(page.getByText("Existing gift cards")).toBeVisible({
      timeout: 15_000,
    });
  };

  const panel = () =>
    page
      .getByText("Existing gift cards")
      .locator("xpath=ancestor::div[contains(@class,'MuiPaper-root')][1]");

  /** The import wizard. Still mounted underneath the confirm, hence `.first()`. */
  const wizard = () => page.getByRole("dialog").first();
  /** Whatever dialog is on top — the confirm once it has opened. */
  const topDialog = () => page.getByRole("dialog").last();

  const openImport = async () => {
    await panel().getByRole("button", { name: "Import cards" }).click();
    await expect(wizard()).toContainText("Import existing gift cards");
  };

  /**
   * Feed the CSV in from memory and wait for the server's verdict. No file on
   * disk: the codes have to be unique per run (see utils/giftCardCsvFixture).
   */
  const chooseFile = async (csv: string, filename = "gift-cards.csv") => {
    const preview = page.waitForResponse(
      (r) =>
        /\/api\/admin\/gift-cards\/import\/preview/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await wizard()
      .locator('input[type="file"]')
      .setInputFiles({
        name: filename,
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf8"),
      });
    await wizard().getByRole("button", { name: "Check the file" }).click();
    const res = await preview;
    expect(res.ok(), `preview → ${res.status()}`).toBeTruthy();
    return (await res.json()) as {
      data: { willCreate: number; willSkip: number; totalValue: number };
    };
  };

  /** Step 2 chips, so a spec can assert what the admin was actually shown. */
  const reviewChip = (text: string | RegExp): Locator =>
    wizard().getByText(text);

  /**
   * Commit. The confirm makes you type the card count back — deleting or
   * creating live cards on a mis-click is not recoverable — so this fills it.
   */
  const confirmImport = async (cardCount: number) => {
    const commit = page.waitForResponse(
      (r) =>
        /\/api\/admin\/gift-cards\/import(\?|$)/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await wizard().getByRole("button", { name: "Import cards" }).click();
    await expect(topDialog()).toContainText("Import these gift cards?");
    const typeToConfirm = topDialog().locator("input[type='text']");
    if (await typeToConfirm.count())
      await typeToConfirm.first().fill(String(cardCount));
    await topDialog().getByRole("button", { name: "Import" }).click();
    const res = await commit;
    expect(res.ok(), `import → ${res.status()}`).toBeTruthy();
    return (await res.json()) as {
      data: { importId: string; created: number; skipped: number };
    };
  };

  const closeWizard = async () => {
    await wizard().getByRole("button", { name: "Close" }).click();
    await expect(wizard()).toBeHidden();
  };

  const historyRow = (label: string): Locator =>
    panel().getByRole("row").filter({ hasText: label });

  /** Undo an import — refused by the server once any card has been used. */
  const revert = async (label: string, cardCount: number) => {
    const done = page.waitForResponse(
      (r) =>
        /\/api\/admin\/gift-cards\/imports\/[^/]+\/revert/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await historyRow(label).getByRole("button", { name: "Undo" }).click();
    await expect(topDialog()).toContainText("Undo this import?");
    const typeToConfirm = topDialog().locator("input[type='text']");
    if (await typeToConfirm.count())
      await typeToConfirm.first().fill(String(cardCount));
    await topDialog().getByRole("button", { name: "Undo" }).click();
    const res = await done;
    expect(res.ok(), `revert → ${res.status()}`).toBeTruthy();
  };

  /** Bearer material: the download is behind a confirm, like the batch export. */
  const downloadAll = async () => {
    const download = page.waitForEvent("download");
    await panel().getByRole("button", { name: "Download cards" }).click();
    await expect(topDialog()).toContainText("Download every card number?");
    await topDialog().getByRole("button", { name: "Download" }).click();
    return download;
  };

  return {
    goto,
    panel,
    wizard,
    topDialog,
    openImport,
    chooseFile,
    reviewChip,
    confirmImport,
    closeWizard,
    historyRow,
    revert,
    downloadAll,
  };
};

export type AdminGiftCardImportPage = ReturnType<
  typeof createAdminGiftCardImportPage
>;
