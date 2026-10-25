/**
 * addonRequestGate.ts — deploy gate for the add-on request flow
 * (restaunax #998, docs/features/back-office/E0_ENTITLEMENTS_AND_PACKAGING.md
 * §5 "As built — add-on requests").
 *
 * Since #998 owners never add or remove an add-on themselves: they send an
 * AddonRequest and HQ attaches it / schedules its removal. The old owner
 * `POST /restaurant/:id/addons` and `DELETE /restaurant/:id/addons/:instanceId`
 * answer 404 and the page rows carry `canRequestAdd` / `canRequestRemove` /
 * `pendingAdd` / `pendingRemove` instead of `canAdd` / `canKeep` /
 * `canRemove`.
 *
 * The specs land before #998 reaches QA. Feature-detect: HQ's
 * `GET /api/admin/addons/requests` is 200 once #998 is deployed and an Express
 * 404 before. While ADDON_REQUESTS_ON_QA is false, request-flow tests SKIP
 * when the route is missing (deploy lag is not a product failure). Once #998
 * is confirmed on QA, flip it to true: a missing route then FAILS, so a
 * regression can't hide as a skip — and delete the pre-#998 branches
 * (search for `addonRequestsLive`).
 */
import { test, expect } from "../fixtures/base";
import { adminAddonsRaw } from "./apiHelper";

export const ADDON_REQUESTS_ON_QA = false;

const REASON =
  "Add-on requests (restaunax #998) are not on QA yet — GET /api/admin/addons/requests is 404";

let cached: boolean | undefined;

/** True when QA's backend has the add-on request routes (cached per worker). */
export async function addonRequestsLive(adminToken: string): Promise<boolean> {
  if (cached !== undefined) return cached;
  const r = await adminAddonsRaw(adminToken, "GET", "/requests?status=OPEN");
  if (r.status !== 200 && r.status !== 404)
    throw new Error(
      `[addonRequestGate] unexpected ${r.status} from GET /api/admin/addons/requests`
    );
  cached = r.status === 200;
  return cached;
}

/** Skip (flag off) or fail (flag on) when the request flow is missing. */
export function requireAddonRequests(live: boolean): void {
  if (ADDON_REQUESTS_ON_QA) {
    expect(live, REASON).toBe(true);
    return;
  }
  test.skip(!live, REASON);
}
