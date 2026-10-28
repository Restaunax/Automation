/**
 * 30-service-charges-ui.spec.ts — Store Settings → Fees at checkout, the way
 * an owner uses it (RestauNax #1078, SERVICE_CHARGES_TO_STAFF.md)
 * (TC-961..964). The server's guards are pinned in
 * api-service-charges-to-staff.spec.ts (TC-958..960).
 *
 *   TC-961  Without Tip Management "Paid to staff" is truly absent (no
 *           radio, not just disabled); the card says the restaurant keeps it
 *           and how to change that. Phone width: still readable, no overflow.
 *   TC-962  With Tip Management: pick "Paid to staff" → "Who gets it" opens
 *           on "Share it like tips"; pick "The server on the check"; Save
 *           sends ONE request even on a double click; the owner sees "Service
 *           fee saved" on screen; after a reload both choices are still
 *           picked and the server agrees.
 *   TC-963  Auto-gratuity %: the choices are the checkout's suggested tip
 *           percentages + Other; Other 30 shows a readable inline error and
 *           can't be saved; Other 25 asks first ("$200.00 … $50.00"),
 *           Cancel saves nothing, "Use 25%" saves and it survives a reload.
 *   TC-964  Phone width (390px) with the add-on: the choices, Save and
 *           Discard are reachable, nothing overflows; Discard puts the choice
 *           back and sends nothing.
 *
 * Every message is checked the way a person sees it (utils/humanQa.ts): on
 * screen, on top of everything, in words — not just present in the DOM.
 *
 * Browser. A per-run throwaway owner (createSecondOwner alwaysFresh) signed
 * in through the UI; the restaurant is deleted afterwards.
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
  getRestaurantSettingsRaw,
  setFeatureOverrideAdminRaw,
  updateRestaurantSettingsRaw,
  type LooseJson,
} from "../../../utils/apiHelper";
import {
  activeDialog,
  DESKTOP,
  expectHumanText,
  expectNoHorizontalOverflow,
  expectSeenByUser,
  PHONE,
} from "../../../utils/humanQa";
import {
  AUTO_GRATUITY_HOUSE as AUTO_GRATUITY,
  SERVICE_FEE_HOUSE as SERVICE_FEE,
} from "../../../utils/backOfficeApi";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

type Rec = Record<string, LooseJson>;

test.describe.configure({ mode: "serial" });

test.describe("Owner — Fees at checkout: service charges paid to staff (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession | undefined;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };
  const openFees = async () => {
    await page().goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=Store%20Settings&settingsTab=fees`,
      { waitUntil: "domcontentloaded" }
    );
    await expect(
      page().getByRole("heading", { name: "Fees at checkout" })
    ).toBeVisible({ timeout: 25_000 });
  };
  const settings = async (): Promise<Rec> => {
    const r = await getRestaurantSettingsRaw(ownerToken, restaurantId);
    const body = r.data as Rec;
    return ((body.data as Rec | undefined) ?? body) as Rec;
  };
  /** The service fee's "Who keeps it" block. */
  const feeKeeper = () =>
    page().getByRole("radiogroup", { name: "Who keeps it" }).first();

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(150_000);
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[fees-ui] could not mint the throwaway tenant");
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    // Both charges on and kept by the house: the owner's starting point.
    const base = await updateRestaurantSettingsRaw(ownerToken, restaurantId, {
      tableServiceEnabled: true,
      serviceFee: SERVICE_FEE,
      autoGratuity: AUTO_GRATUITY,
    });
    if (base.status !== 200)
      throw new Error(`[fees-ui] base: ${JSON.stringify(base.data)}`);
    session = await loginViaUi(browser, tenant.email, tenant.password);
  });

  test.afterAll(async () => {
    if (adminToken && restaurantId)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Service charges paid to staff (dashboard)");
    await allure.label("severity", "critical");
    await page().setViewportSize(DESKTOP);
  });

  test("TC-961: without Tip Management, 'Paid to staff' is absent and the card says who keeps it", async () => {
    await openFees();
    await expect(page().getByText("Fees at checkout")).toBeVisible();
    // Truly absent — not a disabled radio.
    await expect(
      page().getByRole("radio", { name: "Paid to staff (as wages)" })
    ).toHaveCount(0);
    const keeps = page().getByText("The restaurant keeps it.").first();
    await expectSeenByUser(keeps, "'The restaurant keeps it.'");
    await expectSeenByUser(
      page()
        .getByText("To pay it to your staff instead, add Tip Management.")
        .first(),
      "how to pay it to staff"
    );
    await expectHumanText(page().locator("main"), "Fees at checkout");

    await page().setViewportSize(PHONE);
    await expectSeenByUser(keeps, "'The restaurant keeps it.' at phone width");
    await expectNoHorizontalOverflow(page(), "Fees at checkout (phone)");
  });

  test("TC-962: with Tip Management, 'The server on the check' is picked, saved once, seen and kept after a reload", async () => {
    const granted = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TIP_MANAGEMENT",
      true
    );
    expect(granted.ok, JSON.stringify(granted.data)).toBe(true);
    await openFees();

    const staff = feeKeeper().getByRole("radio", {
      name: "Paid to staff (as wages)",
    });
    await expect(staff).toBeVisible();
    await expect(
      feeKeeper().getByRole("radio", { name: "The restaurant keeps it" })
    ).toBeChecked();
    await staff.check();

    const who = page().getByRole("radiogroup", { name: "Who gets it" }).first();
    await expect(who).toBeVisible();
    await expect(
      who.getByRole("radio", { name: /Share it like tips/ })
    ).toBeChecked();
    await who.getByRole("radio", { name: /The server on the check/ }).check();
    await expect(page().getByText("never as tips").first()).toBeVisible();

    const puts: string[] = [];
    page().on("request", (r) => {
      if (
        r.method() === "PUT" &&
        r.url().includes(`/api/restaurantId/${restaurantId}/settings`)
      )
        puts.push(r.url());
    });
    const save = page().getByRole("button", { name: "Save service fee" });
    const saved = page().waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes(`/api/restaurantId/${restaurantId}/settings`)
    );
    await save.dblclick();
    expect((await saved).status()).toBe(200);
    await expectSeenByUser(
      page().getByText("Service fee saved").first(),
      "'Service fee saved'"
    );
    expect(puts, "a double click sends one save").toHaveLength(1);

    expect((await settings()).serviceFee).toMatchObject({
      distribution: "STAFF",
      allocation: "CHECK_SERVER",
    });
    await page().reload({ waitUntil: "domcontentloaded" });
    await expect(
      page().getByRole("heading", { name: "Fees at checkout" })
    ).toBeVisible({ timeout: 25_000 });
    await expect(
      feeKeeper().getByRole("radio", { name: "Paid to staff (as wages)" })
    ).toBeChecked();
    await expect(
      page()
        .getByRole("radiogroup", { name: "Who gets it" })
        .first()
        .getByRole("radio", { name: /The server on the check/ })
    ).toBeChecked();
  });

  test("TC-963: auto-gratuity % — presets + Other; 30% is refused inline; 25% asks first, Cancel saves nothing, Use 25% saves", async () => {
    await openFees();
    const s = await settings();
    const presets =
      (((s.customerCheckoutFlow as Rec | undefined)?.tip as Rec | undefined)
        ?.presets as number[] | undefined) ?? [];
    // The toggle group (its fieldset carries the same name).
    const picker = page().locator(
      '[role="group"][aria-labelledby="auto-gratuity-percent-label"]'
    );
    await expect(picker).toBeVisible();
    for (const p of presets.filter((x) => x <= 25))
      await expect(
        picker.getByRole("button", { name: new RegExp(`^${p}%?$`) })
      ).toBeVisible();
    await picker.getByRole("button", { name: "Other" }).click();

    const other = page().locator("#auto-gratuity-percent");
    await other.fill("30");
    const saveGratuity = page().getByRole("button", {
      name: "Save auto-gratuity",
    });
    await expectSeenByUser(
      page().getByText("Enter a percent from 1 to 25.").first(),
      "the 25% limit message"
    );
    await expect(saveGratuity).toBeDisabled();

    await other.fill("25");
    await saveGratuity.click();
    const confirm = activeDialog(page());
    await expect(confirm).toContainText("Add 25% to large parties?");
    await expect(confirm).toContainText("$200.00");
    await expect(confirm).toContainText("$50.00");
    await expectHumanText(confirm, "the 25% confirmation");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(page().getByRole("dialog")).toHaveCount(0);
    expect(((await settings()).autoGratuity as Rec).percent).toBe(18);

    await saveGratuity.click();
    const saved = page().waitForResponse(
      (r) =>
        r.request().method() === "PUT" &&
        r.url().includes(`/api/restaurantId/${restaurantId}/settings`)
    );
    await activeDialog(page()).getByRole("button", { name: "Use 25%" }).click();
    expect((await saved).status()).toBe(200);
    await expectSeenByUser(
      page().getByText("Auto-gratuity saved").first(),
      "'Auto-gratuity saved'"
    );
    expect(((await settings()).autoGratuity as Rec).percent).toBe(25);
    await page().reload({ waitUntil: "domcontentloaded" });
    await expect(page().locator("#auto-gratuity-percent")).toHaveValue("25", {
      timeout: 25_000,
    });
  });

  test("TC-964: phone width — the choices and Save are reachable, nothing overflows", async () => {
    await page().setViewportSize(PHONE);
    await openFees();
    const staff = feeKeeper().getByRole("radio", {
      name: "Paid to staff (as wages)",
    });
    await expectSeenByUser(staff, "'Paid to staff' at phone width");
    await expect(staff).toBeChecked();
    // Save and Discard appear once something changed.
    const house = feeKeeper().getByRole("radio", {
      name: "The restaurant keeps it",
    });
    await house.check();
    await expectSeenByUser(
      page().getByRole("button", { name: "Save service fee" }),
      "Save service fee at phone width"
    );
    await expectNoHorizontalOverflow(page(), "Fees at checkout (phone)");

    // Discard puts it back and sends nothing.
    let sent = 0;
    page().on("request", (r) => {
      if (
        r.method() === "PUT" &&
        r.url().includes(`/api/restaurantId/${restaurantId}/settings`)
      )
        sent += 1;
    });
    const discard = page()
      .getByRole("button", { name: "Discard changes" })
      .first();
    await expectSeenByUser(discard, "Discard at phone width");
    await discard.click();
    await expect(staff).toBeChecked();
    await expect(
      page().getByRole("button", { name: "Save service fee" })
    ).toHaveCount(0);
    expect(sent, "Discard sends nothing").toBe(0);
    expect((await settings()).serviceFee).toMatchObject({
      distribution: "STAFF",
    });
  });
});
