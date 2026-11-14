# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/06-orders.spec.ts >> Owner — Orders Tab >> TC-250: the header stat cards reflect the stats API and move when orders are seeded
- Location: tests/dashboard/owner/06-orders.spec.ts:1283:7

# Error details

```
TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
Call log:
  - waiting for locator('.MuiPopover-paper').filter({ hasText: 'Select Date Range' }) to be visible

```

# Test source

```ts
  179 |   const confirmCancelAndRefundButton = () =>
  180 |     cancelRefundDialog().getByRole("button", { name: "Cancel & Refund" });
  181 | 
  182 |   const confirmCancelAndRefund = () => confirmCancelAndRefundButton().click();
  183 | 
  184 |   // ── Toolbar (Orders.tsx <Paper data-tour="orders-toolbar">) ────────────
  185 |   // Everything the owner uses to narrow the grid lives in this Paper. Scoping
  186 |   // to it keeps us clear of the DataGrid's own toolbar (which has its own
  187 |   // "Export"/"Filters" buttons) and the header's date-range controls.
  188 |   const toolbar = () => page.locator('[data-tour="orders-toolbar"]');
  189 | 
  190 |   // Search mode: once a term is set, the date range is ignored server-side and
  191 |   // an info Alert says so, with a "Clear Search" action. The X adornment on the
  192 |   // input (aria-label "Clear search") does the same thing. exact:true matters —
  193 |   // role-name matching is a case-insensitive substring by default.
  194 |   const searchModeBanner = () =>
  195 |     toolbar()
  196 |       .getByRole("alert")
  197 |       .filter({ hasText: /Searching all orders/ });
  198 |   const clearSearchButton = () =>
  199 |     toolbar().getByRole("button", { name: "Clear Search", exact: true });
  200 |   const clearSearchIcon = () =>
  201 |     toolbar().getByRole("button", { name: "Clear search", exact: true });
  202 | 
  203 |   // Filters button carries a count Chip ("1"/"2") when status/type are non-default.
  204 |   const filterCountChip = () => filtersButton().locator(".MuiChip-label");
  205 | 
  206 |   // Second combobox in the filter panel = Order Type (options "All Types",
  207 |   // "Delivery", "Pickup", "Shipping").
  208 |   const typeFilter = () => filterPanel().getByRole("combobox").nth(1);
  209 |   const selectTypeFilter = async (label: string) => {
  210 |     await typeFilter().click();
  211 |     await page.getByRole("option", { name: label, exact: true }).click();
  212 |   };
  213 | 
  214 |   // Sort Select — the only combobox directly inside the toolbar Paper (the
  215 |   // filter panel is a portal). Options: "Newest First" | "Oldest First" |
  216 |   // "Highest Amount" | "Lowest Amount" ↔ createdAt|total : desc|asc.
  217 |   const sortSelect = () => toolbar().getByRole("combobox");
  218 |   const selectSort = async (label: string) => {
  219 |     await sortSelect().click();
  220 |     await page.getByRole("option", { name: label, exact: true }).click();
  221 |   };
  222 | 
  223 |   // Refresh IconButton has NO aria-label and MUI strips icon data-testids in
  224 |   // production builds, so it is "the unlabeled icon button in the toolbar" —
  225 |   // the clear-X has aria-label "Clear search" and Export has "Export Orders".
  226 |   // (Frontend nice-to-have: give it an aria-label; then switch this locator.)
  227 |   const refreshButton = () =>
  228 |     toolbar().locator("button.MuiIconButton-root:not([aria-label])").first();
  229 | 
  230 |   // Export — icon button (Tooltip title → aria-label "Export Orders") opening a
  231 |   // Menu of scopes: "Current View" | "Last 30 Days" | "Last 90 Days" | "All Orders".
  232 |   const exportOrdersButton = () =>
  233 |     toolbar().getByRole("button", { name: "Export Orders", exact: true });
  234 |   const openExportMenu = () => exportOrdersButton().click();
  235 |   const exportMenuItem = (label: string) =>
  236 |     page.getByRole("menuitem").filter({ hasText: label });
  237 |   const exportCurrentView = async () => {
  238 |     await openExportMenu();
  239 |     await exportMenuItem("Current View").click();
  240 |   };
  241 | 
  242 |   // ── Grid pagination (server mode, MUI TablePagination in the footer) ─────
  243 |   const pageSizeSelect = () =>
  244 |     page.getByRole("combobox", { name: /Rows per page/i });
  245 |   const selectPageSize = async (n: number) => {
  246 |     await pageSizeSelect().click();
  247 |     await page.getByRole("option", { name: String(n), exact: true }).click();
  248 |   };
  249 |   const nextPageButton = () =>
  250 |     page.getByRole("button", { name: "Go to next page" });
  251 | 
  252 |   // A grid row is identified by its receipt number cell ("#<receiptNumber>").
  253 |   const rowByReceipt = (receiptNumber: string) =>
  254 |     page
  255 |       .locator('.MuiDataGrid-row[role="row"]')
  256 |       .filter({ hasText: `#${receiptNumber}` });
  257 | 
  258 |   // ── Header (OrderStatistics.tsx): date range + stat cards ────────────────
  259 |   // StatCard title is a Typography h6 rendered as <div> (not a heading role).
  260 |   const statCard = (title: string) =>
  261 |     page.locator(".MuiCard-root").filter({
  262 |       has: page.locator(".MuiTypography-h6", { hasText: title }),
  263 |     });
  264 |   const statCardValue = (title: string) =>
  265 |     statCard(title).locator(".MuiTypography-h4");
  266 | 
  267 |   // The date-range trigger's text is the matched preset name ("Last 7 days" by
  268 |   // default) or a literal range — locate it by its calendar icon + position:
  269 |   // it's the button that opens the "Select Date Range" popover.
  270 |   const dateRangeButton = () =>
  271 |     page
  272 |       .getByRole("button")
  273 |       .filter({ hasText: /Last \d+ days|Today|Yesterday|month|year|\d{4}/ })
  274 |       .first();
  275 |   const dateRangePopover = () =>
  276 |     page.locator(".MuiPopover-paper").filter({ hasText: "Select Date Range" });
  277 |   const openDateRange = async () => {
  278 |     await dateRangeButton().click();
> 279 |     await dateRangePopover().waitFor({ state: "visible", timeout: 10_000 });
      |                              ^ TimeoutError: locator.waitFor: Timeout 10000ms exceeded.
  280 |   };
  281 |   const datePreset = (label: string) =>
  282 |     dateRangePopover().getByRole("button", { name: label, exact: true });
  283 |   // MUI X v8 date fields use the accessible sectioned DOM: a role=group of
  284 |   // Month/Day/Year spinbuttons (the #date-range-* <input> is a hidden mirror
  285 |   // and can't be clicked). Typing digits into the Month section auto-advances
  286 |   // through the sections, so "01012020" → 01/01/2020. Groups in the popover:
  287 |   // [0] Start Date, [1] End Date, [2] the preset ToggleButtonGroup.
  288 |   const dateField = (which: "start" | "end") =>
  289 |     dateRangePopover()
  290 |       .getByRole("group")
  291 |       .nth(which === "start" ? 0 : 1);
  292 |   const typeDate = async (which: "start" | "end", mmddyyyy: string) => {
  293 |     await dateField(which).getByRole("spinbutton", { name: "Month" }).click();
  294 |     await page.keyboard.type(mmddyyyy);
  295 |   };
  296 |   const applyDateRange = async () => {
  297 |     await dateRangePopover().getByRole("button", { name: "Apply" }).click();
  298 |     await dateRangePopover().waitFor({ state: "hidden", timeout: 10_000 });
  299 |   };
  300 |   const updateStatsButton = () =>
  301 |     page.getByRole("button", { name: "Update Stats" });
  302 |   const emptyRangeTitle = () =>
  303 |     page.getByText("No orders in this date range", { exact: true });
  304 |   const changeDateRangeCta = () =>
  305 |     page.getByRole("button", { name: "Change date range" });
  306 | 
  307 |   // ── Detail sheet (OrderDetailsDialog.tsx — a SideSheet Drawer whose
  308 |   // aria-label/title is "Receipt #<n>"; the nested Cancel dialog is a
  309 |   // separate role=dialog and is excluded by the heading filter) ─────────────
  310 |   const detailSheet = () =>
  311 |     page.getByRole("dialog").filter({
  312 |       has: page.getByRole("banner").filter({ hasText: /^Receipt #/ }),
  313 |     });
  314 |   // The header <header> (role banner) holds "Receipt #<n>", the created date
  315 |   // and the Order-#/status chips — assert with toContainText.
  316 |   const sheetTitle = () => detailSheet().getByRole("banner");
  317 |   // The title Typography (h6 class) holds exactly "Receipt #<n>" — use this to
  318 |   // READ the receipt; the banner as a whole also contains the date + chips.
  319 |   const sheetReceiptNumber = async () => {
  320 |     const text =
  321 |       (await sheetTitle().locator(".MuiTypography-h6").first().textContent()) ??
  322 |       "";
  323 |     return text.replace(/^Receipt #/, "").trim();
  324 |   };
  325 |   // Header status Chip: the MuiChip inside the sheet header whose label is a
  326 |   // status word (Pending/Confirmed/…/Cancelled). Order-# chip is "Order #n".
  327 |   const statusChip = () =>
  328 |     detailSheet()
  329 |       .locator(".MuiChip-root")
  330 |       .filter({
  331 |         hasText:
  332 |           /^(Pending|Confirmed|Preparing|Ready|Out for Delivery|Delivered|Picked Up|Cancelled|Refunded|Initialized|Shipped)$/,
  333 |       })
  334 |       .first();
  335 | 
  336 |   const tab = (name: string) =>
  337 |     detailSheet().getByRole("tab", { name, exact: true });
  338 |   const openTab = async (name: string) => {
  339 |     await tab(name).click();
  340 |     await expect(tab(name)).toHaveAttribute("aria-selected", "true");
  341 |   };
  342 | 
  343 |   // Money rows in "Order Total": <Box><p>Label:</p><p>$x.xx</p></Box>.
  344 |   const moneyRow = (label: string) =>
  345 |     detailSheet()
  346 |       .getByText(label, { exact: true })
  347 |       .locator("xpath=following-sibling::p[1]");
  348 |   // "Order Information" rows follow the same label/value sibling shape, but the
  349 |   // value may be a Chip (Order Type, Payment Status) rather than a <p>.
  350 |   const orderInfoValue = (label: string) =>
  351 |     detailSheet()
  352 |       .getByText(label, { exact: true })
  353 |       .locator("xpath=following-sibling::*[1]");
  354 |   const itemsHeading = () =>
  355 |     detailSheet().getByRole("heading", { name: /^Order Items \(\d+\)$/ });
  356 |   const itemRow = (itemName: string) =>
  357 |     detailSheet().locator("tbody tr").filter({ hasText: itemName }).first();
  358 |   const specialInstructionsValue = () =>
  359 |     orderInfoValue("Special Instructions:");
  360 | 
  361 |   // Customer Info tab: value <p> precedes its caption ("Customer Name" /
  362 |   // "Phone Number" / "Email Address").
  363 |   const customerInfoValue = (caption: string) =>
  364 |     detailSheet()
  365 |       .getByText(caption, { exact: true })
  366 |       .locator("xpath=preceding-sibling::p[1]");
  367 |   // Delivery Info tab: two <p> lines precede the "Delivery Address" caption.
  368 |   const deliveryAddressLines = () =>
  369 |     detailSheet()
  370 |       .getByText("Delivery Address", { exact: true })
  371 |       .locator("xpath=preceding-sibling::p");
  372 |   const deliveryNotesValue = () =>
  373 |     detailSheet()
  374 |       .getByText("Delivery Notes:", { exact: true })
  375 |       .locator("xpath=following-sibling::p[1]");
  376 |   const selfDeliveredNote = () =>
  377 |     detailSheet().getByText("Delivered by the restaurant", { exact: true });
  378 | 
  379 |   // Progress stepper (hidden for CANCELLED/REFUNDED).
```