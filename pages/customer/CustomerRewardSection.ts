import { type Page, expect } from "@playwright/test";

/**
 * The reward section of the template-wind checkout (RewardSection.tsx +
 * AuthModal): OTP sign-in for an existing reward member and point redemption.
 * Selectors were taken from a live playwright-cli walk of QA (2026-10-19):
 *
 *   phone filled in customer info -> "Join Our Rewards Program!" card ->
 *   "Sign In to Existing Account" -> phone field (placeholder "(555) 123-4567")
 *   + "Send Verification Code" -> code field (placeholder "123456") +
 *   "Verify Code" -> "Welcome back, <name>!" / "N points available" ->
 *   "Redeem" -> "Redeem Points" list of "$X.XX off / Use N points" buttons.
 *
 * On QA ENABLE_SMS is off, so any phone verifies with 123456.
 */
export const QA_OTP = "123456";

export const createCustomerRewardSection = (page: Page) => {
  const signInButton = () =>
    page.getByRole("button", { name: "Sign In to Existing Account" });
  const phoneInput = () => page.getByPlaceholder("(555) 123-4567").last();
  const sendCodeButton = () =>
    page.getByRole("button", { name: "Send Verification Code" });
  const codeInput = () => page.getByPlaceholder("123456");
  const verifyButton = () => page.getByRole("button", { name: "Verify Code" });
  // Rendered twice (section header and sign-in summary): take the first.
  const welcome = () =>
    page.getByRole("heading", { name: /^Welcome back/ }).first();
  const redeemButton = () => page.getByRole("button", { name: "Redeem" });
  const redemptionOption = (points: number) =>
    page.getByRole("button", {
      name: new RegExp(`Use ${points} points$`),
    });
  const redemptionApplied = () => page.getByText("Redemption Applied");

  /**
   * Sign the member in. The customer-info phone must already be filled (the
   * section only appears once it is). The sign-in dialog's own phone field is
   * a separate input and is filled again here.
   */
  const signIn = async (phone: string, otp = QA_OTP) => {
    await signInButton().click();
    await phoneInput().fill(phone);
    await sendCodeButton().click();
    await codeInput().fill(otp);
    await verifyButton().click();
    await expect(welcome()).toBeVisible({ timeout: 20_000 });
  };

  /** Redeem exactly `points` (a multiple of the program's step). */
  const redeem = async (points: number) => {
    await redeemButton().click();
    await redemptionOption(points).click();
    await expect(redemptionApplied()).toBeVisible({ timeout: 15_000 });
  };

  return { signIn, redeem, welcome, redemptionApplied };
};
