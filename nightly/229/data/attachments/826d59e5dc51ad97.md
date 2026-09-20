# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/supply-shop.spec.ts >> Admin — Supply shop >> TC-461: 'Place order for a restaurant' (charge) creates the owner's order with an admin-named design and no leaked notes
- Location: tests/dashboard/admin/supply-shop.spec.ts:354:7

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('dialog').locator('#place-restaurant')

```

# Test source

```ts
  1   | import { type Page, type Locator, expect } from "@playwright/test";
  2   | 
  3   | /**
  4   |  * Admin — Cards & Codes → Supply Shop (`/admin?tab=cards&section=supply-shop`).
  5   |  *
  6   |  * Three queues (Design queue / Fulfilment / History) over one table, plus the
  7   |  * three dialogs that move an order along: Upload artwork (design), the
  8   |  * place-on-behalf dialog, and Fulfil (where the money moves). The admin
  9   |  * table is cross-tenant on shared QA, so every row lookup is by order number.
  10  |  */
  11  | export const createAdminSupplyShopPage = (page: Page) => {
  12  |   const goto = async () => {
  13  |     await page.goto("/admin?tab=cards&section=supply-shop", {
  14  |       waitUntil: "domcontentloaded",
  15  |     });
  16  |     await expect(page.getByRole("tab", { name: "Design queue" })).toBeVisible({
  17  |       timeout: 15_000,
  18  |     });
  19  |   };
  20  | 
  21  |   const openTab = async (name: "Design queue" | "Fulfilment" | "History") => {
  22  |     await page.getByRole("tab", { name }).click();
  23  |     await expect(page.getByRole("tab", { name })).toHaveAttribute(
  24  |       "aria-selected",
  25  |       "true"
  26  |     );
  27  |   };
  28  | 
  29  |   /** History tab status filter (MUI Select) — options carry the owner-facing labels. */
  30  |   const selectHistoryStatus = async (optionLabel: string) => {
  31  |     await page.locator('[role="combobox"]').first().click();
  32  |     await page.getByRole("option", { name: optionLabel, exact: true }).click();
  33  |   };
  34  | 
  35  |   const row = (orderNumber: string): Locator =>
  36  |     page.getByRole("row").filter({ hasText: orderNumber });
  37  | 
  38  |   const rowChip = (orderNumber: string, label: string) =>
  39  |     row(orderNumber).locator(".MuiChip-label", { hasText: label });
  40  | 
  41  |   const rowButton = (orderNumber: string, name: string | RegExp) =>
  42  |     row(orderNumber).getByRole("button", { name });
  43  | 
  44  |   const dialog = () => page.getByRole("dialog");
  45  | 
  46  |   // ── Upload artwork (design queue) ──────────────────────────────────────────
  47  |   const openUploadArtwork = async (orderNumber: string) => {
  48  |     await rowButton(orderNumber, "Upload artwork").click();
  49  |     await expect(dialog()).toContainText("Artwork —");
  50  |   };
  51  | 
  52  |   /** Feed a PDF buffer to the dialog's file input and wait for the preflight verdict. */
  53  |   const uploadArtwork = async (pdf: Buffer, filename = "artwork.pdf") => {
  54  |     const upload = page.waitForResponse(
  55  |       (r) =>
  56  |         /\/api\/admin\/supply-shop\/orders\/[^/]+\/artwork$/.test(r.url()) &&
  57  |         r.request().method() === "POST"
  58  |     );
  59  |     await dialog().locator('input[type="file"]').setInputFiles({
  60  |       name: filename,
  61  |       mimeType: "application/pdf",
  62  |       buffer: pdf,
  63  |     });
  64  |     const res = await upload;
  65  |     expect(res.ok(), `artwork upload → ${res.status()}`).toBeTruthy();
  66  |   };
  67  | 
  68  |   const artworkPassed = () =>
  69  |     dialog().getByText(/looks good and is ready to send/);
  70  |   const artworkBlocked = () =>
  71  |     dialog().getByText("This file cannot go out", { exact: false });
  72  | 
  73  |   const sendProof = async () => {
  74  |     const send = page.waitForResponse(
  75  |       (r) => /\/send-proof$/.test(r.url()) && r.request().method() === "POST"
  76  |     );
  77  |     await dialog().getByRole("button", { name: "Send to restaurant" }).click();
  78  |     const res = await send;
  79  |     expect(res.ok(), `send-proof → ${res.status()}`).toBeTruthy();
  80  |     await expect(dialog().getByRole("button", { name: "Sent" })).toBeVisible();
  81  |     await dialog().getByRole("button", { name: "Done" }).click();
  82  |     await expect(dialog()).toBeHidden();
  83  |   };
  84  | 
  85  |   // ── Place order for a restaurant ───────────────────────────────────────────
  86  |   const openPlaceDialog = async () => {
  87  |     await page
  88  |       .getByRole("button", { name: "Place order for a restaurant" })
  89  |       .click();
  90  |     await expect(dialog()).toContainText("Place an order for a restaurant");
  91  |   };
  92  | 
  93  |   /** Debounced server-search Autocomplete — needs real keystrokes. */
  94  |   const pickRestaurant = async (name: string) => {
  95  |     const input = dialog().locator("#place-restaurant");
> 96  |     await input.click();
      |                 ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  97  |     await input.pressSequentially(name, { delay: 100 });
  98  |     await page.getByRole("option", { name }).first().click();
  99  |   };
  100 | 
  101 |   const selectMui = async (
  102 |     selectLocator: Locator,
  103 |     optionName: string | RegExp
  104 |   ) => {
  105 |     await selectLocator.click();
  106 |     await page.getByRole("option", { name: optionName }).first().click();
  107 |   };
  108 | 
  109 |   const pickProduct = (name: string) =>
  110 |     selectMui(dialog().locator("#place-product"), name);
  111 |   const pickQuantity = (qty: number) =>
  112 |     selectMui(dialog().locator("#place-quantity"), new RegExp(`^${qty}$`));
  113 | 
  114 |   const placeEstimate = () =>
  115 |     dialog().getByText(/^Estimate the restaurant will see: /);
  116 |   const placeVendorCost = () => dialog().getByText(/^Our expected cost: /);
  117 |   const placeMessage = () => dialog().locator("#place-message");
  118 |   const placeAdminNotes = () => dialog().locator("#place-admin-notes");
  119 |   const placeCompReason = () => dialog().locator("#place-comp-reason");
  120 |   const billingRadio = (
  121 |     label: "Charge them when it goes to print" | "Comp — free of charge"
  122 |   ) => dialog().getByRole("radio", { name: label });
  123 |   const termRadio = (label: "Card on file" | "Next invoice") =>
  124 |     dialog().getByRole("radio", { name: label });
  125 | 
  126 |   const submitPlace = async () => {
  127 |     const create = page.waitForResponse(
  128 |       (r) =>
  129 |         /\/api\/admin\/supply-shop\/orders$/.test(r.url()) &&
  130 |         r.request().method() === "POST"
  131 |     );
  132 |     await dialog()
  133 |       .getByRole("button", { name: "Place order", exact: true })
  134 |       .click();
  135 |     const res = await create;
  136 |     expect(res.ok(), `on-behalf → ${res.status()}`).toBeTruthy();
  137 |     await expect(dialog()).toBeHidden();
  138 |     await expect(
  139 |       page.getByText("Order placed for the restaurant.")
  140 |     ).toBeVisible();
  141 |     return (await res.json()) as { data: { id: string; orderNumber: string } };
  142 |   };
  143 | 
  144 |   // ── Fulfil ─────────────────────────────────────────────────────────────────
  145 |   const openFulfil = async (orderNumber: string) => {
  146 |     const draft = page.waitForResponse((r) =>
  147 |       /\/fulfilment-draft\?/.test(r.url())
  148 |     );
  149 |     await rowButton(
  150 |       orderNumber,
  151 |       /^(Finalise & charge|Place with vendor)$/
  152 |     ).click();
  153 |     await draft;
  154 |     await expect(dialog()).toContainText(`Fulfil ${orderNumber}`);
  155 |   };
  156 | 
  157 |   const proofPendingBanner = () =>
  158 |     dialog().getByText("the proof is a look, not a gate", { exact: false });
  159 |   const compSwitch = () => dialog().getByRole("switch");
  160 |   const compReason = () => dialog().locator("#fulfil-comp-reason");
  161 |   const finalUnit = () => dialog().locator("#fulfil-final-unit");
  162 |   const finalShipping = () => dialog().locator("#fulfil-final-shipping");
  163 |   const finalTotalLine = () => dialog().getByText(/^Final total \$/);
  164 |   const outsideEstimateWarning = () =>
  165 |     dialog().getByText("This final price is outside the estimate", {
  166 |       exact: false,
  167 |     });
  168 |   const willChargeAlert = () =>
  169 |     dialog().getByText(
  170 |       /^(Will charge the card on file now\.|Will add it to their next RestauNax invoice\.|Comped — nothing is charged\.|Their free monthly item — nothing is charged\.)$/
  171 |     );
  172 |   const alreadySettledAlert = () => dialog().getByText(/^Already settled: \$/);
  173 |   const routeSelect = () => dialog().locator("#fulfil-route");
  174 |   const vendorInput = () => dialog().locator("#fulfil-vendor");
  175 |   const unitCost = () => dialog().locator("#fulfil-unit");
  176 |   const shippingCost = () => dialog().locator("#fulfil-shipping");
  177 |   const vendorRef = () => dialog().locator("#fulfil-ref");
  178 |   const marginLine = () =>
  179 |     dialog().getByText(/^Revenue \$[\d.,]+ − cost \$[\d.,]+ = /);
  180 |   const confirmButton = () =>
  181 |     dialog().getByRole("button", {
  182 |       name: /^(Finalise & charge|Place with vendor)$/,
  183 |     });
  184 | 
  185 |   const fillVendorSection = async (opts: {
  186 |     vendor: string;
  187 |     unitCost: number;
  188 |     shippingCost: number;
  189 |     ref?: string;
  190 |   }) => {
  191 |     await vendorInput().fill(opts.vendor);
  192 |     await unitCost().fill(String(opts.unitCost));
  193 |     await shippingCost().fill(String(opts.shippingCost));
  194 |     if (opts.ref) await vendorRef().fill(opts.ref);
  195 |   };
  196 | 
```