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

  /** Always requires 3DS authentication */
  VISA_3DS_REQUIRED: "4000002500003155",

  /** 3DS authentication can be completed or skipped */
  VISA_3DS_OPTIONAL: "4000002760003184",

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
} as const;

/** Common expiry/CVC/ZIP values that pass Stripe validation */
export const STRIPE_DEFAULTS = {
  EXPIRY_MONTH: "12",
  EXPIRY_YEAR: "2030",
  CVC: "123",
  ZIP: "10001",
} as const;
