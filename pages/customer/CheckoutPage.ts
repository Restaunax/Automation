import { type Page } from "@playwright/test";

export interface CustomerInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/**
 * Template Wind — /checkout (customer info, service type, tip, order summary).
 * STUB POM — see TEST_PLAN.md.
 */
export const createCheckoutPage = (page: Page) => {
  const continueToPaymentButton = page.getByRole("button", {
    name: /continue to payment/i,
  });

  const goto = async (): Promise<void> => {
    await page.goto("/checkout", { waitUntil: "domcontentloaded" });
  };

  const fillCustomerInfo = async (info: CustomerInfo): Promise<void> => {
    // TODO: fill the guest customer-info fields
    await page.getByPlaceholder(/first/i).fill(info.firstName);
    await page.getByPlaceholder(/last/i).fill(info.lastName);
    await page.getByPlaceholder(/email/i).fill(info.email);
    await page.getByPlaceholder(/phone|\(/i).fill(info.phone);
  };

  const selectServiceType = async (
    type: "PICKUP" | "DELIVERY" | "SHIPPING"
  ): Promise<void> => {
    // TODO: choose the service-type radio
    await page.getByText(type, { exact: false }).first().click();
  };

  const selectTip = async (percentLabel: string): Promise<void> => {
    // TODO: choose a tip percentage button (e.g. "18%")
    await page.getByRole("button", { name: percentLabel }).click();
  };

  const continueToPayment = async (): Promise<void> => {
    await continueToPaymentButton.click();
  };

  return { goto, fillCustomerInfo, selectServiceType, selectTip, continueToPayment };
};

export type CheckoutPage = ReturnType<typeof createCheckoutPage>;
