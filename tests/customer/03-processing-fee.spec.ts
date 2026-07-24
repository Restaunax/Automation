import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { readSharedState, readRestaurantId } from "../../utils/testData";
import { apiLogin, setPassProcessingFee } from "../../utils/apiHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Customer — Processing fee pass-through", () => {
  // Same gate as the rest of tests/customer: needs a real wind deployment and
  // owner creds (to flip the restaurant's setting server-side). Self-skips on a
  // local run where these aren't set.
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL, and OWNER_PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-222: enabling the processing fee adds a Processing Fee line and raises the wind checkout total", async ({
    page,
  }) => {
    await allure.description(
      "The owner turns ON pass-processing-fee for the restaurant (server-side). " +
        "The template-wind checkout order summary then shows a server-authoritative " +
        "'Processing Fee' line and the quoted Total rises above the fee-OFF baseline. " +
        "Proves the flag → /quote → customer display round-trip end-to-end. The fee is " +
        "always restored to OFF in a finally (shared QA restaurant)."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    // Owner token — used only to flip the restaurant's setting via the API.
    const { accessToken } = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD);
    await allure.parameter("restaurantId", restaurantId);

    try {
      // ── Baseline: fee OFF ────────────────────────────────────────────────
      await setPassProcessingFee(accessToken, restaurantId, false);
      await checkoutPage.seedCart(
        restaurantId,
        menuItemId,
        menuItemName,
        menuItemPrice
      );

      let baseTotal = 0;
      await allure.step(
        "Read the fee-OFF baseline total — no Processing Fee line",
        async () => {
          await expect
            .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
            .toBeGreaterThan(0);
          baseTotal = await checkoutPage.readOrderTotal();
          await checkoutPage.assertNoProcessingFee();
          await allure.parameter("Total (fee OFF)", `$${baseTotal.toFixed(2)}`);
        }
      );

      // ── Owner turns the fee ON ───────────────────────────────────────────
      await allure.step(
        "Owner enables pass-processing-fee for the restaurant",
        async () => {
          await setPassProcessingFee(accessToken, restaurantId, true);
        }
      );

      // ── Verify on wind: Processing Fee line appears + total rises ─────────
      await allure.step(
        "Reload checkout — a Processing Fee line appears and the total rises",
        async () => {
          // The cart is re-seeded by addInitScript on reload; the checkout then
          // re-quotes against the restaurant's now-updated setting.
          await page.reload({ waitUntil: "domcontentloaded" });
          await checkoutPage.assertProcessingFeeVisible();
          await expect
            .poll(() => checkoutPage.readOrderTotal(), { timeout: 20_000 })
            .toBeGreaterThan(baseTotal);
          const withFee = await checkoutPage.readOrderTotal();
          await allure.parameter("Total (fee ON)", `$${withFee.toFixed(2)}`);
          expect(withFee).toBeGreaterThan(baseTotal);
        }
      );
    } finally {
      // Always restore the restaurant to fee-OFF, even if an assertion failed —
      // this is a shared QA restaurant and the fee changes real order totals.
      await setPassProcessingFee(accessToken, restaurantId, false).catch(
        () => {}
      );
    }
  });
});
