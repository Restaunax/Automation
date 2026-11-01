/**
 * api-print-builders.spec.ts — the Print Shop builders' API contract
 * (TC-1120..1125, `@print-builders`).
 *
 * RestauNax print builders (docs/features/TABLE_QR_CARD_DESIGNS.md "Photo and
 * follow code" + "No free print files", PROMO_CARD_DESIGNS.md):
 *
 *   - No free print-ready table cards: an owner asking for the clean PDF is
 *     refused (403 TABLE_QR_ORDER_TO_PRINT), the watermarked proof still
 *     downloads, and RestauNax staff can still get the clean file.
 *   - The photos and follow-us links the builders share
 *     (`/restaurant/:id/print-assets/…`), and the table card's optional
 *     photo + follow code on preview/pdf.
 *   - The public follow-us redirector `/q/follow/:restaurantId/:platform`
 *     always answers 302 — to the restaurant's saved profile when there is
 *     one, otherwise somewhere safe; never a 4xx/5xx.
 *   - The promo card is a builder product now, offered without the
 *     PROMO_CARDS feature, and the generic cart refuses it
 *     (USE_PROMO_CARD_PAGE).
 *
 * No browser. Its own always-fresh tenant (so saving a follow link never
 * touches a shared restaurant), with an ordering slug (a table card prints
 * the ordering link) and SUPPLY_SHOP. Nothing is ordered or charged: the
 * clean PDF HQ downloads is a "same card on every table" run, which creates
 * and locks no card rows. Deploy-gated on `printBuilders`
 * (utils/releaseGate.ts) until the change is on QA.
 */
import * as allure from "allure-js-commons";

import { test, expect } from "../../../fixtures/base";
import {
  apiLogin,
  createSecondOwner,
  createSupplyDesignOwnerRaw,
  deleteFeatureOverrideAdminRaw,
  deleteTestRestaurant,
  ensureOrderingSlug,
  getSupplyCatalogOwnerRaw,
  setFeatureOverrideAdminRaw,
} from "../../../utils/apiHelper";
import {
  getPrintSocialRaw,
  getPromoCardSetupRaw,
  getRedirectRaw,
  isPdf,
  isPng,
  listPrintPhotosRaw,
  postTableCardPreviewRaw,
  postTableCardsPdfRaw,
  putPrintSocialLinkRaw,
} from "../../../utils/printBuildersApi";
import { probePrintBuilders, requireRelease } from "../../../utils/releaseGate";
import {
  addSupplyCartItemRaw,
  getSupplyCartRaw,
} from "../../../utils/supplyShopCartApi";
import { generateRunId } from "../../../utils/testData";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

const PROMO_SLUG = "promo-card";
/** A "same card on every table" run: no card rows, nothing locked. */
const ONE_SAME_CARD = { sameForAll: { count: 1 } };
const CARD = { format: "cards-with-stand", design: "clean" };
/** An i18n key that leaked instead of resolved text. */
const LOOKS_LIKE_KEY = /^[a-z]+:[\w.]+$/;

type CatalogRow = {
  id: string;
  slug: string;
  availability?: "ORDER" | "QUOTE";
  orderFlow?: string;
  builder?: string | null;
  variants: { id: string; slug: string }[];
};

