import * as allure from "allure-js-commons";
import { test } from "../../../fixtures/base";

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "";
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? "";

test.describe("Owner — Publish Restaurant", () => {
  test.skip(
    !OWNER_EMAIL || !OWNER_PASSWORD,
    "OWNER_EMAIL / OWNER_PASSWORD not set in .env"
  );

  test.beforeEach(async () => {
    await allure.label("feature", "Owner Publish");
    await allure.label("severity", "critical");
  });

  test("TC-27: owner can reach the publish page and see the Publish Restaurant button", async () => {
    test.skip(
      true,
      "The publish page (/restaurant/restaurantId/:id/publish) returns Access Denied " +
        "for the OWNER role — publishing menus is an EMPLOYEE-only action in the current platform."
    );
  });

  test("TC-28: owner can see publish checklist items on the publish page", async () => {
    test.skip(
      true,
      "The publish page (/restaurant/restaurantId/:id/publish) returns Access Denied " +
        "for the OWNER role — publishing menus is an EMPLOYEE-only action in the current platform."
    );
  });
});
