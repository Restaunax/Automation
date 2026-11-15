/**
 * managerApi.ts — mint a restaurant manager (W0:MF-2) for specs that need a
 * real manager account: RestauNax Team on the restaurant, a team member
 * invited by email (Mailpit), their own RestauNax account registered from the
 * invite, and (optionally) the owner making them a manager.
 *
 * Shared by tests/dashboard/access/manager-role.spec.ts (which promotes in
 * its own TC-1550, so it passes `promote: false`) and the gift cards UI spec.
 * Needs MAILPIT_BASE_URL: the invite travels by email.
 */
import { extractInviteToken, waitForEmail } from "./emailHelper";
import {
  apiRequestRaw,
  inviteStaffRaw,
  registerWithInvite,
  setFeatureOverrideAdminRaw,
} from "./apiHelper";
import { recordUserForCleanup } from "./testData";

export interface CreateRestaurantManagerOptions {
  adminToken: string;
  ownerToken: string;
  restaurantId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** POST /restaurant/:rid/staff/managers after registering (default true). */
  promote?: boolean;
  /** Prefix for thrown errors, e.g. "[manager-role]". */
  tag?: string;
}

/**
 * Grants TEAM_BUNDLE (SCHEDULING, TIP_MANAGEMENT, TIMECARDS — components the
 * server refuses to grant on their own, packaging v3), invites the person,
 * registers their account from the "added to the team" email and, unless
 * `promote` is false, makes them a manager. The email is recorded for
 * cleanup. Throws (with `tag`) on any refused step.
 */
export async function createRestaurantManager(
  opts: CreateRestaurantManagerOptions
): Promise<{ staffMemberId: string }> {
  const tag = opts.tag ?? "[manager]";
  for (const feature of ["TEAM_BUNDLE"]) {
    const g = await setFeatureOverrideAdminRaw(
      opts.adminToken,
      opts.restaurantId,
      feature,
      true
    );
    if (!g.ok)
      throw new Error(`${tag} grant ${feature}: ${JSON.stringify(g.data)}`);
  }

  // A team member with their own account…
  recordUserForCleanup(opts.email);
  const invited = await inviteStaffRaw(opts.ownerToken, opts.restaurantId, {
    email: opts.email,
    firstName: opts.firstName,
    lastName: opts.lastName,
  });
  if (invited.status !== 201)
    throw new Error(`${tag} invite: ${JSON.stringify(invited.data)}`);
  const staffMemberId = String(invited.data.data?.staffMemberId ?? "");
  const mail = await waitForEmail(opts.email, {
    subjectPattern: /added to the team at/i,
    timeoutMs: 90_000,
  });
  await registerWithInvite({
    firstName: opts.firstName,
    lastName: opts.lastName,
    email: opts.email,
    password: opts.password,
    userInvitationToken: extractInviteToken(mail.text_body || mail.html_body),
  });

  if (opts.promote !== false) {
    const made = await apiRequestRaw(
      "POST",
      `/restaurant/${opts.restaurantId}/staff/managers`,
      { staffMemberId },
      opts.ownerToken
    );
    if (made.status !== 200)
      throw new Error(`${tag} make manager: ${JSON.stringify(made.data)}`);
  }
  return { staffMemberId };
}
