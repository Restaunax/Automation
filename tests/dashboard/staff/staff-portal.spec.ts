import * as allure from "allure-js-commons";
import { test, expect } from "../../../fixtures/base";

/**
 * Staff — /staff, the team member's web home.
 *
 * Route allows [RESTAURANT_STAFF, OWNER, ADMIN]. It used to be a thin PIN card
 * (TC-180 was a fixme scaffold waiting for a RESTAURANT_STAFF login, issue
 * #13). The page is now a welcome screen: it greets the signed-in person,
 * names the restaurant(s) they are on the team at, and points them to the
 * register for their PIN. PINs are no longer set here: the owner manages them
 * from Staff → People (and the POS authority is tested at the API level, see
 * tests/pos/README.md). The seed owner is on the seed restaurant's team, so
 * its session is enough.
 */
test.describe("Staff — Portal", () => {
  test.skip(
    !process.env.OWNER_EMAIL || !process.env.OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test("TC-180: /staff greets a team member and points them to the register PIN", async ({
    ownerPage,
  }) => {
    await allure.label("feature", "Staff (web)");
    await allure.description(
      "A signed-in team member opening /staff sees 'Welcome, <name>!', the restaurant they are on " +
        "the team at, and the instruction to sign in on the register with their PIN."
    );
    await ownerPage.goto("/staff", { waitUntil: "domcontentloaded" });
    await expect(
      ownerPage.getByRole("heading", { level: 1, name: /^Welcome, .+!$/ })
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      ownerPage.getByText(/^You're on the team at .+/)
    ).toBeVisible();
    await expect(
      ownerPage.getByText(
        "At the restaurant, sign in on the register with your PIN."
      )
    ).toBeVisible();
  });
});
