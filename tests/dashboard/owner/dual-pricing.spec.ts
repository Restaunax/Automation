/**
 * dual-pricing.spec.ts — Dashboard side of dual pricing v2 (owner + admin UI).
 * Backend restaunax #683 + dashboard #684 are on QA. The API contract is
 * covered in tests/pos/09-dual-pricing.spec.ts (TC-484..493); this file pins
 * the two UI surfaces:
 *   - owner  Store Settings → Order Settings: the "Dual Pricing" toggle is
 *     gated on an admin-set card markup, and the Convert-menu dialog PREVIEWS
 *     the CR/CA table (never confirmed here — the conversion is a one-way
 *     stamp on the shared QA restaurant, so the destructive button is only
 *     asserted disabled behind its acknowledge checkbox);
 *   - admin  Restaurant Management → Edit → Update Restaurant Info: the
 *     Basic Information tab carries the enrollment switch, the markup field
 *     and the convert / price-list actions.
 *
 * Runs on the shared QA restaurant. Every flag it flips is snapshotted first
 * and restored in `finally`, in an order the server's invariants accept
 * (owner toggle OFF → admin fields → owner toggle back to its original).
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createOwnerRestaurantManagementPage } from "../../../pages/dashboard/owner/OwnerRestaurantManagementPage";
import { createOwnerOrderSettingsPage } from "../../../pages/dashboard/owner/OwnerOrderSettingsPage";
import { createAdminRestaurantsPage } from "../../../pages/dashboard/admin/AdminRestaurantsPage";
import { readSharedState } from "../../../utils/testData";
import {
  apiLogin,
  getRestaurantSettingsRaw,
  updateRestaurantSettingsApi,
} from "../../../utils/apiHelper";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

interface DualPricingSnapshot {
  dualPricingEligible: boolean;
  dualPricingEnabled: boolean;
  dualPricingCardMarkup: number | null;
  passProcessingFeeToCustomer: boolean;
  dualPricingMenuConvertedAt: string | null;
}

const snapshot = async (
  token: string,
  restaurantId: string
): Promise<DualPricingSnapshot> => {
  const res = await getRestaurantSettingsRaw(token, restaurantId);
  const s = (res.data?.data ?? res.data) as Record<string, unknown>;
  return {
    dualPricingEligible: Boolean(s.dualPricingEligible),
    dualPricingEnabled: Boolean(s.dualPricingEnabled),
    dualPricingCardMarkup:
      typeof s.dualPricingCardMarkup === "number"
        ? s.dualPricingCardMarkup
        : null,
    passProcessingFeeToCustomer: Boolean(s.passProcessingFeeToCustomer),
    dualPricingMenuConvertedAt:
      typeof s.dualPricingMenuConvertedAt === "string"
        ? s.dualPricingMenuConvertedAt
        : null,
  };
};

/** Put the shared restaurant back exactly as found, respecting the server's
 *  invariants: the owner toggle must be off before the markup can be cleared
 *  or enrollment removed, and can only go back on once both are restored. */
const restore = async (
  admin: string,
  owner: string,
  restaurantId: string,
  orig: DualPricingSnapshot
) => {
  await updateRestaurantSettingsApi(owner, restaurantId, {
    dualPricingEnabled: false,
  }).catch(() => {});
  await updateRestaurantSettingsApi(admin, restaurantId, {
    dualPricingEligible: orig.dualPricingEligible,
    dualPricingCardMarkup: orig.dualPricingCardMarkup,
    passProcessingFeeToCustomer: orig.passProcessingFeeToCustomer,
  }).catch(() => {});
  if (orig.dualPricingEnabled) {
    await updateRestaurantSettingsApi(owner, restaurantId, {
      dualPricingEnabled: true,
    }).catch(() => {});
  }
};

