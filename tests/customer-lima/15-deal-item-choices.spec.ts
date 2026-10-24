import * as allure from "allure-js-commons";

import { test, expect } from "../../fixtures/base";
import { createLimaCheckoutPage } from "../../pages/lima/LimaCheckoutPage";
import { createLimaDealPage } from "../../pages/lima/LimaDealPage";
import { createLimaStorefrontPage } from "../../pages/lima/LimaStorefrontPage";
import { STRIPE_CARDS } from "../../utils/stripeCards";
import { fillStripePaymentElement } from "../../utils/stripeHelper";
import {
  generateRunId,
  generateSeedPhone,
  generateUserEmail,
  readRestaurantSlug,
  readSharedState,
} from "../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  permanentlyDeleteMenuItemApi,
  deleteTestMenuGroup,
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

/**
 * The choices made on an item INSIDE a deal reach the order (template-lima).
 *
 * Production 2026-10-20: web deal orders reached the kitchen with every deal
 * item's modifiers empty (the customer paid for 20 PC wings; the ticket could
 * not say so). This checks the CHOICES — and the note typed on the item — not
 * just the money: the page's /quote body carries
 * orderDeals[].items[].selectedModifiers (+ parentModifierId for a nested pick)
 * and specialInstructions, and the paid order stores them on
 * orderDealItems[]. Lima's item sheet has a "Special Instructions" box in the
 * deal builder too (ModifierGroups → TextFieldArea).
 *
 * Own data: a per-run category on the seed restaurant (seedChoiceItem wings +
 * a plain soup), one AUTO deal (cap-safe, deleted in finally). Places ONE real
 * Stripe test-card order (as TC-L40 does).
 */
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

test.describe("Lima — the choices inside a deal reach the order", () => {
  const restaurantSlug = readRestaurantSlug();
  test.skip(
    !restaurantSlug || !OWNER_EMAIL || !OWNER_PASSWORD,
    "Ordering slug not seeded, or OWNER creds missing"
  );

  const runId = generateRunId();
  const instruction = `extra crispy please ${runId}`;
  let restaurantId = "";
  let token = "";
  let adminToken = "";
  let groupId = "";
  let choices: ChoiceItem;
  let soup: ApiMenuItem;

  test.beforeAll(async () => {
    if (!restaurantSlug || !OWNER_EMAIL || !OWNER_PASSWORD) return;
    restaurantId = readSharedState().restaurantId;
    token = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    if (ADMIN_EMAIL && ADMIN_PASSWORD)
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    groupId = (
      await createMenuGroupNamed(
        token,
        `Automation Lima Deal Choices ${runId}`,
        { restaurantId }
      )
    ).id;
    choices = await seedChoiceItem(token, groupId, "Lima", runId);
    soup = await createMenuItemFull(
      token,
      groupId,
      `Lima Choice Soup ${runId}`,
      5,
      { description: "deal item choices: plain side" }
    );
  });

  test.afterAll(async () => {
    if (!token) return;
    const t = await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)
      .then((r) => r.accessToken)
      .catch(() => token);
    // Best-effort cleanup; the category is named with the run id.
    if (adminToken)
      for (const it of [choices?.item, soup].filter(Boolean))
        await permanentlyDeleteMenuItemApi(adminToken, it.id).catch(() => {});
    if (groupId) await deleteTestMenuGroup(t, groupId).catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Embedded Ordering — Deals");
    await allure.label("severity", "critical");
  });

  test(
    "TC-907: Lima — the choices and the note on an item inside a deal (a paid size, a nested free sauce under it, a free dip, special instructions) are sent in the /quote and stored on the paid order — the deal upcharge is unchanged",
    { tag: ["@deal-item-choices"] },
    async ({ page }) => {
      // createDealApiCapSafe may wait for a free deal slot (CAP_WAIT_MS).
      test.setTimeout(DEAL_SLOT_TEST_TIMEOUT_MS);
      await allure.description(
        "Wings + soup @ $12. In the Lima deal builder the wings are customised: Size '20 PC' (+$4.99), " +
          "'Buffalo' in the nested Wing Sauce group 20 PC opens, the free 'Ranch Dip', and a note in the " +
          "item sheet's Special Instructions box. The checkout's /quote body must carry " +
          "orderDeals[0].items[<wings>].selectedModifiers with all three modifierIds (Buffalo with " +
          "parentModifierId = 20 PC) and specialInstructions = the note; the server prices the deal at " +
          "upcharge 4.99 / lineTotal 16.99 (unchanged). Paid with the Stripe test card, the owner read " +
          "(GET /api/order/:id) must show orderDealItems[<wings>] naming all three choices and carrying the " +
          "note. Fails on QA until the template-lima + backend deal-item fixes deploy."
      );
      const lima = createLimaStorefrontPage(page);
      const deals = createLimaDealPage(page);
      const checkout = createLimaCheckoutPage(page);
      const deal = await createDealApiCapSafe(
        token,
        restaurantId,
        `AUTO Lima Deal Choices ${runId}`,
        12,
        [
          { id: choices.item.id, name: choices.item.name, price: 10 },
          { id: soup.id, name: soup.name, price: 5 },
        ]
      );
      try {
        await allure.step(
          "Customise the wings inside the deal: 20 PC → Buffalo → Ranch Dip + a note",
          async () => {
            await deals.gotoBuilder(restaurantSlug, deal.id);
            await expect(deals.builderHeading(deal.name)).toBeVisible({
              timeout: 20_000,
            });
            await deals.openIncompleteSlot(choices.item.name);
            await lima.modifierOption(choices.size.name).check();
            // The nested group appears only once its parent is chosen.
            await lima.modifierOption(choices.sauce.name).check();
            await lima.modifierOption(choices.dip.name).check();
            for (const name of [
              choices.size.name,
              choices.sauce.name,
              choices.dip.name,
            ])
              await expect(lima.modifierOption(name)).toBeChecked();
            const note = page
              .getByRole("dialog")
              .getByRole("textbox", { name: "Special Instructions" });
            await expect(note).toBeVisible();
            await note.fill(instruction);
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
          "Checkout /quote: priced as before, and the choices + note are sent",
          async () => {
            await deals.viewCartButton().click();
            await expect(page).toHaveURL(
              new RegExp(`/${restaurantSlug}/cart`),
              { timeout: 15_000 }
            );
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
              checkout.goToCheckout(),
            ]);
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
              dealPrice: 12,
              upcharge: SIZE_UPCHARGE,
              lineTotal: 16.99,
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
          await checkout.assertPickupSelected();
          await checkout.fillCustomerInfo({
            firstName: "Auto",
            lastName: "LimaChoices",
            email: generateUserEmail("limachoices"),
            phone: generateSeedPhone(),
          });
          await checkout.proceedToPayment();
          await fillStripePaymentElement(page, STRIPE_CARDS.VISA_SUCCESS);
          await checkout.placeOrderAndConfirm();
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
