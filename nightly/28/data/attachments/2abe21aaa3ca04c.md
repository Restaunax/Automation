# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/demo/02-demo-actions.spec.ts >> Admin — Demo Request Actions >> TC-09: admin sees delete confirmation and can cancel
- Location: tests/dashboard/admin/demo/02-demo-actions.spec.ts:201:9

# Error details

```
TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
Call log:
  - waiting for locator('input[placeholder*="Search by ID"]') to be visible

```

# Test source

```ts
  1   | import { type Page, type Locator, expect } from "@playwright/test";
  2   | 
  3   | export const createAdminDemoManagementPage = (page: Page) => {
  4   |   const searchInput = page.locator('input[placeholder*="Search by ID"]');
  5   |   const actionMenu = page.locator('[role="menu"]');
  6   |   const listbox = page.locator('[role="listbox"]');
  7   | 
  8   |   const goto = async () => {
  9   |     await page.goto("/admin?tab=operations&section=demo", {
  10  |       waitUntil: "domcontentloaded",
  11  |     });
> 12  |     await searchInput.waitFor({ state: "visible", timeout: 15_000 });
      |                       ^ TimeoutError: locator.waitFor: Timeout 15000ms exceeded.
  13  |   };
  14  | 
  15  |   const searchByEmail = async (email: string) => {
  16  |     // Register BEFORE fill so the promise is already listening when the
  17  |     // debounced (~800ms) search GET fires. networkidle is deliberately NOT
  18  |     // used anywhere in this suite — the dashboard has background polling that
  19  |     // never settles (see SignInPage.waitForDashboard). `q=` distinguishes the
  20  |     // search call from the initial page-load GET. Swallowing the timeout is
  21  |     // safe: the caller's row assertion is the real check.
  22  |     const responsePromise = page.waitForResponse(
  23  |       (r) => r.url().includes("/api/demo-requests") && r.url().includes("q="),
  24  |       { timeout: 10_000 }
  25  |     );
  26  |     await searchInput.clear();
  27  |     await searchInput.fill(email);
  28  |     await responsePromise.catch(() => {});
  29  |   };
  30  | 
  31  |   const findRowByEmail = (email: string): Locator =>
  32  |     page.locator("tbody tr").filter({ hasText: email });
  33  | 
  34  |   const assertRowExists = async (email: string): Promise<Locator> => {
  35  |     const row = findRowByEmail(email);
  36  |     await expect(row).toBeVisible({ timeout: 10_000 });
  37  |     return row;
  38  |   };
  39  | 
  40  |   const getStatusFromRow = async (row: Locator) =>
  41  |     (await row.locator('[role="combobox"] .MuiChip-label').textContent()) ?? "";
  42  | 
  43  |   const getCreatedAtFromRow = async (row: Locator) =>
  44  |     ((await row.locator("td").first().textContent()) ?? "").trim();
  45  | 
  46  |   const openActionMenu = async (email: string) => {
  47  |     await findRowByEmail(email).locator('button[aria-label="Actions"]').click();
  48  |     await actionMenu.waitFor({ state: "visible", timeout: 5_000 });
  49  |   };
  50  | 
  51  |   const menuActionItem = (label: string): Locator =>
  52  |     actionMenu.getByText(label, { exact: true });
  53  | 
  54  |   const clickMenuAction = async (label: string) =>
  55  |     menuActionItem(label).click();
  56  | 
  57  |   // The inline status Select renders its value as a Chip inside the combobox.
  58  |   const statusChip = (email: string): Locator =>
  59  |     findRowByEmail(email).locator('[role="combobox"] .MuiChip-label');
  60  | 
  61  |   const confirmDialog = (): Locator => page.locator('[role="dialog"]');
  62  | 
  63  |   const changeStatusInline = async (email: string, status: string) => {
  64  |     await findRowByEmail(email).locator('[role="combobox"]').click();
  65  |     await listbox.waitFor({ state: "visible", timeout: 5_000 });
  66  |     // Wait for the status PUT the option click fires (registered before the
  67  |     // click; networkidle never settles on this dashboard — see searchByEmail).
  68  |     // Swallowing the timeout is safe: callers assert the chip text after.
  69  |     const responsePromise = page.waitForResponse(
  70  |       (r) =>
  71  |         r.request().method() === "PUT" &&
  72  |         r.url().includes("/api/demo-requests/"),
  73  |       { timeout: 10_000 }
  74  |     );
  75  |     await listbox.getByRole("option", { name: status, exact: true }).click();
  76  |     await responsePromise.catch(() => {});
  77  |   };
  78  | 
  79  |   // SideSheet = right-anchored MUI Drawer; Dialog = standard MUI modal.
  80  |   const assertSideSheetOpen = (text: string) =>
  81  |     expect(
  82  |       page.locator(".MuiDrawer-paper").filter({ hasText: text })
  83  |     ).toBeVisible({ timeout: 10_000 });
  84  | 
  85  |   const assertDialogOpen = (text: string) =>
  86  |     expect(
  87  |       page.locator('[role="dialog"]').filter({ hasText: text })
  88  |     ).toBeVisible({ timeout: 10_000 });
  89  | 
  90  |   const closeSideSheet = async () => {
  91  |     await page
  92  |       .locator(".MuiDrawer-paper")
  93  |       .getByRole("button", { name: "Close" })
  94  |       .click();
  95  |     await page
  96  |       .locator(".MuiDrawer-paper")
  97  |       .waitFor({ state: "hidden", timeout: 5_000 });
  98  |   };
  99  | 
  100 |   const closeDialog = async () => {
  101 |     await page
  102 |       .locator('[role="dialog"]')
  103 |       .getByRole("button", { name: /cancel|close/i })
  104 |       .first()
  105 |       .click();
  106 |     await page
  107 |       .locator('[role="dialog"]')
  108 |       .waitFor({ state: "hidden", timeout: 5_000 });
  109 |   };
  110 | 
  111 |   // ── View/Edit Details — notes field ─────────────────────────────────────
  112 |   // Saving PUTs /api/demo-requests/:id and the drawer auto-closes on success
```