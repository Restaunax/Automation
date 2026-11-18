/**
 * stripeTestMode.ts — real Stripe TEST-mode payments for the deposit specs, and
 * real webhook delivery to the backend under test without `stripe listen`.
 *
 * `stripe listen` signs with its own secret, which a backend that is already
 * running won't accept. Instead: read the REAL event Stripe emitted from the
 * Events API and POST it to /api/stripe/webhook, signed with the secret the
 * backend runs with — signature check, idempotency and routing all run for real.
 *
 * Needs E2E_STRIPE_SECRET_KEY + E2E_STRIPE_WEBHOOK_SECRET
 * (scripts/with-stripe-test-env.sh sets them from Infisical without echoing).
 * Refuses anything but a test key. Without them `stripeTestModeReady()` is
 * false and the money tests skip.
 */
import * as crypto from "crypto";
import { BACKEND_URL } from "./apiHelper";

const secretKey = () => process.env.E2E_STRIPE_SECRET_KEY ?? "";
const webhookSecret = () => process.env.E2E_STRIPE_WEBHOOK_SECRET ?? "";

export const stripeTestModeReady = (): boolean => {
  const key = secretKey();
  if (key && !/^(sk|rk)_test_/.test(key))
    throw new Error(
      "E2E_STRIPE_SECRET_KEY is not a Stripe TEST key — refusing"
    );
  return !!key && !!webhookSecret();
};

export type StripeObject = Record<string, any>;

export async function stripeApi(
  method: "GET" | "POST",
  path: string,
  params: Record<string, string> = {}
): Promise<{ status: number; data: StripeObject }> {
  if (!stripeTestModeReady())
    throw new Error("Stripe test mode is not configured for this run");
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(
    `https://api.stripe.com/v1${path}${method === "GET" && qs ? `?${qs}` : ""}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${secretKey()}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: method === "POST" ? qs : undefined,
    }
  );
  return { status: res.status, data: (await res.json()) as StripeObject };
}

/** "pi_123_secret_abc" → "pi_123". */
export const intentIdFromClientSecret = (clientSecret: string): string =>
  clientSecret.split("_secret_")[0]!;

export const retrieveIntent = async (intentId: string) =>
  (await stripeApi("GET", `/payment_intents/${intentId}`)).data;

/** The refunds of an intent, newest first. */
export const listRefunds = async (intentId: string): Promise<StripeObject[]> =>
  (
    await stripeApi("GET", "/refunds", {
      payment_intent: intentId,
      limit: "20",
    })
  ).data.data as StripeObject[];

/**
 * Confirm the intent server-side with a test PaymentMethod, the way the Payment
 * Element would. A decline answers 402, which is what the caller wants to see.
 */
export const confirmIntent = (
  intentId: string,
  paymentMethod: "pm_card_visa" | "pm_card_chargeDeclined"
) =>
  stripeApi("POST", `/payment_intents/${intentId}/confirm`, {
    payment_method: paymentMethod,
  });

/** The real event Stripe emitted for this object (polls: events lag a moment). */
export async function findStripeEvent(
  type: string,
  objectId: string,
  {
    sinceSeconds = 3600,
    attempts = 30,
    match = (o: StripeObject) => o.id === objectId,
  }: {
    sinceSeconds?: number;
    attempts?: number;
    match?: (o: StripeObject) => boolean;
  } = {}
): Promise<StripeObject> {
  const gte = String(Math.floor(Date.now() / 1000) - sinceSeconds);
  for (let i = 0; i < attempts; i++) {
    const res = await stripeApi("GET", "/events", {
      type,
      "created[gte]": gte,
      limit: "100",
    });
    const hit = (res.data.data as StripeObject[] | undefined)?.find((e) =>
      match(e.data.object as StripeObject)
    );
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Stripe never emitted ${type} for ${objectId}`);
}

/** Same header `stripe.webhooks.generateTestHeaderString` builds. */
const signPayload = (payload: string): string => {
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto
    .createHmac("sha256", webhookSecret())
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
};

/** POST an event to the running backend's webhook route, signed. */
export async function deliverStripeEvent(
  event: StripeObject
): Promise<{ status: number; body: string }> {
  const payload = JSON.stringify(event);
  const res = await fetch(`${BACKEND_URL}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signPayload(payload),
    },
    body: payload,
  });
  return { status: res.status, body: await res.text() };
}

/** A body signed with the wrong secret, for the "signature is checked" test. */
export async function deliverBadlySignedEvent(
  event: StripeObject
): Promise<number> {
  const payload = JSON.stringify(event);
  const res = await fetch(`${BACKEND_URL}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"0".repeat(64)}`,
    },
    body: payload,
  });
  return res.status;
}

/** Find the real event for the object and deliver it; throws unless accepted. */
export async function fireStripeEvent(
  type: string,
  objectId: string,
  opts: Parameters<typeof findStripeEvent>[2] = {}
): Promise<StripeObject> {
  const event = await findStripeEvent(type, objectId, opts);
  const res = await deliverStripeEvent(event);
  if (res.status >= 400)
    throw new Error(`webhook ${type} answered ${res.status}: ${res.body}`);
  return event;
}

/** Pay an intent with 4242 and deliver payment_intent.succeeded. */
export async function payIntentAndFireWebhook(intentId: string): Promise<void> {
  const res = await confirmIntent(intentId, "pm_card_visa");
  if (res.status !== 200 || res.data.status !== "succeeded")
    throw new Error(
      `confirm failed: ${JSON.stringify(res.data.error ?? res.data.status)}`
    );
  await fireStripeEvent("payment_intent.succeeded", intentId);
}

/**
 * A real test connected account that can take a destination charge. Dummy
 * onboarding can't get there (Stripe won't let the platform accept an Express
 * account's ToS), but a Custom test account takes everything from the API; it
 * only exists in test mode and only for the tenant that asked for it.
 */
export async function createChargeableTestAccount(): Promise<string> {
  const res = await stripeApi("POST", "/accounts", {
    type: "custom",
    country: "US",
    email: "auto-deposit-account@restaunax.test",
    "capabilities[card_payments][requested]": "true",
    "capabilities[transfers][requested]": "true",
    business_type: "individual",
    "business_profile[mcc]": "5812",
    "business_profile[url]": "https://restaunax.com",
    "individual[first_name]": "Test",
    "individual[last_name]": "Owner",
    "individual[email]": "auto-deposit-account@restaunax.test",
    "individual[phone]": "+12025550100",
    "individual[dob][day]": "1",
    "individual[dob][month]": "1",
    "individual[dob][year]": "1901",
    "individual[ssn_last_4]": "0000",
    "individual[id_number]": "000000000",
    "individual[address][line1]": "address_full_match",
    "individual[address][city]": "Miami",
    "individual[address][state]": "FL",
    "individual[address][postal_code]": "33101",
    "external_account[object]": "bank_account",
    "external_account[country]": "US",
    "external_account[currency]": "usd",
    "external_account[routing_number]": "110000000",
    "external_account[account_number]": "000123456789",
    "tos_acceptance[date]": String(Math.floor(Date.now() / 1000)),
    "tos_acceptance[ip]": "203.0.113.5",
  });
  if (res.status !== 200)
    throw new Error(`test account: ${JSON.stringify(res.data.error)}`);
  const id = res.data.id as string;
  for (let i = 0; i < 60; i++) {
    const read = (await stripeApi("GET", `/accounts/${id}`)).data;
    if (read.charges_enabled && read.payouts_enabled) return id;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`test account ${id} never became chargeable`);
}
