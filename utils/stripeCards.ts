/**
 * stripeCards.ts
 *
 * Stripe test card numbers for use in payment flow tests.
 * Never use real card numbers in tests. These are safe Stripe test values
 * documented at https://stripe.com/docs/testing
 */

export const STRIPE_CARDS = {
  /** Succeeds and immediately creates a charge */
  VISA_SUCCESS: "4242424242424242",

  /**
   * 3DS required for a one-off payment unless the card was set up for future
   * use first (Stripe "authenticate unless set up").
   */
  VISA_3DS_REQUIRED: "4000002500003155",

  /**
   * 3DS required on EVERY payment, however the card was set up (Stripe
   * regulatory test card, "always authenticate"). In test mode the bank
   * check is Stripe's test page with COMPLETE / FAIL buttons.
   */
  VISA_3DS_ALWAYS: "4000002760003184",

  /** Generic decline */
  DECLINED: "4000000000000002",

  /** Declined with insufficient funds */
  DECLINED_INSUFFICIENT_FUNDS: "4000000000009995",

  /** Declined with incorrect CVC */
  DECLINED_INCORRECT_CVC: "4000000000000127",

  /** Declined — card expired */
  DECLINED_EXPIRED: "4000000000000069",

  /** Dispute immediately after charge */
  DISPUTED: "4000000000000259",

  /** Visa DEBIT (card.funding = "debit") — never surcharged */
  VISA_DEBIT: "4000056655665556",

  /** Mastercard PREPAID (card.funding = "prepaid") — never surcharged */
  MASTERCARD_PREPAID: "5105105105105100",
} as const;

/** Common expiry/CVC/ZIP values that pass Stripe validation */
export const STRIPE_DEFAULTS = {
  EXPIRY_MONTH: "12",
  EXPIRY_YEAR: "2030",
  // Stripe's card expiry input is an "MM / YY" mask — feeding it a 4-digit
  // year gets truncated to the first two digits ("12 / 2030" → "12 / 20",
  // i.e. the year 2020, an expired card). Always fill with this value.
  EXPIRY_MM_YY: "12 / 30",
  CVC: "123",
  ZIP: "10001",
} as const;
