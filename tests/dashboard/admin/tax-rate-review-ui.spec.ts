/**
 * tax-rate-review-ui.spec.ts — HQ "Sales tax rate review" (RestauNax
 * back-office audit W4:H2) (TC-1618).
 *
 * Every restaurant's default sales tax rate next to our reference file,
 * worst first, read-only, with a CSV download. The API is TC-1611
 * (api-tax-depth). HQ is the admin login (adminPage). The page lives under
 * HQ → Finance (`/admin?tab=finance&section=tax-rate-review`).
 *
 * A per-run throwaway restaurant (NY) charging 8%, so there is a known row.
 * Gated by `RELEASED_ON_QA.taxDepthStage7`. Tag: @tax-depth.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { requireEnv } from "../../../utils/envGate";
import {
  probeTaxDepthStage7,
  requireRelease,
} from "../../../utils/releaseGate";
import { generateRunId } from "../../../utils/testData";
import {
  apiLogin,
  apiRequestRaw,
  createSecondOwner,
  deleteTestRestaurant,
  taxRaw,
} from "../../../utils/apiHelper";

const REVIEW_PATH = "/admin?tab=finance&section=tax-rate-review";

test.describe.configure({ mode: "serial" });

test.describe("HQ — sales tax rate review (UI) @tax-depth", () => {
  requireEnv(
    ["ADMIN_EMAIL", "ADMIN_PASSWORD"],
    "HQ is the admin login and the file mints its own tenant"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let storeName = "";

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    adminToken = (
      await apiLogin(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!)
    ).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId) throw new Error("[tax-rate-review-ui] no tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const rate = await taxRaw(ownerToken, restaurantId, "POST", "/rates", {
      name: "Sales tax",
      percent: 8,
      isDefault: true,
    });
    if (rate.status !== 201)
      throw new Error(
        `[tax-rate-review-ui] rate: ${JSON.stringify(rate.data)}`
      );
    const review = await apiRequestRaw<{
      data?: { rows?: { restaurantId: string; name: string }[] };
    }>("GET", "/api/admin/tax-rate-review", undefined, adminToken);
    storeName =
      review.data?.data?.rows?.find((x) => x.restaurantId === restaurantId)
        ?.name ?? "";
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "HQ — sales tax rate review");
    await allure.label("severity", "normal");
    requireRelease(
      "taxDepthStage7",
      await probeTaxDepthStage7(ownerToken, restaurantId)
    );
  });

  test("TC-1618: HQ sees every restaurant's rate vs the reference, with a result per row and a CSV download", async ({
    adminPage: page,
  }) => {
    expect(storeName, "the tenant appears in the review API").not.toBe("");
    await page.goto(REVIEW_PATH, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "Sales tax rate review" })
    ).toBeVisible({ timeout: 25_000 });
    const row = page.getByRole("row", { name: new RegExp(storeName) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText("8%");
    await expect(row).toContainText(/Matches|Different|No reference/);
    // Read-only: no way to change a rate from here.
    await expect(row.getByRole("button", { name: /edit|change/i })).toHaveCount(
      0
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download CSV/ }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^tax-rate-review-\d{4}-\d{2}-\d{2}\.csv$/
    );
  });
});