test.describe("Owner — Print Shop builders API @print-builders", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env (the file mints its own throwaway tenant)"
  );

  const runId = generateRunId();
  const instagramUrl = `https://www.instagram.com/auto${runId.replace(/[^A-Za-z0-9]/g, "").toLowerCase()}`;
  let adminToken = "";
  let ownerEmail = "";
  let ownerPassword = "";
  let restaurantId = "";
  let deployed = false;

  /** Raw owner tokens have no refresh path — log in again per test. */
  const ownerToken = async () =>
    (await apiLogin(ownerEmail, ownerPassword)).accessToken;

  test.beforeAll(async () => {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password) {
      throw new Error("[print-builders] could not mint the throwaway tenant");
    }
    restaurantId = tenant.restaurantId;
    ownerEmail = tenant.email;
    ownerPassword = tenant.password;

    const grant = await setFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SUPPLY_SHOP",
      true
    );
    if (!grant.ok) {
      throw new Error(
        `[print-builders] could not grant SUPPLY_SHOP: ${JSON.stringify(grant.data)}`
      );
    }
    // Table cards print the restaurant's ordering link: no slug, no cards.
    await ensureOrderingSlug(
      adminToken,
      "restaurant",
      restaurantId,
      `auto-print-${runId}`
    );
    deployed = await probePrintBuilders(tenant.accessToken, restaurantId);
  });

  test.afterAll(async () => {
    if (!adminToken) return;
    await deleteFeatureOverrideAdminRaw(
      adminToken,
      restaurantId,
      "SUPPLY_SHOP"
    ).catch(() => {
      /* override may already be gone */
    });
    // The saved follow link lives on this throwaway restaurant only.
    await deleteTestRestaurant(adminToken, restaurantId).catch(() => {
      /* archive is best-effort; globalTeardown sweeps the user */
    });
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Supply shop");
    await allure.label("story", "Print builders");
    await allure.label("severity", "critical");
    requireRelease("printBuilders", deployed);
  });

  test("TC-1120: an owner can't download print-ready table cards — the proof still downloads, and RestauNax staff can get the clean file", async () => {
    await allure.description(
      "No free print files (Neaj, 2026-10-31): the clean PDF is refused for an owner with 403 " +
        "TABLE_QR_ORDER_TO_PRINT and a resolved message — on the format path and the legacy layout path " +
        "(old clients still offer the button). `proof: true` still answers a PDF. ADMIN still downloads the " +
        "clean file (a same-card run, so nothing is locked)."
    );
    test.setTimeout(240_000);
    const owner = await ownerToken();

    for (const body of [
      { ...ONE_SAME_CARD, ...CARD },
      { ...ONE_SAME_CARD, ...CARD, proof: false },
      { ...ONE_SAME_CARD, layout: "SELF_PRINT" },
      { ...ONE_SAME_CARD, layout: "PRINT_READY" },
    ]) {
      const refused = await postTableCardsPdfRaw(owner, restaurantId, body);
      expect(refused.status, JSON.stringify(body)).toBe(403);
      expect(refused.json?.errorCode).toBe("TABLE_QR_ORDER_TO_PRINT");
      expect(refused.json?.message ?? "").not.toBe("");
      expect(refused.json?.message ?? "").not.toMatch(LOOKS_LIKE_KEY);
      expect(isPdf(refused.body)).toBe(false);
    }

    const proof = await postTableCardsPdfRaw(owner, restaurantId, {
      ...ONE_SAME_CARD,
      ...CARD,
      proof: true,
    });
    expect(proof.status, proof.json ? JSON.stringify(proof.json) : "").toBe(
      200
    );
    expect(proof.contentType).toContain("application/pdf");
    expect(proof.headers.get("content-disposition") ?? "").toContain(
      "table-qr-cards-proof.pdf"
    );
    expect(isPdf(proof.body)).toBe(true);

    const staff = await postTableCardsPdfRaw(adminToken, restaurantId, {
      ...ONE_SAME_CARD,
      ...CARD,
    });
    expect(staff.status, staff.json ? JSON.stringify(staff.json) : "").toBe(
      200
    );
    expect(staff.contentType).toContain("application/pdf");
    expect(isPdf(staff.body)).toBe(true);
  });

  test("TC-1121: the builders' photos and follow links answer the owner, refuse a bad source, and are not another owner's to read", async () => {
    const owner = await ownerToken();

    for (const source of ["gallery", "menu"]) {
      const res = await listPrintPhotosRaw(owner, restaurantId, source);
      expect(res.status, `${source}: ${JSON.stringify(res.data)}`).toBe(200);
      expect(Array.isArray(res.data.data.photos)).toBe(true);
      for (const photo of res.data.data.photos) {
        expect(typeof photo.id).toBe("string");
        expect(photo.url).toMatch(/^https?:\/\//);
      }
    }
    const searched = await listPrintPhotosRaw(
      owner,
      restaurantId,
      "menu",
      "zzz-no-such-dish"
    );
    expect(searched.status).toBe(200);
    expect(searched.data.data.photos).toEqual([]);

    const bad = await listPrintPhotosRaw(owner, restaurantId, "instagram");
    expect(bad.status, JSON.stringify(bad.data)).toBe(400);
    expect(bad.data.errorCode).toBe("PRINT_ASSETS_INVALID_BODY");

    const social = await getPrintSocialRaw(owner, restaurantId);
    expect(social.status, JSON.stringify(social.data)).toBe(200);
    // A fresh restaurant has saved no follow links yet.
    expect(social.data.data.social).toEqual([]);

    // HQ may read any restaurant's (it builds cards for them).
    const hq = await getPrintSocialRaw(adminToken, restaurantId);
    expect(hq.status, JSON.stringify(hq.data)).toBe(200);

    test.skip(
      !OWNER_EMAIL || !OWNER_PASSWORD,
      "OWNER_EMAIL / OWNER_PASSWORD not set — tenancy check skipped"
    );
    const stranger = (await apiLogin(OWNER_EMAIL, OWNER_PASSWORD)).accessToken;
    // Someone else's restaurant reads as not found, never a 403.
    const foreignPhotos = await listPrintPhotosRaw(
      stranger,
      restaurantId,
      "gallery"
    );
    expect(foreignPhotos.status, JSON.stringify(foreignPhotos.data)).toBe(404);
    const foreignSocial = await getPrintSocialRaw(stranger, restaurantId);
    expect(foreignSocial.status).toBe(404);
    const foreignSave = await putPrintSocialLinkRaw(
      stranger,
      restaurantId,
      "INSTAGRAM",
      "https://instagram.com/hijacked"
    );
    expect(foreignSave.status).toBe(404);
  });

  test("TC-1122: saving a follow link refuses another host or platform and saves a real profile on the restaurant", async () => {
    const owner = await ownerToken();

    for (const [platform, url] of [
      ["INSTAGRAM", "https://example.com/joespizza"],
      ["INSTAGRAM", "https://instagram.com.evil.example/joespizza"],
      ["INSTAGRAM", "https://www.instagram.com/"],
      ["INSTAGRAM", "javascript:alert(1)"],
      ["FACEBOOK", "https://www.instagram.com/joespizza"],
      ["MYSPACE", "https://myspace.com/joespizza"],
    ] as const) {
      const res = await putPrintSocialLinkRaw(
        owner,
        restaurantId,
        platform,
        url
      );
      expect(
        res.status,
        `${platform} ${url}: ${JSON.stringify(res.data)}`
      ).toBe(400);
      expect(res.data.errorCode).toBe("PRINT_ASSETS_INVALID_SOCIAL_LINK");
      expect(res.data.message ?? "").not.toMatch(LOOKS_LIKE_KEY);
    }
    // Nothing above was saved.
    const untouched = await getPrintSocialRaw(owner, restaurantId);
    expect(untouched.data.data.social).toEqual([]);

    const saved = await putPrintSocialLinkRaw(
      owner,
      restaurantId,
      "INSTAGRAM",
      instagramUrl
    );
    expect(saved.status, JSON.stringify(saved.data)).toBe(200);
    const handle = `@${new URL(instagramUrl).pathname.slice(1)}`;
    expect(saved.data.data.social).toEqual([
      {
        platform: "INSTAGRAM",
        url: instagramUrl,
        handle,
        scope: "restaurant",
      },
    ]);

    // The promo card builder reads the same links.
    const setup = await getPromoCardSetupRaw(owner, restaurantId);
    expect(setup.status, JSON.stringify(setup.data)).toBe(200);
    expect(setup.data.data.social).toEqual(saved.data.data.social);
  });

  test("TC-1123: the table card's photo and follow code — refusals say why, and a saved link previews and proofs", async () => {
    await allure.description(
      "preview/pdf take an optional `photo {source,id,focus}` and `follow` (INSTAGRAM|FACEBOOK|TIKTOK). " +
        "A platform with no saved link is 409 TABLE_QR_SOCIAL_LINK_MISSING; an unknown platform or a " +
        "malformed photo is 400 TABLE_QR_INVALID_BODY; a photo that is not this restaurant's is 404 " +
        "TABLE_QR_PHOTO_NOT_FOUND. With the Instagram link TC-1122 saved, the preview is a PNG and the " +
        "proof a PDF."
    );
    test.setTimeout(180_000);
    const owner = await ownerToken();
    const face = { ...CARD, label: null };

    const refusals: Array<{
      body: Record<string, unknown>;
      status: number;
      code: string;
    }> = [
      {
        body: { follow: "FACEBOOK" },
        status: 409,
        code: "TABLE_QR_SOCIAL_LINK_MISSING",
      },
      {
        body: { follow: "MYSPACE" },
        status: 400,
        code: "TABLE_QR_INVALID_BODY",
      },
      {
        body: { photo: { source: "web", id: "x" } },
        status: 400,
        code: "TABLE_QR_INVALID_BODY",
      },
      {
        body: {
          photo: { source: "gallery", id: "x", focus: { x: 2, y: 0.5 } },
        },
        status: 400,
        code: "TABLE_QR_INVALID_BODY",
      },
      {
        body: {
          photo: {
            source: "gallery",
            id: "00000000-0000-4000-8000-000000000000",
          },
        },
        status: 404,
        code: "TABLE_QR_PHOTO_NOT_FOUND",
      },
      {
        body: {
          photo: { source: "menu", id: "00000000-0000-4000-8000-000000000000" },
        },
        status: 404,
        code: "TABLE_QR_PHOTO_NOT_FOUND",
      },
    ];
    for (const r of refusals) {
      const res = await postTableCardPreviewRaw(owner, restaurantId, {
        ...face,
        ...r.body,
      });
      expect(res.status, JSON.stringify(r.body)).toBe(r.status);
      expect(res.json?.errorCode, JSON.stringify(r.body)).toBe(r.code);
      expect(res.json?.message ?? "").not.toMatch(LOOKS_LIKE_KEY);
    }
    // The proof refuses the same way.
    const proofRefused = await postTableCardsPdfRaw(owner, restaurantId, {
      ...ONE_SAME_CARD,
      ...CARD,
      proof: true,
      follow: "TIKTOK",
    });
    expect(proofRefused.status).toBe(409);
    expect(proofRefused.json?.errorCode).toBe("TABLE_QR_SOCIAL_LINK_MISSING");

    const preview = await postTableCardPreviewRaw(owner, restaurantId, {
      ...face,
      follow: "INSTAGRAM",
    });
    expect(
      preview.status,
      preview.json ? JSON.stringify(preview.json) : ""
    ).toBe(200);
    expect(preview.contentType).toContain("image/png");
    expect(isPng(preview.body)).toBe(true);
    // No photo asked for → no photo verdict.
    expect(preview.headers.get("x-photo-quality")).toBeNull();

    const proof = await postTableCardsPdfRaw(owner, restaurantId, {
      ...ONE_SAME_CARD,
      ...CARD,
      proof: true,
      follow: "INSTAGRAM",
    });
    expect(proof.status, proof.json ? JSON.stringify(proof.json) : "").toBe(
      200
    );
    expect(isPdf(proof.body)).toBe(true);
  });

  test("TC-1124: the follow-us code always redirects — to the saved profile, else somewhere safe, never an error", async () => {
    await allure.description(
      "GET /q/follow/:restaurantId/:platform is printed on table cards, so it must never 4xx/5xx: the " +
        "restaurant's saved Instagram (TC-1122) is followed exactly, platform case-insensitive; a platform " +
        "with no link, an unknown platform, an unknown or malformed restaurant, and an unknown promo-card " +
        "token (/q/:token/follow) all still 302 — and never to the Instagram link of a restaurant that " +
        "did not ask for it."
    );
    for (const platform of ["INSTAGRAM", "instagram"]) {
      const res = await getRedirectRaw(`/q/follow/${restaurantId}/${platform}`);
      expect(res.status, platform).toBe(302);
      expect(res.location, platform).toBe(instagramUrl);
    }

    for (const path of [
      `/q/follow/${restaurantId}/FACEBOOK`,
      `/q/follow/${restaurantId}/MYSPACE`,
      `/q/follow/00000000-0000-4000-8000-000000000000/INSTAGRAM`,
      `/q/follow/not-a-restaurant/INSTAGRAM`,
      `/q/no-such-token-${runId}/follow`,
    ]) {
      const res = await getRedirectRaw(path);
      expect(res.status, path).toBe(302);
      expect(res.location, `${path} has somewhere to go`).toMatch(
        /^https?:\/\//
      );
      expect(res.location, path).not.toBe(instagramUrl);
    }
  });

  test("TC-1125: the promo card is a builder offered without the PROMO_CARDS feature, and the generic cart refuses it", async () => {
    await allure.description(
      "The catalog lists `promo-card` for a fresh restaurant (no PROMO_CARDS feature) as orderFlow BUILDER " +
        "/ builder promoCard, so it opens the builder page instead of the brief. Adding it through the " +
        "generic cart (/api/supply-shop/cart/items) with a design of its own is refused 409 " +
        "USE_PROMO_CARD_PAGE and the cart is unchanged. While the product is unlaunched on QA the owner's " +
        "door stops earlier (NOT_LAUNCHED), so the check goes through HQ's door — HQ shopping in the " +
        "restaurant's shop may order products that are not live yet."
    );
    const owner = await ownerToken();
    const catalog = await getSupplyCatalogOwnerRaw(owner, restaurantId);
    expect(catalog.status, JSON.stringify(catalog.data)).toBe(200);
    const promo = (catalog.data.data as unknown as CatalogRow[]).find(
      (p) => p.slug === PROMO_SLUG
    );
    expect(promo, `${PROMO_SLUG} is offered without PROMO_CARDS`).toBeTruthy();
    expect(promo!.orderFlow).toBe("BUILDER");
    expect(promo!.builder).toBe("promoCard");
    const variantId = promo!.variants[0]?.id;
    expect(variantId, "promo card has a variant").toBeTruthy();

    // Launched → the owner's own door; not launched → HQ's.
    const token = promo!.availability === "ORDER" ? owner : adminToken;
    await allure.parameter(
      "door",
      promo!.availability === "ORDER" ? "owner" : "HQ"
    );
    const design = await createSupplyDesignOwnerRaw(token, restaurantId, {
      variantId: variantId!,
      name: `Automation promo ${runId}`,
      brief: { message: `promo ${runId}` },
    });
    expect(design.ok, JSON.stringify(design.data)).toBe(true);

    const before = await getSupplyCartRaw(token, restaurantId);
    expect(before.status).toBe(200);
    const refused = await addSupplyCartItemRaw(token, restaurantId, {
      variantId: variantId!,
      quantity: 250,
      designId: design.data.data.id,
    });
    expect(refused.status, JSON.stringify(refused.data)).toBe(409);
    expect(refused.data.code).toBe("USE_PROMO_CARD_PAGE");

    const after = await getSupplyCartRaw(token, restaurantId);
    expect(after.data.data.lines.map((l) => l.id)).toEqual(
      before.data.data.lines.map((l) => l.id)
    );
    expect(
      after.data.data.lines.some((l) => l.productSlug === PROMO_SLUG)
    ).toBe(false);

    // The builder's own setup read answers the owner.
    const setup = await getPromoCardSetupRaw(owner, restaurantId);
    expect(setup.status, JSON.stringify(setup.data)).toBe(200);
  });
});
