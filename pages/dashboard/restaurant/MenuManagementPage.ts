import { type Page } from "@playwright/test";

/**
 * Dashboard — Menu management (Restaurant Management portal,
 * /restaurant/restaurantId/:id). ROLE-AGNOSTIC: the same screen is reached by
 * OWNER, EMPLOYEE, and ADMIN (route [ADMIN, OWNER, EMPLOYEE] + MODIFY_RESTAURANT),
 * so this POM does not belong to any one role — pass in whichever session's
 * page. Feature behavior is tested once (tests/dashboard/owner/menu.spec.ts);
 * who-can-reach-it is covered in tests/dashboard/access/. See TEST_PLAN.md →
 * "Shared capabilities".
 *
 * STUB POM. The Menu tab is part of the Starter floor (always entitled). The
 * portal is MUI-based — prefer role selectors.
 */
export const createMenuManagementPage = (page: Page) => {
  const addCategoryButton = page.getByRole("button", { name: /add category/i });

  const goto = async (restaurantId: string): Promise<void> => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Menu`,
      { waitUntil: "domcontentloaded" }
    );
  };

  const addCategory = async (name: string): Promise<void> => {
    // TODO: create a menu category named `name`
    await addCategoryButton.click();
    await page.getByRole("textbox").first().fill(name);
  };

  return { goto, addCategory };
};

export type MenuManagementPage = ReturnType<typeof createMenuManagementPage>;
