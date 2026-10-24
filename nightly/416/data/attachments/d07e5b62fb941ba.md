# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/owner/25-promotion-scenarios.spec.ts >> Owner — promotion scenarios (dashboard → lima + wind) >> TC-864: @scenario S2 Second gyro for $1.99 (BOGO_FIXED_PRICE) — choose-from on both They buy and They get; the cheaper pick gets the set price
- Location: tests/dashboard/owner/25-promotion-scenarios.spec.ts:924:7

# Error details

```
TimeoutError: locator.click: Timeout 15000ms exceeded.
Call log:
  - waiting for getByRole('option', { name: /^AUTO Scn Chicken Gyro 80a5c840/ })

```

# Test source

```ts
  143 |       .click();
  144 |   };
  145 | 
  146 |   const setHowCustomersGetIt = (mode: HowCustomersGetIt) =>
  147 |     ruleOption("How do customers get it?", mode);
  148 | 
  149 |   const setWho = (audience: "Everyone" | "First order only") =>
  150 |     ruleOption("Who can use it?", audience);
  151 | 
  152 |   /** "Where?" rule: online and in-store, online only, or in-store only. */
  153 |   const setWhere = (where: WhereChannel) => ruleOption("Where?", where);
  154 | 
  155 |   /**
  156 |    * "When?" → Time of day → Custom, with both ends typed as the time field
  157 |    * expects them, e.g. "1100AM".
  158 |    */
  159 |   const setTimeOfDay = async (start: string, end: string) => {
  160 |     await openRule("When?");
  161 |     await page
  162 |       .getByRole("group", { name: "Time of day", exact: true })
  163 |       .getByRole("button", { name: "Custom", exact: true })
  164 |       .click();
  165 |     const untilClose = page.getByRole("checkbox", { name: "Until close" });
  166 |     if (await untilClose.isChecked()) await untilClose.uncheck();
  167 |     const hours = page.getByRole("spinbutton", { name: "Hours" });
  168 |     await hours.nth(0).click();
  169 |     await page.keyboard.type(start);
  170 |     await hours.nth(1).click();
  171 |     await page.keyboard.type(end);
  172 |   };
  173 | 
  174 |   /** The outer group of an item picker slot ("They buy", …). */
  175 |   const slot = (label: string): Locator =>
  176 |     page.getByRole("group", { name: label, exact: true }).first();
  177 | 
  178 |   /** The open "choice search" of a list line (its name carries the line). */
  179 |   const choiceSearch = (group: Locator): Locator =>
  180 |     group.getByRole("combobox", { name: /^Search for a choice to add to / });
  181 | 
  182 |   /** The combo editor's lines slot — the only picker that shows the group note (ruling F4). */
  183 |   const COMBO_SLOT = "What's in the combo?";
  184 |   const GROUP_NOTE =
  185 |     "Same combo price. Extras like a bigger size still add on.";
  186 | 
  187 |   /**
  188 |    * A line's "+ Add an option" (accessible name "Add an option to line <n>",
  189 |    * n = the line's 1-based position in the slot; item and "Customer picks 1"
  190 |    * lines have one, category lines do not).
  191 |    */
  192 |   const addOptionButton = (slotLabel: string, n: number): Locator =>
  193 |     slot(slotLabel).getByRole("button", {
  194 |       name: `Add an option to line ${n}`,
  195 |       exact: true,
  196 |     });
  197 | 
  198 |   /** "Customer picks 1" — the title of every 2+-item line in a combo / BOGO slot. */
  199 |   const groupTitles = (slotLabel: string): Locator =>
  200 |     slot(slotLabel).getByText("Customer picks 1", { exact: true });
  201 | 
  202 |   /**
  203 |    * A combo / BOGO category line's title, "Customer picks 1 from <category>"
  204 |    * plus " · <n> item(s)" once the category's size is known.
  205 |    */
  206 |   const categoryLineTitles = (
  207 |     slotLabel: string,
  208 |     categoryName: string
  209 |   ): Locator =>
  210 |     slot(slotLabel).getByText(
  211 |       new RegExp(
  212 |         `^Customer picks 1 from ${escapeRegex(categoryName)}( · \\d+ items?)?$`
  213 |       )
  214 |     );
  215 | 
  216 |   /** The combo-only note under a "Customer picks 1" group. */
  217 |   const groupNotes = (slotLabel: string): Locator =>
  218 |     slot(slotLabel).getByText(GROUP_NOTE, { exact: true });
  219 | 
  220 |   /**
  221 |    * Picks menu items into a slot by searching each name (one combined search
  222 |    * for items and categories). `choice: true` builds one "Customer picks 1"
  223 |    * line the way an owner does: the first item is picked in the slot search
  224 |    * (it becomes the LAST line), then that line's "+ Add an option" (named
  225 |    * "Add an option to line <n>") opens its option search and every further
  226 |    * item is picked there. Each pick applies at once; "Done" is NOT pressed
  227 |    * (the owner may skip it), so a Save straight after must keep every option.
  228 |    * The "Same combo price…" note is checked on the combo slot only; a BOGO
  229 |    * slot must not show it (ruling F4).
  230 |    */
  231 |   const pickItems = async (
  232 |     slotLabel: string,
  233 |     items: string[],
  234 |     opts: { choice?: boolean } = {}
  235 |   ) => {
  236 |     const group = slot(slotLabel);
  237 |     const search = group.getByRole("combobox", {
  238 |       name: slotLabel,
  239 |       exact: true,
  240 |     });
  241 |     const pickIn = async (box: Locator, item: string) => {
  242 |       await box.fill(item);
> 243 |       await page.getByRole("option", { name: startsWith(item) }).click();
      |                                                                  ^ TimeoutError: locator.click: Timeout 15000ms exceeded.
  244 |     };
  245 |     if (!opts.choice) {
  246 |       for (const item of items) await pickIn(search, item);
  247 |       return;
  248 |     }
  249 |     const [first = "", ...rest] = items;
  250 |     await pickIn(search, first);
  251 |     await group
  252 |       .getByRole("button", { name: /^Add an option to line \d+$/ })
  253 |       .last()
  254 |       .click();
  255 |     for (const item of rest) {
  256 |       await pickIn(choiceSearch(group), item);
  257 |     }
  258 |     await expect(groupTitles(slotLabel).last()).toBeVisible();
  259 |     if (slotLabel === COMBO_SLOT) {
  260 |       await expect(groupNotes(slotLabel).last()).toBeVisible();
  261 |     } else {
  262 |       await expect(groupNotes(slotLabel)).toHaveCount(0);
  263 |     }
  264 |   };
  265 | 
  266 |   /**
  267 |    * Adds more options to an existing line (its title is the item name, or
  268 |    * the options joined by ", " — the name its "Remove …" button carries)
  269 |    * through the line's own "+ Add an option" ("Add an option to line <n>",
  270 |    * n = its 1-based position) and picks each item in the option search.
  271 |    * Applies at once; "Done" is not pressed.
  272 |    */
  273 |   const addChoices = async (
  274 |     slotLabel: string,
  275 |     lineTitle: string,
  276 |     items: string[]
  277 |   ) => {
  278 |     const group = slot(slotLabel);
  279 |     const n = (await lineNames(slotLabel)).indexOf(lineTitle) + 1;
  280 |     expect(n, `a line titled ${lineTitle} in ${slotLabel}`).toBeGreaterThan(0);
  281 |     await addOptionButton(slotLabel, n).click();
  282 |     for (const item of items) {
  283 |       await choiceSearch(group).fill(item);
  284 |       await page.getByRole("option", { name: startsWith(item) }).click();
  285 |     }
  286 |   };
  287 | 
  288 |   /** Removes one chip of a choose-from line (its "Remove <name>" button). */
  289 |   const removeChoice = async (slotLabel: string, choiceName: string) => {
  290 |     await slot(slotLabel)
  291 |       .getByRole("list", { name: /^Choices for / })
  292 |       .getByRole("button", { name: `Remove ${choiceName}`, exact: true })
  293 |       .click();
  294 |   };
  295 | 
  296 |   /**
  297 |    * Adds one category line: types the category into the slot's search and
  298 |    * picks its "Any item from <category>" option under "Whole categories". In
  299 |    * a combo / BOGO slot the line then reads "Customer picks 1 from
  300 |    * <category> · <n> items" (categoryLineTitles). Call it again for a second
  301 |    * line on the same category (combo lines allow duplicates).
  302 |    */
  303 |   const pickCategory = async (slotLabel: string, categoryName: string) => {
  304 |     const search = slot(slotLabel)
  305 |       .getByRole("combobox", { name: slotLabel, exact: true })
  306 |       .last();
  307 |     await search.fill(categoryName);
  308 |     await page
  309 |       .getByRole("option", {
  310 |         name: startsWith(`Any item from ${categoryName}`),
  311 |       })
  312 |       .click();
  313 |   };
  314 | 
  315 |   /** A line's "Add the same item again" — the same item as one more line. */
  316 |   const repeatLine = async (itemName: string) => {
  317 |     await page
  318 |       .getByRole("button", {
  319 |         name: `Add the same item again: ${itemName}`,
  320 |         exact: true,
  321 |       })
  322 |       .click();
  323 |   };
  324 | 
  325 |   /**
  326 |    * Item names of a list picker's lines, in order (from the row-level Remove
  327 |    * buttons; the chips' own Remove buttons inside "Choices for …" lists are
  328 |    * skipped).
  329 |    */
  330 |   const lineNames = async (slotLabel: string): Promise<string[]> => {
  331 |     const labels = await slot(slotLabel)
  332 |       .getByRole("button", { name: /^Remove / })
  333 |       .evaluateAll((els) =>
  334 |         els
  335 |           .filter((e) => !e.closest('[aria-label^="Choices for "]'))
  336 |           .map((e) => e.getAttribute("aria-label") ?? "")
  337 |       );
  338 |     return labels.map((l) => l.replace(/^Remove /, ""));
  339 |   };
  340 | 
  341 |   /** Opens "Change <item>" on a list line (its search replaces the row). */
  342 |   const changeLine = async (slotLabel: string, itemName: string) => {
  343 |     await slot(slotLabel)
```