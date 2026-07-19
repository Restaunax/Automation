import { type Page, expect } from "@playwright/test";

/**
 * Owner — Automated Marketing tab
 * (/restaurant/restaurantId/:id/restaurantManagement?tab=marketing-automations).
 *
 * The owner-side controls for the lifecycle programs RestauNax runs on the
 * restaurant's behalf: one master switch plus a toggle per program.
 *
 * Locator strategy: the section has no test ids, so switches are found as
 * "the checkbox inside the nearest container of this label" — the header row
 * (title + master switch) and each program row are flex boxes that contain
 * exactly one Switch each.
 */
export const createOwnerMarketingAutomationsPage = (page: Page) => {
  const goto = async (restaurantId: string) => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=marketing-automations`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(sectionTitle()).toBeVisible({ timeout: 15_000 });
  };

  const sectionTitle = () =>
    page.getByRole("heading", { name: "Automated Marketing" });

  /** Checkbox inside the nearest ancestor container that holds one. */
  const nearestSwitch = (anchor: ReturnType<Page["getByText"]>) =>
    anchor
      .locator('xpath=ancestor::div[.//input[@type="checkbox"]][1]')
      .locator('input[type="checkbox"]')
      .first();

  const masterSwitch = () => nearestSwitch(sectionTitle());

  const programName = (name: string) =>
    page.getByText(name, { exact: true }).first();

  const programSwitch = (name: string) => nearestSwitch(programName(name));

  return { goto, sectionTitle, masterSwitch, programSwitch, programName };
};

export type OwnerMarketingAutomationsPage = ReturnType<
  typeof createOwnerMarketingAutomationsPage
>;
