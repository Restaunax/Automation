/**
 * 01-open-hire-schedule.spec.ts — "a week in a restaurant", part 1: a new
 * owner sets up the back office, hires and schedules, all in the browser,
 * the way a person does it (TC-978..989). docs/COVERAGE_MAP.md §3, phases
 * 0–2.
 *
 * One throwaway restaurant with the PAYROLL, SCHEDULING and TIP_MANAGEMENT
 * add-ons (granted by HQ, as sales does). The owner then follows the "Set up
 * your back office" checklist:
 *
 *   TC-978  The checklist starts empty and points at jobs; Go there opens
 *           Jobs & wages.
 *   TC-979  Add a job: an empty or broken form says what's wrong INSIDE the
 *           dialog; Server $12 and Busser $11 (both tipped) are listed.
 *   TC-980  The checklist ticks while the owner is still on the tab, no
 *           reload (RestauNax #1094).
 *   TC-981  Pay schedule: every week, from a Sunday. Saved, and still so
 *           after a reload.
 *   TC-982  Sales tax: the first rate is offered as "Sales tax"; 7% becomes
 *           the default, and Recent changes says so in one sentence.
 *   TC-983  Saving a rate says so, and Recent changes shows it without a
 *           reload (RestauNax #1094).
 *   TC-984  Invite Dee as a Server: Send invite waits for the form; "Invite
 *           sent" is seen on top of the next window; her own rate $13.00;
 *           she's on the list after a reload.
 *   TC-985  Dee opens the invite email, sets her PIN, creates her account
 *           (Mailpit only).
 *   TC-986  Schedule next week: an empty week's Publish hint says there are
 *           no shifts (RestauNax #1094); a Monday shift 11:00–19:00 with a
 *           30-minute unpaid break is 7.50 h and $97.50 (her $13.00 rate);
 *           Publish names the change; after a reload it's published.
 *   TC-987  Dee sees the published shift in Restaunax Staff (Mailpit only).
 *   TC-988  After a reload the checklist agrees with the server, and the
 *           steps this journey did are ticked.
 *   TC-989  A long restaurant name doesn't run under the header's name
 *           block (RestauNax #1094).
 *
 * TC-980, TC-983, TC-986b and TC-989 guard the four bugs RestauNax #1094
 * fixed (on QA since 2026-10-29). TC-989 still failed after it: the header's
 * right-hand block was the part overflowing, fixed by RestauNax #1096.
 */
import type { Locator, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  FRONTEND_URL,
  generateRunId,
  recordUserForCleanup,
} from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  staffAppRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  addDays,
  backOfficeSetupRaw,
  localToday,
  specialHoursRaw,
} from "../../../utils/backOfficeApi";
import { extractInviteToken, waitForEmail } from "../../../utils/emailHelper";
import {
  activeDialog,
  DESKTOP,
  expectHumanText,
  expectSeenByUser,
} from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = !!process.env.MAILPIT_BASE_URL;
const DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";

type Rec = Record<string, LooseJson>;

/** "Mon, Nov 2" — how the schedule names a day. */
const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

/** The Sunday on or before `date` (the restaurant's workweek start). */
const sundayOf = (date: string) =>
  addDays(date, -new Date(`${date}T12:00:00Z`).getUTCDay());

test.describe.configure({ mode: "serial" });