test.describe("Dashboard — Dual pricing v2", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD || !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "OWNER + ADMIN creds must be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Dual Pricing");
    await allure.label("severity", "critical");
  });

  test("TC-494: the owner's Dual Pricing toggle is disabled until an admin sets the card markup; the Convert menu dialog previews the CR/CA table", async ({
    ownerPage,
  }) => {
    await allure.description(
      "Admin enrolls the shared restaurant WITHOUT a markup → Order Settings shows the toggle " +
        "disabled with the 'contact RestauNax' warning and both actions disabled. Admin sets " +
        "3.5% → after reload the toggle is offered, the markup summary reads 3.5%, and " +
        "'Convert menu…' opens a preview whose table carries From (cash) / To (card) columns " +
        "and whose confirm stays disabled behind the acknowledge checkbox (never ticked). " +
        "If the shared menu was converted in an earlier run the button is disabled and the " +
        "'Menu converted on' caption is asserted instead. Everything is restored in finally."
    );
    const { restaurantId } = readSharedState();
    const owner = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    const admin = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const orig = await snapshot(admin, restaurantId);

    const mgmt = createOwnerRestaurantManagementPage(ownerPage);
    const orderSettings = createOwnerOrderSettingsPage(ownerPage);

    try {
      await allure.step("API: enroll without a markup", async () => {
        await updateRestaurantSettingsApi(owner, restaurantId, {
          dualPricingEnabled: false,
        });
        await updateRestaurantSettingsApi(admin, restaurantId, {
          passProcessingFeeToCustomer: false,
          dualPricingEligible: true,
          dualPricingCardMarkup: null,
        });
      });

      await allure.step("Owner: Store Settings → Order Settings", async () => {
        await mgmt.goto(restaurantId);
        await orderSettings.navigateToOrderSettings();
        await orderSettings.assertDualPricingBlockVisible();
      });

      await allure.step("Toggle is gated on the missing markup", async () => {
        await orderSettings.assertToggleGatedOnMarkup();
      });

      await allure.step("API: admin sets the card markup to 3.5%", async () => {
        await updateRestaurantSettingsApi(admin, restaurantId, {
          dualPricingCardMarkup: 0.035,
        });
      });

      await allure.step("Owner: reload — toggle is now offered", async () => {
        await mgmt.goto(restaurantId);
        await orderSettings.navigateToOrderSettings();
        await orderSettings.assertToggleOfferedAt("3.5");
        await expect(orderSettings.dualPricingSwitch()).not.toBeChecked();
      });

      if (orig.dualPricingMenuConvertedAt) {
        await allure.step(
          "Menu already converted on QA — the action is retired",
          async () => {
            await expect(orderSettings.convertButton()).toBeDisabled();
            await expect(orderSettings.convertedCaption()).toBeVisible();
          }
        );
      } else {
        await allure.step(
          "Convert menu… previews the CR/CA table (never confirmed)",
          async () => {
            await orderSettings.openConversionPreview();
            await orderSettings.assertConversionPreviewRendered();
            await orderSettings.closeConversionDialog();
          }
        );
      }

      await allure.step("Price list / signage opens read-only", async () => {
        await orderSettings.openPriceList();
        await expect(
          ownerPage.getByRole("dialog").getByText(/3\.5%/).first()
        ).toBeVisible({ timeout: 20_000 });
        await orderSettings.closePriceList();
      });
    } finally {
      await restore(admin, owner, restaurantId, orig);
    }
  });

  test("TC-496: admin Update Restaurant Info carries the dual-pricing enrollment switch, card markup field and menu actions", async ({
    adminPage,
  }) => {
    await allure.description(
      "Restaurant Management → row kebab → Edit → Update Restaurant Info → Basic Information: " +
        "the 'Dual pricing eligible' switch, the #dual-pricing-card-markup field (with the " +
        "'legal in every US state' note), 'Convert menu…' and 'Price list / signage' render. " +
        "Read-only — nothing is toggled or saved on the shared restaurant."
    );
    const { restaurantName } = readSharedState();
    const adminRestaurants = createAdminRestaurantsPage(adminPage);

    await allure.step("Open Restaurant Management", async () => {
      await adminRestaurants.goto();
    });

    await allure.step(
      `Open Update Restaurant Info for "${restaurantName}"`,
      async () => {
        await adminRestaurants.openUpdateRestaurantInfo(restaurantName);
      }
    );

    await allure.step("Dual-pricing admin controls render", async () => {
      await adminRestaurants.assertDualPricingAdminControlsVisible();
      await allure.parameter(
        "markup field value",
        await adminRestaurants.cardMarkupInput().inputValue()
      );
    });
  });
});
