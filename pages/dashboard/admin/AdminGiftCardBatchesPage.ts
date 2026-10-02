import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Admin — Cards & Codes → Gift Cards (`/admin?tab=cards&section=gift-cards`),
 * the "Physical card stock" panel: mint a batch, export its codes, freeze
 * unsold stock. The whole page is scoped by the ScopePicker autocomplete
 * (`#scope-picker-input`), so `goto` takes the restaurant name to scope to.
 */
export const createAdminGiftCardBatchesPage = (page: Page) => {
  const goto = async (restaurantName: string) => {
    await page.goto("/admin?tab=cards&section=gift-cards", {
      waitUntil: "domcontentloaded",
    });
    const scope = page.locator("#scope-picker-input");
    await scope.waitFor({ state: "visible", timeout: 15_000 });
    await scope.click();
    await scope.pressSequentially(restaurantName, { delay: 100 });
    await page.getByRole("option", { name: restaurantName }).first().click();
    await expect(page.getByText("Physical card stock")).toBeVisible({
      timeout: 15_000,
    });
  };

  const panel = () =>
    page
      .getByText("Physical card stock")
      .locator("xpath=ancestor::div[contains(@class,'MuiPaper-root')][1]");

  const dialog = () => page.getByRole("dialog");

  const openMint = async () => {
    await panel().getByRole("button", { name: "Mint a batch" }).click();
    await expect(dialog()).toContainText("Mint a batch of physical cards");
  };

  const mintBatch = async (opts: {
    label: string;
    quantity: number;
    vendorRef?: string;
  }) => {
    await openMint();
    await dialog().locator("#batch-label").fill(opts.label);
    await dialog().locator("#batch-quantity").fill(String(opts.quantity));
    if (opts.vendorRef)
      await dialog().locator("#batch-vendor").fill(opts.vendorRef);
    const create = page.waitForResponse(
      (r) =>
        /\/api\/admin\/gift-cards\/batches$/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await dialog().getByRole("button", { name: "Mint a batch" }).click();
    const res = await create;
    expect(res.ok(), `mint → ${res.status()}`).toBeTruthy();
    await expect(dialog()).toBeHidden();
    await expect(page.getByText("Batch minted.")).toBeVisible();
    return (await res.json()) as { data: { id: string } };
  };

  const batchRow = (label: string): Locator =>
    panel().getByRole("row").filter({ hasText: label });

  const stockText = (label: string, count: number) =>
    batchRow(label).getByText(`${count} in stock`);
  const frozenText = (label: string, count: number) =>
    batchRow(label).getByText(`${count} frozen`);

  /** "Card export" → confirm "Download" → a real download (blob through apiService). */
  const exportCsv = async (label: string) => {
    await batchRow(label).getByRole("button", { name: "Card export" }).click();
    await expect(dialog()).toContainText("Download live card codes?");
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      dialog().getByRole("button", { name: "Download", exact: true }).click(),
    ]);
    return download;
  };

  const freezeStock = async (label: string) => {
    await batchRow(label).getByRole("button", { name: "Freeze stock" }).click();
    await expect(dialog()).toContainText(
      "Freeze the unsold cards in this batch?"
    );
    const freeze = page.waitForResponse(
      (r) =>
        /\/batches\/[^/]+\/freeze$/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await dialog().getByRole("button", { name: "Freeze", exact: true }).click();
    const res = await freeze;
    expect(res.ok(), `freeze → ${res.status()}`).toBeTruthy();
    await expect(page.getByText("Unsold stock frozen.")).toBeVisible();
    return (await res.json()) as { data: { frozen: number } };
  };

  return {
    goto,
    panel,
    dialog,
    openMint,
    mintBatch,
    batchRow,
    stockText,
    frozenText,
    exportCsv,
    freezeStock,
  };
};

export type AdminGiftCardBatchesPage = ReturnType<
  typeof createAdminGiftCardBatchesPage
>;
