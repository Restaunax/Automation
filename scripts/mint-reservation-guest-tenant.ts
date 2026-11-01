/**
 * Mint the restaurant the reservation guest specs run against: add-on, a real
 * Stripe test account, tables, online booking, online waitlist, deposits and a
 * $20-a-guest rule. Writes the tenant to .reservation-guest-tenant.tmp.json; pin
 * template-wind / template-lima dev servers to its restaurantId (RUNNING_TESTS.md).
 *
 *   BACKEND_DIR=… scripts/with-stripe-test-env.sh npx tsx scripts/mint-reservation-guest-tenant.ts
 */
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const main = async () => {
  const { createTableOwnerRaw, putReservationSettingsOwnerRaw } =
    await import("../utils/apiHelper");
  const { generateRunId } = await import("../utils/testData");
  const { createDepositRuleRaw, mintPhase4Tenant } =
    await import("../utils/reservationPhase4Api");
  const runId = generateRunId();
  const t = await mintPhase4Tenant(runId, {
    label: "guest",
    stripe: true,
    maxPartiesPerSlot: 50,
  });
  for (let i = 0; i < 10; i++)
    await createTableOwnerRaw(t.token, t.restaurantId, {
      name: `Guest ${runId}-${i}`,
      capacity: 4,
    });
  const on = await putReservationSettingsOwnerRaw(t.token, t.restaurantId, {
    onlineWaitlistEnabled: true,
    depositsEnabled: true,
  });
  if (!on.ok) throw new Error(JSON.stringify(on.data));
  const rule = await createDepositRuleRaw(t.token, t.restaurantId, {
    amountCents: 2000,
  });
  if (rule.status !== 201) throw new Error(JSON.stringify(rule.data));
  fs.writeFileSync(
    path.resolve(__dirname, "..", ".reservation-guest-tenant.tmp.json"),
    JSON.stringify({ ...t, runId }, null, 2)
  );
  console.log(t.restaurantId);
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