test.describe("Journey 1 — open, hire, schedule (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  const dee = {
    first: "Dee",
    last: `Server${runId.slice(-4)}`,
    email: `auto-staff-dee-${runId}@${DOMAIN}`,
    password: `Automation!Staff-${runId}`,
    pin: "4826",
    token: "",
  };
  const deeName = () => `${dee.first} ${dee.last}`;
  let adminToken = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;
  let today = "";
  /** Next week's Monday: the shift this journey publishes. */
  let shiftDay = "";

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const ownerToken = async () =>
    (await apiLogin(ownerEmail, ownerPassword)).accessToken;
  const portal = (query = "") =>
    `/restaurant/restaurantId/${restaurantId}/restaurantManagement${query}`;
  const checklist = () => page().getByTestId("back-office-setup");
  const doneLine = () => checklist().getByText(/\d+ of \d+ done/);
  const step = (id: string) => page().getByTestId(`setup-step-${id}`);
  const snackbar = (text: string | RegExp) =>
    page().locator(".MuiSnackbar-root").filter({ hasText: text });
  const dialogSave = () =>
    activeDialog(page()).getByRole("button", { name: "Save", exact: true });
  const openStaff = async (staffTab = "") => {
    await page().goto(
      portal(`?tab=staff${staffTab ? `&staffTab=${staffTab}` : ""}`),
      { waitUntil: "domcontentloaded" }
    );
    await expect(doneLine()).toBeVisible({ timeout: 25_000 });
  };
  /** The schedule, moved on to next week (the week with Dee's shift). */
  const openNextWeek = async () => {
    await openStaff("schedule");
    await page().getByRole("button", { name: "Next week" }).click();
    await expect(
      page().getByRole("heading", {
        name: new RegExp(`^${dayLabel(addDays(shiftDay, -1))}`),
      })
    ).toBeVisible({ timeout: 15_000 });
  };
  const doneCount = async () =>
    Number(((await doneLine().innerText()).match(/(\d+) of/) ?? [])[1]);
  const isTicked = (id: string) =>
    expect(step(id).getByRole("button", { name: "Go there" })).toHaveCount(0);

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[journey-1] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerEmail = tenant.email;
    ownerPassword = tenant.password;
    for (const feature of ["PAYROLL", "SCHEDULING", "TIP_MANAGEMENT"]) {
      const granted = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      if (!granted.ok)
        throw new Error(
          `[journey-1] ${feature}: ${JSON.stringify(granted.data)}`
        );
    }
    recordUserForCleanup(dee.email);
    const zone = String(
      (await specialHoursRaw(tenant.accessToken, restaurantId, "GET")).data
        .timeZone
    );
    today = localToday(zone);
    shiftDay = addDays(sundayOf(today), 8);
    session = await loginViaUi(browser, ownerEmail, ownerPassword);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Journey — open, hire, schedule");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  test("TC-978: the checklist starts empty and points at jobs; Go there opens Jobs & wages", async () => {
    await openStaff();
    await expect(checklist()).toContainText("Set up your back office");
    await expect(doneLine()).toHaveText(/^0 of \d+ done/);
    await checklist().getByRole("button", { name: "Show all steps" }).click();
    await expectHumanText(checklist(), "the checklist");
    // The steps that need jobs say so instead of offering a button.
    for (const id of ["assignJobs", "publishSchedule", "approvePeriod"])
      await expect(step(id)).toContainText("Needs your jobs first");

    await step("jobs").getByRole("button", { name: "Go there" }).click();
    await expect(page()).toHaveURL(/staffTab=jobs/);
    await expect(page().getByText(/No jobs yet/)).toBeVisible();
  });

  test("TC-979: adding a job explains a bad form inside the dialog; Server and Busser are listed", async () => {
    const addJob = page().getByRole("button", { name: "Add job" });
    await addJob.click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName("Add a job");

    await dialogSave().click();
    await expectSeenByUser(
      dialog.getByText("Enter a job name."),
      "the missing-name message"
    );
    await dialog.getByRole("textbox", { name: "Job name" }).fill("Server");
    await dialog
      .getByRole("textbox", { name: "Default hourly rate" })
      .fill("-5");
    await dialogSave().click();
    await expectSeenByUser(
      dialog.getByText("Enter an hourly rate like 15 or 15.50."),
      "the bad-rate message"
    );

    const add = async (name: string, rate: string) => {
      const d = activeDialog(page());
      await d.getByRole("textbox", { name: "Job name" }).fill(name);
      await d.getByRole("textbox", { name: "Default hourly rate" }).fill(rate);
      await d.getByRole("checkbox", { name: "Tipped job" }).check();
      await dialogSave().click();
      await expect(d).toBeHidden();
      await expectSeenByUser(snackbar(`${name} saved.`), `"${name} saved."`);
    };
    await add("Server", "12");
    await addJob.click();
    await add("Busser", "11");

    await expect(
      page().getByRole("row", { name: /^Server \$12\.00\/hr Tipped/ })
    ).toBeVisible();
    await expect(
      page().getByRole("row", { name: /^Busser \$11\.00\/hr Tipped/ })
    ).toBeVisible();
  });

  test("TC-980: the checklist ticks the jobs step without a reload", async () => {
    await expect(doneLine()).not.toHaveText(/^0 of/, { timeout: 10_000 });
    await isTicked("jobs");
  });

  test("TC-981: the pay schedule is every week from a Sunday, and stays so after a reload", async () => {
    await openStaff();
    await checklist().getByRole("button", { name: "Show all steps" }).click();
    await step("paySchedule").getByRole("button", { name: "Go there" }).click();
    await expect(page()).toHaveURL(/staffTab=payrollSettings/);

    const firstDay = addDays(sundayOf(today), -7);
    await page().getByRole("combobox", { name: "Every two weeks" }).click();
    await page().getByRole("option", { name: "Every week" }).click();
    await page()
      .getByRole("textbox", { name: "First day of any pay period" })
      .fill(firstDay);
    await expect(page().getByText("You have unsaved changes.")).toBeVisible();
    await page().getByRole("button", { name: "Save changes" }).click();
    await expectSeenByUser(
      snackbar("Payroll settings saved."),
      '"Payroll settings saved."'
    );
    await expect(page().getByText("All changes saved.")).toBeVisible();

    await page().reload({ waitUntil: "domcontentloaded" });
    await expect(
      page().getByRole("combobox", { name: "Every week" })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page().getByRole("textbox", { name: "First day of any pay period" })
    ).toHaveValue(firstDay);
  });

  const openSalesTax = async () => {
    await page().goto(portal("?tab=Store+Settings&settingsTab=sales-tax"), {
      waitUntil: "domcontentloaded",
    });
    await expect(page().getByRole("button", { name: "Add rate" })).toBeVisible({
      timeout: 25_000,
    });
  };
  const recentChanges = () => page().getByTestId("recent-changes");
  const taxSentence = /added sales tax rate Sales tax \(7%\)/;

  test("TC-982: the first tax rate is offered as Sales tax; 7% becomes the default and Recent changes says so", async () => {
    await openSalesTax();
    await expect(recentChanges()).toContainText("No changes recorded yet.", {
      timeout: 15_000,
    });
    await page().getByRole("button", { name: "Add rate" }).click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName("Add tax rate");
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue(
      "Sales tax"
    );
    await expect(dialogSave()).toBeDisabled();
    await dialog.getByRole("spinbutton", { name: "Rate (%)" }).fill("7");
    await dialogSave().click();
    await expect(dialog).toBeHidden();
    await expect(
      page().getByRole("row", { name: /^Sales tax Default 7%/ })
    ).toBeVisible();

    await page().reload({ waitUntil: "domcontentloaded" });
    await expect(recentChanges()).toContainText(taxSentence, {
      timeout: 20_000,
    });
    await expectHumanText(recentChanges(), "Recent changes");
  });

  test("TC-983: saving a rate says so, and Recent changes shows it without a reload", async () => {
    await openSalesTax();
    const row = page().getByRole("row", { name: /^Sales tax Default 7%/ });
    await row.getByRole("button", { name: "Edit rate" }).click();
    const dialog = activeDialog(page());
    await dialog.getByRole("textbox", { name: "Name" }).fill("State sales tax");
    await dialogSave().click();
    await expectSeenByUser(
      page()
        .getByRole("alert")
        .filter({ hasText: "State sales tax (7%) saved." }),
      "the rate-saved message"
    );
    await expect(recentChanges()).toContainText(/State sales tax/, {
      timeout: 10_000,
    });
  });

  test("TC-984: inviting Dee as a Server — Send invite waits for the form, the confirmation is seen, her rate is $13.00", async () => {
    await openStaff();
    await page().getByRole("button", { name: "Invite Staff" }).first().click();
    const invite = activeDialog(page());
    await expect(invite).toHaveAccessibleName("Invite a staff member");
    const send = invite.getByRole("button", { name: "Send invite" });
    await expect(send).toBeDisabled();
    await invite.getByRole("textbox", { name: "First name" }).fill(dee.first);
    await invite.getByRole("textbox", { name: "Last name" }).fill(dee.last);
    await invite.getByRole("textbox", { name: "Email" }).fill(dee.email);
    await invite.getByRole("combobox", { name: "Job" }).click();
    await page().getByRole("option", { name: "Server" }).click();
    await expect(
      invite.getByRole("switch", { name: "Clocks in" })
    ).toBeChecked();
    await send.click();

    // The next window opens straight away; the confirmation must not hide
    // behind it.
    const jobs = activeDialog(page());
    await expect(jobs).toHaveAccessibleName(`Jobs & pay for ${deeName()}`);
    await expectSeenByUser(
      snackbar(`Invite sent to ${dee.email}.`),
      '"Invite sent"'
    );
    await expect(
      jobs.getByRole("checkbox", { name: "Assign Server" })
    ).toBeChecked();
    await expect(
      jobs.getByRole("radio", { name: "Make Server their primary job" })
    ).toBeChecked();
    const rate = jobs.getByRole("textbox", {
      name: "Their hourly rate for Server",
    });
    await expect(rate).toHaveAttribute("placeholder", "$12.00");
    await rate.fill("13");
    await dialogSave().click();
    await expect(jobs).toBeHidden();
    await expectSeenByUser(
      snackbar(`Jobs saved for ${deeName()}.`),
      '"Jobs saved"'
    );

    await page().reload({ waitUntil: "domcontentloaded" });
    const row = page().getByRole("row").filter({ hasText: deeName() });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(dee.email);
    await expectHumanText(row, "Dee's row");
  });

  test("TC-985: Dee opens her invite email, sets her PIN and creates her account", async ({
    browser,
  }) => {
    test.skip(
      !MAILPIT,
      "Requires Mailpit (MAILPIT_BASE_URL): the invite is an email"
    );
    const mail = await waitForEmail(dee.email, {
      subjectPattern: /added to the team at/i,
      timeoutMs: 90_000,
    });
    const token = extractInviteToken(mail.text_body || mail.html_body);

    // Dee's own browser: nobody is signed in there.
    const context = await browser.newContext({
      baseURL: FRONTEND_URL,
      viewport: DESKTOP,
    });
    try {
      const dp = await context.newPage();
      await dp.goto(`/invitation?userToken=${encodeURIComponent(token)}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(
        dp.getByRole("heading", { name: "You've Been Invited!" })
      ).toBeVisible({ timeout: 25_000 });
      await expect(dp.getByText(/^Welcome to .+/)).toBeVisible();
      await expect(
        dp.getByRole("heading", { name: "Step 1: Choose your PIN" })
      ).toBeVisible();

      const pin = dp.getByLabel(/^PIN \(4/);
      const confirmPin = dp.getByLabel("Confirm PIN");
      const setPin = dp.getByRole("button", { name: "Set PIN" });
      const createAccount = dp.getByRole("button", { name: "Create Account" });
      // Step 2 is shown from the start but waits for the PIN.
      await expect(setPin).toBeDisabled();
      await expect(createAccount).toBeDisabled();

      // Typos say so, next to the form.
      await pin.fill(dee.pin);
      await confirmPin.fill("4827");
      await setPin.click();
      await expectSeenByUser(dp.getByText("PINs don't match."), "PIN mismatch");

      // A PIN anyone could guess is refused.
      await pin.fill("1234");
      await confirmPin.fill("1234");
      await setPin.click();
      await expectSeenByUser(
        dp.getByText(/That PIN is too easy to guess/),
        "weak PIN"
      );

      await pin.fill(dee.pin);
      await confirmPin.fill(dee.pin);
      await setPin.click();
      await expect(
        dp.getByText(/Sign in on the POS at .+ with your PIN/)
      ).toBeVisible({ timeout: 15_000 });
      await expect(createAccount).toBeEnabled();
      await expectHumanText(dp.locator("body"), "invite page");

      // Step 2: her account, with the invited email already filled in.
      await createAccount.click();
      await expect(dp).toHaveURL(/\/sign-up/, { timeout: 15_000 });
      await expect(dp.getByLabel("Email")).toHaveValue(dee.email);
      await dp.getByLabel("First name").fill(dee.first);
      await dp.getByLabel("Last name").fill(dee.last);
      await dp.getByLabel(/^Password/).fill(dee.password);
      await dp.getByLabel(/^Confirm Password/).fill(dee.password);
      await dp.getByRole("button", { name: "Sign up", exact: true }).click();
      await expect(dp).not.toHaveURL(/\/sign-up|\/invitation/, {
        timeout: 30_000,
      });
    } finally {
      await context.close().catch(() => {});
    }

    // Her password works, and her account is the one the journey uses.
    dee.token = (await apiLogin(dee.email, dee.password)).accessToken;
    expect(dee.token).not.toBe("");
  });

  test("TC-986: next week, Dee's Monday 11:00–19:00 with a 30-minute break is 7.50 h and $97.50; Publish tells her", async () => {
    await openNextWeek();
    await expect(
      page().getByText("This week hasn't been published yet.")
    ).toBeVisible();

    await page()
      .getByRole("button", {
        name: `Add a shift for ${deeName()} on ${dayLabel(shiftDay)}`,
      })
      .click();
    const shift = activeDialog(page());
    await expect(shift).toHaveAccessibleName("Add shift");
    // MUI Selects are named by their value: Dee's only job is preselected.
    await expect(
      shift.getByRole("combobox", { name: deeName() })
    ).toBeVisible();
    await expect(
      shift.getByRole("combobox", { name: "Server", exact: true })
    ).toBeVisible();
    await shift.getByRole("textbox", { name: "Starts" }).fill("11:00");
    await shift.getByRole("textbox", { name: "Ends" }).fill("19:00");
    await shift
      .getByRole("spinbutton", { name: "Unpaid break (minutes)" })
      .fill("30");
    await dialogSave().click();
    await expect(shift).toBeHidden();
    await expectSeenByUser(
      snackbar("Shift saved. Publish to tell staff."),
      '"Shift saved"'
    );

    const row = page().getByRole("row").filter({ hasText: deeName() });
    await expect(row).toContainText("7.50 h · $97.50");
    await expect(row).toContainText("11:00 AM–7:00 PM");
    await expect(row).toContainText("Not published");

    const publish = page().getByRole("button", {
      name: "Publish",
      exact: true,
    });
    await publish.click();
    const confirm = activeDialog(page());
    await expect(confirm).toHaveAccessibleName("Publish schedule");
    await expect(confirm).toContainText("1 change will be published.");
    await expect(
      confirm.getByRole("radio", { name: "Only people whose shifts changed" })
    ).toBeChecked();
    await confirm.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(confirm).toBeHidden();
    await expectSeenByUser(snackbar("Published 1 change."), '"Published"');

    // Fresh load: wait for the page before moving a week on, or the click
    // lands before the schedule has loaded and the grid stays on this week.
    await openNextWeek();
    const after = page().getByRole("row").filter({ hasText: deeName() });
    await expect(after).toContainText("11:00 AM–7:00 PM", { timeout: 15_000 });
    await expect(after).not.toContainText("Not published");
    await expect(page().getByText(/^Last published /)).toBeVisible();
  });

  test("TC-986b: an empty week's Publish hint says there are no shifts yet", async () => {
    await openStaff("schedule");
    await page().getByRole("button", { name: "Next week" }).click();
    await page().getByRole("button", { name: "Next week" }).click();
    await page()
      .getByRole("button", { name: "Publish", exact: true })
      .hover({ force: true });
    await expect(page().getByRole("tooltip")).toHaveText(
      "No shifts this week yet. Add a shift, then publish."
    );
  });

  test("TC-987: Dee sees her published shift in Restaunax Staff", async () => {
    test.skip(!dee.token, "TC-985 didn't run (no Mailpit)");
    const from = `${addDays(shiftDay, -1)}T00:00:00.000Z`;
    const to = `${addDays(shiftDay, 2)}T00:00:00.000Z`;
    const res = await staffAppRaw<{ data: Rec[] }>(
      dee.token,
      "GET",
      `/schedule?from=${from}&to=${to}`
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.data).toHaveLength(1);
    expect(res.data.data[0]).toMatchObject({ jobName: "Server" });
  });

  test("TC-988: after a reload the checklist agrees with the server and ticks what this journey did", async () => {
    await openStaff();
    const api = await backOfficeSetupRaw(await ownerToken(), restaurantId);
    const data = api.data.data as Rec;
    await expect(doneLine()).toHaveText(
      new RegExp(`^${data.done} of ${data.total} done`)
    );
    expect(await doneCount()).toBeGreaterThanOrEqual(5);
    await checklist().getByRole("button", { name: "Show all steps" }).click();
    for (const id of [
      "jobs",
      "assignJobs",
      "paySchedule",
      "publishSchedule",
      "salesTaxRate",
    ])
      await isTicked(id);
  });

  test("TC-989: a long restaurant name doesn't run under the header's name block", async () => {
    await openStaff();
    const banner = page().getByRole("banner");
    // The header is drawn twice (phone and desktop); the desktop one shows.
    const title = banner
      .getByText(/ — Restaurant Staff$/)
      .filter({ visible: true });
    const nameBlock: Locator = banner
      .getByRole("paragraph")
      .filter({ hasText: /^Automation Owner2 Store/, visible: true });
    const t = await title.boundingBox();
    const n = await nameBlock.boundingBox();
    expect(t && n, "header title and name block are on screen").toBeTruthy();
    expect(
      Math.ceil((t?.x ?? 0) + (t?.width ?? 0)),
      "the page title ends before the name block starts"
    ).toBeLessThanOrEqual(Math.floor(n?.x ?? 0));
  });
});
