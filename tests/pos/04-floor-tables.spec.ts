/**
 * 04-floor-tables.spec.ts — Table Management (POS, API level): the table/
 * section/combination registry (owner portal + tablet host stand) and the
 * derived floor payload (`GET /api/tablet/floor`).
 *
 * Own tenant: the WHOLE file runs on a per-run throwaway restaurant owned by
 * an admin-minted OWNER (`createSecondOwner`) — table/section/merge/layout
 * are gated on `RestaurantSettings.tableServiceEnabled` OR the
 * `TABLE_RESERVATIONS` entitlement, while combinations AND every tablet
 * host-stand write (create/update/state — confirmed against
 * `tabletFloorController.ts`, NOT just the owner gate) need the entitlement
 * ALONE. Setup chain (all API, no browser): settings PUT (tableServiceEnabled
 * ON) → menu item → REGISTER device (admin-created) → tablet login → owner
 * POS PIN (MANAGER) → a minted STAFF-role member (HOST_MANAGE_RESERVATIONS
 * only) for the capability-split tests. No register session is opened — not
 * needed here, and it would risk STAFF_TERMINAL_LOCKED on staff re-sign-in.
 *
 * Response envelope note (verified against a live QA call + the controller
 * source, not just the brief): every owner (`/restaurant/:rid/...`) and
 * NEW tablet host-stand endpoint (`/api/tablet/floor`, `/api/tablet/tables*`)
 * wraps its payload in `{success, data, message}` — success bodies are read
 * via `unwrap()` below. Error bodies stay FLAT (`{success:false, message,
 * errorCode}`), same as every other RawResponse in this suite — `msg()`/
 * direct `.errorCode` access is correct for those.
 */

import { randomUUID } from "crypto";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import {
  apiLogin,
  createSecondOwner,
  deleteTestRestaurant,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  createTabletDevice,
  tabletLogin,
  deactivateTabletDevice,
  updateRestaurantSettingsApi,
  setOwnerPosPin,
  tabletStaffSignIn,
  createTabletOrderRaw,
  cancelTabletOrderRaw,
  getOrderFullRaw,
  createPinStaffTabletRaw,
  setFeatureOverrideAdminRaw,
  deleteFeatureOverrideAdminRaw,
  listTablesOwnerRaw,
  createTableOwnerRaw,
  updateTableOwnerRaw,
  deleteTableOwnerRaw,
  mergeTableOwnerRaw,
  saveTableLayoutOwnerRaw,
  listTableSectionsOwnerRaw,
  createTableSectionOwnerRaw,
  updateTableSectionOwnerRaw,
  deleteTableSectionOwnerRaw,
  createTableCombinationOwnerRaw,
  getFloorRaw,
  createTableTabletRaw,
  updateTableTabletRaw,
  setTableStateTabletRaw,
  type TabletDevice,
  type ApiMenuItem,
} from "../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

const ITEM_PRICE = 10;

const msg = (body: unknown): string =>
  body && typeof body === "object" && "message" in body
    ? String((body as { message: unknown }).message)
    : JSON.stringify(body);

const errorCode = (body: unknown): string =>
  body && typeof body === "object" && "errorCode" in body
    ? String((body as { errorCode: unknown }).errorCode)
    : "";

/** Every owner + new tablet host-stand success body wraps its payload in
 *  {success, data, message} — pull the real payload out. */
const unwrap = (res: { data: unknown }): any => (res.data as any)?.data;

