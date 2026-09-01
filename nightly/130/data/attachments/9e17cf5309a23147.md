# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/04c-menu-item-editor.spec.ts >> Owner — Menu builder, item wizard & item detail >> TC-300: clicking a card opens the item detail page; Edit opens the edit wizard
- Location: tests/dashboard/owner/04c-menu-item-editor.spec.ts:370:7

# Error details

```
TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
=========================== logs ===========================
waiting for navigation until "load"
============================================================
```

# Test source

```ts
  222 | 
  223 |   // In the edit wizard, overwrite name and price in Step 0 then save.
  224 |   // The wizard's useEffect fetches item data from /menu/itemId/:id and calls
  225 |   // reset() with the API data (awaited in clickEditItem). Waiting for the name
  226 |   // input to hold a non-empty value confirms reset() has run, so our fills
  227 |   // can't be wiped by a late reset.
  228 |   //
  229 |   // Navigating to step 3 (Review) triggers an automatic form submission in the
  230 |   // current build; we rely on that auto-submit rather than clicking Save Item.
  231 |   const editItemInWizard = async (newName: string, newPrice: string) => {
  232 |     const nameInput = page.getByPlaceholder("Enter the menu item name");
  233 |     await nameInput.waitFor({ state: "visible", timeout: 15_000 });
  234 |     await expect(nameInput).not.toHaveValue("", { timeout: 15_000 });
  235 | 
  236 |     await nameInput.fill(newName);
  237 |     await nameInput.press("Tab");
  238 |     const priceInput = page.getByPlaceholder("Enter the base price");
  239 |     await priceInput.fill(newPrice);
  240 |     await priceInput.press("Tab");
  241 | 
  242 |     const nextBtn = page.getByRole("button", { name: "Next" });
  243 |     await nextBtn.click();
  244 |     await nextBtn.waitFor({ state: "visible", timeout: 10_000 });
  245 |     await nextBtn.click();
  246 |     await nextBtn.waitFor({ state: "visible", timeout: 10_000 });
  247 |     await nextBtn.click();
  248 |   };
  249 | 
  250 |   const assertEditSuccessToast = () =>
  251 |     expect(page.getByText("Menu item updated successfully!")).toBeVisible({
  252 |       timeout: 10_000,
  253 |     });
  254 | 
  255 |   // Wizard step-0 inputs, exposed for specs that assert blur-validation
  256 |   // behavior directly (e.g. required-field errors on empty blur).
  257 |   const itemNameInput = () => page.getByPlaceholder("Enter the menu item name");
  258 |   const basePriceInput = () => page.getByPlaceholder("Enter the base price");
  259 | 
  260 |   // ── Builder header / dialogs (MenuGroupDisplay) ─────────────────────────
  261 |   const gotoBuilder = (restaurantId: string) =>
  262 |     page.goto(`/restaurant/restaurantId/${restaurantId}`, {
  263 |       waitUntil: "domcontentloaded",
  264 |     });
  265 |   const gotoChainBuilder = (groupId: string) =>
  266 |     page.goto(`/chain/${groupId}`, { waitUntil: "domcontentloaded" });
  267 |   const builderHeading = () =>
  268 |     page.getByRole("heading", { name: "Menu Categories" });
  269 |   const cloneMenuButton = () =>
  270 |     page.getByRole("button", { name: "Clone Menu" });
  271 |   const generateMenuButton = () =>
  272 |     page.getByRole("button", { name: "Generate Menu" });
  273 |   const generateImagesButton = () =>
  274 |     page.getByRole("button", { name: "Generate Images" });
  275 |   const categoryTabs = () =>
  276 |     page.getByRole("tablist", { name: "menu categories tabs" });
  277 |   const emptyState = () => page.getByText("No categories yet");
  278 | 
  279 |   /** "New Category" dialog pieces. */
  280 |   const categoryDialog = () =>
  281 |     page.getByRole("dialog").filter({ hasText: "Add Category" });
  282 |   const categoryPreset = (name: string) =>
  283 |     categoryDialog().getByRole("button", { name, exact: true });
  284 |   const categoryNameInput = () =>
  285 |     page.getByPlaceholder("appetizer, Main Course, Dessert...");
  286 |   const categorySaveButton = () =>
  287 |     page.getByRole("button", { name: "Save changes" });
  288 |   const categoryScopeRadio = (scope: "this" | "all") =>
  289 |     categoryDialog().getByRole("radio", {
  290 |       name: scope === "this" ? /Just this store/ : /All my stores/,
  291 |     });
  292 |   const openCategoryDialog = async () => {
  293 |     await addCategoryButton().click();
  294 |     await categoryDialog().waitFor({ state: "visible", timeout: 10_000 });
  295 |   };
  296 | 
  297 |   /** Category chips + heading in the builder's category section. */
  298 |   const categorySection = (categoryName: string) =>
  299 |     page
  300 |       .locator(".MuiPaper-root")
  301 |       .filter({
  302 |         has: page.getByRole("heading", { name: categoryName, exact: true }),
  303 |       })
  304 |       .last();
  305 |   const categoryChip = (categoryName: string, kind: "shared" | "local") =>
  306 |     categorySection(categoryName).getByText(
  307 |       kind === "shared" ? /Shared · all \d+ locations/ : "Only at this location"
  308 |     );
  309 | 
  310 |   // ── Item cards (MenuItemCard: data-testid menu-item-card / -edit / -clone) ─
  311 |   const itemCard = (itemName: string) =>
  312 |     page
  313 |       .getByTestId("menu-item-card")
  314 |       .filter({ hasText: itemName })
  315 |       .or(page.locator(".MuiCard-root").filter({ hasText: itemName }))
  316 |       .first();
  317 |   const openItemDetail = async (itemName: string) => {
  318 |     const card = itemCard(itemName);
  319 |     await card.waitFor({ state: "visible", timeout: 15_000 });
  320 |     // Click the card body (the name), not an action button.
  321 |     await card.getByText(itemName, { exact: true }).first().click();
> 322 |     await page.waitForURL(/\/itemId\/[^/]+$/, { timeout: 15_000 });
      |                ^ TimeoutError: page.waitForURL: Timeout 15000ms exceeded.
  323 |   };
  324 |   const cloneItemButton = (itemName: string) =>
  325 |     itemCard(itemName)
  326 |       .getByTestId("menu-item-clone")
  327 |       .or(itemCard(itemName).locator(".MuiCardActions-root button").nth(2));
  328 |   const cardFeaturedButton = (itemName: string) =>
  329 |     itemCard(itemName).locator(".MuiCardActions-root button").first();
  330 |   const cardBadge = (itemName: string, badge: string) =>
  331 |     itemCard(itemName).getByText(badge, { exact: true });
  332 | 
  333 |   /** "Who is this item for?" (chain owner adding to a shared category). */
  334 |   const scopeDialog = () =>
  335 |     page.getByRole("dialog", { name: "Who is this item for?" });
  336 |   const chooseItemScope = (scope: "all" | "this") =>
  337 |     scopeDialog()
  338 |       .getByRole("button", {
  339 |         name: scope === "all" ? /All my stores/ : /Just this store/,
  340 |       })
  341 |       .click();
  342 | 
  343 |   // ── Chain scope bar (MenuScopeBar) ──────────────────────────────────────
  344 |   const scopeBarEditingFor = () => page.getByText("Editing menu for:");
  345 |   const scopeBarSwitchToShared = () =>
  346 |     page
  347 |       .getByRole("button", { name: /Switch to all \d+ locations/ })
  348 |       .or(page.getByRole("link", { name: /Switch to all \d+ locations/ }));
  349 |   const scopeBarSharedTitle = () => page.getByText("EDITING SHARED MENU");
  350 |   const scopeBarBackToLocation = () =>
  351 |     page
  352 |       .getByRole("button", { name: /Back to .* only/ })
  353 |       .or(page.getByRole("link", { name: /Back to .* only/ }));
  354 | 
  355 |   // ── Clone Menu dialog ───────────────────────────────────────────────────
  356 |   const cloneMenuDialog = () =>
  357 |     page.getByRole("dialog").filter({ hasText: "Clone Menu Items" });
  358 | 
  359 |   return {
  360 |     navigateToMenuTab,
  361 |     gotoBuilder,
  362 |     gotoChainBuilder,
  363 |     builderHeading,
  364 |     cloneMenuButton,
  365 |     generateMenuButton,
  366 |     generateImagesButton,
  367 |     categoryTabs,
  368 |     emptyState,
  369 |     categoryDialog,
  370 |     categoryPreset,
  371 |     categoryNameInput,
  372 |     categorySaveButton,
  373 |     categoryScopeRadio,
  374 |     openCategoryDialog,
  375 |     categorySection,
  376 |     categoryChip,
  377 |     itemCard,
  378 |     openItemDetail,
  379 |     cloneItemButton,
  380 |     cardFeaturedButton,
  381 |     cardBadge,
  382 |     scopeDialog,
  383 |     chooseItemScope,
  384 |     scopeBarEditingFor,
  385 |     scopeBarSwitchToShared,
  386 |     scopeBarSharedTitle,
  387 |     scopeBarBackToLocation,
  388 |     cloneMenuDialog,
  389 |     addCategoryButton,
  390 |     itemNameInput,
  391 |     basePriceInput,
  392 |     assertCategoryVisible,
  393 |     createCategory,
  394 |     addItemButton,
  395 |     openAddItemWizard,
  396 |     nextButton,
  397 |     fieldErrors,
  398 |     createMenuItem,
  399 |     assertMenuItemSuccessToast,
  400 |     assertItemVisible,
  401 |     activateCategory,
  402 |     deleteCategory,
  403 |     assertCategoryDeleted,
  404 |     assertCategoryNotDeletable,
  405 |     clickEditItem,
  406 |     editItemInWizard,
  407 |     assertEditSuccessToast,
  408 |   };
  409 | };
  410 | 
  411 | export type OwnerMenuPage = ReturnType<typeof createOwnerMenuPage>;
  412 | 
```