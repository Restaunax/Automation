/**
 * rewardsApi.ts — seed a reward-program member with a points balance.
 *
 * There is no "grant points" endpoint, so a member is minted the legitimate
 * way: the admin bulk customer import (POST
 * /api/admin/restaurants/:id/bulk-upload-customers, uploadType reward_members),
 * whose "Points Remaining" column lands as the member's balance. Points import
 * ONCE per member (a repeat import is skipped), so callers pass a fresh
 * generateSeedPhone() each run. ADMIN/EMPLOYEE token required.
 */
import { BACKEND_URL } from "./apiHelper";

export interface SeededRewardMember {
  phone: string;
  name: string;
  points: number;
  /** The raw import response, for failure messages. */
  raw: string;
}

export async function seedRewardMember(
  adminToken: string,
  restaurantId: string,
  phone: string,
  points: number,
  /**
   * The member's saved email. A paid order's confirmation email goes to the
   * address typed at checkout first and falls back to this one only when none
   * was typed (RestauNax #1011; TC-901 pins it). Blank = no saved email.
   */
  email = "",
  /**
   * Keep the AUTOMATION_COUPON_PREFIX ("AUTO") marker so leftovers are
   * recognisable as test data. Imported customers have no delete endpoint
   * (only the customer's own async data-deletion request), so the row stays
   * on QA like every seeded-order customer.
   */
  name = "AUTO Member"
): Promise<SeededRewardMember> {
  const csv =
    "Name,Email,Phone,Created,Last Ordered On,Following Email,Following SMS,Points Remaining\r\n" +
    `${name},${email},${phone},,,,,${points}\r\n`;
  const form = new FormData();
  form.append("file", new Blob([csv], { type: "text/csv" }), `members.csv`);
  form.append("uploadType", "reward_members");
  const res = await fetch(
    `${BACKEND_URL}/api/admin/restaurants/${restaurantId}/bulk-upload-customers`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: form,
    }
  );
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`[seedRewardMember] import → ${res.status}: ${raw}`);
  }
  // The import answers 200 even when the row lands in `errors` or `skipped`
  // (a phone that already imported points, a format rejection): require the
  // one row to be created or updated, or the member has no points and the
  // test fails far away at "Use N points".
  let stats:
    | { created?: number; updated?: number; skipped?: number; errors?: number }
    | undefined;
  try {
    stats = (JSON.parse(raw) as { stats?: typeof stats }).stats;
  } catch {
    stats = undefined;
  }
  const landed = (stats?.created ?? 0) + (stats?.updated ?? 0);
  if (!stats || landed !== 1 || stats.errors !== 0 || stats.skipped !== 0) {
    throw new Error(
      `[seedRewardMember] expected exactly one created/updated row and no errors/skips for ${phone}: ${raw}`
    );
  }
  return { phone, name, points, raw };
}
