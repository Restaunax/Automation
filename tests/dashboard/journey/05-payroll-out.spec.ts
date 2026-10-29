/**
 * 05-payroll-out.spec.ts — "a week in a restaurant", part 5: the owner takes
 * an approved week to payroll from Payday, in the browser (TC-1014..1019).
 * docs/COVERAGE_MAP.md §3, phase 6.
 *
 * One throwaway restaurant on the payroll-file setup, weekly pay periods
 * from a Sunday. Last week, approved: Dee (Server, her own $13.00) Mon–Fri
 * 8 h = 40 h, $520.00; Ben (Busser, $11.00) Fri 2 h, $22.00. With Mailpit,
 * Dee accepted her invite and has a Restaunax account.
 *
 *   TC-1014 Payday walks the approved week: nothing flagged, approved, and
 *           Run payroll asks for the file.
 *   TC-1015 Export for payroll warns that Dee and Ben have no payroll ID,
 *           and says where to add it.
 *   TC-1016 The owner adds Dee's payroll ID in People → Edit; the export
 *           then warns about Ben only.
 *   TC-1017 Download: the RestauNax file is the approval to the cent, with
 *           Dee's ID; "marked exported" is seen.
 *   TC-1017b After the download Payday says the file is downloaded, not that
 *           payroll ran (RestauNax #1103).
 *   TC-1018 The Gusto file carries the same hours; downloading the RestauNax
 *           file again gives the same file.
 *   TC-1019 Dee sees the approved week and her $520.00 in Restaunax Staff
 *           (Mailpit only).
 */
import { readFileSync } from "fs";
import type { Download, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId, recordUserForCleanup } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import { csvToObjects } from "../../../utils/csvHelper";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  putPayrollSettingsRaw,
  payrollRaw,
  createStaffJobRaw,
  setMemberJobsRaw,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  setOwnerPosPin,
  tabletStaffSignIn,
  tabletRaw,
  inviteStaffRaw,
  registerWithInvite,
  staffAppRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import { addDays } from "../../../utils/backOfficeApi";
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
/** Until RestauNax #1103 is on QA, TC-1017b is known to fail. */
const FIX_1103 = "RestauNax #1103 not on QA yet";
const FIXED_1103 = process.env.EXPECT_FIX_1103 === "1";

type Rec = Record<string, LooseJson>;

const NO_ID = (name: string) =>
  `${name} has no payroll ID, so the provider can't match them. Add it in People → Edit.`;

test.describe.configure({ mode: "serial" });

