import { type Page, type Locator, expect } from "@playwright/test";

/**
 * Dashboard — the 4-step menu item wizard (`AddCategoryItem.tsx`):
 *   create  …/restaurant/restaurantId/:rid/groupId/:gid   (+ ?cloneFrom=:iid, ?ownerOnly=1)
 *   edit    …/restaurant/restaurantId/:rid/groupId/:gid/itemId/:iid/edit
 *   chain   /chain/:groupId/groupId/:gid[/itemId/:iid/edit]
 * Steps: Basic Information → Modifiers → Image Upload → Review. The current
 * build AUTO-SUBMITS on entering Review (Save Item stays disabled) and lands
 * back on the builder; `finish()` handles both that and a future explicit save.
 *
 * ROLE-AGNOSTIC (owner / employee / admin reach the same screen). Selectors
 * verified on QA 2026-08-16:
 *  - step-0 fields by placeholder (RHF onBlur validation → press Tab after fill)
 *  - modifier groups are RHF field arrays: `input[name="modifierGroups.<g>.minSelections"]`,
 *    `…maxSelections`, `…modifiers.<m>.price`; group / option NAMES are free-solo
 *    Autocomplete comboboxes found by placeholder within the group panel;
 *    pricing is an MUI Select (combobox showing "Free / Included" | "Adds to
 *    Price (+$)" | "Sets Final Price"); "Default Selected" / "Allow Multiples"
 *    are checkboxes next to a label span (the same-named BUTTON is an info
 *    popover — never click it, it aria-hides the page).
 *  - image step: hidden `input[type=file]` (multiple, images only) — use setInputFiles.
 */
export type PricingModeLabel =
  | "Free / Included"
  | "Adds to Price (+$)"
  | "Sets Final Price";

export interface WizardOption {
  name: string;
  price?: number | string;
  isDefault?: boolean;
  allowMultiples?: boolean;
}
export interface WizardModifierGroup {
  name: string;
  pricing: PricingModeLabel;
  min?: number;
  max?: number;
  options: WizardOption[];
}

