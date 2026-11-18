/**
 * 24-app-version-force-update.spec.ts — the server decides the `forceUpdate`
 * flag of the public app-version lookup (API level, no token). restaunax
 * `docs/features/MOBILE_RELEASE_GATING.md` → "Requiring an update".
 *
 *   GET /api/app/version?platform=&appType=[&restaurantId=]
 *     → 200 { success, data: { minVersion, latestVersion, forceUpdate, ... } }
 *
 * The phone apps (customer, owner, staff) show a blocking "Update Required"
 * to EVERY user while forceUpdate is true, so they must always get false;
 * the minimum version alone makes older builds update. The POS enforces its
 * minimum only while the flag is true, so an enabled POS row must get true.
 * HQ no longer has the switch, so nothing here writes: these are read-only
 * checks of whatever QA's rows hold. They pass once the RestauNax backend PR
 * is deployed; before then, BACKEND_URL=http://localhost:9000.
 */
import { randomUUID } from "crypto";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { BACKEND_URL } from "../../utils/apiHelper";

interface VersionPayload {
  minVersion: string;
  latestVersion: string;
  forceUpdate: boolean;
}

const PLATFORMS = ["ios", "android"] as const;

test.describe("App version lookup — forceUpdate is decided by the server", () => {
  test.beforeEach(async () => {
    await allure.label("feature", "Mobile release gating");
    await allure.label("severity", "critical");
  });

  const lookup = async (
    request: import("@playwright/test").APIRequestContext,
    query: string
  ): Promise<VersionPayload> => {
    const resp = await request.get(`${BACKEND_URL}/api/app/version?${query}`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      success: boolean;
      data: VersionPayload;
    };
    await allure.parameter(query, JSON.stringify(body.data));
    expect(body.success).toBe(true);
    return body.data;
  };

  test("TC-1951: the owner and staff apps never get forceUpdate true", async ({
    request,
  }) => {
    for (const appType of ["owner", "staff"]) {
      for (const platform of PLATFORMS) {
        const data = await lookup(
          request,
          `appType=${appType}&platform=${platform}`
        );
        expect(data.forceUpdate, `${appType} ${platform}`).toBe(false);
      }
    }
  });

  test("TC-1952: a customer app never gets forceUpdate true, enrolled or not", async ({
    request,
  }) => {
    // An unknown restaurant falls through to the global customer row (or the
    // safe default), the path every not-yet-enrolled restaurant takes.
    for (const platform of PLATFORMS) {
      const data = await lookup(
        request,
        `platform=${platform}&restaurantId=${randomUUID()}`
      );
      expect(data.forceUpdate, `customer ${platform}`).toBe(false);
    }
  });

  test("TC-1953: an enabled POS row gets forceUpdate true, so its minimum is enforced", async ({
    request,
  }) => {
    for (const platform of PLATFORMS) {
      const data = await lookup(request, `appType=pos&platform=${platform}`);
      // A missing or paused row answers the safe default (latest 0.0.0),
      // which enforces nothing; an enabled row must carry the flag.
      const enabledRow = data.latestVersion !== "0.0.0";
      expect(data.forceUpdate, `pos ${platform}`).toBe(enabledRow);
    }
  });
});
