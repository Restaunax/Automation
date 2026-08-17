import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Dashboard — Menu tab = "Menu Availability Management"
 * (`/restaurant/restaurantId/:id/restaurantManagement?tab=Menu`,
 * frontend `RestaurantManagement/MenuManagementPage.tsx`).
 *
 * ROLE-AGNOSTIC: the same screen is reached by OWNER, EMPLOYEE and ADMIN, so
 * this POM lives under pages/dashboard/restaurant/ — pass in whichever
 * session's page. Feature behaviour is tested once under the primary actor
 * (tests/dashboard/owner/04b-menu-availability.spec.ts); who-can-reach-it is
 * covered in tests/dashboard/access/.
 *
 * What the tab is (and isn't): a toggle surface — per-item availability
 * (86), featured, "Restore All to Available" per category, and for chain
 * members the per-location price / carry controls. Category + item CRUD live
 * in the BUILDER at /restaurant/restaurantId/:id (OwnerMenuPage) which the
 * "Manage Menu" button opens. See docs/MENU_TAB_TEST_STRATEGY.md §3.1.
 *
 * Selectors (verified on QA 2026-08-16): the icon buttons expose their MUI
 * Tooltip title as the accessible name ("Edit this menu item", "Add to
 * featured items" / "Remove from featured items"); the availability control
 * is `role=switch` inside the item's `listitem`; each category is an MUI
 * Accordion whose summary is `role=button` named "<Category> N Available
 * [N Out of Stock] [Restore All to Available]". Confirm dialogs come from
 * ConfirmProvider: `role=dialog` named by its title. `data-tour` hooks
 * (`menu-availability-toggle`, `menu-featured-toggle`) exist in the frontend
 * source but were NOT on the QA deploy — the accessible names are the
 * contract until then.
 *
 * NOTE (UX, not asserted): the caption under the switch reads "Out of Stock"
 * while the item is available and vice-versa (MenuManagementPage.tsx ~2056
 * `item.outOfStock ? available : outOfStock`) — it labels the opposite state.
 * The chip next to the item NAME ("Available" / "Out of Stock") is correct
 * and is what this POM asserts on. Flagged in the strategy doc.
 */
export const createMenuAvailabilityPage = (page: Page) => {
  const goto = async (restaurantId: string): Promise<void> => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Menu`,
      { waitUntil: "domcontentloaded" }
    );
  };

  /** Chain shell twin: /chain/:groupId/restaurantManagement?tab=Menu (forceChainMode). */
  const gotoChain = async (groupId: string): Promise<void> => {
    await page.goto(`/chain/${groupId}/restaurantManagement?tab=Menu`, {
      waitUntil: "domcontentloaded",
    });
  };

  const heading = () =>
    page.getByRole("heading", { name: "Menu Availability Management" });
  // Standalone: name "Manage Menu". Chain member / chain shell: the tooltip
  // becomes the accessible name ("Open the builder for <A> only — …" /
  // "Manage the shared chain menu — …") while the visible text stays
  // "Manage Menu" / "Manage shared menu (all locations)".
  const manageMenuButton = () =>
    page.getByRole("button", {
      name: /^Manage (Menu|shared menu)|^Open the builder for .* only|^Manage the shared chain menu/,
    });
  const refreshButton = () =>
    page.getByRole("button", { name: /^Refresh(ing…|ing\.\.\.)?$/ });
  const sidebarMenuTab = () =>
    page
      .locator('[data-tour="tab-Menu"]')
      .or(page.getByRole("button", { name: "Menu", exact: true }))
      .first();

  const assertLoaded = async () => {
    await expect(heading()).toBeVisible({ timeout: 20_000 });
    await expect(manageMenuButton()).toBeVisible();
  };

  /** Wait for the tab's menu fetch (GET /menu/restaurants/:id/menus). */
  const waitForMenuLoad = (restaurantId?: string) =>
    page.waitForResponse(
      (r) =>
        r.request().method() === "GET" &&
        /\/menu\/restaurants\/[^/]+\/menus/.test(r.url()) &&
        (!restaurantId || r.url().includes(restaurantId)) &&
        r.status() === 200,
      { timeout: 20_000 }
    );

  // ── Categories (accordions) ─────────────────────────────────────────────

  /** The accordion SUMMARY button for a category — its name carries the chips. */
  const categorySummary = (categoryName: string): Locator =>
    page.getByRole("button", {
      name: new RegExp(`^${escapeRe(categoryName)} \\d+ Available`),
    });

  /** The whole accordion (summary + region) for a category. */
  const categoryAccordion = (categoryName: string): Locator =>
    page
      .locator(".MuiAccordion-root")
      .filter({ has: categorySummary(categoryName) });

  const expandCategory = async (categoryName: string) => {
    const summary = categorySummary(categoryName);
    await summary.waitFor({ state: "visible", timeout: 20_000 });
    if ((await summary.getAttribute("aria-expanded")) !== "true") {
      await summary.click();
    }
    await expect(summary).toHaveAttribute("aria-expanded", "true");
  };

  /** "N Available" chip text of a category summary → N. */
  const availableCount = async (categoryName: string): Promise<number> => {
    const text = (await categorySummary(categoryName).textContent()) ?? "";
    return Number(/(\d+) Available/.exec(text)?.[1] ?? NaN);
  };
  /** "N Out of Stock" chip → N (0 when the chip is absent). */
  const outOfStockCount = async (categoryName: string): Promise<number> => {
    const text = (await categorySummary(categoryName).textContent()) ?? "";
    return Number(/(\d+) Out of Stock/.exec(text)?.[1] ?? 0);
  };
  const assertCounts = async (
    categoryName: string,
    available: number,
    outOfStock: number
  ) => {
    await expect(categorySummary(categoryName)).toContainText(
      `${available} Available`
    );
    if (outOfStock > 0) {
      await expect(categorySummary(categoryName)).toContainText(
        `${outOfStock} Out of Stock`
      );
    } else {
      await expect(categorySummary(categoryName)).not.toContainText(
        "Out of Stock"
      );
    }
  };

  const restoreAllButton = (categoryName: string) =>
    categorySummary(categoryName).getByRole("button", {
      name: "Restore All to Available",
    });

  /** Click "Restore All to Available" → ConsequenceDialog → "Restore all". */
  const restoreAll = async (categoryName: string) => {
    await restoreAllButton(categoryName).click();
    const dialog = page.getByRole("dialog", {
      name: "Restore all out-of-stock items in this group?",
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    return {
      dialog,
      confirm: async () => {
        await Promise.all([
          page.waitForResponse(
            (r) =>
              /\/menu\/menu-groups\/[^/]+\/reset-availability/.test(r.url()) &&
              r.request().method() === "POST",
            { timeout: 20_000 }
          ),
          dialog.getByRole("button", { name: "Restore all" }).click(),
        ]);
        await expect(dialog).toBeHidden({ timeout: 10_000 });
      },
      cancel: () => dialog.getByRole("button", { name: "Cancel" }).click(),
    };
  };

  // ── Item rows ───────────────────────────────────────────────────────────

  /** The listitem row for an item inside its (expanded) category. */
  const itemRow = (categoryName: string, itemName: string): Locator =>
    categoryAccordion(categoryName)
      .getByRole("listitem")
      .filter({ hasText: itemName })
      .first();

  const availabilitySwitch = (categoryName: string, itemName: string) =>
    itemRow(categoryName, itemName).getByRole("switch");
  const editButton = (categoryName: string, itemName: string) =>
    itemRow(categoryName, itemName).getByRole("button", {
      name: "Edit this menu item",
    });
  const featureButton = (categoryName: string, itemName: string) =>
    itemRow(categoryName, itemName).getByRole("button", {
      name: /^(Add to|Remove from) featured items$/,
    });
  /** Chain (location view) only. */
  const priceOverrideButton = (categoryName: string, itemName: string) =>
    itemRow(categoryName, itemName)
      .getByTestId("menu-price-override")
      .or(
        itemRow(categoryName, itemName).getByRole("button", {
          name: /(Using shared price|Location price)/,
        })
      )
      .first();
  const carryButton = (categoryName: string, itemName: string) =>
    itemRow(categoryName, itemName)
      .getByTestId("menu-carry-toggle")
      .or(
        itemRow(categoryName, itemName).getByRole("button", {
          name: /(Remove from this location's menu|Add back to this location's menu)/,
        })
      )
      .first();

  /** State chip next to the item name — the TRUE state (see NOTE above). */
  const assertItemAvailable = (categoryName: string, itemName: string) =>
    Promise.all([
      expect(availabilitySwitch(categoryName, itemName)).toBeChecked(),
      expect(
        itemRow(categoryName, itemName).getByText("Available", { exact: true })
      ).toBeVisible(),
    ]);
  const assertItemOutOfStock = (categoryName: string, itemName: string) =>
    Promise.all([
      expect(availabilitySwitch(categoryName, itemName)).not.toBeChecked(),
      expect(
        itemRow(categoryName, itemName).getByText("Out of Stock", {
          exact: true,
        })
      ).toBeVisible(),
    ]);

  const soldOutDialog = (itemName: string) =>
    page.getByRole("dialog", { name: `Mark "${itemName}" as sold out?` });

  /**
   * Turn an available item OFF: click the switch → ConsequenceDialog
   * ("Mark "X" as sold out?") → "Mark sold out" → PATCH …/availability.
   * Returns the PATCH request's JSON body for payload assertions.
   */
  const markSoldOut = async (categoryName: string, itemName: string) => {
    await availabilitySwitch(categoryName, itemName).click();
    const dialog = soldOutDialog(itemName);
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/menu\/menu-items\/[^/]+\/availability/.test(r.url()) &&
          r.request().method() === "PATCH",
        { timeout: 20_000 }
      ),
      dialog.getByRole("button", { name: "Mark sold out" }).click(),
    ]);
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    return {
      status: res.status(),
      body: res.request().postDataJSON() as {
        outOfStock?: boolean;
        restaurantId?: string;
      },
    };
  };

  /** Turn an out-of-stock item back ON — no dialog. */
  const markAvailable = async (categoryName: string, itemName: string) => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/menu\/menu-items\/[^/]+\/availability/.test(r.url()) &&
          r.request().method() === "PATCH",
        { timeout: 20_000 }
      ),
      availabilitySwitch(categoryName, itemName).click(),
    ]);
    return {
      status: res.status(),
      body: res.request().postDataJSON() as {
        outOfStock?: boolean;
        restaurantId?: string;
      },
    };
  };

  // ── Featured ────────────────────────────────────────────────────────────

  const featuredSummary = () =>
    page.getByRole("button", { name: /^Featured Items \d+\/5/ });
  const featuredCounter = async (): Promise<string> => {
    const text = (await featuredSummary().textContent()) ?? "";
    return /(\d+\/5)/.exec(text)?.[1] ?? "";
  };
  const featuredAccordion = () =>
    page.locator(".MuiAccordion-root").filter({ has: featuredSummary() });
  const featuredRow = (itemName: string) =>
    featuredAccordion()
      .getByRole("listitem")
      .filter({ hasText: itemName })
      .first();

  const toggleFeatured = async (categoryName: string, itemName: string) => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/menu\/menu-items\/[^/]+\/featured/.test(r.url()) &&
          r.request().method() === "PATCH",
        { timeout: 20_000 }
      ),
      featureButton(categoryName, itemName).click(),
    ]);
    return {
      status: res.status(),
      body: res.request().postDataJSON() as { featured?: boolean },
    };
  };

  // ── Toasts / empty state / chain banners ────────────────────────────────

  const toast = (text: string | RegExp) =>
    page.getByRole("alert").filter({ hasText: text }).first();

  const emptyState = () => page.getByText("No menu data available");
  const openMenuBuilderButton = () =>
    page.getByRole("button", { name: "Open menu builder" });

  const chainLocationBanner = () =>
    page.getByText(/You're editing .*Shared items come from the chain menu/);
  const chainSharedBanner = () =>
    page.getByText(
      /This is your shared menu — changes here apply to all \d+ locations/
    );
  /** Location-view header line "Managing: <name> • part of your chain" + switch button. */
  const managingLine = () => page.getByText("Managing:");
  const switchToChainViewButton = () =>
    page.getByRole("button", {
      name: /Switch to chain view \(\d+ locations\)/,
    });
  const differentPriceChip = (categoryName: string, itemName: string) =>
    itemRow(categoryName, itemName).getByText(
      /\d+ locations? (has|have) a different price/
    );
  const menuSplitSummary = () =>
    page.getByText(/\d+ shared \(chain\) · \d+ only this location/);
  const sourceChip = (
    categoryName: string,
    itemName: string,
    kind: "shared" | "local"
  ) =>
    itemRow(categoryName, itemName).getByText(
      kind === "shared" ? "From shared menu" : "This location only",
      { exact: true }
    );

  return {
    goto,
    gotoChain,
    heading,
    manageMenuButton,
    refreshButton,
    sidebarMenuTab,
    assertLoaded,
    waitForMenuLoad,
    categorySummary,
    categoryAccordion,
    expandCategory,
    availableCount,
    outOfStockCount,
    assertCounts,
    restoreAllButton,
    restoreAll,
    itemRow,
    availabilitySwitch,
    editButton,
    featureButton,
    priceOverrideButton,
    carryButton,
    assertItemAvailable,
    assertItemOutOfStock,
    soldOutDialog,
    markSoldOut,
    markAvailable,
    featuredSummary,
    featuredCounter,
    featuredAccordion,
    featuredRow,
    toggleFeatured,
    toast,
    emptyState,
    openMenuBuilderButton,
    chainLocationBanner,
    chainSharedBanner,
    managingLine,
    switchToChainViewButton,
    differentPriceChip,
    menuSplitSummary,
    sourceChip,
  };
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type MenuAvailabilityPage = ReturnType<
  typeof createMenuAvailabilityPage
>;

/** Legacy name kept for the access suite (`createMenuManagementPage(page).goto(id)`). */
export const createMenuManagementPage = createMenuAvailabilityPage;
export type MenuManagementPage = MenuAvailabilityPage;
