import { type Page, expect } from "@playwright/test";

// People → Affiliates (HQ affiliate management): the list, the "Status and
// commission plan" dialog (status, plan fields with a hint under each, live
// example, termination outcome) and the "Program defaults" tab.
// No data-testids in this feature; locators are role/text-based. The status
// and cause selects are MUI Selects without an accessible name, so they are
// picked by position inside the dialog (status first).
export const createAdminAffiliatesPage = (page: Page) => {
  const goto = async () => {
    await page.goto("/admin?tab=affiliate", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Affiliate Management" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const row = (referralTag: string) =>
    page.getByRole("row").filter({ hasText: referralTag }).first();

  const search = async (referralTag: string) => {
    await page
      .getByPlaceholder("Search by name, email, or tag...")
      .fill(referralTag);
    await row(referralTag).waitFor({ state: "visible", timeout: 15_000 });
  };

  const editButton = (referralTag: string) =>
    row(referralTag).getByRole("button", {
      name: /Edit Status & Commission|Terminated affiliates cannot be reinstated/,
    });

  // ── Status and commission plan dialog ─────────────────────────────────────
  const dialog = () =>
    // The title sits in the dialog's banner, not a heading role.
    page.getByRole("dialog").filter({ hasText: "Status and commission plan" });

  const openStatusDialog = async (referralTag: string) => {
    await goto();
    await search(referralTag);
    await editButton(referralTag).click();
    await expect(dialog()).toBeVisible({ timeout: 10_000 });
  };

  const chooseStatus = async (
    status: "Pending" | "Active" | "Suspended" | "Terminated" | "Rejected"
  ) => {
    await dialog().getByRole("combobox").first().click();
    await page.getByRole("option", { name: status, exact: true }).click();
  };

  /** The plan section is loaded once its first field is on screen. */
  const shareInput = () =>
    dialog().getByRole("spinbutton", { name: "Share (%)" });
  const afterWindowInput = () =>
    dialog().getByRole("spinbutton", { name: "After the window (%)" });

  const waitForPlan = async () => {
    await expect(shareInput()).toBeVisible({ timeout: 10_000 });
    // Pre-filled asynchronously from the plan or the program defaults.
    await expect(shareInput()).not.toHaveValue("", { timeout: 10_000 });
  };

  const liveExample = () => dialog().getByText(/^A restaurant paying /);

  const submitDialog = () =>
    dialog().getByRole("button", { name: "Update Status" }).click();

  /** Cancel; an edited form first asks "Discard unsaved changes?". */
  const cancelDialog = async () => {
    await dialog().getByRole("button", { name: "Cancel" }).click();
    const discard = page.getByRole("button", { name: "Discard changes" });
    if (await discard.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await discard.click();
    }
    await expect(dialog()).toBeHidden({ timeout: 10_000 });
  };

  const reasonInput = () =>
    dialog().getByRole("textbox", { name: /Reason for Status Change/ });

  // ── Program defaults tab ──────────────────────────────────────────────────
  const openProgramDefaults = async () => {
    await goto();
    await page.getByRole("tab", { name: "Program defaults" }).click();
    await expect(
      page.getByText(
        "Used to pre-fill the plan when you approve an affiliate. Changing it does not change anyone already approved."
      )
    ).toBeVisible({ timeout: 10_000 });
  };

  const defaultsShareInput = () =>
    page.getByRole("spinbutton", { name: "Share (%)" });

  const saveDefaults = async (reason: string) => {
    await page.getByRole("textbox", { name: "Reason (optional)" }).fill(reason);
    await page.getByRole("button", { name: "Save defaults" }).click();
    await expect(page.getByText("Program defaults saved.")).toBeVisible({
      timeout: 10_000,
    });
  };

  return {
    goto,
    row,
    search,
    editButton,
    dialog,
    openStatusDialog,
    chooseStatus,
    shareInput,
    afterWindowInput,
    waitForPlan,
    liveExample,
    submitDialog,
    cancelDialog,
    reasonInput,
    openProgramDefaults,
    defaultsShareInput,
    saveDefaults,
  };
};
