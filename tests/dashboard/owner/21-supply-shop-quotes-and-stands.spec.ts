/**
 * 21-supply-shop-quotes-and-stands.spec.ts — Owner → Print Shop (TC-1014..1021).
 *
 * Two things a restaurant owner meets in the Print Shop since RestauNax
 * #1075/#1097/#1100:
 *
 *   - Every active product is listed. One we have not launched shows no price
 *     and a single "Request a quote" button: one click, no form, and HQ gets
 *     the request (and an email). The button sits wholly inside its card.
 *   - "Card in a clear stand" comes with its stands. The owner picks the
 *     format; the server adds the stands, one per card, as a linked line the
 *     owner cannot change or remove on its own. Cards and stands are placed,
 *     removed and cancelled together.
 *
 * Own tenant (always fresh, so it never shares a cart with 20-supply-shop's
 * OWNER2), with SUPPLY_SHOP granted and an ordering slug (table cards print
 * the ordering link) before the first navigation. Serial: the cart threads
 * through the file. Orders placed here are cancelled in TC-1021 and again in
 * afterAll; nothing is ever charged (the Print Shop charges at fulfilment).
 */
import * as allure from "allure-js-commons";

import { test, expect } from "../../../fixtures/base";
import {
  createOwnerSupplyCartPage,
  type OwnerSupplyCartPage,
} from "../../../pages/dashboard/owner/OwnerSupplyCartPage";
import {
  apiLogin,
  cancelSupplyOrderOwnerRaw,
  createSecondOwner,
  deleteFeatureOverrideAdminRaw,
  deleteTestRestaurant,
  ensureOrderingSlug,
  getSupplyCatalogOwnerRaw,
  listAdminSupplyOrdersRaw,
  listSupplyOrdersOwnerRaw,
  setFeatureOverrideAdminRaw,
  type SupplyCatalogProduct,
} from "../../../utils/apiHelper";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import { waitForEmail } from "../../../utils/emailHelper";
import { requireRelease } from "../../../utils/releaseGate";
import {
  addSameTableCardsToCartRaw,
  checkoutSupplyCartRaw,
  deleteSupplyCartItemRaw,
  emptySupplyCart,
  getSupplyCartRaw,
  handleQuoteRequestsFor,
  listQuoteRequestsAdminRaw,
  orderSameTableCardsRaw,
  patchSupplyCartItemRaw,
  requestSupplyQuoteRaw,
  type CartLine,
} from "../../../utils/supplyShopCartApi";
import { generateRunId } from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const MAILPIT = process.env.MAILPIT_BASE_URL ?? "";
/** Where HQ's quote-request alert goes (backend SUPPLY_SHOP_ALERT_EMAIL, else support). */
const ALERT_EMAIL =
  process.env.SUPPLY_SHOP_ALERT_EMAIL || "support@restaunax.com";

const CARDS_SLUG = "table-qr-cards";
const STANDS_SLUG = "card-stands";
const CLEAR_STAND = "cards-with-stand";
/** A product seeded unlaunched on every environment: always "Request a quote". */
const QUOTE_SLUG = "flyer";
const QUOTE_NAME = "Flyer";
const CARD_COUNT = 3;

interface CatalogAddOn {
  forVariantSlugs: string[];
  required?: boolean;
  product: SupplyCatalogProduct;
}
type CatalogRow = SupplyCatalogProduct & {
  availability?: "ORDER" | "QUOTE";
  quoteRequestedAt?: string | null;
  addOns?: CatalogAddOn[];
};

