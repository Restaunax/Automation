import { type Page } from "@playwright/test";

/**
 * Dashboard — Coupons tab of the Restaurant Management portal. ROLE-AGNOSTIC
 * (Owner / Employee / Admin reach the same screen). STUB POM.
 *
 * GOTCHA: the Coupons tab only renders when the restaurant is entitled to the
 * COUPONS feature AND is not a shipping/email-only store. A test that expects
 * this tab must target a suitably-configured restaurant. See TEST_PLAN.md →
 * "Three gating layers".
 */
export const createCouponsPage = (page: Page) => {
  const createCouponButton = page.getByRole("button", { name: /create coupon/i });

  const goto = async (restaurantId: string): Promise<void> => {
    await page.goto(
      `/restaurant/restaurantId/${restaurantId}/restaurantManagement?tab=coupons`,
      { waitUntil: "domcontentloaded" }
    );
  };

  const startCreateCoupon = async (): Promise<void> => {
    await createCouponButton.click();
  };

  return { goto, startCreateCoupon };
};

export type CouponsPage = ReturnType<typeof createCouponsPage>;