test.describe("POS — Table Management (floor, tables, sections, combinations)", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER + ADMIN creds needed (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  /** Throwaway tenant owner (createSecondOwner). */
  let token = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let groupId = "";
  let item: ApiMenuItem;
  let device: TabletDevice | undefined;
  let tabletToken = "";
  /** Currently-active staff session on the device (manager unless a test
   *  temporarily switches to the STAFF member). */
  let staffSession = "";
  let managerStaffMemberId = "";
  const managerPin = "8462";
  let staffMemberId = "";
  const staffPin = "1357";
  /** Every check/order this file opens — swept in afterAll (cancel). */
  const openedOrderIds: string[] = [];

  const freshOwnerToken = async () =>
    ownerEmail
      ? (await apiLogin(ownerEmail, ownerPassword)).accessToken
      : token;

  const openCheckOnTable = async (
    tableId: string,
    session: string,
    guestCount = 2
  ) => {
    const res = await createTabletOrderRaw(tabletToken, session, {
      restaurantId,
      orderType: "PICKUP",
      subtotal: ITEM_PRICE,
      tax: 0,
      tip: 0,
      total: ITEM_PRICE,
      customerPhone: "",
      orderItems: [
        {
          menuItemId: item.id,
          menuItemName: item.name,
          quantity: 1,
          price: ITEM_PRICE,
        },
      ],
      openCheck: true,
      tableId,
      guestCount,
    });
    expect(res.status, msg(res.data)).toBe(201);
    const id = res.data.id!;
    openedOrderIds.push(id);
    return id;
  };

  test.beforeAll(async () => {
    if (!OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD)
      return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId);
    if (!tenant.restaurantId)
      throw new Error(
        "[floor-tables] could not mint the throwaway tenant restaurant"
      );
    token = tenant.accessToken;
    restaurantId = tenant.restaurantId;
    ownerEmail = process.env.OWNER2_EMAIL || tenant.email;
    ownerPassword = process.env.OWNER2_PASSWORD || "Automation!Owner2-" + runId;

    // tableServiceEnabled ON — table/section CRUD needs it (OR the
    // entitlement, granted later by TC-391). Combinations + tablet
    // host-stand writes need the entitlement alone regardless.
    await updateRestaurantSettingsApi(token, restaurantId, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });

    groupId = (
      await createMenuGroupNamed(token, `Automation Floor ${runId}`, {
        restaurantId,
      })
    ).id;
    item = await createMenuItemFull(
      token,
      groupId,
      `Floor Burger ${runId}`,
      ITEM_PRICE
    );

    device = await createTabletDevice(
      adminToken,
      restaurantId,
      `Automation Floor POS ${runId}`
    );
    tabletToken = await tabletLogin(device.name, device.code);

    managerStaffMemberId = await setOwnerPosPin(
      token,
      restaurantId,
      managerPin
    );
    staffSession = await tabletStaffSignIn(
      tabletToken,
      managerStaffMemberId,
      managerPin
    );

    // STAFF-role member (default capability: HOST_MANAGE_RESERVATIONS only)
    // for the capability-split negative tests (TC-393/394).
    const staffCreate = await createPinStaffTabletRaw(
      tabletToken,
      staffSession,
      {
        firstName: "Auto",
        lastName: `Staff${runId}`,
        pin: staffPin,
        staffRole: "STAFF",
      }
    );
    if (!staffCreate.ok)
      throw new Error(
        `[floor-tables] could not mint STAFF member: ${msg(staffCreate.data)}`
      );
    staffMemberId = unwrap(staffCreate).id;
  });

  test.afterAll(async () => {
    if (!token) return;
    for (const orderId of openedOrderIds) {
      try {
        const read = await getOrderFullRaw(await freshOwnerToken(), orderId);
        const status = String(read.data?.status ?? "");
        if (!read.ok || status === "CANCELLED" || status === "REFUNDED")
          continue;
        const cancel = await cancelTabletOrderRaw(
          tabletToken,
          staffSession,
          orderId,
          "Automation cleanup"
        );
        if (!cancel.ok) {
          console.warn(
            `[floor-tables] cleanup could not cancel ${orderId}: ${msg(cancel.data)}`
          );
        }
      } catch (err) {
        console.warn(`[floor-tables] cleanup failed for ${orderId}:`, err);
      }
    }
    const t = await freshOwnerToken().catch(() => token);
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    ).catch(() => {});
    if (item)
      await permanentlyDeleteMenuItemApi(adminToken, item.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
    if (device) await deactivateTabletDevice(t, restaurantId, device.id);
    if (restaurantId && !process.env.OWNER2_EMAIL)
      await deleteTestRestaurant(adminToken, restaurantId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "POS Table Management");
    await allure.label("severity", "critical");
    token = await freshOwnerToken();
  });

  // ── Sections ────────────────────────────────────────────────────────────

  let sectionAId = "";
  let sectionBId = "";

  test("TC-384: sections CRUD happy path — create, rename, list, duplicate name refused", async () => {
    await allure.description(
      "POST /restaurant/:rid/table-sections creates a section (name + " +
        "sortOrder); PATCH renames it; GET lists both; a duplicate name on " +
        "this restaurant → 409 TABLE_SECTION_NAME_CONFLICT."
    );
    const s1 = await createTableSectionOwnerRaw(token, restaurantId, {
      name: `Patio ${runId}`,
      sortOrder: 1,
    });
    expect(s1.status, msg(s1.data)).toBe(201);
    sectionAId = unwrap(s1).id;

    const s2 = await createTableSectionOwnerRaw(token, restaurantId, {
      name: `Bar ${runId}`,
      sortOrder: 2,
    });
    expect(s2.status, msg(s2.data)).toBe(201);
    sectionBId = unwrap(s2).id;

    const renamed = await updateTableSectionOwnerRaw(
      token,
      restaurantId,
      sectionAId,
      { name: `Patio Renamed ${runId}` }
    );
    expect(renamed.status, msg(renamed.data)).toBe(200);

    const list = await listTableSectionsOwnerRaw(token, restaurantId);
    expect(list.status, msg(list.data)).toBe(200);
    const sections = unwrap(list) as Record<string, unknown>[];
    expect(
      sections.some(
        (s) => s.id === sectionAId && s.name === `Patio Renamed ${runId}`
      )
    ).toBe(true);
    expect(sections.some((s) => s.id === sectionBId)).toBe(true);

    const dup = await createTableSectionOwnerRaw(token, restaurantId, {
      name: `Bar ${runId}`,
    });
    expect(dup.status, msg(dup.data)).toBe(409);
    expect(errorCode(dup.data)).toBe("TABLE_SECTION_NAME_CONFLICT");
  });

  test("TC-385: section delete refused while a table is assigned; succeeds once emptied", async () => {
    await allure.description(
      "DELETE .../table-sections/:id → 409 TABLE_SECTION_NOT_EMPTY while any " +
        "table (active or inactive) still points at it; moving the table out " +
        "(PATCH sectionId:null) then lets the delete through."
    );
    const table = await createTableOwnerRaw(token, restaurantId, {
      name: `T-385 ${runId}`,
      sectionId: sectionBId,
    });
    expect(table.status, msg(table.data)).toBe(201);
    const tableId = unwrap(table).id;

    const blocked = await deleteTableSectionOwnerRaw(
      token,
      restaurantId,
      sectionBId
    );
    expect(blocked.status, msg(blocked.data)).toBe(409);
    expect(errorCode(blocked.data)).toBe("TABLE_SECTION_NOT_EMPTY");

    const moved = await updateTableOwnerRaw(token, restaurantId, tableId, {
      sectionId: null,
    });
    expect(moved.status, msg(moved.data)).toBe(200);

    const deleted = await deleteTableSectionOwnerRaw(
      token,
      restaurantId,
      sectionBId
    );
    expect(deleted.status, msg(deleted.data)).toBe(200);
  });

  // ── Tables ──────────────────────────────────────────────────────────────

  test("TC-386: table create validation — missing name, bad capacity, duplicate name", async () => {
    await allure.description(
      "POST /restaurant/:rid/tables: an empty name → 400 TABLE_NAME_REQUIRED; " +
        "minCapacity exceeding capacity → 400 TABLE_CAPACITY_INVALID; a " +
        "second table reusing an existing name → 409 TABLE_NAME_CONFLICT."
    );
    const noName = await createTableOwnerRaw(token, restaurantId, {
      name: "",
    });
    expect(noName.status, msg(noName.data)).toBe(400);
    expect(errorCode(noName.data)).toBe("TABLE_NAME_REQUIRED");

    const badCapacity = await createTableOwnerRaw(token, restaurantId, {
      name: `Cap ${runId}`,
      capacity: 2,
      minCapacity: 4,
    });
    expect(badCapacity.status, msg(badCapacity.data)).toBe(400);
    expect(errorCode(badCapacity.data)).toBe("TABLE_CAPACITY_INVALID");

    const first = await createTableOwnerRaw(token, restaurantId, {
      name: `Dup ${runId}`,
    });
    expect(first.status, msg(first.data)).toBe(201);
    const dup = await createTableOwnerRaw(token, restaurantId, {
      name: `Dup ${runId}`,
    });
    expect(dup.status, msg(dup.data)).toBe(409);
    expect(errorCode(dup.data)).toBe("TABLE_NAME_CONFLICT");
  });

  test("TC-387: layout batch save persists geometry exactly", async () => {
    await allure.description(
      "PATCH /restaurant/:rid/tables/layout saves posX/posY/width/height/" +
        "rotation/shape for a batch of tables in one transaction; GET the " +
        "owner table list back and the numbers round-trip exactly."
    );
    const tA = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Layout A ${runId}`,
      })
    );
    const tB = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Layout B ${runId}`,
      })
    );

    const save = await saveTableLayoutOwnerRaw(token, restaurantId, [
      {
        id: tA.id,
        posX: 10.5,
        posY: 20.25,
        width: 80,
        height: 80,
        rotation: 90,
        shape: "CIRCLE",
      },
      {
        id: tB.id,
        posX: 200,
        posY: 150.5,
        width: 100,
        height: 60,
        rotation: 0,
        shape: "RECTANGLE",
      },
    ]);
    expect(save.status, msg(save.data)).toBe(200);

    const list = unwrap(await listTablesOwnerRaw(token, restaurantId)) as {
      tables: Record<string, any>[];
    };
    const rowA = list.tables.find((t) => t.id === tA.id);
    const rowB = list.tables.find((t) => t.id === tB.id);
    expect(rowA?.geometry).toEqual({
      posX: 10.5,
      posY: 20.25,
      width: 80,
      height: 80,
      rotation: 90,
    });
    expect(rowA?.shape).toBe("CIRCLE");
    expect(rowB?.geometry).toEqual({
      posX: 200,
      posY: 150.5,
      width: 100,
      height: 60,
      rotation: 0,
    });
    expect(rowB?.shape).toBe("RECTANGLE");
  });

  test("TC-388: merge repoints the open check and cleans up the source table", async () => {
    await allure.description(
      "Open a check on table A (explicit tableId), merge A into B — A's " +
        "order is repointed onto B (Order.tableId updates) and, once nothing " +
        "else references A, A is hard-deleted (gone) rather than merely " +
        "deactivated; B keeps the live open-check count."
    );
    const tA = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Merge A ${runId}`,
      })
    );
    const tB = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Merge B ${runId}`,
      })
    );

    const orderId = await openCheckOnTable(tA.id, staffSession);

    const merge = await mergeTableOwnerRaw(token, restaurantId, tA.id, tB.id);
    expect(merge.status, msg(merge.data)).toBe(200);

    const list = unwrap(await listTablesOwnerRaw(token, restaurantId)) as {
      tables: Record<string, any>[];
    };
    const rowA = list.tables.find((t) => t.id === tA.id);
    expect(
      !rowA || rowA.isActive === false,
      "source table should be gone or deactivated"
    ).toBe(true);
    const rowB = list.tables.find((t) => t.id === tB.id);
    expect(rowB, "target table should remain").toBeTruthy();
    expect(rowB!.openCheckCount).toBeGreaterThanOrEqual(1);

    const full = await getOrderFullRaw(token, orderId);
    expect(full.data.tableId).toBe(tB.id);

    const cancel = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      orderId,
      "TC-388 cleanup"
    );
    expect(cancel.ok, msg(cancel.data)).toBe(true);
  });

  let softDeletedTableId = "";
  let softDeletedOrderId = "";
  let hardDeletedTableId = "";

  test("TC-389: delete semantics — unreferenced hard-deletes, referenced soft-deactivates", async () => {
    await allure.description(
      "DELETE .../tables/:id on a table nothing references → " +
        "data.deleted:true and the row disappears from the owner list; on a " +
        "table with a live order → data.deleted:false and isActive:false " +
        "(history keeps a row to point at)."
    );
    const unref = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Unref ${runId}`,
      })
    );
    hardDeletedTableId = unref.id;
    const delUnref = await deleteTableOwnerRaw(token, restaurantId, unref.id);
    expect(delUnref.status, msg(delUnref.data)).toBe(200);
    expect(unwrap(delUnref).deleted).toBe(true);

    const listAfter = unwrap(await listTablesOwnerRaw(token, restaurantId)) as {
      tables: Record<string, any>[];
    };
    expect(listAfter.tables.some((t) => t.id === unref.id)).toBe(false);

    const ref = unwrap(
      await createTableOwnerRaw(token, restaurantId, { name: `Ref ${runId}` })
    );
    softDeletedOrderId = await openCheckOnTable(ref.id, staffSession);

    const delRef = await deleteTableOwnerRaw(token, restaurantId, ref.id);
    expect(delRef.status, msg(delRef.data)).toBe(200);
    expect(unwrap(delRef).deleted).toBe(false);

    const listAfter2 = unwrap(
      await listTablesOwnerRaw(token, restaurantId)
    ) as { tables: Record<string, any>[] };
    const row = listAfter2.tables.find((t) => t.id === ref.id);
    expect(row?.isActive).toBe(false);
    softDeletedTableId = ref.id;
  });

  test("TC-390: ghost-table regression — a deactivated/deleted table never appears on GET /api/tablet/floor", async () => {
    await allure.description(
      "The live hardware bug (2026-08-26): computeTableStates only reads " +
        "isActive:true tables for the floor payload, so a hard-deleted OR " +
        "soft-deactivated table must never leak into GET /api/tablet/floor " +
        "— even one still holding an open check."
    );
    const floor = await getFloorRaw(tabletToken);
    expect(floor.status, msg(floor.data)).toBe(200);
    const floorTables = (
      unwrap(floor) as { tables: { table: { id: string } }[] }
    ).tables;
    expect(
      floorTables.some((t) => t.table.id === hardDeletedTableId),
      "hard-deleted table must not appear on the floor"
    ).toBe(false);
    expect(
      floorTables.some((t) => t.table.id === softDeletedTableId),
      "soft-deactivated table (with an open check) must not appear on the floor"
    ).toBe(false);

    const cancel = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      softDeletedOrderId,
      "TC-390 cleanup"
    );
    expect(cancel.ok, msg(cancel.data)).toBe(true);
  });

  // ── Combinations (entitlement-gated) ───────────────────────────────────

  test("TC-391: combinations gated on the TABLE_RESERVATIONS entitlement alone", async () => {
    await allure.description(
      "Before the entitlement: combination create → 403 " +
        "RESERVATIONS_NOT_ENABLED (tableServiceEnabled alone is NOT enough " +
        "for combinations). After granting TABLE_RESERVATIONS: create with " +
        "two real member tables → 201; a tableId that isn't this " +
        "restaurant's → 403 TABLE_COMBINATION_FOREIGN_TABLE_ID."
    );
    const preGrant = await createTableCombinationOwnerRaw(token, restaurantId, {
      name: `Combo Pre ${runId}`,
      capacity: 4,
      tableIds: [],
    });
    expect(preGrant.status, msg(preGrant.data)).toBe(403);
    expect(errorCode(preGrant.data)).toBe("RESERVATIONS_NOT_ENABLED");

    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS",
      true
    );
    expect(grant.status, msg(grant.data)).toBe(201);

    const cA = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Combo A ${runId}`,
      })
    );
    const cB = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `Combo B ${runId}`,
      })
    );
    const combo = await createTableCombinationOwnerRaw(token, restaurantId, {
      name: `Combo ${runId}`,
      capacity: 6,
      tableIds: [cA.id, cB.id],
    });
    expect(combo.status, msg(combo.data)).toBe(201);

    const foreign = await createTableCombinationOwnerRaw(token, restaurantId, {
      name: `Combo Foreign ${runId}`,
      capacity: 4,
      tableIds: [randomUUID()],
    });
    expect(foreign.status, msg(foreign.data)).toBe(403);
    expect(errorCode(foreign.data)).toBe("TABLE_COMBINATION_FOREIGN_TABLE_ID");
  });

  test("TC-392: floor family gated on tableServiceEnabled OR the entitlement — neither present refuses", async () => {
    await allure.description(
      "With tableServiceEnabled:false AND the TABLE_RESERVATIONS entitlement " +
        "revoked, GET /restaurant/:rid/tables → 403 " +
        "TABLE_MANAGEMENT_NOT_ENABLED. Restores both in `finally` — the " +
        "capability-split tests after this one need the entitlement, per " +
        "the tablet host-stand gating discrepancy noted in the file header."
    );
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "TABLE_RESERVATIONS"
    );
    await updateRestaurantSettingsApi(token, restaurantId, {
      tableServiceEnabled: false,
    });
    try {
      const res = await listTablesOwnerRaw(token, restaurantId);
      expect(res.status, msg(res.data)).toBe(403);
      expect(errorCode(res.data)).toBe("TABLE_MANAGEMENT_NOT_ENABLED");
    } finally {
      await updateRestaurantSettingsApi(token, restaurantId, {
        tableServiceEnabled: true,
      });
      await setFeatureOverrideAdminRaw(
        adminToken,
        restaurantId,
        "TABLE_RESERVATIONS",
        true
      );
    }
  });

  // ── Tablet host-stand capability split ──────────────────────────────────

  test("TC-393: POS table CRUD capability split — STAFF forbidden, MANAGER creates/renames", async () => {
    await allure.description(
      "POST/PATCH /api/tablet/tables require MANAGE_TABLES. A STAFF-role " +
        "session (HOST_MANAGE_RESERVATIONS only) gets 403 AUTH_FORBIDDEN; " +
        "the MANAGER session creates and renames a table, and it shows up " +
        "in the floor payload."
    );
    const staffSess = await tabletStaffSignIn(
      tabletToken,
      staffMemberId,
      staffPin
    );
    const denied = await createTableTabletRaw(tabletToken, staffSess, {
      name: `POS Deny ${runId}`,
    });
    expect(denied.status, msg(denied.data)).toBe(403);
    expect(errorCode(denied.data)).toBe("AUTH_FORBIDDEN");

    const managerSess = await tabletStaffSignIn(
      tabletToken,
      managerStaffMemberId,
      managerPin
    );
    staffSession = managerSess;

    const created = await createTableTabletRaw(tabletToken, managerSess, {
      name: `POS Table ${runId}`,
    });
    expect(created.status, msg(created.data)).toBe(201);
    const posTableId = unwrap(created).id;

    const renamed = await updateTableTabletRaw(
      tabletToken,
      managerSess,
      posTableId,
      {
        name: `POS Table Renamed ${runId}`,
      }
    );
    expect(renamed.status, msg(renamed.data)).toBe(200);

    const floor = await getFloorRaw(tabletToken);
    const floorTables = (
      unwrap(floor) as { tables: { table: { id: string; name: string } }[] }
    ).tables;
    expect(
      floorTables.some(
        (t) =>
          t.table.id === posTableId &&
          t.table.name === `POS Table Renamed ${runId}`
      )
    ).toBe(true);
  });

  test("TC-394: table state capability split — DIRTY/CLEAR need HOST_MANAGE_RESERVATIONS, BLOCKED needs MANAGE_TABLES", async () => {
    await allure.description(
      "STAFF (HOST_MANAGE_RESERVATIONS only) can set DIRTY then CLEAR; the " +
        "floor shows DIRTY between the two. STAFF setting BLOCKED → 403 " +
        "AUTH_FORBIDDEN. MANAGER's BLOCKED succeeds and the floor shows " +
        "BLOCKED (precedence over AVAILABLE), then CLEAR restores it."
    );
    const stTable = unwrap(
      await createTableOwnerRaw(token, restaurantId, {
        name: `State ${runId}`,
      })
    );

    const staffSess = await tabletStaffSignIn(
      tabletToken,
      staffMemberId,
      staffPin
    );

    const dirty = await setTableStateTabletRaw(
      tabletToken,
      staffSess,
      stTable.id,
      "DIRTY"
    );
    expect(dirty.status, msg(dirty.data)).toBe(200);
    const floorDirty = await getFloorRaw(tabletToken);
    const rowDirty = (
      unwrap(floorDirty) as {
        tables: { table: { id: string }; state: string }[];
      }
    ).tables.find((t) => t.table.id === stTable.id);
    expect(rowDirty?.state).toBe("DIRTY");

    const clear = await setTableStateTabletRaw(
      tabletToken,
      staffSess,
      stTable.id,
      "CLEAR"
    );
    expect(clear.status, msg(clear.data)).toBe(200);

    const blockedDenied = await setTableStateTabletRaw(
      tabletToken,
      staffSess,
      stTable.id,
      "BLOCKED"
    );
    expect(blockedDenied.status, msg(blockedDenied.data)).toBe(403);
    expect(errorCode(blockedDenied.data)).toBe("AUTH_FORBIDDEN");

    const managerSess = await tabletStaffSignIn(
      tabletToken,
      managerStaffMemberId,
      managerPin
    );
    staffSession = managerSess;

    const blocked = await setTableStateTabletRaw(
      tabletToken,
      managerSess,
      stTable.id,
      "BLOCKED"
    );
    expect(blocked.status, msg(blocked.data)).toBe(200);
    const floorBlocked = await getFloorRaw(tabletToken);
    const rowBlocked = (
      unwrap(floorBlocked) as {
        tables: { table: { id: string }; state: string }[];
      }
    ).tables.find((t) => t.table.id === stTable.id);
    expect(rowBlocked?.state).toBe("BLOCKED");

    const clear2 = await setTableStateTabletRaw(
      tabletToken,
      managerSess,
      stTable.id,
      "CLEAR"
    );
    expect(clear2.status, msg(clear2.data)).toBe(200);
  });

  test("TC-395: floor state derivation — OCCUPIED while a check is open, AVAILABLE once cancelled", async () => {
    await allure.description(
      "Opening a check on a table (explicit tableId) derives OCCUPIED on " +
        "GET /api/tablet/floor with an openChecks summary carrying the " +
        "order id; cancelling the order (no register in this file — cash " +
        "settlement is file 03's territory) returns the table to AVAILABLE."
    );
    const occTable = unwrap(
      await createTableOwnerRaw(token, restaurantId, { name: `Occ ${runId}` })
    );
    const orderId = await openCheckOnTable(occTable.id, staffSession);

    const floor = await getFloorRaw(tabletToken);
    const row = (
      unwrap(floor) as {
        tables: {
          table: { id: string };
          state: string;
          openChecks: { orderId: string }[];
        }[];
      }
    ).tables.find((t) => t.table.id === occTable.id);
    expect(row?.state).toBe("OCCUPIED");
    expect(row?.openChecks.length).toBe(1);
    expect(row?.openChecks[0]?.orderId).toBe(orderId);

    const cancel = await cancelTabletOrderRaw(
      tabletToken,
      staffSession,
      orderId,
      "TC-395 cleanup"
    );
    expect(cancel.ok, msg(cancel.data)).toBe(true);

    const floor2 = await getFloorRaw(tabletToken);
    const row2 = (
      unwrap(floor2) as { tables: { table: { id: string }; state: string }[] }
    ).tables.find((t) => t.table.id === occTable.id);
    expect(row2?.state).toBe("AVAILABLE");
  });
});
