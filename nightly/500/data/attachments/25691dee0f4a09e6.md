# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/25-promotion-scenarios.spec.ts >> Owner — promotion scenarios (dashboard → lima + wind) >> TC-866: @scenario S4 Any 2 medium pizzas for $19.99 — two 'Any item from <category>' lines; paid toppings show as upgrades
- Location: tests/dashboard/owner/25-promotion-scenarios.spec.ts:955:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('add-to-cart').filter({ hasText: /^Done$/ }).or(getByTestId('deal-choice-slot').first().getByTestId('deal-step-status').filter({ hasText: /^✓ Done$/ }))
Expected: visible
Error: strict mode violation: getByTestId('add-to-cart').filter({ hasText: /^Done$/ }).or(getByTestId('deal-choice-slot').first().getByTestId('deal-step-status').filter({ hasText: /^✓ Done$/ })) resolved to 2 elements:
    1) <p data-testid="deal-step-status" class="MuiTypography-root MuiTypography-body2 css-etrv5t">✓ Done</p> aka getByText('✓ Done')
    2) <button tabindex="0" type="button" data-testid="add-to-cart" class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeLarge MuiButton-containedSizeLarge MuiButton-colorPrimary MuiButton-fullWidth MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeLarge MuiButton-containedSizeLarge MuiButton-colorPrimary MuiButton-fullWidth css-378s7x">Done</button> aka getByTestId('add-to-cart')

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByTestId('add-to-cart').filter({ hasText: /^Done$/ }).or(getByTestId('deal-choice-slot').first().getByTestId('deal-step-status').filter({ hasText: /^✓ Done$/ }))

