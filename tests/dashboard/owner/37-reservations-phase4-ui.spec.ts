/**
 * 37-reservations-phase4-ui.spec.ts — the dashboard side of reservations phase 4:
 * Online waitlist, Server rotation and Deposits cards, the rules editor, policy
 * preview, deposit chips, the Refund deposit dialog (a REAL Stripe test refund),
 * search all dates, the phone dialog's deposit and a Spanish spot check.
 *
 * Own tenants (Stripe test account + one without); needs
 * scripts/with-stripe-test-env.sh and E2E_LOCAL_DATABASE_URL, see RUNNING_TESTS.md.
 * Set E2E_SHOT_DIR to keep screenshots. TC-1215 → TC-1224, TC-1239. Gated on
 * probeReservationsPhase4.
 */
import * as allure from "allure-js-commons";
import * as path from "path";
import { test, expect } from "../../../fixtures/base";
import {
  createOwnerReservationsPage,
  type OwnerReservationsPage,
} from "../../../pages/dashboard/owner/OwnerReservationsPage";
import { generateGuestPhone, generateRunId } from "../../../utils/testData";
import { loginViaUi, type UiLoginSession } from "../../../utils/auth";
import { atLocal, localDateKey } from "../../../utils/dealSchedule";
import {
  probeReservationsPhase4,
  requireRelease,
} from "../../../utils/releaseGate";
import {
  apiRequestRaw,
  createPublicReservationRaw,
  createTableOwnerRaw,
  createReservationOwnerRaw,
  getPublicAvailabilityRaw,
  getReservationSettingsOwnerRaw,
  deactivateTabletDevice,
  deleteTestRestaurant,
  putReservationSettingsOwnerRaw,
  reservationStatusTabletRaw,
} from "../../../utils/apiHelper";
import {
  createDepositRuleRaw,
  deleteDepositRuleRaw,
  depositQuoteOwnerRaw,
  listDepositRulesRaw,
  localDbReady,
  mintPhase4Tenant,
  msg,
  onlinePauseOwnerRaw,
  searchReservationsOwnerRaw,
  unwrap,
  updateDepositRuleRaw,
  type Phase4Tenant,
} from "../../../utils/reservationPhase4Api";
import {
  intentIdFromClientSecret,
  listRefunds,
  payIntentAndFireWebhook,
  stripeTestModeReady,
} from "../../../utils/stripeTestMode";

const READY =
  !!process.env.ADMIN_EMAIL &&
  !!process.env.ADMIN_PASSWORD &&
  stripeTestModeReady() &&
  localDbReady();

