import { type Page, expect } from "@playwright/test";

// The affiliate portal in the dashboard app (restaunax-frontend
// src/components/Affiliate + src/components/Common/Affiliate):
//   /affiliate, /affiliate/signup  — the program page; signed out it is a
//     call to action, signed in it carries the 4-step application form and
//     the agreement modal.
//   /affiliate/dashboard           — header (tag + status chip), tabs
//     Overview / Your restaurants / Payments (the money cards on Overview and
//     Payments both read `affiliate.money`).
// No data-testids in this feature; locators are role/text-based.
/** The one address the fake Places library offers (see stubGooglePlaces). */
export const FAKE_PLACE = {
  search: "350 5th Ave, New York",
  suggestion: "350 5th Ave, New York, NY 10118, USA",
};

const FAKE_GOOGLE_PLACES_JS = `
(function () {
  var OK = "OK";
  var place = {
    place_id: "automation-fake-place",
    formatted_address: ${JSON.stringify(FAKE_PLACE.suggestion)},
    geometry: { location: { lat: function () { return 40.7484; }, lng: function () { return -73.9857; } } },
    address_components: [
      { types: ["street_number"], long_name: "350", short_name: "350" },
      { types: ["route"], long_name: "5th Avenue", short_name: "5th Ave" },
      { types: ["locality", "political"], long_name: "New York", short_name: "New York" },
      { types: ["administrative_area_level_1", "political"], long_name: "New York", short_name: "NY" },
      { types: ["country", "political"], long_name: "United States", short_name: "US" },
      { types: ["postal_code"], long_name: "10118", short_name: "10118" }
    ]
  };
  function AutocompleteService() {}
  AutocompleteService.prototype.getPlacePredictions = function (req, cb) {
    setTimeout(function () {
      cb([{ place_id: place.place_id, description: place.formatted_address }], OK);
    }, 0);
  };
  function PlacesService() {}
  PlacesService.prototype.getDetails = function (req, cb) {
    setTimeout(function () { cb(place, OK); }, 0);
  };
  function AutocompleteSessionToken() {}
  function Geocoder() {}
  Geocoder.prototype.geocode = function (req, cb) { setTimeout(function () { cb([place], OK); }, 0); };
  window.google = window.google || {};
  window.google.maps = {
    Geocoder: Geocoder,
    places: {
      AutocompleteService: AutocompleteService,
      PlacesService: PlacesService,
      AutocompleteSessionToken: AutocompleteSessionToken,
      PlacesServiceStatus: { OK: OK }
    }
  };
})();
`;

