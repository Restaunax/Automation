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
  name = "Breakdown Member"
): Promise<SeededRewardMember> {
  const csv =
    "Name,Email,Phone,Created,Last Ordered On,Following Email,Following SMS,Points Remaining\r\n" +
    `${name},,${phone},,,,,${points}\r\n`;
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
  return { phone, name, points, raw };
}