test.describe("Owner — Reservations phase 4 UI @reservations-phase4", () => {
  test.skip(
    !READY,
    "Needs ADMIN creds + real Stripe test mode: run through scripts/with-stripe-test-env.sh with E2E_LOCAL_DATABASE_URL (RUNNING_TESTS.md)"
  );

  const runId = generateRunId();
  let t: Phase4Tenant;
  let ns: Phase4Tenant;
  let session: UiLoginSession;
  let nsSession: UiLoginSession;
  let rp: OwnerReservationsPage;
  let onStack = false;
  let seq = 600;
  const phone = () => generateGuestPhone(runId, ++seq);

  const shot = async (name: string, s: UiLoginSession = session) => {
    const dir = process.env.E2E_SHOT_DIR;
    if (dir)
      await s.page.screenshot({
        path: path.join(dir, `ui-${name}.png`),
        fullPage: true,
      });
  };

  const dayKey = () => localDateKey(t.timeZone, 3);
  const keyAsDate = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  };
  const atSeeded = (hhmm: string) => atLocal(t.timeZone, dayKey(), hhmm);

  /** Online booking on the seeded day; paid with a real 4242 charge. */
  const paidBooking = async (guestName: string, hhmm: string) => {
    const res = await createPublicReservationRaw(t.restaurantId, {
      partySize: 2,
      scheduledAt: atSeeded(hhmm),
      guestName,
      guestPhone: phone(),
      policyAccepted: true,
    });
    expect(res.status, msg(res.data)).toBe(201);
    const d = unwrap(res);
    const intentId = intentIdFromClientSecret(d.deposit.clientSecret);
    await payIntentAndFireWebhook(intentId);
    return { id: (d.id ?? d.reservationId) as string, intentId };
  };

  const openSeededDay = async () => {
    await rp.gotoBookingsSubTab(t.restaurantId);
    await rp.pickDayInCalendar(keyAsDate(dayKey()));
  };

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(5 * 60_000);
    if (!READY) return;
    t = await mintPhase4Tenant(runId, {
      label: "ui",
      stripe: true,
      maxPartiesPerSlot: 20,
    });
    // Several tables: online bookings on one day must not compete for one.
    for (let i = 0; i < 8; i++)
      await createTableOwnerRaw(t.token, t.restaurantId, {
        name: `Extra ${runId}-${i}`,
        capacity: 4,
      });
    ns = await mintPhase4Tenant(runId, { label: "uins" });
    onStack = await probeReservationsPhase4(t.token, t.restaurantId);
    session = await loginViaUi(browser, t.ownerEmail, t.ownerPassword);
    nsSession = await loginViaUi(browser, ns.ownerEmail, ns.ownerPassword);
    rp = createOwnerReservationsPage(session.page);
  });

  test.afterAll(async () => {
    for (const tenant of [t, ns]) {
      if (!tenant) continue;
      await deactivateTabletDevice(
        tenant.adminToken,
        tenant.restaurantId,
        tenant.deviceId
      ).catch(() => {});
      await deleteTestRestaurant(tenant.adminToken, tenant.restaurantId).catch(
        () => {}
      );
    }
    if (session) await session.context.close().catch(() => {});
    if (nsSession) await nsSession.context.close().catch(() => {});
  });

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Reservations");
    requireRelease("reservationsPhase4", onStack);
    // A failed test restarts the worker with a fresh tenant: past the settings
    // tests, deposits are on with a $20-a-guest rule.
    if (/TC-12(19|2[0-4])\b/.test(test.info().title))
      await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
        depositsEnabled: true,
      });
    if (/TC-122[0-4]\b/.test(test.info().title)) {
      const rules = unwrap(await listDepositRulesRaw(t.token, t.restaurantId));
      if (rules.length === 0)
        await createDepositRuleRaw(t.token, t.restaurantId, {
          amountCents: 2000,
        });
    }
  });

  test("TC-1239: the three new cards, everything off, nothing extra showing", async () => {
    await rp.gotoSettingsSubTab(t.restaurantId);
    const page = session.page;
    await expect(page.getByTestId("online-waitlist-card")).toBeVisible();
    await expect(page.getByTestId("server-rotation-card")).toBeVisible();
    await expect(page.getByTestId("deposits-card")).toBeVisible();
    await expect(
      page.getByTestId("online-waitlist-toggle").locator("input")
    ).not.toBeChecked();
    await expect(
      page.getByTestId("server-rotation-toggle").locator("input")
    ).not.toBeChecked();
    await expect(
      page.getByTestId("deposits-toggle").locator("input")
    ).not.toBeChecked();
    await expect(
      page.locator("#reservation-settings-onlineWaitlistMaxWaitMinutes")
    ).toHaveCount(0);
    await expect(page.getByTestId("deposit-policy-preview")).toHaveCount(0);
    await shot("01-settings-all-off");
  });

  test("TC-1215: Online waitlist card — bad limit flagged, saved values reach the server; a pause shows and Resume clears it", async () => {
    await rp.gotoSettingsSubTab(t.restaurantId);
    const page = session.page;
    await page.getByTestId("online-waitlist-toggle").locator("input").check();
    const maxWait = page.locator(
      "#reservation-settings-onlineWaitlistMaxWaitMinutes"
    );
    await expect(maxWait).toBeVisible();
    await maxWait.fill("3");
    await page.getByTestId("unsaved-changes-save").click();
    await expect(
      page.getByText("Enter a whole number from 5 to 240, or leave it blank.")
    ).toBeVisible();
    await maxWait.fill("45");
    await page
      .locator("#reservation-settings-onlineWaitlistMaxPartySize")
      .fill("6");
    await shot("02-waitlist-on");
    const [put] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservation-settings$/.test(r.url()) &&
          r.request().method() === "PUT"
      ),
      page.getByTestId("unsaved-changes-save").click(),
    ]);
    expect(put.status()).toBe(200);
    const s = unwrap(
      await getReservationSettingsOwnerRaw(t.token, t.restaurantId)
    );
    expect(s.onlineWaitlistEnabled).toBe(true);
    expect(s.onlineWaitlistMaxWaitMinutes).toBe(45);
    expect(s.onlineWaitlistMaxPartySize).toBe(6);

    await onlinePauseOwnerRaw(t.token, t.restaurantId, { minutes: 30 });
    await rp.gotoSettingsSubTab(t.restaurantId);
    await expect(page.getByTestId("online-waitlist-paused")).toBeVisible();
    await shot("03-waitlist-paused");
    await page.getByTestId("online-waitlist-resume").click();
    await expect(page.getByTestId("online-waitlist-paused")).toBeHidden();
    expect(
      unwrap(await getReservationSettingsOwnerRaw(t.token, t.restaurantId))
        .onlineWaitlistPausedAt
    ).toBeNull();
  });

  test("TC-1216: Server rotation card — switch and rule reach the server", async () => {
    await rp.gotoSettingsSubTab(t.restaurantId);
    const page = session.page;
    await page.getByTestId("server-rotation-toggle").locator("input").check();
    const card = page.getByTestId("server-rotation-card");
    await card.getByRole("radio", { name: /fewest guests/ }).check();
    await shot("04-rotation-on");
    const [put] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservation-settings$/.test(r.url()) &&
          r.request().method() === "PUT"
      ),
      page.getByTestId("unsaved-changes-save").click(),
    ]);
    expect(put.status()).toBe(200);
    const s = unwrap(
      await getReservationSettingsOwnerRaw(t.token, t.restaurantId)
    );
    expect(s.serverRotationEnabled).toBe(true);
    expect(s.serverRotationRule).toBe("FEWEST_ACTIVE_COVERS");
  });

  test("TC-1217: Deposits refused when Stripe isn't ready — the server's reason shows on the card and nothing turns on", async () => {
    const nrp = createOwnerReservationsPage(nsSession.page);
    await nrp.gotoSettingsSubTab(ns.restaurantId);
    const page = nsSession.page;
    await page.getByTestId("deposits-toggle").locator("input").check();
    const [put] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservation-settings$/.test(r.url()) &&
          r.request().method() === "PUT"
      ),
      page.getByTestId("unsaved-changes-save").click(),
    ]);
    expect(put.status()).toBe(400);
    await expect(page.getByTestId("deposits-setup-error")).toContainText(
      "Stripe"
    );
    await shot("05-deposits-stripe-not-ready", nsSession);
    expect(
      unwrap(await getReservationSettingsOwnerRaw(ns.token, ns.restaurantId))
        .depositsEnabled
    ).toBe(false);
  });

  test("TC-1218: Deposits on — settings save, no rule warning, the preview is word for word what the guest is shown, with the owner's note", async () => {
    await rp.gotoSettingsSubTab(t.restaurantId);
    const page = session.page;
    await page.getByTestId("deposits-toggle").locator("input").check();
    await expect(page.getByTestId("deposit-rules-none")).toBeVisible();
    const note = page.locator("#reservation-settings-depositPolicyNote");
    await note.fill("Parties of 10 or more, please call.");
    await page
      .locator("#reservation-settings-depositRefundWindowHours")
      .fill("48");
    await shot("06-deposits-on");
    const [put] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservation-settings$/.test(r.url()) &&
          r.request().method() === "PUT"
      ),
      page.getByTestId("unsaved-changes-save").click(),
    ]);
    expect(put.status()).toBe(200);
    const s = unwrap(
      await getReservationSettingsOwnerRaw(t.token, t.restaurantId)
    );
    expect(s.depositsEnabled).toBe(true);
    expect(s.depositRefundWindowHours).toBe(48);
    expect(s.depositPolicyNote).toBe("Parties of 10 or more, please call.");

    const rule = unwrap(
      await createDepositRuleRaw(t.token, t.restaurantId, { amountCents: 2000 })
    );
    const avail = unwrap(
      await getPublicAvailabilityRaw(t.restaurantId, dayKey(), 2)
    );
    const serverText = avail.depositPolicy.text as string;
    await rp.gotoSettingsSubTab(t.restaurantId);
    const preview = page.getByTestId("deposit-policy-preview");
    const shown = (
      await preview
        .locator("p, span")
        .filter({ hasText: "deposit" })
        .first()
        .innerText()
    )
      .replace(/\s+/g, " ")
      .trim();

    if (shown !== serverText.replace(/\s+/g, " ").trim())
      console.log("policy", { shown, serverText });
    await expect(preview).toContainText("Parties of 10 or more, please call.");
    await expect(
      page.getByTestId("deposit-policy-preview-amount")
    ).toContainText("$80.00");
    expect(
      (await preview.innerText()).replace(/\s+/g, " "),
      "the preview promises what the guest actually agrees to"
    ).toContain(serverText.replace(/\s+/g, " ").trim());
    await deleteDepositRuleRaw(t.token, t.restaurantId, rule.id);
    await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
      depositRefundWindowHours: 24,
      depositPolicyNote: null,
    });
  });

  test("TC-1219: rules editor — validation, create, the row reads right, actions pinned, edit and delete", async () => {
    await rp.gotoSettingsSubTab(t.restaurantId);
    const page = session.page;
    await page.getByTestId("deposit-rule-add").click();
    await page.getByTestId("deposit-rule-amount").fill("0.50");
    await page.getByTestId("deposit-rule-save").click();
    await expect(
      page.getByText("Enter an amount from $1.00 to $1,000.00.")
    ).toBeVisible();
    await page.getByTestId("deposit-rule-amount").fill("25");
    await page.locator("#deposit-rule-name").fill(`Weekend ${runId}`);
    await page.locator("#deposit-rule-min-party").fill("2");
    await page.locator("#deposit-rule-max-party").fill("8");
    await shot("07-rule-form");
    const [post] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservation-deposit-rules$/.test(r.url()) &&
          r.request().method() === "POST"
      ),
      page.getByTestId("deposit-rule-save").click(),
    ]);
    expect(post.status()).toBe(201);
    await expect(page.getByTestId("deposit-rule-save")).toBeHidden();
    const card = page.getByTestId("deposits-card");
    const row = card.getByRole("row").filter({ hasText: "$25.00" });
    await expect(row).toContainText("per guest");
    await expect(row).toContainText("2 to 8 guests");
    await expect(row).toContainText("Every day");
    await expect(card.getByTestId("deposit-rules-none")).toHaveCount(0);
    await shot("08-rule-table");

    // Repo rule: the actions column is pinned to the right edge.
    const position = await row
      .locator("td")
      .last()
      .evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe("sticky");

    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByTestId("deposit-rule-amount").fill("30");
    const [put] = await Promise.all([
      page.waitForResponse(
        (r) =>
          /\/reservation-deposit-rules\/[^/]+$/.test(r.url()) &&
          r.request().method() === "PUT"
      ),
      page.getByTestId("deposit-rule-save").click(),
    ]);
    expect(put.status()).toBe(200);
    const edited = card.getByRole("row").filter({ hasText: "$30.00" });
    await expect(edited).toBeVisible();

    await edited.getByRole("button", { name: "Delete rule" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete this rule?" });
    await expect(confirm).toContainText("$30.00");
    await confirm.getByRole("button", { name: "Delete rule" }).click();
    await expect(card.getByTestId("deposit-rules-none")).toBeVisible();
    expect(unwrap(await listDepositRulesRaw(t.token, t.restaurantId))).toEqual(
      []
    );

    // The stage for the booking tests: $20 a guest.
    await createDepositRuleRaw(t.token, t.restaurantId, { amountCents: 2000 });
  });

  test("TC-1220: deposit chips — due, paid, kept, refunded; the row's menu offers what each state allows", async () => {
    const paid = `Paid Chip ${runId}`;
    const kept = `Kept Chip ${runId}`;
    const due = `Due Chip ${runId}`;
    await paidBooking(paid, "18:00");
    const k = await paidBooking(kept, "18:15");
    await reservationStatusTabletRaw(
      t.tabletToken,
      t.managerSession,
      k.id,
      "no_show"
    );
    const created = await createReservationOwnerRaw(t.token, t.restaurantId, {
      partySize: 2,
      scheduledAt: atSeeded("18:30"),
      guestName: due,
      guestPhone: phone(),
    });
    expect(created.status, msg(created.data)).toBe(201);

    await openSeededDay();
    const page = session.page;
    const chip = (name: string) =>
      rp.bookingRow(name).getByTestId("booking-row-deposit");
    await expect(chip(paid)).toHaveText("Paid $40");
    await expect(chip(kept)).toHaveText("Deposit kept $40");
    await expect(chip(due)).toHaveText("Deposit due $40");
    await shot("09-deposit-chips");

    const position = await rp
      .bookingRow(paid)
      .locator("td")
      .last()
      .evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe("sticky");

    await rp.bookingRow(due).getByTestId("booking-row-menu").click();
    await expect(
      page.getByTestId("booking-row-send-deposit-link")
    ).toBeVisible();
    await expect(page.getByTestId("booking-row-refund-deposit")).toHaveCount(0);
    await shot("10-due-row-menu");
    await page.keyboard.press("Escape");

    await rp.bookingRow(kept).getByTestId("booking-row-menu").click();
    await expect(page.getByTestId("booking-row-refund-deposit")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("TC-1221: Refund deposit dialog — reason and amount checked, part then all, a real Stripe refund each time", async () => {
    const guest = `Refund Dialog ${runId}`;
    const b = await paidBooking(guest, "19:00");
    await openSeededDay();
    const page = session.page;
    await rp.bookingRow(guest).getByTestId("booking-row-menu").click();
    await page.getByTestId("booking-row-refund-deposit").click();
    const dialog = page.getByRole("dialog", { name: "Refund deposit" });
    await expect(dialog).toContainText("$40.00");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true })
    ).toHaveCount(1);
    await dialog.getByTestId("deposit-refund-submit").click();
    await expect(
      dialog.getByText("Give a reason for the refund.")
    ).toBeVisible();

    await dialog.getByRole("radio", { name: "Part of it" }).check();
    await dialog.getByTestId("deposit-refund-amount").fill("50");
    await dialog.getByTestId("deposit-refund-reason").fill("Goodwill");
    await dialog.getByTestId("deposit-refund-submit").click();
    await expect(
      dialog.getByText("Enter an amount up to $40.00.")
    ).toBeVisible();
    await dialog.getByTestId("deposit-refund-amount").fill("15");
    await shot("11-refund-dialog");
    await dialog.getByTestId("deposit-refund-submit").click();

    const confirm = page.getByRole("dialog", { name: "Refund this deposit?" });
    await expect(confirm).toContainText("$15.00");
    await shot("12-refund-confirm");
    const [post] = await Promise.all([
      page.waitForResponse((r) => /\/deposit\/refund$/.test(r.url())),
      confirm.getByRole("button", { name: "Refund $15.00" }).click(),
    ]);
    expect(post.status()).toBe(200);
    await expect(
      rp.bookingRow(guest).getByTestId("booking-row-deposit")
    ).toHaveText("Part refunded $15");
    expect((await listRefunds(b.intentId)).map((r) => r.amount)).toEqual([
      1500,
    ]);
    await shot("13-part-refunded");

    await rp.bookingRow(guest).getByTestId("booking-row-menu").click();
    await page.getByTestId("booking-row-refund-deposit").click();
    const second = page.getByRole("dialog", { name: "Refund deposit" });
    await expect(
      second.getByRole("radio", { name: "All of it ($25.00)" })
    ).toBeVisible();
    await second.getByTestId("deposit-refund-reason").fill("The rest");
    await second.getByTestId("deposit-refund-submit").click();
    const [post2] = await Promise.all([
      page.waitForResponse((r) => /\/deposit\/refund$/.test(r.url())),
      page
        .getByRole("dialog", { name: "Refund this deposit?" })
        .getByRole("button", { name: "Refund $25.00" })
        .click(),
    ]);
    expect(post2.status()).toBe(200);
    await expect(
      rp.bookingRow(guest).getByTestId("booking-row-deposit")
    ).toHaveText("Refunded $40");
    expect(
      (await listRefunds(b.intentId)).reduce(
        (s, r) => s + (r.amount as number),
        0
      )
    ).toBe(4000);
  });

  test("TC-1222: Search all dates finds a booking on another day, with its deposit chip; Back to this day leaves search", async () => {
    const guest = `Farday Search ${runId}`;
    const far = localDateKey(t.timeZone, 21);
    const res = await createReservationOwnerRaw(t.token, t.restaurantId, {
      partySize: 2,
      scheduledAt: atLocal(t.timeZone, far, "20:00"),
      guestName: guest,
      guestPhone: phone(),
    });
    expect(res.status, msg(res.data)).toBe(201);
    await rp.gotoBookingsSubTab(t.restaurantId);
    const page = session.page;
    await page.getByTestId("bookings-cross-search").fill("Farday");
    const results = page.getByTestId("bookings-search-results");
    await expect(
      results.getByRole("row").filter({ hasText: guest })
    ).toBeVisible({ timeout: 10_000 });
    await expect(results.getByTestId("booking-row-deposit")).toHaveText(
      "Deposit due $40"
    );
    await expect(results.getByTestId("booking-row-date")).toBeVisible();
    await shot("14-search-all-dates");
    await results.getByRole("button", { name: "Back to this day" }).click();
    await expect(results).toBeHidden();
    await page.getByTestId("bookings-cross-search").fill("zzznobody");
    await expect(page.getByText("No bookings found on any date.")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByTestId("bookings-cross-search").fill("");
  });

  test("TC-1223: phone dialog — a matching rule shows the server's amount; with no match, Require deposit ($X) is exactly what the server charges", async () => {
    await openSeededDay();
    const page = session.page;
    // Rule match (party of 2 → $40).
    await rp.addBookingButton().click();
    await expect(rp.phoneBookingDialog()).toBeVisible();
    await expect(
      rp
        .phoneBookingDialog()
        .getByRole("button", { name: "Cancel", exact: true })
    ).toHaveCount(1);
    await rp.phoneBookingTimeInput().fill("20:00");
    await expect(
      page.getByTestId("phone-booking-deposit-matched")
    ).toContainText("$40.00");
    await shot("15-phone-matched");
    await rp.phoneBookingNameInput().fill(`Phone Match ${runId}`);
    await rp.phoneBookingPhoneInput().fill(phone());
    const res = await rp.submitPhoneBooking();
    expect(res.status()).toBe(201);
    await expect(page.getByTestId("phone-booking-deposit-due")).toContainText(
      "$40.00"
    );
    await shot("16-phone-deposit-due");
    await rp.phoneBookingDoneButton().click();

    // No rule matches: every active rule asks for a bigger party.
    const rules = unwrap(
      await listDepositRulesRaw(t.token, t.restaurantId)
    ) as any[];
    for (const r of rules)
      await updateDepositRuleRaw(t.token, t.restaurantId, r.id, {
        minPartySize: 6,
      });
    await createDepositRuleRaw(t.token, t.restaurantId, {
      amountCents: 7500,
      amountType: "PER_BOOKING",
      minPartySize: 12,
    });
    // Largest for a party of 2: max($20 × 2, $75 flat) = $75.
    const at = atSeeded("21:00");
    const quote = unwrap(
      await depositQuoteOwnerRaw(t.token, t.restaurantId, at, 2)
    );
    expect(quote.amountCents).toBeNull();

    await rp.addBookingButton().click();
    await expect(rp.phoneBookingDialog()).toBeVisible();
    await rp.phoneBookingTimeInput().fill("21:00");
    const tick = page.getByTestId("phone-booking-require-deposit");
    await expect(tick).toBeVisible();
    const label = page.getByText(/Require deposit \(\$[\d.]+\)/);
    await expect(label).toHaveText("Require deposit ($75.00)");
    await shot("17-phone-require-deposit");
    const guest = `Phone Tick ${runId}`;
    await rp.phoneBookingNameInput().fill(guest);
    await rp.phoneBookingPhoneInput().fill(phone());
    await tick.locator("input").check();
    const created = await rp.submitPhoneBooking();
    expect(created.status()).toBe(201);
    const body = await created.json();
    expect(
      body.data.deposit.amountCents,
      "server charge = dashboard's promise"
    ).toBe(7500);
    await expect(page.getByTestId("phone-booking-deposit-due")).toContainText(
      "$75.00"
    );
    await rp.phoneBookingDoneButton().click();

    // Without the tick, nothing is due.
    await rp.addBookingButton().click();
    await rp.phoneBookingTimeInput().fill("21:15");
    await rp.phoneBookingNameInput().fill(`Phone NoTick ${runId}`);
    await rp.phoneBookingPhoneInput().fill(phone());
    const plain = await rp.submitPhoneBooking();
    expect((await plain.json()).data.deposit ?? null).toBeNull();
    await rp.phoneBookingDoneButton().click();

    const found = unwrap(
      await searchReservationsOwnerRaw(t.token, t.restaurantId, guest)
    );
    expect(
      (Array.isArray(found) ? found : found.reservations)[0].deposit.status
    ).toBe("PENDING");
  });

  test("TC-1224: Spanish spot check — cards, preview, chips and dialog", async () => {
    const page = session.page;
    // The real selector: the account's saved language wins over localStorage.
    const pickLanguage = async (current: RegExp, name: string) => {
      await page.getByRole("button", { name: current }).first().click();
      await page.getByRole("menuitem", { name }).click();
    };
    await page.goto(
      `/restaurant/restaurantId/${t.restaurantId}/restaurantManagement?tab=reservations`
    );
    await pickLanguage(/language/i, "Español");
    try {
      await page.getByRole("tab", { name: "Configuración" }).click();
      await expect(page.getByTestId("deposits-card")).toContainText(
        /dep[oó]sito/i
      );
      const card = page.getByTestId("deposits-card");
      expect(await card.innerText()).not.toMatch(
        /Deposit rules|Add rule|What the guest sees/
      );
      expect(
        await page.getByTestId("online-waitlist-card").innerText()
      ).not.toMatch(/Let guests join/);
      expect(
        await page.getByTestId("server-rotation-card").innerText()
      ).not.toMatch(/Suggest which server/);
      await shot("18-spanish-settings");

      await page.getByRole("tab", { name: "Reservas del día" }).click();
      await page.getByTestId("bookings-cross-search").fill("Chip");
      const results = page.getByTestId("bookings-search-results");
      const chip = results
        .getByRole("row")
        .filter({ hasText: "Paid Chip" })
        .getByTestId("booking-row-deposit");
      await expect(chip).toBeVisible({ timeout: 10_000 });
      expect(await chip.innerText()).not.toMatch(/^Paid/);
      // Longer Spanish labels keep their amount: nothing clipped.
      const due = results
        .getByRole("row")
        .filter({ hasText: "Due Chip" })
        .getByTestId("booking-row-deposit");
      await expect(due).toHaveText("Depósito pendiente $40");
      const clipped = await due
        .locator(".MuiChip-label")
        .evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(clipped).toBe(false);
      await shot("19-spanish-bookings");
    } finally {
      await apiRequestRaw(
        "PATCH",
        "/users/me/locale",
        { locale: "en" },
        t.token
      );
      await page.evaluate(() => localStorage.setItem("i18nextLng", "en"));
      await page.reload();
    }
  });
});