test.describe("Journey 5 — the owner takes the week to payroll", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let deviceId = "";
  let p1 = "";
  /** Dee's Restaunax Staff token (Mailpit only). */
  let deeToken = "";
  /** The first RestauNax file, to compare a second download with. */
  let firstFile = "";
  let session: UiLoginSession | undefined;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const portal = (query = "") =>
    `/restaurant/restaurantId/${restaurantId}/restaurantManagement${query}`;
  const snackbar = (text: string | RegExp) =>
    page().locator(".MuiSnackbar-root").filter({ hasText: text });
  const openPayday = async () => {
    await page().goto(portal(`?tab=staff&staffTab=payday&period=${p1}`), {
      waitUntil: "domcontentloaded",
    });
    await expect(page().getByTestId("payday-deadline")).toBeVisible({
      timeout: 25_000,
    });
  };
  const step = (title: string) =>
    page().getByRole("button", { name: new RegExp(`^${title} `) });
  const openExport = async () => {
    const runStep = step("Run payroll");
    const exportButton = page().getByRole("button", {
      name: "Export for payroll",
    });
    if (!(await exportButton.isVisible())) await runStep.click();
    await exportButton.click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName("Export for payroll");
    return dialog;
  };
  const pickFormat = async (format: string) => {
    const dialog = activeDialog(page());
    await dialog.getByRole("combobox").first().click();
    await page().getByRole("option", { name: format, exact: true }).click();
  };
  const download = async (): Promise<{ file: Download; text: string }> => {
    const dialog = activeDialog(page());
    const [file] = await Promise.all([
      page().waitForEvent("download"),
      dialog.getByRole("button", { name: "Download", exact: true }).click(),
    ]);
    return { file, text: readFileSync(await file.path(), "utf8") };
  };
  const rowsOf = (text: string) =>
    csvToObjects(text.replace(/^\uFEFF/, "")).rows;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[journey-5] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerEmail = tenant.email;
    ownerPassword = tenant.password;
    const owner = tenant.accessToken;
    for (const feature of ["PAYROLL", "SCHEDULING", "TIP_MANAGEMENT"]) {
      const granted = await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        feature,
        true
      );
      if (!granted.ok)
        throw new Error(
          `[journey-5] ${feature}: ${JSON.stringify(granted.data)}`
        );
    }
    const saved = await putPayrollSettingsRaw(owner, restaurantId, {
      payFrequency: "WEEKLY",
      periodAnchorDate: "2026-01-04",
      workweekStartDay: 0,
    });
    if (!saved.ok)
      throw new Error(`[journey-5] settings: ${JSON.stringify(saved.data)}`);
    const periods = await payrollRaw(
      owner,
      restaurantId,
      "GET",
      "/pay-periods?count=4"
    );
    p1 =
      (((periods.data.data as Rec | undefined)?.periods as Rec[]) ?? [])
        .filter((p) => p.status === "OPEN")
        .map((p) => String(p.startDate))
        .sort()
        .at(-1) ?? "";
    if (!p1)
      throw new Error(
        `[journey-5] no finished period: ${JSON.stringify(periods.data)}`
      );

    const job = async (name: string, cents: number) => {
      const r = await createStaffJobRaw(owner, restaurantId, {
        name,
        defaultHourlyRateCents: cents,
        isTipped: true,
      });
      if (r.status !== 201)
        throw new Error(`[journey-5] job: ${JSON.stringify(r.data)}`);
      return String(r.data.data?.id);
    };
    const server = await job("Server", 1200);
    const busser = await job("Busser", 1100);

    const device = await createTabletDevice(
      adminToken,
      restaurantId,
      `auto-pay-${runId}`
    );
    deviceId = device.id;
    const tablet = await tabletLogin(device.name, device.code);
    const ownerMember = await setOwnerPosPin(owner, restaurantId, "8462");
    const ownerSession = await tabletStaffSignIn(tablet, ownerMember, "8462");
    const onPos = async (firstName: string, pin: string) => {
      const r = await tabletRaw<Rec>(
        tablet,
        "POST",
        "/staff/manage",
        { firstName, lastName: "Pay", pin },
        ownerSession
      );
      if (r.status !== 201)
        throw new Error(`[journey-5] staff: ${JSON.stringify(r.data)}`);
      return String((r.data.data as Rec).id);
    };

    // Dee is invited by email when Mailpit can carry it, so she has an
    // account for Restaunax Staff; otherwise she is a PIN-only person.
    let dee: string;
    if (MAILPIT) {
      const email = `auto-staff-dee-pay-${runId}@${DOMAIN}`;
      recordUserForCleanup(email);
      const invited = await inviteStaffRaw(owner, restaurantId, {
        email,
        firstName: "Dee",
        lastName: "Pay",
      });
      dee = String(invited.data.data?.staffMemberId ?? "");
      if (!dee)
        throw new Error(`[journey-5] invite: ${JSON.stringify(invited.data)}`);
      const mail = await waitForEmail(email, {
        subjectPattern: /added to the team at/i,
        timeoutMs: 90_000,
      });
      deeToken = (
        await registerWithInvite({
          firstName: "Dee",
          lastName: "Pay",
          email,
          password: `Automation!Staff-${runId}`,
          userInvitationToken: extractInviteToken(
            mail.text_body || mail.html_body
          ),
        })
      ).accessToken;
    } else {
      dee = await onPos("Dee", "4826");
    }
    const ben = await onPos("Ben", "5207");
    await setMemberJobsRaw(owner, restaurantId, dee, [
      { jobId: server, isPrimary: true, hourlyRateCents: 1300 },
    ]);
    await setMemberJobsRaw(owner, restaurantId, ben, [
      { jobId: busser, isPrimary: true },
    ]);

    const shift = async (
      who: string,
      jobId: string,
      day: string,
      from: string,
      to: string
    ) => {
      const r = await payrollRaw(owner, restaurantId, "POST", "/shifts", {
        staffMemberId: who,
        clockInAt: `${day}T${from}:00.000Z`,
        clockOutAt: `${day}T${to}:00.000Z`,
        jobId,
        reason: "Entered from the paper sheet",
      });
      if (r.status !== 201)
        throw new Error(`[journey-5] shift: ${JSON.stringify(r.data)}`);
    };
    for (const n of [1, 2, 3, 4, 5])
      await shift(dee, server, addDays(p1, n), "15:00", "23:00");
    await shift(ben, busser, addDays(p1, 5), "21:00", "23:00");
    const approved = await payrollRaw(
      owner,
      restaurantId,
      "POST",
      `/pay-periods/${p1}/approve`
    );
    if (approved.status !== 200)
      throw new Error(`[journey-5] approve: ${JSON.stringify(approved.data)}`);

    session = await loginViaUi(browser, ownerEmail, ownerPassword);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId) {
      if (deviceId)
        await deactivateTabletDevice(adminToken, restaurantId, deviceId).catch(
          () => {}
        );
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    }
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Journey — payroll out");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  test("TC-1014: Payday walks the approved week: nothing flagged, approved, and Run payroll asks for the file", async () => {
    await openPayday();
    await expect(page().getByTestId("payday-deadline")).toHaveText(
      "Your payroll provider sets the deadline. Download the file as soon as you approve and upload it there."
    );
    await expect(step("Fix flagged shifts")).toHaveAccessibleName(
      "Fix flagged shifts Nothing flagged"
    );
    await expect(step("Approve the hours")).toHaveAccessibleName(
      "Approve the hours Approved"
    );
    await expect(step("Run payroll")).toHaveAccessibleName(
      "Run payroll Download the file for your payroll provider"
    );
    await expect(
      page().getByText(
        "Download the payroll file and upload it to your payroll provider (Gusto, ADP RUN, Paychex or your accountant)."
      )
    ).toBeVisible();
    await expectHumanText(page().getByRole("main"), "Payday");
  });

  test("TC-1015: Export for payroll warns that nobody has a payroll ID, and says where to add it", async () => {
    const dialog = await openExport();
    await expect(dialog).toContainText(
      "The file comes from the approved timecards, so downloading again gives the same file."
    );
    await expect(
      dialog.getByRole("combobox", { name: "RestauNax CSV (any provider)" })
    ).toBeVisible();
    await expect(
      dialog.getByText("Check these before you upload:")
    ).toBeVisible();
    await expectSeenByUser(
      dialog.getByText(NO_ID("Dee Pay")),
      "Dee's missing payroll ID"
    );
    await expect(dialog.getByText(NO_ID("Ben Pay"))).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("TC-1016: the owner adds Dee's payroll ID in People → Edit; then only Ben is warned", async () => {
    await page().goto(portal("?tab=staff&staffTab=people"), {
      waitUntil: "domcontentloaded",
    });
    await page()
      .getByRole("button", { name: "Actions for Dee Pay" })
      .click({ timeout: 25_000 });
    await page().getByRole("menuitem", { name: "Edit", exact: true }).click();
    const dialog = activeDialog(page());
    await expect(dialog).toHaveAccessibleName("Edit Dee Pay");
    await dialog
      .getByRole("textbox", { name: "Payroll ID (optional)" })
      .fill("EMP-101");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();
    await expectSeenByUser(
      snackbar("Saved changes for Dee Pay."),
      '"Saved changes"'
    );

    await openPayday();
    const exportDialog = await openExport();
    await expect(exportDialog.getByText(NO_ID("Ben Pay"))).toBeVisible();
    await expect(exportDialog.getByText(NO_ID("Dee Pay"))).toHaveCount(0);
  });

  test("TC-1017: Download — the RestauNax file is the approval to the cent; the period is marked exported", async () => {
    const { file, text } = await download();
    expect(file.suggestedFilename()).toBe(
      `payroll-restaunax-${p1}-to-${addDays(p1, 6)}.csv`
    );
    firstFile = text;
    const rows = rowsOf(text);
    expect(rows).toHaveLength(2);
    const by = new Map(rows.map((r) => [r["First name"], r]));
    expect(by.get("Dee")).toMatchObject({
      "Pay period start": p1,
      "Pay period end": addDays(p1, 6),
      "Payroll ID": "EMP-101",
      Job: "Server",
      "Hourly rate": "13.00",
      "Regular hours": "40.00",
      "Overtime hours": "0.00",
      Wages: "520.00",
      "Gross paid": "520.00",
    });
    expect(by.get("Ben")).toMatchObject({
      "Payroll ID": "",
      Job: "Busser",
      "Hourly rate": "11.00",
      "Regular hours": "2.00",
      Wages: "22.00",
      "Gross paid": "22.00",
    });
    await expectSeenByUser(
      snackbar("Payroll file downloaded. The period is marked exported."),
      '"marked exported"'
    );
    await expect(activeDialog(page())).toHaveCount(0);
  });

  test("TC-1017b: after the download Payday says the file is downloaded, not that payroll ran", async () => {
    test.fail(!FIXED_1103, FIX_1103);
    await openPayday();
    await expect(page().getByTestId("payday-deadline")).toHaveText(
      "Approved, and the payroll file is downloaded. Upload it to your payroll provider if you haven't yet."
    );
    await expect(step("Run payroll")).toHaveAccessibleName(
      "Run payroll File downloaded"
    );
  });

  test("TC-1018: the Gusto file carries the same hours; the RestauNax file downloads again unchanged", async () => {
    await openPayday();
    await openExport();
    await pickFormat("Gusto");
    const gusto = await download();
    expect(gusto.file.suggestedFilename()).toBe(
      `payroll-gusto-${p1}-to-${addDays(p1, 6)}.csv`
    );
    const by = new Map(rowsOf(gusto.text).map((r) => [r["First_name"], r]));
    expect(by.get("Dee")).toMatchObject({
      Gusto_employee_id: "EMP-101",
      Title: "Server",
      Regular_hours: "40.00",
      Overtime_hours: "0.00",
    });
    expect(by.get("Ben")).toMatchObject({
      Title: "Busser",
      Regular_hours: "2.00",
    });

    await openPayday();
    await openExport();
    const again = await download();
    expect(again.text).toBe(firstFile);
  });

  test("TC-1019: Dee sees the approved week and her $520.00 in Restaunax Staff", async () => {
    test.skip(
      !MAILPIT,
      "Dee has an account only when Mailpit carried her invite"
    );
    const r = await staffAppRaw<{ data: Rec }>(
      deeToken,
      "GET",
      `/restaurants/${restaurantId}/pay-periods/${p1}`
    );
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    expect(r.data.data).toMatchObject({
      approved: true,
      status: "EXPORTED",
      regularMinutes: 2400,
      overtimeMinutes: 0,
      wagesCents: 52000,
    });
  });
});
