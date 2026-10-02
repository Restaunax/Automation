import { type Page, expect } from "@playwright/test";

/**
 * Dashboard — per-location pricing dialog (`LocationPricingEditor.tsx`),
 * opened from the `$` icon of a SHARED chain item on a location's Menu tab.
 * Title: `Pricing for "<item>" at this location`. Rows: "Base price" + one row
 * per priced modifier (spinbutton named by the modifier); each row shows the
 * shared price ("shared $12.00") and a chip "Shared" | "Overridden" plus a
 * "Reset to shared price" button once overridden. Header "Reset all to
 * shared"; footer "Cancel" / "Save"; quick-adjust "Adjust all by" ($ | %) +
 * "Apply". Save → PATCH /menu/menu-items/:id/location-pricing → toast
 * "Location prices saved."
 * Selectors verified on QA 2026-08-16.
 */
export const createLocationPricingDialog = (page: Page) => {
  const dialog = () =>
    page.getByRole("dialog", { name: /^Pricing for ".*" at this location/ });

  const basePriceInput = () =>
    dialog().getByRole("spinbutton", { name: "Base price" });
  const modifierInput = (name: string) =>
    dialog().getByRole("spinbutton", { name, exact: true });
  /** "shared $12.00" hint(s) — base and same-priced sizes can both show it; use .first()/count. */
  const sharedPriceText = (price: string) =>
    dialog().getByText(`shared $${price}`, { exact: true }).first();
  const overriddenChips = () =>
    dialog().getByText("Overridden", { exact: true });
  const sharedChips = () => dialog().getByText("Shared", { exact: true });
  const resetRowButtons = () =>
    dialog().getByRole("button", { name: "Reset to shared price" });
  const resetAllButton = () =>
    dialog().getByRole("button", { name: "Reset all to shared" });
  const adjustModeButton = (mode: "$" | "%") =>
    dialog().getByRole("button", { name: mode, exact: true });
  const adjustInput = () =>
    dialog()
      .locator("input[type=number]")
      .filter({ hasNot: page.locator("[aria-label]") })
      .last();
  const applyButton = () => dialog().getByRole("button", { name: "Apply" });
  const saveButton = () =>
    dialog().getByRole("button", { name: "Save", exact: true });
  const cancelButton = () => dialog().getByRole("button", { name: "Cancel" });

  const waitFor = () => expect(dialog()).toBeVisible({ timeout: 10_000 });

  /** Save → resolves with the PATCH status and body. */
  const save = async () => {
    const [res] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/menu\/menu-items\/[^/]+\/location-pricing/.test(r.url()) &&
          r.request().method() === "PATCH",
        { timeout: 20_000 }
      ),
      saveButton().click(),
    ]);
    await expect(dialog()).toBeHidden({ timeout: 10_000 });
    return {
      status: res.status(),
      body: res.request().postDataJSON() as {
        restaurantId?: string;
        basePriceOverride?: number | null;
        modifierOverrides?: {
          modifierId: string;
          priceOverride: number | null;
        }[];
      },
    };
  };

  const savedToast = () => page.getByText("Location prices saved.");

  return {
    dialog,
    waitFor,
    basePriceInput,
    modifierInput,
    sharedPriceText,
    overriddenChips,
    sharedChips,
    resetRowButtons,
    resetAllButton,
    adjustModeButton,
    adjustInput,
    applyButton,
    saveButton,
    cancelButton,
    save,
    savedToast,
  };
};

export type LocationPricingDialog = ReturnType<
  typeof createLocationPricingDialog
>;
