# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/gift-card-import.spec.ts >> Admin — Importing existing gift cards >> TC-500: importing through the panel creates spendable cards
- Location: tests/dashboard/admin/gift-card-import.spec.ts:149:7

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('dialog').first().getByRole('button', { name: 'Close' }) resolved to 2 elements:
    1) <button tabindex="0" type="button" aria-label="Close" class="MuiButtonBase-root MuiIconButton-root MuiIconButton-sizeSmall css-1n3iu86">…</button> aka getByLabel('Close')
    2) <button tabindex="0" type="button" class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary css-1gbawk9">Close</button> aka getByText('Close')

Call log:
  - waiting for getByRole('dialog').first().getByRole('button', { name: 'Close' })

```

# Test source

```ts
  1   | import { type Page, type Locator, expect } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * Admin — Cards & Codes → Gift Cards (`/admin?tab=cards&section=gift-cards`),
  5   |  * the "Existing gift cards" panel: adopt the cards a restaurant sold before it
  6   |  * joined us, download the scope's whole liability, and undo an import that went
  7   |  * to the wrong place.
  8   |  *
  9   |  * Same page as AdminGiftCardBatchesPage and scoped the same way, by the
  10  |  * ScopePicker autocomplete — but it waits on this panel's own heading, so a
  11  |  * failure says which panel never appeared.
  12  |  *
  13  |  * The import dialog stacks TWO MUI dialogs: BaseDialog stays mounted while the
  14  |  * confirm from ConfirmProvider opens on top. A bare `getByRole("dialog")` is
  15  |  * therefore ambiguous once confirming, which is why the confirm helpers below
  16  |  * reach for `.last()`.
  17  |  */
  18  | export const createAdminGiftCardImportPage = (page: Page) => {
  19  |   const goto = async (restaurantName: string) => {
  20  |     await page.goto("/admin?tab=cards&section=gift-cards", {
  21  |       waitUntil: "domcontentloaded",
  22  |     });
  23  |     const scope = page.locator("#scope-picker-input");
  24  |     await scope.waitFor({ state: "visible", timeout: 15_000 });
  25  |     await scope.click();
  26  |     await scope.pressSequentially(restaurantName, { delay: 100 });
  27  |     await page.getByRole("option", { name: restaurantName }).first().click();
  28  |     await expect(page.getByText("Existing gift cards")).toBeVisible({
  29  |       timeout: 15_000,
  30  |     });
  31  |   };
  32  | 
  33  |   const panel = () =>
  34  |     page
  35  |       .getByText("Existing gift cards")
  36  |       .locator("xpath=ancestor::div[contains(@class,'MuiPaper-root')][1]");
  37  | 
  38  |   /** The import wizard. Still mounted underneath the confirm, hence `.first()`. */
  39  |   const wizard = () => page.getByRole("dialog").first();
  40  |   /** Whatever dialog is on top — the confirm once it has opened. */
  41  |   const topDialog = () => page.getByRole("dialog").last();
  42  | 
  43  |   const openImport = async () => {
  44  |     await panel().getByRole("button", { name: "Import cards" }).click();
  45  |     await expect(wizard()).toContainText("Import existing gift cards");
  46  |   };
  47  | 
  48  |   /**
  49  |    * Feed the CSV in from memory and wait for the server's verdict. No file on
  50  |    * disk: the codes have to be unique per run (see utils/giftCardCsvFixture).
  51  |    */
  52  |   const chooseFile = async (csv: string, filename = "gift-cards.csv") => {
  53  |     const preview = page.waitForResponse(
  54  |       (r) =>
  55  |         /\/api\/admin\/gift-cards\/import\/preview/.test(r.url()) &&
  56  |         r.request().method() === "POST"
  57  |     );
  58  |     await wizard()
  59  |       .locator('input[type="file"]')
  60  |       .setInputFiles({
  61  |         name: filename,
  62  |         mimeType: "text/csv",
  63  |         buffer: Buffer.from(csv, "utf8"),
  64  |       });
  65  |     await wizard().getByRole("button", { name: "Check the file" }).click();
  66  |     const res = await preview;
  67  |     expect(res.ok(), `preview → ${res.status()}`).toBeTruthy();
  68  |     return (await res.json()) as {
  69  |       data: { willCreate: number; willSkip: number; totalValue: number };
  70  |     };
  71  |   };
  72  | 
  73  |   /** Step 2 chips, so a spec can assert what the admin was actually shown. */
  74  |   const reviewChip = (text: string | RegExp): Locator =>
  75  |     wizard().getByText(text);
  76  | 
  77  |   /**
  78  |    * Commit. The confirm makes you type the card count back — deleting or
  79  |    * creating live cards on a mis-click is not recoverable — so this fills it.
  80  |    */
  81  |   const confirmImport = async (cardCount: number) => {
  82  |     const commit = page.waitForResponse(
  83  |       (r) =>
  84  |         /\/api\/admin\/gift-cards\/import(\?|$)/.test(r.url()) &&
  85  |         r.request().method() === "POST"
  86  |     );
  87  |     await wizard().getByRole("button", { name: "Import cards" }).click();
  88  |     await expect(topDialog()).toContainText("Import these gift cards?");
  89  |     const typeToConfirm = topDialog().locator("input[type='text']");
  90  |     if (await typeToConfirm.count())
  91  |       await typeToConfirm.first().fill(String(cardCount));
  92  |     await topDialog().getByRole("button", { name: "Import" }).click();
  93  |     const res = await commit;
  94  |     expect(res.ok(), `import → ${res.status()}`).toBeTruthy();
  95  |     return (await res.json()) as {
  96  |       data: { importId: string; created: number; skipped: number };
  97  |     };
  98  |   };
  99  | 
  100 |   const closeWizard = async () => {
> 101 |     await wizard().getByRole("button", { name: "Close" }).click();
      |                                                           ^ Error: locator.click: Error: strict mode violation: getByRole('dialog').first().getByRole('button', { name: 'Close' }) resolved to 2 elements:
  102 |     await expect(wizard()).toBeHidden();
  103 |   };
  104 | 
  105 |   const historyRow = (label: string): Locator =>
  106 |     panel().getByRole("row").filter({ hasText: label });
  107 | 
  108 |   /** Undo an import — refused by the server once any card has been used. */
  109 |   const revert = async (label: string, cardCount: number) => {
  110 |     const done = page.waitForResponse(
  111 |       (r) =>
  112 |         /\/api\/admin\/gift-cards\/imports\/[^/]+\/revert/.test(r.url()) &&
  113 |         r.request().method() === "POST"
  114 |     );
  115 |     await historyRow(label).getByRole("button", { name: "Undo" }).click();
  116 |     await expect(topDialog()).toContainText("Undo this import?");
  117 |     const typeToConfirm = topDialog().locator("input[type='text']");
  118 |     if (await typeToConfirm.count())
  119 |       await typeToConfirm.first().fill(String(cardCount));
  120 |     await topDialog().getByRole("button", { name: "Undo" }).click();
  121 |     const res = await done;
  122 |     expect(res.ok(), `revert → ${res.status()}`).toBeTruthy();
  123 |   };
  124 | 
  125 |   /** Bearer material: the download is behind a confirm, like the batch export. */
  126 |   const downloadAll = async () => {
  127 |     const download = page.waitForEvent("download");
  128 |     await panel().getByRole("button", { name: "Download cards" }).click();
  129 |     await expect(topDialog()).toContainText("Download every card number?");
  130 |     await topDialog().getByRole("button", { name: "Download" }).click();
  131 |     return download;
  132 |   };
  133 | 
  134 |   return {
  135 |     goto,
  136 |     panel,
  137 |     wizard,
  138 |     topDialog,
  139 |     openImport,
  140 |     chooseFile,
  141 |     reviewChip,
  142 |     confirmImport,
  143 |     closeWizard,
  144 |     historyRow,
  145 |     revert,
  146 |     downloadAll,
  147 |   };
  148 | };
  149 | 
  150 | export type AdminGiftCardImportPage = ReturnType<
  151 |   typeof createAdminGiftCardImportPage
  152 | >;
  153 | 
```