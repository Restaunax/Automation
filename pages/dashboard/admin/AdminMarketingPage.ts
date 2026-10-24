import { type Page, expect } from "@playwright/test";

/**
 * Admin — Marketing (Coupons & Campaigns → Campaigns tab).
 *
 * Covers the Campaign Scheduler surface: the Events sub-tab (event list +
 * Upcoming/Past/All filter) and the Automations sub-tab (lifecycle programs
 * table, edit dialog, global sending caps).
 *
 * Two nested MUI Tabs bars exist on this screen ("Campaigns" appears in
 * both), so every tab click is scoped by the Tabs' aria-label.
 */
export const createAdminMarketingPage = (page: Page) => {
  const outerTabs = () =>
    page.locator('[aria-label="coupons and campaigns tabs"]');
  const schedulerTabs = () =>
    page.locator('[aria-label="campaign scheduler tabs"]');

  const gotoCampaignScheduler = async () => {
    await page.goto("/admin?tab=marketing&section=coupons", {
      waitUntil: "domcontentloaded",
    });
    await outerTabs().getByRole("tab", { name: "Campaigns" }).click();
    await expect(
      schedulerTabs().getByRole("tab", { name: "Events" })
    ).toBeVisible();
  };

  const openEventsSubTab = () =>
    schedulerTabs().getByRole("tab", { name: "Events" }).click();
  /** The Automations tab's one list read (GET /api/marketing/automations). */
  const isAutomationsList = (url: string) =>
    new URL(url).pathname === "/api/marketing/automations";

  /**
   * Opens the Automations sub-tab and waits for its program list to LOAD.
   *
   * The tab reads GET /api/marketing/automations once on mount and never
   * retries: if that read fails, it shows a "failed to load" snackbar and an
   * empty table, and a later Edit/row lookup times out (TC-213, CI run
   * 39903776781: the request's CORS preflight came back with no
   * Access-Control-Allow-Origin, i.e. a transient QA edge/proxy error, not
   * the app). So the outcome of that read is awaited, and a failed read is
   * retried the way a person would: leave the tab and come back, which
   * remounts it and reads again. Bounded to three attempts.
   */
  const openAutomationsSubTab = async () => {
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; ; attempt++) {
      const outcome = Promise.race([
        page
          .waitForResponse(
            (r) => isAutomationsList(r.url()) && r.request().method() === "GET",
            { timeout: 30_000 }
          )
          .then((r) => (r.ok() ? null : `HTTP ${r.status()}`)),
        page
          .waitForEvent("requestfailed", {
            predicate: (r) => isAutomationsList(r.url()),
            timeout: 30_000,
          })
          .then((r) => r.failure()?.errorText ?? "request failed"),
      ]);
      // The race's loser keeps waiting until its timeout: never let it
      // surface as an unhandled rejection.
      outcome.catch(() => {});
      await schedulerTabs().getByRole("tab", { name: "Automations" }).click();
      const failure = await outcome;
      if (failure === null) return;
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(
          `GET /api/marketing/automations failed ${MAX_ATTEMPTS} times (last: ${failure})`
        );
      }
      await openEventsSubTab();
      await expect(
        schedulerTabs().getByRole("tab", { name: "Events" })
      ).toHaveAttribute("aria-selected", "true");
    }
  };

  // ── Events sub-tab ─────────────────────────────────────────────────────────
  const eventFilterGroup = () => page.locator('[aria-label="Event filter"]');
  const filterButton = (label: "Upcoming" | "Past" | "All") =>
    eventFilterGroup().getByRole("button", { name: label });

  const assertDefaultFilterIsUpcoming = async () => {
    await expect(filterButton("Upcoming")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  };

  const selectEventFilter = async (label: "Upcoming" | "Past" | "All") => {
    await filterButton(label).click();
    await expect(filterButton(label)).toHaveAttribute("aria-pressed", "true");
  };

  /** Status chips rendered by EventList (Upcoming/Sending/Completed/Expired). */
  const statusChips = (status: string) =>
    page.locator(".MuiChip-label", { hasText: status });

  // ── Automations sub-tab ────────────────────────────────────────────────────
  const introBanner = () =>
    page.getByText("Always-on marketing programs", { exact: true });
  const capsTitle = () => page.getByText("Global sending caps");
  const dailyPaceHelper = () =>
    page.getByText("A pace, not a limit on reach", { exact: false });
  const frequencyCapInput = () => page.locator("#frequency-cap-days");
  const dailyCapInput = () => page.locator("#daily-send-cap");

  /** Table row for a program, matched by its type chip (Win-Back/Welcome/VIP). */
  const programRow = (typeLabel: "Win-Back" | "Welcome" | "VIP") =>
    page.getByRole("row").filter({
      has: page.locator(".MuiChip-label", { hasText: typeLabel }),
    });

  const programSwitch = (typeLabel: "Win-Back" | "Welcome" | "VIP") =>
    programRow(typeLabel).locator('input[type="checkbox"]');

  const openEditDialog = async (typeLabel: "Win-Back" | "Welcome" | "VIP") => {
    await programRow(typeLabel).getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  };

  const dialog = () => page.getByRole("dialog");

  /** Input inside the dialog FormControl whose label matches. */
  const dialogFieldInput = (label: string) =>
    dialog()
      .locator(".MuiFormControl-root")
      .filter({ has: page.locator("label", { hasText: label }) })
      .locator("input");

  const saveDialog = async () => {
    await dialog().getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  };

  const cancelDialog = async () => {
    await dialog().getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  };

  return {
    gotoCampaignScheduler,
    openEventsSubTab,
    openAutomationsSubTab,
    assertDefaultFilterIsUpcoming,
    selectEventFilter,
    statusChips,
    introBanner,
    capsTitle,
    dailyPaceHelper,
    frequencyCapInput,
    dailyCapInput,
    programRow,
    programSwitch,
    openEditDialog,
    dialog,
    dialogFieldInput,
    saveDialog,
    cancelDialog,
  };
};

export type AdminMarketingPage = ReturnType<typeof createAdminMarketingPage>;