export const createAffiliatePortalPage = (page: Page) => {
  // ── Program page / signup ────────────────────────────────────────────────
  const gotoSignup = async (path = "/affiliate/signup") => {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: "Join Our Affiliate Program" })
      .waitFor({ state: "visible", timeout: 15_000 });
  };

  const startApplicationButton = () =>
    page.getByRole("button", { name: "Start Your Application" });
  const applicationForm = () => page.locator("#application-form");
  // Each Stepper step keeps its content (and its own Continue) in the DOM
  // while the previous one collapses, so scope every Continue to its step.
  const step = (
    title:
      | "Basic Information"
      | "Your Address"
      | "Social Media Links"
      | "Terms and Conditions"
  ) => applicationForm().locator(".MuiStep-root").filter({ hasText: title });
  const continueIn = (title: Parameters<typeof step>[0]) =>
    step(title).getByRole("button", { name: "Continue" });
  const referralTagInput = () =>
    applicationForm().getByRole("textbox", { name: /Your Referral Tag/ });
  const bioInput = () =>
    applicationForm().getByRole("textbox", { name: "Bio" });
  const addressInput = () =>
    applicationForm().getByPlaceholder("Enter your address");
  const agreeCheckbox = () =>
    applicationForm().getByRole("checkbox", {
      name: "I have read and agree to the Affiliate Partner Agreement",
    });
  const submitButton = () =>
    applicationForm().getByRole("button", { name: "Submit Application" });
  const viewAgreementButton = () =>
    applicationForm().getByRole("button", { name: "View Full Agreement" });

  const agreementDialog = () =>
    page
      .getByRole("dialog")
      .filter({ hasText: "RestauNax Affiliate Partner Agreement" });
  const agreeButton = () =>
    agreementDialog().getByRole("button", { name: "I Agree" });

  /** Step 1: tag + bio, then Continue. */
  const fillBasics = async (referralTag: string, bio: string) => {
    await referralTagInput().fill(referralTag);
    await bioInput().fill(bio);
    await continueIn("Basic Information").click();
  };

  /**
   * Replaces the Google Maps script with a minimal fake Places library that
   * offers ONE fixed address. The signup only needs *a* picked place (it
   * sends lat/lng + street/city/state/zip); what is under test is the
   * affiliate flow, not Google. The real key is referrer-restricted (local
   * ports other than the dev default get RefererNotAllowedMapError, so the
   * suggestions never appear) and every real lookup is billed. Call before
   * the first navigation of the page.
   */
  const stubGooglePlaces = async () => {
    await page.route(
      /https:\/\/maps\.googleapis\.com\/maps\/api\/js.*/,
      (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: FAKE_GOOGLE_PLACES_JS,
        })
    );
  };

  /**
   * Step 2: the address must be picked from the Google Places suggestions
   * (the Continue button stays disabled otherwise). Real keystrokes: fill()
   * does not reliably trigger the predictions fetch.
   */
  const pickAddress = async (search: string, suggestionText: string) => {
    await addressInput().click();
    await addressInput().pressSequentially(search, { delay: 100 });
    const suggestion = page.getByText(suggestionText, { exact: true });
    await suggestion.waitFor({ state: "visible", timeout: 15_000 });
    await suggestion.click();
    const next = continueIn("Your Address");
    await expect(next).toBeEnabled({ timeout: 10_000 });
    await next.click();
  };

  /** Step 3: social links are optional — Continue past them. */
  const skipSocialLinks = async () => {
    await continueIn("Social Media Links").click();
  };

  /** Opens the agreement, scrolls it to the end, and accepts it. */
  /** Opens the agreement, checks each of `mustSay` is in it, scrolls to the
   * end and accepts. */
  const acceptAgreementInModal = async (mustSay: RegExp[] = []) => {
    await viewAgreementButton().click();
    await expect(agreementDialog()).toBeVisible({ timeout: 10_000 });
    for (const text of mustSay) {
      await expect(agreementDialog().getByText(text)).toHaveCount(1);
    }
    await expect(agreeButton()).toBeDisabled();
    await expect(
      agreementDialog().getByText(
        "Please read the entire agreement and scroll to the bottom to accept"
      )
    ).toBeVisible();
    // The content box only enables "I Agree" from its onScroll handler.
    const content = agreementDialog().locator(".MuiDialogContent-root");
    await content.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      el.dispatchEvent(new Event("scroll"));
    });
    await expect(
      agreementDialog().getByText("You've reached the end of the agreement")
    ).toBeVisible({ timeout: 5_000 });
    await expect(agreeButton()).toBeEnabled();
    await agreeButton().click();
    await expect(agreementDialog()).toBeHidden({ timeout: 10_000 });
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────
  const gotoDashboard = async () => {
    await page.goto("/affiliate/dashboard", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("heading", { name: /^Welcome back/ })
      .waitFor({ state: "visible", timeout: 20_000 });
  };

  const header = () =>
    page
      .locator(".MuiPaper-root")
      .filter({ has: page.getByRole("heading", { name: /^Welcome back/ }) })
      .first();
  const statusChip = (status: string) =>
    header().locator(".MuiChip-root").filter({ hasText: status });

  type TabName = "Overview" | "Your restaurants" | "Payments";
  const tab = (name: TabName) => page.getByRole("tab", { name });
  const openTab = async (name: TabName) => {
    await tab(name).click();
    await expect(tab(name)).toHaveAttribute("aria-selected", "true");
  };

  /** Overview: the read-only referral link field (ACTIVE only). */
  const referralLinkCard = () =>
    page
      .locator(".MuiCard-root")
      .filter({ hasText: "Your Referral Link" })
      .first();
  const referralLinkField = () => referralLinkCard().getByRole("textbox");

  /** Overview: "Your payouts are on hold since …" (SUSPENDED only). */
  const holdNotice = () =>
    page
      .getByRole("alert")
      .filter({ hasText: "Your payouts are on hold since" });

  /**
   * A money card on Overview or Payments, by its title (Earned, Paid,
   * Pending, Owed back, Next payout; HQ also Forfeited). Money cards are the
   * only MUI Cards that hold the title as an exact text.
   */
  const moneyCard = (
    title:
      | "Earned"
      | "Paid"
      | "Pending"
      | "Owed back"
      | "Next payout"
      | "Forfeited"
  ) =>
    page
      .locator(".MuiCard-root")
      .filter({ has: page.getByText(title, { exact: true }) })
      .first();
  /** The big figure on a money card (its h4). */
  const moneyAmount = async (
    title: Parameters<typeof moneyCard>[0]
  ): Promise<string> =>
    (
      await moneyCard(title).getByRole("heading", { level: 4 }).innerText()
    ).trim();

  /** Payments: the Stripe Connect card. */
  const stripeSetupCard = () =>
    page
      .locator(".MuiCard-root")
      .filter({ hasText: "Payment Account Setup" })
      .first();

  return {
    stubGooglePlaces,
    gotoSignup,
    startApplicationButton,
    applicationForm,
    referralTagInput,
    agreeCheckbox,
    submitButton,
    agreementDialog,
    fillBasics,
    pickAddress,
    skipSocialLinks,
    acceptAgreementInModal,
    gotoDashboard,
    header,
    statusChip,
    tab,
    openTab,
    referralLinkCard,
    referralLinkField,
    holdNotice,
    moneyCard,
    moneyAmount,
    stripeSetupCard,
  };
};

export type AffiliatePortalPage = ReturnType<typeof createAffiliatePortalPage>;
