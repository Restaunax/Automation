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
  const openAutomationsSubTab = () =>
    schedulerTabs().getByRole("tab", { name: "Automations" }).click();

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
