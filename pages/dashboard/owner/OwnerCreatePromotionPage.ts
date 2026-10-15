import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Owner — Promotions › Create promotion (?tab=create-promotion) and the edit
 * page it doubles as (?tab=edit-promotion&source=…&id=…, reached from a row's
 * Edit).
 *
 * Three steps on one page: "What kind of promotion?" (six radio cards;
 * the examples area is being redesigned, so no example helpers yet),
 * "Set it up" (the type's own questions, then the collapsible rule cards)
 * and "Name and code"; a live preview panel on the side; Turn on /
 * Save as paused in a sticky bar. English copy:
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
   * Waits for the outcome of Turn on / Save: back on the list, or the page
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

  /** Create mode: Turn on. Does not assert success — see expectSaved. */
  const turnOn = async () => {
    await page.getByRole("button", { name: "Turn on", exact: true }).click();
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

  const expectFieldError = (text: string | RegExp) =>
    expect(page.getByText(text).first()).toBeVisible();

  const expectEditing = () =>
    expect(
      page.getByRole("heading", { name: "Edit promotion", level: 1 })
    ).toBeVisible({ timeout: 20_000 });

  return {
    goto,
    card,
    pickCard,
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
    previewPanel,
    expectPreviewText,
    turnOn,
    save,
    expectSaved,
    expectFieldError,
    expectEditing,
    fixErrorsAlert,
  };
};

export type OwnerCreatePromotionPage = ReturnType<
  typeof createOwnerCreatePromotionPage
>;
