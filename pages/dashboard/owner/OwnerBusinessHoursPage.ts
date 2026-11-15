import { type Locator, type Page, expect } from "@playwright/test";

/**
 * Owner portal → Store Settings → Ordering & hours → Business hours
 * (restaunax-frontend `tabs/BusinessHoursTab.tsx` over the shared
 * `BusinessHoursEditor`). With split hours a day set to Open shows one row of
 * time pickers per open window, "Add hours" under them (gone at four) and a
 * remove button per row once there are two.
 */
export const createOwnerBusinessHoursPage = (page: Page) => {
  const goto = async (restaurantId: string): Promise<void> => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Store%20Settings&settingsTab=ordering&section=hours`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.getByTestId("hours-day-MONDAY")).toBeVisible({
      timeout: 25_000,
    });
  };

  /** One day's card (`day` is the enum value, e.g. "MONDAY"). */
  const day = (name: string): Locator => page.getByTestId(`hours-day-${name}`);

  /** Every window row of a day, in order. */
  const windowRows = (name: string): Locator =>
    day(name).locator(`[data-testid^="hours-window-${name}-"]`);

  const windowRow = (name: string, index: number): Locator =>
    page.getByTestId(`hours-window-${name}-${index}`);

  // MUI X TimePicker: a role="group" of Hours / Minutes / Meridiem
  // spinbuttons plus a hidden input holding the value as "05:00 PM". The
  // first group in a row is the opening time, the second the closing time.
  const timeField = (
    name: string,
    index: number,
    which: "opening" | "closing"
  ): Locator =>
    windowRow(name, index)
      .getByRole("group")
      .nth(which === "opening" ? 0 : 1);

  /** The time a picker shows ("05:00 PM"; "" while it is empty). */
  const timeValue = (
    name: string,
    index: number,
    which: "opening" | "closing"
  ): Locator => timeField(name, index, which).locator("input");

  /** Type a time the way a person does: "05", "00", "P". */
  const setTime = async (
    name: string,
    index: number,
    which: "opening" | "closing",
    time: { hour: string; minute: string; meridiem: "AM" | "PM" }
  ): Promise<void> => {
    await timeField(name, index, which)
      .getByRole("spinbutton", { name: "Hours" })
      .click();
    await page.keyboard.type(`${time.hour}${time.minute}${time.meridiem[0]}`, {
      delay: 60,
    });
    await expect(timeValue(name, index, which)).toHaveValue(
      `${time.hour}:${time.minute} ${time.meridiem}`
    );
  };

  /** Every picker value of a day, row by row: [["12:00 PM", "03:00 PM"], …]. */
  const shownWindows = async (name: string): Promise<string[][]> => {
    const rows = await windowRows(name).count();
    const out: string[][] = [];
    for (let i = 0; i < rows; i += 1) {
      out.push([
        await timeValue(name, i, "opening").inputValue(),
        await timeValue(name, i, "closing").inputValue(),
      ]);
    }
    return out;
  };

  const addHoursButton = (name: string): Locator =>
    page.getByTestId(`hours-add-${name}`);

  const removeHoursButton = (name: string, index: number): Locator =>
    page.getByTestId(`hours-remove-${name}-${index}`);

  /** Every "Remove these hours" button of a day (none with one window). */
  const removeHoursButtons = (name: string): Locator =>
    day(name).getByRole("button", { name: "Remove these hours" });

  /** The inline error under a split day that can't be saved. */
  const problem = (name: string): Locator =>
    page.getByTestId(`hours-problem-${name}`);

  /** "If you save: …" — what the unsaved week would do right now. */
  const preview = (): Locator => page.getByTestId("hours-preview");

  const saveButton = (): Locator =>
    page.getByRole("button", { name: "Save hours", exact: true });

  const savedMessage = (): Locator =>
    page.getByText("Business hours updated.").first();

  /** Click Save hours and return the PUT's status and the week it sent. */
  const save = async (): Promise<{
    status: number;
    sent: Record<string, unknown>[];
  }> => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/restaurant\/[^/]+\/hours$/.test(new URL(r.url()).pathname) &&
          r.request().method() === "PUT"
      ),
      saveButton().click(),
    ]);
    const body = res.request().postDataJSON() as {
      hoursOfOperation?: Record<string, unknown>[];
    };
    return { status: res.status(), sent: body.hoursOfOperation ?? [] };
  };

  /** "Recent changes" under the editor (filtered to Hours). */
  const recentChanges = (): Locator => page.getByTestId("recent-changes");

  return {
    goto,
    day,
    windowRows,
    windowRow,
    timeValue,
    setTime,
    shownWindows,
    addHoursButton,
    removeHoursButton,
    removeHoursButtons,
    problem,
    preview,
    saveButton,
    savedMessage,
    save,
    recentChanges,
  };
};

export type OwnerBusinessHoursPage = ReturnType<
  typeof createOwnerBusinessHoursPage
>;