test.describe("Owner — Print Shop: quotes and stands that come with the cards @supply-shop", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantName = "";
  let restaurantId = "";
  let session: UiLoginSession;
  let shop: OwnerSupplyCartPage;
  const placed: string[] = [];

  /** Raw owner tokens have no refresh path — log in again for each API step. */
  const ownerToken = async () =>
    (await apiLogin(ownerEmail, ownerPassword)).accessToken;

  const catalog = async (): Promise<CatalogRow[]> => {
    const res = await getSupplyCatalogOwnerRaw(
      await ownerToken(),
      restaurantId
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return res.data.data as CatalogRow[];
  };

  const cart = async () => {
    const res = await getSupplyCartRaw(await ownerToken(), restaurantId);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    return res.data.data;
  };

  const cardsAndStands = (lines: CartLine[]) => ({
    cards: lines.find((l) => l.productSlug === CARDS_SLUG),
    stands: lines.find((l) => l.productSlug === STANDS_SLUG),
  });

  test.beforeAll(async ({ browser }) => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password) {
      throw new Error("[supply-stands] could not mint the throwaway tenant");
    }
    restaurantId = tenant.restaurantId;
    ownerEmail = tenant.email;
    ownerPassword = tenant.password;

    // Grants BEFORE first navigation — the tab gates client-side at mount.
    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SUPPLY_SHOP",
      true
    );
    if (!grant.ok) {
      throw new Error(
        `[supply-stands] could not grant SUPPLY_SHOP: ${JSON.stringify(grant.data)}`
      );
    }
    // Table cards print the restaurant's ordering link: no slug, no cards.
    await ensureOrderingSlug(
      adminToken,
      "restaurant",
      restaurantId,
      `auto-stands-${runId}`
    );

    session = await loginViaUi(browser, ownerEmail, ownerPassword);
    shop = createOwnerSupplyCartPage(session.page);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    const token = await ownerToken().catch(() => "");
    if (token) {
      for (const id of placed) {
        await cancelSupplyOrderOwnerRaw(token, restaurantId, id).catch(() => {
          /* already cancelled in TC-1021 */
        });
      }
      await emptySupplyCart(token, restaurantId).catch(() => {
        /* nothing left in the cart */
      });
    }
    await handleQuoteRequestsFor(adminToken, restaurantId).catch(() => {
      /* no open request left */
    });
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SUPPLY_SHOP"
    ).catch(() => {
      /* override may already be gone */
    });
    await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
      /* archive is best-effort; globalTeardown sweeps the user */
    });
    if (session) {
      await session.context.close().catch(() => {
        /* already closed */
      });
    }
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Supply shop");
    await allure.label("severity", "critical");
  });

  test("TC-1014: an unlaunched product is listed with no price, and Card in a clear stand comes with priced stands", async () => {
    const rows = await catalog();

    const quoteOnly = rows.find((p) => p.slug === QUOTE_SLUG);
    expect(quoteOnly, `${QUOTE_SLUG} is listed`).toBeTruthy();
    expect(quoteOnly!.availability).toBe("QUOTE");
    expect(quoteOnly!.fromUnitPrice ?? null).toBeNull();
    for (const variant of quoteOnly!.variants) {
      expect(variant.priceTiers, `${variant.slug} has no prices`).toEqual([]);
    }
    expect(quoteOnly!.addOns ?? []).toEqual([]);

    const cards = rows.find((p) => p.slug === CARDS_SLUG);
    expect(cards?.availability).toBe("ORDER");
    expect(cards!.variants.map((v) => v.slug)).toContain(CLEAR_STAND);
    const required = (cards!.addOns ?? []).filter((a) => a.required);
    expect(required).toHaveLength(1);
    const [standsAddOn] = required;
    expect(standsAddOn!.forVariantSlugs).toEqual([CLEAR_STAND]);
    expect(standsAddOn!.product.slug).toBe(STANDS_SLUG);
    // Priced although the stands product may not be launched on its own.
    const standTiers = standsAddOn!.product.variants[0]?.priceTiers ?? [];
    expect(standTiers.length).toBeGreaterThan(0);
    for (const tier of standTiers) {
      expect(tier, "no vendor cost reaches an owner").not.toHaveProperty(
        "unitVendorCost"
      );
    }

    // On its own the stands product is for spares: Request a quote until HQ
    // launches it, and then the optional "Need stands?" for replacement cards.
    const stands = rows.find((p) => p.slug === STANDS_SLUG);
    const optional = (cards!.addOns ?? []).filter((a) => !a.required);
    if (stands?.availability === "QUOTE") {
      expect(optional).toEqual([]);
    } else {
      expect(optional.map((a) => a.forVariantSlugs)).toEqual([["cards-only"]]);
    }
  });

  test("TC-1015: one click on Request a quote asks HQ — the button sits inside its card at any width", async () => {
    const { page } = session;
    await shop.goto(restaurantId);
    await expect(shop.quoteButton(QUOTE_NAME)).toHaveText("Request a quote");

    // The button used to be pushed past the card's clipped edge (#1097).
    await shop.catalogCard(QUOTE_NAME).scrollIntoViewIfNeeded();
    await shop.expectQuoteButtonInsideCard(QUOTE_NAME);
    const desktop = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await shop.catalogCard(QUOTE_NAME).scrollIntoViewIfNeeded();
    await shop.expectQuoteButtonInsideCard(QUOTE_NAME);
    if (desktop) await page.setViewportSize(desktop);

    const asked = page.waitForResponse(
      (r) =>
        /\/api\/supply-shop\/catalog\/[^/]+\/quote-request$/.test(r.url()) &&
        r.request().method() === "POST"
    );
    await shop.quoteButton(QUOTE_NAME).click();
    expect((await asked).ok()).toBeTruthy();
    await expect(shop.quoteButton(QUOTE_NAME)).toHaveText("Requested");
    await expect(shop.quoteButton(QUOTE_NAME)).toBeDisabled();
    await expect(
      page.getByText("We've asked our team for a price", { exact: false })
    ).toBeVisible();

    // HQ has exactly one open request from this restaurant for it, and a
    // second ask is the same request (no second email).
    const product = (await catalog()).find((p) => p.slug === QUOTE_SLUG)!;
    expect(product.quoteRequestedAt).toBeTruthy();
    const again = await requestSupplyQuoteRaw(
      await ownerToken(),
      restaurantId,
      product.id
    );
    expect(again.status).toBe(200);
    expect(again.data.data.created).toBe(false);
    const open = await listQuoteRequestsAdminRaw(adminToken);
    expect(open.status).toBe(200);
    const mine = open.data.data.filter((r) => r.restaurant.id === restaurantId);
    expect(mine.map((r) => r.product.slug)).toEqual([QUOTE_SLUG]);
    restaurantName = mine[0]!.restaurant.name;

    // After a reload the card still says so: the request is stored, not local.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(shop.quoteButton(QUOTE_NAME)).toHaveText("Requested");
  });

  test("TC-1016: HQ is emailed the quote request with the restaurant and the product @email", async () => {
    test.skip(!MAILPIT, "MAILPIT_BASE_URL not set — the alert can't be read");
    expect(restaurantName, "TC-1015 read the restaurant's name").not.toBe("");
    const mail = await waitForEmail(ALERT_EMAIL, {
      subjectPattern: new RegExp(
        `^Quote request: ${restaurantName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} — ${QUOTE_NAME}$`
      ),
      timeoutMs: 60_000,
    });
    expect(mail.text_body + mail.html_body).toContain(restaurantId);
  });

  test("TC-1017: choosing Card in a clear stand says the stands come with the cards — nothing else to order", async () => {
    const { page } = session;
    await shop.goto(restaurantId);
    await shop.openProduct("Table QR cards");
    await expect(
      page.getByRole("heading", { name: "Table QR cards" })
    ).toBeVisible();

    await shop.chooseSameCards(CARD_COUNT, "Card in a clear stand");
    const tile = shop.formatTile("Card in a clear stand");
    await expect(tile).toContainText("Comes with a clear stand for each card");
    await expect(tile).toContainText("each with its stand");

    await expect(shop.standsIncluded()).toContainText(
      `We'll add ${CARD_COUNT} clear stands to your cart with your cards.`
    );
    // A required stand is never asked about.
    await expect(shop.standsQuestion()).toHaveCount(0);
  });

  test("TC-1018: the cart shows the stands under the cards, one per card, with no Remove of their own", async () => {
    const { page } = session;
    await shop.addToCartAndOpenCart();

    const standsLine = shop.cartLine("Clear card stands");
    await expect(standsLine).toContainText("needed to hold your table cards");
    await expect(standsLine).toContainText(`Quantity: ${CARD_COUNT}`);
    await expect(standsLine).toContainText("Removed with your table cards");
    await expect(
      standsLine.getByRole("button", { name: "Remove" })
    ).toHaveCount(0);

    const cardsLine = shop.cartLine("Table QR cards");
    await expect(cardsLine).toContainText(`Quantity: ${CARD_COUNT}`);
    await expect(
      cardsLine.getByRole("button", { name: "Remove" })
    ).toBeVisible();

    // Same supplier, one box: one shipping line for both.
    await expect(
      page.getByText("Shipping (arrives in 1 package)")
    ).toBeVisible();

    const view = await cart();
    const { cards, stands } = cardsAndStands(view.lines);
    expect(cards?.quantity).toBe(CARD_COUNT);
    expect(stands).toMatchObject({
      quantity: CARD_COUNT,
      addOnRequired: true,
      addOnForId: cards!.id,
      available: true,
    });
    expect(view.packageCount).toBe(1);
  });

  test("TC-1019: the stands can't be changed or removed alone, and the format can't skip the cart", async () => {
    const token = await ownerToken();
    const { cards, stands } = cardsAndStands((await cart()).lines);

    const patch = await patchSupplyCartItemRaw(
      token,
      restaurantId,
      stands!.id,
      CARD_COUNT + 5
    );
    expect(patch.status).toBe(409);
    expect(patch.data.code).toBe("ADD_ON_REQUIRED");

    const remove = await deleteSupplyCartItemRaw(
      token,
      restaurantId,
      stands!.id
    );
    expect(remove.status).toBe(409);
    expect(remove.data.code).toBe("ADD_ON_REQUIRED");

    // The client can't choose the required stands either: they are the
    // server's to add.
    const catalogRows = await catalog();
    const standVariant = catalogRows
      .find((p) => p.slug === CARDS_SLUG)!
      .addOns!.find((a) => a.required)!.product.variants[0];
    const forced = await addSameTableCardsToCartRaw(
      token,
      restaurantId,
      1,
      CLEAR_STAND,
      [{ variantId: standVariant!.id, quantity: 1 }]
    );
    expect(forced.status).toBe(400);
    expect(forced.data.code).toBe("ADD_ON_NOT_ALLOWED");

    // The old single-line order would ship cards without stands.
    const oneLine = await orderSameTableCardsRaw(
      token,
      restaurantId,
      1,
      CLEAR_STAND
    );
    expect(oneLine.status).toBe(409);
    expect(oneLine.data.code).toBe("USE_CART_FOR_FORMAT");

    // Nothing above changed the cart.
    const after = cardsAndStands((await cart()).lines);
    expect(after.cards?.id).toBe(cards!.id);
    expect(after.stands).toMatchObject({
      id: stands!.id,
      quantity: CARD_COUNT,
    });
  });

  test("TC-1020: removing the cards takes their stands out of the cart too", async () => {
    const { page } = session;
    await shop
      .cartLine("Table QR cards")
      .getByRole("button", { name: "Remove" })
      .click();
    await expect(shop.cartLine("Table QR cards")).toHaveCount(0);

    const left = (await cart()).lines;
    // RestauNax #1102: before it, the stands stayed behind on their own.
    requireRelease(
      "cartRemoveStands",
      left.length === 0,
      `cart still holds ${left.map((l) => l.productSlug).join(", ")}`
    );
    expect(left).toEqual([]);
    await expect(
      page.getByText("Your cart is empty", { exact: false })
    ).toBeVisible();
  });

  test("TC-1021: cards and stands are placed together and cancelled together", async () => {
    const token = await ownerToken();
    await emptySupplyCart(token, restaurantId);
    const added = await addSameTableCardsToCartRaw(
      token,
      restaurantId,
      2,
      CLEAR_STAND
    );
    expect(added.status, JSON.stringify(added.data)).toBe(200);
    const cardsId = added.data.data.orderId;
    const [standsId] = added.data.data.addOnOrderIds;
    if (!standsId) throw new Error("no stands line came with the cards");

    const checkout = await checkoutSupplyCartRaw(token, restaurantId);
    expect(checkout.status, JSON.stringify(checkout.data)).toBe(200);
    expect(checkout.data.data.placed.sort()).toEqual(
      [cardsId, standsId].sort()
    );
    expect(checkout.data.data.failed).toEqual([]);
    placed.push(cardsId, standsId);

    const orders = await listSupplyOrdersOwnerRaw(token, restaurantId);
    const byId = new Map(orders.data.data.map((o) => [o.id, o]));
    expect(byId.get(cardsId)).toMatchObject({ status: "PLACED", quantity: 2 });
    expect(byId.get(standsId)).toMatchObject({
      status: "PLACED",
      quantity: 2,
      addOnForOrderId: cardsId,
      addOnRequired: true,
    });

    // HQ sees two lines to source: the cards and the stands.
    const queue = await listAdminSupplyOrdersRaw(adminToken, {
      restaurantId,
    });
    expect(queue.status).toBe(200);
    const hq = (queue.data.data ?? []).filter(
      (o) => o.id === cardsId || o.id === standsId
    );
    expect(hq).toHaveLength(2);

    // The stands can't be cancelled while their cards go ahead…
    const standsAlone = await cancelSupplyOrderOwnerRaw(
      token,
      restaurantId,
      standsId
    );
    expect(standsAlone.status).toBe(409);
    expect((standsAlone.data as { code?: string }).code).toBe(
      "ADD_ON_REQUIRED"
    );

    // …and cancelling the cards cancels both.
    const cancel = await cancelSupplyOrderOwnerRaw(
      token,
      restaurantId,
      cardsId
    );
    expect(cancel.status, JSON.stringify(cancel.data)).toBe(200);
    const after = await listSupplyOrdersOwnerRaw(token, restaurantId);
    const status = new Map(after.data.data.map((o) => [o.id, o.status]));
    expect(status.get(cardsId)).toBe("CANCELLED");
    expect(status.get(standsId)).toBe("CANCELLED");
  });
});
