/**
 * 39-portal-navigation-ui.spec.ts — browser Back and unsaved changes in the
 * owner portal, the way an owner uses them (TC-1944..1950).
 *
 *   TC-1944  Sidebar tabs: Back walks back through them one at a time and ends
 *            on Today. Clicking the tab already open adds no extra step.
 *   TC-1945  Subtabs: Customers, Store Settings and Owner Settings put the
 *            subtab in the URL, and Back shows the one before it.
 *   TC-1946  The note printed on the check is plain text. It follows the party
 *            size, percent and name as the owner edits them.
 *   TC-1947  Unsaved edits: Back and a sidebar click both ask. Keep editing
 *            stays put with the edit intact; Leave goes where they asked.
 *   TC-1948  With nothing unsaved, moving around never asks.
 *   TC-1949  Post History's Create Post opens the composer inside the portal,
 *            not a Not Found page (the link pointed at a route that is gone).
 *   TC-1950  Staff: unsaved payroll settings ask on a subtab click and on Back,
 *            and Back between Staff subtabs shows the one before.
 *
 * Browser. A per-run throwaway owner (createSecondOwner alwaysFresh) signed in
 * through the UI; the restaurant is deleted afterwards.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  updateRestaurantSettingsRaw,
} from "../../../utils/apiHelper";
import { activeDialog, DESKTOP } from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe.configure({ mode: "serial" });

test.describe("Owner — portal navigation: Back and unsaved changes (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;
  const page = (): Page => (session as UiLoginSession).page;

  const home = () =>
    `/restaurant/restaurantId/${restaurantId}/restaurantManagement`;
  const openHome = async (query = "") => {
    await page().goto(`${home()}${query}`, { waitUntil: "domcontentloaded" });
    await expect(page().locator(".MuiDrawer-paper:visible")).toBeVisible({
      timeout: 25_000,
    });
  };
  const sidebar = (name: string) =>
    page()
      .locator(".MuiDrawer-paper:visible")
      .getByText(name, { exact: true })
      .first();
  /** Where the page is, as the portal reads it. */
  const param = (name: string) => new URL(page().url()).searchParams.get(name);
  const expectParam = (name: string, value: string | null) =>
    expect.poll(() => param(name), { timeout: 10_000 }).toBe(value);
  const subtab = (name: string) => page().getByRole("tab", { name });

  const gratuityToggle = () =>
    page().getByRole("switch", { name: /Auto-gratuity for large parties/ });
  const openGratuity = async () => {
    await openHome("?tab=Store%20Settings&settingsTab=fees");
    await expect(gratuityToggle()).toBeVisible({ timeout: 25_000 });
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[portal-nav] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    const base = await updateRestaurantSettingsRaw(
      tenant.accessToken,
      restaurantId,
      { tableServiceEnabled: true }
    );
    if (base.status !== 200)
      throw new Error(`[portal-nav] base: ${JSON.stringify(base.data)}`);
    const social = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SOCIAL_MEDIA",
      true,
      "portal navigation E2E"
    );
    if (social.status >= 300)
      throw new Error(`[portal-nav] add-on: ${JSON.stringify(social.data)}`);
    const payroll = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "PAYROLL",
      true,
      "portal navigation E2E"
    );
    if (payroll.status >= 300)
      throw new Error(`[portal-nav] add-on: ${JSON.stringify(payroll.data)}`);
    session = await loginViaUi(browser, tenant.email, tenant.password);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Portal navigation (dashboard)");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  test("TC-1944: Back walks back through sidebar tabs, one at a time, to Today", async () => {
    await openHome();
    await expect(page().getByText("Today so far")).toBeVisible({
      timeout: 25_000,
    });
    await sidebar("Orders").click();
    await expectParam("tab", "Orders");
    await sidebar("Customers").click();
    await expectParam("tab", "Customers");
    // The tab already open: nothing new to go back through.
    await sidebar("Customers").click();

    await page().goBack();
    await expectParam("tab", "Orders");
    await page().goBack();
    await expectParam("tab", null);
    expect(new URL(page().url()).pathname).toBe(home());
    await expect(page().getByText("Today so far")).toBeVisible({
      timeout: 25_000,
    });
  });

  test("TC-1945: Back shows the previous subtab on Customers, Store Settings and Owner Settings", async () => {
    await openHome("?tab=Customers");
    await subtab("Customer Groups").click();
    await expectParam("customerTab", "segments");
    await expect(subtab("Customer Groups")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await page().goBack();
    await expectParam("customerTab", null);
    await expect(subtab("All Customers")).toHaveAttribute(
      "aria-selected",
      "true"
    );

    await openHome("?tab=Store%20Settings");
    await subtab("Fees & tips").click();
    await expectParam("settingsTab", "fees");
    await page().goBack();
    await expectParam("settingsTab", null);
    await expectParam("tab", "Store Settings");

    await openHome("?tab=Owner%20Settings");
    await subtab("Notifications").click();
    await expectParam("settingsView", "notifications");
    await page().goBack();
    await expectParam("settingsView", null);
    await expect(subtab("Automated Reports")).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("TC-1946: the note printed on the check is plain text that follows the party size, percent and name", async () => {
    await openGratuity();
    await expect(gratuityToggle()).not.toBeChecked();
    await gratuityToggle().click();
    const note = page().locator("#auto-gratuity-notice");
    await expect(note).toHaveText(
      "Parties of 6 or more: 18% gratuity is added."
    );
    await expect(page().locator("textarea#auto-gratuity-notice")).toHaveCount(
      0
    );
    await page().locator("#auto-gratuity-min-guests").fill("8");
    await expect(note).toHaveText(
      "Parties of 8 or more: 18% gratuity is added."
    );
    await page().getByRole("button", { name: "Other" }).click();
    await page().locator("#auto-gratuity-percent").fill("17.5");
    await expect(note).toHaveText(
      "Parties of 8 or more: 17.5% gratuity is added."
    );
    await page().locator("#auto-gratuity-label").fill("Service charge");
    await expect(note).toHaveText(
      "Parties of 8 or more: 17.5% service charge is added."
    );
  });

  test("TC-1947: unsaved edits ask on Back and on a sidebar click; Keep editing keeps them, Leave leaves", async () => {
    await openHome("?tab=Orders");
    await sidebar("Store Settings").click();
    await expectParam("tab", "Store Settings");
    await subtab("Fees & tips").click();
    await expectParam("settingsTab", "fees");
    await expect(gratuityToggle()).toBeVisible({ timeout: 25_000 });
    await gratuityToggle().click();
    const note = page().locator("#auto-gratuity-notice");
    await expect(note).toContainText("gratuity is added");

    // Back asks, and staying keeps the screen and the edit.
    await page().goBack();
    let ask = activeDialog(page());
    await expect(ask).toContainText("Leave without saving?");
    await ask.getByRole("button", { name: "Keep editing" }).click();
    await expect(page().getByRole("dialog")).toHaveCount(0);
    await expectParam("settingsTab", "fees");
    await expect(note).toContainText("gratuity is added");

    // A sidebar click asks too.
    await sidebar("Customers").click();
    ask = activeDialog(page());
    await expect(ask).toContainText("Leave without saving?");
    await ask.getByRole("button", { name: "Keep editing" }).click();
    await expectParam("tab", "Store Settings");
    await expect(note).toContainText("gratuity is added");

    // Leave goes where they asked, once, with no second question.
    await sidebar("Customers").click();
    await activeDialog(page()).getByRole("button", { name: "Leave" }).click();
    await expectParam("tab", "Customers");
    await expect(page().getByRole("dialog")).toHaveCount(0);
  });

  test("TC-1948: with nothing unsaved, moving around never asks", async () => {
    await openGratuity();
    for (const name of ["Orders", "Store Settings", "Customers", "Billing"]) {
      await sidebar(name).click();
      await expectParam("tab", name);
      await expect(page().getByRole("dialog")).toHaveCount(0);
    }
    await page().goBack();
    await expectParam("tab", "Customers");
    await expect(page().getByRole("dialog")).toHaveCount(0);
  });

  test("TC-1949: Post History's Create Post stays inside the portal", async () => {
    await openHome("?tab=social-history");
    const create = page().getByRole("button", { name: "Create Post" }).first();
    await expect(create).toBeVisible({ timeout: 25_000 });
    await create.click();
    await expectParam("tab", "social-create");
    expect(new URL(page().url()).pathname).toBe(home());
    await expect(page().getByText(/not found/i)).toHaveCount(0);
  });

  test("TC-1950: Staff — unsaved payroll settings ask; Back shows the previous subtab", async () => {
    // Reached by clicks: Back from a full page load leaves the app, where only
    // the browser's own prompt can ask.
    await openHome();
    await sidebar("Restaurant Staff").click();
    await subtab("Settings").click();
    await subtab("Pay & overtime").click();
    await expectParam("staffTab", "payrollSettings");
    const schedule = page().getByRole("combobox", { name: "Every two weeks" });
    await expect(schedule).toBeVisible({ timeout: 25_000 });
    await schedule.click();
    await page().getByRole("option", { name: "Every week" }).click();
    await expect(page().getByText("You have unsaved changes.")).toBeVisible();

    await page().goBack();
    const ask = activeDialog(page());
    await expect(ask).toContainText("Leave without saving?");
    await ask.getByRole("button", { name: "Keep editing" }).click();
    await expect(page().getByRole("dialog")).toHaveCount(0);
    await expectParam("staffTab", "payrollSettings");
    await expect(page().getByText("You have unsaved changes.")).toBeVisible();

    await subtab("People").click();
    await activeDialog(page()).getByRole("button", { name: "Leave" }).click();
    await expectParam("staffTab", "people");
    await expect(page().getByRole("dialog")).toHaveCount(0);
    // The form has gone, so its edits no longer stand in the way of Back.
    await expect(page().getByText("You have unsaved changes.")).toHaveCount(0);

    await page().goBack();
    await expectParam("staffTab", "payrollSettings");
    await expect(page().getByText("You have unsaved changes.")).toHaveCount(0);
    await expect(page().getByRole("dialog")).toHaveCount(0);
  });
});
