# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard/admin/affiliate-commission.spec.ts >> HQ — Affiliate commission plan >> TC-2057: HQ affiliate details — Payments shows THAT affiliate's money and payouts, with a Forfeited card and no Stripe setup
- Location: tests/dashboard/admin/affiliate-commission.spec.ts:368:9

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog').filter({ hasText: 'Affiliate Details' }).getByRole('tab', { name: 'Payments' })
Expected: visible
Error: strict mode violation: getByRole('dialog').filter({ hasText: 'Affiliate Details' }).getByRole('tab', { name: 'Payments' }) resolved to 2 elements:
    1) <button role="tab" tabindex="-1" type="button" aria-selected="false" class="MuiButtonBase-root MuiTab-root MuiTab-labelIcon MuiTab-textColorPrimary css-1wr9zx0">…</button> aka getByRole('tab', { name: 'Payments', exact: true })
    2) <button role="tab" tabindex="-1" type="button" aria-selected="false" class="MuiButtonBase-root MuiTab-root MuiTab-labelIcon MuiTab-textColorPrimary css-1wr9zx0">…</button> aka getByRole('tab', { name: 'Failed Payments' })

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('dialog').filter({ hasText: 'Affiliate Details' }).getByRole('tab', { name: 'Payments' })

```

# Test source

```ts
  1   | import { type Page, expect } from "@playwright/test";
  2   | 
  3   | // People → Affiliates (HQ affiliate management): the list, the "Status and
  4   | // commission plan" dialog (status, plan fields with a hint under each, live
  5   | // example, termination outcome) and the "Program defaults" tab.
  6   | // No data-testids in this feature; locators are role/text-based. The status
  7   | // and cause selects are MUI Selects without an accessible name, so they are
  8   | // picked by position inside the dialog (status first).
  9   | export const createAdminAffiliatesPage = (page: Page) => {
  10  |   const goto = async () => {
  11  |     await page.goto("/admin?tab=affiliate", { waitUntil: "domcontentloaded" });
  12  |     await page
  13  |       .getByRole("heading", { name: "Affiliate Management" })
  14  |       .waitFor({ state: "visible", timeout: 15_000 });
  15  |   };
  16  | 
  17  |   const row = (referralTag: string) =>
  18  |     page.getByRole("row").filter({ hasText: referralTag }).first();
  19  | 
  20  |   const search = async (referralTag: string) => {
  21  |     await page
  22  |       .getByPlaceholder("Search by name, email, or tag...")
  23  |       .fill(referralTag);
  24  |     await row(referralTag).waitFor({ state: "visible", timeout: 15_000 });
  25  |   };
  26  | 
  27  |   const editButton = (referralTag: string) =>
  28  |     row(referralTag).getByRole("button", {
  29  |       name: /Edit Status & Commission|Terminated affiliates cannot be reinstated/,
  30  |     });
  31  | 
  32  |   // ── Status and commission plan dialog ─────────────────────────────────────
  33  |   const dialog = () =>
  34  |     // The title sits in the dialog's banner, not a heading role.
  35  |     page.getByRole("dialog").filter({ hasText: "Status and commission plan" });
  36  | 
  37  |   const openStatusDialog = async (referralTag: string) => {
  38  |     await goto();
  39  |     await search(referralTag);
  40  |     await editButton(referralTag).click();
  41  |     await expect(dialog()).toBeVisible({ timeout: 10_000 });
  42  |   };
  43  | 
  44  |   const chooseStatus = async (
  45  |     status: "Pending" | "Active" | "Suspended" | "Terminated" | "Rejected"
  46  |   ) => {
  47  |     await dialog().getByRole("combobox").first().click();
  48  |     await page.getByRole("option", { name: status, exact: true }).click();
  49  |   };
  50  | 
  51  |   /** The plan section is loaded once its first field is on screen. */
  52  |   const shareInput = () =>
  53  |     dialog().getByRole("spinbutton", { name: "Share (%)" });
  54  |   const afterWindowInput = () =>
  55  |     dialog().getByRole("spinbutton", { name: "After the window (%)" });
  56  | 
  57  |   const waitForPlan = async () => {
  58  |     await expect(shareInput()).toBeVisible({ timeout: 10_000 });
  59  |     // Pre-filled asynchronously from the plan or the program defaults.
  60  |     await expect(shareInput()).not.toHaveValue("", { timeout: 10_000 });
  61  |   };
  62  | 
  63  |   const liveExample = () => dialog().getByText(/^A restaurant paying /);
  64  | 
  65  |   const submitDialog = () =>
  66  |     dialog().getByRole("button", { name: "Update Status" }).click();
  67  | 
  68  |   /** Cancel; an edited form first asks "Discard unsaved changes?". */
  69  |   const cancelDialog = async () => {
  70  |     await dialog().getByRole("button", { name: "Cancel" }).click();
  71  |     const discard = page.getByRole("button", { name: "Discard changes" });
  72  |     const asked = await discard
  73  |       .waitFor({ state: "visible", timeout: 2_000 })
  74  |       .then(() => true)
  75  |       .catch(() => false);
  76  |     if (asked) {
  77  |       await discard.click();
  78  |     }
  79  |     await expect(dialog()).toBeHidden({ timeout: 10_000 });
  80  |   };
  81  | 
  82  |   const reasonInput = () =>
  83  |     dialog().getByRole("textbox", { name: /Reason for Status Change/ });
  84  | 
  85  |   // ── Affiliate details dialog (the eye icon) ──────────────────────────────
  86  |   const detailsDialog = () =>
  87  |     page.getByRole("dialog").filter({ hasText: "Affiliate Details" });
  88  | 
  89  |   const openDetails = async (referralTag: string) => {
  90  |     await goto();
  91  |     await search(referralTag);
  92  |     await row(referralTag)
  93  |       .getByRole("button", { name: "View Details" })
  94  |       .click();
  95  |     await expect(detailsDialog()).toBeVisible({ timeout: 15_000 });
  96  |     await expect(
  97  |       detailsDialog().getByRole("tab", { name: "Payments" })
> 98  |     ).toBeVisible({ timeout: 15_000 });
      |       ^ Error: expect(locator).toBeVisible() failed
  99  |   };
  100 | 
  101 |   /** A money card inside the details dialog, by its exact title. */
  102 |   const detailsMoneyCard = (title: string) =>
  103 |     detailsDialog()
  104 |       .locator(".MuiCard-root")
  105 |       .filter({ has: page.getByText(title, { exact: true }) })
  106 |       .first();
  107 | 
  108 |   // ── Program defaults tab ──────────────────────────────────────────────────
  109 |   const openProgramDefaults = async () => {
  110 |     await goto();
  111 |     await page.getByRole("tab", { name: "Program defaults" }).click();
  112 |     await expect(
  113 |       page.getByText(
  114 |         "Used to pre-fill the plan when you approve an affiliate. Changing it does not change anyone already approved."
  115 |       )
  116 |     ).toBeVisible({ timeout: 10_000 });
  117 |   };
  118 | 
  119 |   const defaultsShareInput = () =>
  120 |     page.getByRole("spinbutton", { name: "Share (%)" });
  121 | 
  122 |   const saveDefaults = async (reason: string) => {
  123 |     await page.getByRole("textbox", { name: "Reason (optional)" }).fill(reason);
  124 |     await page.getByRole("button", { name: "Save defaults" }).click();
  125 |     await expect(page.getByText("Program defaults saved.")).toBeVisible({
  126 |       timeout: 10_000,
  127 |     });
  128 |   };
  129 | 
  130 |   return {
  131 |     goto,
  132 |     row,
  133 |     search,
  134 |     editButton,
  135 |     dialog,
  136 |     openStatusDialog,
  137 |     chooseStatus,
  138 |     shareInput,
  139 |     afterWindowInput,
  140 |     waitForPlan,
  141 |     liveExample,
  142 |     submitDialog,
  143 |     cancelDialog,
  144 |     reasonInput,
  145 |     detailsDialog,
  146 |     openDetails,
  147 |     detailsMoneyCard,
  148 |     openProgramDefaults,
  149 |     defaultsShareInput,
  150 |     saveDefaults,
  151 |   };
  152 | };
  153 | 
```