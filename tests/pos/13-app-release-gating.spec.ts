/**
 * 13-app-release-gating.spec.ts — public app check-in + feature-gate lookup
 * (API level). Mobile release gating (docs/features/MOBILE_RELEASE_GATING.md
 * in the restaunax repo).
 *
 * Both routes are PUBLIC (no token): the mobile apps call them on launch.
 *   POST /api/app/check-in   → 204; 400 on an invalid body (installationId
 *                              must be a UUID; appType/platform/appVersion
 *                              required)
 *   GET  /api/app/features   → 200 {success, data:{features: string[]}};
 *                              400 on a bad query (platform must be ios or
 *                              android)
 *   GET  /api/app/ota/urgency → 200 {success, data:{urgency: NORMAL|IMPORTANT|
 *                              CRITICAL, reason, ...}}; 400 on a bad query
 *                              (platform=web)
 * The urgency route passes once the RestauNax backend PR is on QA; locally
 * use BACKEND_URL.
 *
 * Nothing is created that needs cleanup beyond a check-in row keyed by a
 * fresh random installation id. TC-972 sends deviceModel "automation", so
 * that row is recognizable in Admin → App versions → Owner → Installations. These routes ship in the backend PR; against
 * QA they pass once that PR is deployed. To run before then, point at a local
 * backend: BACKEND_URL=http://localhost:9000 npx playwright test --project=pos
 * tests/pos/13-app-release-gating.spec.ts
 */
import { randomUUID } from "crypto";
import * as allure from "allure-js-commons";
import { test, expect } from "../../fixtures/base";
import { BACKEND_URL } from "../../utils/apiHelper";

test.describe("App release gating — public routes", () => {
  test.beforeEach(async () => {
    await allure.label("feature", "Mobile release gating");
    await allure.label("severity", "critical");
  });

  test("TC-972: check-in with a fresh installation id answers 204", async ({
    request,
  }) => {
    const resp = await request.post(`${BACKEND_URL}/api/app/check-in`, {
      data: {
        installationId: randomUUID(),
        appType: "owner",
        platform: "ios",
        appVersion: "1.0.0",
        deviceModel: "automation",
      },
    });
    expect(resp.status()).toBe(204);
  });

  test("TC-973: check-in with an installation id that is not a UUID answers 400", async ({
    request,
  }) => {
    const resp = await request.post(`${BACKEND_URL}/api/app/check-in`, {
      data: {
        installationId: "not-a-uuid",
        appType: "owner",
        platform: "ios",
        appVersion: "1.0.0",
      },
    });
    expect(resp.status()).toBe(400);
  });

  test("TC-974: the feature lookup returns a features array", async ({
    request,
  }) => {
    const resp = await request.get(
      `${BACKEND_URL}/api/app/features?appType=owner&platform=ios&version=1.0.0`
    );
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      success: boolean;
      data: { features: unknown };
    };
    await allure.parameter("payload", JSON.stringify(body));
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.features)).toBe(true);
  });

  test("TC-975: the feature lookup refuses platform=web with 400", async ({
    request,
  }) => {
    const resp = await request.get(
      `${BACKEND_URL}/api/app/features?appType=owner&platform=web&version=1.0.0`
    );
    expect(resp.status()).toBe(400);
  });

  test("TC-976: the OTA urgency lookup returns a valid urgency", async ({
    request,
  }) => {
    const resp = await request.get(
      `${BACKEND_URL}/api/app/ota/urgency?appType=owner&platform=ios&channel=production&runtimeVersion=native-1`
    );
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      success: boolean;
      data: { urgency: string };
    };
    await allure.parameter("payload", JSON.stringify(body));
    expect(body.success).toBe(true);
    expect(["NORMAL", "IMPORTANT", "CRITICAL"]).toContain(body.data.urgency);
  });

  test("TC-977: the OTA urgency lookup refuses platform=web with 400", async ({
    request,
  }) => {
    const resp = await request.get(
      `${BACKEND_URL}/api/app/ota/urgency?appType=owner&platform=web&channel=production&runtimeVersion=native-1`
    );
    expect(resp.status()).toBe(400);
  });
});
