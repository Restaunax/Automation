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
  const pacingErrorAlert = () =>
    page.getByText(
      "Online booking can't be enabled until pacing limits are configured for this restaurant."
    );
  const pacingRequiredLink = () =>
    page.getByRole("button", { name: "Go to Service periods" });
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
  ) => page.locator(`#reservation-settings-${key}`);
  const saveSettingsButton = () => page.getByTestId("unsaved-changes-save");

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

  // ── Service periods panel ──────────────────────────────────────────────────
  const addPeriodButton = () =>
    main().getByRole("button", { name: "Add Period", exact: true });
  const periodNameInput = () =>
    page.getByTestId("period-form-name").locator("input");
  const periodDaySelect = () => page.locator("#period-day-select");
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
  const addBandButton = () =>
    main().getByRole("button", { name: "Add Band", exact: true });
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
  const addOverrideButton = () =>
    main().getByRole("button", { name: "Add Override", exact: true });
  // MUI X DatePicker's visible widget is a sectioned input, not a plain text
  // box — click the section-list container inside the FormControl carrying
  // the label, then type through the keyboard (same pattern established in
  // OwnerCouponPage.ts for the coupon validity-period date fields).
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
  const confirmDialog = (title: string) =>
    page.getByRole("dialog", { name: title });
  const confirmDialogButton = (title: string, buttonName: string) =>
    confirmDialog(title).getByRole("button", { name: buttonName, exact: true });

  // ── Bookings panel (day view) ──────────────────────────────────────────────
  const addBookingButton = () =>
    page.getByRole("button", { name: "Add booking", exact: true });
  const bookingRow = (guestName: string): Locator =>
    page.getByRole("row").filter({ hasText: guestName });
  const bookingRowMenuButton = (guestName: string) =>
    bookingRow(guestName).getByTestId("booking-row-menu");
  const bookingRowStatusChip = (guestName: string) =>
    bookingRow(guestName).locator(".MuiChip-label");

  const openBookingRowMenu = async (guestName: string) => {
    await bookingRowMenuButton(guestName).click();
    await page.getByRole("menu").waitFor({ state: "visible", timeout: 5_000 });
  };
  const cancelBookingMenuItem = () =>
    page.getByRole("menuitem", { name: "Cancel booking", exact: true });

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
  const snackbar = (text: string | RegExp) =>
    page.getByRole("alert").filter({ hasText: text });

  return {
    gotoTab,
    assertLoaded,
    bookingsSubTab,
    settingsSubTab,
    gotoSettingsSubTab,
    gotoBookingsSubTab,
    selectMuiOption,
    onlineBookingToggle,
    pacingErrorAlert,
    pacingRequiredLink,
    numericSettingInput,
    saveSettingsButton,
    saveReservationSettings,
    addPeriodButton,
    periodNameInput,
    periodDaySelect,
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
