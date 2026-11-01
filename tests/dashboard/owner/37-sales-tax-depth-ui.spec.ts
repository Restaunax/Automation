/**
 * 37-sales-tax-depth-ui.spec.ts — Store Settings → Sales tax, Stage 7 tax
 * depth, the way an owner uses it (TC-1613..1617): checking the rate (W4:H2),
 * scheduling a rate change, a rate's business class (M3), exemption
 * certificates (M4) and the report's business-day / calendar-date choice
 * (M5).
 *
 * The rules themselves are TC-1600..1611 (api-tax-depth); this is the
 * browser. Labels follow the dashboard's EN locale (restaunax
 * public/locales/en/restaurant.json → salesTax): section titles "Check your
 * rate", "Scheduled rate changes", "Exemption certificates"; the report's
 * "Calendar dates" choice.
 *
 * Browser. A per-run throwaway restaurant (NY) with a default rate of 8%.
 * Gated by `RELEASED_ON_QA.taxDepthStage7`. Serial. Tag: @tax-depth.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import {
  probeTaxDepthStage7,
  requireRelease,
} from "../../../utils/releaseGate";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  taxRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  activeDialog,
  DESKTOP,
  expectSeenByUser,
} from "../../../utils/humanQa";

type Rec = Record<string, LooseJson>;
const TZ = "America/New_York";
const localDay = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(Date.now() + offsetDays * 86_400_000)
  );

test.describe.configure({ mode: "serial" });

test.describe("Sales tax depth (UI) @tax-depth", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenant"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;
  const buyer = `City Schools ${runId.slice(-5)}`;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const openSalesTax = async () => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Store+Settings&settingsTab=sales-tax`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(page().getByRole("button", { name: "Add rate" })).toBeVisible({
      timeout: 25_000,
    });
  };
  /** The card or section under a heading. */
  const section = (title: string) =>
    page().getByRole("heading", { name: title }).locator("xpath=../..");

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    adminToken = (
      await apiLogin(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)
    ).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[sales-tax-depth-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const rate = await taxRaw(ownerToken, restaurantId, "POST", "/rates", {
      name: "Sales tax",
      percent: 8,
      isDefault: true,
    });
    if (rate.status !== 201)
      throw new Error(
        `[sales-tax-depth-ui] rate: ${JSON.stringify(rate.data)}`
      );
    session = await loginViaUi(browser, tenant.email, tenant.password);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Sales tax depth");
    await allure.label("severity", "normal");
    requireRelease(
      "taxDepthStage7",
      await probeTaxDepthStage7(ownerToken, restaurantId)
    );
    await page().setViewportSize(DESKTOP);
  });

  test("TC-1613: Check your rate — the default rate next to the reference, and 'My rates are right' records the check", async () => {
    await openSalesTax();
    const card = section("Check your rate");
    await expect(card).toBeVisible();
    await expect(card).toContainText("8%");
    await card.getByRole("button", { name: "My rates are right" }).click();
    await expectSeenByUser(
      page().getByText("Thanks. Your rates are marked as checked."),
      '"Thanks. Your rates are marked as checked."'
    );
    const check = await taxRaw(ownerToken, restaurantId, "GET", "/rate-check");
    expect(
      ((check.data.data as Rec).defaultRate as Rec).confirmedAt
    ).toBeTruthy();
  });

  test("TC-1614: schedule a new rate for a date — listed under Scheduled rate changes, the rate itself unchanged; cancel removes it", async () => {
    await openSalesTax();
    const changes = section("Scheduled rate changes");
    await changes.getByRole("button", { name: "Schedule a change" }).click();
    const dialog = activeDialog(page());
    await dialog.getByRole("spinbutton", { name: "New rate (%)" }).fill("8.5");
    await dialog.getByLabel("Starts on").fill(localDay(45));
    await dialog.getByRole("button", { name: "Schedule" }).click();
    await expect(dialog).toBeHidden();
    await expect(changes).toContainText("8.5%");
    // Still 8% today: the rates table's row (the scheduled change is a
    // "Sales tax 8% → 8.5% …" row of its own) still says Default 8%.
    await expect(
      page().getByRole("row", { name: /^Sales tax\b.*Default/ })
    ).toContainText("8%");
    await changes.getByRole("button", { name: "Cancel change" }).click();
    await expect(changes).not.toContainText("8.5%");
  });

  test("TC-1615: a rate's business class — 'Packaged beer' filed as 017 shows its class in the rates list", async () => {
    await openSalesTax();
    await page().getByRole("button", { name: "Add rate" }).click();
    const dialog = activeDialog(page());
    await dialog.getByRole("textbox", { name: "Name" }).fill("Packaged beer");
    await dialog.getByRole("spinbutton", { name: "Rate (%)" }).fill("8");
    await dialog.getByRole("textbox", { name: "Business class" }).fill("017");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page().getByRole("row", { name: /^Packaged beer\b/ })
    ).toContainText("017");
  });

  test("TC-1616: exemption certificates — add a buyer's certificate; an expired one is flagged", async () => {
    await openSalesTax();
    const certs = section("Exemption certificates");
    await certs.getByRole("button", { name: "Add certificate" }).click();
    const dialog = activeDialog(page());
    await dialog.getByRole("textbox", { name: "Buyer" }).fill(buyer);
    // The Reason select's FormLabel points at the select's div, which a
    // label can't name: the combobox is named by its value. Open it by id.
    await dialog.locator("#tax-cert-reason").click();
    await page().getByRole("option", { name: "Government" }).click();
    await dialog
      .getByRole("textbox", { name: "Certificate number" })
      .fill(`GOV-${runId.slice(-6)}`);
    await dialog.getByLabel("Expiry date").fill(localDay(-5));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    const row = certs.getByRole("row", { name: new RegExp(buyer) });
    await expect(row).toContainText("Government");
    await expect(row).toContainText(/expired/i);
  });

  test("TC-1617: the report covers business days or calendar dates, and says which", async () => {
    await openSalesTax();
    const dates = page().getByRole("group", { name: "Dates" });
    await dates.getByRole("button", { name: "Calendar dates" }).click();
    await expect(
      page().getByText("Dates are calendar days, midnight to midnight.")
    ).toBeVisible();
    await dates.getByRole("button", { name: "Business days" }).click();
    await expect(page().getByText(/Dates are business days/)).toBeVisible();
  });
});
