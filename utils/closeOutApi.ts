/**
 * closeOutApi.ts — restaurant close-out helpers (RestauNax PR #1038,
 * docs/features/FINAL_INVOICE_AND_EQUIPMENT_RECOVERY_DESIGN.md).
 *
 * Staff deactivation (HQ → Restaurants → Deactivate) runs the close-out:
 * offline, closing payout, final balance, and a pay-or-return choice per
 * RestauNax device. Admin routes live under /api/admin/close-out/* (+ the
 * waiver at /api/admin/charges/:id/waive, ADMIN only, reason required).
 *
 * Equipment fixture: ONE persistent catalogue item + inventory unit
 * ("AUTO Close-out Tablet", serial AUTO-CLOSEOUT-1), reused every run — the
 * spec assigns it FREE (no Stripe charge) to a throwaway restaurant, and
 * cleanup marks it returned and back IN_STOCK, so runs never pile hardware
 * rows up on QA.
 */
import { apiRequestRaw, type RawResponse } from "./apiHelper";

export const CLOSEOUT_CATALOG_NAME = "AUTO Close-out Tablet";
export const CLOSEOUT_SERIAL = "AUTO-CLOSEOUT-1";
const CLOSEOUT_VENDOR = "Automation";
const CLOSEOUT_SKU = "AUTO-CLOSEOUT";

interface Envelope<T> {
  success?: boolean;
  data?: T;
  error?: string;
  message?: string;
}

const must = <T>(res: RawResponse<Envelope<T>>, what: string): T => {
  if (!res.ok || res.data?.data === undefined)
    throw new Error(`${what} → ${res.status}: ${JSON.stringify(res.data)}`);
  return res.data.data as T;
};

/** Find-or-create the fixture catalogue item + unit; returns the unit id. */
export async function ensureCloseOutDevice(adminToken: string): Promise<{
  catalogItemId: string;
  inventoryItemId: string;
}> {
  const catalog = must(
    await apiRequestRaw<
      Envelope<{ items: Array<{ id: string; name: string }> }>
    >(
      "GET",
      `/api/admin/equipment/catalog?search=${encodeURIComponent(CLOSEOUT_CATALOG_NAME)}`,
      undefined,
      adminToken
    ),
    "GET catalog"
  );
  let catalogItemId = catalog.items.find(
    (i) => i.name === CLOSEOUT_CATALOG_NAME
  )?.id;
  if (!catalogItemId) {
    catalogItemId = must(
      await apiRequestRaw<Envelope<{ id: string }>>(
        "POST",
        "/api/admin/equipment/catalog",
        {
          name: CLOSEOUT_CATALOG_NAME,
          slug: "auto-close-out-tablet",
          category: "ACCESSORY",
          vendor: CLOSEOUT_VENDOR,
          vendorSku: CLOSEOUT_SKU,
          model: "AUTO-1",
          retailPrice: 199,
          rentalPrice: 0,
          hasSerialNumber: true,
          description:
            "Automation fixture for the close-out E2E — never ship it",
        },
        adminToken
      ),
      "POST catalog"
    ).id;
  }

  const inventory = must(
    await apiRequestRaw<
      Envelope<{
        items: Array<{
          id: string;
          serialNumber: string | null;
          status: string;
        }>;
      }>
    >(
      "GET",
      `/api/admin/equipment/inventory?catalogItemId=${catalogItemId}&search=${CLOSEOUT_SERIAL}`,
      undefined,
      adminToken
    ),
    "GET inventory"
  );
  const unit = inventory.items.find((i) => i.serialNumber === CLOSEOUT_SERIAL);
  if (unit) {
    if (unit.status !== "IN_STOCK" && unit.status !== "ASSIGNED") {
      await apiRequestRaw(
        "PUT",
        `/api/admin/equipment/inventory/${unit.id}`,
        { status: "IN_STOCK" },
        adminToken
      );
    }
    return { catalogItemId, inventoryItemId: unit.id };
  }
  const created = must(
    await apiRequestRaw<Envelope<{ id: string }>>(
      "POST",
      "/api/admin/equipment/inventory",
      {
        catalogItemId,
        serialNumber: CLOSEOUT_SERIAL,
        unitCost: 0,
        condition: "USED",
        notes: "Automation fixture for the close-out E2E",
      },
      adminToken
    ),
    "POST inventory"
  );
  return { catalogItemId, inventoryItemId: created.id };
}

