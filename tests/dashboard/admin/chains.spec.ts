import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createAdminChainsPage } from "../../../pages/dashboard/admin/AdminChainsPage";
import {
  apiLogin,
  createRestaurantRaw,
  createTestMenuGroup,
  createTestMenuItem,
  createMenuGroupNamed,
  createMenuItemFull,
  deleteTestRestaurant,
  findUserIdByEmail,
  assignRestaurantToUserApi,
  adminLinkRestaurantToChainRaw,
  adminUnlinkRestaurantFromChainRaw,
  getOwnedChains,
  getRestaurantMenusApi,
  flattenMenuItems,
  createSeededOrder,
  cancelOrderRaw,
  listOrders,
  ensureTaxRate,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
} from "../../../utils/apiHelper";
import { generateRunId, readSharedState } from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

// Chain Management (/admin?tab=chains). ADMIN only — the frontend's /admin
// route guard redirects EMPLOYEE/OWNER to /access-denied even though the
// backend technically allows EMPLOYEE too (see role-restrictions.spec.ts for
// the access matrix; not duplicated here).
test.describe("Admin — Chains", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !OWNER_EMAIL,
    "ADMIN_EMAIL / ADMIN_PASSWORD / OWNER_EMAIL not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Admin Chains");
    await allure.label("severity", "normal");
  });

  test("TC-181: admin can navigate to Chain Management and see the chains grid", async ({
    adminPage,
  }) => {
    await allure.description(
      "The admin Chains tab loads a DataGrid with its default-visible columns — read-only, no seed " +
        "data assumed since chains aren't part of the shared QA seed."
    );

    const chainsPage = createAdminChainsPage(adminPage);

    await allure.step("Navigate to admin chains tab", async () => {
      await chainsPage.goto();
      await allure.parameter("URL", adminPage.url());
    });

    await allure.step("Verify page heading is visible", async () => {
      await chainsPage.assertPageLoaded();
    });

    await allure.step(
      "Verify the grid's default-visible columns are present",
      async () => {
        await chainsPage.assertColumnVisible("Chain");
        await chainsPage.assertColumnVisible("Owner");
        await chainsPage.assertColumnVisible("Restaurants");
      }
    );
  });

  test("TC-223: admin creates a chain from a founding restaurant", async ({
    adminPage,
  }) => {
    await allure.description(
      "Creating a chain requires a founding restaurant that already has a menu, an assigned owner, and " +
        "doesn't belong to a chain yet. This seeds a throwaway restaurant + menu via the API and assigns " +
        "the seed OWNER account to it (never the shared seed restaurant, since chain membership isn't " +
        "easily undone — there's no DELETE chain endpoint), then drives the real Create Chain UI flow: " +
        "search the founding store, submit, land on the auto-opened detail panel, and confirm the new " +
        "chain shows up back in the list."
    );

    const runId = generateRunId();
    const restaurantName = `Automation Chain Founder ${runId}`;
    let restaurantId = "";

    const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);

    try {
      await allure.step(
        "Seed a throwaway restaurant with a menu (chain-create requires one)",
        async () => {
          const res = await createRestaurantRaw(accessToken, {
            name: restaurantName,
            street: "123 Test Street",
            city: "Miami",
            state: "FL",
            zipCode: "33101",
            cuisineType: "Italian",
            restaurantPhone: "5551234567",
            description: "Automation chain-create test",
            minimumOrderPreparationTime: 0,
          });
          restaurantId = (res.data as { restaurant?: { id?: string } })
            ?.restaurant?.id as string;
          if (!restaurantId) {
            throw new Error(
              `Failed to seed founding restaurant: ${res.status} ${JSON.stringify(res.data)}`
            );
          }
          const group = await createTestMenuGroup(accessToken, restaurantId);
          await createTestMenuItem(accessToken, group.id);
          await allure.parameter("restaurantId", restaurantId);
        }
      );

      await allure.step(
        "Assign the seed OWNER account as the founding restaurant's owner (chain-create requires one)",
        async () => {
          const ownerId = await findUserIdByEmail(accessToken, OWNER_EMAIL);
          if (!ownerId) {
            throw new Error(`Could not find a user id for ${OWNER_EMAIL}`);
          }
          await assignRestaurantToUserApi(accessToken, ownerId, restaurantId);
        }
      );

      const chainsPage = createAdminChainsPage(adminPage);

      await allure.step("Navigate to admin chains tab", async () => {
        await chainsPage.goto();
      });

      await allure.step(
        "Open Create Chain and select the founding restaurant",
        async () => {
          await chainsPage.openCreateChain();
          await chainsPage.selectFoundingStore(restaurantName);
        }
      );

      await allure.step("Submit and verify the success toast", async () => {
        await chainsPage.submitCreateChain();
        await chainsPage.assertChainCreatedToast();
      });

      await allure.step(
        "Verify the detail panel auto-opens showing the founding restaurant as a member",
        async () => {
          await chainsPage.assertDetailPanelVisible(restaurantName);
          await chainsPage.assertMemberRestaurantVisible(restaurantName);
        }
      );

      await allure.step(
        "Navigate back to the list and verify the new chain's row",
        async () => {
          await chainsPage.backToChains();
          await chainsPage.assertChainRowVisible(restaurantName);
        }
      );
    } finally {
      // Best-effort: no DELETE /api/admin/chains endpoint exists, so this
      // deletes the founding restaurant but may leave an orphan
      // RestaurantGroup row in QA — documented in TEST_COVERAGE.md.
      if (restaurantId) {
        await deleteTestRestaurant(accessToken, restaurantId).catch((err) => {
          console.warn(
            `[chains] Cleanup failed for restaurant ${restaurantId} — clean up manually:`,
            err
          );
        });
      }
    }
  });

  // ── Link / unlink an existing store (admin API contract, owner-visible effect) ──
  // Uses the persistent "Automation Chain" fixture (globalSetup) — a throwaway
  // store joins with menu:"keep" and leaves again; nothing persistent changes.

  test("TC-323: admin links an existing store (menu kept) — its own items interleave at that location only — and unlinks it", async () => {
    await allure.description(
      "POST /api/admin/chains/:gid/restaurants/:rid/link {menu:'keep'} on a throwaway store that has its own " +
        "menu: the owner's /api/chains/owned shows locationCount 3; the store's merged menu carries the chain's " +
        "shared categories PLUS its own item (source RESTAURANT), which no other location sees; POST …/unlink " +
        "(never went live → allowed) → 200 {dissolved:false}, chain back to 2 locations."
    );
    const { chainGroupId, chainLocationAId } = readSharedState();
    test.skip(!chainGroupId, "Automation Chain fixture not available");
    const admin = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const owner = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const runId = generateRunId();
    let storeId = "";
    try {
      const res = await createRestaurantRaw(admin.accessToken, {
        name: `Automation Chain Joiner ${runId}`,
        street: "9 Joiner Street",
        city: "Miami",
        state: "FL",
        zipCode: "33101",
        cuisineType: "American",
        restaurantPhone: "3055550188",
        description: "Throwaway — chain link/unlink test",
        minimumOrderPreparationTime: 0,
      });
      storeId =
        (res.data as { restaurant?: { id?: string } })?.restaurant?.id ?? "";
      expect(
        storeId,
        `store seed failed: ${JSON.stringify(res.data)}`
      ).toBeTruthy();
      await assignRestaurantToUserApi(admin.accessToken, owner.userId, storeId);
      const ownGroup = await createMenuGroupNamed(
        owner.accessToken,
        `Automation Menu ${runId}`,
        {
          restaurantId: storeId,
        }
      );
      const ownItem = await createMenuItemFull(
        owner.accessToken,
        ownGroup.id,
        `Joiner Own ${runId}`,
        5
      );

      const link = await adminLinkRestaurantToChainRaw(
        admin.accessToken,
        chainGroupId!,
        storeId,
        {
          menu: "keep",
        }
      );
      expect(link.status, JSON.stringify(link.data)).toBe(200);
      const chains = await getOwnedChains(owner.accessToken);
      expect(
        chains.find((c) => c.groupId === chainGroupId)?.locationCount
      ).toBe(3);

      const merged = await getRestaurantMenusApi(storeId, {
        accessToken: owner.accessToken,
      });
      expect(merged.chain?.groupId).toBe(chainGroupId);
      const own = flattenMenuItems(merged.menus).find(
        (i) => i.id === ownItem.id
      );
      expect(own, "own item kept and interleaved").toBeTruthy();
      expect(own?.source).toBe("RESTAURANT");
      expect(
        merged.menus.some((m) => m.source === "CHAIN"),
        "shared chain menu present"
      ).toBe(true);
      const atA = flattenMenuItems(
        (
          await getRestaurantMenusApi(chainLocationAId!, {
            accessToken: owner.accessToken,
          })
        ).menus
      ).find((i) => i.id === ownItem.id);
      expect(
        atA,
        "other locations never see the joiner's private item"
      ).toBeUndefined();

      const unlink = await adminUnlinkRestaurantFromChainRaw(
        admin.accessToken,
        chainGroupId!,
        storeId
      );
      expect(unlink.status, JSON.stringify(unlink.data)).toBe(200);
      expect(unlink.data.dissolved).toBe(false);
      expect(
        (await getOwnedChains(owner.accessToken)).find(
          (c) => c.groupId === chainGroupId
        )?.locationCount
      ).toBe(2);
    } finally {
      if (storeId) {
        // If the unlink didn't happen (assertion above failed), delete still
        // detaches the store from the chain (restaurantGroupId is SetNull).
        await deleteTestRestaurant(admin.accessToken, storeId).catch(() => {});
      }
    }
  });

  test("TC-324: unlink is refused for a location that has gone live, and for a non-member", async () => {
    await allure.description(
      "A store that has real orders can't leave a chain (Domino's rule): link a throwaway store, seed a real-price " +
        "order on it, POST …/unlink → 400 'This location has gone live…'. Unlinking a restaurant that isn't a " +
        "member → 404. Cancelling the order (CANCELLED is excluded from the live check) makes unlink succeed; the " +
        "store is then archived (admin DELETE only archives — it never detaches membership) and the fixture chain " +
        "is asserted back at 2 locations."
    );
    const { chainGroupId, restaurantId: seedRestaurantId } = readSharedState();
    test.skip(!chainGroupId, "Automation Chain fixture not available");
    const admin = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const owner = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    const runId = generateRunId();

    const notMember = await adminUnlinkRestaurantFromChainRaw(
      admin.accessToken,
      chainGroupId!,
      seedRestaurantId
    );
    expect(notMember.status, "non-member").toBe(404);

    let storeId = "";
    let sharedGroupId = "";
    let unlinked = false;
    try {
      const res = await createRestaurantRaw(admin.accessToken, {
        name: `Automation Chain Live ${runId}`,
        street: "10 Live Street",
        city: "Miami",
        state: "FL",
        zipCode: "33101",
        cuisineType: "American",
        restaurantPhone: "3055550189",
        description: "Throwaway — unlink guard test",
        minimumOrderPreparationTime: 0,
      });
      storeId =
        (res.data as { restaurant?: { id?: string } })?.restaurant?.id ?? "";
      expect(
        storeId,
        `store seed failed: ${JSON.stringify(res.data)}`
      ).toBeTruthy();
      await assignRestaurantToUserApi(admin.accessToken, owner.userId, storeId);
      const link = await adminLinkRestaurantToChainRaw(
        admin.accessToken,
        chainGroupId!,
        storeId,
        {}
      );
      expect(link.status, JSON.stringify(link.data)).toBe(200);
      // A real (non-INITIALIZED) order → the store has "gone live". Seed a
      // shared item on the chain master to order (the fixture master may be
      // empty when this file runs alone) and give the store a tax rate so the
      // pricing guard can total the order.
      await ensureTaxRate(owner.accessToken, storeId);
      sharedGroupId = (
        await createMenuGroupNamed(
          owner.accessToken,
          `Automation Menu ${runId}`,
          {
            groupId: chainGroupId!,
          }
        )
      ).id;
      const sharedItem = await createMenuItemFull(
        owner.accessToken,
        sharedGroupId,
        `Chain Live Item ${runId}`,
        6
      );
      const seeded = await createSeededOrder(
        owner.accessToken,
        storeId,
        { menuItemId: sharedItem.id, name: sharedItem.name, price: 6 },
        { status: "CONFIRMED" }
      );
      const refused = await adminUnlinkRestaurantFromChainRaw(
        admin.accessToken,
        chainGroupId!,
        storeId
      );
      expect(refused.status).toBe(400);
      expect(String(refused.data.message)).toMatch(/gone live/i);

      // CANCELLED orders don't count as "live" (EXCLUDED_ORDER_STATUSES) —
      // cancel it and the store may leave. NOTE: the admin restaurant DELETE
      // only ARCHIVES (deletedAt) and does NOT detach chain membership, so
      // unlink-before-archive is the only way to keep the fixture at 2.
      const cancel = await cancelOrderRaw(owner.accessToken, seeded.id, {
        reason: "automation cleanup",
      });
      expect(cancel.status, JSON.stringify(cancel.data)).toBe(200);
      const allowed = await adminUnlinkRestaurantFromChainRaw(
        admin.accessToken,
        chainGroupId!,
        storeId
      );
      expect(allowed.status, JSON.stringify(allowed.data)).toBe(200);
      unlinked = true;
    } finally {
      if (storeId && !unlinked) {
        // Assertion failed mid-way: still try cancel-all → unlink so the
        // fixture chain doesn't keep an archived third member.
        const orders = await listOrders(owner.accessToken, storeId, {}).catch(
          () => ({ orders: [] })
        );
        for (const o of orders.orders)
          await cancelOrderRaw(owner.accessToken, o.id, {
            reason: "automation cleanup",
          }).catch(() => {});
        await adminUnlinkRestaurantFromChainRaw(
          admin.accessToken,
          chainGroupId!,
          storeId
        ).catch(() => {});
      }
      if (storeId)
        await deleteTestRestaurant(admin.accessToken, storeId).catch(() => {});
      // The ordered item can't be hard-deleted while its (cancelled) order
      // references it — best-effort; globalTeardown sweeps the group later.
      if (sharedGroupId) {
        const items = flattenMenuItems(
          (
            await getRestaurantMenusApi(readSharedState().chainLocationAId!, {
              accessToken: owner.accessToken,
            })
          ).menus
        ).filter((i) => i.name.startsWith(`Chain Live Item ${runId}`));
        for (const it of items)
          await permanentlyDeleteMenuItemApi(admin.accessToken, it.id).catch(
            () => {}
          );
        await deleteTestMenuGroup(owner.accessToken, sharedGroupId).catch(
          () => {}
        );
      }
    }
    expect(
      (await getOwnedChains(owner.accessToken)).find(
        (c) => c.groupId === chainGroupId
      )?.locationCount,
      "fixture chain back to 2 (cancel → unlink → archive)"
    ).toBe(2);
  });
});
