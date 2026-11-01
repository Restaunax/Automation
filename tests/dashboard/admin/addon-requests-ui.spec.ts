/**
 * addon-requests-ui.spec.ts — HQ handles an owner's add-on requests on the
 * Add-ons screen, in the browser (docs/COVERAGE_MAP.md G21) (TC-1094..1097).
 *
 * The rules are api-addon-billing.spec.ts (TC-781..787, TC-894..896),
 * including the real attach and scheduled removal on the seed restaurant,
 * the only QA restaurant with a subscription. A throwaway restaurant can't
 * get one (activation needs its Stripe account to accept the platform's
 * terms, a person's click on Stripe's own page), so this file uses a
 * throwaway owner for what HQ's screen itself does: show the request, refuse
 * an attach that can't happen in words, close it with Mark done, and drop a
 * request the owner withdrew. It never touches the seed, so it can't collide
 * with the API file's attach.
 *
 * The owner side asks through the API, the way RestauNax Products' "Ask us"
 * does. HQ is the admin login (adminPage).
 *
 *   TC-1094 The owner asks for Menu TVs: HQ sees the request under Open —
 *           the restaurant, "Turn on", Menu TVs, who asked and when.
 *   TC-1095 Attach asks first, then says in words that the restaurant has
 *           no subscription; the request stays open.
 *   TC-1096 Mark done: "Marked done. The owners have been emailed."; it
 *           leaves Open, Closed shows it Done and who handled it, and Menu
 *           TVs is not on (Mark done never attaches).
 *   TC-1097 A request the owner withdraws leaves HQ's Open list; Closed says
 *           "Cancelled by the owner".
 */
import type { Locator, Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  ownerAddonsRaw,
  ownerAddonRequestRaw,
  ownerAddonRequestCancelRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import { activeDialog, expectSeenByUser } from "../../../utils/humanQa";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;

test.describe.configure({ mode: "serial" });

test.describe("HQ — add-on requests (UI)", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "the file mints its own tenant"
  );

  const runId = generateRunId();
  const storeName = `Automation Owner2 Store ${runId}`;
  let adminToken = "";
  let ownerToken = "";
  let ownerEmail = "";
  let restaurantId = "";

  const addonRows = async () => {
    const r = await ownerAddonsRaw(ownerToken, restaurantId, "GET");
    expect(r.status, JSON.stringify(r.data)).toBe(200);
    return ((r.data as Rec).data as Rec).addons as Rec[];
  };
  const ask = async (feature: string) => {
    const row = (await addonRows()).find((a) => a.feature === feature);
    expect(row, `${feature} is offered`).toBeTruthy();
    const r = await ownerAddonRequestRaw(ownerToken, restaurantId, {
      addonId: String(row!.id),
      kind: "ADD",
    });
    expect(r.status, JSON.stringify(r.data)).toBe(201);
    return String(((r.data as Rec).data as Rec).id);
  };
  const openAddons = async (page: Page) => {
    await page.goto("/admin?tab=addons", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Add-on requests" })
    ).toBeVisible({ timeout: 25_000 });
  };
  /** This restaurant's request card for an add-on (QA has others open). */
  const card = (page: Page, addon: string): Locator =>
    page
      .locator(".MuiCard-root")
      .filter({ has: page.getByRole("heading", { name: storeName }) })
      .filter({ hasText: `${addon} · ` });
  const show = async (page: Page, which: "Open" | "Closed") => {
    await page
      .getByRole("group", { name: "Which requests" })
      .getByRole("button", { name: which })
      .click();
  };

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[addon-requests-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    ownerEmail = tenant.email;
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "HQ — add-on requests");
    await allure.label("severity", "critical");
  });

  test("TC-1094: the owner asks for Menu TVs and HQ sees who, what and when under Open", async ({
    adminPage: page,
  }) => {
    await ask("MENU_TVS");
    await openAddons(page);
    const req = card(page, "Menu TVs");
    await expect(req).toBeVisible({ timeout: 20_000 });
    await expect(req).toContainText("Turn on");
    await expect(req).toContainText(
      new RegExp(`Asked by .+ \\(${ownerEmail.replace(/[.+]/g, "\\$&")}\\) · `)
    );
    await expect(req.getByRole("button", { name: "Attach" })).toBeVisible();
    await expect(req.getByRole("button", { name: "Mark done" })).toBeVisible();
  });

  test("TC-1095: Attach asks first, then says there's no subscription; the request stays open", async ({
    adminPage: page,
  }) => {
    await openAddons(page);
    await card(page, "Menu TVs")
      .getByRole("button", { name: "Attach" })
      .click();
    const dialog = activeDialog(page);
    await expect(dialog).toHaveAccessibleName(
      `Attach Menu TVs for ${storeName}?`
    );
    await expect(dialog).toContainText(
      "It goes on their subscription now, prorated for the rest of this billing period"
    );
    await dialog.getByRole("button", { name: "Attach" }).click();
    await expectSeenByUser(
      page
        .getByRole("alert")
        .filter({
          hasText: "This restaurant has no subscription to add it to.",
        })
        .first(),
      "the no-subscription refusal"
    );
    await expect(
      card(page, "Menu TVs").getByRole("button", { name: "Attach" })
    ).toBeVisible();
    const tv = (await addonRows()).find((a) => a.feature === "MENU_TVS");
    expect(tv).toMatchObject({ activeInstanceId: null });
  });

  test("TC-1096: Mark done closes it, says the owners were emailed, and attaches nothing", async ({
    adminPage: page,
  }) => {
    await openAddons(page);
    await card(page, "Menu TVs")
      .getByRole("button", { name: "Mark done" })
      .click();
    await expectSeenByUser(
      page
        .getByRole("alert")
        .filter({ hasText: "Marked done. The owners have been emailed." })
        .first(),
      '"Marked done."'
    );
    await expect(card(page, "Menu TVs")).toHaveCount(0);
    await show(page, "Closed");
    const closed = card(page, "Menu TVs");
    await expect(closed).toContainText("Done");
    await expect(closed).toContainText(/Handled by .+ · /);
    const tv = (await addonRows()).find((a) => a.feature === "MENU_TVS");
    expect(tv).toMatchObject({ activeInstanceId: null, pendingAdd: null });
  });

  test("TC-1097: a request the owner withdraws leaves HQ's Open list", async ({
    adminPage: page,
  }) => {
    const id = await ask("PAYROLL");
    await openAddons(page);
    await expect(card(page, "Payroll")).toBeVisible({ timeout: 20_000 });
    const cancelled = await ownerAddonRequestCancelRaw(
      ownerToken,
      restaurantId,
      id
    );
    expect(cancelled.ok, JSON.stringify(cancelled.data)).toBe(true);
    await openAddons(page);
    await expect(card(page, "Payroll")).toHaveCount(0);
    await show(page, "Closed");
    await expect(card(page, "Payroll")).toContainText("Cancelled by the owner");
  });
});
