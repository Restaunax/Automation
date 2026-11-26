/**
 * order-receipt-download.spec.ts — the owner downloads a clean customer PDF and
 * sends the receipt of a paid walk-in order from the portal (TC-2066).
 *
 * RestauNax feat/send-receipt (docs/features/RECEIPTS.md). Browser. A per-run
 * throwaway restaurant with one walk-in order paid in cash at a register.
 * Local-stack only: the sent email is read from the local Mailpit, and the file
 * skips without E2E_LOCAL_DATABASE_URL (the marker of a local run).
 *
 *   TC-2066 Order details offers "Download receipt" (saves receipt-<n>.pdf, a
 *           real PDF) and "Send receipt": an email goes out, "Receipt sent."
 *           shows and the history lists "Email to a•••@…" for the order.
 */
import type { Page } from "@playwright/test";
import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import { localDbReady } from "../../../utils/reservationPhase4Api";
import { activeDialog, DESKTOP } from "../../../utils/humanQa";
import {
  apiLogin,
  createMenuGroupNamed,
  createMenuItemFull,
  createSecondOwner,
  createTabletDevice,
  createTabletOrderRaw,
  deactivateTabletDevice,
  deleteTestRestaurant,
  ensureBusinessHours,
  openRegisterSessionPos,
  setOwnerPosPin,
  settleTabCashRaw,
  tabletLogin,
  tabletStaffSignIn,
  updateDeviceModeOwnerRaw,
  updateRestaurantSettingsApi,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const EMAIL_DOMAIN = process.env.TEST_EMAIL_DOMAIN ?? "demomailtrap.co";
const MAILPIT = process.env.MAILPIT_LOCAL_URL ?? "http://localhost:8025";
const PRICE = 13.37;
const PIN = "8462";

test.describe.configure({ mode: "serial" });

test.describe("Order receipt download and send (UI)", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD || !localDbReady(),
    "needs ADMIN_* and E2E_LOCAL_DATABASE_URL (local stack only)"
  );

  const runId = generateRunId();
  let adminToken = "";
  let rid = "";
  let deviceId = "";
  let receiptNumber = "";
  let session: UiLoginSession | undefined;
  const to = `auto-receipt-ui-${runId}@${EMAIL_DOMAIN}`;

  const page = (): Page => {
    if (!session) throw new Error("no browser session");
    return session.page;
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    adminToken = (await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD)).accessToken;
    const tenant = await createSecondOwner(adminToken, runId, {
      alwaysFresh: true,
    });
    if (!tenant.restaurantId || !tenant.password)
      throw new Error("[receipt-ui] could not mint the throwaway tenant");
    rid = tenant.restaurantId;
    const ownerToken = tenant.accessToken;
    await ensureBusinessHours(ownerToken, rid);
    await updateRestaurantSettingsApi(ownerToken, rid, {
      tableServiceEnabled: true,
      acceptingOrders: true,
    });
    const group = await createMenuGroupNamed(ownerToken, `Receipt ${runId}`, {
      restaurantId: rid,
    });
    const item = await createMenuItemFull(
      ownerToken,
      group.id,
      `Receipt Burger ${runId}`,
      PRICE
    );
    const dev = await createTabletDevice(adminToken, rid, `rcpt-ui-${runId}`);
    deviceId = dev.id;
    await updateDeviceModeOwnerRaw(adminToken, rid, dev.id, "REGISTER");
    const tablet = await tabletLogin(dev.name, dev.code);
    const member = await setOwnerPosPin(ownerToken, rid, PIN);
    const staff = await tabletStaffSignIn(tablet, member, PIN);
    await openRegisterSessionPos(tablet, staff, 100);
    const opened = await createTabletOrderRaw(tablet, staff, {
      restaurantId: rid,
      orderType: "PICKUP",
      subtotal: PRICE,
      tax: 0,
      tip: 0,
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
      openCheck: true,
      tableName: `U${runId}`,
      guestCount: 2,
    });
    expect(opened.status, JSON.stringify(opened.data)).toBe(201);
    receiptNumber = String(opened.data.orderNumber);
    const paid = await settleTabCashRaw(tablet, staff, opened.data.id!, {
      amount: PRICE,
      cashTendered: 20,
      idempotencyKey: `rcpt-ui-${runId}`,
    });
    expect(paid.status, JSON.stringify(paid.data)).toBe(200);
    session = await loginViaUi(browser, tenant.email, tenant.password);
    await session.page.setViewportSize(DESKTOP);
  });

  test.afterAll(async () => {
    await session?.context.close().catch(() => {});
    if (!adminToken) return;
    if (deviceId)
      await deactivateTabletDevice(adminToken, rid, deviceId).catch(() => {});
    if (rid) await deleteTestRestaurant(adminToken, rid).catch(() => {});
  });

  test("TC-2066: Order details downloads the customer PDF and sends the receipt by email, with the history row", async () => {
    await allure.label("feature", "Send any receipt");
    await page().goto(
      `/restaurant/restaurantId/${rid}/restaurantManagement?tab=Orders`,
      { waitUntil: "domcontentloaded" }
    );
    const row = page().getByRole("row", { name: /Receipt Burger|13\.37/ });
    await row.getByRole("button", { name: "View Details" }).first().click({
      timeout: 25_000,
    });
    const sheet = activeDialog(page());
    await expect(
      sheet.getByRole("heading", { name: "Order Information" })
    ).toBeVisible({ timeout: 20_000 });

    // Download: a real PDF named for the receipt.
    const [download] = await Promise.all([
      page().waitForEvent("download", { timeout: 30_000 }),
      sheet.getByRole("button", { name: "Download receipt" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^receipt-.+\.pdf$/);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.from(c));
    expect(Buffer.concat(chunks).subarray(0, 5).toString()).toBe("%PDF-");
    expect(receiptNumber).not.toBe("");

    // Send by email: the dialog, the notice and the history row.
    await sheet.getByRole("button", { name: "Send receipt" }).click();
    const dialog = page().getByRole("dialog", { name: "Send receipt" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Not sent yet.")).toBeVisible();
    await dialog.getByRole("button", { name: "Email", exact: true }).click();
    await dialog.getByLabel("Email address").fill(to);
    await dialog.getByRole("button", { name: "Send receipt" }).click();
    await expect(dialog.getByText("Receipt sent.")).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.getByText(/Email to a•••@/)).toBeVisible();
    await expect(dialog.getByText("Not sent yet.")).toHaveCount(0);

    let arrived = false;
    for (let i = 0; i < 15 && !arrived; i++) {
      const r = await fetch(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`
      );
      arrived = ((await r.json()) as { messages_count?: number }).messages_count
        ? true
        : false;
      if (!arrived) await new Promise((res) => setTimeout(res, 500));
    }
    expect(arrived, "the email reached Mailpit").toBe(true);
  });
});
