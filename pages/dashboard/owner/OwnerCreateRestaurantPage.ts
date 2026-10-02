import { type Page, expect } from "@playwright/test";

export interface CreateRestaurantStep0Data {
  name: string;
  addressSearch: string;
  addressSuggestionText: string;
  cuisineType: string;
  phone: string;
  description: string;
}

// Reached at /restaurant/new — gated by the CREATE_RESTAURANT permission
// (EMPLOYEE/ADMIN, not OWNER). Same component regardless of who's creating
// it; the flow immediately POSTs /restaurant/new and redirects into the
// Business Hours step as soon as Step 0 is submitted — the restaurant
// already exists at that point, Steps 1/2 just continue editing it.
export const createOwnerCreateRestaurantPage = (page: Page) => {
  const goto = async () => {
    await page.goto("/restaurant/new", { waitUntil: "domcontentloaded" });
    await page
      .locator('input[name="name"]')
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const nameInput = () => page.locator('input[name="name"]');
  const addressInput = () => page.getByPlaceholder("Enter your address");
  const phoneInput = () => page.locator('input[name="restaurantPhone"]');
  const descriptionInput = () => page.locator('input[name="description"]');
  // Two MUI Selects on Step 0: cuisine type, then min prep time.
  const cuisineTypeSelect = () => page.getByRole("combobox").first();
  const prepTimeSelect = () => page.getByRole("combobox").nth(1);
  const continueButton = () =>
    page.locator("#root").getByRole("button", { name: "Continue" });

  // Selecting an address suggestion requires real keystrokes (fill() doesn't
  // reliably trigger the Places predictions fetch) and clicking the rendered
  // suggestion row — there's no accessible listbox role to target instead.
  const fillAddress = async (search: string, suggestionText: string) => {
    await addressInput().click();
    await addressInput().pressSequentially(search, { delay: 100 });
    await page.getByText(suggestionText, { exact: true }).waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await page.getByText(suggestionText, { exact: true }).click();
  };

  const selectCuisineType = async (cuisine: string) => {
    await cuisineTypeSelect().click();
    await page.getByRole("option", { name: cuisine, exact: true }).click();
  };

  // Must be explicitly chosen even though it displays a default-looking
  // placeholder — leaving it untouched blocks submission.
  const selectNoMinPrepTime = async () => {
    await prepTimeSelect().click();
    await page
      .getByRole("option", { name: "No minimum (accept orders immediately)" })
      .click();
  };

  const fillStep0 = async (data: CreateRestaurantStep0Data) => {
    await nameInput().fill(data.name);
    await fillAddress(data.addressSearch, data.addressSuggestionText);
    await selectCuisineType(data.cuisineType);
    await phoneInput().fill(data.phone);
    await descriptionInput().fill(data.description);
    await selectNoMinPrepTime();
  };

  // Submitting Step 0 POSTs /restaurant/new and redirects to the Business
  // Hours step at /restaurant/restaurantId/:id — the new id is extractable
  // from the URL.
  const submitStep0 = async (): Promise<string> => {
    await continueButton().click();
    await page.waitForURL(/\/restaurant\/restaurantId\/[^/]+/, {
      timeout: 20_000,
    });
    const id = page.url().match(/restaurantId\/([^/?]+)/)?.[1];
    if (!id)
      throw new Error(`Could not extract restaurantId from URL: ${page.url()}`);
    return id;
  };

  const assertBusinessHoursStepVisible = () =>
    expect(page.getByRole("heading", { name: "Business Hours" })).toBeVisible({
      timeout: 15_000,
    });

  // ── Step 1: Business Hours ────────────────────────────────────────────────
  // Each day row repeats the same "Open"/"24 Hours"/"Closed" radio labels, so
  // scope by walking up from the (lowercase-rendered, CSS-capitalized) day
  // text to its row container — ancestor::div[2] reaches the bordered day-row
  // Box (div[1] is the inner flex Box wrapping the label + radio group).
  const dayRow = (day: string) =>
    page
      .getByText(day.toLowerCase(), { exact: true })
      .locator("xpath=ancestor::div[2]");

  // Selecting "Open" on a day with no prior times auto-fills 09:00-17:00
  // (BusinessHoursEditor's default) — no need to touch the time pickers for
  // a basic setup.
  const setDayOpen = (day: string) =>
    dayRow(day).getByRole("radio", { name: "Open", exact: true }).click();

  const setDay24Hours = (day: string) =>
    dayRow(day).getByRole("radio", { name: "24 Hours", exact: true }).click();

  const setDayClosed = (day: string) =>
    dayRow(day).getByRole("radio", { name: "Closed", exact: true }).click();

  const dayRadio = (day: string, status: "Open" | "24 Hours" | "Closed") =>
    dayRow(day).getByRole("radio", { name: status, exact: true });

  // Time pickers only render for "Open" (isOpen check in
  // BusinessHoursEditor.tsx) — 0 for Closed/24 Hours, 2 (opening/closing)
  // for Open. Like the DatePicker elsewhere in this suite (see
  // AdminDemoManagementPage.ts), MUI X's TimePicker renders a sectioned
  // list (.MuiPickersSectionList-root), not a plain textbox.
  const dayTimeSelectors = (day: string) =>
    dayRow(day).locator(".MuiPickersSectionList-root");

  const saveHoursButton = () =>
    page.getByRole("button", { name: "Save & Continue", exact: true });

  // Submitting posts restaurant/hours then the app does a full navigate(0)
  // reload (see HoursOfOperation.tsx) — CreateStore re-initializes and, once
  // businessHours exist, lands on the Menu step (same route, activeStep=2).
  const submitHours = async () => {
    await saveHoursButton().click();
    await page
      .getByRole("button", { name: "New Category" })
      .waitFor({ state: "visible", timeout: 20_000 });
  };

  const assertMenuStepVisible = () =>
    expect(page.getByRole("button", { name: "New Category" })).toBeVisible({
      timeout: 15_000,
    });

  return {
    goto,
    nameInput,
    addressInput,
    phoneInput,
    descriptionInput,
    cuisineTypeSelect,
    prepTimeSelect,
    continueButton,
    fillAddress,
    selectCuisineType,
    selectNoMinPrepTime,
    fillStep0,
    submitStep0,
    assertBusinessHoursStepVisible,
    dayRow,
    setDayOpen,
    setDay24Hours,
    setDayClosed,
    dayRadio,
    dayTimeSelectors,
    saveHoursButton,
    submitHours,
    assertMenuStepVisible,
  };
};

export type OwnerCreateRestaurantPage = ReturnType<
  typeof createOwnerCreateRestaurantPage
>;