export const createMenuItemWizardPage = (page: Page) => {
  const gotoCreate = (restaurantId: string, groupId: string, q = "") =>
    page.goto(
      `/restaurant/restaurantId/${restaurantId}/groupId/${groupId}${q}`,
      {
        waitUntil: "domcontentloaded",
      }
    );
  const gotoEdit = (restaurantId: string, groupId: string, itemId: string) =>
    page.goto(
      `/restaurant/restaurantId/${restaurantId}/groupId/${groupId}/itemId/${itemId}/edit`,
      { waitUntil: "domcontentloaded" }
    );

  // ── Chrome ────────────────────────────────────────────────────────────────
  const stepHeading = (name: string) =>
    page.getByRole("heading", { name, level: 2 });
  const nextButton = () => page.getByRole("button", { name: "Next" });
  const backButton = () => page.getByRole("button", { name: "Back" });
  const saveItemButton = () => page.getByRole("button", { name: "Save Item" });
  const previewButton = () =>
    page.getByRole("button", { name: /^Preview( Item)?$/ });
  const fieldErrors = () => page.locator(".MuiFormHelperText-root");
  const errorBadge = () => page.getByText(/\d+ error\(s\) found/);

  const assertOnStep = (step: 0 | 1 | 2 | 3) =>
    expect(
      stepHeading(
        [
          "Basic Information",
          "Modifiers Configuration",
          "Menu Item Image",
          "Review and Save",
        ][step]!
      )
    ).toBeVisible({ timeout: 15_000 });

  // ── Step 0 — Basic Information ─────────────────────────────────────────
  const nameInput = () => page.getByPlaceholder("Enter the menu item name");
  const priceInput = () => page.getByPlaceholder("Enter the base price");
  const descriptionInput = () =>
    page.getByPlaceholder("Enter a detailed description of the item");
  const weightInput = () => page.getByPlaceholder("e.g., 8");

  const waitForStep0 = () =>
    nameInput().waitFor({ state: "visible", timeout: 20_000 });

  /** Fill + blur (RHF mode "onBlur"). Pass "" to clear a field. */
  const fillBasics = async (basics: {
    name?: string;
    price?: string;
    description?: string;
    weightOz?: string;
  }) => {
    if (basics.name !== undefined) {
      await nameInput().fill(basics.name);
      await nameInput().press("Tab");
    }
    if (basics.price !== undefined) {
      await priceInput().fill(basics.price);
      await priceInput().press("Tab");
    }
    if (basics.description !== undefined) {
      await descriptionInput().fill(basics.description);
      await descriptionInput().press("Tab");
    }
    if (basics.weightOz !== undefined) {
      await weightInput().fill(basics.weightOz);
      await weightInput().press("Tab");
    }
  };

  const pasteTextButton = () =>
    page.getByRole("button", { name: "Paste Text" });
  const browseTemplatesButton = () =>
    page.getByRole("button", { name: "Browse Templates" });

  // ── Step 1 — Modifiers ─────────────────────────────────────────────────
  const addModifierGroupButton = () =>
    page.getByRole("button", { name: "Add Modifier Group" });

  /** The g-th group panel — the closest card holding its RHF min-selections input. */
  const groupPanel = (g: number): Locator =>
    page
      .locator(".MuiPaper-root, .MuiCard-root")
      .filter({
        has: page.locator(`input[name="modifierGroups.${g}.minSelections"]`),
      })
      .last();
  const groupNameInput = (g: number) =>
    groupPanel(g).getByPlaceholder("e.g., Size, Toppings, Sides");
  const groupPricingSelect = (g: number) =>
    groupPanel(g)
      .getByRole("combobox")
      .filter({
        hasText: /Free \/ Included|Adds to Price|Sets Final Price/,
      });
  const groupMinInput = (g: number) =>
    page.locator(`input[name="modifierGroups.${g}.minSelections"]`);
  const groupMaxInput = (g: number) =>
    page.locator(`input[name="modifierGroups.${g}.maxSelections"]`);
  const optionNameInput = (g: number, m: number) =>
    groupPanel(g)
      .getByPlaceholder("Option name (e.g., Large, Extra Cheese)")
      .nth(m);
  const optionPriceInput = (g: number, m: number) =>
    page.locator(`input[name="modifierGroups.${g}.modifiers.${m}.price"]`);
  /** The checkbox beside the "<label>" span of option m in group g. */
  const optionCheckbox = (
    g: number,
    m: number,
    label: "Default Selected" | "Allow Multiples"
  ) =>
    // The label span's PARENT div wraps exactly one checkbox + the span + the
    // info-popover button; go up one level, never search from an outer div.
    groupPanel(g)
      .locator(`span:text-is("${label}")`)
      .nth(m)
      .locator("xpath=..")
      .locator("input[type=checkbox]");
  const addOptionButton = (g: number) =>
    groupPanel(g).getByRole("button", { name: /^Add (First )?Option$/ });

  const selectPricing = async (g: number, mode: PricingModeLabel) => {
    await groupPricingSelect(g).click();
    await page.getByRole("option", { name: mode }).click();
    await expect(groupPricingSelect(g)).toContainText(mode.split(" (")[0]!);
  };

  /** Add one complete modifier group (appends as group index g = current count). */
  const addModifierGroup = async (group: WizardModifierGroup) => {
    const g = await page.locator('input[name$=".minSelections"]').count();
    await addModifierGroupButton().click();
    await groupNameInput(g).waitFor({ state: "visible", timeout: 10_000 });
    await groupNameInput(g).fill(group.name);
    await groupNameInput(g).press("Tab");
    await selectPricing(g, group.pricing);
    if (group.min !== undefined) await groupMinInput(g).fill(String(group.min));
    if (group.max !== undefined) await groupMaxInput(g).fill(String(group.max));
    for (const [m, opt] of group.options.entries()) {
      await addOptionButton(g).click();
      await optionNameInput(g, m).waitFor({
        state: "visible",
        timeout: 10_000,
      });
      await optionNameInput(g, m).fill(opt.name);
      await optionNameInput(g, m).press("Tab");
      if (opt.price !== undefined && group.pricing !== "Free / Included") {
        await optionPriceInput(g, m).fill(String(opt.price));
      }
      if (opt.isDefault) await optionCheckbox(g, m, "Default Selected").check();
      if (opt.allowMultiples)
        await optionCheckbox(g, m, "Allow Multiples").check();
    }
    return g;
  };

  // ── Step 2 — Image ─────────────────────────────────────────────────────
  const fileInput = () => page.locator('input[type="file"]').first();
  const uploadImage = async (absPath: string) => {
    await fileInput().setInputFiles(absPath);
    await expect(
      page
        .getByRole("button", {
          name: /^(View image|Remove image|Replace Image)$/,
        })
        .first()
    ).toBeVisible({ timeout: 10_000 });
  };
  const replaceImageButton = () =>
    page.getByRole("button", { name: "Replace Image" });

  // ── Navigation / finish ────────────────────────────────────────────────
  const next = async () => {
    await nextButton().click();
  };

  /**
   * Drive from the current step to Review and let the item save. Resolves with
   * the create/update response (POST /menu/item/new | PUT …/changes) so the
   * caller can grab the item id. Falls back to clicking "Save Item" if a build
   * stops auto-submitting.
   */
  const finish = async (): Promise<{ status: number; itemId?: string }> => {
    const saveResponse = page.waitForResponse(
      (r) =>
        (r.request().method() === "POST" &&
          /\/menu\/item\/new/.test(r.url())) ||
        (r.request().method() === "PUT" &&
          /\/menu\/menu-items\/[^/]+\/changes/.test(r.url())),
      { timeout: 30_000 }
    );
    // Walk forward until Review (max 3 clicks).
    for (let i = 0; i < 3; i++) {
      const onReview = await stepHeading("Review and Save")
        .isVisible()
        .catch(() => false);
      if (onReview) break;
      await nextButton().click();
      await page.waitForTimeout(300);
    }
    // Auto-submit fires on entering Review; else click Save Item.
    const raced = await Promise.race([
      saveResponse.then((r) => r),
      page.waitForTimeout(6_000).then(() => null),
    ]);
    let res = raced;
    if (!res) {
      await expect(saveItemButton()).toBeEnabled({ timeout: 10_000 });
      await saveItemButton().click();
      res = await saveResponse;
    }
    let itemId: string | undefined;
    if (res.request().method() === "POST") {
      const json = (await res.json().catch(() => ({}))) as {
        menuItem?: { id?: string };
      };
      itemId = json.menuItem?.id;
    } else {
      itemId = /menu-items\/([^/]+)\/changes/.exec(res.url())?.[1];
    }
    return { status: res.status(), itemId };
  };

  const successToast = (kind: "created" | "updated") =>
    page.getByText(`Menu item ${kind} successfully!`);

  // ── Chain banners ──────────────────────────────────────────────────────
  const sharedItemBanner = () =>
    page.getByText(/Shared chain menu item — changes to its name/);
  const locationOnlyBanner = () =>
    page.getByText(/This item is for this location only/);
  const fanOutDialog = () =>
    page.getByRole("dialog", { name: /Heads up — chain-wide change/ });

  return {
    gotoCreate,
    gotoEdit,
    stepHeading,
    assertOnStep,
    nextButton,
    backButton,
    saveItemButton,
    previewButton,
    fieldErrors,
    errorBadge,
    nameInput,
    priceInput,
    descriptionInput,
    weightInput,
    waitForStep0,
    fillBasics,
    pasteTextButton,
    browseTemplatesButton,
    addModifierGroupButton,
    groupPanel,
    groupNameInput,
    groupPricingSelect,
    groupMinInput,
    groupMaxInput,
    optionNameInput,
    optionPriceInput,
    optionCheckbox,
    addOptionButton,
    selectPricing,
    addModifierGroup,
    fileInput,
    uploadImage,
    replaceImageButton,
    next,
    finish,
    successToast,
    sharedItemBanner,
    locationOnlyBanner,
    fanOutDialog,
  };
};

export type MenuItemWizardPage = ReturnType<typeof createMenuItemWizardPage>;
