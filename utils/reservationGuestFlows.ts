/**
 * reservationGuestFlows.ts — the guest's own browser journeys for reservations
 * phase 4, shared by template-wind and template-lima: join the waitlist → status
 * page → leave; book with a deposit → real policy text → Payment Element with a
 * real Stripe test card → confirmed after the real webhook; a declined card and
 * retry; cancelling outside and inside the window; changing the booking; add to
 * calendar.
 *
 * The dev server is pinned to the tenant in .reservation-guest-tenant.tmp.json
 * (scripts/mint-reservation-guest-tenant.ts, RUNNING_TESTS.md); without that file,
 * or without Stripe test mode, the tests skip. Set E2E_SHOT_DIR for screenshots.
 */
import * as fs from "fs";
import * as path from "path";
import { type FrameLocator, type Page } from "@playwright/test";
import { test, expect } from "../fixtures/base";
import {
  getManagedReservationRaw,
  getPublicAvailabilityRaw,
} from "./apiHelper";
import { localDateKey } from "./dealSchedule";
import { type Phase4Tenant, unwrap } from "./reservationPhase4Api";
import { STRIPE_CARDS, STRIPE_DEFAULTS } from "./stripeCards";
import {
  fireStripeEvent,
  intentIdFromClientSecret,
  listRefunds,
  stripeTestModeReady,
} from "./stripeTestMode";
import { generateGuestPhone, generateRunId } from "./testData";

const TENANT_FILE = path.resolve(
  __dirname,
  "..",
  ".reservation-guest-tenant.tmp.json"
);

const loadTenant = (): (Phase4Tenant & { runId: string }) | null => {
  if (!fs.existsSync(TENANT_FILE)) return null;
  return JSON.parse(fs.readFileSync(TENANT_FILE, "utf8"));
};

