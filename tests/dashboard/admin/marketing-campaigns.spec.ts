import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";
import { createAdminMarketingPage } from "../../../pages/dashboard/admin/AdminMarketingPage";
import {
  apiLogin,
  createMarketingEventApi,
  createOrgCouponApi,
  deleteMarketingEventApi,
  deleteOrgCouponApi,
  getMarketingEventsApi,
  renewEventCouponRaw,
} from "../../../utils/apiHelper";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

/**
 * Admin — Campaign Scheduler events (the pre-existing event/campaign service).
 *
 * Regression suite for the 2026-07-19 campaign-lifecycle fixes (RestauNax
 * #506): derived event status + Upcoming/Past/All filter, seed dedup (no
 * duplicate holiday rows), and renew idempotency (the original bug: a second
 * Renew failed with "coupon already exists").
 */
test.describe("Admin — Marketing campaign events", () => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "ADMIN_EMAIL / ADMIN_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Admin Marketing Campaigns");
    await allure.label("severity", "normal");
  });

  test("TC-198: events list defaults to Upcoming and Past shows only finished events", async ({
    adminPage,
  }) => {
    await allure.description(
      "The Events sub-tab opens on the Upcoming filter; switching to Past never shows Upcoming-status rows (expired events no longer pollute the default view)."
    );
    const marketing = createAdminMarketingPage(adminPage);

    await allure.step("Open Campaign Scheduler → Events", async () => {
      await marketing.gotoCampaignScheduler();
      await marketing.openEventsSubTab();
    });

    await allure.step("Default filter is Upcoming", async () => {
      await marketing.assertDefaultFilterIsUpcoming();
    });

    await allure.step("Past filter shows no Upcoming rows", async () => {
      await marketing.selectEventFilter("Past");
      await expect(marketing.statusChips("Upcoming")).toHaveCount(0);
    });
  });

  test("TC-199: recurring holiday events are never duplicated across years", async () => {
    await allure.description(
      "Seed dedup regression: after renewals + container-restart seeds, each recurring holiday exists exactly once (the original bug re-created current-year duplicates pointing at expired coupons)."
    );
    const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);
    const events = await getMarketingEventsApi(accessToken, "all");

    const recurringNames = events
      .filter((e) => e.isRecurring)
      .map((e) => e.name.trim().toLowerCase());
    const duplicates = recurringNames.filter(
      (name, i) => recurringNames.indexOf(name) !== i
    );
    expect(
      duplicates,
      `Duplicated recurring events: ${[...new Set(duplicates)].join(", ")}`
    ).toHaveLength(0);
  });

  test("TC-211: the org coupon form supports Free Delivery with no discount value", async ({
    adminPage,
  }) => {
    await allure.description(
      "The admin Create Organization Coupon form offers the Free Delivery type; selecting it hides the Discount Value field (the fee waiver is computed at checkout) and repurposes Maximum Discount as the fee cap. Form is cancelled — nothing is created."
    );
    await adminPage.goto("/admin?tab=marketing&section=coupons", {
      waitUntil: "domcontentloaded",
    });

    await allure.step("Open the Create Coupon form", async () => {
      await adminPage
        .getByRole("button", { name: "Create Coupon", exact: true })
        .first()
        .click();
      await expect(
        adminPage.getByText("Create Organization Coupon")
      ).toBeVisible();
    });

    await allure.step(
      "Free Delivery hides the value field, keeps the fee cap",
      async () => {
        await adminPage.locator("#mui-component-select-type").click();
        await adminPage
          .getByRole("option", { name: "Free Delivery", exact: true })
          .click();
        await expect(adminPage.getByText("Discount Value")).toBeHidden();
        // The generic max-discount field is relabeled as the fee cap
        await expect(
          adminPage.getByText("Covers Delivery Fee Up To")
        ).toBeVisible();
      }
    );

    await allure.step("Cancel without creating", async () => {
      await adminPage
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await expect(
        adminPage.getByText("Create Organization Coupon")
      ).toBeHidden();
    });
  });

  test("TC-200: renewing an event coupon is idempotent (second renew succeeds as reuse)", async () => {
    await allure.description(
      "Create an org coupon + recurring event via API, renew twice. Both calls must succeed — the second reuses/repairs the existing next-year coupon instead of failing with 'coupon already exists' (the original bug)."
    );
    const { accessToken } = await apiLogin(ADMIN_EMAIL, ADMIN_PASSWORD);

    // AUTO* prefix → swept by globalTeardown if cleanup below is interrupted.
    // Trailing 2 digits are required: renew derives next year's code by
    // replacing them (…26 → …27).
    const suffix = Date.now().toString().slice(-5);
    const code = `AUTORNW${suffix}26`;
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getFullYear(), 11, 31);

    let couponId = "";
    let eventId = "";
    let renewedCouponId = "";
    try {
      await allure.step("Create org coupon + recurring event", async () => {
        const coupon = await createOrgCouponApi(accessToken, {
          code,
          type: "PERCENTAGE",
          value: 10,
          description: "Automation renew-idempotency fixture",
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          autoEnrollRestaurants: false,
        });
        couponId = coupon.id;
        const event = await createMarketingEventApi(accessToken, {
          name: `AUTO Renew Fixture ${suffix}`,
          eventDate: end.toISOString(),
          couponId: coupon.id,
          isRecurring: true,
        });
        eventId = event.id;
      });

      await allure.step("First renew succeeds", async () => {
        const first = await renewEventCouponRaw(accessToken, eventId);
        expect(first.ok, JSON.stringify(first.data)).toBe(true);
        expect(first.data.success).toBe(true);
        renewedCouponId = first.data.coupon?.id ?? "";
      });

      await allure.step(
        "Second renew ALSO succeeds (reuse, not 'already exists')",
        async () => {
          const second = await renewEventCouponRaw(accessToken, eventId);
          expect(second.ok, JSON.stringify(second.data)).toBe(true);
          expect(second.data.success).toBe(true);
        }
      );
    } finally {
      if (eventId) {
        await deleteMarketingEventApi(accessToken, eventId).catch(() => {});
      }
      if (renewedCouponId && renewedCouponId !== couponId) {
        await deleteOrgCouponApi(accessToken, renewedCouponId).catch(() => {});
      }
      if (couponId) {
        await deleteOrgCouponApi(accessToken, couponId).catch(() => {});
      }
    }
  });
});
