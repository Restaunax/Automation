/**
 * 24-books-gating-ui.spec.ts — Books & taxes follows its add-on in the
 * dashboard: hidden (never shown locked) without it, every section loads
 * with it; Connected apps (the free partner API) is there either way
 * (TC-789..791).
 *
 * Browser. A per-run throwaway owner logs in through the UI (loginViaUi);
 * the "Books & Taxes" add-on (ACCOUNTING_SYNC) is switched by admin override
 * between steps. Every /api/ response is watched: a screen the owner can see
 * must never answer 401/403 while it loads (feedback: screen loads never 403).
 * Serial.
 */
import * as allure from "allure-js-commons";
import type { Page, Response as PwResponse } from "@playwright/test";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const BOOKS = "Books & taxes";
const SECTIONS = [
  "Overview",
  "Books",
  "Card deposits",
  "Tax calendar",
  "Year end",
  "Your accountant",
];

test.describe.configure({ mode: "serial" });

test.describe("Owner — Books & taxes is hidden without its add-on; Connected apps is free (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;
  const refused: string[] = [];

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const watch = (res: PwResponse) => {
    if (
      /\/api\/|\/restaurant\//.test(res.url()) &&
      [401, 403].includes(res.status())
    )
      refused.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  };
  /** The left sidebar's items are buttons (its landmark is the first nav). */
  const sideItem = (name: string) =>
    page()
      .getByRole("navigation")
      .first()
      .getByRole("button", { name, exact: true });
  const manage = (query: string) =>
    page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?${query}`,
      { waitUntil: "domcontentloaded" }
    );

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId) throw new Error("[books-ui] no tenant");
    restaurantId = tenant.restaurantId;
    session = await loginViaUi(
      browser,
      tenant.email,
      process.env.OWNER2_PASSWORD || `Automation!Owner2-${runId}`
    );
    session.page.on("response", watch);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    refused.length = 0;
    await allure.label("feature", "Books & taxes (dashboard)");
    await allure.label("severity", "critical");
  });

  test("TC-789: without the add-on there is no Books & taxes item at all (not a locked one); Connected apps loads", async () => {
    await manage("tab=Store%20Settings&settingsTab=connected-apps");
    await expect(
      page().getByRole("tab", { name: "Connected apps" })
    ).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      page().getByRole("button", { name: "Create API key" }).first()
    ).toBeVisible({ timeout: 20_000 });
    // The sidebar is there; Books & taxes is simply not in it.
    await expect(sideItem("Store Settings")).toBeVisible();
    await expect(sideItem(BOOKS)).toHaveCount(0);
    expect(refused).toEqual([]);
  });

  test("TC-790: with the add-on, Books & taxes appears and every section opens without a refused load", async () => {
    const g = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "ACCOUNTING_SYNC",
      true,
      `automation books ui ${runId}`
    );
    expect(g.ok, JSON.stringify(g.data)).toBe(true);
    await manage("tab=Store%20Settings");
    const item = sideItem(BOOKS);
    await expect(item).toBeVisible({ timeout: 20_000 });
    await item.click();
    await expect(page()).toHaveURL(/tab=books-taxes/);
    for (const name of SECTIONS) {
      const tab = page().getByRole("tab", { name, exact: true });
      await expect(tab).toBeVisible({ timeout: 20_000 });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
    }
    // The accountant section offers the invite; the year end offers the ZIP.
    await page()
      .getByRole("tab", { name: "Your accountant", exact: true })
      .click();
    await expect(
      page()
        .getByRole("button", { name: /invite/i })
        .first()
    ).toBeVisible();
    expect(refused).toEqual([]);
  });

  test("TC-791: removing the add-on hides it again, and a deep link doesn't open it", async () => {
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "ACCOUNTING_SYNC"
    );
    await manage("tab=books-taxes&section=calendar");
    await expect(
      page().getByRole("heading", { name: "Not available for this restaurant" })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page().getByRole("tab", { name: "Tax calendar" })).toHaveCount(
      0
    );
    await expect(sideItem("Store Settings")).toBeVisible();
    await expect(sideItem(BOOKS)).toHaveCount(0);
  });
});
