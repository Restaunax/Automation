/**
 * 27-receipt-storefront.spec.ts — a texted or emailed receipt opens on the
 * restaurant's OWN storefront (TC-2078..TC-2081).
 *
 * RestauNax feat/send-receipt addendum (docs/features/RECEIPTS.md): the link is
 * `<storefront>/receipt/<token>` (template-wind) or `<ordering host>/<slug>/
 * receipt/<token>` (template-lima), which read the new public endpoint
 * `GET /api/public/receipts/:token`; the RestauNax `/r/<token>` page stays the
 * fallback when a restaurant has no storefront. "Download PDF" is always the API
 * host's `/r/<token>/pdf`.
 *
 *   TC-2078 the endpoint: a real token answers 200 with receiptNumber, restaurantId, pdfUrl and no customer contact; an unknown and a malformed token answer the SAME 404 {success:false}.
 *   TC-2079 the emailed "View receipt" link is the storefront's /receipt/<token> when the restaurant has a storefront, the API host's /r/<token> when it has none; Download PDF stays on the API host.
 *   TC-2080 template-wind /receipt/<token>: Receipt # exactly once, the total, a Download PDF link; an unknown token says "We couldn't find this receipt".
 *   TC-2081 template-lima <ordering host>/<slug>/receipt/<token>: the same.
 *
 * Gate: RELEASED_ON_QA.receiptStorefront (false until the backend and BOTH
 * storefronts are on QA). The two page tests probe the storefront itself (the
 * unknown-token page must say "couldn't find"), so a storefront without the page
 * skips while the flag is off. Orders are cash at a register; the receipt token
 * is read from the local database when E2E_LOCAL_DATABASE_URL is set, otherwise
 * from the "View receipt" link of the email in Mailpit (MAILPIT_BASE_URL). With
 * neither, the token tests skip. TC-2079's storefront half sets
 * `Restaurant.website` in the LOCAL database (never a delete), so it needs the
 * database; its no-storefront half needs Mailpit only.
 */
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { generateRunId } from "../../utils/testData";
import { localDbReady, localSql } from "../../utils/reservationPhase4Api";
import { probeReceiptEndpoint, requireRelease } from "../../utils/releaseGate";
import { waitForEmail } from "../../utils/emailHelper";
import { TEMPLATE_WIND_URL } from "../../utils/testData";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  createTabletDevice,
  createTabletOrderRaw,
  createSecondOwner,
  deactivateTabletDevice,
  deleteTestRestaurant,
  ensureBusinessHours,
  ensureOrderingSlug,
  openRegisterSessionPos,
  sendReceiptOwnerRaw,
  setOwnerPosPin,
  settleTabCashRaw,
  tabletLogin,
  tabletStaffSignIn,
  updateDeviceModeOwnerRaw,
  updateRestaurantSettingsApi,
  BACKEND_URL,
} from "../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";
const LIMA_URL = (
  process.env.LIMA_ORDERING_URL ?? "https://order.qa.restaunax.com"
).replace(/\/+$/, "");

