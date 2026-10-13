import { type Locator, type Page, expect } from "@playwright/test";
import type { DayName } from "../../../utils/dealSchedule";

/** The "Time of day" chip row of DealScheduleSection (restaunax #898). */
export type ScheduleChip =
  | "any"
  | "breakfast"
  | "lunch"
  | "dinner"
  | "late-night"
  | "happy-hour"
  | "custom";
/** Visible label prefix (meal and happy-hour chips continue with " · <hours>"). */
export const SCHEDULE_CHIP_LABELS: Record<ScheduleChip, string> = {
  any: "Any time",
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  "late-night": "Late Night",
  "happy-hour": "Happy hour",
  custom: "Custom",
};
/** GET /api/deals/meal-periods `value` → its chip (testid = value lower-cased, spaces → "-"). */
export const MEAL_CHIP: Record<string, ScheduleChip> = {
  Breakfast: "breakfast",
  Lunch: "lunch",
  Dinner: "dinner",
  "Late Night": "late-night",
};
const DAY_SHORT: Record<DayName, string> = {
  SUNDAY: "Sun",
  MONDAY: "Mon",
  TUESDAY: "Tue",
  WEDNESDAY: "Wed",
  THURSDAY: "Thu",
  FRIDAY: "Fri",
  SATURDAY: "Sat",
};
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * DealForm.tsx — `?tab=create-deal` (create) and the same tab in edit mode
 * (reached from a row's Edit menu item). One page, no stepper: Basic
 * Information → Deal Items (MUI Autocomplete picker, grouped by category, out-
 * of-stock items excluded; each pick renders an outlined Card with a qty
 * spinbutton and an unlabeled delete IconButton) → Pricing (live "Original
 * Price:", "Savings: $x (y% off)", ≥90% warning) → Time Restrictions /
 * 'When is this deal available?' (DealScheduleSection, restaunax #898: two
 * always-visible chip rows — days and time of day — MUI X v8 pickers, live
 * summary, business-hours warning) + 'Extra details (optional)' accordion → sticky
 * preview with the submit button ("Create Deal" / "Update Deal" / chain
 * variants) and "Cancel".
 *
 * Verified on QA 2026-08-18: textbox "Deal Name *", textbox "Description",
 * combobox "Search and add menu items...", spinbutton "Deal Price *", options
 * read "<name> - $<price> (<group>)", validation errors render as plain
 * paragraphs under the field ("Deal name is required", "Deal price must be
 * greater than 0", "Deal price must be less than original price"), the
 * duplicate-item guard is a warning snackbar "This item is already in the deal".
 * After a successful save the form shows "Deal created/updated successfully"
 * and returns to ?tab=deals after ~1.5 s.
 *
 * Guided deal types (restaunax feat/guided-deal-types, DEAL_TYPES.md) replace
 * the item picker with a type-first form: "What kind of deal?" cards
 * (`deal-type-COMBO|BOGO_FREE|BOGO_PERCENT_OFF|PERCENT_OFF`), then one list per
 * role (`deal-lines-BUY|GET|INCLUDED`, each with its `deal-add-item-<ROLE>`
 * picker) holding ONE LINE PER UNIT — picking an item again adds another line,
 * there is no quantity box and no "already in the deal" refusal — the BOGO
 * "Same item" shortcut (`deal-same-item`), `deal-percent-input`,
 * `deal-price-input`, the live `deal-price-preview` ("regular $X · saves $Y
 * (Z%)" / the computed price) and `deal-save`. Written ahead of the frontend:
 * the testids are the contract; the inner structure (a line's remove button,
 * whether the adder IS the combobox) is resolved defensively below. The legacy
 * helpers stay for a QA that predates the deploy; `hasGuidedForm()` is the gate.
 */
export const createDealFormPage = (page: Page) => {
  const heading = () =>
    page.getByRole("heading", { name: /^(Create New Deal|Edit Deal)$/ });
  const assertCreateMode = () =>
    expect(
      page.getByRole("heading", { name: "Create New Deal", exact: true })
    ).toBeVisible({ timeout: 15_000 });
  const assertEditMode = () =>
    expect(
      page.getByRole("heading", { name: "Edit Deal", exact: true })
    ).toBeVisible({ timeout: 15_000 });

  const nameInput = () => page.locator("#deal-name");
  const descriptionInput = () => page.locator("#deal-description");
  /** The <input> behind a testid that may sit on the TextField root or on the input itself. */
  const inputIn = (testId: string): Locator =>
    page
      .getByTestId(testId)
      .locator("input")
      .or(page.locator(`input[data-testid="${testId}"]`))
      .first();
  const priceInput = () =>
    inputIn("deal-price-input").or(page.locator("#deal-price")).first();
  const itemPicker = () =>
    page.getByRole("combobox", { name: "Search and add menu items..." });

  /** Type in the picker and click the option whose label starts with the item name. */
  const addItem = async (itemName: string) => {
    await itemPicker().click();
    await itemPicker().fill(itemName);
    const option = page
      .getByRole("option", { name: new RegExp(`^${escapeRe(itemName)} - \\$`) })
      .first();
    await option.waitFor({ state: "visible", timeout: 10_000 });
    await option.click();
  };

  /** The outlined Card for a picked item (name paragraph + "$x each" + qty + delete). */
  const itemCard = (itemName: string) =>
    page
      .locator(".MuiCard-root")
      .filter({ has: page.getByText(itemName, { exact: true }) })
      .filter({ hasText: "each" })
      .first();
  const itemQtyInput = (itemName: string) =>
    itemCard(itemName).getByRole("spinbutton");
  const setItemQty = async (itemName: string, qty: number) => {
    await itemQtyInput(itemName).fill(String(qty));
    await itemQtyInput(itemName).press("Tab");
  };
  const removeItem = (itemName: string) =>
    itemCard(itemName).getByRole("button").last().click();
  const pickedItemNames = () =>
    page
      .locator(".MuiCard-root")
      .filter({ hasText: "each" })
      .locator("p")
      .filter({ hasNotText: "each" })
      .filter({ hasNotText: /^\$/ })
      .allTextContents();

  // Pricing read-outs
  const originalPriceText = () =>
    page.getByText(/^Original Price:/).locator("..");
  const savingsText = () => page.getByText(/^Savings: \$/);
  const highDiscountWarning = () =>
    page.getByRole("alert").filter({ hasText: /Make sure your deal price/ });

  // Preview
  const previewSaveChip = () => page.getByText(/^Save \d+%$/);
  /** "1x Name" chips in the preview (the "Save X%" chip lives in the same box — excluded). */
  const previewIncludesChips = () =>
    page
      .getByRole("heading", { name: "Includes:" })
      .locator("..")
      .locator(".MuiChip-label")
      .filter({ hasNotText: /^Save \d+%$/ });
  const previewNoItems = () => page.getByText("No items added yet");

  // Validation strings (plain paragraphs, not FormHelperText)
  const nameRequiredError = () => page.getByText("Deal name is required");
  const pricePositiveError = () =>
    page.getByText("Deal price must be greater than 0");
  const priceBelowOriginalError = () =>
    page.getByText("Deal price must be less than original price");
  const duplicateItemSnackbar = () =>
    page
      .getByRole("alert")
      .filter({ hasText: "This item is already in the deal" });

  // ── "When is this deal available?" (DealScheduleSection, restaunax #898) ───
  const scheduleSection = () =>
    page
      .getByTestId("deal-schedule-section")
      .or(page.getByRole("heading", { name: "When is this deal available?" }))
      .first();
  /** False on a QA deployment that predates #898 (the gate's `present`). */
  const hasScheduleSection = async (): Promise<boolean> =>
    scheduleSection()
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      // Not visible within 10 s = the section isn't deployed; the caller gates on false.
      .catch(() => false);

  const scheduleChip = (chip: ScheduleChip): Locator =>
    page
      .getByTestId(`deal-schedule-chip-${chip}`)
      .or(
        page.getByRole("button", {
          name: new RegExp(`^${escapeRe(SCHEDULE_CHIP_LABELS[chip])}\\b`),
        })
      )
      .first();
  const pickScheduleChip = (chip: ScheduleChip) => scheduleChip(chip).click();
  const assertChipSelected = (chip: ScheduleChip, selected = true) =>
    expect(scheduleChip(chip)).toHaveAttribute(
      "aria-pressed",
      String(selected)
    );

  /** "Weekdays" / "Weekends" shortcuts in the days row (aria-pressed when the days match exactly). */
  const dayPresetChip = (preset: "weekdays" | "weekends"): Locator =>
    page.getByTestId(`deal-schedule-chip-${preset}`);
  const dayChip = (day: DayName): Locator =>
    page
      .getByTestId(`deal-day-chip-${day}`)
      .or(page.getByRole("button", { name: DAY_SHORT[day], exact: true }))
      .first();
  const toggleDay = (day: DayName) => dayChip(day).click();
  const assertDaySelected = (day: DayName, selected = true) =>
    expect(dayChip(day)).toHaveAttribute("aria-pressed", String(selected));

  // ── MUI X v8 pickers (accessible sectioned DOM) ──────────────────────────────
  // The visible field is a row of role=spinbutton spans (aria-label = section:
  // "Hours"/"Minutes"/"Meridiem", "Month"/"Day"/"Year"); the real <input> is
  // aria-hidden and only mirrors the value. So never fill(): click the first
  // section and type every section's digits/letters in order.
  const timeStartField = () => page.getByTestId("deal-time-start");
  const timeEndField = () => page.getByTestId("deal-time-end");
  /**
   * The aria-hidden <input> that mirrors the picker's value, e.g. "02:00 PM"
   * (EN "hh:mm A") or "14:00" (ES) — assert with toHaveValue (it retries).
   */
  const timeStartInput = () => timeStartField().locator("input").first();
  const timeEndInput = () => timeEndField().locator("input").first();
  /** Type "HH:mm": "0300PM" where there is a Meridiem section (EN), "1500" where there isn't (ES, 24h). */
  const typeTime = async (field: Locator, hhmm: string) => {
    const [h = 0, m = 0] = hhmm.split(":").map(Number);
    const twelveHour =
      (await field.getByRole("spinbutton", { name: "Meridiem" }).count()) > 0;
    await field.getByRole("spinbutton", { name: "Hours" }).click();
    await page.keyboard.type(
      twelveHour
        ? `${pad2(h % 12 || 12)}${pad2(m)}${h >= 12 ? "PM" : "AM"}`
        : `${pad2(h)}${pad2(m)}`
    );
  };
  const setStartTime = (hhmm: string) => typeTime(timeStartField(), hhmm);
  const setEndTime = (hhmm: string) => typeTime(timeEndField(), hhmm);
  /** "Until close" — a checkbox OUTSIDE the picker roots; checked = no end time. */
  const untilCloseCheckbox = () =>
    page.getByTestId("deal-time-until-close").getByRole("checkbox");

  const summaryLine = () =>
    page
      .getByTestId("deal-schedule-summary")
      .or(page.getByText(/^Customers can get this deal/))
      .first();
  const summaryText = async () =>
    (await summaryLine().innerText())
      .replace(/[\u00a0\u202f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const hoursWarning = () => page.getByTestId("deal-schedule-warning");
  const hoursWarningLink = () =>
    hoursWarning()
      .getByRole("link", { name: /business hours/i })
      .first();

  const dateRangeSwitch = () =>
    page
      .getByTestId("deal-date-range-switch")
      .or(page.getByRole("switch", { name: /Run only between these dates/i }))
      .first();
  const startDateField = () => page.getByTestId("deal-start-date");
  const endDateField = () => page.getByTestId("deal-end-date");
  /** Type a "YYYY-MM-DD" key into a DatePicker in its own section order ("L": MM/DD/YYYY in EN, DD/MM/YYYY in ES). */
  const typeDate = async (field: Locator, dateKey: string) => {
    const [y = "", mo = "", d = ""] = dateKey.split("-");
    const first = field.getByRole("spinbutton").first();
    const dayFirst = /^(Day|Día)$/i.test(
      (await first.getAttribute("aria-label")) ?? ""
    );
    await first.click();
    await page.keyboard.type(dayFirst ? `${d}${mo}${y}` : `${mo}${d}${y}`);
  };
  const setStartDate = (dateKey: string) => typeDate(startDateField(), dateKey);
  const setEndDate = (dateKey: string) => typeDate(endDateField(), dateKey);

  const extraDetailsToggle = () =>
    page.getByRole("button", { name: /Extra details/i });
  const audienceSelect = () => page.getByTestId("deal-target-audience");
  const occasionSelect = () => page.getByTestId("deal-occasion");
  const mealTypeSelect = () => page.getByTestId("deal-meal-type");

  /** The (debounced) business-hours check; `match` narrows to the request you just caused. */
  const waitForScheduleCheck = (match: (url: string) => boolean = () => true) =>
    page.waitForResponse(
      (r) =>
        /\/schedule-check(\?|$)/.test(r.url()) &&
        r.request().method() === "GET" &&
        match(decodeURIComponent(r.url())),
      { timeout: 20_000 }
    );

  // ── Guided deal types (type-first form) ──────────────────────────────────
  type GuidedType = "COMBO" | "BOGO_FREE" | "BOGO_PERCENT_OFF" | "PERCENT_OFF";
  type LineRole = "BUY" | "GET" | "INCLUDED";
  const typeCard = (type: GuidedType): Locator =>
    page.getByTestId(`deal-type-${type}`);
  /** False on a QA deployment that predates guided deal types (the gate's `present`). */
  const hasGuidedForm = async (): Promise<boolean> =>
    typeCard("COMBO")
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => true)
      // Not visible within 10 s = the guided form isn't deployed; the caller gates on false.
      .catch(() => false);
  const chooseType = (type: GuidedType) => typeCard(type).click();
  const lines = (role: LineRole): Locator =>
    page.getByTestId(`deal-lines-${role}`);
  /** Every line in `role`'s list showing `itemName` (one per unit). */
  const lineItems = (role: LineRole, itemName: string): Locator =>
    lines(role).getByText(itemName, { exact: true });
  /**
   * Add one line of `itemName` to `role`'s list through its
   * `deal-add-item-<ROLE>` control — the Autocomplete itself, its input, or a
   * button that opens (and focuses) a search combobox.
   */
  const addLine = async (role: LineRole, itemName: string) => {
    const adder = page.getByTestId(`deal-add-item-${role}`);
    const inner = adder
      .locator("input")
      .or(page.locator(`input[data-testid="deal-add-item-${role}"]`))
      .first();
    await adder.first().click();
    const field =
      (await inner.count()) > 0
        ? inner
        : page.getByRole("combobox").and(page.locator(":focus"));
    await field.fill(itemName);
    const option = page
      .getByRole("option", { name: new RegExp(`^${escapeRe(itemName)}\\b`) })
      .first();
    await option.waitFor({ state: "visible", timeout: 10_000 });
    await option.click();
  };
  /**
   * Remove the last line of `itemName` from `role`'s list. The line is the
   * innermost element holding both the name and a button (DOM order puts
   * descendants after ancestors); its last button is the remove action.
   */
  const removeLine = async (role: LineRole, itemName: string) => {
    const line = lines(role)
      .locator("*")
      .filter({ has: page.getByText(itemName, { exact: true }) })
      .filter({ has: page.getByRole("button") })
      .last();
    await line.getByRole("button").last().click();
  };
  const sameItemButton = () => page.getByTestId("deal-same-item");
  const percentInput = () => inputIn("deal-percent-input");
  const pricePreview = () => page.getByTestId("deal-price-preview");
  const saveButton = () => page.getByTestId("deal-save");
  /** A picked item on either form: a guided line, or the legacy item card. */
  const itemShown = (itemName: string): Locator =>
    page
      .locator('[data-testid^="deal-lines-"]')
      .getByText(itemName, { exact: true })
      .or(itemCard(itemName))
      .first();
  /**
   * Put these items in the deal on whichever form is deployed: the guided
   * form as a COMBO (one line each), the legacy one through its picker.
   */
  const addComboItems = async (itemNames: string[]) => {
    if (await hasGuidedForm()) {
      await chooseType("COMBO");
      for (const n of itemNames) await addLine("INCLUDED", n);
    } else {
      for (const n of itemNames) await addItem(n);
    }
  };

  // Submit / cancel
  const legacySubmit = () =>
    page
      .locator("#root")
      .getByRole("button", {
        name: /^(Create Deal|Update Deal|Create deal for .*|Update deal .*|Saving\.\.\.)$/,
      })
      .last();
  /**
   * `deal-save` once the guided form is deployed, else the legacy label match.
   * `.last()` of the union: the form's save button sits after the page-header
   * "Create Deal" action in the DOM, so either way the form's button wins.
   */
  const submitButton = () => saveButton().or(legacySubmit()).last();
  const cancelButton = () =>
    page.locator("#root").getByRole("button", { name: "Cancel", exact: true });

  /** Click submit and return the create (POST) or update (PUT) response. */
  const submitAndWait = async (mode: "create" | "update") => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          mode === "create"
            ? /\/api\/(deals\/restaurant\/[^/]+|chains\/[^/]+\/deals)$/.test(
                r.url()
              ) && r.request().method() === "POST"
            : /\/api\/deals\/[^/]+$/.test(r.url()) &&
              r.request().method() === "PUT",
        { timeout: 20_000 }
      ),
      submitButton().click(),
    ]);
    return {
      status: res.status(),
      body: await res.json().catch(() => ({})),
      requestBody: (res.request().postDataJSON() ?? {}) as Record<
        string,
        unknown
      >,
    };
  };
  const createdSnackbar = () =>
    page.getByRole("alert").filter({ hasText: "Deal created successfully" });
  const updatedSnackbar = () =>
    page.getByRole("alert").filter({ hasText: "Deal updated successfully" });

  // Chain fan-out confirm (useFanOutConfirm — suppressed per session after the first Continue)
  const fanOutDialog = () =>
    page.getByRole("dialog", { name: "Heads up — chain-wide change" });
  const fanOutContinue = () =>
    fanOutDialog().getByRole("button", { name: "Continue", exact: true });

  return {
    heading,
    assertCreateMode,
    assertEditMode,
    nameInput,
    descriptionInput,
    priceInput,
    itemPicker,
    addItem,
    itemCard,
    itemQtyInput,
    setItemQty,
    removeItem,
    pickedItemNames,
    originalPriceText,
    savingsText,
    highDiscountWarning,
    previewSaveChip,
    previewIncludesChips,
    previewNoItems,
    typeCard,
    hasGuidedForm,
    chooseType,
    lines,
    lineItems,
    addLine,
    removeLine,
    sameItemButton,
    percentInput,
    pricePreview,
    saveButton,
    itemShown,
    addComboItems,
    nameRequiredError,
    pricePositiveError,
    priceBelowOriginalError,
    duplicateItemSnackbar,
    submitButton,
    cancelButton,
    submitAndWait,
    scheduleSection,
    hasScheduleSection,
    scheduleChip,
    pickScheduleChip,
    assertChipSelected,
    dayPresetChip,
    dayChip,
    toggleDay,
    assertDaySelected,
    timeStartField,
    timeEndField,
    timeStartInput,
    timeEndInput,
    setStartTime,
    setEndTime,
    untilCloseCheckbox,
    summaryLine,
    summaryText,
    hoursWarning,
    hoursWarningLink,
    dateRangeSwitch,
    startDateField,
    endDateField,
    setStartDate,
    setEndDate,
    extraDetailsToggle,
    audienceSelect,
    occasionSelect,
    mealTypeSelect,
    waitForScheduleCheck,
    createdSnackbar,
    updatedSnackbar,
    fanOutDialog,
    fanOutContinue,
  };
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type DealFormPage = ReturnType<typeof createDealFormPage>;
