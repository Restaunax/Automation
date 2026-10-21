/**
 * 11-deal-item-choices.spec.ts — the choices made on an item INSIDE a deal
 * reach the order (template-wind).
 *
 * Production 2026-10-20: a web deal order reached the kitchen with the deal's
 * wings carrying the 20 PC upcharge but no modifiers, so the kitchen could not
 * tell the count. TC-369 / TC-371 (08-deals-handoff) only check the MONEY of a
 * deal slot's choice; this file checks the CHOICES: the page's /quote body
 * carries orderDeals[].items[].selectedModifiers (ids, nested parent) and the
 * paid order stores them as orderDealItems[].selectedModifiers by name.
 *
 * Own data: a per-run category on the seed restaurant with "Wind Wings"
 * (seedChoiceItem: Size 10 PC / 20 PC +4.99 with a nested free "Buffalo",
 * free "Ranch Dip") and fries, one AUTO deal (cap-safe, deleted in finally).
 * Places ONE real Stripe test-card order (as TC-371 does).
 *
 * The note typed in the item sheet's "Special Instructions" box (template-wind
 * #143, in ItemModal for the menu AND the deal builder) must ride along too.
 * The fill is unconditional: until #143 deploys to QA the box is absent and
 * the test fails there, on purpose.
 */

import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { createCustomerDealPage } from "../../pages/customer/CustomerDealPage";
import { createCustomerItemModal } from "../../pages/customer/CustomerItemModal";
import { createCustomerCheckoutPage } from "../../pages/customer/CustomerCheckoutPage";
import { createCustomerOrderConfirmationPage } from "../../pages/customer/CustomerOrderConfirmationPage";
import { STRIPE_CARDS } from "../../utils/stripeCards";
import {
  readSharedState,
  generateRunId,
  generateSeedPhone,
} from "../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
  setAvailability,
  createDealApiCapSafe,
  deleteDealApi,
  type ApiMenuItem,
  DEAL_SLOT_TEST_TIMEOUT_MS,
} from "../../utils/apiHelper";
import {
  SIZE_UPCHARGE,
  seedChoiceItem,
  expectSentChoices,
  expectStoredChoices,
  type ChoiceItem,
  type SentDealItem,
} from "../../utils/dealItemChoices";

