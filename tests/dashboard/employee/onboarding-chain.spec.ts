import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerCreateRestaurantPage } from "../../../pages/dashboard/owner/OwnerCreateRestaurantPage";
import { createOwnerMenuPage } from "../../../pages/dashboard/owner/OwnerMenuPage";
import { createSignUpPage } from "../../../pages/dashboard/auth/SignUpPage";
import { createOwnerRestaurantListPage } from "../../../pages/dashboard/owner/OwnerRestaurantListPage";
import { createOwnerPublishPage } from "../../../pages/dashboard/owner/OwnerPublishPage";
import {
  apiLogin,
  deleteTestRestaurant,
  deleteUserByEmail,
  findUserIdByEmail,
  assignRestaurantToUserApi,
  getRestaurantMenusApi,
  createMenuItemFull,
} from "../../../utils/apiHelper";
import { generateRunId, generateUserEmail } from "../../../utils/testData";
import { loginViaUi } from "../../../utils/auth";

const EMPLOYEE_EMAIL = process.env.EMPLOYEE_EMAIL ?? "";
const EMPLOYEE_PASSWORD = process.env.EMPLOYEE_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/**
 * Full onboarding chain — the real production journey from a fresh sign-up
 * to a live-in-the-dashboard owned restaurant, confirmed by reading the
 * actual permission model and controllers (not assumed): a plain sign-up
 * only ever reaches Role.USER (registerController.ts); OWNER never holds
 * CREATE_RESTAURANT (allPermissions.ts's rolePermissions map) so restaurant
 * creation is always employee/admin-driven; a newly created restaurant has
 * NO owner (`owner: undefined` in restaurantController.ts's create call).
 *
 * The ownership-assignment step (`POST /api/user-restaurants/assign-restaurant`,
 * which also promotes USER→OWNER — see assignRestaurantToUser in
 * userRestaurantController.ts) is done via API here, NOT the dashboard UI —
 * confirmed by direct source read that there is currently no reachable UI
 * for it: the only components referencing this endpoint
 * (UserRestaurantList.tsx, AssignRestaurantDialog.tsx) are dead code
 * (imported nowhere), the "Restaurants" tab that would host an assign
 * action is never rendered for Role.USER in the first place
 * (UserDetailsModal.tsx's ROLE_CONFIG only grants it to OWNER/EMPLOYEE), and
 * the dead code's own "invite a new owner" link points at
 * /admin/invite-restaurant-owner, a route that doesn't exist in the router.
 * This is arguably the real root cause behind "onboarding has a huge gap" —
 * see TEST_COVERAGE.md's Known Technical Debt and the product-fix write-up.
 *
 * Reaches the Publish checklist but stops short of actually publishing: the
 * checklist requires Payment Processing (Stripe Connect), which is out of
 * scope for this chain (see TEST_COVERAGE.md) and has no API shortcut to
 * fake. Instead this asserts the checklist honestly reflects that partial
 * state — Hours/Menu/Restaurant Info satisfied, Payment Processing not, and
 * the Publish button correctly disabled as a result.
 *
 * Previously these were four disconnected fragments across different spec
 * files (TC-93 sign-up, TC-97 restaurant creation, ad hoc menu/hours
 * coverage) with nothing proving they chain into one real journey.
 */
