# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/supply-shop.spec.ts >> Admin — Supply shop >> TC-459: the Fulfil dialog prefills the anchor price, shows the range the owner saw, and warns when the final price leaves it
- Location: tests/dashboard/admin/supply-shop.spec.ts:273:7

# Error details

```
TimeoutError: locator.fill: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('dialog').locator('#fulfil-vendor')

```

# Test source

```ts
  91  |   };
  92  | 
  93  |   /** Debounced server-search Autocomplete — needs real keystrokes. */
  94  |   const pickRestaurant = async (name: string) => {
  95  |     const input = dialog().locator("#place-restaurant");
  96  |     await input.click();
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
> 191 |     await vendorInput().fill(opts.vendor);
      |                         ^ TimeoutError: locator.fill: Timeout 15000ms exceeded.
  192 |     await unitCost().fill(String(opts.unitCost));
  193 |     await shippingCost().fill(String(opts.shippingCost));
  194 |     if (opts.ref) await vendorRef().fill(opts.ref);
  195 |   };
  196 | 
  197 |   /** Submit the dialog and return the fulfil response body. */
  198 |   const submitFulfil = async () => {
  199 |     const fulfil = page.waitForResponse(
  200 |       (r) => /\/fulfil$/.test(r.url()) && r.request().method() === "POST"
  201 |     );
  202 |     await confirmButton().click();
  203 |     const res = await fulfil;
  204 |     expect(res.ok(), `fulfil → ${res.status()}`).toBeTruthy();
  205 |     await expect(dialog()).toBeHidden();
  206 |     return (await res.json()) as {
  207 |       data: {
  208 |         settled: boolean;
  209 |         hostedPaymentUrl: string | null;
  210 |         giftCardBatchId?: string | null;
  211 |       };
  212 |     };
  213 |   };
  214 | 
  215 |   const cancelDialog = async () => {
  216 |     await dialog().getByRole("button", { name: "Cancel", exact: true }).click();
  217 |     await expect(dialog()).toBeHidden();
  218 |   };
  219 | 
  220 |   const paymentLinkNotice = () =>
  221 |     page.getByText("The restaurant has been emailed a payment link", {
  222 |       exact: false,
  223 |     });
  224 | 
  225 |   /** The ⋮ menu on a row — brief pack, print file and card export live there. */
  226 |   const openRowMenu = async (orderNumber: string) => {
  227 |     await rowButton(orderNumber, "More actions").click();
  228 |     await expect(page.getByRole("menu")).toBeVisible();
  229 |   };
  230 |   const menuItem = (name: string) =>
  231 |     page.getByRole("menuitem", { name, exact: true });
  232 |   const closeRowMenu = () => page.keyboard.press("Escape");
  233 | 
  234 |   /** "Card export" (in the ⋮ menu) downloads through apiService as a blob — a real download event. */
  235 |   const downloadCardExport = async (orderNumber: string) => {
  236 |     await openRowMenu(orderNumber);
  237 |     const [download] = await Promise.all([
  238 |       page.waitForEvent("download", { timeout: 60_000 }),
  239 |       menuItem("Card export").click(),
  240 |     ]);
  241 |     return download;
  242 |   };
  243 | 
  244 |   return {
  245 |     goto,
  246 |     openTab,
  247 |     selectHistoryStatus,
  248 |     row,
  249 |     rowChip,
  250 |     rowButton,
  251 |     dialog,
  252 |     openUploadArtwork,
  253 |     uploadArtwork,
  254 |     artworkPassed,
  255 |     artworkBlocked,
  256 |     sendProof,
  257 |     openPlaceDialog,
  258 |     pickRestaurant,
  259 |     pickProduct,
  260 |     pickQuantity,
  261 |     placeEstimate,
  262 |     placeVendorCost,
  263 |     placeMessage,
  264 |     placeAdminNotes,
  265 |     placeCompReason,
  266 |     billingRadio,
  267 |     termRadio,
  268 |     submitPlace,
  269 |     openFulfil,
  270 |     proofPendingBanner,
  271 |     compSwitch,
  272 |     compReason,
  273 |     finalUnit,
  274 |     finalShipping,
  275 |     finalTotalLine,
  276 |     outsideEstimateWarning,
  277 |     willChargeAlert,
  278 |     alreadySettledAlert,
  279 |     routeSelect,
  280 |     vendorInput,
  281 |     unitCost,
  282 |     shippingCost,
  283 |     vendorRef,
  284 |     marginLine,
  285 |     confirmButton,
  286 |     fillVendorSection,
  287 |     submitFulfil,
  288 |     cancelDialog,
  289 |     paymentLinkNotice,
  290 |     openRowMenu,
  291 |     menuItem,
```