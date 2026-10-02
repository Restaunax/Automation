/**
 * 18-tables-floor.spec.ts — Owner → Store Operations → "Tables & Floor"
 * (TC-434..439). Real-browser Playwright clicks against QA's owner portal;
 * API wrappers (task-1's apiHelper.ts additions) do SETUP and ASSERTIONS —
 * the browser only does the clicking, per the brief.
 *
 * Own tenant: a per-file throwaway restaurant minted via `createSecondOwner`
 * (admin-created OWNER). The portal gates BOTH "Tables & Floor" (an OR —
 * TABLE_RESERVATIONS entitlement OR RestaurantSettings.tableServiceEnabled)
 * and "Reservations" (entitlement-only) client-side at PortalShell mount, so
 * the entitlement is granted BEFORE first navigation. STORE_OPERATIONS
 * itself (the flyout section both tabs live inside) needs no override — it's
 * in the platform's STARTER_FEATURES floor for every RESTAURANT-type
 * business, confirmed against restaunax-backend's restaurantFeatures.ts.
 *
 * Login: the shared `ownerPage` fixture logs in as the SHARED seed owner, so
 * this file instead does a manual UI login as the throwaway owner via
 * `loginViaUi` (utils/auth.ts) in its OWN browser context, opened once in
 * beforeAll and reused (serially — fullyParallel:false) across every test,
 * mirroring how 04-floor-tables.spec.ts (POS/API level) shares state across
 * its tests.
 *
 * Konva canvas (TC-436): outcomes are asserted via the owner API
 * (`listTablesOwnerRaw`), never pixels/screenshots. `placeTableFromTray`
 * (OwnerTablesFloorPage.ts) attempts a REAL mouse-driven HTML5 drag from the
 * Unplaced tray onto the canvas first (the tray chip is native `draggable`,
 * and Chromium's own drag-threshold detection fires off plain mouse events),
 * falling back to a plain click on the chip — also a first-class,
 * code-supported placement path (UnplacedTray.tsx: "Click a table to place
 * it... or drag it"), landing at the deterministic cascade position — if the
 * drag doesn't visibly register within a few seconds.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import {
  createOwnerTablesFloorPage,
  type OwnerTablesFloorPage,
} from "../../../pages/dashboard/owner/OwnerTablesFloorPage";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  listTablesOwnerRaw,
  createTableOwnerRaw,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

/** Every owner success body wraps its payload in {success, data, message}. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

test.describe("Owner — Tables & Floor", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  /** Throwaway tenant owner's API token (createSecondOwner) — setup/assertions only. */
  let ownerToken = "";
  let restaurantId = "";
  let session: UiLoginSession;
  let floorPage: OwnerTablesFloorPage;

  const sectionName = `Main ${runId}`;
  const table1 = `T1 ${runId}`;
  const table2 = `T2 ${runId}`;
  /** Set once TC-436 places + saves T1's geometry — TC-437 re-selects it
   * after a fresh page load using this. */
  let t1Geometry = { x: 0, y: 0, width: 0, height: 0 };

  test.beforeAll(async ({ browser }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[tables-floor] could not mint the throwaway tenant restaurant"
      );
    restaurantId = tenant.restaurantId;
    ownerToken = tenant.accessToken;
    const ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    const ownerPassword =
      process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

    // Grant BEFORE first navigation — both tabs gate client-side at mount.
    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    if (!grant.ok)
      throw new Error(
        `[tables-floor] could not grant TABLE_RESERVATIONS: ${msg(grant.data)}`
      );

    session = await loginViaUi(browser, ownerEmail, ownerPassword);
    floorPage = createOwnerTablesFloorPage(session.page);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    // Best-effort — the whole throwaway restaurant is about to be deleted
    // (or already provisioned externally via OWNER2_EMAIL), so a transient
    // revoke failure here would only mask the results above.
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
    // Best-effort — the whole throwaway restaurant is archived regardless,
    // so a transient delete failure here would only mask the results above.
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
    // Closed last, after the API cleanup above, and guarded — a throw
    // closing the browser context must never skip that cleanup.
    if (session) await session.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Tables & Floor");
    await allure.label("severity", "critical");
  });

  test("TC-434: nav + gating — Tables & Floor and Reservations both reachable via the Store Operations flyout; an unentitled tenant sees neither", async ({
    browser,
  }) => {
    await allure.description(
      "The entitled throwaway owner reaches both tabs via the sidebar's Store " +
        "Operations flyout (hover + click, same pattern as the Deals/Coupons " +
        "flyouts). A SECOND, unentitled throwaway tenant never sees either nav " +
        "item at all — STORE_OPERATIONS itself (the flyout section) is " +
        "starter-floor and still renders, just without the two gated rows."
    );
    await floorPage.navigateViaSidebar(restaurantId);
    await expect(session.page).toHaveURL(/tab=tables/);
    await floorPage.assertLoaded();

    await floorPage.openStoreOpsFlyout();
    await floorPage.reservationsNavItem().click();
    await session.page.waitForURL(/tab=reservations/, { timeout: 10_000 });
    await expect(
      session.page.getByRole("heading", { name: "Reservations", level: 1 })
    ).toBeVisible({ timeout: 15_000 });

    if (process.env.OWNER2_EMAIL) {
      console.warn(
        "[TC-434] OWNER2_EMAIL supplied — skipping the negative unentitled-tenant " +
          "check (an env-supplied tenant may already be entitled and a fresh " +
          "isolated one can't be minted)."
      );
      return;
    }

    const negRunId = generateRunId();
    const negTenant = await createSecondOwner(adminToken, negRunId);
    if (!negTenant.restaurantId)
      throw new Error("[TC-434] could not mint the negative-case tenant");
    const negPassword = "Automation!Owner2-" + negRunId;
    const negSession = await loginViaUi(browser, negTenant.email, negPassword);
    try {
      await createOwnerRestaurantManagementPage(negSession.page).goto(
        negTenant.restaurantId
      );
      const negFloorPage = createOwnerTablesFloorPage(negSession.page);
      await negFloorPage.storeOpsHeader().hover();
      await negFloorPage.storeOpsHeader().click();
      await expect(negFloorPage.tablesFloorNavItem()).toHaveCount(0);
      await expect(negFloorPage.reservationsNavItem()).toHaveCount(0);
    } finally {
      await negSession.context.close();
      // Best-effort — this negative-case tenant is throwaway and referenced
      // nowhere else; a transient delete failure here would only mask the
      // assertions above.
      await deleteTestRestaurant(adminToken, negTenant.restaurantId).catch(
        () => {}
      );
    }
  });

  // ── Sections + tables list ──────────────────────────────────────────────

  test("TC-435: create a section and two tables through the UI forms; the list groups them under the section", async () => {
    await floorPage.gotoTab(restaurantId);
    await floorPage.assertLoaded();

    const sectionRes = await floorPage.createSection(sectionName);
    expect(sectionRes.status()).toBe(201);
    await expect(floorPage.sectionRow(sectionName)).toBeVisible({
      timeout: 10_000,
    });

    const t1Res = await floorPage.createTable(table1, { sectionName });
    expect(t1Res.status()).toBe(201);
    const t2Res = await floorPage.createTable(table2, { sectionName });
    expect(t2Res.status()).toBe(201);

    await expect(floorPage.tableRow(table1)).toBeVisible({ timeout: 10_000 });
    await expect(floorPage.tableRow(table2)).toBeVisible();
    // TablesListPanel groups by section — its own subtitle heading for the
    // group repeats the section's name above that section's table.
    await expect(
      session.page.getByText(sectionName, { exact: true }).first()
    ).toBeVisible();

    const list = unwrap(await listTablesOwnerRaw(ownerToken, restaurantId)) as {
      tables: Record<string, unknown>[];
    };
    const row1 = list.tables.find((t) => t.name === table1);
    const row2 = list.tables.find((t) => t.name === table2);
    expect(row1?.sectionId).toBeTruthy();
    expect(row1?.sectionId).toBe(row2?.sectionId);
  });

  // ── Floor editor (Konva canvas) ──────────────────────────────────────────

  test("TC-436: floor editor — place T1 from the Unplaced tray onto the canvas, Save layout, reload → still placed", async () => {
    await floorPage.gotoTab(restaurantId);
    await floorPage.assertLoaded();
    await floorPage.sectionTab(sectionName).click();
    await expect(floorPage.unplacedTrayChip(table1)).toBeVisible({
      timeout: 10_000,
    });

    const RECT = { width: 160, height: 100 }; // TableFormSheet default shape = RECTANGLE
    const placement = await floorPage.placeTableFromTray(
      table1,
      { x: 500, y: 300 },
      RECT
    );
    await allure.parameter("placement method", placement.method);

    await expect(floorPage.saveLayoutButton()).toBeVisible({ timeout: 5_000 });
    const [saveRes] = await Promise.all([
      session.page.waitForResponse(
        (r) =>
          /\/tables\/layout$/.test(r.url()) && r.request().method() === "PATCH",
        { timeout: 15_000 }
      ),
      floorPage.saveLayoutButton().click(),
    ]);
    expect(saveRes.status()).toBe(200);

    await session.page.reload({ waitUntil: "domcontentloaded" });
    await floorPage.assertLoaded();
    await floorPage.sectionTab(sectionName).click();
    await expect(floorPage.unplacedTrayChip(table1)).toHaveCount(0);

    const list = unwrap(await listTablesOwnerRaw(ownerToken, restaurantId)) as {
      tables: Record<string, unknown>[];
    };
    const row = list.tables.find((t) => t.name === table1) as
      | { geometry?: Record<string, unknown>; shape?: string }
      | undefined;
    expect(row?.geometry).toEqual({
      posX: placement.expected.x,
      posY: placement.expected.y,
      width: RECT.width,
      height: RECT.height,
      rotation: 0,
    });
    expect(row?.shape).toBe("RECTANGLE");

    t1Geometry = {
      x: placement.expected.x,
      y: placement.expected.y,
      width: RECT.width,
      height: RECT.height,
    };
  });

  test("TC-437: edit panel — select the placed table on a fresh load, change capacity + bookable, Save details; API confirms", async () => {
    await floorPage.gotoTab(restaurantId);
    await floorPage.assertLoaded();
    await floorPage.sectionTab(sectionName).click();
    await expect(floorPage.floorCanvas()).toBeVisible({ timeout: 10_000 });

    await floorPage.selectPlacedTable(t1Geometry);
    await expect(floorPage.floorTableNameInput()).toHaveValue(table1, {
      timeout: 10_000,
    });

    await floorPage.floorTableCapacityInput().fill("6");
    await floorPage.floorTableBookableSwitch().uncheck();

    const [res] = await Promise.all([
      session.page.waitForResponse(
        (r) =>
          /\/tables\/[^/]+$/.test(r.url()) && r.request().method() === "PATCH",
        { timeout: 15_000 }
      ),
      floorPage.floorDetailsSaveButton().click(),
    ]);
    expect(res.status()).toBe(200);
    await expect(floorPage.snackbar("Table details saved.")).toBeVisible({
      timeout: 5_000,
    });

    const list = unwrap(await listTablesOwnerRaw(ownerToken, restaurantId)) as {
      tables: Record<string, unknown>[];
    };
    const row = list.tables.find((t) => t.name === table1) as
      | { capacity?: number; isBookable?: boolean }
      | undefined;
    expect(row?.capacity).toBe(6);
    expect(row?.isBookable).toBe(false);
  });

  // ── Merge + deactivate/delete ────────────────────────────────────────────

  test("TC-438: 'Merge into…' — an API-seeded junk table merges into T2 through the UI; list + API confirm", async () => {
    const junkName = `Junk ${runId}`;
    const junk = unwrap(
      await createTableOwnerRaw(ownerToken, restaurantId, { name: junkName })
    );

    await floorPage.gotoTab(restaurantId);
    await floorPage.assertLoaded();
    await expect(floorPage.tableRow(junkName)).toBeVisible({ timeout: 10_000 });

    const mergeRes = await floorPage.mergeTableInto(junkName, table2);
    expect(mergeRes.status()).toBe(200);
    await expect(floorPage.snackbar("Table merged.")).toBeVisible({
      timeout: 5_000,
    });
    await expect(floorPage.tableRow(junkName)).toHaveCount(0);
    await expect(floorPage.tableRow(table2)).toBeVisible();

    const list = unwrap(await listTablesOwnerRaw(ownerToken, restaurantId)) as {
      tables: Record<string, unknown>[];
    };
    expect(list.tables.some((t) => t.id === junk.id)).toBe(false);
    expect(list.tables.some((t) => t.name === table2)).toBe(true);
  });

  test("TC-439: deactivate then delete an API-seeded table via the row menu; list updates; API confirms isActive/absence", async () => {
    const t4Name = `T4 ${runId}`;
    const t4 = unwrap(
      await createTableOwnerRaw(ownerToken, restaurantId, { name: t4Name })
    );

    await floorPage.gotoTab(restaurantId);
    await floorPage.assertLoaded();
    await expect(floorPage.tableRow(t4Name)).toBeVisible({ timeout: 10_000 });

    const deactivateRes = await floorPage.deactivateTableViaMenu(t4Name);
    expect(deactivateRes.status()).toBe(200);
    await expect(floorPage.tableRowStatusChip(t4Name)).toHaveText("Inactive");

    let list = unwrap(await listTablesOwnerRaw(ownerToken, restaurantId)) as {
      tables: Record<string, unknown>[];
    };
    expect(
      (list.tables.find((t) => t.id === t4.id) as { isActive?: boolean })
        ?.isActive
    ).toBe(false);

    const deleteRes = await floorPage.deleteTableViaMenu(t4Name);
    expect(deleteRes.status()).toBe(200);
    await expect(floorPage.tableRow(t4Name)).toHaveCount(0);

    list = unwrap(await listTablesOwnerRaw(ownerToken, restaurantId)) as {
      tables: Record<string, unknown>[];
    };
    expect(list.tables.some((t) => t.id === t4.id)).toBe(false);
  });
});
