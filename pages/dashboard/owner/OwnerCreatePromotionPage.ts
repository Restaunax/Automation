import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Owner — Promotions › Create promotion (?tab=create-promotion) and the edit
 * page it doubles as (?tab=edit-promotion&source=…&id=…, reached from a row's
 * Edit).
 *
 * Three steps on one page: "What kind of promotion?" (six radio cards, then
 * "Not sure? Start from an example": goal chips while no type is chosen, only
 * the chosen type's cards after; example cards are buttons named by their
 * title, with the type label and "From your menu" inside),
 * "Set it up" (the type's own questions, then the collapsible rule cards)
 * and "Name and code"; a live preview panel on the side; the primary save
 * ("Save and turn on") and the paused save ("Save for later") in a sticky
 * bar (labels as of RestauNax #972; the Promotions LIST row action "Turn on"
 * is a different control). English copy:
 * restaunax-frontend/public/locales/en/promotions.json.
 *
 * Locator strategy: no test ids. Every amount field is a textbox whose
 * accessible name is its label ("Percentage off", "Only on orders over",
 * "They pay", …); item pickers are comboboxes named after their slot ("They
 * buy", "Which items are on sale?") inside a group of the same name; option
 * toggles are buttons whose name starts with their title ("For a set price
 * For example: …"). The one exception is "Try it as a customer" (test ids
 * try-as-customer / -hint / -reason / -location-<restaurantId>), which sits
 * in the live preview panel on desktop and inside the expanded "Preview" bar
 * at phone width, never in the save bar's button row.
 */

export type PromotionCard =
  | "Money off the order"
  | "Free delivery"
  | "Combo price"
  | "Buy one, get one"
  | "Sale on items"
  | "Free item";

export type HowCustomersGetIt =
  | "Applies by itself"
  | "Only with a code"
  | "Both";

/** A lima tab that reached a "Try it as a customer" preview. */
export const PREVIEW_TAB_URL = /\/preview\/[A-Za-z0-9_-]{43}(?:[/?#]|$)/;

export type WhereChannel =
  | "Online & in-store"
  | "Online only"
  | "In-store only";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const startsWith = (s: string) => new RegExp(`^${escapeRegex(s)}`);

export const createOwnerCreatePromotionPage = (page: Page) => {
  const listHeading = () =>
    page.getByRole("heading", { name: "Promotions", level: 1, exact: true });
  const fixErrorsAlert = () =>
    page.getByText(
      "A few answers need your attention. We've marked them below.",
      {
        exact: true,
      }
    );
  const serverErrorAlert = () =>
    page.getByText("We couldn't save this promotion", { exact: true });
  const fanOutDialog = () =>
    page
      .getByRole("dialog")
      .filter({ hasText: "Heads up — chain-wide change" });

  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=create-promotion`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(
      page.getByRole("heading", { name: "Create a promotion", level: 1 })
    ).toBeVisible({ timeout: 20_000 });
  };

  // The chosen card's name gains a "Selected " prefix.
  const card = (name: PromotionCard) =>
    page.getByRole("radio", {
      name: new RegExp(`^(Selected )?${escapeRegex(name)} `),
    });

  const pickCard = async (name: PromotionCard) => {
    await card(name).click();
    await expect(card(name)).toBeChecked();
  };

  const nameField = () =>
    page.getByRole("textbox", { name: "Promotion name", exact: true });
  const codeField = () =>
    page.getByRole("textbox", { name: "Code customers type", exact: true });

  const setName = async (name: string) => {
    await nameField().fill(name);
  };

  const setCode = async (code: string) => {
    await codeField().fill(code);
    await expect(page.getByText("Available", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  };

  /** An amount field by its label, e.g. "Percentage off", "Cover up to". */
  const amountField = (label: string) =>
    page.getByRole("textbox", { name: label, exact: true });

  const setAmount = async (label: string, value: string) => {
    await amountField(label).fill(value);
  };

  /**
   * Clicks an option toggle by the start of its name: "$ off", "For a set
   * price", "When they spend", "Same item", … Most are toggle buttons; the
   * free item's trigger is a radio group.
   */
  const chooseOption = async (title: string) => {
    const name = startsWith(title);
    await page
      .getByRole("button", { name })
      .or(page.getByRole("radio", { name }))
      .click();
  };

  /** Expands a rule card ("How do customers get it?", "When?", …) once. */
  const openRule = async (title: string) => {
    const header = page.getByRole("button", { name: startsWith(title) });
    if ((await header.getAttribute("aria-expanded")) !== "true") {
      await header.click();
    }
    await expect(header).toHaveAttribute("aria-expanded", "true");
  };

  const ruleOption = async (rule: string, option: string) => {
    await openRule(rule);
    await page
      .getByRole("group", { name: rule, exact: true })
      .getByRole("button", { name: startsWith(option) })
      .click();
  };

  const setHowCustomersGetIt = (mode: HowCustomersGetIt) =>
    ruleOption("How do customers get it?", mode);

  const setWho = (audience: "Everyone" | "First order only") =>
    ruleOption("Who can use it?", audience);

  /** "Where?" rule: online and in-store, online only, or in-store only. */
  const setWhere = (where: WhereChannel) => ruleOption("Where?", where);

  /**
   * "When?" → Time of day → Custom, with both ends typed as the time field
   * expects them, e.g. "1100AM".
   */
  const setTimeOfDay = async (start: string, end: string) => {
    await openRule("When?");
    await page
      .getByRole("group", { name: "Time of day", exact: true })
      .getByRole("button", { name: "Custom", exact: true })
      .click();
    const untilClose = page.getByRole("checkbox", { name: "Until close" });
    if (await untilClose.isChecked()) await untilClose.uncheck();
    const hours = page.getByRole("spinbutton", { name: "Hours" });
    await hours.nth(0).click();
    await page.keyboard.type(start);
    await hours.nth(1).click();
    await page.keyboard.type(end);
  };

  /** The outer group of an item picker slot ("They buy", …). */
  const slot = (label: string): Locator =>
    page.getByRole("group", { name: label, exact: true }).first();

  /** The open "choice search" of a list line (its name carries the line). */
  const choiceSearch = (group: Locator): Locator =>
    group.getByRole("combobox", { name: /^Search for a choice to add to / });

  /** The combo editor's lines slot — the only picker that shows the group note (ruling F4). */
  const COMBO_SLOT = "What's in the combo?";
  const GROUP_NOTE =
    "Same combo price. Extras like a bigger size still add on.";

  /**
   * A line's "+ Add an option" (accessible name "Add an option to line <n>",
   * n = the line's 1-based position in the slot; item and "Customer picks 1"
   * lines have one, category lines do not).
   */
  const addOptionButton = (slotLabel: string, n: number): Locator =>
    slot(slotLabel).getByRole("button", {
      name: `Add an option to line ${n}`,
      exact: true,
    });

  /** "Customer picks 1" — the title of every 2+-item line in a combo / BOGO slot. */
  const groupTitles = (slotLabel: string): Locator =>
    slot(slotLabel).getByText("Customer picks 1", { exact: true });

  /** The combo-only note under a "Customer picks 1" group. */
  const groupNotes = (slotLabel: string): Locator =>
    slot(slotLabel).getByText(GROUP_NOTE, { exact: true });

  /**
   * Picks menu items into a slot by searching each name (one combined search
   * for items and categories). `choice: true` builds one "Customer picks 1"
   * line the way an owner does: the first item is picked in the slot search
   * (it becomes the LAST line), then that line's "+ Add an option" (named
   * "Add an option to line <n>") opens its option search and every further
   * item is picked there. Each pick applies at once; "Done" is NOT pressed
   * (the owner may skip it), so a Save straight after must keep every option.
   * The "Same combo price…" note is checked on the combo slot only; a BOGO
   * slot must not show it (ruling F4).
   */
  const pickItems = async (
    slotLabel: string,
    items: string[],
    opts: { choice?: boolean } = {}
  ) => {
    const group = slot(slotLabel);
    const search = group.getByRole("combobox", {
      name: slotLabel,
      exact: true,
    });
    const pickIn = async (box: Locator, item: string) => {
      await box.fill(item);
      await page.getByRole("option", { name: startsWith(item) }).click();
    };
    if (!opts.choice) {
      for (const item of items) await pickIn(search, item);
      return;
    }
    const [first = "", ...rest] = items;
    await pickIn(search, first);
    await group
      .getByRole("button", { name: /^Add an option to line \d+$/ })
      .last()
      .click();
    for (const item of rest) {
      await pickIn(choiceSearch(group), item);
    }
    await expect(groupTitles(slotLabel).last()).toBeVisible();
    if (slotLabel === COMBO_SLOT) {
      await expect(groupNotes(slotLabel).last()).toBeVisible();
    } else {
      await expect(groupNotes(slotLabel)).toHaveCount(0);
    }
  };

  /**
   * Adds more options to an existing line (its title is the item name, or
   * the options joined by ", " — the name its "Remove …" button carries)
   * through the line's own "+ Add an option" ("Add an option to line <n>",
   * n = its 1-based position) and picks each item in the option search.
   * Applies at once; "Done" is not pressed.
   */
  const addChoices = async (
    slotLabel: string,
    lineTitle: string,
    items: string[]
  ) => {
    const group = slot(slotLabel);
    const n = (await lineNames(slotLabel)).indexOf(lineTitle) + 1;
    expect(n, `a line titled ${lineTitle} in ${slotLabel}`).toBeGreaterThan(0);
    await addOptionButton(slotLabel, n).click();
    for (const item of items) {
      await choiceSearch(group).fill(item);
      await page.getByRole("option", { name: startsWith(item) }).click();
    }
  };

  /** Removes one chip of a choose-from line (its "Remove <name>" button). */
  const removeChoice = async (slotLabel: string, choiceName: string) => {
    await slot(slotLabel)
      .getByRole("list", { name: /^Choices for / })
      .getByRole("button", { name: `Remove ${choiceName}`, exact: true })
      .click();
  };

  /**
   * Adds one "Any item from <category>" line: types the category into the
   * slot's search and picks the option under "Whole categories". Call it
   * again for a second line on the same category (combo lines allow
   * duplicates).
   */
  const pickCategory = async (slotLabel: string, categoryName: string) => {
    const search = slot(slotLabel)
      .getByRole("combobox", { name: slotLabel, exact: true })
      .last();
    await search.fill(categoryName);
    await page
      .getByRole("option", {
        name: startsWith(`Any item from ${categoryName}`),
      })
      .click();
  };

  /** A line's "Add the same item again" — the same item as one more line. */
  const repeatLine = async (itemName: string) => {
    await page
      .getByRole("button", {
        name: `Add the same item again: ${itemName}`,
        exact: true,
      })
      .click();
  };

  /**
   * Item names of a list picker's lines, in order (from the row-level Remove
   * buttons; the chips' own Remove buttons inside "Choices for …" lists are
   * skipped).
   */
  const lineNames = async (slotLabel: string): Promise<string[]> => {
    const labels = await slot(slotLabel)
      .getByRole("button", { name: /^Remove / })
      .evaluateAll((els) =>
        els
          .filter((e) => !e.closest('[aria-label^="Choices for "]'))
          .map((e) => e.getAttribute("aria-label") ?? "")
      );
    return labels.map((l) => l.replace(/^Remove /, ""));
  };

  /** Opens "Change <item>" on a list line (its search replaces the row). */
  const changeLine = async (slotLabel: string, itemName: string) => {
    await slot(slotLabel)
      .getByRole("button", { name: `Change ${itemName}`, exact: true })
      .click();
  };

  /** "Keep <item>" while a line is being changed: cancels, line unchanged. */
  const keepLine = async (slotLabel: string, itemName: string) => {
    await slot(slotLabel)
      .getByRole("button", { name: `Keep ${itemName}`, exact: true })
      .click();
  };

  /**
   * With a line's Change open, picks `newItem` in its search; the pick
   * replaces that line in place. The line's own search sits above the slot's
   * add search, so it is the first combobox.
   */
  const pickReplacement = async (slotLabel: string, newItem: string) => {
    const search = slot(slotLabel)
      .getByRole("combobox", { name: slotLabel, exact: true })
      .first();
    await search.fill(newItem);
    await page.getByRole("option", { name: startsWith(newItem) }).click();
  };

  /** Goal chip of the examples gallery ("Sell items together", …). */
  const pickGoal = async (goal: string) => {
    const chip = page
      .getByRole("group", { name: "Goal", exact: true })
      .getByRole("button", { name: goal, exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
  };

  /** Every example card currently shown (a button with a title heading). */
  const exampleCards = (): Locator =>
    page.getByRole("button").filter({
      has: page.getByRole("heading", { level: 6 }),
    });

  const useExample = async (title: string | RegExp) => {
    await page.getByRole("button", { name: title }).click();
  };

  /** The one-line "Next: …" hint under the step 1 heading. */
  const expectTypeHint = (text: string | RegExp) =>
    expect(
      page.getByRole("region", { name: "What kind of promotion?" })
    ).toContainText(text);

  const switchDialog = () =>
    page.getByRole("dialog").filter({ hasText: /^Switch to / });

  /** The "Switch to <new>?" confirm with its approved body. */
  const expectSwitchConfirm = async (newType: string, oldType: string) => {
    const dialog = switchDialog();
    await expect(
      dialog.getByRole("heading", { name: `Switch to ${newType}?` })
    ).toBeVisible();
    await expect(dialog).toContainText(
      `The items and amounts you picked for ${oldType} will be cleared. Your days, times and limits stay.`
    );
    await expect(
      dialog.getByRole("button", { name: `Keep ${oldType}`, exact: true })
    ).toBeVisible();
  };

  const confirmSwitch = async () => {
    await switchDialog()
      .getByRole("button", { name: "Switch", exact: true })
      .click();
    await expect(switchDialog()).toBeHidden();
  };

  const keepType = async () => {
    await switchDialog()
      .getByRole("button", { name: /^Keep / })
      .click();
    await expect(switchDialog()).toBeHidden();
  };

  /** The side panel headed "Preview" (desktop layout). */
  const previewPanel = () =>
    page
      .locator(".MuiPaper-root")
      .filter({
        has: page.getByRole("heading", {
          name: "Preview",
          level: 2,
          exact: true,
        }),
      })
      .last();

  const expectPreviewText = (text: string | RegExp) =>
    expect(previewPanel()).toContainText(text);

  // ── "Try it as a customer" ────────────────────────────────────────────────
  // The click opens a blank tab at once ("Preparing your preview…"), then the
  // dashboard creates the preview and points that tab at lima's
  // /preview/<token>/…; on a refusal it closes the tab and shows the top
  // banner "We couldn't open the preview". "Customer previews aren't
  // available here yet." (503 PROMOTION_PREVIEW_UNAVAILABLE, or a backend
  // without the route) also hides the button for the rest of the visit.

  /** "Try it as a customer" — in the live preview panel (desktop) or bar (phone). */
  const tryAsCustomerButton = () => page.getByTestId("try-as-customer").first();

  /** The caption under it: the hint, or "Preparing your preview…" while busy. */
  const tryAsCustomerHint = () =>
    page.getByTestId("try-as-customer-hint").first();

  /** The caption that replaces the hint when the button is unavailable. */
  const tryAsCustomerReason = () =>
    page.getByTestId("try-as-customer-reason").first();

  const previewFailedTitle = () =>
    page.getByText("We couldn't open the preview", { exact: true });

  const previewUnavailableNotice = () =>
    page.getByText("Customer previews aren't available here yet.", {
      exact: true,
    });

  /** Phone width: the collapsible "Preview" bar above the save buttons. */
  const previewBarToggle = () =>
    page
      .getByRole("button", { name: /^Preview/ })
      .and(page.locator('[aria-controls="promotion-preview-body"]'));

  /** Phone width: the bar's body (its sentence, example and the action). */
  const previewBarBody = () => page.locator("#promotion-preview-body");

  const openPreviewBar = async () => {
    const toggle = previewBarToggle();
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  };

  /**
   * Clicks "Try it as a customer" (then "Try it at: …" for `locationId` in a
   * chain shell with two or more locations) and returns the lima tab once it
   * reached /preview/<token>. When the dashboard reports a refusal instead,
   * throws with the banner text (the dashboard has closed the tab already);
   * when the form is invalid (no tab opens), throws "form invalid: …".
   */
  const tryAsCustomer = async (locationId?: string): Promise<Page> => {
    const popup = page.context().waitForEvent("page", { timeout: 30_000 });
    await tryAsCustomerButton().click();
    if (locationId) {
      await page.getByTestId(`try-as-customer-location-${locationId}`).click();
    }
    // An invalid form opens no tab: it marks its answers instead.
    const invalid = fixErrorsAlert()
      .waitFor({ state: "visible", timeout: 30_000 })
      .then(
        () => null,
        // Never marked: leave the outcome to the popup wait.
        () => new Promise<never>(() => {})
      );
    const tab = await Promise.race([popup, invalid]);
    if (!tab) {
      // The popup wait is abandoned on purpose: no tab is coming.
      popup.catch(() => {});
      const why = await page
        .getByRole("alert")
        .filter({ has: fixErrorsAlert() })
        .innerText()
        .catch(async () => fixErrorsAlert().innerText());
      throw new Error(`"Try it as a customer": form invalid: ${why}`);
    }
    // An object, so the narrowing below sees the poll callback's writes.
    const seen: { outcome: "opened" | "failed" | "waiting" } = {
      outcome: "waiting",
    };
    await expect
      .poll(
        async () => {
          if (PREVIEW_TAB_URL.test(tab.url())) seen.outcome = "opened";
          else if (await previewFailedTitle().isVisible())
            seen.outcome = "failed";
          return seen.outcome;
        },
        {
          timeout: 30_000,
          message: "the new tab reaches lima's /preview/<token>",
        }
      )
      .not.toBe("waiting");
    if (seen.outcome === "failed") {
      const why = await page
        .getByRole("alert")
        .filter({ has: previewFailedTitle() })
        .innerText()
        .catch(() => "");
      if (!tab.isClosed()) await tab.close();
      throw new Error(`"Try it as a customer" was refused: ${why}`);
    }
    return tab;
  };

  /**
   * Waits for the outcome of Save and turn on / Save for later: back on the list, or the page
   * marked an answer, or the server refused. Handles the chain fan-out
   * confirm ("Heads up — chain-wide change") on the way.
   */
  const settle = async () => {
    const outcome = listHeading()
      .or(fixErrorsAlert())
      .or(serverErrorAlert())
      .or(fanOutDialog());
    await expect(outcome.first()).toBeVisible({ timeout: 30_000 });
    if (await fanOutDialog().isVisible()) {
      await fanOutDialog().getByRole("button", { name: "Continue" }).click();
      await expect(
        listHeading().or(fixErrorsAlert()).or(serverErrorAlert()).first()
      ).toBeVisible({ timeout: 30_000 });
    }
  };

  /** The create bar's primary button, "Save and turn on". */
  const turnOnButton = () =>
    page.getByRole("button", { name: "Save and turn on", exact: true });

  /** Create mode: Save and turn on. Does not assert success — see expectSaved. */
  const turnOn = async () => {
    await turnOnButton().click();
    await settle();
  };

  /**
   * Create mode, for a deal-type promotion (combo / BOGO) on a restaurant
   * whose 10-ACTIVE-deal cap other files share: `waitForSlot` runs before
   * each click, and when the server still answers MAX_ACTIVE_DEALS_REACHED
   * (another worker took the slot between the check and the click) it waits
   * and clicks Save and turn on again. Any other answer settles exactly as turnOn
   * does, so expectSaved still asserts the outcome; after `timeoutMs` the
   * refusal is left on screen for expectSaved to fail on.
   */
  const turnOnDealWhenSlotFree = async (
    waitForSlot: () => Promise<void>,
    timeoutMs = 150_000
  ) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await waitForSlot();
      const posted = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          /^\/api\/deals\/restaurant\/[^/]+$/.test(new URL(r.url()).pathname),
        { timeout: 30_000 }
      );
      await turnOnButton().click();
      // The form may refuse before posting (it marks answers instead): then
      // no POST ever comes, and expectSaved reports the marked form.
      const res = await Promise.race([
        posted,
        fixErrorsAlert()
          .waitFor({ state: "visible", timeout: 30_000 })
          .then(
            () => null,
            // No marked answers: leave the outcome to the POST wait (which
            // fails on its own when nothing is posted either).
            () => new Promise<never>(() => {})
          ),
      ]);
      if (!res) {
        // The POST wait is abandoned on purpose: the form never sent one.
        posted.catch(() => {});
        await settle();
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      const capped =
        res.status() === 400 && body.error === "MAX_ACTIVE_DEALS_REACHED";
      if (!capped || Date.now() > deadline) {
        await settle();
        return;
      }
      // The refusal is shown and the form keeps every answer: try again.
      await expect(serverErrorAlert()).toBeVisible();
      console.warn(
        "[OwnerCreatePromotionPage] Save and turn on refused at the deal cap — waiting for a slot and retrying"
      );
    }
  };

  /**
   * The create bar's paused save, "Save for later": the promotion is stored
   * INACTIVE (no deal slot used).
   */
  const saveForLaterButton = () =>
    page.getByRole("button", { name: "Save for later", exact: true });

  /** Create mode: save paused. Does not assert success — see expectSaved. */
  const saveForLater = async () => {
    await saveForLaterButton().click();
    await settle();
  };

  /** Edit mode: Save changes. */
  const save = async () => {
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await settle();
  };

  /** The save went through and the page returned to the list. */
  const expectSaved = () => expect(listHeading()).toBeVisible();

  // "When?" rule: the shared schedule section (test ids come from the deal
  // schedule component the promotion form embeds).
  const scheduleChip = (
    chip: "any" | "lunch" | "breakfast" | "dinner" | "weekdays" | "weekends"
  ) => page.getByTestId(`deal-schedule-chip-${chip}`);
  const dayChip = (day: string) => page.getByTestId(`deal-day-chip-${day}`);
  const hoursWarning = () => page.getByTestId("deal-schedule-warning");
  const waitForScheduleCheck = (match: (url: string) => boolean) =>
    page.waitForResponse(
      (r) =>
        /\/schedule-check(\?|$)/.test(r.url()) &&
        r.request().method() === "GET" &&
        match(decodeURIComponent(r.url())),
      { timeout: 20_000 }
    );

  /** "Applies to all N locations of <chain>." on the chain create page. */
  const chainScopeLine = () =>
    page.getByText(/^Applies to (all )?\d+ location/);

  const expectFieldError = (text: string | RegExp) =>
    expect(page.getByText(text).first()).toBeVisible();

  /** Cancel; confirms "Leave without saving?" when the page asks. */
  const cancel = async () => {
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const leave = page
      .getByRole("dialog")
      .filter({ hasText: "Leave without saving?" });
    await expect(listHeading().or(leave).first()).toBeVisible();
    if (await leave.isVisible()) {
      await leave.getByRole("button", { name: "Leave", exact: true }).click();
    }
    await expect(listHeading()).toBeVisible();
  };

  /** Duplicate opened Create as "Copy a promotion". */
  const expectDuplicating = () =>
    expect(
      page.getByRole("heading", { name: "Copy a promotion", level: 1 })
    ).toBeVisible({ timeout: 20_000 });

  const expectEditing = () =>
    expect(
      page.getByRole("heading", { name: "Edit promotion", level: 1 })
    ).toBeVisible({ timeout: 20_000 });

  return {
    goto,
    card,
    pickCard,
    pickGoal,
    exampleCards,
    useExample,
    expectTypeHint,
    expectSwitchConfirm,
    confirmSwitch,
    keepType,
    nameField,
    codeField,
    setName,
    setCode,
    amountField,
    setAmount,
    chooseOption,
    openRule,
    setHowCustomersGetIt,
    setWho,
    setWhere,
    setTimeOfDay,
    pickItems,
    addChoices,
    addOptionButton,
    groupTitles,
    groupNotes,
    removeChoice,
    pickCategory,
    repeatLine,
    lineNames,
    changeLine,
    keepLine,
    pickReplacement,
    previewPanel,
    expectPreviewText,
    tryAsCustomerButton,
    tryAsCustomerHint,
    tryAsCustomerReason,
    previewFailedTitle,
    previewUnavailableNotice,
    previewBarToggle,
    previewBarBody,
    openPreviewBar,
    tryAsCustomer,
    settle,
    turnOn,
    turnOnButton,
    turnOnDealWhenSlotFree,
    saveForLater,
    saveForLaterButton,
    save,
    expectSaved,
    scheduleChip,
    dayChip,
    hoursWarning,
    waitForScheduleCheck,
    chainScopeLine,
    expectFieldError,
    expectEditing,
    expectDuplicating,
    cancel,
    fixErrorsAlert,
  };
};

export type OwnerCreatePromotionPage = ReturnType<
  typeof createOwnerCreatePromotionPage
>;