export function defineGuestFlows(app: "wind" | "lima", firstTc: number): void {
  const tenant = loadTenant();
  const ready = !!tenant && stripeTestModeReady();
  const runId = generateRunId();
  let seq = app === "wind" ? 1000 : 2000;
  const phone = () => generateGuestPhone(runId, ++seq);
  const tc = (n: number) => `TC-${firstTc + n}`;
  /** Every test books its own time: a different hour per test and per app. */
  let hour = app === "wind" ? 9 : 15;

  const shot = async (page: Page, name: string) => {
    const dir = process.env.E2E_SHOT_DIR;
    if (dir)
      await page.screenshot({
        path: path.join(dir, `${app}-${name}.png`),
        fullPage: true,
      });
  };

  const stripeFrame = (page: Page): FrameLocator =>
    page
      .frameLocator(
        'iframe[src*="js.stripe.com"][title*="payment" i], iframe[name^="__privateStripeFrame"]'
      )
      .first();

  const payButton = (page: Page) =>
    page.getByRole("button", { name: /^Pay \$[\d.]+ deposit$/i });

  /** Type a test card into the real Payment Element. */
  const fillCard = async (page: Page, card: string) => {
    const frame = stripeFrame(page);
    const number = frame.locator('input[name="number"]');
    await number.waitFor({ state: "visible", timeout: 30_000 });
    await number.fill(card);
    await frame
      .locator('input[name="expiry"]')
      .fill(STRIPE_DEFAULTS.EXPIRY_MM_YY);
    await frame.locator('input[name="cvc"]').fill(STRIPE_DEFAULTS.CVC);
    const country = frame.locator('select[name="country"]');
    if (await country.count()) await country.selectOption("US");
    const zip = frame.locator('input[name="postalCode"]');
    if (await zip.count()) await zip.fill(STRIPE_DEFAULTS.ZIP);
  };

  /**
   * Scroll the Pay button in, let the browser paint, then click. Playwright's own
   * scroll-then-click sends the mouse events in the same frame as the scroll, and
   * Chromium routes them with the hit-test data from BEFORE the scroll: they land
   * in the cross-origin Stripe iframe that was under that point, so the click
   * vanishes (traced in the frame's own listeners: 4 in 10 runs). It is not a
   * layout shift, and a person can't click in the frame they scrolled in.
   */
  const clickPay = async (page: Page) => {
    const button = payButton(page);
    await button.scrollIntoViewIfNeeded();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
    await button.click();
  };

  const tokenFromUrl = (page: Page) =>
    new URL(page.url()).pathname.split("/").pop() as string;

  const managed = async (token: string) =>
    unwrap(await getManagedReservationRaw(token));

  const intentOf = async (token: string): Promise<string> => {
    const view = await managed(token);
    return intentIdFromClientSecret(view.depositDue.clientSecret as string);
  };

  /** Fill and submit the booking form up to the deposit step, for a slot
   *  `daysAhead` away (0 = today) at `hhmm`. Ends on the manage page. */
  const bookToPayment = async (
    page: Page,
    label: string,
    daysAhead: number,
    {
      slotIndex,
      guestPhone = phone(),
    }: { slotIndex?: number; guestPhone?: string } = {}
  ): Promise<{ guestName: string; slotLabel: string }> => {
    const t = tenant!;
    await page.goto("/reservations");
    const date = localDateKey(t.timeZone, daysAhead);
    const avail = unwrap(
      await getPublicAvailabilityRaw(t.restaurantId, date, 2)
    );
    const policy = avail.depositPolicy.text as string;

    // Date, party, time. Pick the date by its position in the strip.
    const dates = page.getByRole("radiogroup", { name: /date/i });
    await dates.waitFor({ state: "visible", timeout: 30_000 });
    await dates.getByRole("radio").nth(daysAhead).click();
    await page
      .getByRole("radiogroup", { name: /party/i })
      .getByRole("radio", { name: /^2( guests)?$/ })
      .click();
    const cont = page.getByRole("button", {
      name: /^(Continue|Next|See times|Find a table|Check availability)/i,
    });
    if (await cont.count()) await cont.first().click();

    const times = page.getByRole("radiogroup", { name: /time/i });
    await times.waitFor({ state: "visible", timeout: 15_000 });
    const slot = times.getByRole("radio").nth(slotIndex ?? hour++ * 4 + 2);
    await slot.scrollIntoViewIfNeeded();
    const slotLabel = (await slot.innerText()).trim();
    await slot.click();
    await shot(page, `${label}-1-time`);

    // Deposit step: amount + the real policy text, BEFORE any POST.
    const submit = page.getByRole("button", { name: /^Continue to payment$/i });
    await submit.waitFor({ state: "visible", timeout: 15_000 });
    await expect(page.getByText(/\$40(\.00)? deposit/).first()).toBeVisible();
    await expect(
      page.getByText(policy, { exact: false }).first()
    ).toBeVisible();

    const guestName = `${label} ${runId}`;
    await page.getByLabel(/name/i).first().fill(guestName);
    await page.getByLabel(/phone/i).first().fill(guestPhone);

    // Not agreed: refused on the client, nothing booked.
    let posted = false;
    const onReq = (r: { url(): string; method(): string }) => {
      if (/\/reservations$/.test(r.url()) && r.method() === "POST")
        posted = true;
    };
    page.on("request", onReq);
    await submit.click();
    await expect(page.getByText(/agree to the deposit/i)).toBeVisible();
    expect(posted).toBe(false);
    page.off("request", onReq);

    await page.getByLabel("I agree to this deposit policy.").check();
    await shot(page, `${label}-2-policy`);
    await submit.click();
    await page.waitForURL(/\/reservations\/manage\//, { timeout: 20_000 });
    return { guestName, slotLabel };
  };

  /** Pay on the page + deliver the real webhook. */
  const payAndConfirm = async (page: Page, token: string) => {
    const intentId = await intentOf(token);
    await fillCard(page, STRIPE_CARDS.VISA_SUCCESS);
    await clickPay(page);
    await fireStripeEvent("payment_intent.succeeded", intentId);
    await expect
      .poll(async () => (await managed(token)).deposit.status, {
        timeout: 30_000,
      })
      .toBe("PAID");
    return intentId;
  };

  test.describe(`Guest (${app}) — reservations phase 4 @reservations-phase4`, () => {
    test.describe.configure({ timeout: 180_000 });
    test.skip(
      !ready,
      "Needs a pinned dev server + Stripe test mode: scripts/mint-reservation-guest-tenant.ts (RUNNING_TESTS.md)"
    );

    test(`${tc(0)}: join the waitlist → place and quote → the status page → leave the line`, async ({
      page,
    }) => {
      await page.goto("/waitlist");
      const party = page.getByRole("radiogroup", { name: /party/i });
      await party.waitFor({ state: "visible", timeout: 30_000 });
      await shot(page, "wl-1-party");
      await party.getByRole("radio", { name: /^2( guests)?$/ }).click();
      await expect(page.getByText(/about|no wait|min/i).first()).toBeVisible();
      await shot(page, "wl-2-quote");
      const cont = page.getByRole("button", { name: /^(Continue|Next)/i });
      if (await cont.count()) await cont.first().click();
      const guestName = `Waitlist ${runId}`;
      await page.getByLabel(/name/i).first().fill(guestName);
      await page.getByLabel(/phone/i).first().fill(phone());
      await shot(page, "wl-3-details");
      await page.getByRole("button", { name: /^Join the waitlist$/i }).click();
      await page.waitForURL(/\/reservations\/manage\//, { timeout: 20_000 });
      const token = tokenFromUrl(page);
      await expect(page.getByText(/in line|#\d|ahead/i).first()).toBeVisible({
        timeout: 15_000,
      });
      await shot(page, "wl-4-status");
      const view = await managed(token);
      expect(view.kind).toBe("WAITLIST");
      // Not always #1: the wind and lima flows can share one tenant and run in
      // parallel. What matters is that the page shows the server's place.
      expect(view.placeInLine).toBeGreaterThanOrEqual(1);
      await expect(
        page.getByText(new RegExp(`#${view.placeInLine}\\b`)).first()
      ).toBeVisible();

      await page
        .getByRole("button", { name: /Leave the line/i })
        .first()
        .click();
      const confirm = page
        .getByRole("button", {
          name: /^(Yes|Leave|Leave the line|Yes, leave)/i,
        })
        .last();
      await confirm.click();
      await expect
        .poll(async () => (await managed(token)).status, { timeout: 15_000 })
        .toBe("CANCELLED");
      await expect(
        page.getByText(/no longer|left|cancelled/i).first()
      ).toBeVisible();
      await shot(page, "wl-5-left");
    });

    test(`${tc(1)}: book with a deposit — checkbox + real policy, Payment Element 4242, confirmed after the webhook; add to calendar and a change after`, async ({
      page,
    }) => {
      const { guestName } = await bookToPayment(page, "Book", 5);
      const token = tokenFromUrl(page);
      await expect(payButton(page)).toBeVisible({ timeout: 30_000 });
      await shot(page, "book-3-pay");
      await payAndConfirm(page, token);
      // Without a reload: the guest watching the page sees it confirmed.
      await expect(page.getByText(/\$40(\.00)? paid/i).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByText(guestName).first()).toBeVisible();
      await expect(payButton(page)).toHaveCount(0);
      await shot(page, "book-4-paid");

      // Add to calendar: a real Google link for this booking's time.
      const google = page.getByRole("link", { name: /Google Calendar/i });
      await expect(google).toBeVisible();
      const href = (await google.getAttribute("href")) as string;
      expect(href).toContain("calendar.google.com");
      const view = await managed(token);
      const utc = new Date(view.scheduledAt)
        .toISOString()
        .replace(/[-:]/g, "")
        .slice(0, 13);
      expect(href).toContain(utc);

      // Change the reservation: party size (the deposit doesn't move).
      await page
        .getByRole("button", { name: /Change reservation/i })
        .first()
        .click();
      await shot(page, "book-5-change");
      await page
        .getByRole("radiogroup", { name: /party/i })
        .getByRole("radio", { name: /^3( guests)?$/ })
        .click();
      const times = page.getByRole("radiogroup", { name: /time/i });
      await times.waitFor({ state: "visible", timeout: 15_000 });
      await times
        .getByRole("radio")
        .nth(hour++ * 4 + 1)
        .click();
      await page
        .getByRole("button", {
          name: /^(Save|Save change|Save changes|Update|Confirm)/i,
        })
        .first()
        .click();
      await expect
        .poll(async () => (await managed(token)).partySize, { timeout: 15_000 })
        .toBe(3);
      const after = await managed(token);
      expect(after.deposit.amountCents).toBe(4000);
      expect(after.deposit.status).toBe("PAID");
      await expect(page.getByText(/updated/i).first()).toBeVisible();
      await shot(page, "book-6-changed");
    });

    test(`${tc(2)}: a declined card says so and stays due; the same page then pays`, async ({
      page,
    }) => {
      await bookToPayment(page, "Decline", 6);
      const token = tokenFromUrl(page);
      const intentId = await intentOf(token);
      await expect(payButton(page)).toBeVisible({ timeout: 30_000 });
      await fillCard(page, STRIPE_CARDS.DECLINED);
      await clickPay(page);
      await expect(page.getByText(/declined/i).first()).toBeVisible({
        timeout: 30_000,
      });
      await shot(page, "decline-1-refused");
      await fireStripeEvent("payment_intent.payment_failed", intentId);
      const view = await managed(token);
      expect(view.deposit.status).toBe("PENDING");
      expect(view.status).toBe("BOOKED");

      await fillCard(page, STRIPE_CARDS.VISA_SUCCESS);
      await clickPay(page);
      await fireStripeEvent("payment_intent.succeeded", intentId);
      await expect
        .poll(async () => (await managed(token)).deposit.status, {
          timeout: 30_000,
        })
        .toBe("PAID");
      await shot(page, "decline-2-paid");
    });

    test(`${tc(3)}: cancelling outside the window — the page warns of the refund, the card gets it back`, async ({
      page,
    }) => {
      await bookToPayment(page, "Refund", 7);
      const token = tokenFromUrl(page);
      await expect(payButton(page)).toBeVisible({ timeout: 30_000 });
      const intentId = await payAndConfirm(page, token);
      await page.reload();
      const cancel = page.getByRole("button", {
        name: /^Cancel reservation$/i,
      });
      await cancel.first().click();
      await expect(page.getByText(/refund/i).first()).toBeVisible();
      await shot(page, "cancel-1-before-window");
      await page
        .getByRole("button", {
          name: /^(Yes|Yes, cancel|Cancel reservation|Confirm)/i,
        })
        .last()
        .click();
      await expect
        .poll(async () => (await managed(token)).status, { timeout: 15_000 })
        .toBe("CANCELLED");
      await expect
        .poll(async () => (await managed(token)).deposit.status, {
          timeout: 15_000,
        })
        .toBe("REFUNDED");
      expect((await listRefunds(intentId)).map((r) => r.amount)).toEqual([
        4000,
      ]);
      await expect(page.getByText(/refund/i).first()).toBeVisible();
      await shot(page, "cancel-2-refunded");
    });

    test(`${tc(4)}: cancelling inside the window — the page warns it's kept, shows the policy and phone, no money moves`, async ({
      page,
    }) => {
      // Tomorrow's first slots are always inside the 24-hour window.
      await bookToPayment(page, "Forfeit", 1, {
        slotIndex: app === "wind" ? 1 : 3,
      });
      const token = tokenFromUrl(page);
      await expect(payButton(page)).toBeVisible({ timeout: 30_000 });
      const intentId = await payAndConfirm(page, token);
      const view = await managed(token);
      expect(
        new Date(view.depositPolicy.refundableUntil).getTime()
      ).toBeLessThan(Date.now());
      await page.reload();
      await page
        .getByRole("button", { name: /^Cancel reservation$/i })
        .first()
        .click();
      await expect(
        page.getByText(/not refunded|isn.t refunded|keep|kept/i).first()
      ).toBeVisible();
      await shot(page, "cancel-3-inside-window");
      await page
        .getByRole("button", {
          name: /^(Yes|Yes, cancel|Cancel reservation|Confirm)/i,
        })
        .last()
        .click();
      await expect
        .poll(async () => (await managed(token)).status, { timeout: 15_000 })
        .toBe("CANCELLED");
      await expect
        .poll(async () => (await managed(token)).deposit.status, {
          timeout: 15_000,
        })
        .toBe("FORFEITED");
      expect(await listRefunds(intentId)).toEqual([]);
      await shot(page, "cancel-4-forfeited");
    });
  });
}