const TEMPLATE_WIND_URL = process.env.TEMPLATE_WIND_URL ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Deals → the choices inside a deal reach the order (wind)", () => {
  test.skip(
    !TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD,
    "TEMPLATE_WIND_URL, OWNER_EMAIL and OWNER_PASSWORD must be set in .env"
  );

  const runId = generateRunId();
  const instruction = `extra crispy please ${runId}`;
  let restaurantId = "";
  let token = "";
  let adminToken = "";
  let groupId = "";
  let choices: ChoiceItem;
  let fries: ApiMenuItem;

  test.beforeAll(async () => {
    if (!TEMPLATE_WIND_URL || !OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readSharedState().restaurantId;
    token = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    if (ADMIN_EMAIL && ADMIN_PASSWORD)
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    groupId = (
      await createMenuGroupNamed(token, `Automation Deal Choices ${runId}`, {
        restaurantId,
      })
    ).id;
    choices = await seedChoiceItem(token, groupId, "Wind", runId);
    fries = await createMenuItemFull(
      token,
      groupId,
      `Wind Choice Fries ${runId}`,
      6.5,
      { description: "deal item choices: plain side" }
    );
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)
      .then((r) => r.accessToken)
      .catch(() => token);
    const items = [choices?.item, fries].filter(Boolean);
    // Best-effort cleanup; the category is named with the run id.
    for (const it of items)
      await setAvailability(t, it.id, false).catch(() => {});
    if (adminToken)
      for (const it of items)
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Deals → Storefront");
    await allure.label("severity", "critical");
  });

  test(
    "TC-906: the choices made on an item inside a deal (a paid size, a nested free sauce under it, a free dip) and the note on it are sent in the /quote and stored on the paid order — the deal upcharge is unchanged",
    { tag: ["@deal-item-choices"] },
    async ({ page }) => {
      // createDealApiCapSafe may wait for a free deal slot (CAP_WAIT_MS).
      test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS);
      await allure.description(
        "Wings + fries @ $14. In the deal builder the wings are customised: Size '20 PC' (+$4.99, " +
          "ADJUSTS_PRICE), then 'Buffalo' in the nested Wing Sauce group that 20 PC opens, then the free " +
          "'Ranch Dip', and a note in the item sheet's Special Instructions box (template-wind #143). The " +
          "checkout's /quote body must carry orderDeals[0].items[<wings>].selectedModifiers with all three " +
          "modifierIds, Buffalo's parentModifierId = 20 PC, and specialInstructions = the note; the server prices the deal at " +
          "upcharge 4.99 / lineTotal 18.99 (pricing unchanged). Paid with the Stripe test card, the owner " +
          "read (GET /api/order/:id) must show orderDealItems[<wings>].selectedModifiers naming all three, " +
          "Buffalo with its parentModifierId, and specialInstructions = the note. Fails on QA until " +
          "template-wind #143 (the note box — until then the box is not found), the template-wind " +
          "deal-item-modifiers fix and the backend deal-item fixes deploy."
      );
      test.info().annotations.push({
        type: "note",
        description:
          "The Special Instructions box in wind's item sheet ships with template-wind #143; until it is on QA this test fails at the box (not found).",
      });
      const deals = createCustomerDealPage(page);
      const modal = createCustomerItemModal(page);
      const checkout = createCustomerCheckoutPage(page);
      const confirmation = createCustomerOrderConfirmationPage(page);
      const deal = await createDealApiCapSafe(
        token,
        restaurantId,
        `AUTO Deal Choices ${runId}`,
        14,
        [
          { id: choices.item.id, name: choices.item.name, price: 10 },
          { id: fries.id, name: fries.name, price: 6.5 },
        ]
      );
      try {
        await allure.step(
          "Customise the wings inside the deal: 20 PC → Buffalo → Ranch Dip + a note",
          async () => {
            await deals.gotoBuilder(restaurantId, deal.id);
            await expect(deals.builderHeading(deal.name)).toBeVisible({
              timeout: 20_000,
            });
            await deals.openIncompleteSlot(choices.item.name);
            await modal.selectOption(choices.size.name);
            // The nested group appears only once its parent is chosen.
            await modal.selectOption(choices.sauce.name);
            await modal.selectOption(choices.dip.name);
            for (const name of [
              choices.size.name,
              choices.sauce.name,
              choices.dip.name,
            ])
              await modal.assertOptionChecked(name);
            // Unconditional: fails here until template-wind #143 is on QA.
            await expect(
              modal.specialInstructions(),
              "the item sheet's Special Instructions box (template-wind #143)"
            ).toBeVisible({ timeout: 10_000 });
            await modal.specialInstructions().fill(instruction);
            await deals.clickAddToDeal();
            await expect(
              deals
                .fixedSteps(choices.item.name)
                .getByTestId("deal-step-options")
            ).toContainText(choices.size.name);
            await deals.completeFixedSteps();
            await deals.assertDealComplete();
            await deals.addDealToCart();
          }
        );

        await allure.step(
          "Checkout /quote: priced as before, and the choices are sent",
          async () => {
            const [quoteRes] = await Promise.all([
              page.waitForResponse(
                (r) =>
                  /\/api\/order\/[^/]+\/quote$/.test(r.url()) &&
                  r.request().method() === "POST" &&
                  r.status() === 200 &&
                  (
                    (
                      r.request().postDataJSON() as {
                        orderDeals?: { dealId: string }[];
                      } | null
                    )?.orderDeals ?? []
                  ).some((d) => d.dealId === deal.id),
                { timeout: 30_000 }
              ),
              deals.viewCartButton().click(),
            ]);
            await expect(page).toHaveURL(/\/checkout/, { timeout: 15_000 });
            const quote = (await quoteRes.json()) as {
              quote?: {
                deals?: {
                  dealPrice: number;
                  upcharge: number;
                  lineTotal: number;
                }[];
              };
            };
            // Pricing is unchanged by the fix: the size's +4.99 is the upcharge.
            expect(quote.quote?.deals?.[0]).toMatchObject({
              dealPrice: 14,
              upcharge: SIZE_UPCHARGE,
              lineTotal: 18.99,
            });
            const req = quoteRes.request().postDataJSON() as {
              orderDeals: { dealId: string; items: SentDealItem[] }[];
            };
            const sent = req.orderDeals
              .find((d) => d.dealId === deal.id)!
              .items.find((i) => i.menuItemId === choices.item.id);
            expect(sent, JSON.stringify(req.orderDeals)).toBeTruthy();
            expectSentChoices(sent, choices, instruction);
          }
        );

        await allure.step("Pay with the Stripe test card", async () => {
          await checkout.assertFormVisible();
          await checkout.fillCustomerInfo(
            "Choices",
            "Tester",
            `choices-${runId}@restaunax-test.com`,
            generateSeedPhone()
          );
          await checkout.selectPickup();
          await checkout.clickProceedToPayment();
          await checkout.assertPaymentSectionVisible();
          await checkout.fillStripeCard(STRIPE_CARDS.VISA_SUCCESS);
          await checkout.completeOrder();
          await confirmation.assertConfirmed();
        });

        const orderId =
          page.url().match(/order-confirmation\/([0-9a-f-]{36})/)?.[1] ?? "";
        expect(orderId, `order id from ${page.url()}`).toBeTruthy();
        await allure.parameter("orderId", orderId);

        await allure.step(
          "The paid order stores the choices and the note on the deal item (owner read)",
          async () => {
            await expectStoredChoices(
              token,
              orderId,
              deal.id,
              choices,
              instruction
            );
          }
        );
      } finally {
        // Free the shared seed restaurant's cap slot right away.
        await deleteDealApi(token, deal.id).catch(() => {}); // AUTO sweep backstops
      }
    }
  );
});
