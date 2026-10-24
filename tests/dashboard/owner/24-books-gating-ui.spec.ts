/**
 * 24-books-gating-ui.spec.ts — Books & taxes follows its add-on in the
 * dashboard: hidden (never shown locked) without it, every section loads
 * with it; Connected apps (the free partner API) is there either way
 * (TC-789..791). A deep link without it says where to get it — since
 * restaunax #998, where to REQUEST it — and the seed owner sends and cancels
 * that request from Billing → Add-ons (TC-897; skipped until #998 is on QA,
 * utils/addonRequestGate.ts).
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
import { generateRunId, readSharedState } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  getRestaurantFeaturesRaw,
  adminAddonsRaw,
  ownerAddonRequestCancelRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  addonRequestsLive,
  requireAddonRequests,
} from "../../../utils/addonRequestGate";

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
  let live = false;
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
    live = await addonRequestsLive(adminToken);
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

  test("TC-791: removing the add-on hides it again, and a deep link doesn't open it — it says where to get it", async () => {
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "ACCOUNTING_SYNC"
    );
    await manage("tab=books-taxes&section=calendar");
    await expect(
      page().getByRole("heading", {
        name: "Not part of this restaurant's plan",
      })
    ).toBeVisible({ timeout: 20_000 });
    // Since restaunax #998 owners request add-ons; before it they added them.
    await expect(
      page().getByText(
        live
          ? "This is an add-on this restaurant doesn't have yet. You can request it in Billing → Add-ons and we'll set it up."
          : "This is an add-on this restaurant doesn't have yet. You can add it from Billing → Add-ons."
      )
    ).toBeVisible();
    await expect(
      page().getByRole("button", { name: "Go to Add-ons" })
    ).toBeVisible();
    await expect(page().getByRole("tab", { name: "Tax calendar" })).toHaveCount(
      0
    );
    await expect(sideItem("Store Settings")).toBeVisible();
    await expect(sideItem(BOOKS)).toHaveCount(0);
  });
});

// TC-897 runs on the SEED restaurant: Billing → Add-ons needs a subscription
// ("No Subscription Assigned" otherwise), and the seed is the one QA
// restaurant with one. A request turns nothing on and is cancelled here.
test.describe("Owner — requests an add-on from Billing → Add-ons (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (gate + cleanup use HQ)"
  );
  test.skip(
    !process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set (the seed restaurant)"
  );

  let adminToken = "";
  let seedToken = "";
  let seedId = "";
  let live = false;

  /** Cancel any open Books & Taxes request on the seed (a crashed run's). */
  const cancelOpen = async () => {
    if (!live || !seedId) return;
    const r = await adminAddonsRaw(adminToken, "GET", "/requests?status=OPEN");
    for (const x of (Array.isArray(r.data.data) ? r.data.data : []) as Array<
      Record<string, LooseJson>
    >) {
      const restaurant = x.restaurant as Record<string, LooseJson> | null;
      const addon = x.addon as Record<string, LooseJson> | null;
      if (restaurant?.id === seedId && addon?.feature === "ACCOUNTING_SYNC")
        await ownerAddonRequestCancelRaw(seedToken, seedId, String(x.id));
    }
  };

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    if (!process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    seedToken = (
      await apiLogin(process.env.OWNER_EMAIL, process.env.OWNER_PASSWORD)
    ).accessToken;
    seedId = readSharedState().restaurantId;
    live = await addonRequestsLive(adminToken);
    await cancelOpen();
  });

  test.afterAll(async () => {
    await cancelOpen().catch(() => {});
  });

  test("TC-897: from the locked tab the owner requests Books & Taxes on Billing → Add-ons, sees it pending, and cancels it", async ({
    ownerPage,
  }) => {
    await allure.label("feature", "Add-on billing");
    await allure.label("severity", "critical");
    requireAddonRequests(live);
    const features =
      (await getRestaurantFeaturesRaw(seedToken, seedId)).data.data?.features ??
      [];
    test.skip(
      features.includes("ACCOUNTING_SYNC"),
      "the seed restaurant has Books & Taxes on — no locked tab to start from"
    );
    await ownerPage.goto(
      `/restaurant/restaurantId/${seedId}/restaurantManagement?tab=books-taxes`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(
      ownerPage.getByText("You can request it in Billing → Add-ons", {
        exact: false,
      })
    ).toBeVisible({ timeout: 20_000 });
    await ownerPage.getByRole("button", { name: "Go to Add-ons" }).click();
    await expect(ownerPage).toHaveURL(/tab=Billing/);

    const card = ownerPage.locator(".MuiCard-root").filter({
      has: ownerPage.getByRole("heading", {
        name: "Books & Taxes",
        exact: true,
      }),
    });
    await expect(card).toHaveCount(1, { timeout: 20_000 });
    // No owner-side "Add" any more: the only action is a request.
    await expect(card.getByRole("button", { name: /^Add$/ })).toHaveCount(0);
    await card.getByRole("button", { name: "Request this add-on" }).click();

    const dialog = ownerPage.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "Request Books & Taxes?" })
    ).toBeVisible();
    await dialog
      .getByLabel("Anything we should know? (optional)")
      .fill(`automation ${generateRunId()}`);
    await dialog.getByRole("button", { name: "Send request" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      ownerPage.getByText(
        "Request sent. We'll contact you to set it up, usually within one business day."
      )
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      card.getByText(/^Request sent .+\. We'll contact you\.$/)
    ).toBeVisible();
    // A request turns nothing on.
    expect(
      (await getRestaurantFeaturesRaw(seedToken, seedId)).data.data?.features
    ).not.toContain("ACCOUNTING_SYNC");

    await card.getByRole("button", { name: "Cancel request" }).click();
    await expect(ownerPage.getByText("Request cancelled.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(
      card.getByRole("button", { name: "Request this add-on" })
    ).toBeVisible();
  });
});
