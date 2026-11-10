import { type Page, type Locator, expect } from "@playwright/test";
import { createOwnerRestaurantManagementPage } from "./OwnerRestaurantManagementPage";

/**
 * Owner → Restaurant Management → Store Operations → "Reservations".
 *
 * StandaloneTabPage wraps ReservationsTab, which is two MUI sub-tabs:
 * "Bookings" (BookingsPanel — day view + phone-booking dialog) and
 * "Settings" (ReservationSettingsPanel, ServicePeriodsPanel, TurnTimesPanel,
 * DateOverridesPanel). Selectors verified against the live QA portal
 * component source (restaunax-frontend/.../tabs/reservations/*.tsx).
 *
 * Form conventions on this tab, mirrored from OwnerTablesFloorPage:
 * SideSheet-based forms (period/turn-time) ship a data-testid on their Save
 * button; ActionDialog-based ones (phone booking, date override) are real
 * MUI Dialogs (role=dialog) with their own data-testid Save/Submit button.
 * List rows for periods/turn-times/date-overrides carry NO data-testid
 * (bare "Edit"/"Delete" aria-labelled IconButtons) — scoped per-row via
 * role=row + visible text, same pattern as OwnerTablesFloorPage's sections.
 */
export const createOwnerReservationsPage = (page: Page) => {
  const mgmtPage = createOwnerRestaurantManagementPage(page);
  const main = () => page.locator("#root");

  const gotoTab = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=reservations`,
      { waitUntil: "domcontentloaded" }
    );
    await mgmtPage.drawer().waitFor({ state: "visible", timeout: 20_000 });
  };

  const assertLoaded = () =>
    expect(
      page.getByRole("heading", { name: "Reservations", level: 1 })
    ).toBeVisible({ timeout: 15_000 });

  const bookingsSubTab = () =>
    page.getByRole("tab", { name: "Bookings", exact: true });
  const settingsSubTab = () =>
    page.getByRole("tab", { name: "Settings", exact: true });

  const gotoSettingsSubTab = async (restaurantId: string) => {
    await gotoTab(restaurantId);
    await assertLoaded();
    await settingsSubTab().click();
    await onlineBookingToggle().waitFor({ state: "visible", timeout: 10_000 });
  };

  const gotoBookingsSubTab = async (restaurantId: string) => {
    await gotoTab(restaurantId);
    await assertLoaded();
    await bookingsSubTab().click();
    await addBookingButton().waitFor({ state: "visible", timeout: 10_000 });
  };

  const selectMuiOption = async (
    selectLocator: Locator,
    optionName: string
  ) => {
    await selectLocator.click();
    await page.getByRole("option", { name: optionName, exact: true }).click();
  };

  // ── Reservation settings panel ─────────────────────────────────────────────
  // data-testid on a MUI Switch lands on the root span, not the native
  // checkbox <input> — check()/uncheck() need the actual input descendant.
  const onlineBookingToggle = () =>
    page.getByTestId("online-booking-toggle").locator("input");
  // The server's resolved message. Match the part that carries the meaning:
  // the lead-in names the booking channels and grew "and phone AI" when voice
  // bookings shipped (RestauNax #1063), which broke an exact-text match.
  const pacingErrorAlert = () =>
    page.getByText(
      /can't be enabled until pacing limits are configured for this restaurant\./
    );
  const pacingRequiredLink = () =>
    page.getByRole("button", { name: "Go to Booking hours" });
  const numericSettingInput = (
    key:
      | "graceMinutes"
      | "waitlistNotifyTimeoutMinutes"
      | "reservedSoonLeadMinutes"
      | "dirtyDecayMinutes"
      | "defaultDurationMinutes"
      | "minNoticeMinutes"
      | "advanceBookingDays"
      | "maxOpenReservationsPerPhone"
      | "autoClearMinutes"
      | "doubleSeatWarnMinutes"
  ) => page.locator(`#reservation-settings-${key}`);
  const saveSettingsButton = () => page.getByTestId("unsaved-changes-save");
  // The audit fixes (RestauNax fix/reservations-audit) split the settings
  // into "Basics" and a COLLAPSED "Advanced" accordion holding the waitlist
  // window, arrival alert, per-phone cap, double-seat warning, no-show
  // lateness and "After guests pay" (policy radio, auto-clear + dirty
  // timeout). Inputs inside it are mounted but hidden until it opens.
  const advancedSection = () =>
    page.getByTestId("reservation-settings-advanced");
  const advancedSummary = () =>
    advancedSection().getByRole("button", { name: /Advanced/ });
  /** Opens "Advanced" when this build has it (an older build shows every
   *  field inline — then this is a no-op). */
  const ensureAdvancedOpen = async () => {
    if ((await advancedSection().count()) === 0) return;
    const summary = advancedSummary();
    if ((await summary.getAttribute("aria-expanded")) !== "true") {
      await summary.click();
    }
    await expect(summary).toHaveAttribute("aria-expanded", "true");
  };
  const tablesRequiredLink = () =>
    page.getByRole("button", { name: "Go to Tables" });
  const bookingSetupError = () => page.getByTestId("booking-setup-error");

  const saveReservationSettings = async () => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservation-settings$/.test(r.url()) &&
          r.request().method() === "PUT",
        { timeout: 15_000 }
      ),
      saveSettingsButton().click(),
    ]);
    return res;
  };

  // ── Booking hours panel (service periods; renamed in RestauNax d0721f254) ──
  const addPeriodButton = () =>
    main().getByRole("button", { name: "Add Window", exact: true });
  const periodNameInput = () =>
    page.getByTestId("period-form-name").locator("input");
  /** Day chips replaced the single day select: one chip per weekday,
   *  aria-label = the full day name. Picking ONE day saves via the single
   *  POST; several days go through the bulk call. */
  const periodDayChip = (dayName: string) =>
    page
      .getByTestId("period-form-days")
      .getByRole("button", { name: dayName, exact: true });
  const periodStartTimeInput = () => page.locator("#period-start-time");
  const periodEndTimeInput = () => page.locator("#period-end-time");
  const periodSlotIntervalInput = () => page.locator("#period-slot-interval");
  const periodMaxCoversInput = () => page.locator("#period-max-covers");
  const periodMaxPartiesInput = () => page.locator("#period-max-parties");
  const periodMinPartyInput = () => page.locator("#period-min-party");
  const periodMaxPartyInput = () => page.locator("#period-max-party");
  const periodSaveButton = () => page.getByTestId("service-period-form-save");

  const openCreatePeriod = async () => {
    await addPeriodButton().click();
    await periodNameInput().waitFor({ state: "visible", timeout: 5_000 });
  };

  const savePeriodForm = async () => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservation-service-periods(\/[^/]+)?$/.test(r.url()) &&
          (r.request().method() === "POST" || r.request().method() === "PATCH"),
        { timeout: 15_000 }
      ),
      periodSaveButton().click(),
    ]);
    return res;
  };

  const periodRow = (name: string): Locator =>
    page
      .getByRole("row")
      .filter({ has: page.getByText(name, { exact: true }) });

  // ── Turn-time bands panel ──────────────────────────────────────────────────
  // Renamed "How long tables stay, by party size" / "Add party size" by the
  // audit fixes — both labels accepted until that build is everywhere.
  const addBandButton = () =>
    main().getByRole("button", { name: /^(Add Band|Add party size)$/ });
  const turnTimeMinInput = () =>
    page.getByTestId("turn-time-form-min").locator("input");
  const turnTimeMaxInput = () => page.locator("#turn-time-max-party");
  const turnTimeDurationInput = () => page.locator("#turn-time-duration");
  const turnTimeSaveButton = () => page.getByTestId("turn-time-form-save");

  const openCreateTurnTime = async () => {
    await addBandButton().click();
    await turnTimeMinInput().waitFor({ state: "visible", timeout: 5_000 });
  };

  /** Fills min/max/duration and saves — returns the response (200/201 on
   * success, 409 RESERVATION_TURN_TIME_OVERLAP on a colliding range). */
  const saveTurnTimeForm = async (form: {
    minPartySize: number;
    maxPartySize: number;
    durationMinutes: number;
  }) => {
    await turnTimeMinInput().fill(String(form.minPartySize));
    await turnTimeMaxInput().fill(String(form.maxPartySize));
    await turnTimeDurationInput().fill(String(form.durationMinutes));
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservation-turn-times(\/[^/]+)?$/.test(r.url()) &&
          r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      turnTimeSaveButton().click(),
    ]);
    return res;
  };

  const turnTimeRow = (rangeText: string): Locator =>
    page
      .getByRole("row")
      .filter({ has: page.getByText(rangeText, { exact: true }) });

  // NOT role=alert: a MUI Drawer/SideSheet modal marks the rest of the page
  // aria-hidden while open, and this form deliberately stays OPEN on a
  // failed save (so the owner can fix the range) — the resulting error
  // Snackbar, which mounts at the page root OUTSIDE the sheet, ends up
  // aria-hidden behind it. Confirmed live (screenshot): the text visibly
  // renders on screen but `getByRole("alert")` can't see it. A real portal
  // accessibility bug (see task-4-report.md), not a test workaround — scoped
  // by CSS class here specifically because role-based lookup is what's broken.
  const turnTimeOverlapSnackbar = () =>
    page.locator(".MuiAlert-message", {
      hasText: "This party-size band overlaps an existing turn-time band.",
    });

  // ── Date overrides panel ───────────────────────────────────────────────────
  // Renamed "Holidays and special dates" / "Add date" by the audit fixes.
  const addOverrideButton = () =>
    main().getByRole("button", { name: /^(Add Override|Add date)$/ });
  const dateOverrideSavedText = /^(Date override saved\.|Date saved\.)$/;
  const deleteDateOverrideTitle = /^Delete this date( override)?\?$/;
  // MUI X DatePicker's visible widget is a sectioned input, not a plain text
  // box — click the section-list container inside the FormControl carrying
  // the label, then type through the keyboard (same pattern established in
  // the retired coupon form's validity-period date fields).
  const dateSectionsFor = (labelText: string) =>
    page
      .getByRole("dialog")
      .locator(".MuiFormControl-root")
      .filter({ has: page.getByText(labelText, { exact: false }) })
      .locator(".MuiPickersSectionList-root");
  const setDateOverrideDate = async (mmddyyyy: string) => {
    await dateSectionsFor("Date").click();
    await page.keyboard.type(mmddyyyy, { delay: 60 });
  };
  const dateOverrideClosedSwitch = () => page.locator("#date-override-closed");
  const dateOverrideNoteInput = () => page.locator("#date-override-note");
  const dateOverrideSaveButton = () => page.getByTestId("date-override-save");

  const openAddDateOverride = async () => {
    await addOverrideButton().click();
    await dateOverrideSaveButton().waitFor({
      state: "visible",
      timeout: 5_000,
    });
  };

  const saveDateOverride = async () => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservation-date-overrides$/.test(r.url()) &&
          r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      dateOverrideSaveButton().click(),
    ]);
    return res;
  };

  const dateOverrideRow = (dateText: string): Locator =>
    page
      .getByRole("row")
      .filter({ has: page.getByText(dateText, { exact: true }) });

  const rowEditButton = (row: Locator) =>
    row.getByRole("button", { name: "Edit", exact: true });
  const rowDeleteButton = (row: Locator, ariaLabel: string) =>
    row.getByRole("button", { name: ariaLabel, exact: true });

  // ── Shared ConfirmProvider dialog ─────────────────────────────────────────
  const confirmDialog = (title: string | RegExp) =>
    page.getByRole("dialog", { name: title });
  const confirmDialogButton = (title: string | RegExp, buttonName: string) =>
    confirmDialog(title).getByRole("button", { name: buttonName, exact: true });

  // ── Bookings panel (day view) ──────────────────────────────────────────────
  const addBookingButton = () =>
    page.getByRole("button", { name: "Add booking", exact: true });
  const bookingRow = (guestName: string): Locator =>
    page.getByRole("row").filter({ hasText: guestName });
  const bookingRowMenuButton = (guestName: string) =>
    bookingRow(guestName).getByTestId("booking-row-menu");
  // A row also carries a source chip ("Phone", data-testid booking-row-source)
  // and table chips before it; the status chip is the row's LAST chip.
  const bookingRowStatusChip = (guestName: string) =>
    bookingRow(guestName).locator(".MuiChip-label").last();

  const openBookingRowMenu = async (guestName: string) => {
    await bookingRowMenuButton(guestName).click();
    await page.getByRole("menu").waitFor({ state: "visible", timeout: 5_000 });
  };
  const cancelBookingMenuItem = () =>
    page.getByRole("menuitem", { name: "Cancel booking", exact: true });
  const confirmedMenuItem = () =>
    page.getByRole("menuitem", { name: "Guest confirmed", exact: true });
  const arrivedMenuItem = () =>
    page.getByRole("menuitem", { name: "Mark arrived", exact: true });

  /** Runs one of the row menu's one-tap status actions ("Guest confirmed",
   *  "Mark arrived") and returns the PATCH response. */
  const rowStatusAction = async (
    guestName: string,
    item: "Guest confirmed" | "Mark arrived"
  ) => {
    await openBookingRowMenu(guestName);
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservations\/[^/]+$/.test(r.url()) &&
          r.request().method() === "PATCH",
        { timeout: 15_000 }
      ),
      page.getByRole("menuitem", { name: item, exact: true }).click(),
    ]);
    return res;
  };

  // ── Day view extras (audit fixes) ──────────────────────────────────────────
  /** A row's red "Allergy" chip. */
  const bookingRowAllergyChip = (guestName: string) =>
    bookingRow(guestName).getByTestId("booking-row-allergy");
  const bookingRowGuestNotes = (guestName: string) =>
    bookingRow(guestName).getByTestId("booking-row-guest-notes");
  const bookingRowStaffNotes = (guestName: string) =>
    bookingRow(guestName).getByTestId("booking-row-staff-notes");
  const daySummary = () => page.getByTestId("booking-day-summary");
  const summaryValue = (
    item: "reservations" | "waitlist" | "allergies" | "busiest"
  ) => page.getByTestId(`booking-summary-${item}`);
  const searchInput = () => page.locator("#bookings-search");
  const emptySearchMessage = () =>
    page.getByText("No bookings on this day match your search.");
  const printDaySheetButton = () => page.getByTestId("booking-day-print");
  /** The day navigator's date field (MUI X DatePicker, "ddd, MMM D, YYYY"). */
  const dayPickerField = () =>
    page.getByRole("group", { name: "Choose a day" });
  const dayPickerOpenButton = () =>
    page.getByRole("button", { name: /Choose date/ });
  /** Picks `date`'s day from the open calendar (same month as shown —
   *  callers step months first if needed). */
  const pickDayInCalendar = async (date: Date) => {
    await dayPickerOpenButton().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible", timeout: 5_000 });
    const monthLabel = date.toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    for (let i = 0; i < 12; i++) {
      if (await dialog.getByText(monthLabel, { exact: true }).isVisible())
        break;
      await dialog.getByRole("button", { name: "Next month" }).click();
    }
    await dialog
      .getByRole("gridcell", { name: String(date.getDate()), exact: true })
      .click();
    await dialog.waitFor({ state: "hidden", timeout: 5_000 });
  };

  const cancelBookingViaMenu = async (guestName: string) => {
    await openBookingRowMenu(guestName);
    await cancelBookingMenuItem().click();
    await confirmDialog("Cancel this booking?").waitFor({
      state: "visible",
      timeout: 5_000,
    });
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservations\/[^/]+$/.test(r.url()) &&
          r.request().method() === "PATCH",
        { timeout: 15_000 }
      ),
      confirmDialogButton("Cancel this booking?", "Cancel booking").click(),
    ]);
    return res;
  };

  // ── Phone booking dialog (ActionDialog, role=dialog) ───────────────────────
  const phoneBookingDialog = () =>
    page.getByRole("dialog", { name: "Add a phone booking" });
  const phoneBookingKindSelect = () => page.locator("#phone-booking-kind");
  const phoneBookingPartySizeInput = () =>
    page.locator("#phone-booking-party-size");
  const phoneBookingTimeInput = () => page.locator("#phone-booking-time");
  /** The phone-booking dialog prefills its date with the day the bookings
   *  list is showing — step the list forward to book a future day. */
  const nextDayButton = () => page.getByRole("button", { name: "Next day" });
  const phoneBookingNameInput = () => page.locator("#phone-booking-name");
  const phoneBookingPhoneInput = () => page.locator("#phone-booking-phone");
  const phoneBookingEmailInput = () => page.locator("#phone-booking-email");
  const phoneBookingNotesInput = () => page.locator("#phone-booking-notes");
  const phoneBookingSubmitButton = () =>
    page.getByTestId("phone-booking-submit");
  const phoneBookingDoneButton = () => page.getByTestId("phone-booking-done");
  const phoneBookingConfirmationCode = () =>
    page.getByTestId("phone-booking-confirmation-code");

  const setPhoneBookingDate = async (mmddyyyy: string) => {
    await dateSectionsFor("Date").click();
    await page.keyboard.type(mmddyyyy, { delay: 60 });
  };

  const submitPhoneBooking = async () => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservations$/.test(r.url()) && r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      phoneBookingSubmitButton().click(),
    ]);
    return res;
  };

  // ── Snackbars ──────────────────────────────────────────────────────────────
  // ── Booking hours from business hours (2026-10-08) ─────────────────────────
  // The "Use my business hours" button only renders while the restaurant has
  // NO booking windows yet (ServicePeriodsPanel's empty state).
  const useBusinessHoursButton = () =>
    page.getByTestId("booking-hours-use-business-hours");
  const suggestionTable = () => page.getByTestId("booking-hours-suggestion");
  /** One day's row in the suggestion table, by full day name ("Monday"). */
  const suggestionRow = (dayName: string) =>
    suggestionTable()
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: dayName, exact: true }) });
  const suggestNameInput = () => page.locator("#suggest-name");
  const suggestMaxPartiesInput = () => page.locator("#suggest-max-parties");
  const suggestSaveButton = () =>
    page.getByTestId("booking-hours-suggest-save");
  /** The form's advisory "outside your business hours" alert. */
  const periodHoursWarning = () =>
    page.getByTestId("period-form-hours-warning");

  // ── After a check is paid (2026-10-07) ─────────────────────────────────────
  /** A policy radio, by the start of its visible label (the accessible name
   *  also carries the help text). */
  const afterPaymentRadio = (labelStart: string) =>
    page.getByRole("radio", {
      name: new RegExp(`^${escapeRegExp(labelStart)}`),
    });

  // ── Insights sub-tab ───────────────────────────────────────────────────────
  const insightsSubTab = () =>
    page.getByRole("tab", { name: "Insights", exact: true });
  const insightsHeading = () =>
    page.getByRole("heading", { name: "How your tables turn" });
  const insightsRangeButton = (days: 7 | 30 | 90) =>
    page.getByRole("button", { name: `Last ${days} days`, exact: true });
  const bookingSourcesBlock = () => page.getByTestId("booking-sources");

  const gotoInsightsSubTab = async (restaurantId: string) => {
    await gotoTab(restaurantId);
    await assertLoaded();
    await insightsSubTab().click();
    await insightsHeading().waitFor({ state: "visible", timeout: 10_000 });
  };

  const snackbar = (text: string | RegExp) =>
    page.getByRole("alert").filter({ hasText: text });

  return {
    useBusinessHoursButton,
    suggestionTable,
    suggestionRow,
    suggestNameInput,
    suggestMaxPartiesInput,
    suggestSaveButton,
    periodHoursWarning,
    afterPaymentRadio,
    insightsSubTab,
    insightsHeading,
    insightsRangeButton,
    bookingSourcesBlock,
    gotoInsightsSubTab,
    gotoTab,
    assertLoaded,
    bookingsSubTab,
    settingsSubTab,
    gotoSettingsSubTab,
    gotoBookingsSubTab,
    selectMuiOption,
    onlineBookingToggle,
    advancedSection,
    advancedSummary,
    ensureAdvancedOpen,
    tablesRequiredLink,
    bookingSetupError,
    dateOverrideSavedText,
    deleteDateOverrideTitle,
    confirmedMenuItem,
    arrivedMenuItem,
    rowStatusAction,
    bookingRowAllergyChip,
    bookingRowGuestNotes,
    bookingRowStaffNotes,
    daySummary,
    summaryValue,
    searchInput,
    emptySearchMessage,
    printDaySheetButton,
    dayPickerField,
    dayPickerOpenButton,
    pickDayInCalendar,
    pacingErrorAlert,
    pacingRequiredLink,
    numericSettingInput,
    saveSettingsButton,
    saveReservationSettings,
    addPeriodButton,
    periodNameInput,
    periodDayChip,
    periodStartTimeInput,
    periodEndTimeInput,
    periodSlotIntervalInput,
    periodMaxCoversInput,
    periodMaxPartiesInput,
    periodMinPartyInput,
    periodMaxPartyInput,
    periodSaveButton,
    openCreatePeriod,
    savePeriodForm,
    periodRow,
    addBandButton,
    turnTimeMinInput,
    turnTimeMaxInput,
    turnTimeDurationInput,
    turnTimeSaveButton,
    openCreateTurnTime,
    saveTurnTimeForm,
    turnTimeRow,
    turnTimeOverlapSnackbar,
    addOverrideButton,
    setDateOverrideDate,
    dateOverrideClosedSwitch,
    dateOverrideNoteInput,
    dateOverrideSaveButton,
    openAddDateOverride,
    saveDateOverride,
    dateOverrideRow,
    rowEditButton,
    rowDeleteButton,
    confirmDialog,
    confirmDialogButton,
    addBookingButton,
    bookingRow,
    bookingRowMenuButton,
    bookingRowStatusChip,
    openBookingRowMenu,
    cancelBookingMenuItem,
    cancelBookingViaMenu,
    phoneBookingDialog,
    phoneBookingKindSelect,
    phoneBookingPartySizeInput,
    phoneBookingTimeInput,
    nextDayButton,
    phoneBookingNameInput,
    phoneBookingPhoneInput,
    phoneBookingEmailInput,
    phoneBookingNotesInput,
    phoneBookingSubmitButton,
    phoneBookingDoneButton,
    phoneBookingConfirmationCode,
    setPhoneBookingDate,
    submitPhoneBooking,
    snackbar,
  };
};

export type OwnerReservationsPage = ReturnType<
  typeof createOwnerReservationsPage
>;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