```

# Test source

```ts
  126 |       )
  127 |       .and(page.getByRole("group", { name: heading, exact: true }));
  128 |   /** The role="alert" of a step after an incomplete Add ("Choose options for Burger 2"). */
  129 |   const stepAlert = (heading: string): Locator =>
  130 |     stepByHeading(heading).getByRole("alert");
  131 |   /** The unit rows of a "{qty} × {name}" step (none when the item has no options). */
  132 |   const unitRows = (stepHeading: string): Locator =>
  133 |     stepByHeading(stepHeading).getByTestId("deal-step-unit");
  134 |   /** Unit `unit` (1-based — the n of its "<item> n" label) of a step. */
  135 |   const unitRow = (stepHeading: string, unit: number): Locator =>
  136 |     unitRows(stepHeading).nth(unit - 1);
  137 |   /** A unit row by its data-unit-key ("<dealItemId>:<i>"). */
  138 |   const unitRowByKey = (unitKey: string): Locator =>
  139 |     page
  140 |       .getByTestId("deal-step-unit")
  141 |       .and(page.locator(`[data-unit-key="${unitKey}"]`));
  142 |   /** "<item> n". */
  143 |   const unitLabel = (stepHeading: string, unit: number): Locator =>
  144 |     unitRow(stepHeading, unit).getByTestId("deal-step-unit-label");
  145 |   /** The unit's option names (absent while unchanged, or while still needed). */
  146 |   const unitOptions = (stepHeading: string, unit: number): Locator =>
  147 |     unitRow(stepHeading, unit).getByTestId("deal-step-unit-options");
  148 |   /** "+$1.50", or "Included" while the unit's options add nothing. */
  149 |   const unitPrice = (stepHeading: string, unit: number): Locator =>
  150 |     unitRow(stepHeading, unit).getByTestId("deal-step-unit-price");
  151 |   /** The unit's "Customize" / "Choose options" button. */
  152 |   const unitCustomizeButton = (stepHeading: string, unit: number): Locator =>
  153 |     unitRow(stepHeading, unit).getByTestId("deal-step-unit-customize");
  154 |   /** The unit's option names, or null when the row shows none. */
  155 |   const readUnitOptions = async (
  156 |     stepHeading: string,
  157 |     unit: number
  158 |   ): Promise<string | null> => {
  159 |     const el = unitOptions(stepHeading, unit);
  160 |     return (await el.count()) > 0 ? (await el.innerText()).trim() : null;
  161 |   };
  162 |   /** The unit's price label ("Included" / "+$1.50"). */
  163 |   const readUnitPrice = async (
  164 |     stepHeading: string,
  165 |     unit: number
  166 |   ): Promise<string> => (await unitPrice(stepHeading, unit).innerText()).trim();
  167 | 
  168 |   /**
  169 |    * The steps are rendered and the menus are in: every fixed item has its
  170 |    * default pick ("✓ Included", or "Required" with "Choose options"). Before
  171 |    * the menus load a fixed step reads "Required" with no button.
  172 |    */
  173 |   const waitForSteps = async () => {
  174 |     await expect(choiceSlots().or(allFixedSteps()).first()).toBeVisible({
  175 |       timeout: 20_000,
  176 |     });
  177 |     await expect(
  178 |       allFixedSteps()
  179 |         .filter({
  180 |           has: page.getByTestId("deal-step-status").getByText("Required"),
  181 |         })
  182 |         .filter({ hasNot: anyCustomizeButton() })
  183 |     ).toHaveCount(0, { timeout: 15_000 });
  184 |   };
  185 | 
  186 |   // ── Item modal (deal mode) ────────────────────────────────────────────
  187 |   /** The item modal's confirm (data-testid="add-to-cart") — reads "Done" in deal mode and adds nothing to the cart. */
  188 |   const doneButton = (): Locator =>
  189 |     page.getByTestId("add-to-cart").filter({ hasText: /^Done$/ });
  190 |   let modalExpected = false;
  191 |   /** Press the item modal's Done — a no-op when no modal was opened. */
  192 |   const clickAddToDeal = async () => {
  193 |     if (!modalExpected && !(await doneButton().isVisible())) return;
  194 |     modalExpected = false;
  195 |     await expect(doneButton()).toBeVisible({ timeout: 15_000 });
  196 |     await doneButton().click();
  197 |     await expect(doneButton()).toBeHidden({ timeout: 10_000 });
  198 |   };
  199 | 
  200 |   /**
  201 |    * Pick `itemName` in pick step `slot` (0-based, display order). Clicking an
  202 |    * item that needs options opens its modal by itself; it is confirmed with
  203 |    * Done. `customize` (pick a size, tick paid extras, …) runs with the modal
  204 |    * open — opened through the step's "Customize" when the click did not open
  205 |    * it — then Done.
  206 |    */
  207 |   const pickChoice = async (
  208 |     slot: number,
  209 |     itemName: string,
  210 |     customize?: () => Promise<void>
  211 |   ) => {
  212 |     const step = choiceSlots().nth(slot);
  213 |     const card = choiceCard(slot, itemName);
  214 |     await expect(card).toHaveAttribute("aria-disabled", "false", {
  215 |       timeout: 15_000,
  216 |     });
  217 |     await card.click();
  218 |     // Settles one way: the modal opens (the item needs options), or the step
  219 |     // reads "✓ Done" (it does not). The card's aria-checked is asserted at the
  220 |     // END: while the options modal is open MUI hides the page behind it from
  221 |     // the accessibility tree, so the radio cannot be found by role until the
  222 |     // modal closes (a check here raced the modal and failed when it won).
  223 |     const stepDone = step
  224 |       .getByTestId("deal-step-status")
  225 |       .filter({ hasText: /^✓ Done$/ });
> 226 |     await expect(doneButton().or(stepDone)).toBeVisible({ timeout: 15_000 });
      |                                             ^ Error: expect(locator).toBeVisible() failed
  227 |     let opened = await doneButton().isVisible();
  228 |     // A pointer pick on an item with ANY options (optional add-ons included)
  229 |     // opens the item modal (lima guided deal page, 2026-10-17), and the step
  230 |     // already reads "✓ Done" as the modal animates in. With `customize` the
  231 |     // item has options, so give the modal its moment before falling back to
  232 |     // the step's Customize button (which the open modal would block).
  233 |     if (!opened && customize) {
  234 |       opened = await doneButton()
  235 |         .waitFor({ state: "visible", timeout: 5_000 })
  236 |         .then(
  237 |           () => true,
  238 |           () => false
  239 |         );
  240 |     }
  241 |     if (customize) {
  242 |       if (!opened) await customizeButton(step).click();
  243 |       await expect(doneButton()).toBeVisible({ timeout: 15_000 });
  244 |       await customize();
  245 |     }
  246 |     if (opened || customize) {
  247 |       modalExpected = true;
  248 |       await clickAddToDeal();
  249 |     }
  250 |     await expect(card).toHaveAttribute("aria-checked", "true");
  251 |   };
  252 | 
  253 |   /**
  254 |    * A fixed item's options: its "Choose options" / "Customize" opens the
  255 |    * modal (follow with clickAddToDeal). The item itself is already included,
  256 |    * so for an item without options this is a no-op (and so is the
  257 |    * clickAddToDeal after it).
  258 |    */
  259 |   const openIncompleteSlot = async (itemName: string) => {
  260 |     await waitForSteps();
  261 |     const step = fixedSteps(itemName).first();
  262 |     await expect(step).toBeVisible({ timeout: 15_000 });
  263 |     const button = customizeButton(step);
  264 |     if ((await button.count()) === 0) {
  265 |       // A "{qty} × {name}" step with options has a button per unit, never
  266 |       // one for the step: say so rather than silently skip the options.
  267 |       if ((await step.getByTestId("deal-step-unit").count()) > 0)
  268 |         throw new Error(
  269 |           `"${itemName}" is a "{qty} × {name}" step with one row per unit — use customizeUnit(heading, n)`
  270 |         );
  271 |       return;
  272 |     }
  273 |     await button.click();
  274 |     modalExpected = true;
  275 |   };
  276 | 
  277 |   /**
  278 |    * Customise ONE unit of a "{qty} × {name}" step: its row's button opens the
  279 |    * item modal for that unit only. `customize` (tick an extra, pick a
  280 |    * required option, …) runs with the modal open, then Done; without it the
  281 |    * modal stays open for the caller (follow with clickAddToDeal).
  282 |    */
  283 |   const customizeUnit = async (
  284 |     stepHeading: string,
  285 |     unit: number,
  286 |     customize?: () => Promise<void>
  287 |   ) => {
  288 |     await waitForSteps();
  289 |     const button = unitCustomizeButton(stepHeading, unit);
  290 |     await expect(button).toBeEnabled({ timeout: 15_000 });
  291 |     await button.click();
  292 |     modalExpected = true;
  293 |     await expect(doneButton()).toBeVisible({ timeout: 15_000 });
  294 |     if (customize) {
  295 |       await customize();
  296 |       await clickAddToDeal();
  297 |     }
  298 |   };
  299 | 
  300 |   /**
  301 |    * Every fixed item (or unit of a "{qty} × {name}" step) that still needs
  302 |    * options: open it and confirm its defaults with Done.
  303 |    */
  304 |   const completeFixedSteps = async () => {
  305 |     await waitForSteps();
  306 |     const pending = allFixedSteps()
  307 |       .locator(anyCustomizeButton())
  308 |       .filter({ hasText: /^Choose options$/ });
  309 |     for (let guard = 0; guard < 10 && (await pending.count()) > 0; guard++) {
  310 |       await pending.first().click();
  311 |       modalExpected = true;
  312 |       await clickAddToDeal();
  313 |     }
  314 |     await expect(pending).toHaveCount(0);
  315 |   };
  316 | 
  317 |   // ── Bar ────────────────────────────────────────────────────────────────
  318 |   const progress = (): Locator => page.getByTestId("deal-progress");
  319 |   /**
  320 |    * "{done} of {total} steps done", or "All set" once done = total. Only
  321 |    * steps that ask for something count: every pick step, and a fixed item
  322 |    * that needs options.
  323 |    */
  324 |   const assertProgress = (done: number, total: number) =>
  325 |     expect(progress()).toHaveText(
  326 |       done >= total ? "All set" : `${done} of ${total} steps done`,
```