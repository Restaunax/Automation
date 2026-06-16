import { type Page, expect } from "@playwright/test";

export const createOwnerEmployeesPage = (page: Page) => {
  const drawer = () => page.locator(".MuiDrawer-paper").first();

  const navigateToEmployeesTab = async () => {
    await drawer().getByRole("button", { name: /employees/i }).first().click();
    await page.waitForURL(/tab=Employees|tab=employees/i, { timeout: 10_000 });
    await page.getByRole("button", { name: /add employee|invite/i }).waitFor({ state: "visible", timeout: 15_000 });
  };

  const assertEmployeesTabLoaded = () =>
    expect(page.getByRole("button", { name: /add employee|invite/i })).toBeVisible({ timeout: 15_000 });

  const addEmployeeButton = () =>
    page.getByRole("button", { name: /add employee|invite/i });

  return { navigateToEmployeesTab, assertEmployeesTabLoaded, addEmployeeButton };
};