/** A FREE assignment (no charge, no Stripe). Returns the assignment id. */
export async function assignFreeDevice(
  adminToken: string,
  inventoryItemId: string,
  restaurantId: string
): Promise<string> {
  return must(
    await apiRequestRaw<Envelope<{ id: string }>>(
      "POST",
      "/api/admin/equipment/assignments",
      {
        inventoryItemId,
        restaurantId,
        paymentModel: "FREE",
        totalAmount: 0,
        notes: "Automation close-out E2E",
      },
      adminToken
    ),
    "POST assignment"
  ).id;
}

/** Mark returned, then put the unit back IN_STOCK for the next run. */
export async function releaseCloseOutDevice(
  adminToken: string,
  assignmentId: string,
  inventoryItemId: string
): Promise<void> {
  await apiRequestRaw(
    "PUT",
    `/api/admin/equipment/assignments/${assignmentId}/return`,
    { reason: "Automation cleanup", condition: "USED" },
    adminToken
  );
  await apiRequestRaw(
    "PUT",
    `/api/admin/equipment/inventory/${inventoryItemId}`,
    { status: "IN_STOCK" },
    adminToken
  );
}

export interface CloseOutDevice {
  assignmentId: string;
  label: string;
  paymentModel: string;
  keepPrice: number;
  choice: "PAY" | "RETURN";
}

export async function getCloseOutDevices(
  adminToken: string,
  restaurantId: string
): Promise<{ closedOutAt: string | null; devices: CloseOutDevice[] }> {
  return must(
    await apiRequestRaw<
      Envelope<{ closedOutAt: string | null; devices: CloseOutDevice[] }>
    >(
      "GET",
      `/api/admin/close-out/restaurants/${restaurantId}/devices`,
      undefined,
      adminToken
    ),
    "GET close-out devices"
  );
}

export interface ReturnsDueGroup {
  restaurantId?: string;
  restaurantName: string;
  devices: Array<{ assignmentId?: string; label: string; returnDueAt: string }>;
}

export async function getReturnsDue(
  adminToken: string
): Promise<ReturnsDueGroup[]> {
  const res = await apiRequestRaw<{ items?: ReturnsDueGroup[] }>(
    "GET",
    "/api/admin/close-out/returns-due",
    undefined,
    adminToken
  );
  if (!res.ok) throw new Error(`GET returns-due → ${res.status}`);
  return res.data.items ?? [];
}

export async function getClosingBalances(
  adminToken: string
): Promise<
  Array<{ restaurantId?: string; restaurantName?: string; id?: string }>
> {
  const res = await apiRequestRaw<{
    items?: Array<{
      restaurantId?: string;
      restaurantName?: string;
      id?: string;
    }>;
  }>("GET", "/api/admin/close-out/closing-balances", undefined, adminToken);
  if (!res.ok) throw new Error(`GET closing-balances → ${res.status}`);
  return res.data.items ?? [];
}

/** POST /api/admin/charges/:chargeId/waive {reason?} — raw, for negatives. */
export function waiveChargeRaw(
  token: string,
  chargeId: string,
  reason?: string
): Promise<RawResponse<{ success?: boolean; error?: string }>> {
  return apiRequestRaw(
    "POST",
    `/api/admin/charges/${chargeId}/waive`,
    reason === undefined ? {} : { reason },
    token
  );
}

/**
 * The owner cancel / auto-renew endpoints PR #1038 removed. NEVER call these
 * unless probeCloseOut() is true: on a build that still has them they really
 * cancel the plan.
 */
export function ownerCancelSubscriptionRaw(
  ownerToken: string,
  restaurantId: string
): Promise<RawResponse> {
  return apiRequestRaw(
    "POST",
    `/api/subscriptions/restaurants/${restaurantId}/cancel`,
    { cancelAtPeriodEnd: true },
    ownerToken
  );
}

export function ownerToggleAutoRenewalRaw(
  ownerToken: string,
  restaurantId: string
): Promise<RawResponse> {
  return apiRequestRaw(
    "POST",
    `/api/subscriptions/restaurants/${restaurantId}/toggle-auto-renewal`,
    { isAutoRenew: false },
    ownerToken
  );
}
