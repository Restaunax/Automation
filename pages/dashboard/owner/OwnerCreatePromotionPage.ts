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
 * For example: …").
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

  /**
   * Picks menu items into a slot by searching each name. `choice: true`
   * builds one "Choose from these items" line (the customer picks one of
   * them); otherwise each item is its own line.
   */
  const pickItems = async (
    slotLabel: string,
    items: string[],
    opts: { choice?: boolean } = {}
  ) => {
    const group = slot(slotLabel);
    if (opts.choice) {
      await group
        .getByRole("button", { name: "Choose from these items", exact: true })
        .click();
    }
    const search = group.getByRole("combobox", {
      name: slotLabel,
      exact: true,
    });
    for (const item of items) {
      await search.fill(item);
      await page.getByRole("option", { name: startsWith(item) }).click();
    }
    if (opts.choice) {
      await group
        .getByRole("button", { name: "Add these choices", exact: true })
        .click();
      await expect(
        group.getByText("Customer chooses one", { exact: true })
      ).toBeVisible();
    }
  };

  /**
   * Ticks items in a "Choose from these items" box the way an owner does —
   * open the list, click each item, close it — and does NOT press "Add these
   * choices" (TC-862: the ticks alone must register). `change` ticks in the
   * box of that line's "Change" (opened first); otherwise in the slot's add
   * box, switching its kind to "Choose from these items".
   */
  const tickChoices = async (
    slotLabel: string,
    items: string[],
    opts: { change?: string } = {}
  ) => {
    const group = slot(slotLabel);
    if (opts.change) {
      await changeLine(slotLabel, opts.change);
    }
    const kindButton = group.getByRole("button", {
      name: "Choose from these items",
      exact: true,
    });
    // The Change box's toggle and search come first, the add box's last.
    const which = (l: Locator) => (opts.change ? l.first() : l.last());
    await which(kindButton).click();
    const search = which(
      group.getByRole("combobox", { name: slotLabel, exact: true })
    );
    await search.click();
    for (const item of items) {
      await search.fill(item);
      await page.getByRole("option", { name: startsWith(item) }).click();
    }
    await page.keyboard.press("Escape");
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

  /** Item names of a list picker's lines, in order (from the Remove buttons). */
  const lineNames = async (slotLabel: string): Promise<string[]> => {
    const labels = await slot(slotLabel)
      .getByRole("button", { name: /^Remove / })
      .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
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
      const [res] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            /^\/api\/deals\/restaurant\/[^/]+$/.test(new URL(r.url()).pathname),
          { timeout: 30_000 }
        ),
        turnOnButton().click(),
      ]);
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
  const scheduleChip = (chip: "any" | "lunch" | "breakfast" | "dinner") =>
    page.getByTestId(`deal-schedule-chip-${chip}`);
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
    setTimeOfDay,
    pickItems,
    tickChoices,
    repeatLine,
    lineNames,
    changeLine,
    keepLine,
    pickReplacement,
    previewPanel,
    expectPreviewText,
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
