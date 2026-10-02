import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { readSharedState, readRestaurantId } from "../../utils/testData";
import { apiLogin, setPassProcessingFee } from "../../utils/apiHelper";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Customer — Processing fee pass-through", () => {
  // Same gate as the rest of tests/customer: needs a real wind deployment.
  // The pass-through is a company-ADMIN switch since backend ecd99c9d2
  // (2026-08-28) — we are the merchant of record, so the surcharge is ours —
  // so flipping it needs admin creds; the owner token pins that it can't.
  test.skip(
    !TEMPLATE_WIND_URL ||
      !OWNER_EMAIL ||
      !OWNER_PASSWORD ||
      !ADMIN_EMAIL ||
      !ADMIN_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL/PASSWORD, and ADMIN_EMAIL/PASSWORD must all be set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Customer Ordering");
    await allure.label("severity", "critical");
  });

  test("TC-222: enabling the processing fee adds a Processing Fee line and raises the wind checkout total", async ({
    page,
  }) => {
    await allure.description(
      "A company admin turns ON pass-processing-fee for the restaurant (server-side; an " +
        "owner's attempt to switch it on is ignored — checked first). The template-wind " +
        "checkout order summary then shows a server-authoritative 'Processing Fee (credit " +
        "cards)' line and the quoted Total rises above the fee-OFF baseline. Proves the " +
        "flag → /quote → customer display round-trip end-to-end. The fee is always " +
        "restored to OFF in a finally (shared QA restaurant)."
    );

    const restaurantId = readRestaurantId();
    const { menuItemId, menuItemName, menuItemPrice } = readSharedState();
    const checkoutPage = createCustomerCheckoutPage(page);

    // Tokens are used only to flip the restaurant's setting via the API.
    const { accessToken: adminToken } = await apiLogin(
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const { accessToken: ownerToken } = await apiLogin(
      OWNER_EMAIL,
      OWNER_PASSWORD
    );
    await allure.parameter("restaurantId", restaurantId);

    try {
      // ── Baseline: fee OFF — and an owner can't switch it on ──────────────
      await setPassProcessingFee(adminToken, restaurantId, false);
      // Silently stripped server-side (200, nothing changed): the baseline
      // below must still show no fee line.
      await setPassProcessingFee(ownerToken, restaurantId, true);
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

      // ── Company admin turns the fee ON ───────────────────────────────────
      await allure.step(
        "Company admin enables pass-processing-fee for the restaurant",
        async () => {
          await setPassProcessingFee(adminToken, restaurantId, true);
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
      await setPassProcessingFee(adminToken, restaurantId, false).catch(
        () => {}
      );
    }
  });
});