test.describe("Onboarding — Full chain", () => {
  test.skip(
    !EMPLOYEE_EMAIL || !EMPLOYEE_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "EMPLOYEE_EMAIL/PASSWORD and ADMIN_EMAIL/PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Onboarding Chain");
    await allure.label("severity", "critical");
  });

  test("TC-182: sign-up → employee creates and sets up a restaurant → admin assigns it → the new owner sees it live", async ({
    page,
    browser,
    employeePage,
  }) => {
    await allure.description(
      "Chains the real production onboarding journey end to end: a visitor signs up (Role.USER), an " +
        "employee creates a restaurant on their behalf and sets its hours and a menu item, an admin " +
        "assigns the (until-then-unowned) restaurant to that user via the API (promoting them to " +
        "OWNER — no dashboard UI currently reaches this action, see the comment above), and the new " +
        "owner logs in and sees their restaurant in My Restaurants."
    );

    const runId = generateRunId();
    const ownerEmail = generateUserEmail("onboard");
    const ownerPassword = "TestPass123!";
    const restaurantName = `AUTO Employee Onboarding ${runId}`;
    const categoryName = `AUTO Onboarding Category ${runId}`;
    let restaurantId = "";

    try {
      await allure.step("Visitor signs up (becomes Role.USER)", async () => {
        const signUpPage = createSignUpPage(page);
        await signUpPage.fillAndSubmit({
          firstName: "Onboard",
          lastName: "Owner",
          email: ownerEmail,
          password: ownerPassword,
          confirmPassword: ownerPassword,
        });
        await signUpPage.waitForSuccess();
        await allure.parameter("New owner email", ownerEmail);
      });

      const createPage = createOwnerCreateRestaurantPage(employeePage);

      await allure.step(
        "Employee creates the restaurant (Step 0 — unowned)",
        async () => {
          await createPage.goto();
          await createPage.fillStep0({
            name: restaurantName,
            addressSearch: "350 5th Ave, New York",
            addressSuggestionText: "350 5th Ave, New York, NY, USA",
            cuisineType: "Italian",
            phone: "(555) 123-4567",
            description: "Created by the onboarding-chain automation test",
          });
          restaurantId = await createPage.submitStep0();
          await createPage.assertBusinessHoursStepVisible();
          await allure.parameter("restaurantId", restaurantId);
        }
      );

      await allure.step(
        "Employee sets Business Hours (Step 1 → advances to Menu)",
        async () => {
          await createPage.setDayOpen("monday");
          await createPage.setDayOpen("tuesday");
          await createPage.setDayOpen("wednesday");
          await createPage.setDayOpen("thursday");
          await createPage.setDayOpen("friday");
          await createPage.submitHours();
          await createPage.assertMenuStepVisible();
        }
      );

      await allure.step("Employee adds a menu category (Step 2)", async () => {
        const menuPage = createOwnerMenuPage(employeePage);
        await menuPage.createCategory(categoryName);
        await menuPage.assertCategoryVisible(categoryName);
      });

      await allure.step(
        "Employee adds an item to that category — Menu Setup needs a group WITH items",
        async () => {
          // The publish checklist's menu rule (onboardingChecklistService.ts:
          // "at least one menu group with menu items") is not met by an empty
          // category. The item is added over the API with the EMPLOYEE's own
          // token — the add-item UI is covered by the owner menu suite.
          const { accessToken: employeeToken } = await apiLogin(
            EMPLOYEE_EMAIL,
            EMPLOYEE_PASSWORD
          );
          const { menus } = await getRestaurantMenusApi(restaurantId, {
            accessToken: employeeToken,
          });
          const group = menus
            .flatMap((m) => m.groups)
            .find((g) => g.name === categoryName);
          expect(group, `category "${categoryName}" in the menu`).toBeTruthy();
          await createMenuItemFull(
            employeeToken,
            (group as { id: string }).id,
            `AUTO Onboarding Item ${runId}`,
            9.99
          );
        }
      );

      await allure.step(
        "Employee reaches the Publish checklist — Hours/Menu/Info satisfied, Payment Processing is not, Publish is blocked",
        async () => {
          const publishPage = createOwnerPublishPage(employeePage);
          await publishPage.goto(restaurantId);
          await publishPage.assertItemComplete("Hours of Operation");
          await publishPage.assertItemComplete("Menu Setup");
          await publishPage.assertItemComplete("Restaurant Information");
          await publishPage.assertItemIncomplete("Payment Processing");
          await publishPage.assertPublishButtonDisabled();
        }
      );

      await allure.step(
        "Admin assigns the still-unowned restaurant to the new user (via API — no UI path exists)",
        async () => {
          const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
          const userId = await findUserIdByEmail(accessToken, ownerEmail);
          expect(userId).toBeTruthy();
          await assignRestaurantToUserApi(
            accessToken,
            userId as string,
            restaurantId
          );
        }
      );

      await allure.step(
        "The new owner signs in and sees the restaurant in My Restaurants",
        async () => {
          // A FRESH sign-in, in its own context. The sign-up session was
          // minted while the account was still Role.USER (no permissions);
          // reusing it after the USER→OWNER promotion was flaky — sometimes
          // /restaurant/stores rendered "Access Denied — Current Role: OWNER"
          // because the cached permission list was still the USER one. The
          // real journey is the new owner signing in once assigned.
          const session = await loginViaUi(browser, ownerEmail, ownerPassword);
          try {
            const listPage = createOwnerRestaurantListPage(session.page);
            await listPage.goto();
            await listPage.assertCardVisible(restaurantName);
          } finally {
            await session.context.close();
          }
        }
      );
    } finally {
      // Best-effort, guarded: cleanup failures must not mask the real result,
      // but must be loud — a leaked restaurant/user accumulates in QA.
      if (ADMIN_EMAIL && ADMIN_PASSWORD) {
        try {
          const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
          if (restaurantId) {
            const removal = await deleteTestRestaurant(
              accessToken,
              restaurantId
            );
            console.log(
              `[onboarding-chain] restaurant ${restaurantId} ${removal}`
            );
          }
          await deleteUserByEmail(accessToken, ownerEmail);
        } catch (err) {
          console.warn(
            `[onboarding-chain] Cleanup failed for restaurant ${restaurantId} / user ${ownerEmail} — clean up manually:`,
            err
          );
        }
      } else {
        console.warn(
          `[onboarding-chain] ADMIN_EMAIL/PASSWORD not set — restaurant ${restaurantId} / user ${ownerEmail} left behind in QA`
        );
      }
    }
  });
});