const PRICE = 14.29;
const PIN = "8462";
const NOT_FOUND = /couldn.t find this receipt/i;
const LINK =
  /https?:\/\/[^\s"'<>)]*\/(?:receipt|r)\/[A-Za-z0-9_-]{22}(?:\/pdf)?/g;

test.describe.configure({ mode: "serial" });

test.describe(
  "Receipt on the restaurant's storefront",
  { tag: ["@receipt-storefront", "@send-receipt"] },
  () => {
    test.skip(
      !ADMIN_EMAIL || !ADMIN_PASSWORD,
      "ADMIN_EMAIL / ADMIN_PASSWORD not set (the file mints its own tenant)"
    );

    const runId = generateRunId();
    let adminToken = "";
    let ownerToken = "";
    let rid = "";
    let registerId = "";
    let register = "";
    let staffSession = "";
    let orderId = "";
    // Whether the backend serves the endpoint: written once in beforeAll and
    // only read after. A test's own "is the page deployed" answer stays local
    // to that test, so one storefront missing never skips the other's test.
    let endpointPresent = false;
    let mailSeq = 0;
    const localOnly = localDbReady();
    const haveMail = !!process.env.MAILPIT_BASE_URL;
    const mail = () => `auto-rcptsf-${runId}-${++mailSeq}@${EMAIL_DOMAIN}`;
    const gate = (present = endpointPresent) =>
      requireRelease("receiptStorefront", present);

    /** Send the order's receipt by email; the links in that email. */
    const emailedLinks = async (): Promise<string[]> => {
      const to = mail();
      const notBefore = Date.now();
      const r = await sendReceiptOwnerRaw(ownerToken, orderId, {
        channel: "email",
        to,
      });
      expect(r.status, JSON.stringify(r.data)).toBe(200);
      const m = await waitForEmail(to, { timeoutMs: 30_000, notBefore });
      const text = `${m.html_body}\n${m.text_body}`.replace(/&amp;/g, "&");
      return [...new Set(text.match(LINK) ?? [])];
    };
    /** The order's receipt token: the database when reachable, else Mailpit. */
    // Email budget: the backend takes 3 receipt EMAILS per order per hour
    // (RECEIPTS_PER_HOUR, TC-2072), and this whole file uses ONE order. It
    // sends exactly 3: one to mint the token (read once, cached, reused by
    // TC-2078/2080/2081) and two in TC-2079 (no storefront, then storefront).
    // A fourth send anywhere in this file answers 429 TOO_MANY.
    let cachedToken = "";
    const receiptToken = async (): Promise<string> => {
      if (!cachedToken) cachedToken = await mintReceiptToken();
      return cachedToken;
    };
    const mintReceiptToken = async (): Promise<string> => {
      if (localOnly) {
        const sent = await sendReceiptOwnerRaw(ownerToken, orderId, {
          channel: "email",
          to: mail(),
        });
        expect(sent.status, JSON.stringify(sent.data)).toBe(200);
        const [row] = localSql<{ token: string }>(
          `select token from "OrderReceiptLink" where "orderId" = '${orderId}' order by "createdAt" asc limit 1`
        );
        expect(row, "a receipt link was minted").toBeTruthy();
        return row!.token;
      }
      test.skip(
        !haveMail,
        "no way to read a receipt token: needs E2E_LOCAL_DATABASE_URL or MAILPIT_BASE_URL"
      );
      const links = await emailedLinks();
      const view = links.find((l) => !l.endsWith("/pdf"));
      expect(view, `a View receipt link in ${links.join(", ")}`).toBeTruthy();
      return view!.match(/([A-Za-z0-9_-]{22})$/)![1] as string;
    };

    test.beforeAll(async () => {
      test.setTimeout(240_000);
      adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
      const tenant = await createSecondOwner(adminToken, runId, {
        alwaysFresh: true,
      });
      if (!tenant.restaurantId)
        throw new Error("[receipt-storefront] no tenant");
      rid = tenant.restaurantId;
      ownerToken = tenant.accessToken;
      await ensureBusinessHours(ownerToken, rid);
      await updateRestaurantSettingsApi(ownerToken, rid, {
        tableServiceEnabled: true,
        acceptingOrders: true,
      });
      const group = await createMenuGroupNamed(ownerToken, `RcptSF ${runId}`, {
        restaurantId: rid,
      });
      const item = await createMenuItemFull(
        ownerToken,
        group.id,
        `Storefront Burger ${runId}`,
        PRICE
      );
      const reg = await createTabletDevice(adminToken, rid, `rsf-reg-${runId}`);
      registerId = reg.id;
      expect(
        (await updateDeviceModeOwnerRaw(adminToken, rid, reg.id, "REGISTER")).ok
      ).toBe(true);
      register = await tabletLogin(reg.name, reg.code);
      const member = await setOwnerPosPin(ownerToken, rid, PIN);
      staffSession = await tabletStaffSignIn(register, member, PIN);
      await openRegisterSessionPos(register, staffSession, 100);

      const open = await createTabletOrderRaw(register, staffSession, {
        restaurantId: rid,
        orderType: "PICKUP",
        openCheck: true,
        tableName: `RS${runId}`,
        guestCount: 2,
        subtotal: PRICE,
        tax: 0,
        tip: 0,
        processingFee: 0,
        total: PRICE,
        customerPhone: "",
        orderItems: [
          {
            menuItemId: item.id,
            menuItemName: item.name,
            quantity: 1,
            price: PRICE,
          },
        ],
      });
      expect(open.status, JSON.stringify(open.data)).toBe(201);
      orderId = open.data.id!;
      const s = await settleTabCashRaw(register, staffSession, orderId, {
        amount: PRICE,
        cashTendered: 20,
        idempotencyKey: `rsf-${runId}`,
      });
      expect(s.status, JSON.stringify(s.data)).toBe(200);
      endpointPresent = await probeReceiptEndpoint(BACKEND_URL);
    });

    test.afterAll(async () => {
      if (!adminToken) return;
      if (registerId)
        await deactivateTabletDevice(adminToken, rid, registerId).catch(
          () => {}
        );
      if (rid) await deleteTestRestaurant(adminToken, rid).catch(() => {});
    });

    test.beforeEach(async () => {
      await allure.label("feature", "Receipt on the storefront");
      await allure.label("severity", "critical");
    });

    test("TC-2078: GET /api/public/receipts/:token answers the receipt with no customer contact; an unknown and a malformed token answer the same 404", async () => {
      gate();
      const token = await receiptToken();
      const res = await fetch(`${BACKEND_URL}/api/public/receipts/${token}`);
      expect(res.status).toBe(200);
      const raw = await res.text();
      const json = JSON.parse(raw) as {
        success: boolean;
        data: Record<string, unknown>;
      };
      expect(json.success).toBe(true);
      expect(json.data.receiptNumber).toBeTruthy();
      expect(json.data.restaurantId).toBe(rid);
      expect(String(json.data.pdfUrl)).toMatch(
        new RegExp(`^https?://.+/r/${token}/pdf$`)
      );
      expect(raw).not.toMatch(/auto-rcptsf-/);
      expect(raw).not.toMatch(/customerPhone|customerEmail/i);

      const unknown = await fetch(
        `${BACKEND_URL}/api/public/receipts/${"Z".repeat(22)}`
      );
      const malformed = await fetch(
        `${BACKEND_URL}/api/public/receipts/not-a-token`
      );
      expect(unknown.status).toBe(404);
      expect(malformed.status).toBe(404);
      const [a, b] = [await unknown.text(), await malformed.text()];
      expect(JSON.parse(a)).toMatchObject({ success: false });
      expect(b).toBe(a);
    });

    test("TC-2079: the emailed View receipt link is the storefront's /receipt/<token> when the restaurant has a storefront, the API host's /r/<token> when it has none", async () => {
      gate();
      test.skip(!haveMail, "needs MAILPIT_BASE_URL to read the email");
      const view = (links: string[]) => links.find((l) => !l.endsWith("/pdf"));
      const pdf = (links: string[]) => links.find((l) => l.endsWith("/pdf"));

      // No storefront: the RestauNax page on the API host.
      const bare = await emailedLinks();
      expect(view(bare), bare.join(", ")).toMatch(/\/r\/[A-Za-z0-9_-]{22}$/);
      expect(view(bare)).not.toContain("/receipt/");

      test.skip(
        !localOnly,
        "giving the restaurant a storefront writes Restaurant.website in the local database"
      );
      const site = `https://rcpt-${runId.toLowerCase()}.example.test`;
      const before =
        localSql<{ website: string | null }>(
          `select website from "Restaurant" where id = '${rid}'`
        )[0]?.website ?? null;
      localSql(
        `update "Restaurant" set website = '${site}' where id = '${rid}'`
      );
      try {
        const withSite = await emailedLinks();
        const v = view(withSite)!;
        expect(v, withSite.join(", ")).toMatch(
          new RegExp(`^${site}/receipt/[A-Za-z0-9_-]{22}$`)
        );
        // The same permanent token, and the PDF stays on the API host.
        expect(v.split("/").pop()).toBe(view(bare)!.split("/").pop());
        expect(pdf(withSite), withSite.join(", ")).toMatch(/\/r\/[^/]+\/pdf$/);
        expect(pdf(withSite)).not.toContain(site);
      } finally {
        // Put back what was there, pass or fail.
        localSql(
          `update "Restaurant" set website = ${
            before === null ? "null" : `'${before.replace(/'/g, "''")}'`
          } where id = '${rid}'`
        );
      }
    });

    const expectReceiptPage = async (
      page: import("@playwright/test").Page,
      base: string
    ) => {
      // The unknown-token page doubles as the "is the page deployed" probe.
      await page.goto(`${base}/receipt/${"Z".repeat(22)}`, {
        waitUntil: "domcontentloaded",
      });
      const deployed = await page
        .getByText(NOT_FOUND)
        .first()
        .waitFor({ timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
      gate(endpointPresent && deployed);
      await expect(page.getByText(NOT_FOUND).first()).toBeVisible();

      const token = await receiptToken();
      const api = (await (
        await fetch(`${BACKEND_URL}/api/public/receipts/${token}`)
      ).json()) as { data: { receiptNumber: string } };
      const n = api.data.receiptNumber;
      await page.goto(`${base}/receipt/${token}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByText(`Receipt #${n}`)).toHaveCount(1, {
        timeout: 20_000,
      });
      await expect(
        page.getByText(`$${PRICE.toFixed(2)}`).first()
      ).toBeVisible();
      const download = page.getByRole("link", { name: /download pdf/i });
      await expect(download).toBeVisible();
      await expect(download).toHaveAttribute(
        "href",
        new RegExp(`/r/${token}/pdf$`)
      );
    };

    test("TC-2080: template-wind /receipt/<token> shows Receipt # once, the total and Download PDF; an unknown token says it couldn't find the receipt", async ({
      page,
    }) => {
      gate();
      await expectReceiptPage(page, TEMPLATE_WIND_URL.replace(/\/+$/, ""));
    });

    test("TC-2081: template-lima <ordering host>/<slug>/receipt/<token> shows Receipt # once, the total and Download PDF; an unknown token says it couldn't find the receipt", async ({
      page,
    }) => {
      gate();
      // The throwaway tenant's OWN slug (claimed here), never the seed's: the
      // page must brand THIS restaurant, and nothing here touches the seed.
      const slug = await ensureOrderingSlug(
        adminToken,
        "restaurant",
        rid,
        `rsf-${runId.toLowerCase()}`
      );
      test.skip(
        !slug,
        "could not claim an ordering slug for the throwaway restaurant"
      );
      await expectReceiptPage(page, `${LIMA_URL}/${slug}`);
    });
  }
);
