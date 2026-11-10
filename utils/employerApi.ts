/**
 * employerApi.ts — helpers for the employer group (EIN) and sick/PTO accrual
 * specs (RestauNax back-office audit 2026-10, Stage 5: W3:C4 + W3:H5;
 * docs/features/back-office/EMPLOYER_GROUP.md).
 *
 * Endpoints:
 *   /api/employers[/:id[/restaurants|/people|/payroll-connection]] — core, no
 *     add-on; owners of every member restaurant change it, HQ ADMIN too,
 *     HQ EMPLOYEE reads only.
 *   /api/staff/payroll/:rid/employer · /settings · /accrual[/policies|/balances]
 *     — TIMECARDS-gated, owner JWT.
 *   /api/staff-app/restaurants/:rid/time-off-balances — the signed-in person.
 *
 * Errors carry `details.code` (EmployerError / TimecardError / AccrualError)
 * and a server-translated `message`.
 */
import {
  apiLogin,
  apiRequestRaw,
  assignRestaurantToUserApi,
  createRestaurantRaw,
  createSecondOwner,
  getOwnerRestaurants,
  payrollRaw,
  setFeatureOverrideAdminRaw,
  type LooseJson,
  type RawResponse,
} from "./apiHelper";

type Rec = Record<string, LooseJson>;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Any `/api/employers{path}` call; no token = unauthenticated. */
export const employerRaw = (
  token: string | undefined,
  method: Method,
  path = "",
  body?: unknown
): Promise<
  RawResponse<{ success?: boolean; data?: LooseJson; message?: string }>
> => apiRequestRaw(method, `/api/employers${path}`, body, token);

/** The machine-readable reason of a refused call (`details.code`). */
export const codeOf = (data: unknown): string | undefined =>
  ((data as Rec | undefined)?.details as Rec | undefined)?.code as
    | string
    | undefined;

/** `/api/staff/payroll/:rid/accrual{path}`. */
export const accrualRaw = (
  token: string,
  rid: string,
  method: Method,
  path = "",
  body?: unknown
) => payrollRaw(token, rid, method, `/accrual${path}`, body);

export const timeOffBalancesRaw = (token: string, rid: string) =>
  apiRequestRaw<{ success?: boolean; data?: LooseJson; message?: string }>(
    "GET",
    `/api/staff-app/restaurants/${rid}/time-off-balances`,
    undefined,
    token
  );

/**
 * A fresh OWNER (real login) controlling `count` throwaway restaurants, each
 * with PAYROLL granted (which brings TIMECARDS). Restaurant 1 comes from
 * createSecondOwner; the others are created by HQ and assigned to the owner.
 * The returned token is minted after every assignment. The caller deletes
 * every restaurant in `restaurantIds` (deleteTestRestaurant).
 */
export async function ownerWithRestaurants(
  adminToken: string,
  runId: string,
  {
    count = 2,
    restaurant = {},
    features = ["PAYROLL"],
  }: {
    count?: number;
    /** POST /restaurant/new overrides (address etc.) for every restaurant. */
    restaurant?: Record<string, unknown>;
    features?: string[];
  } = {}
): Promise<{
  ownerToken: string;
  userId: string;
  restaurantIds: string[];
}> {
  const tenant = await createSecondOwner(adminToken, runId, {
    alwaysFresh: true,
    restaurant,
  });
  if (!tenant.restaurantId || !tenant.password)
    throw new Error(`[employerApi] no fresh tenant: ${JSON.stringify(tenant)}`);
  const restaurantIds = [tenant.restaurantId];
  for (let i = 2; i <= count; i++) {
    const res = await createRestaurantRaw(adminToken, {
      name: `Automation Employer Store ${i} ${runId}`,
      street: `${300 + i} Other Street`,
      city: "Miami",
      state: "FL",
      zipCode: "33101",
      cuisineType: "Mexican",
      restaurantPhone: "3055550177",
      description: "Throwaway employer-group location (Stage 5 specs)",
      minimumOrderPreparationTime: 0,
      ...restaurant,
    });
    const id = (res.data as { restaurant?: { id?: string } })?.restaurant?.id;
    if (!id)
      throw new Error(
        `[employerApi] restaurant ${i}: ${res.status} ${JSON.stringify(res.data)}`
      );
    restaurantIds.push(id);
    await assignRestaurantToUserApi(adminToken, tenant.userId, id);
  }
  const ownerToken = (await apiLogin(tenant.email, tenant.password))
    .accessToken;
  const owned = new Set(
    (await getOwnerRestaurants(ownerToken)).map((r) => r.id)
  );
  const missing = restaurantIds.filter((id) => !owned.has(id));
  if (missing.length)
    throw new Error(
      `[employerApi] the owner does not control ${missing.join(", ")} after assignment`
    );
  for (const id of restaurantIds) {
    for (const feature of features) {
      const g = await setFeatureOverrideAdminRaw(
        adminToken,
        id,
        feature,
        true,
        `automation employer ${runId}`
      );
      if (!g.ok)
        throw new Error(
          `[employerApi] grant ${feature}: ${JSON.stringify(g.data)}`
        );
    }
  }
  return { ownerToken, userId: tenant.userId, restaurantIds };
}

/**
 * A throwaway restaurant the owner does NOT control (HQ creates it and keeps
 * it unassigned). The caller deletes it.
 */
export async function strangerRestaurant(
  adminToken: string,
  runId: string
): Promise<string> {
  const res = await createRestaurantRaw(adminToken, {
    name: `Automation Not Yours ${runId}`,
    street: "400 Stranger Street",
    city: "Miami",
    state: "FL",
    zipCode: "33101",
    cuisineType: "Mexican",
    restaurantPhone: "3055550178",
    description: "Throwaway restaurant nobody in the spec controls",
    minimumOrderPreparationTime: 0,
  });
  const id = (res.data as { restaurant?: { id?: string } })?.restaurant?.id;
  if (!id)
    throw new Error(
      `[employerApi] stranger restaurant: ${res.status} ${JSON.stringify(res.data)}`
    );
  return id;
}

/**
 * The most recent FINISHED pay period (status OPEN: over, not approved) of a
 * restaurant, oldest-first sort as in backOfficeApi.seedPeriodAwaitingApproval.
 */
export async function lastFinishedPeriod(
  ownerToken: string,
  rid: string
): Promise<{ startDate: string; endDate: string }> {
  const periods = await payrollRaw(
    ownerToken,
    rid,
    "GET",
    "/pay-periods?count=4"
  );
  const list = (periods.data.data as Rec | undefined)?.periods;
  const finished = (Array.isArray(list) ? (list as Rec[]) : [])
    .filter((p) => p.status === "OPEN")
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  const last = finished.at(-1);
  if (!last)
    throw new Error(
      `[employerApi] no finished pay period: ${JSON.stringify(periods.data)}`
    );
  return { startDate: String(last.startDate), endDate: String(last.endDate) };
}
