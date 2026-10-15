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
 * Konva canvas (TC-436/437): outcomes are asserted via the owner API
 * (`listTablesOwnerRaw`), never pixels/screenshots. The reworked editor
 * zooms and pans (RestauNax 85fbccfc6), so tables are placed and selected
 * through its own "All tables" browser (`pickTableInBrowser`) — the same
 * click path an owner uses — not by computed canvas coordinates.
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
  createTableSectionOwnerRaw,
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

    await floorPage.clickStoreOpsItem(
      floorPage.reservationsNavItem(),
      /tab=reservations/
    );
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
    // group repeats the section's name above that section's table. Match the
    // heading, not bare text: the floor view stays mounted (display:none)
    // with a section TAB of the same name earlier in the DOM.
    await expect(
      session.page.getByRole("heading", { name: sectionName, exact: true })
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

  test("TC-436: floor editor — place T1 from the All tables browser, Save layout, reload → still placed", async () => {
    await floorPage.gotoTab(restaurantId, "floor");
    await floorPage.assertLoaded();
    await floorPage.sectionTab(sectionName).click();
    await floorPage.openTablesBrowser();
    await expect(floorPage.browserRowStatus(table1)).toHaveText("Not placed");

    await floorPage.pickTableInBrowser(table1);

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
    await floorPage.openTablesBrowser();
    await expect(floorPage.browserRowStatus(table1)).toHaveText("On floor");

    const list = unwrap(await listTablesOwnerRaw(ownerToken, restaurantId)) as {
      tables: Record<string, unknown>[];
    };
    const row = list.tables.find((t) => t.name === table1) as
      | { geometry?: Record<string, unknown>; shape?: string }
      | undefined;
    // Click-to-place lands at the editor's own free spot — assert it was
    // placed with the RECTANGLE default size (floorGeometry DEFAULT_RECT_SIZE),
    // not a pixel position.
    expect(typeof row?.geometry?.posX).toBe("number");
    expect(typeof row?.geometry?.posY).toBe("number");
    expect(row?.geometry).toMatchObject({ width: 160, height: 100 });
    expect(row?.shape).toBe("RECTANGLE");
  });

  test("TC-437: edit panel — select the placed table on a fresh load, change capacity + bookable, Save details; API confirms", async () => {
    await floorPage.gotoTab(restaurantId, "floor");
    await floorPage.assertLoaded();
    await floorPage.sectionTab(sectionName).click();
    await expect(floorPage.floorCanvas()).toBeVisible({ timeout: 10_000 });

    // A placed table's browser row selects it into the details panel.
    await floorPage.pickTableInBrowser(table1);
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
  // ── Floor editor rework (2026-10-07) ─────────────────────────────────────

  type OwnerTableRow = {
    id: string;
    name: string;
    shape: string;
    capacity: number | null;
    sectionId: string | null;
    geometry: {
      posX: number | null;
      posY: number | null;
      width: number | null;
      height: number | null;
    };
  };
  const listTables = async () =>
    (
      unwrap(await listTablesOwnerRaw(ownerToken, restaurantId)) as {
        tables: OwnerTableRow[];
      }
    ).tables;

  /** A fresh section (API) whose floor tab the test then opens. */
  const newSection = async (label: string) => {
    const name = `${label} ${runId}`;
    const res = await createTableSectionOwnerRaw(ownerToken, restaurantId, {
      name,
    });
    expect(res.status, msg(res.data)).toBe(201);
    return { id: unwrap(res).id as string, name };
  };

  const openSectionFloor = async (sectionLabel: string) => {
    await floorPage.gotoTab(restaurantId, "floor");
    await floorPage.assertLoaded();
    await floorPage.sectionTab(sectionLabel).click();
  };

  const saveLayout = async () => {
    const [res] = await Promise.all([
      session.page.waitForResponse(
        (r) =>
          /\/tables\/layout$/.test(r.url()) && r.request().method() === "PATCH",
        { timeout: 15_000 }
      ),
      floorPage.saveLayoutButton().click(),
    ]);
    expect(res.status()).toBe(200);
    await expect(floorPage.saveLayoutButton()).toBeHidden({ timeout: 5_000 });
  };

  test("TC-750: add panel — a 'Round 6' preset creates a 6-seat round table in this section, placed and selected; Save layout keeps its 180×180 spot", async () => {
    await allure.description(
      "Clicking the round-6 tile in the 'Add table' panel sends POST " +
        ".../tables (201, CIRCLE, capacity 6, this section, an auto 'Table " +
        "N' name), places the new table on the floor (unsaved) and opens " +
        "the inspector on it. Save layout persists a 180×180 geometry."
    );
    const section = await newSection("Presets");
    await openSectionFloor(section.name);

    const [created] = await Promise.all([
      session.page.waitForResponse(
        (r) => /\/tables$/.test(r.url()) && r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      floorPage.presetTile("round6").click(),
    ]);
    expect(created.status()).toBe(201);
    const createdId = ((await created.json()) as any)?.data?.id as string;
    expect(createdId).toBeTruthy();
    await expect(floorPage.floorTableNameInput()).toHaveValue(/^Table \d+$/, {
      timeout: 10_000,
    });
    await expect(floorPage.floorTableCapacityInput()).toHaveValue("6");

    await saveLayout();
    const row = (await listTables()).find((t) => t.id === createdId);
    expect(row?.shape).toBe("CIRCLE");
    expect(row?.capacity).toBe(6);
    expect(row?.sectionId).toBe(section.id);
    expect(row?.geometry).toMatchObject({ width: 180, height: 180 });
    expect(typeof row?.geometry.posX).toBe("number");
  });

  test("TC-751: undo / redo / discard — a placement can be undone and redone, and Discard changes leaves the table unplaced on the server", async () => {
    await allure.description(
      "Place an API-seeded table from 'All tables' (unsaved: Save layout " +
        "shows). Undo → no unsaved change left and the browser lists it " +
        "'Not placed'; Redo → the change is back. Discard changes → the " +
        "save control goes away and the API still has no position for it."
    );
    const section = await newSection("Undo");
    const name = `Undo T ${runId}`;
    const seeded = await createTableOwnerRaw(ownerToken, restaurantId, {
      name,
      sectionId: section.id,
      capacity: 4,
    });
    expect(seeded.status, msg(seeded.data)).toBe(201);
    await openSectionFloor(section.name);

    await floorPage.pickTableInBrowser(name);
    await expect(floorPage.saveLayoutButton()).toBeVisible({ timeout: 5_000 });

    await floorPage.undoButton().click();
    await expect(floorPage.saveLayoutButton()).toBeHidden({ timeout: 5_000 });
    await floorPage.openTablesBrowser();
    await expect(floorPage.browserRowStatus(name)).toHaveText("Not placed");
    await session.page.keyboard.press("Escape");

    await floorPage.redoButton().click();
    await expect(floorPage.saveLayoutButton()).toBeVisible({ timeout: 5_000 });

    await floorPage.discardLayoutButton().click();
    await expect(floorPage.saveLayoutButton()).toBeHidden({ timeout: 5_000 });
    const row = (await listTables()).find((t) => t.name === name);
    expect(row?.geometry.posX ?? null).toBeNull();
  });

  test("TC-752: empty section — the canvas says the section has no tables yet; 'Add a 4-seat table' adds one there", async () => {
    await allure.description(
      "A brand-new section's floor shows the empty state ('<section> has " +
        "no tables yet'). Its primary button 'Add a 4-seat table' creates a " +
        "4-seat rectangle in that section (POST .../tables 201) and the " +
        "empty state disappears; Save layout keeps it placed."
    );
    const section = await newSection("Empty Room");
    await openSectionFloor(section.name);

    await expect(floorPage.floorEmptyState()).toContainText(
      `${section.name} has no tables yet`,
      { timeout: 10_000 }
    );
    await expect(floorPage.floorEmptyPrimaryButton()).toHaveText(
      "Add a 4-seat table"
    );
    const [created] = await Promise.all([
      session.page.waitForResponse(
        (r) => /\/tables$/.test(r.url()) && r.request().method() === "POST",
        { timeout: 15_000 }
      ),
      floorPage.floorEmptyPrimaryButton().click(),
    ]);
    expect(created.status()).toBe(201);
    await expect(floorPage.floorEmptyState()).toBeHidden({ timeout: 10_000 });

    await saveLayout();
    const inSection = (await listTables()).filter(
      (t) => t.sectionId === section.id
    );
    expect(inSection).toHaveLength(1);
    expect(inSection[0]?.capacity).toBe(4);
    expect(inSection[0]?.shape).toBe("RECTANGLE");
    expect(typeof inSection[0]?.geometry.posX).toBe("number");
  });

  test("TC-753: the toolbar's Keyboard shortcuts button opens the shortcuts list, and Close dismisses it", async () => {
    await allure.description(
      "Toolbar → 'Keyboard shortcuts' opens the 'Floor editor shortcuts' " +
        "dialog listing Undo, Redo and Save layout; Close hides it."
    );
    await openSectionFloor(sectionName);
    await floorPage.shortcutsButton().click();
    const dialog = floorPage.shortcutsDialog();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    for (const text of ["Undo", "Redo", "Save layout"])
      await expect(dialog).toContainText(text);
    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});
