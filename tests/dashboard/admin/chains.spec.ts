import * as allure from "allure-js-commons";
import { test } from "../../../fixtures/base";
import { createAdminChainsPage } from "../../../pages/dashboard/admin/AdminChainsPage";
import {
  apiLogin,
  createRestaurantRaw,
  createTestMenuGroup,
  createTestMenuItem,
  deleteTestRestaurant,
  findUserIdByEmail,
  assignRestaurantToUserApi,
} from "../../../utils/apiHelper";
import { generateRunId } from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";

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
});
